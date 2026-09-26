import io
import json
import os
import random
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import fontread

FONT_DIR = os.path.join(ROOT, "assets", "fonts")
OUT = os.path.join(ROOT, "assets", "models", "font_reader.npz")

FONTS = [
    ("anton", "Anton-Regular.ttf", None, "condensed"),
    ("bebas", "BebasNeue-Regular.ttf", None, "condensed"),
    ("oswald", "Oswald-Bold.ttf", None, "condensed"),
    ("bigshoulders", "BigShouldersDisplay-var.ttf", 900, "condensed"),
    ("barlowcondensed", "BarlowCondensed-SemiBold.ttf", None, "condensed"),
    ("barlowsemi", "BarlowSemiCondensed-SemiBold.ttf", None, "condensed"),
    ("poppins", "Poppins-ExtraBold.ttf", None, "geometric"),
    ("poppinsblack", "Poppins-Black.ttf", None, "geometric"),
    ("montserrat", "Montserrat-Black.ttf", None, "geometric"),
    ("unbounded", "Unbounded-var.ttf", 900, "geometric"),
    ("archivo", "ArchivoBlack-Regular.ttf", None, "geometric"),
    ("lexend", "Lexend-var.ttf", 900, "geometric"),
    ("intertight", "InterTight-var.ttf", 900, "neutral"),
    ("jakarta", "PlusJakartaSans-var.ttf", 800, "neutral"),
    ("spacegrotesk", "SpaceGrotesk-var.ttf", 700, "neutral"),
    ("bricolage", "BricolageGrotesque-var.ttf", 800, "neutral"),
    ("funnel", "FunnelDisplay-var.ttf", 800, "neutral"),
]

WORDS = (
    "the best worst first last secret truth real fake money rich poor free day night week year life "
    "death war peace love hate game code bug fix build ship launch fail win lose gold silver bronze medal "
    "final india world cup match team player coach fan live news breaking exclusive update review test "
    "reaction challenge eating food chicken pizza burger travel city village house car bike phone laptop "
    "ai robot future past history science space rocket moon earth ocean fire ice storm flood money "
    "startup saas founder market stock crypto trading job hire fired salary interview placed months "
    "years hours minutes nobody everyone always never why how what who stop start quit try every same "
    "mistakes rules tips hacks guide full course beginner pro expert vs cheap expensive worth dead dying "
    "over end new old big small huge tiny fast slow crazy insane shocking honest brutal simple hard easy"
).split()

PALETTE = [
    (255, 255, 255), (255, 221, 0), (255, 212, 0), (229, 37, 33), (255, 59, 48), (20, 20, 26),
    (0, 0, 0), (246, 195, 67), (19, 136, 8), (255, 153, 51), (30, 144, 255), (240, 240, 240),
    (255, 110, 0), (150, 255, 90), (180, 180, 190),
]

PER_CLASS = int(os.environ.get("PER_CLASS", "1500"))
SEED = 7
RENDER_SIZE = 96


def font_for(file, weight, size):
    font = ImageFont.truetype(os.path.join(FONT_DIR, file), size)
    if weight is not None:
        try:
            axes = font.get_variation_axes()
            values = []
            for axis in axes:
                if axis["name"] == b"Weight":
                    values.append(max(axis["minimum"], min(axis["maximum"], weight)))
                else:
                    values.append(axis["default"])
            font.set_variation_by_axes(values)
        except OSError:
            pass
    return font


def phrase(rng):
    words = rng.sample(WORDS, rng.choice([1, 2, 2, 3, 3, 4]))
    if rng.random() < 0.15:
        words.insert(rng.randrange(len(words) + 1), str(rng.choice([3, 5, 7, 10, 50, 100, 2026])))
    text = " ".join(words)
    roll = rng.random()
    if roll < 0.72:
        return text.upper()
    if roll < 0.9:
        return text.title()
    return text


