from app.pipeline.state import PipelineState


def compliance_postcheck(state: PipelineState) -> PipelineState:
    bundle_text = str(state["evidence_bundle"])
    citations = state.get("vlm_citations", [])
    violations = [c for c in citations if c not in bundle_text]
    state["postcheck_violations"] = violations
    state["postcheck_passed"] = len(violations) == 0
    return state
