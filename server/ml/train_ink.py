import json
import os
import sys
from multiprocessing import Pool

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "ml"))
os.chdir(ROOT)

import detect
import emphasis
from train_emphasis import line_styles, train

OUT = os.path.join(ROOT, "assets", "models", "ink_reader.npz")


def lab(hex_colour):
    bgr = np.uint8([[[int(hex_colour[5:7], 16), int(hex_colour[3:5], 16), int(hex_colour[1:3], 16)]]])
    return emphasis.lab_of(bgr.reshape(-1, 3))


def measure(args):
    folder, item = args
    if "ink" not in item:
        return None
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
    plain = [regions[i] for at, row in enumerate(rows) if styles[at] == "none" for i in row]
    if not plain:
        return None
    return np.stack([emphasis.ink_vector(r) for r in plain]), int(item["outline"] is not None), plain, item


def rows_for(folder):
    labels = json.load(open(os.path.join(folder, "labels.json")))
    with Pool(os.cpu_count()) as pool:
        measured = pool.map(measure, [(folder, item) for item in labels], chunksize=8)
    kept = [m for m in measured if m is not None]
    print(f"{folder}: {len(kept)} of {len(labels)} thumbnails had plain lines", flush=True)
    return kept


def report(data, name):
    right, colour_err, outline_err = 0, [], []
    for _, outlined, plain, item in data:
        found = emphasis.ink(plain)
        right += (found["outline"] is not None) == bool(outlined)
        colour_err.append(emphasis.delta(lab(found["colour"]), lab(item["ink"])))
        if outlined and found["outline"]:
            outline_err.append(emphasis.delta(lab(found["outline"]), lab(item["outline"])))
    print(json.dumps({
        "set": name,
        "thumbnails": len(data),
        "outlineRight": round(right / len(data), 3),
        "textColourWithin15": round(float(np.mean(np.array(colour_err) <= 15)), 3),
        "outlineColourWithin25": round(float(np.mean(np.array(outline_err) <= 25)), 3) if outline_err else None,
    }, indent=1), flush=True)


def main():
    data = [row for folder in sys.argv[1].split(",") for row in rows_for(folder)]
    test = rows_for(sys.argv[2])

    X = np.concatenate([x for x, _, _, _ in data])
    y = np.concatenate([np.full(len(x), outlined) for x, outlined, _, _ in data])
    feat_mean = X.mean(axis=0)
    feat_std = X.std(axis=0) + 1e-6

    params = train((X - feat_mean) / feat_std, y, 2, hidden=24)
    np.savez_compressed(OUT, classes=np.array(["none", "outline"]), feat_mean=feat_mean.astype(np.float32),
                        feat_std=feat_std.astype(np.float32), w1=params[0], b1=params[1], w2=params[2], b2=params[3])

    report(data, "training")
    report(test, "held-out")
    print(f"saved {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
