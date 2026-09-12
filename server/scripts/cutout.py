import json
import sys

import numpy as np
from PIL import Image
from rembg import new_session, remove

MODEL = "isnet-general-use"
_session = None


def session():
    global _session
    if _session is None:
        _session = new_session(MODEL)
    return _session


def run(src, dst):
    image = Image.open(src).convert("RGB")
    result = remove(image, session=session(), post_process_mask=True)
    result.save(dst)

    alpha = np.asarray(result.split()[-1], dtype=np.uint8)
    return {
        "coverage": round(float((alpha > 128).mean()) * 100, 2),
        "width": result.width,
        "height": result.height,
        "model": MODEL,
    }


if __name__ == "__main__":
    try:
        print(json.dumps(run(sys.argv[1], sys.argv[2])))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
