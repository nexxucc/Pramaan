from app.pipeline.state import PipelineState
from app.calibrator.model import predict


def calibrator(state: PipelineState) -> PipelineState:
    score = predict(
        vlm_score=state["vlm_validity_score"],
        postcheck_passed=state["postcheck_passed"],
        citations_count=len(state.get("vlm_citations", [])),
        reason_code=state["evidence_bundle"]["reason_code"],
    )
    state["calibrated_score"] = score
    return state
