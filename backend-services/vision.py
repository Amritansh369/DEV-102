"""Computer-vision primitives: face detection (YuNet, Haar fallback), head pose and iris gaze
(MediaPipe Face Landmarker), face embeddings (SFace) and camera-blocked checks.

Models are fetched once from the official OpenCV model zoo into ./models. If a model is missing
the module degrades gracefully and reports which capability is unavailable.
"""
from __future__ import annotations

import base64
import logging
import threading
import urllib.request
from dataclasses import dataclass, field

import cv2
import numpy as np

from config import settings

log = logging.getLogger("agent.vision")

MODEL_URLS = {
    "yunet.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "sface.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
    "face_landmarker.task": "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    "efficientdet_lite0.tflite": "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
}
OBJECT_LABELS = ["cell phone", "book"]  # COCO names; everything else the detector knows is ignored

_lock = threading.RLock()  # OpenCV DNN detectors and the landmarker are not thread-safe
_detector: cv2.FaceDetectorYN | None = None
_recognizer: cv2.FaceRecognizerSF | None = None
_haar: cv2.CascadeClassifier | None = None
_mesh = None
_objects = None
_status: dict[str, bool] = {}


def ensure_models() -> dict[str, bool]:
    """Downloads missing models (best effort) and initialises detectors. Safe to call repeatedly."""
    global _detector, _recognizer, _haar, _mesh, _objects
    with _lock:
        if _status:
            return _status
        settings.models_dir.mkdir(parents=True, exist_ok=True)
        for name, url in MODEL_URLS.items():
            path = settings.models_dir / name
            if not path.exists():
                try:
                    log.info("downloading %s", name)
                    urllib.request.urlretrieve(url, path)  # noqa: S310 - fixed https URL from the OpenCV zoo
                except Exception as exc:  # network may be unavailable; fall back below
                    log.warning("could not download %s: %s", name, exc)
                    path.unlink(missing_ok=True)
        try:
            _detector = cv2.FaceDetectorYN.create(str(settings.models_dir / "yunet.onnx"), "", (320, 320), 0.75, 0.3, 50)
        except Exception as exc:
            log.warning("YuNet unavailable (%s); using Haar cascade", exc)
            _detector = None
        try:
            _recognizer = cv2.FaceRecognizerSF.create(str(settings.models_dir / "sface.onnx"), "")
        except Exception as exc:
            log.warning("SFace unavailable (%s); face matching disabled", exc)
            _recognizer = None
        _haar = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        try:
            from mediapipe.tasks.python import BaseOptions
            from mediapipe.tasks.python import vision as mpv

            options = mpv.FaceLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(settings.models_dir / "face_landmarker.task")),
                running_mode=mpv.RunningMode.IMAGE, num_faces=3, min_face_detection_confidence=0.5,
            )
            _mesh = mpv.FaceLandmarker.create_from_options(options)
        except Exception as exc:
            log.warning("MediaPipe Face Mesh unavailable (%s); gaze uses coarse landmarks", exc)
            _mesh = None
        try:
            from mediapipe.tasks.python import BaseOptions
            from mediapipe.tasks.python import vision as mpv

            options = mpv.ObjectDetectorOptions(
                base_options=BaseOptions(model_asset_path=str(settings.models_dir / "efficientdet_lite0.tflite")),
                running_mode=mpv.RunningMode.IMAGE, max_results=5, score_threshold=0.3, category_allowlist=OBJECT_LABELS,
            )
            _objects = mpv.ObjectDetector.create_from_options(options)
        except Exception as exc:
            log.warning("Object detector unavailable (%s); phone and notes checks disabled", exc)
            _objects = None
        _status.update(detector=_detector is not None, recognizer=_recognizer is not None, mesh=_mesh is not None, objects=_objects is not None)
        return _status


def decode(b64: str) -> np.ndarray | None:
    try:
        raw = base64.b64decode(b64.split(",", 1)[-1], validate=False)
        img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            return None
        h, w = img.shape[:2]
        scale = 640 / max(h, w)
        return cv2.resize(img, (int(w * scale), int(h * scale))) if scale < 1 else img
    except Exception:
        return None


@dataclass
class Face:
    box: tuple[int, int, int, int]
    score: float
    raw: np.ndarray | None = None  # YuNet row (box + 5 landmarks), used for alignment


@dataclass
class DetectedObject:
    label: str  # one of OBJECT_LABELS
    score: float
    area: float  # share of the frame the box covers, 0..1


@dataclass
class FrameFacts:
    faces: list[Face] = field(default_factory=list)
    objects: list[DetectedObject] = field(default_factory=list)
    brightness: float = 0
    contrast: float = 0
    blocked: bool = False
    yaw: float | None = None
    pitch: float | None = None
    iris_offset: float | None = None
    eyes_open: bool | None = None

    @property
    def looking_away(self) -> bool:
        if self.yaw is not None and abs(self.yaw) > settings.yaw_limit_deg:
            return True
        if self.pitch is not None and abs(self.pitch) > settings.pitch_limit_deg:
            return True
        return self.iris_offset is not None and abs(self.iris_offset) > settings.iris_offset_limit


def detect_faces(img: np.ndarray) -> list[Face]:
    ensure_models()
    h, w = img.shape[:2]
    if _detector is not None:
        _detector.setInputSize((w, h))
        _, rows = _detector.detect(img)
        faces = []
        for r in rows if rows is not None else []:
            x, y, bw, bh = (int(v) for v in r[:4])
            if min(bw, bh) >= settings.min_face_px * min(1.0, w / 640):
                faces.append(Face((x, y, bw, bh), float(r[-1]), r))
        return faces
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    found = _haar.detectMultiScale(gray, 1.1, 6, minSize=(settings.min_face_px, settings.min_face_px)) if _haar is not None else []
    return [Face((int(x), int(y), int(fw), int(fh)), 0.8) for (x, y, fw, fh) in found]


