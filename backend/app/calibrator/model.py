import os
import joblib

MODEL_PATH = os.path.join(os.path.dirname(
    __file__), "artifacts", "calibrator.joblib")
_model = None

REASON_CODES = [
    "item_not_received",
    "not_as_described",
    "duplicate_charge",
    "unauthorized_transaction",
    "defective_product",
]


def _load():
    global _model
    if _model is None and os.path.exists(MODEL_PATH):
        _model = joblib.load(MODEL_PATH)
    return _model


def predict(vlm_score: float, postcheck_passed: bool, citations_count: int, reason_code: str) -> float:
    model = _load()
    if model is None:
        # STUB fallback until train.py has produced calibrator.joblib
        penalty = 0.0 if postcheck_passed else 0.3
        return max(0.0, min(1.0, vlm_score - penalty))
    reason_onehot = [1 if reason_code == rc else 0 for rc in REASON_CODES]
    features = [[vlm_score, int(postcheck_passed),
                 citations_count] + reason_onehot]
    return float(model.predict_proba(features)[0][1])
