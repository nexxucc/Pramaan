from typing import TypedDict, Optional, Any


class PipelineState(TypedDict, total=False):
    case_id: str
    raw_payload: dict
    evidence_bundle: dict
    precheck_passed: bool
    precheck_missing: list
    vlm_validity_score: float
    vlm_draft_response: str
    vlm_citations: list
    postcheck_passed: bool
    postcheck_violations: list
    calibrated_score: float
    decision: str  # auto_resolve | escalate | request_evidence
