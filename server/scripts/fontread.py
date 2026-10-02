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
SLANT_HEIGHT = 64
SLANT_MIN = 4.0
RUN_BINS = np.linspace(0, 1.2, 13)
PROFILE = 16
GLYPH = 64
GLYPH_MIN = 0.5

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


def slant(bw):
    height = SLANT_HEIGHT
    img = cv2.resize(bw, (max(1, int(bw.shape[1] * height / bw.shape[0])), height), interpolation=cv2.INTER_AREA)
    img = img.astype(np.float32) / 255.0
    gx = cv2.Sobel(img, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(img, cv2.CV_32F, 0, 1, ksize=3)
    magnitude = np.hypot(gx, gy)
    stems = (np.abs(gx) > 2.5 * np.abs(gy)) & (magnitude > 0.5)
    if stems.sum() < 20:
        return 0.0

    angle = np.degrees(np.arctan(gy[stems] / gx[stems]))
    counts, edges = np.histogram(angle, bins=np.arange(-25, 26, 2), weights=magnitude[stems])
    counts = np.convolve(counts, [1, 2, 1], mode="same")
    peak = int(np.argmax(counts))
    return float((edges[peak] + edges[peak + 1]) / 2)


def deslant(bw):
    angle = slant(bw)
    if abs(angle) < SLANT_MIN:
        return bw

    lean = np.tan(np.radians(angle))
    height, width = bw.shape
    spread = int(np.ceil(abs(lean) * height)) + 2
    matrix = np.float32([[1, lean, max(0.0, -lean * height)], [0, 1, 0]])
    upright = cv2.warpAffine(bw, matrix, (width + spread, height), flags=cv2.INTER_LINEAR, borderValue=0)

    ys, xs = np.nonzero(upright > 127)
    if len(ys) == 0:
        return bw
    return upright[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]


def run_lengths(ink, bins):
    padded = np.pad(ink.astype(np.int8), ((0, 0), (1, 1)))
    step = np.diff(padded, axis=1)
    lengths = np.nonzero(step == -1)[1] - np.nonzero(step == 1)[1]
    counts, _ = np.histogram(lengths / ink.shape[0], bins=bins, weights=lengths)
    return counts / max(1, lengths.sum())


def shape(bw):
    ink = bw > 127
    across = run_lengths(ink, RUN_BINS)
    down = run_lengths(ink.T, RUN_BINS * ink.shape[0] / max(1, ink.shape[1]))
    rows = cv2.resize(ink.mean(axis=1)[:, None].astype(np.float32), (1, PROFILE), interpolation=cv2.INTER_AREA).ravel()

    contours, tree = cv2.findContours(ink.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    holes, hole_area, outer = 0, 0.0, 0
    if tree is not None:
        for contour, node in zip(contours, tree[0]):
            if node[3] == -1:
                outer += 1
            else:
                holes += 1
                hole_area += cv2.contourArea(contour)

    return np.concatenate([
        across, down, rows / (rows.max() + 1e-6),
        [holes / max(1, outer), hole_area / max(1.0, float(ink.sum()))],
    ]).astype(np.float32)


def glyph_cells(glyph):
    height, width = glyph.shape
    scale = GLYPH / max(height, width)
    small = cv2.resize(glyph, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((GLYPH, GLYPH), dtype=np.uint8)
    top, left = (GLYPH - small.shape[0]) // 2, (GLYPH - small.shape[1]) // 2
    canvas[top: top + small.shape[0], left: left + small.shape[1]] = small

    img = canvas.astype(np.float32) / 255.0
    gx = cv2.Sobel(img, cv2.CV_32F, 1, 0, ksize=1)
    gy = cv2.Sobel(img, cv2.CV_32F, 0, 1, ksize=1)
    magnitude = np.hypot(gx, gy)
    bins = np.minimum((((np.degrees(np.arctan2(gy, gx)) + 180.0) % 180.0) / (180.0 / BINS)).astype(np.int32), BINS - 1)

    n = GLYPH // CELL
    cells = np.zeros((n, n, BINS), dtype=np.float32)
    for b in range(BINS):
        cells[:, :, b] = np.where(bins == b, magnitude, 0.0).reshape(n, CELL, n, CELL).sum(axis=(1, 3))
    cells /= np.sqrt((cells * cells).sum(axis=2, keepdims=True)) + 1e-6
    return np.concatenate([cells.ravel(), [width / height]])


def letters(bw):
    ink = (bw > 127).astype(np.uint8)
    count, labels, boxes, _ = cv2.connectedComponentsWithStats(ink)
    found = []
    for i in range(1, count):
        x, y, w, h, _ = boxes[i]
        if h >= ink.shape[0] * GLYPH_MIN and w >= 2:
            found.append(glyph_cells(((labels[y: y + h, x: x + w] == i) * 255).astype(np.uint8)))
    size = (GLYPH // CELL) ** 2 * BINS + 1
    if not found:
        return np.zeros(size * 2, dtype=np.float32)
    found = np.stack(found)
    return np.concatenate([found.mean(axis=0), found.std(axis=0)]).astype(np.float32)


def features(crop):
    bw = binarise(crop)
    if bw is None:
        return None
    bw = deslant(bw)
    hog = np.mean([gradients(w) for w in windows(bw)], axis=0)
    return np.concatenate([hog, np.array(stats(bw), dtype=np.float32), shape(bw), letters(bw)]).astype(np.float32)


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
