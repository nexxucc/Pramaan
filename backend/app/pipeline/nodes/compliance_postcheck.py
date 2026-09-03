import re
from app.pipeline.state import PipelineState

# VLM citations come back as a bare path ("delivery.delivery_status"), a path
# annotated with the value it points to ("delivery.delivery_status = delivered"
# or "delivery.delivery_status: delivered"), or a path into a list
# ("communication[0]"). Only the path is checked for existence -- the
# annotated value is not verified against the bundle.
_VALUE_ANNOTATION = re.compile(r"\s*[:=]\s*.*$")
_PATH_SEGMENT = re.compile(r"[^.\[\]]+|\[\d+\]")


def _resolve_path(bundle: dict, path: str):
    """Resolve a citation path (dotted keys, optional [index], optional trailing
    ' = value'/': value' annotation) against the nested evidence bundle.
    Returns True only if every segment actually exists."""
    path = _VALUE_ANNOTATION.sub("", path)
    node = bundle
    for segment in _PATH_SEGMENT.findall(path):
        if segment.startswith("["):
            index = int(segment[1:-1])
            if not isinstance(node, list) or index >= len(node):
                return False
            node = node[index]
        else:
            if not isinstance(node, dict) or segment not in node:
                return False
            node = node[segment]
    return True


def compliance_postcheck(state: PipelineState) -> PipelineState:
    bundle = state["evidence_bundle"]
    citations = state.get("vlm_citations", [])
    violations = [c for c in citations if not _resolve_path(bundle, c)]
    state["postcheck_violations"] = violations
    state["postcheck_passed"] = len(violations) == 0
    return state
