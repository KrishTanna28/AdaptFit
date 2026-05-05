# Food Detector

Local YOLO service for plate-photo nutrition logging.

## Run

Create local settings:

```powershell
Copy-Item .\food-detector\.env.example .\food-detector\.env
```

Install dependencies once:

```powershell
.\food-detector\setup.ps1
```

Then start the detector:

```powershell
.\food-detector\start.ps1
```

The service starts at:

```text
http://<FOOD_DETECTOR_HOST>:<FOOD_DETECTOR_PORT>/detect
```

The nutrition proxy calls this URL through `YOLO_FOOD_DETECTION_URL`.

## Model

The model path, confidence threshold, image size, and device are configured in `food-detector/.env`.

For better food logging, put a food-trained YOLO `.pt` model in this folder and set:

```env
YOLO_MODEL_PATH=my-food-model.pt
```

YOLO returns the class labels that are built into the model you load. The default `yolov8n.pt` model is a general object detector, not a universal food detector, so it does not provide one broad `food` class. For broad food coverage, set `YOLO_MODEL_PATH` to a food-trained YOLO model. The app does not hardcode food labels; it accepts the model's detections and the nutrition proxy keeps only detections that can resolve to nutrition data.

Settings:

```env
FOOD_DETECTOR_HOST=127.0.0.1
FOOD_DETECTOR_PORT=4010
YOLO_MODEL_PATH=yolov8n.pt
YOLO_CONFIDENCE=0.2
YOLO_IMAGE_SIZE=640
YOLO_CONFIG_DIR=.ultralytics
YOLO_DEVICE=
```
