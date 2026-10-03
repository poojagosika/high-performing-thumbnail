import os

import cv2
import numpy as np

MODEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "models", "emphasis_reader.npz")

CLASSES = ["none", "colour", "box", "ring", "gradient"]
MAX_REGIONS = 5
MIN_REGION = 0.12
BAND = 0.35
OUTER = 0.9
BORDER = 2
BORDER_SURE = 0.35
RING_REACH = 0.6
SECTORS = 24
RING_COLOURS = 6
RING_SAMPLES = 6000
RING_INNER = 0.5
RING_GAP = 0.06
RING_WIDTH = 0.3
RING_EDGE = 0.04
RING_BULK = 0.35
RING_CLEAR = 0.1
RING_TEXT = 30.0
RING_TEXT_INSIDE = 0.3
SEARCH_REACH = 1.5
LOOP_MIN_POINTS = 20
LOOP_MIN_HEIGHT = 0.5
LOOP_MIN_ASPECT = 1.2
LOOP_ROUND = (0.85, 1.15)
LOOP_THIN = 0.6
LOOP_OVERLAP = 0.3
LOOP_HOLE = 0.2
RING_NEAR_BEST = 0.8
RING_VIVID_SHARE = 70
ROW_SHARE = 0.5
PICK = 0.5
MAX_EMPHASES = 2

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


def outer_run(radii, gap):
    radii = np.sort(radii)
    breaks = np.nonzero(np.diff(radii) > gap)[0]
    lo = radii[breaks[-1] + 1] if len(breaks) else radii[0]
    return lo, radii[-1]


def longest_chain(hit):
    if hit.all():
        return len(hit)
    doubled = np.concatenate([hit, hit])
    best = run = 0
    for h in doubled:
        run = run + 1 if h else 0
        best = max(best, run)
    return min(best, len(hit))