def background(rng, width, height):
    kind = rng.random()
    base = np.zeros((height, width, 3), dtype=np.float32)

    if kind < 0.3:
        base[:] = rng.choice(PALETTE)
    elif kind < 0.6:
        a = np.array(rng.choice(PALETTE), dtype=np.float32)
        b = np.array(rng.choice(PALETTE), dtype=np.float32)
        t = np.linspace(0, 1, height if rng.random() < 0.5 else width)
        ramp = t[:, None] if len(t) == height else t[None, :]
        base[:] = (a * (1 - ramp[..., None]) + b * ramp[..., None]) if ramp.ndim == 2 else a
    else:
        small = np.random.default_rng(rng.randrange(1 << 30)).uniform(0, 255, (6, 10, 3)).astype(np.float32)
        base = np.array(Image.fromarray(small.astype(np.uint8)).resize((width, height), Image.BICUBIC), dtype=np.float32)

    noise = np.random.default_rng(rng.randrange(1 << 30)).normal(0, rng.uniform(0, 14), base.shape)
    return Image.fromarray(np.clip(base + noise, 0, 255).astype(np.uint8))


def contrast(a, b):
    return abs(0.299 * (a[0] - b[0]) + 0.587 * (a[1] - b[1]) + 0.114 * (a[2] - b[2]))


def sample(args):
    index, key, file, weight = args
    rng = random.Random(SEED * 1_000_003 + index)
    font = font_for(file, weight, RENDER_SIZE)
    text = phrase(rng)

    stroke = rng.choice([0, 0, 0, 0, int(RENDER_SIZE * rng.uniform(0.03, 0.12))])
    left, top, right, bottom = font.getbbox(text, stroke_width=stroke)
    tw, th = right - left, bottom - top
    if tw <= 0 or th <= 0:
        return None

    margin = int(th * 0.8)
    width, height = tw + margin * 2, th + margin * 2
    canvas = background(rng, width, height).convert("RGBA")
    bg_colour = canvas.getpixel((width // 2, height // 2))[:3]

    fill = rng.choice(PALETTE)
    tries = 0
    while contrast(fill, bg_colour) < 70 and tries < 12:
        fill = rng.choice(PALETTE)
        tries += 1
    stroke_fill = (0, 0, 0) if sum(fill) > 380 else (255, 255, 255)

    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    origin = (margin - left, margin - top)

    if rng.random() < 0.15:
        pad = int(th * rng.uniform(0.15, 0.35))
        box_colour = rng.choice([c for c in PALETTE if contrast(c, fill) > 90] or [(229, 37, 33)])
        draw.rectangle([margin - pad, margin - pad, margin + tw + pad, margin + th + pad], fill=box_colour + (255,))

    if rng.random() < 0.4:
        shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        offset = int(th * rng.uniform(0.03, 0.08))
        ImageDraw.Draw(shadow).text((origin[0] + offset, origin[1] + offset), text, font=font, fill=(0, 0, 0, 200), stroke_width=stroke)
        layer = Image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(th * 0.05)), layer)
        draw = ImageDraw.Draw(layer)

    draw.text(origin, text, font=font, fill=fill + (255,), stroke_width=stroke, stroke_fill=stroke_fill + (255,))

    if rng.random() < 0.3:
        layer = layer.rotate(rng.uniform(-4, 4), resample=Image.BICUBIC)

    image = Image.alpha_composite(canvas, layer).convert("RGB")

    pad_x = int(th * rng.uniform(0.05, 0.35))
    pad_y = int(th * rng.uniform(0.05, 0.3))
    image = image.crop((margin - pad_x, margin - pad_y, margin + tw + pad_x, margin + th + pad_y))

    target = rng.uniform(18, 90)
    scale = target / th
    small = image.resize((max(8, int(image.width * scale)), max(8, int(image.height * scale))), Image.BILINEAR)

    if rng.random() < 0.3:
        small = small.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 1.0)))

    buffer = io.BytesIO()
    small.save(buffer, "JPEG", quality=rng.randint(30, 92))
    crop = np.array(Image.open(buffer).convert("L"))

    return fontread.features(crop)


def build(start, per_class):
    jobs = []
    for label, (key, file, weight, _) in enumerate(FONTS):
        for i in range(per_class):
            jobs.append((start + label * 1_000_000 + i, key, file, weight))

    with Pool(os.cpu_count()) as pool:
        rows = pool.map(sample, jobs, chunksize=64)

    X, y = [], []
    for (_, key, _, _), row in zip(jobs, rows):
        if row is not None:
            X.append(row)
            y.append([k for k, *_ in FONTS].index(key))
    return np.stack(X).astype(np.float32), np.array(y)


