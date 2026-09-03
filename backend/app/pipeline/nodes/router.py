import json
import os
from app.pipeline.state import PipelineState

THRESHOLDS_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "calibrator", "artifacts", "thresholds.json")

# Fallback defaults, used only if train.py hasn't been run yet / thresholds.json missing.
AUTO_RESOLVE_THRESHOLD = 0.45
ESCALATE_THRESHOLD = 0.15

if os.path.exists(THRESHOLDS_PATH):
    with open(THRESHOLDS_PATH) as f:
        _t = json.load(f)
    AUTO_RESOLVE_THRESHOLD = _t["auto_resolve_threshold"]
    ESCALATE_THRESHOLD = _t["escalate_threshold"]
    print(f"Loaded auto-tuned thresholds: auto_resolve>={AUTO_RESOLVE_THRESHOLD:.3f}, escalate>={ESCALATE_THRESHOLD:.3f}")
else:
    print("thresholds.json not found, using fallback defaults. Run train.py to auto-tune.")


def router(state: PipelineState) -> PipelineState:
    score = state["calibrated_score"]
    if not state["postcheck_passed"]:
        state["decision"] = "escalate"
    elif score >= AUTO_RESOLVE_THRESHOLD:
        state["decision"] = "auto_resolve"
    elif score >= ESCALATE_THRESHOLD:
        state["decision"] = "escalate"
    else:
        state["decision"] = "request_evidence"
    return state