import json
import os
import sys
from multiprocessing import Pool

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
os.chdir(ROOT)

import detect
import emphasis

OUT = os.path.join(ROOT, "assets", "models", "emphasis_reader.npz")
SEED = 5


def rows_for(folder):
    labels = json.load(open(os.path.join(folder, "labels.json")))
    with Pool(os.cpu_count()) as pool:
        measured = pool.map(measure, [(folder, item) for item in labels], chunksize=8)
    kept = [m for m in measured if m is not None]
    print(f"{folder}: {len(kept)} of {len(labels)} thumbnails had readable headlines", flush=True)
    return kept


def line_styles(item, count):
    if "lines" in item:
        return item["lines"] if len(item["lines"]) == count else None
    styles = ["none"] * count
    if item["style"] != "none":
        styles[0 if item["line"] == "first" else count - 1] = item["style"]
    return styles


def measure(args):
    folder, item = args
    image = cv2.imread(os.path.join(folder, item["file"]))
    boxes, _ = detect.text_model().detect(image)
    if boxes is None or len(boxes) == 0:
        return None
    areas = [abs(cv2.contourArea(np.array(b, dtype=np.float32))) for b in boxes]
    regions = emphasis.measure(image, list(boxes), areas)
    if regions is None:
        return None
    rows = emphasis.rows_of(regions)
    styles = line_styles(item, len(rows))
    if styles is None:
        return None
    y = np.zeros(len(regions), dtype=np.int64)
    for at, row in enumerate(rows):
        for i in row:
            y[i] = emphasis.CLASSES.index(styles[at])
    return emphasis.vectors(regions), y, rows, styles


def train(X, y, classes, hidden=48, epochs=600, lr=3e-3, decay=1e-4):
    rng = np.random.default_rng(SEED)
    w1 = rng.normal(0, np.sqrt(2 / X.shape[1]), (X.shape[1], hidden)).astype(np.float32)
    b1 = np.zeros(hidden, dtype=np.float32)
    w2 = rng.normal(0, np.sqrt(2 / hidden), (hidden, classes)).astype(np.float32)
    b2 = np.zeros(classes, dtype=np.float32)
    params = [w1, b1, w2, b2]
    m = [np.zeros_like(p) for p in params]
    v = [np.zeros_like(p) for p in params]

    for step in range(1, epochs + 1):
        h_pre = X @ params[0] + params[1]
        h = np.maximum(0, h_pre)
        logits = h @ params[2] + params[3]
        logits -= logits.max(axis=1, keepdims=True)
        p = np.exp(logits)
        p /= p.sum(axis=1, keepdims=True)
        p[np.arange(len(y)), y] -= 1
        p /= len(y)
        grads = [None] * 4
        grads[2] = h.T @ p + decay * params[2]
        grads[3] = p.sum(axis=0)
        dh = (p @ params[2].T) * (h_pre > 0)
        grads[0] = X.T @ dh + decay * params[0]
        grads[1] = dh.sum(axis=0)
        for i, g in enumerate(grads):
            m[i] = 0.9 * m[i] + 0.1 * g
            v[i] = 0.999 * v[i] + 0.001 * g * g
            params[i] -= lr * (m[i] / (1 - 0.9 ** step)) / (np.sqrt(v[i] / (1 - 0.999 ** step)) + 1e-8)
    return params


def report(model, data, name):
    X = np.concatenate([x for x, _, _, _ in data])
    y = np.concatenate([t for _, t, _, _ in data])
    predicted = emphasis.forward(model, X).argmax(axis=1)

    confusion = {t: {p: 0 for p in emphasis.CLASSES} for t in emphasis.CLASSES}
    for t, p in zip(y, predicted):
        confusion[emphasis.CLASSES[t]][emphasis.CLASSES[p]] += 1

    exact, primary, doubles, doubles_found = 0, 0, 0, 0
    for x, _, rows, styles in data:
        picks = emphasis.decide(emphasis.forward(model, x), rows)
        found = {(at, style) for _, style, _, at in picks}
        truth = {(at, style) for at, style in enumerate(styles) if style != "none"}
        exact += found == truth
        primary += (not truth and not picks) or (bool(picks) and (picks[0][3], picks[0][1]) in truth)
        if len(truth) == 2:
            doubles += 1
            doubles_found += found == truth

    print(json.dumps({
        "set": name,
        "thumbnails": len(data),
        "lines": int(len(y)),
        "lineAccuracy": round(float((predicted == y).mean()), 3),
        "mainEmphasisRight": round(primary / len(data), 3),
        "allEmphasesRight": round(exact / len(data), 3),
        "twoEmphasisThumbnails": doubles,
        "bothFound": round(doubles_found / max(1, doubles), 3),
        "confusion (truth -> predicted)": confusion,
    }, indent=1), flush=True)


def main():
    train_dirs = sys.argv[1].split(",")
    test_dir = sys.argv[2]

    data = [row for folder in train_dirs for row in rows_for(folder)]
    test = rows_for(test_dir)

    X = np.concatenate([x for x, _, _, _ in data])
    y = np.concatenate([t for _, t, _, _ in data])
    feat_mean = X.mean(axis=0)
    feat_std = X.std(axis=0) + 1e-6

    params = train((X - feat_mean) / feat_std, y, len(emphasis.CLASSES))
    model = {
        "classes": np.array(emphasis.CLASSES),
        "feat_mean": feat_mean.astype(np.float32),
        "feat_std": feat_std.astype(np.float32),
        "w1": params[0], "b1": params[1], "w2": params[2], "b2": params[3],
    }
    np.savez_compressed(OUT, **model)

    report(model, data, "training")
    report(model, test, "held-out")
    print(f"saved {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