def train(X, y, Xv, yv, classes, hidden=384, epochs=60, batch=256, lr=1e-3, decay=1e-4, dropout=0.2):
    rng = np.random.default_rng(SEED)
    d = X.shape[1]
    w1 = rng.normal(0, np.sqrt(2 / d), (d, hidden)).astype(np.float32)
    b1 = np.zeros(hidden, dtype=np.float32)
    w2 = rng.normal(0, np.sqrt(2 / hidden), (hidden, classes)).astype(np.float32)
    b2 = np.zeros(classes, dtype=np.float32)
    params = [w1, b1, w2, b2]
    m = [np.zeros_like(p) for p in params]
    v = [np.zeros_like(p) for p in params]
    step = 0
    best, best_params, patience = 0.0, None, 0

    def predict(inputs):
        h = np.maximum(0, inputs @ params[0] + params[1])
        return (h @ params[2] + params[3]).argmax(axis=1)

    for epoch in range(epochs):
        order = rng.permutation(len(X))
        for s in range(0, len(X), batch):
            idx = order[s: s + batch]
            xb, yb = X[idx], y[idx]
            h_pre = xb @ params[0] + params[1]
            h = np.maximum(0, h_pre)
            mask = (rng.random(h.shape) > dropout).astype(np.float32) / (1 - dropout)
            h_drop = h * mask
            logits = h_drop @ params[2] + params[3]
            logits -= logits.max(axis=1, keepdims=True)
            p = np.exp(logits)
            p /= p.sum(axis=1, keepdims=True)
            p[np.arange(len(yb)), yb] -= 1
            p /= len(yb)

            g_w2 = h_drop.T @ p + decay * params[2]
            g_b2 = p.sum(axis=0)
            dh = (p @ params[2].T) * mask * (h_pre > 0)
            g_w1 = xb.T @ dh + decay * params[0]
            g_b1 = dh.sum(axis=0)

            step += 1
            for i, g in enumerate([g_w1, g_b1, g_w2, g_b2]):
                m[i] = 0.9 * m[i] + 0.1 * g
                v[i] = 0.999 * v[i] + 0.001 * g * g
                mh = m[i] / (1 - 0.9 ** step)
                vh = v[i] / (1 - 0.999 ** step)
                params[i] -= lr * mh / (np.sqrt(vh) + 1e-8)

        acc = float((predict(Xv) == yv).mean())
        print(f"epoch {epoch + 1:>2}  validation accuracy {acc:.3f}", flush=True)
        if acc > best:
            best, best_params, patience = acc, [p.copy() for p in params], 0
        else:
            patience += 1
            if patience >= 8:
                break

    return best_params, best


def main():
    keys = [k for k, *_ in FONTS]
    families = [f for *_, f in FONTS]

    print(f"generating {PER_CLASS} training samples per font for {len(FONTS)} fonts", flush=True)
    X, y = build(0, PER_CLASS)
    Xv, yv = build(500_000, max(100, PER_CLASS // 5))
    print(f"train {X.shape}, validation {Xv.shape}", flush=True)

    feat_mean = X.mean(axis=0)
    feat_std = X.std(axis=0) + 1e-6
    Xs = (X - feat_mean) / feat_std
    pca_mean = Xs.mean(axis=0)
    _, _, vt = np.linalg.svd(Xs - pca_mean, full_matrices=False)
    pca_vectors = vt[:256].astype(np.float32)

    project = lambda rows: (((rows - feat_mean) / feat_std) - pca_mean) @ pca_vectors.T
    params, best = train(project(X), y, project(Xv), yv, len(FONTS))

    model = {
        "labels": np.array(keys),
        "families": np.array(families),
        "feat_mean": feat_mean.astype(np.float32),
        "feat_std": feat_std.astype(np.float32),
        "pca_mean": pca_mean.astype(np.float32),
        "pca_vectors": pca_vectors,
        "w1": params[0], "b1": params[1], "w2": params[2], "b2": params[3],
    }
    np.savez_compressed(OUT, **model)

    probs = fontread.forward(model, Xv)
    predicted = probs.argmax(axis=1)
    fam = np.array(families)
    report = {
        "fonts": len(FONTS),
        "trainSamples": int(len(X)),
        "validationSamples": int(len(Xv)),
        "exactAccuracy": round(float((predicted == yv).mean()), 3),
        "familyAccuracy": round(float((fam[predicted] == fam[yv]).mean()), 3),
        "perFont": {k: round(float((predicted[yv == i] == i).mean()), 3) for i, k in enumerate(keys)},
    }
    print(json.dumps(report, indent=2))
    print(f"saved {OUT} ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
