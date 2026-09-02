from app.db.session import SessionLocal
from app.db.models import Case

_HUMAN_ACTION_STATUS = {"approve": "approved", "reject": "rejected"}


def _status_for(result: dict) -> str:
    """Case status: the human's resume decision wins once made (approve/reject),
    otherwise it's the router's own decision (escalate/auto_resolve/request_evidence)."""
    human_decision = result.get("human_decision")
    if human_decision in _HUMAN_ACTION_STATUS:
        return _HUMAN_ACTION_STATUS[human_decision]
    return result.get("decision") or "pending"


def upsert_case(case_id: str, result: dict):
    db = SessionLocal()
    try:
        case = db.get(Case, case_id)
        if case is None:
            case = Case(id=case_id)
        case.reason_code = result.get("evidence_bundle", {}).get("reason_code")
        case.status = _status_for(result)
        case.validity_score = result.get("vlm_validity_score")
        case.calibrated_score = result.get("calibrated_score")
        case.decision = result.get("decision")
        case.evidence_bundle = result.get("evidence_bundle")
        db.merge(case)
        db.commit()
    finally:
        db.close()