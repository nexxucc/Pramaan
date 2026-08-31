from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver

from app.pipeline.state import PipelineState
from app.pipeline.nodes.webhook_trigger import webhook_trigger
from app.pipeline.nodes.standardize_bundle import standardize_bundle
from app.pipeline.nodes.completeness_precheck import completeness_precheck, route_after_precheck
from app.pipeline.nodes.vlm_propose import vlm_propose
from app.pipeline.nodes.compliance_postcheck import compliance_postcheck
from app.pipeline.nodes.calibrator import calibrator
from app.pipeline.nodes.router import router

import sqlite3


def request_evidence_exit(state: PipelineState) -> PipelineState:
    state["decision"] = "request_evidence"
    return state


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
    g.add_edge("router", END)
    g.add_edge("request_evidence_exit", END)

    conn = sqlite3.connect("./pramaan_checkpoints.db", check_same_thread=False)
    checkpointer = SqliteSaver(conn)
    return g.compile(checkpointer=checkpointer)


# NOTE: "escalate" decision from router is terminal here.
# TODO day 2: replace router END edge with interrupt() for the escalate path
# so a human can act, then resume via graph.invoke(None, config) with same thread_id.
