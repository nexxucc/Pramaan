import json
from litellm import completion
from app.core.config import LLM_MODEL, GEMINI_API_KEY
from app.llm.schemas import ProposalOutput

PROMPT = """You are a dispute evidence auditor. Given this evidence bundle, return ONLY JSON:
{{"validity_score": float 0-1, "draft_response": string, "citations": [string]}}

Evidence bundle:
{bundle}
"""


def propose_evidence_review(bundle: dict) -> ProposalOutput:
    resp = completion(
        model=LLM_MODEL,
        api_key=GEMINI_API_KEY,
        messages=[{"role": "user", "content": PROMPT.format(bundle=json.dumps(bundle))}],
    )
    raw = resp["choices"][0]["message"]["content"]
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    data = json.loads(raw)
    return ProposalOutput(**data)
