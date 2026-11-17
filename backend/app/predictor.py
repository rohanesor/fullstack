from dataclasses import dataclass
from pathlib import Path
import joblib
from .config import get_settings


@dataclass
class PredictionResult:
    category_code: str | None
    confidence: int | None
    status: str
    model_version: str
    error_code: str | None = None


class Predictor:
    """Loads a reviewed sklearn pipeline if configured; otherwise fails safely."""
    def __init__(self):
        self.settings = get_settings()
        self.pipeline = None
        path = Path(self.settings.model_path)
        if path.exists():
            try:
                self.pipeline = joblib.load(path)
            except Exception:
                self.pipeline = None

    def predict(self, text: str) -> PredictionResult:
        if self.pipeline is None:
            return PredictionResult(None, None, "NOT_CONFIGURED", self.settings.model_version, "MODEL_NOT_CONFIGURED")
        try:
            label = str(self.pipeline.predict([text])[0])
            confidence = None
            if hasattr(self.pipeline, "predict_proba"):
                confidence = round(float(self.pipeline.predict_proba([text]).max()) * 100)
            return PredictionResult(label, confidence, "SUCCEEDED", self.settings.model_version)
        except Exception:
            return PredictionResult(None, None, "FAILED", self.settings.model_version, "PREDICTION_FAILED")


predictor = Predictor()
