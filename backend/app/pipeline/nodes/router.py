from app.pipeline.state import PipelineState

AUTO_RESOLVE_THRESHOLD = 0.8
ESCALATE_THRESHOLD = 0.4


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
