import json
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image

SIZE = 320
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def run(model_path, src, dst):
    image = Image.open(src).convert("RGB")
    width, height = image.size

    x = np.asarray(image.resize((SIZE, SIZE), Image.BILINEAR), dtype=np.float32) / 255.0
    x = ((x - MEAN) / STD).transpose(2, 0, 1)[None, ...]

    session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    raw = session.run(None, {session.get_inputs()[0].name: x})[0][0, 0]
    raw = (raw - raw.min()) / (raw.max() - raw.min() + 1e-8)

    mask = Image.fromarray((raw * 255).astype(np.uint8)).resize((width, height), Image.BILINEAR)
    rgba = image.convert("RGBA")
    rgba.putalpha(mask)
    rgba.save(dst)

    solid = float((raw > 0.5).mean())
    return {"coverage": round(solid * 100, 2), "width": width, "height": height}


if __name__ == "__main__":
    try:
        print(json.dumps(run(sys.argv[1], sys.argv[2], sys.argv[3])))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