def ring_score(image, x0, y0, x1, y1, fill_bgr):
    height, width = image.shape[:2]
    h = y1 - y0
    reach = int(h * RING_REACH)
    ox0, oy0 = max(0, x0 - reach), max(0, y0 - reach)
    ox1, oy1 = min(width, x1 + reach), min(height, y1 + reach)
    area = image[oy0:oy1, ox0:ox1]
    fallback = (0.0, 0.0, np.asarray(fill_bgr, dtype=np.float32))
    if area.size == 0:
        return fallback

    pixels = area.reshape(-1, 3)
    lab, groups, count = clusters(pixels)
    fill_lab = cv2.cvtColor(np.uint8([[fill_bgr]]), cv2.COLOR_BGR2LAB).reshape(3).astype(np.float32)
    textlike = np.linalg.norm(lab - fill_lab, axis=1) < RING_TEXT

    ys, xs = np.divmod(np.arange(len(lab)), area.shape[1])
    dx = (xs - ((x0 + x1) / 2 - ox0)) / max(1.0, (x1 - x0) / 2)
    dy = (ys - ((y0 + y1) / 2 - oy0)) / max(1.0, h / 2)
    radius = np.hypot(dx, dy)
    sector = ((np.degrees(np.arctan2(dy, dx)) + 180) // (360 / SECTORS)).astype(int) % SECTORS
    edge = np.zeros(SECTORS)
    np.maximum.at(edge, sector, radius)

    scored = []
    for g in range(count):
        member = groups == g
        if member.mean() > RING_BULK:
            continue
        member &= radius >= RING_INNER
        hit, keep = np.zeros(SECTORS, dtype=bool), np.zeros(len(lab), dtype=bool)
        for s in range(SECTORS):
            chosen = member & (sector == s)
            if chosen.sum() < 3:
                continue
            lo, hi = outer_run(radius[chosen], RING_GAP)
            inside = (sector == s) & (radius >= lo - RING_CLEAR) & (radius < lo - RING_GAP / 3)
            clear = not inside.any() or textlike[inside].mean() < RING_TEXT_INSIDE
            if hi - lo <= RING_WIDTH and lo > RING_INNER + RING_GAP and edge[s] - hi > RING_EDGE and clear:
                hit[s] = True
                keep |= chosen & (radius >= lo)
        coverage = (hit.mean() + longest_chain(hit) / SECTORS) / 2
        if coverage > 0:
            scored.append((coverage, keep))

    if not scored:
        return fallback
    top = max(c for c, _ in scored)
    stroke = np.zeros(len(lab), dtype=bool)
    for coverage, keep in scored:
        if coverage >= top * RING_NEAR_BEST:
            stroke |= keep
    tone = lab[stroke]
    vivid = np.hypot(tone[:, 1] - 128, tone[:, 2] - 128) + tone[:, 0] * 50 / 255
    colour = np.median(pixels[stroke][vivid >= np.percentile(vivid, RING_VIVID_SHARE)], axis=0)
    return top, chroma(lab_of(colour[None, :])), colour


def region(image, box):
    height, width = image.shape[:2]
    x0, y0, x1, y1 = rect_of(box, width, height)
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None

    crop = image[y0:y1, x0:x1]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    text = mask > 127
    rim = np.concatenate([text[:BORDER].ravel(), text[-BORDER:].ravel(), text[:, :BORDER].ravel(), text[:, -BORDER:].ravel()])
    on_rim = rim.mean()
    if on_rim > 1 - BORDER_SURE or (on_rim >= BORDER_SURE and text.mean() > 0.5):
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
    ring, ring_colour, ring_bgr = ring_score(image, x0, y0, x1, y1, np.median(crop[text], axis=0))

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


def clusters(pixels):
    lab = cv2.cvtColor(pixels.reshape(-1, 1, 3), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    step = max(1, len(lab) // RING_SAMPLES)
    count = min(RING_COLOURS, len(lab[::step]))
    cv2.setRNGSeed(0)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, _, centres = cv2.kmeans(lab[::step], count, None, criteria, 2, cv2.KMEANS_PP_CENTERS)
    groups = np.argmin(((lab[:, None, :] - centres[None, :, :]) ** 2).sum(axis=2), axis=1)
    return lab, groups, count


def overlap(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return inter / smaller if smaller > 0 else 0.0


def loops(mask, line):
    found = []
    contours, tree = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if tree is None:
        return found
    for i, contour in enumerate(contours):
        _, _, child, parent = tree[0][i]
        if parent != -1 or child == -1 or len(contour) < LOOP_MIN_POINTS:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        if h < line * LOOP_MIN_HEIGHT or w < h * LOOP_MIN_ASPECT:
            continue
        outer = cv2.contourArea(contour)
        (_, _), (a, b), _ = cv2.fitEllipse(contour)
        ellipse = np.pi * a * b / 4
        if outer <= 0 or not LOOP_ROUND[0] <= outer / ellipse <= LOOP_ROUND[1]:
            continue
        holes, largest, k = 0.0, 0.0, child
        while k != -1:
            hole = cv2.contourArea(contours[k])
            holes += hole
            largest = max(largest, hole)
            k = tree[0][k][0]
        if (outer - holes) / outer > LOOP_THIN or largest < outer * LOOP_HOLE:
            continue
        found.append((x, y, x + w, y + h))
    return found


def find_rings(image, boxes):
    height, width = image.shape[:2]
    rects = [rect_of(b, width, height) for b in boxes]
    line = max(r[3] - r[1] for r in rects)
    reach = int(line * SEARCH_REACH)
    ox0 = max(0, min(r[0] for r in rects) - reach)
    oy0 = max(0, min(r[1] for r in rects) - reach)
    ox1 = min(width, max(r[2] for r in rects) + reach)
    oy1 = min(height, max(r[3] for r in rects) + reach)
    area = np.ascontiguousarray(image[oy0:oy1, ox0:ox1])
    if area.size == 0:
        return []

    _, groups, count = clusters(area.reshape(-1, 3))
    groups = groups.reshape(area.shape[:2])
    found = []
    for g in range(count):
        mask = (groups == g).astype(np.uint8)
        if mask.mean() > RING_BULK:
            continue
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        for x0, y0, x1, y1 in loops(mask, line):
            rect = (x0 + ox0, y0 + oy0, x1 + ox0, y1 + oy0)
            if all(overlap(rect, r) < LOOP_OVERLAP for r in found):
                found.append(rect)
    return found


def measure(image, boxes, areas):
    if not boxes:
        return None
    biggest = max(areas)
    picked = sorted(
        [(b, a) for b, a in zip(boxes, areas) if a >= biggest * MIN_REGION], key=lambda item: -item[1]
    )[:MAX_REGIONS]
    height, width = image.shape[:2]
    rects = [rect_of(b, width, height) for b, _ in picked]
    rings = find_rings(image, [b for b, _ in picked])
    plain = [(b, 0.0) for (b, _), r in zip(picked, rects) if all(overlap(r, ring) < LOOP_OVERLAP for ring in rings)]
    circled = []
    for ring in rings:
        x0, y0, x1, y1 = ring
        for r in rects:
            if overlap(r, ring) >= LOOP_OVERLAP:
                x0, y0, x1, y1 = min(x0, r[0]), min(y0, r[1]), max(x1, r[2]), max(y1, r[3])
        circled.append(([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 1.0))

    regions = []
    for box, loop in plain + circled:
        found = region(image, box)
        if found is not None:
            found["loop"] = loop
            regions.append(found)
    return regions or None


def rows_of(regions):
    order = sorted(range(len(regions)), key=lambda i: regions[i]["cy"])
    rows = []
    for i in order:
        height = regions[i]["rect"][3] - regions[i]["rect"][1]
        last = rows[-1] if rows else None
        if last and abs(regions[i]["cy"] - np.mean([regions[j]["cy"] for j in last])) < height * ROW_SHARE:
            last.append(i)
        else:
            rows.append([i])
    return rows


def vector(regions, i):
    r = regions[i]
    others = [o for j, o in enumerate(regions) if j != i] or [r]
    tallest = max(o["rect"][3] - o["rect"][1] for o in regions)
    return np.array([
        len(regions),
        delta(r["fill"], np.median([o["fill"] for o in others], axis=0)),
        r["fill_chroma"],
        r["fill"][0],
        float(np.median([o["fill_chroma"] for o in others])),
        r["gradient"],
        r["gradient_light"],
        r["gradient"] - float(np.median([o["gradient"] for o in others])),
        r["box_contrast"],
        r["box_contrast"] - float(np.median([o["box_contrast"] for o in others])),
        r["background_spread"],
        r["background_chroma"],
        r["ring"],
        r["ring_chroma"],
        r["loop"],
        (r["rect"][3] - r["rect"][1]) / tallest,
    ], dtype=np.float32)


def vectors(regions):
    return np.stack([vector(regions, i) for i in range(len(regions))])


def decide(probs, rows):
    picks = []
    for at, row in enumerate(rows):
        best = max(((probs[i][c], c, i) for i in row for c in range(1, len(CLASSES))), key=lambda item: item[0])
        if best[0] >= PICK:
            picks.append((float(best[0]), CLASSES[best[1]], best[2], at))
    picks.sort(key=lambda item: -item[0])
    return picks[:MAX_EMPHASES]


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


def describe(regions, pick, rows):
    confidence, style, index, at = pick
    target = regions[index]
    found = {
        "style": style,
        "confidence": round(confidence, 3),
        "line": "first" if at == 0 else "last" if at == len(rows) - 1 else "middle",
    }
    if style == "colour":
        found["colour"] = hex_of(target["fill_bgr"])
    elif style == "box":
        found["colour"] = hex_of(target["box_bgr"])
    elif style == "ring":
        found["colour"] = hex_of(target["ring_bgr"])
    elif style == "gradient":
        found["colours"] = [hex_of(target["top_bgr"]), hex_of(target["bottom_bgr"])]
    return found


def read(image, boxes, areas):
    model = load()
    regions = measure(image, boxes, areas)
    if model is None or regions is None:
        return None

    probs = forward(model, vectors(regions))
    rows = rows_of(regions)
    picks = decide(probs, rows)
    if not picks:
        return {"style": "none", "confidence": round(float(probs[:, 0].min()), 3)}

    result = describe(regions, picks[0], rows)
    if len(picks) > 1:
        result["also"] = describe(regions, picks[1], rows)
    return result
