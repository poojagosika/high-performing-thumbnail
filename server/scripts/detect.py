import json
import sys

import cv2
import numpy as np

import fontread

FACE_MODEL = "assets/models/yunet_face.onnx"
TEXT_MODEL = "assets/models/ppocr_text.onnx"

FACE_SCORE = 0.8
FACE_NMS = 0.3
TEXT_INPUT = (736, 736)
TEXT_MEAN = (122.67891434, 116.66876762, 104.00698793)
BIG_REGION_RATIO = 0.35
MIN_HEADLINE_FRACTION = 0.02
DIVIDER_LENGTH = 0.3
DIVIDER_LEAN = 0.3
DIVIDER_TOP = 0.04
DIVIDER_MARGIN = 0.15
DIVIDER_MERGE = 0.03
DIVIDER_VOTES = 0.15

_face = None
_text = None


def face_model(width, height):
    global _face
    if _face is None:
        _face = cv2.FaceDetectorYN.create(FACE_MODEL, "", (320, 320), FACE_SCORE, FACE_NMS, 5000)
    _face.setInputSize((width, height))
    return _face


def text_model():
    global _text
    if _text is None:
        model = cv2.dnn.TextDetectionModel_DB(TEXT_MODEL)
        model.setBinaryThreshold(0.3).setPolygonThreshold(0.5)
        model.setMaxCandidates(200).setUnclipRatio(2.0)
        model.setInputParams(1 / 255.0, TEXT_INPUT, TEXT_MEAN, True)
        _text = model
    return _text


def band_for(y):
    if y < 0.34:
        return "top"
    return "middle" if y < 0.67 else "bottom"


def side_for(x):
    if x < 0.42:
        return "left"
    return "center" if x <= 0.58 else "right"


def straighten(image, box):
    pts = np.array(box, dtype=np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    tl, br = pts[np.argmin(s)], pts[np.argmax(s)]
    tr, bl = pts[np.argmin(d)], pts[np.argmax(d)]

    width = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
    height = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
    if width < 8 or height < 8 or height > width * 1.5:
        return None

    target = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(np.array([tl, tr, br, bl], dtype=np.float32), target)
    return cv2.warpPerspective(image, matrix, (width, height))


def read_font(image, kept):
    crops, weights = [], []
    for box, area in kept:
        crop = straighten(image, box)
        if crop is not None:
            crops.append(crop)
            weights.append(area)
    return fontread.read(crops, weights) if crops else None


def count_dividers(image):
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 180)
    found = cv2.HoughLinesP(
        edges, 1, np.pi / 360, threshold=int(height * DIVIDER_VOTES),
        minLineLength=int(height * DIVIDER_LENGTH), maxLineGap=int(height * 0.02),
    )
    if found is None:
        return 0

    xs = []
    for x1, y1, x2, y2 in found.reshape(-1, 4):
        dx, dy = abs(int(x2) - int(x1)), abs(int(y2) - int(y1))
        if dy == 0 or dx / dy > DIVIDER_LEAN or min(y1, y2) > height * DIVIDER_TOP:
            continue
        centre = (x1 + x2) / 2 / width
        if DIVIDER_MARGIN < centre < 1 - DIVIDER_MARGIN:
            xs.append(centre)

    groups = []
    for x in sorted(xs):
        if groups and x - groups[-1][-1] <= DIVIDER_MERGE:
            groups[-1].append(x)
        else:
            groups.append([x])
    return len(groups)


def detect_faces(image):
    height, width = image.shape[:2]
    _, found = face_model(width, height).detect(image)
    if found is None:
        return []

    faces = []
    for f in found:
        x, y, w, h = float(f[0]), float(f[1]), float(f[2]), float(f[3])
        faces.append(
            {
                "x": round(x / width, 4),
                "y": round(y / height, 4),
                "w": round(w / width, 4),
                "h": round(h / height, 4),
                "cx": round((x + w / 2) / width, 4),
                "cy": round((y + h / 2) / height, 4),
                "area": round((w * h) / (width * height), 5),
            }
        )
    return sorted(faces, key=lambda f: -f["area"])


def detect_text(image):
    height, width = image.shape[:2]
    boxes, _ = text_model().detect(image)

    if boxes is None or len(boxes) == 0:
        return {"hasText": False, "band": None, "y": None, "side": None, "x": None, "font": None, "coverage": 0.0, "regions": 0}

    areas = [abs(cv2.contourArea(np.array(b, dtype=np.float32))) for b in boxes]
    biggest = max(areas)
    frame = float(width * height)
    coverage = biggest / frame

    if coverage < MIN_HEADLINE_FRACTION:
        return {
            "hasText": False,
            "band": None,
            "y": None,
            "side": None,
            "x": None,
            "font": None,
            "coverage": round(coverage * 100, 2),
            "regions": len(boxes),
            "reason": "only incidental text, too small for a headline",
        }

    kept = [(b, a) for b, a in zip(boxes, areas) if a >= biggest * BIG_REGION_RATIO]
    ys = [sum(float(p[1]) for p in b) / 4 / height for b, _ in kept]
    xs = [sum(float(p[0]) for p in b) / 4 / width for b, _ in kept]
    weights = [a for _, a in kept]
    centre = sum(y * w for y, w in zip(ys, weights)) / sum(weights)
    across = sum(x * w for x, w in zip(xs, weights)) / sum(weights)

    return {
        "hasText": True,
        "band": band_for(centre),
        "y": round(centre, 4),
        "side": side_for(across),
        "x": round(across, 4),
        "font": read_font(image, kept),
        "coverage": round(coverage * 100, 2),
        "regions": len(kept),
    }


def suggest(faces, text):
    sides = {"left": 0.0, "right": 0.0}
    for f in faces:
        sides["left" if f["cx"] < 0.5 else "right"] += f["area"]

    big = [f for f in faces if f["area"] >= 0.01]
    template = "two-subject" if len(big) >= 2 and sides["left"] > 0 and sides["right"] > 0 else "side-panel"

    return {
        "template": template,
        "headlineBand": text.get("band"),
        "subjectSides": {k: round(v, 5) for k, v in sides.items()},
    }


def run(path):
    image = cv2.imread(path)
    if image is None:
        raise ValueError(f"could not read {path}")

    faces = detect_faces(image)
    text = detect_text(image)

    return {
        "width": image.shape[1],
        "height": image.shape[0],
        "faces": faces,
        "faceCount": len(faces),
        "panels": count_dividers(image),
        "text": text,
        "suggested": suggest(faces, text),
    }


if __name__ == "__main__":
    try:
        print(json.dumps(run(sys.argv[1])))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
