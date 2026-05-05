import base64
import io
import os
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent

from dotenv import load_dotenv

load_dotenv(ROOT_DIR / ".env")

def require_setting(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be set in food-detector/.env.")
    return value

def resolve_project_path(value: str) -> str:
    path = Path(value)
    return str(path if path.is_absolute() else ROOT_DIR / path)


def parse_float_setting(name: str) -> float:
    value = require_setting(name)
    try:
        return float(value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a number.") from exc


def parse_int_setting(name: str) -> int:
    value = require_setting(name)
    try:
        return int(value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a whole number.") from exc


os.environ["YOLO_CONFIG_DIR"] = resolve_project_path(require_setting("YOLO_CONFIG_DIR"))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO

MODEL_PATH = require_setting("YOLO_MODEL_PATH")
CONFIDENCE = parse_float_setting("YOLO_CONFIDENCE")
IMAGE_SIZE = parse_int_setting("YOLO_IMAGE_SIZE")
DEVICE = os.getenv("YOLO_DEVICE", "").strip() or None

app = FastAPI(title="Adaptive Fitness Food Detector")
model: YOLO | None = None


class DetectRequest(BaseModel):
    imageBase64: str
    mimeType: str = "image/jpeg"


def strip_data_uri(value: str) -> str:
    if "," in value and value.lstrip().lower().startswith("data:"):
        return value.split(",", 1)[1]
    return value


def load_image(image_base64: str) -> Image.Image:
    try:
        raw = base64.b64decode(strip_data_uri(image_base64), validate=True)
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image.") from exc


def get_model() -> YOLO:
    global model
    if model is None:
        resolved = Path(MODEL_PATH)
        model_input = str(resolved if resolved.is_absolute() else ROOT_DIR / resolved)
        if not Path(model_input).exists() and MODEL_PATH.endswith(".pt"):
            model_input = MODEL_PATH
        model = YOLO(model_input)
    return model


def box_area(xyxy: list[float]) -> float:
    if len(xyxy) < 4:
        return 0.0
    x1, y1, x2, y2 = xyxy[:4]
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


def mask_area(mask: Any, image_width: int, image_height: int) -> float:
    try:
        array = mask.detach().cpu().numpy()
        mask_height, mask_width = array.shape[-2], array.shape[-1]
        scale = (image_width / mask_width) * (image_height / mask_height)
        return float((array > 0.5).sum()) * scale
    except Exception:
        return 0.0


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "modelPath": MODEL_PATH,
        "confidence": CONFIDENCE,
        "imageSize": IMAGE_SIZE,
        "device": DEVICE or "auto",
    }


@app.post("/detect")
def detect_food(request: DetectRequest) -> dict[str, Any]:
    image = load_image(request.imageBase64)
    detector = get_model()
    width, height = image.size

    predict_kwargs: dict[str, Any] = {
        "conf": CONFIDENCE,
        "imgsz": IMAGE_SIZE,
        "verbose": False,
    }
    if DEVICE:
        predict_kwargs["device"] = DEVICE

    results = detector.predict(image, **predict_kwargs)
    detections: list[dict[str, Any]] = []

    for result in results:
        names = result.names or {}
        boxes = result.boxes or []
        masks = result.masks.data if result.masks is not None else None

        for index, box in enumerate(boxes):
            class_id = int(box.cls[0].item())
            label = str(names.get(class_id, class_id)).strip()
            if not label:
                continue

            confidence = float(box.conf[0].item())
            xyxy = [float(value) for value in box.xyxy[0].tolist()]
            pixel_area = 0.0
            if masks is not None and index < len(masks):
                pixel_area = mask_area(masks[index], width, height)
            if pixel_area <= 0:
                pixel_area = box_area(xyxy)
            if pixel_area <= 0:
                continue

            detections.append(
                {
                    "label": label,
                    "confidence": round(confidence, 4),
                    "pixelArea": round(pixel_area, 2),
                    "bbox": [round(value, 2) for value in xyxy],
                    "bboxFormat": "xyxy",
                }
            )

    return {
        "detections": detections,
        "image": {
            "width": width,
            "height": height,
        },
        "model": {
            "path": MODEL_PATH,
            "confidence": CONFIDENCE,
            "imageSize": IMAGE_SIZE,
        },
    }
