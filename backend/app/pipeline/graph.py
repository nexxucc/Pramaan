from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import interrupt
import sqlite3

from app.pipeline.state import PipelineState
from app.pipeline.nodes.webhook_trigger import webhook_trigger
from app.pipeline.nodes.standardize_bundle import standardize_bundle
from app.pipeline.nodes.completeness_precheck import completeness_precheck, route_after_precheck
from app.pipeline.nodes.vlm_propose import vlm_propose
from app.pipeline.nodes.compliance_postcheck import compliance_postcheck
from app.pipeline.nodes.calibrator import calibrator
from app.pipeline.nodes.router import router


def request_evidence_exit(state: PipelineState) -> PipelineState:
    state["decision"] = "request_evidence"
    return state


def human_review(state: PipelineState) -> PipelineState:
    # Pauses graph execution here. Resume with:
    #   graph.invoke(Command(resume={"action": "approve"|"reject", "note": "..."}), config)
    # using the SAME thread_id used for the original invoke() call.
    human_input = interrupt({
        "case_id": state["case_id"],
        "reason_code": state["evidence_bundle"]["reason_code"],
        "calibrated_score": state["calibrated_score"],
        "vlm_draft_response": state["vlm_draft_response"],
        "message": "Escalated for human review. Resume with {'action': 'approve'|'reject', 'note': str}",
    })
    state["human_decision"] = human_input.get("action")
    state["human_note"] = human_input.get("note", "")
    return state


def route_after_router(state: PipelineState) -> str:
    return "human_review" if state["decision"] == "escalate" else "end"


def build_graph():
    g = StateGraph(PipelineState)

    g.add_node("webhook_trigger", webhook_trigger)
    g.add_node("standardize_bundle", standardize_bundle)
    g.add_node("completeness_precheck", completeness_precheck)
    g.add_node("vlm_propose", vlm_propose)
    g.add_node("compliance_postcheck", compliance_postcheck)
    g.add_node("calibrator", calibrator)
    g.add_node("router", router)
    g.add_node("request_evidence_exit", request_evidence_exit)
    g.add_node("human_review", human_review)

    g.set_entry_point("webhook_trigger")
    g.add_edge("webhook_trigger", "standardize_bundle")
    g.add_edge("standardize_bundle", "completeness_precheck")

    g.add_conditional_edges(
        "completeness_precheck",
        route_after_precheck,
        {"vlm_propose": "vlm_propose", "request_evidence_exit": "request_evidence_exit"},
    )

    g.add_edge("vlm_propose", "compliance_postcheck")
    g.add_edge("compliance_postcheck", "calibrator")
    g.add_edge("calibrator", "router")

    g.add_conditional_edges(
        "router",
        route_after_router,
        {"human_review": "human_review", "end": END},
    )

    g.add_edge("human_review", END)
    g.add_edge("request_evidence_exit", END)

    conn = sqlite3.connect("./pramaan_checkpoints.db", check_same_thread=False)
    checkpointer = SqliteSaver(conn)
    return g.compile(checkpointer=checkpointer)