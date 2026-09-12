import json
import sys

import cv2
import numpy as np

FACE_MODEL = "assets/models/yunet_face.onnx"
TEXT_MODEL = "assets/models/ppocr_text.onnx"

FACE_SCORE = 0.8
FACE_NMS = 0.3
TEXT_INPUT = (736, 736)
TEXT_MEAN = (122.67891434, 116.66876762, 104.00698793)
BIG_REGION_RATIO = 0.35
MIN_HEADLINE_FRACTION = 0.02

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
        return {"hasText": False, "band": None, "y": None, "coverage": 0.0, "regions": 0}

    areas = [abs(cv2.contourArea(np.array(b, dtype=np.float32))) for b in boxes]
    biggest = max(areas)
    frame = float(width * height)
    coverage = biggest / frame

    if coverage < MIN_HEADLINE_FRACTION:
        return {
            "hasText": False,
            "band": None,
            "y": None,
            "coverage": round(coverage * 100, 2),
            "regions": len(boxes),
            "reason": "only incidental text, too small for a headline",
        }

    kept = [(b, a) for b, a in zip(boxes, areas) if a >= biggest * BIG_REGION_RATIO]
    ys = [sum(float(p[1]) for p in b) / 4 / height for b, _ in kept]
    weights = [a for _, a in kept]
    centre = sum(y * w for y, w in zip(ys, weights)) / sum(weights)

    return {
        "hasText": True,
        "band": band_for(centre),
        "y": round(centre, 4),
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
        "text": text,
        "suggested": suggest(faces, text),
    }


if __name__ == "__main__":
    try:
        print(json.dumps(run(sys.argv[1])))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
