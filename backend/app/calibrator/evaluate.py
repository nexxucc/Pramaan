"""Honest offline evaluation of the calibrator.

Every number in here comes from a model that did not see the row it is
scoring:

  * ``cv``      - 5-fold stratified out-of-fold predictions over the whole
                  dataset. Each row is scored by the one fold-model that was
                  trained without it, so all rows contribute to the curves
                  without any row being scored in-sample.
  * ``holdout`` - a single stratified 80/20 split, trained on the 80 and
                  scored once on the 20. Smaller and noisier than the CV
                  numbers, kept as an independent check that the CV story
                  holds.

Nothing here is fitted on the full dataset and then scored on it -- that
number would be optimistic and is deliberately not reported.

Run: python -m app.calibrator.evaluate   (from backend/)
"""

import csv
import json
import os
from datetime import datetime, timezone

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict, train_test_split

from app.calibrator.train import CASES_PATH, REASON_CODES, featurize

FEATURE_NAMES = ["vlm_score", "postcheck_passed", "citations_count"] + [
    f"reason_{r}" for r in REASON_CODES
]
THRESHOLDS_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "thresholds.json")
METRICS_OUT = os.path.join(os.path.dirname(__file__), "artifacts", "metrics.json")

RANDOM_STATE = 42
N_SPLITS = 5
SWEEP_STEPS = 101


def _base_model():
    return GradientBoostingClassifier(max_depth=2, n_estimators=50, learning_rate=0.1)


def _calibrated():
    return CalibratedClassifierCV(_base_model(), cv=N_SPLITS, method="sigmoid")


def load_dataset():
    """Returns (X, y, meta) where meta carries reason_code + dispute amount per row."""
    X, y, meta = [], [], []
    with open(CASES_PATH, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            X.append(featurize(row))
            y.append(int(row["label"]))
            try:
                amount = float(json.loads(row["transaction"])["amount"])
            except Exception:
                amount = 0.0
            meta.append({
                "reason_code": row["reason_code"],
                "amount": amount,
                "vlm_score": float(row["vlm_validity_score"]),
            })
    return np.array(X), np.array(y), meta


def _counts_at(y, scores, threshold):
    pred = scores >= threshold
    return {
        "tp": int(np.sum(pred & (y == 1))),
        "fp": int(np.sum(pred & (y == 0))),
        "tn": int(np.sum(~pred & (y == 0))),
        "fn": int(np.sum(~pred & (y == 1))),
    }


def _rates(c):
    tp, fp, tn, fn = c["tp"], c["fp"], c["tn"], c["fn"]
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "specificity": tn / (tn + fp) if tn + fp else 0.0,
        "fpr": fp / (fp + tn) if fp + tn else 0.0,
        "accuracy": (tp + tn) / max(1, tp + fp + tn + fn),
    }


def _point_metrics(y, scores, threshold):
    counts = _counts_at(y, scores, threshold)
    return {"threshold": float(threshold), **counts, **_rates(counts)}


def _curves(y, scores):
    fpr, tpr, roc_thr = roc_curve(y, scores)
    precision, recall, _ = precision_recall_curve(y, scores)
    roc_points = [{"fpr": float(a), "tpr": float(b)} for a, b in zip(fpr, tpr)]
    pr_points = [{"recall": float(r), "precision": float(p)} for r, p in zip(recall, precision)]
    return roc_points, pr_points


def _calibration(y, scores, n_bins=8):
    """Reliability curve: predicted probability vs observed frequency per bin.

    Equal-width bins over the observed score range. Empty bins are dropped
    rather than plotted as zeros, so the chart never implies data that is
    not there.
    """
    lo, hi = float(scores.min()), float(scores.max())
    edges = np.linspace(lo, hi, n_bins + 1)
    out = []
    for i in range(n_bins):
        left, right = edges[i], edges[i + 1]
        mask = (scores >= left) & (scores <= right if i == n_bins - 1 else scores < right)
        n = int(mask.sum())
        if n == 0:
            continue
        out.append({
            "bin_start": float(left),
            "bin_end": float(right),
            "predicted": float(scores[mask].mean()),
            "observed": float(y[mask].mean()),
            "count": n,
        })
    return out


def _score_distribution(y, scores, n_bins=20):
    edges = np.linspace(0.0, max(1e-9, float(scores.max())), n_bins + 1)
    out = []
    for i in range(n_bins):
        left, right = edges[i], edges[i + 1]
        mask = (scores >= left) & (scores <= right if i == n_bins - 1 else scores < right)
        out.append({
            "bin_start": float(left),
            "bin_end": float(right),
            "mid": float((left + right) / 2),
            "valid": int(np.sum(mask & (y == 1))),
            "invalid": int(np.sum(mask & (y == 0))),
        })
    return out


