from app.llm.client import propose_evidence_review
import json
import sys
sys.path.insert(0, ".")


bundle = {
    "dispute_id": "check-1",
    "reason_code": "item_not_received",
    "transaction": {"transaction_id": "TXN123", "amount": 500},
    "delivery": {"delivery_status": "delivered", "delayed": "no"},
    "communication": [],
}

out = propose_evidence_review(bundle)
print("citations:", out.citations)
print("validity_score:", out.validity_score)
