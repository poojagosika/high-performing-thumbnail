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
    kept = [(row, item, at) for row, item, at in measured if row is not None]
    print(f"{folder}: {len(kept)} of {len(labels)} thumbnails had readable headlines", flush=True)
    return kept


def measure(args):
    folder, item = args
    image = cv2.imread(os.path.join(folder, item["file"]))
    boxes, _ = detect.text_model().detect(image)
    if boxes is None or len(boxes) == 0:
        return None, item, None
    areas = [abs(cv2.contourArea(np.array(b, dtype=np.float32))) for b in boxes]
    regions = emphasis.measure(image, list(boxes), areas)
    if regions is None:
        return None, item, None
    row, at = emphasis.vector(regions)
    ordered = sorted(range(len(regions)), key=lambda i: regions[i]["cy"])
    lines = {k: ("first" if ordered.index(v) == 0 else "last" if ordered.index(v) == len(ordered) - 1 else "middle") for k, v in at.items()}
    return row, item, lines


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
    X = np.stack([row for row, _, _ in data])
    truth = [item["style"] for _, item, _ in data]
    predicted = [emphasis.CLASSES[i] for i in emphasis.forward(model, X).argmax(axis=1)]
    accuracy = float(np.mean([a == b for a, b in zip(predicted, truth)]))

    confusion = {t: {p: 0 for p in emphasis.CLASSES} for t in emphasis.CLASSES}
    for t, p in zip(truth, predicted):
        confusion[t][p] += 1

    placed = [(item["line"], lines[p]) for (_, item, lines), p in zip(data, predicted) if p == item["style"] and p != "none"]
    line_accuracy = float(np.mean([a == b for a, b in placed])) if placed else 0.0

    print(json.dumps({
        "set": name,
        "thumbnails": len(data),
        "styleAccuracy": round(accuracy, 3),
        "lineAccuracyWhenStyleRight": round(line_accuracy, 3),
        "confusion (truth -> predicted)": confusion,
    }, indent=1), flush=True)


def main():
    train_dirs = sys.argv[1].split(",")
    test_dir = sys.argv[2]

    data = [row for folder in train_dirs for row in rows_for(folder)]
    test = rows_for(test_dir)

    X = np.stack([row for row, _, _ in data])
    y = np.array([emphasis.CLASSES.index(item["style"]) for _, item, _ in data])
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
