import os

import cv2
import numpy as np

MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "models", "emphasis_reader.npz")

CLASSES = ["none", "colour", "box", "ring", "gradient"]
MAX_REGIONS = 5
MIN_REGION = 0.12
BAND = 0.35
OUTER = 0.9
RING_REACH = 1.0
SECTORS = 16
RING_END = 30
RING_NOT_TEXT = 25.0
RING_VIVID = 35.0
RING_TEXT_SHARE = 0.2

_model = None


def rect_of(box, width, height):
    pts = np.array(box, dtype=np.float32)
    x0, y0 = np.floor(pts.min(axis=0)).astype(int)
    x1, y1 = np.ceil(pts.max(axis=0)).astype(int)
    return max(0, x0), max(0, y0), min(width, x1), min(height, y1)


def lab_of(pixels):
    if len(pixels) == 0:
        return np.zeros(3, dtype=np.float32)
    patch = pixels.reshape(-1, 1, 3).astype(np.uint8)
    lab = cv2.cvtColor(patch, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    lab[:, 0] *= 100.0 / 255.0
    lab[:, 1:] -= 128.0
    return np.median(lab, axis=0)


def delta(a, b):
    return float(np.linalg.norm(np.asarray(a) - np.asarray(b)))


def chroma(lab):
    return float(np.hypot(lab[1], lab[2]))


def hex_of(bgr):
    b, g, r = [int(round(v)) for v in bgr]
    return f"#{r:02X}{g:02X}{b:02X}"


def band(image, x0, y0, x1, y1, grow):
    height, width = image.shape[:2]
    pad = max(2, int((y1 - y0) * grow))
    ox0, oy0 = max(0, x0 - pad), max(0, y0 - pad)
    ox1, oy1 = min(width, x1 + pad), min(height, y1 + pad)
    outer = image[oy0:oy1, ox0:ox1]
    keep = np.ones(outer.shape[:2], dtype=bool)
    keep[y0 - oy0: y1 - oy0, x0 - ox0: x1 - ox0] = False
    return outer[keep]


def ring_score(image, x0, y0, x1, y1, fill, fill_bgr):
    height, width = image.shape[:2]
    h = y1 - y0
    reach = int(h * RING_REACH)
    ox0, oy0 = max(0, x0 - reach), max(0, y0 - reach)
    ox1, oy1 = min(width, x1 + reach), min(height, y1 + reach)
    area = image[oy0:oy1, ox0:ox1]
    empty = (0.0, 0.0, np.zeros(3))
    if area.size == 0:
        return empty

    edges = cv2.Canny(cv2.cvtColor(area, cv2.COLOR_BGR2GRAY), 60, 160) > 0
    ys, xs = np.nonzero(edges)
    if len(xs) == 0:
        return empty

    cx, cy = (x0 + x1) / 2 - ox0, (y0 + y1) / 2 - oy0
    rx, ry = (x1 - x0) / 2 + h * 0.15, h / 2 + h * 0.15
    radius = np.hypot((xs - cx) / rx, (ys - cy) / ry)
    near = (radius > 1.0) & (radius < 1.0 + RING_REACH * 0.9)
    if not near.any():
        return empty

    sectors = ((np.degrees(np.arctan2(ys[near] - cy, xs[near] - cx)) + 180) // (360 / SECTORS)).astype(int)
    covered = len(set(sectors.tolist())) / SECTORS

    ring_pixels = area[ys[near], xs[near]]

    stroke = np.zeros(edges.shape, dtype=np.uint8)
    angles = np.degrees(np.arctan2(ys[near] - cy, xs[near] - cx))
    ends = (np.abs(angles) < RING_END) | (np.abs(angles) > 180 - RING_END)
    stroke[ys[near][ends], xs[near][ends]] = 1
    stroke = cv2.dilate(stroke, np.ones((5, 5), np.uint8)) > 0
    sides = area[stroke]
    if len(sides) >= 10:
        side_lab = cv2.cvtColor(sides.reshape(-1, 1, 3).astype(np.uint8), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
        side_lab[:, 0] *= 100.0 / 255.0
        side_lab[:, 1:] -= 128.0
        unlike_text = np.linalg.norm(side_lab - fill, axis=1) >= RING_NOT_TEXT
        text_share = 1.0 - float(unlike_text.mean())
        sides = sides[unlike_text]
    else:
        text_share = 0.0
    if len(sides) < 10:
        return covered, chroma(lab_of(ring_pixels)), np.asarray(fill_bgr, dtype=np.float32)

    samples = sides.astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    count = min(3, len(samples))
    _, groups, centres = cv2.kmeans(samples, count, None, criteria, 3, cv2.KMEANS_PP_CENTERS)

    def vividness(g):
        lab = lab_of(centres[g][None, :])
        return chroma(lab) + 2 * max(0.0, lab[0] - 80)

    best = max(range(count), key=vividness)
    if vividness(best) < RING_VIVID and text_share >= RING_TEXT_SHARE:
        return covered, chroma(lab_of(ring_pixels)), np.asarray(fill_bgr, dtype=np.float32)
    colour = np.median(sides[groups.ravel() == best], axis=0)
    return covered, chroma(lab_of(ring_pixels)), colour


def region(image, box):
    height, width = image.shape[:2]
    x0, y0, x1, y1 = rect_of(box, width, height)
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None

    crop = image[y0:y1, x0:x1]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    text = mask > 127
    if text.mean() > 0.5:
        text = ~text
    if text.sum() < 10 or (~text).sum() < 10:
        return None

    rows = np.nonzero(text.any(axis=1))[0]
    top_rows = rows[: max(1, len(rows) // 3)]
    bottom_rows = rows[-max(1, len(rows) // 3):]
    top = crop[top_rows][text[top_rows]]
    bottom = crop[bottom_rows][text[bottom_rows]]

    fill = lab_of(crop[text])
    background = lab_of(crop[~text])
    background_spread = float(np.std(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)[~text]))
    outside = band(image, x0, y0, x1, y1, OUTER)
    outer_colour = lab_of(outside)
    ring, ring_colour, ring_bgr = ring_score(image, x0, y0, x1, y1, fill, np.median(crop[text], axis=0))

    top_lab, bottom_lab = lab_of(top), lab_of(bottom)

    return {
        "rect": (x0, y0, x1, y1),
        "area": (x1 - x0) * (y1 - y0),
        "cy": (y0 + y1) / 2,
        "fill": fill,
        "fill_bgr": np.median(crop[text], axis=0),
        "box_bgr": np.median(crop[~text], axis=0),
        "ring_bgr": ring_bgr,
        "gradient": delta(top_lab, bottom_lab),
        "gradient_light": float(top_lab[0] - bottom_lab[0]),
        "top_bgr": np.median(top, axis=0) if len(top) else np.zeros(3),
        "bottom_bgr": np.median(bottom, axis=0) if len(bottom) else np.zeros(3),
        "background_spread": background_spread,
        "background_chroma": chroma(background),
        "box_contrast": delta(background, outer_colour),
        "ring": ring,
        "ring_chroma": ring_colour,
        "fill_chroma": chroma(fill),
    }


def measure(image, boxes, areas):
    if not boxes:
        return None
    biggest = max(areas)
    picked = sorted(
        [(b, a) for b, a in zip(boxes, areas) if a >= biggest * MIN_REGION], key=lambda item: -item[1]
    )[:MAX_REGIONS]
    regions = [r for r in (region(image, b) for b, _ in picked) if r is not None]
    return regions or None


def odd_one_out(regions):
    if len(regions) < 2:
        return 0.0, 0
    scores = []
    for i, r in enumerate(regions):
        others = np.median([o["fill"] for j, o in enumerate(regions) if j != i], axis=0)
        scores.append(delta(r["fill"], others))
    top = max(scores)
    tied = [i for i, v in enumerate(scores) if v >= top * 0.9]
    best = max(tied, key=lambda i: regions[i]["fill_chroma"])
    return scores[best], best


def vector(regions):
    colour, colour_at = odd_one_out(regions)
    grad_at = int(np.argmax([r["gradient"] for r in regions]))
    box_at = int(np.argmax([r["box_contrast"] - r["background_spread"] for r in regions]))
    ring_at = int(np.argmax([r["ring"] for r in regions]))

    g, b, k = regions[grad_at], regions[box_at], regions[ring_at]
    row = [
        len(regions),
        colour,
        regions[colour_at]["fill_chroma"],
        g["gradient"],
        g["gradient_light"],
        b["box_contrast"],
        b["background_spread"],
        b["background_chroma"],
        k["ring"],
        k["ring_chroma"],
        float(np.median([r["fill_chroma"] for r in regions])),
        float(np.mean([r["background_spread"] for r in regions])),
    ]
    return np.array(row, dtype=np.float32), {"colour": colour_at, "gradient": grad_at, "box": box_at, "ring": ring_at}


def load():
    global _model
    if _model is None and os.path.exists(MODEL):
        data = np.load(MODEL, allow_pickle=False)
        _model = {key: data[key] for key in data.files}
    return _model


def forward(model, rows):
    x = (rows - model["feat_mean"]) / model["feat_std"]
    hidden = np.maximum(0, x @ model["w1"] + model["b1"])
    logits = hidden @ model["w2"] + model["b2"]
    logits -= logits.max(axis=1, keepdims=True)
    exp = np.exp(logits)
    return exp / exp.sum(axis=1, keepdims=True)


def read(image, boxes, areas):
    model = load()
    regions = measure(image, boxes, areas)
    if model is None or regions is None:
        return None

    row, at = vector(regions)
    probs = forward(model, row[None, :])[0]
    style = CLASSES[int(np.argmax(probs))]

    result = {"style": style, "confidence": round(float(probs.max()), 3)}
    if style == "none":
        return result

    target = regions[at[style]]
    ordered = sorted(regions, key=lambda r: r["cy"])
    index = ordered.index(target)
    result["line"] = "first" if index == 0 else "last" if index == len(ordered) - 1 else "middle"

    if style == "colour":
        result["colour"] = hex_of(target["fill_bgr"])
    elif style == "box":
        result["colour"] = hex_of(target["box_bgr"])
    elif style == "ring":
        result["colour"] = hex_of(target["ring_bgr"])
    elif style == "gradient":
        result["colours"] = [hex_of(target["top_bgr"]), hex_of(target["bottom_bgr"])]
    return result
