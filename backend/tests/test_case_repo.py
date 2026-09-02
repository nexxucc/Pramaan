from app.db.case_repo import _status_for


def test_status_reflects_router_decision_when_no_human_action_yet():
    result = {"decision": "escalate"}
    assert _status_for(result) == "escalate"


def test_status_reflects_human_approval_after_resume():
    result = {"decision": "escalate", "human_decision": "approve"}
    assert _status_for(result) == "approved"


def test_status_reflects_human_rejection_after_resume():
    result = {"decision": "escalate", "human_decision": "reject"}
    assert _status_for(result) == "rejected"


def test_status_falls_back_to_pending_when_nothing_set():
    assert _status_for({}) == "pending"
