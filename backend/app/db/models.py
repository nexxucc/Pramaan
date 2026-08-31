from sqlalchemy import Column, String, Float, JSON, DateTime
from datetime import datetime
from app.db.session import Base


class Case(Base):
    __tablename__ = "cases"
    id = Column(String, primary_key=True)
    reason_code = Column(String)
    status = Column(String, default="pending")
    validity_score = Column(Float, nullable=True)
    calibrated_score = Column(Float, nullable=True)
    decision = Column(String, nullable=True)  # auto_resolve | escalate | request_evidence
    evidence_bundle = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(String, primary_key=True)
    case_id = Column(String)
    stage = Column(String)
    input_data = Column(JSON)
    output_data = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
