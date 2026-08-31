import uuid
from fastapi import APIRouter
from app.pipeline.graph import build_graph

router = APIRouter()
graph = build_graph()


@router.post("/webhook/dispute")
def receive_dispute(payload: dict):
    case_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": case_id}}
    result = graph.invoke({"case_id": case_id, "raw_payload": payload}, config=config)
    return {"case_id": case_id, "decision": result.get("decision"), "state": result}


@router.get("/cases/{case_id}")
def get_case(case_id: str):
    config = {"configurable": {"thread_id": case_id}}
    state = graph.get_state(config)
    return state.values if state else {"error": "not found"}
