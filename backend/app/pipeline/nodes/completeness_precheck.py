from app.pipeline.state import PipelineState

REQUIRED_FIELDS = ["transaction", "delivery"]  # TODO: per reason_code


def completeness_precheck(state: PipelineState) -> PipelineState:
    bundle = state["evidence_bundle"]
    missing = [f for f in REQUIRED_FIELDS if not bundle.get(f)]
    state["precheck_missing"] = missing
    state["precheck_passed"] = len(missing) == 0
    return state


def route_after_precheck(state: PipelineState) -> str:
    return "vlm_propose" if state["precheck_passed"] else "request_evidence_exit"
