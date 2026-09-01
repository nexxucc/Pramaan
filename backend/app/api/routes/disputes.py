import uuid
import csv
import json
import os
import numpy as np
from fastapi import APIRouter
from app.pipeline.graph import build_graph
from app.calibrator.explain import explain_case, REASON_CODES

router = APIRouter()
graph = build_graph()

CASES_PATH = os.path.join(os.path.dirname(
    __file__), "..", "..", "..", "..", "data", "synthetic", "cases_with_vlm.csv")
_background = None


def _get_background():
    global _background
    if _background is None:
        rows = []
        with open(CASES_PATH, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))

        def featurize(row):
            vlm_score = float(row["vlm_validity_score"])
            postcheck_passed = 1 if row["postcheck_passed"] in (
                "True", "1", "true") else 0
            citations_count = int(row["citations_count"])
            reason_onehot = [1 if row["reason_code"]
                             == rc else 0 for rc in REASON_CODES]
            return [vlm_score, postcheck_passed, citations_count] + reason_onehot

        X = np.array([featurize(r) for r in rows])
        n = min(30, len(X))
        _background = X[np.random.choice(len(X), n, replace=False)]
    return _background


@router.post("/webhook/dispute")
def receive_dispute(payload: dict):
    case_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": case_id}}
    result = graph.invoke(
        {"case_id": case_id, "raw_payload": payload}, config=config)
    return {"case_id": case_id, "decision": result.get("decision"), "state": result}


@router.get("/cases/{case_id}")
def get_case(case_id: str):
    config = {"configurable": {"thread_id": case_id}}
    state = graph.get_state(config)
    return state.values if state else {"error": "not found"}


@router.get("/cases/{case_id}/explain")
def explain(case_id: str):
    config = {"configurable": {"thread_id": case_id}}
    state = graph.get_state(config)
    if not state or not state.values:
        return {"error": "not found"}

    v = state.values
    result = explain_case(
        vlm_score=v["vlm_validity_score"],
        postcheck_passed=v["postcheck_passed"],
        citations_count=len(v.get("vlm_citations", [])),
        reason_code=v["evidence_bundle"]["reason_code"],
        background=_get_background(),
    )
    return result


@router.get("/cases")
def list_cases():
    # TODO: query DB Case table once audit writes are added
    return {"note": "stub — wire to DB in Day 2"}
