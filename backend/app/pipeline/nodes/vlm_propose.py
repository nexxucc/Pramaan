from app.pipeline.state import PipelineState
from app.llm.client import propose_evidence_review


def vlm_propose(state: PipelineState) -> PipelineState:
    try:
        out = propose_evidence_review(state["evidence_bundle"])
    except Exception as e:
        # All keys exhausted / provider down -- degrade to lowest confidence
        # instead of a raw 500, so the case still lands in the audit trail
        # and routes (calibrator + router run on a 0.0 score, no citations).
        state["vlm_validity_score"] = 0.0
        state["vlm_draft_response"] = ""
        state["vlm_citations"] = []
        state["vlm_error"] = str(e)
        return state

    state["vlm_validity_score"] = out.validity_score
    state["vlm_draft_response"] = out.draft_response
    state["vlm_citations"] = out.citations
    return state
