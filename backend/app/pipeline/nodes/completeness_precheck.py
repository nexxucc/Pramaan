from app.pipeline.state import PipelineState

DEFAULT_REQUIRED_FIELDS = ["transaction", "delivery"]

REQUIRED_FIELDS_BY_REASON = {
    "item_not_received": ["transaction", "delivery"],
    "not_as_described": ["transaction", "delivery", "communication"],
    "duplicate_charge": ["transaction"],
    "unauthorized_transaction": ["transaction"],
    "defective_product": ["transaction", "delivery", "communication"],
}


def completeness_precheck(state: PipelineState) -> PipelineState:
    bundle = state["evidence_bundle"]
    required = REQUIRED_FIELDS_BY_REASON.get(bundle.get("reason_code") or "", DEFAULT_REQUIRED_FIELDS)
    missing = [f for f in required if not bundle.get(f)]
    state["precheck_missing"] = missing
    state["precheck_passed"] = len(missing) == 0
    return state


def route_after_precheck(state: PipelineState) -> str:
    return "vlm_propose" if state["precheck_passed"] else "request_evidence_exit"
