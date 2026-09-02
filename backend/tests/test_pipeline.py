import pytest
from app.pipeline.nodes import vlm_propose as vlm_propose_module


def test_vlm_propose_degrades_gracefully_when_llm_call_fails(monkeypatch):
    def _raise(bundle):
        raise RuntimeError("All 8 keys exhausted or failing. Last error: rate limited")

    monkeypatch.setattr(vlm_propose_module, "propose_evidence_review", _raise)

    state = {"evidence_bundle": {"reason_code": "item_not_received"}}
    result = vlm_propose_module.vlm_propose(state)

    assert result["vlm_validity_score"] == 0.0
    assert result["vlm_citations"] == []
    assert "rate limited" in result["vlm_error"]


def test_vlm_propose_passes_through_real_output_unchanged(monkeypatch):
    from app.llm.schemas import ProposalOutput

    def _succeed(bundle):
        return ProposalOutput(validity_score=0.7, draft_response="looks fine", citations=["transaction.amount"])

    monkeypatch.setattr(vlm_propose_module, "propose_evidence_review", _succeed)

    state = {"evidence_bundle": {"reason_code": "item_not_received"}}
    result = vlm_propose_module.vlm_propose(state)

    assert result["vlm_validity_score"] == 0.7
    assert result["vlm_citations"] == ["transaction.amount"]
    assert "vlm_error" not in result
