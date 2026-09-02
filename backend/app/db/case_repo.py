from app.db.session import SessionLocal
from app.db.models import Case


def upsert_case(case_id: str, result: dict):
    db = SessionLocal()
    try:
        case = db.get(Case, case_id)
        if case is None:
            case = Case(id=case_id)
        case.reason_code = result.get("evidence_bundle", {}).get("reason_code")
        case.status = result.get("decision") or "pending"
        case.validity_score = result.get("vlm_validity_score")
        case.calibrated_score = result.get("calibrated_score")
        case.decision = result.get("decision")
        case.evidence_bundle = result.get("evidence_bundle")
        db.merge(case)
        db.commit()
    finally:
        db.close()