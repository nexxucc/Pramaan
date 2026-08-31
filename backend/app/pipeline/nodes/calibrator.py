from app.pipeline.state import PipelineState
from app.calibrator.model import predict


def calibrator(state: PipelineState) -> PipelineState:
    score = predict(
        vlm_score=state["vlm_validity_score"],
        postcheck_passed=state["postcheck_passed"],
        bundle=state["evidence_bundle"],
    )
    state["calibrated_score"] = score
    return state
