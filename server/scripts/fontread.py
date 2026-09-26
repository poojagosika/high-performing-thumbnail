import os

import cv2
import numpy as np

MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "models", "font_reader.npz")

HEIGHT = 32
WINDOW = 128
STRIDE = 48
CELL = 8
BINS = 9
MIN_COMPONENT = 0.25
MAX_WINDOWS = 8

_model = None


def binarise(crop):
    gray = crop if crop.ndim == 2 else cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    if gray.shape[0] < 8 or gray.shape[1] < 8:
        return None

    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    border = np.concatenate([bw[0], bw[-1], bw[:, 0], bw[:, -1]])
    if border.mean() > 127:
        bw = 255 - bw

    ys, xs = np.nonzero(bw)
    if len(ys) == 0:
        return None
    return bw[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]


def stats(bw):
    ink = bw > 127
    height, width = bw.shape
    fill = float(ink.mean())

    depth = cv2.distanceTransform(ink.astype(np.uint8), cv2.DIST_L2, 3)
    stroke = float(np.percentile(depth[ink], 90)) * 2 / height if ink.any() else 0.0

    count, _, boxes, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8))
    glyphs = [b for b in boxes[1:] if b[3] >= height * MIN_COMPONENT]
    if glyphs:
        aspect = float(np.median([b[2] / b[3] for b in glyphs]))
        density = len(glyphs) * height / width
    else:
        aspect, density = width / height, 0.0

    return [fill, stroke, aspect, density]


def windows(bw):
    width = max(1, int(round(bw.shape[1] * HEIGHT / bw.shape[0])))
    line = cv2.resize(bw, (width, HEIGHT), interpolation=cv2.INTER_AREA)

    if width <= WINDOW:
        pad = np.zeros((HEIGHT, WINDOW), dtype=np.uint8)
        pad[:, :width] = line
        return [pad]

    starts = list(range(0, width - WINDOW + 1, STRIDE))[:MAX_WINDOWS]
    return [line[:, s: s + WINDOW] for s in starts]


def gradients(window):
    img = window.astype(np.float32) / 255.0
    gx = cv2.Sobel(img, cv2.CV_32F, 1, 0, ksize=1)
    gy = cv2.Sobel(img, cv2.CV_32F, 0, 1, ksize=1)
    magnitude = np.sqrt(gx * gx + gy * gy)
    angle = (np.degrees(np.arctan2(gy, gx)) + 180.0) % 180.0

    rows, cols = HEIGHT // CELL, WINDOW // CELL
    bins = np.minimum((angle / (180.0 / BINS)).astype(np.int32), BINS - 1)
    cells = np.zeros((rows, cols, BINS), dtype=np.float32)
    for b in range(BINS):
        weighted = np.where(bins == b, magnitude, 0.0)
        cells[:, :, b] = weighted.reshape(rows, CELL, cols, CELL).sum(axis=(1, 3))

    blocks = []
    for r in range(rows - 1):
        for c in range(cols - 1):
            block = cells[r: r + 2, c: c + 2].ravel()
            blocks.append(block / np.sqrt((block * block).sum() + 1e-6))
    return np.concatenate(blocks)


def features(crop):
    bw = binarise(crop)
    if bw is None:
        return None
    hog = np.mean([gradients(w) for w in windows(bw)], axis=0)
    return np.concatenate([hog, np.array(stats(bw), dtype=np.float32)]).astype(np.float32)


def load():
    global _model
    if _model is None and os.path.exists(MODEL):
        data = np.load(MODEL, allow_pickle=False)
        _model = {key: data[key] for key in data.files}
    return _model


def forward(model, rows):
    x = (rows - model["feat_mean"]) / model["feat_std"]
    x = (x - model["pca_mean"]) @ model["pca_vectors"].T
    hidden = np.maximum(0, x @ model["w1"] + model["b1"])
    logits = hidden @ model["w2"] + model["b2"]
    logits -= logits.max(axis=1, keepdims=True)
    exp = np.exp(logits)
    return exp / exp.sum(axis=1, keepdims=True)


def read(crops, weights=None):
    model = load()
    if model is None:
        return None

    rows, kept = [], []
    for i, crop in enumerate(crops):
        f = features(crop)
        if f is not None:
            rows.append(f)
            kept.append(1.0 if weights is None else float(weights[i]))
    if not rows:
        return None

    probs = forward(model, np.stack(rows))
    w = np.array(kept) / sum(kept)
    blended = (probs * w[:, None]).sum(axis=0)

    labels = [str(l) for l in model["labels"]]
    families = [str(f) for f in model["families"]]
    order = np.argsort(-blended)

    family_scores = {}
    for label, family, p in zip(labels, families, blended):
        family_scores[family] = family_scores.get(family, 0.0) + float(p)
    family = max(family_scores, key=family_scores.get)

    return {
        "key": labels[order[0]],
        "confidence": round(float(blended[order[0]]), 3),
        "family": family,
        "familyConfidence": round(family_scores[family], 3),
        "ranking": [{"key": labels[i], "p": round(float(blended[i]), 3)} for i in order[:3]],
    }