# 3D reference points (nose tip, chin, eye corners, mouth corners) for solvePnP head pose.
_MODEL_3D = np.array([(0.0, 0.0, 0.0), (0.0, -63.6, -12.5), (-43.3, 32.7, -26.0), (43.3, 32.7, -26.0), (-28.9, -28.9, -24.1), (28.9, -28.9, -24.1)], dtype=np.float64)
_MESH_IDX = [1, 152, 33, 263, 61, 291]


def _pose_from_points(pts2d: np.ndarray, w: int, h: int) -> tuple[float, float] | None:
    cam = np.array([[w, 0, w / 2], [0, w, h / 2], [0, 0, 1]], dtype=np.float64)
    ok, rvec, _ = cv2.solvePnP(_MODEL_3D, pts2d, cam, np.zeros((4, 1)), flags=cv2.SOLVEPNP_ITERATIVE)
    if not ok:
        return None
    rot, _ = cv2.Rodrigues(rvec)
    angles, *_ = cv2.RQDecomp3x3(rot)
    pitch, yaw = float(angles[0]), float(angles[1])
    # RQDecomp returns pitch near ±180 for a frontal face with this model; fold it to ±90.
    if pitch > 90:
        pitch -= 180
    elif pitch < -90:
        pitch += 180
    return yaw, pitch


def head_and_gaze(img: np.ndarray, face: Face) -> tuple[float | None, float | None, float | None, bool | None]:
    """Returns (yaw°, pitch°, horizontal iris offset in -1..1, eyes open) for the main face."""
    h, w = img.shape[:2]
    if _mesh is not None:
        import mediapipe as mp

        with _lock:  # the landmarker is not thread-safe
            res = _mesh.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
        if res.face_landmarks:
            lm = res.face_landmarks[0]
            pts = np.array([(lm[i].x * w, lm[i].y * h) for i in _MESH_IDX], dtype=np.float64)
            pose = _pose_from_points(pts, w, h)

            def ratio(iris: int, inner: int, outer: int) -> float:
                span = lm[outer].x - lm[inner].x
                return 0.0 if abs(span) < 1e-6 else ((lm[iris].x - lm[inner].x) / span - 0.5) * 2

            def openness(upper: int, lower: int, inner: int, outer: int) -> float:
                span = np.hypot(lm[outer].x - lm[inner].x, lm[outer].y - lm[inner].y)
                return 0.0 if span < 1e-6 else float(np.hypot(lm[upper].x - lm[lower].x, lm[upper].y - lm[lower].y) / span)

            iris = (ratio(468, 133, 33) + ratio(473, 362, 263)) / 2 if len(lm) > 473 else None
            eyes = (openness(159, 145, 133, 33) + openness(386, 374, 362, 263)) / 2 >= settings.eye_open_ratio
            return (pose[0], pose[1], iris, eyes) if pose else (None, None, iris, eyes)
    if face.raw is not None:
        # YuNet landmarks: right eye, left eye, nose, right mouth, left mouth.
        re, le, nose = face.raw[4:6], face.raw[6:8], face.raw[8:10]
        eye_mid = (re + le) / 2
        eye_dist = float(np.linalg.norm(le - re)) or 1.0
        yaw = float((nose[0] - eye_mid[0]) / eye_dist) * 90
        return yaw, None, None, None
    return None, None, None, None


def analyze(img: np.ndarray) -> FrameFacts:
    with _lock:
        return _analyze(img)


def _analyze(img: np.ndarray) -> FrameFacts:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    facts = FrameFacts(brightness=float(gray.mean()), contrast=float(gray.std()))
    facts.blocked = facts.brightness < settings.dark_mean or facts.contrast < settings.flat_std
    facts.faces = detect_faces(img)
    if len(facts.faces) >= 1:
        main = max(facts.faces, key=lambda f: f.box[2] * f.box[3])
        facts.yaw, facts.pitch, facts.iris_offset, facts.eyes_open = head_and_gaze(img, main)
    facts.objects = detect_objects(img)
    return facts


def detect_objects(img: np.ndarray) -> list[DetectedObject]:
    """Phones and books in the frame. Empty when OBJECT_DETECTION is off or the model is unavailable."""
    if not settings.object_detection:
        return []
    ensure_models()
    if _objects is None:
        return []
    import mediapipe as mp

    h, w = img.shape[:2]
    with _lock:  # the detector is not thread-safe
        res = _objects.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
    found: list[DetectedObject] = []
    for d in res.detections:
        if not d.categories:
            continue
        top = d.categories[0]
        box = d.bounding_box
        found.append(DetectedObject(label=top.category_name, score=float(top.score), area=(box.width * box.height) / float(w * h)))
    return found


def embedding(img: np.ndarray, face: Face) -> np.ndarray | None:
    if _recognizer is None or face.raw is None:
        return None
    with _lock:
        aligned = _recognizer.alignCrop(img, face.raw)
        return _recognizer.feature(aligned)


def similarity(a: np.ndarray, b: np.ndarray) -> float:
    if _recognizer is None:
        return 0.0
    return float(_recognizer.match(a, b, getattr(cv2, "FaceRecognizerSF_FR_COSINE", 0)))
