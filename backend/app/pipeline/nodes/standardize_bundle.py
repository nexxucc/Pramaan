from app.pipeline.state import PipelineState


def standardize_bundle(state: PipelineState) -> PipelineState:
    raw = state["raw_payload"]
    state["evidence_bundle"] = {
        "dispute_id": raw.get("dispute_id"),
        "reason_code": raw.get("reason_code"),
        "transaction": raw.get("transaction", {}),
        "delivery": raw.get("delivery", {}),
        "communication": raw.get("communication", []),
    }
    return state
