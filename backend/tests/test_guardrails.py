from app.pipeline.nodes.compliance_postcheck import _resolve_path, compliance_postcheck
from app.pipeline.nodes.completeness_precheck import completeness_precheck


BUNDLE = {
    "dispute_id": "d1",
    "reason_code": "item_not_received",
    "transaction": {"transaction_id": "TXN1", "amount": 500.0},
    "delivery": {"delivery_status": "delivered"},
    "communication": ["Customer says item never arrived."],
}


# --- _resolve_path: bare dotted paths (already worked before this fix) ---

def test_resolve_path_bare_dict_path_exists():
    assert _resolve_path(BUNDLE, "transaction.amount") is True


def test_resolve_path_bare_dict_path_missing():
    assert _resolve_path(BUNDLE, "transaction.nonexistent") is False


def test_resolve_path_top_level_key():
    assert _resolve_path(BUNDLE, "reason_code") is True


# --- _resolve_path: real Groq citation formats that were wrongly rejected ---

def test_resolve_path_with_equals_value_annotation():
    # real VLM output: "delivery.delivery_status = delivered"
    assert _resolve_path(BUNDLE, "delivery.delivery_status = delivered") is True


def test_resolve_path_with_colon_value_annotation():
    # real VLM output: "delivery.delivery_status: delivered"
    assert _resolve_path(BUNDLE, "delivery.delivery_status: delivered") is True


def test_resolve_path_list_index():
    # real VLM output: "communication[0]"
    assert _resolve_path(BUNDLE, "communication[0]") is True


def test_resolve_path_list_index_out_of_range_is_a_real_violation():
    assert _resolve_path(BUNDLE, "communication[5]") is False


def test_resolve_path_hallucinated_field_with_value_annotation_still_rejected():
    # the value-annotation stripping must not make hallucinated paths pass
    assert _resolve_path(BUNDLE, "delivery.tracking_number = ABC123") is False


# --- compliance_postcheck: end-to-end over the node, not just the helper ---

def test_compliance_postcheck_passes_valid_annotated_and_indexed_citations():
    state = {
        "evidence_bundle": BUNDLE,
        "vlm_citations": [
            "delivery.delivery_status = delivered",
            "communication[0]",
        ],
    }
    result = compliance_postcheck(state)
    assert result["postcheck_passed"] is True
    assert result["postcheck_violations"] == []


def test_compliance_postcheck_still_catches_real_hallucination():
    state = {
        "evidence_bundle": BUNDLE,
        "vlm_citations": ["delivery.tracking_number = ABC123"],
    }
    result = compliance_postcheck(state)
    assert result["postcheck_passed"] is False
    assert result["postcheck_violations"] == ["delivery.tracking_number = ABC123"]


# --- completeness_precheck: per-reason-code required fields ---

def test_duplicate_charge_only_requires_transaction():
    state = {
        "evidence_bundle": {
            "reason_code": "duplicate_charge",
            "transaction": {"transaction_id": "TXN1"},
            "delivery": {},
            "communication": [],
        }
    }
    result = completeness_precheck(state)
    assert result["precheck_passed"] is True


def test_not_as_described_requires_communication_too():
    state = {
        "evidence_bundle": {
            "reason_code": "not_as_described",
            "transaction": {"transaction_id": "TXN1"},
            "delivery": {"delivery_status": "delivered"},
            "communication": [],
        }
    }
    result = completeness_precheck(state)
    assert result["precheck_passed"] is False
    assert "communication" in result["precheck_missing"]


def test_unknown_reason_code_falls_back_to_default_required_fields():
    state = {
        "evidence_bundle": {
            "reason_code": "some_future_reason_code",
            "transaction": {"transaction_id": "TXN1"},
            "delivery": {},
            "communication": [],
        }
    }
    result = completeness_precheck(state)
    assert result["precheck_passed"] is False
    assert "delivery" in result["precheck_missing"]
