from app.pipeline.state import PipelineState


def _resolve_path(bundle: dict, path: str):
    """Resolve dotted path like 'delivery.status' against nested dict. Returns True if it exists."""
    parts = path.split(".")
    node = bundle
    for p in parts:
        if isinstance(node, dict) and p in node:
            node = node[p]
        else:
            return False
    return True


def compliance_postcheck(state: PipelineState) -> PipelineState:
    bundle = state["evidence_bundle"]
    citations = state.get("vlm_citations", [])
    violations = [c for c in citations if not _resolve_path(bundle, c)]
    state["postcheck_violations"] = violations
    state["postcheck_passed"] = len(violations) == 0
    return state
