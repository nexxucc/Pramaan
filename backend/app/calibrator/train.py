import csv
import json
import os
import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import cross_val_score, cross_val_predict, StratifiedKFold

CASES_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "synthetic", "cases_with_vlm.csv")
MODEL_OUT = os.path.join(os.path.dirname(__file__), "artifacts", "calibrator.joblib")
THRESHOLDS_OUT = os.path.join(os.path.dirname(__file__), "artifacts", "thresholds.json")

REASON_CODES = [
    "item_not_received",
    "not_as_described",
    "duplicate_charge",
    "unauthorized_transaction",
    "defective_product",
]

AUTO_RESOLVE_PERCENTILE = 90  # top 10% most confident -> auto_resolve
ESCALATE_PERCENTILE = 50      # median split -> escalate vs request_evidence


def featurize(row):
    vlm_score = float(row["vlm_validity_score"])
    postcheck_passed = 1 if row["postcheck_passed"] in ("True", "1", "true") else 0
    citations_count = int(row["citations_count"])
    reason_onehot = [1 if row["reason_code"] == rc else 0 for rc in REASON_CODES]
    return [vlm_score, postcheck_passed, citations_count] + reason_onehot


def main():
    X, y = [], []
    with open(CASES_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            X.append(featurize(row))
            y.append(int(row["label"]))

    X = np.array(X)
    y = np.array(y)
    print(f"Loaded {len(y)} cases, positive rate: {y.mean():.2f}")

    base = GradientBoostingClassifier(max_depth=2, n_estimators=50, learning_rate=0.1)

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scores = cross_val_score(base, X, y, cv=cv, scoring="roc_auc")
    print(f"CV ROC-AUC: {scores.mean():.3f} +/- {scores.std():.3f}")

    if scores.mean() < 0.55:
        print("WARNING: CV score near chance level. Consider logistic regression fallback (see decision log).")

    # Out-of-fold calibrated probabilities -> honest distribution to set thresholds from,
    # not fitted-on-training-data optimism.
    calibrated_for_oof = CalibratedClassifierCV(base, cv=5, method="sigmoid")
    oof_probs = cross_val_predict(calibrated_for_oof, X, y, cv=cv, method="predict_proba")[:, 1]

    auto_resolve_threshold = float(np.percentile(oof_probs, AUTO_RESOLVE_PERCENTILE))
    escalate_threshold = float(np.percentile(oof_probs, ESCALATE_PERCENTILE))

    print(f"Auto thresholds -> auto_resolve >= {auto_resolve_threshold:.3f} (p{AUTO_RESOLVE_PERCENTILE}), "
          f"escalate >= {escalate_threshold:.3f} (p{ESCALATE_PERCENTILE})")

    # Final model trained on all data for production use
    calibrated = CalibratedClassifierCV(base, cv=5, method="sigmoid")
    calibrated.fit(X, y)

    os.makedirs(os.path.dirname(MODEL_OUT), exist_ok=True)
    joblib.dump(calibrated, MODEL_OUT)
    print(f"Saved model -> {MODEL_OUT}")

    with open(THRESHOLDS_OUT, "w") as f:
        json.dump({
            "auto_resolve_threshold": auto_resolve_threshold,
            "escalate_threshold": escalate_threshold,
        }, f, indent=2)
    print(f"Saved thresholds -> {THRESHOLDS_OUT}")


if __name__ == "__main__":
    main()