def _threshold_sweep(y, scores, meta, escalate_threshold):
    """One row per candidate auto-resolve threshold.

    Raw counts and rupee sums only -- no cost assumption is baked in here.
    The UI multiplies these by whatever unit costs the operator sets, so the
    cost model stays visible and arguable instead of hidden in a constant.

    The grid starts at ``escalate_threshold``, not at zero: the router only
    ever auto-resolves above the escalate bar, so a candidate below it is not
    a reachable operating point. Sweeping below it would also make the three
    bands overlap -- every score in ``[t, escalate_threshold)`` would count as
    both auto and request_evidence, and the per-row counts would sum past n.
    """
    amounts = np.array([m["amount"] for m in meta])
    grid = np.linspace(escalate_threshold, 1.0, SWEEP_STEPS)
    rows = []
    for t in grid:
        auto = scores >= t
        escalate = (scores >= escalate_threshold) & ~auto
        request = scores < escalate_threshold
        counts = _counts_at(y, scores, t)
        auto_wrong = auto & (y == 0)     # auto-resolved a dispute that was not valid
        auto_right = auto & (y == 1)
        missed = ~auto & (y == 1)        # valid dispute that did not clear the bar
        rows.append({
            "threshold": float(t),
            **counts,
            **_rates(counts),
            "n_auto": int(auto.sum()),
            "n_escalate": int(escalate.sum()),
            "n_request_evidence": int(request.sum()),
            "automation_rate": float(auto.mean()),
            "fp_amount": float(amounts[auto_wrong].sum()),
            "tp_amount": float(amounts[auto_right].sum()),
            "fn_amount": float(amounts[missed].sum()),
        })
    return rows


def _per_reason(y, scores, meta, threshold):
    out = []
    for rc in REASON_CODES:
        mask = np.array([m["reason_code"] == rc for m in meta])
        n = int(mask.sum())
        if n == 0:
            continue
        y_rc, s_rc = y[mask], scores[mask]
        entry = {
            "reason_code": rc,
            "n": n,
            "positive_rate": float(y_rc.mean()),
            **_point_metrics(y_rc, s_rc, threshold),
        }
        # ROC-AUC is undefined for a single-class slice -- report null, not a
        # fabricated 0.5. duplicate_charge / unauthorized_transaction are
        # expected to land here (near-zero positive base rate by design).
        entry["roc_auc"] = (
            float(roc_auc_score(y_rc, s_rc)) if len(set(y_rc.tolist())) > 1 else None
        )
        out.append(entry)
    return out


def _fold_permutation_drops(model, X_te, y_te, rng, n_repeats):
    """Drop in ROC-AUC on one held-out fold when a single feature is shuffled.

    Cheap, model-agnostic, and unlike SHAP it needs no background sample.
    A fold whose test rows are all one class has an undefined ROC-AUC and
    contributes nothing.
    """
    if len(set(y_te.tolist())) < 2:
        return None
    base = roc_auc_score(y_te, model.predict_proba(X_te)[:, 1])
    drops = {}
    for i, name in enumerate(FEATURE_NAMES):
        per_repeat = []
        for _ in range(n_repeats):
            Xp = X_te.copy()
            rng.shuffle(Xp[:, i])
            per_repeat.append(base - roc_auc_score(y_te, model.predict_proba(Xp)[:, 1]))
        drops[name] = per_repeat
    return drops


def _permutation_importance(X, y, cv, n_repeats=10):
    """Permutation importance measured out-of-fold.

    Each fold-model is fitted on its training rows and permuted only against
    the rows it never saw, then the per-feature drops are pooled across folds.
    Scoring a model against its own training rows would inflate these numbers
    and would contradict the guarantee at the top of this module, so it is not
    done here. Pooling across folds rather than using the single 80/20 holdout
    keeps every row in the estimate -- the holdout is far too small (n = 44,
    ~8 positives) to rank eight features from.
    """
    rng = np.random.default_rng(RANDOM_STATE)
    pooled = {name: [] for name in FEATURE_NAMES}
    for train_idx, test_idx in cv.split(X, y):
        model = _calibrated().fit(X[train_idx], y[train_idx])
        drops = _fold_permutation_drops(model, X[test_idx], y[test_idx], rng, n_repeats)
        if drops is None:
            continue
        for name, values in drops.items():
            pooled[name].extend(values)
    out = [
        {
            "feature": name,
            "importance": float(np.mean(values)) if values else 0.0,
            "std": float(np.std(values)) if values else 0.0,
        }
        for name, values in pooled.items()
    ]
    out.sort(key=lambda d: d["importance"], reverse=True)
    return out


