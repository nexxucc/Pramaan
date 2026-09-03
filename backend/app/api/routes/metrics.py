"""Read-only model-evaluation endpoints.

The numbers are produced by ``app.calibrator.evaluate`` and cached on disk as
``calibrator/artifacts/metrics.json``. Computing them takes a few seconds
(five fitted fold-models plus a permutation-importance pass), so the endpoint
serves the artifact and only recomputes when it is missing or when the caller
asks for it explicitly.
"""

import json
import os
import threading

from fastapi import APIRouter

from app.calibrator import evaluate

router = APIRouter()

_cache: dict | None = None

# A refresh fits five fold-models and runs a permutation pass, then rewrites
# the shared artifact. Two of those in flight at once burn CPU twice over and
# race on the same file, so recomputation is serialized and the artifact is
# written to a temp file and renamed into place.
_refresh_lock = threading.Lock()


def _read_cached() -> dict | None:
    global _cache
    if _cache is not None:
        return _cache
    if os.path.exists(evaluate.METRICS_OUT):
        with open(evaluate.METRICS_OUT, encoding="utf-8") as f:
            _cache = json.load(f)
        return _cache
    return None


def _load(refresh: bool = False) -> dict:
    global _cache
    if not refresh:
        cached = _read_cached()
        if cached is not None:
            return cached

    with _refresh_lock:
        # A concurrent caller may have finished the recompute while this one
        # waited; serve its result rather than repeating the work.
        if not refresh and _cache is not None:
            return _cache
        computed = evaluate.compute()
        os.makedirs(os.path.dirname(evaluate.METRICS_OUT), exist_ok=True)
        tmp = f"{evaluate.METRICS_OUT}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(computed, f, indent=2)
        os.replace(tmp, evaluate.METRICS_OUT)
        _cache = computed
        return _cache


@router.get("/metrics")
def get_metrics(refresh: bool = False):
    """Full evaluation report: headline scores, curves, threshold sweep,
    per-reason-code breakdown, feature importance and stated limitations.

    Pass ``?refresh=true`` to recompute from the dataset instead of serving
    the cached artifact.
    """
    return _load(refresh=refresh)


@router.get("/metrics/summary")
def get_metrics_summary():
    """Headline numbers only -- for callers that do not want the curve arrays."""
    m = _load()
    return {
        "generated_at": m["generated_at"],
        "dataset": m["dataset"],
        "thresholds": m["thresholds"],
        "cv": {
            "roc_auc": m["cv"]["roc_auc"],
            "pr_auc": m["cv"]["pr_auc"],
            "brier": m["cv"]["brier"],
            "at_operating_point": m["cv"]["at_operating_point"],
        },
        "holdout": m["holdout"],
    }
