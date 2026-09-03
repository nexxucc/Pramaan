import os
import joblib
import numpy as np
import shap

MODEL_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "calibrator.joblib")

REASON_CODES = [
    "item_not_received",
    "not_as_described",
    "duplicate_charge",
    "unauthorized_transaction",
    "defective_product",
]
FEATURE_NAMES = ["vlm_score", "postcheck_passed", "citations_count"] + [f"reason_{r}" for r in REASON_CODES]

_model = None
_explainer = None


def _load():
    global _model, _explainer
    if _model is None:
        _model = joblib.load(MODEL_PATH)
        # CalibratedClassifierCV wraps GBM -- SHAP needs the underlying estimator's predict_proba,
        # KernelExplainer works generically but is slow; use the calibrated model's predict_proba directly
        # via a small background sample built at call time (see explain_case).
    return _model


def explain_case(vlm_score: float, postcheck_passed: bool, citations_count: int, reason_code: str,
                  background: np.ndarray) -> dict:
    """Returns per-feature SHAP contribution for one case.
    `background` = small sample of training feature rows (e.g. 20-50 rows) for KernelExplainer baseline.
    """
    model = _load()
    reason_onehot = [1 if reason_code == rc else 0 for rc in REASON_CODES]
    x = np.array([[vlm_score, int(postcheck_passed), citations_count] + reason_onehot])

    explainer = shap.KernelExplainer(lambda data: model.predict_proba(data)[:, 1], background)
    shap_values = explainer.shap_values(x, nsamples=100, silent=True)

    contributions = dict(zip(FEATURE_NAMES, shap_values[0].tolist()))
    return {
        "predicted_score": float(model.predict_proba(x)[0][1]),
        "base_value": float(explainer.expected_value),
        "contributions": contributions,
    }


def global_importance(X: np.ndarray, background: np.ndarray) -> dict:
    """Global feature importance chart data, computed once over the full training set."""
    model = _load()
    explainer = shap.KernelExplainer(lambda data: model.predict_proba(data)[:, 1], background)
    shap_values = explainer.shap_values(X, nsamples=100, silent=True)
    mean_abs = np.abs(shap_values).mean(axis=0)
    return dict(zip(FEATURE_NAMES, mean_abs.tolist()))