import uuid
from datetime import datetime
from app.db.session import SessionLocal
from app.db.models import AuditLog


def write_audit(case_id: str, stage: str, input_data: dict, output_data: dict):
    db = SessionLocal()
    try:
        row = AuditLog(
            id=str(uuid.uuid4()),
            case_id=case_id,
            stage=stage,
            input_data=input_data,
            output_data=output_data,
            created_at=datetime.utcnow(),
        )
        db.add(row)
        db.commit()
    finally:
        db.close()