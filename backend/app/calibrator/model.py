import os
import joblib

MODEL_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "calibrator.joblib")
_model = None


def _load():
    global _model
    if _model is None and os.path.exists(MODEL_PATH):
        _model = joblib.load(MODEL_PATH)
    return _model


def predict(vlm_score: float, postcheck_passed: bool, bundle: dict) -> float:
    model = _load()
    if model is None:
        # STUB fallback until train.py has produced calibrator.joblib
        penalty = 0.0 if postcheck_passed else 0.3
        return max(0.0, min(1.0, vlm_score - penalty))
    features = [[vlm_score, int(postcheck_passed), len(bundle.get("communication", []))]]
    return float(model.predict_proba(features)[0][1])