def compute() -> dict:
    X, y, meta = load_dataset()

    thresholds = {"auto_resolve_threshold": 0.45, "escalate_threshold": 0.15}
    if os.path.exists(THRESHOLDS_PATH):
        with open(THRESHOLDS_PATH) as f:
            thresholds = json.load(f)
    auto_t = float(thresholds["auto_resolve_threshold"])
    esc_t = float(thresholds["escalate_threshold"])

    cv = StratifiedKFold(n_splits=N_SPLITS, shuffle=True, random_state=RANDOM_STATE)
    oof = cross_val_predict(_calibrated(), X, y, cv=cv, method="predict_proba")[:, 1]

    roc_points, pr_points = _curves(y, oof)

    # Independent single split, for a second opinion on the CV headline.
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )
    holdout_model = _calibrated().fit(X_tr, y_tr)
    holdout_scores = holdout_model.predict_proba(X_te)[:, 1]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": {
            "primary": "5-fold stratified out-of-fold cross-validation",
            "note": (
                "Every row is scored by a fold-model trained without it. No metric "
                "on this page -- feature importance included -- is measured in-sample."
            ),
            "model": (
                "GradientBoostingClassifier(max_depth=2, n_estimators=50) "
                "+ sigmoid CalibratedClassifierCV"
            ),
            "random_state": RANDOM_STATE,
        },
        "dataset": {
            "n": int(len(y)),
            "positives": int(y.sum()),
            "negatives": int((y == 0).sum()),
            "positive_rate": float(y.mean()),
            "features": FEATURE_NAMES,
            "mean_amount": float(np.mean([m["amount"] for m in meta])),
            "total_amount": float(np.sum([m["amount"] for m in meta])),
            "label_meaning": "1 = valid dispute (merchant at fault), 0 = invalid dispute",
        },
        "thresholds": {
            "auto_resolve": auto_t,
            "escalate": esc_t,
            "source": "learned from out-of-fold score percentiles (p90 / p50) in train.py",
        },
        "cv": {
            "roc_auc": float(roc_auc_score(y, oof)),
            "pr_auc": float(average_precision_score(y, oof)),
            "brier": float(brier_score_loss(y, oof)),
            "at_operating_point": _point_metrics(y, oof, auto_t),
            "roc_curve": roc_points,
            "pr_curve": pr_points,
            "calibration": _calibration(y, oof),
            "score_distribution": _score_distribution(y, oof),
            "threshold_sweep": _threshold_sweep(y, oof, meta, esc_t),
            "per_reason": _per_reason(y, oof, meta, auto_t),
            "baseline_precision": float(y.mean()),
        },
        "holdout": {
            "n": int(len(y_te)),
            "split": "stratified 80/20, single split",
            "roc_auc": float(roc_auc_score(y_te, holdout_scores)),
            "pr_auc": float(average_precision_score(y_te, holdout_scores)),
            "brier": float(brier_score_loss(y_te, holdout_scores)),
            "at_operating_point": _point_metrics(y_te, holdout_scores, auto_t),
        },
        "feature_importance": _permutation_importance(X, y, cv),
        "limitations": [
            "Training data is synthetic: real UPI transaction and delivery rows wrapped in "
            "generated dispute labels. Metrics measure the pipeline, not live merchant traffic.",
            "duplicate_charge and unauthorized_transaction carry near-zero positive labels by "
            "design (matching the published fraud base rate), so their per-reason metrics are "
            "reported but not meaningful.",
            f"n = {len(y)}. Confidence intervals on any single per-reason number are wide.",
            "The vlm_score feature comes from one LLM provider; a provider swap shifts the input "
            "distribution and the calibrator would need a retrain.",
        ],
    }


def main():
    metrics = compute()
    os.makedirs(os.path.dirname(METRICS_OUT), exist_ok=True)
    with open(METRICS_OUT, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    cvm = metrics["cv"]
    op = cvm["at_operating_point"]
    print(f"n={metrics['dataset']['n']} positive_rate={metrics['dataset']['positive_rate']:.3f}")
    print(f"CV ROC-AUC {cvm['roc_auc']:.3f}  PR-AUC {cvm['pr_auc']:.3f}  Brier {cvm['brier']:.3f}")
    print(
        f"@auto_resolve={op['threshold']:.3f}  P {op['precision']:.3f}  R {op['recall']:.3f}  "
        f"F1 {op['f1']:.3f}  FP {op['fp']}  FN {op['fn']}"
    )
    print(f"Holdout ROC-AUC {metrics['holdout']['roc_auc']:.3f} (n={metrics['holdout']['n']})")
    print(f"Saved -> {METRICS_OUT}")


if __name__ == "__main__":
    main()
