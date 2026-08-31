from app.pipeline.state import PipelineState
from app.llm.client import propose_evidence_review


def vlm_propose(state: PipelineState) -> PipelineState:
    out = propose_evidence_review(state["evidence_bundle"])
    state["vlm_validity_score"] = out.validity_score
    state["vlm_draft_response"] = out.draft_response
    state["vlm_citations"] = out.citations
    return state
