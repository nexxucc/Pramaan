import json
import time
import litellm
from litellm import completion
from app.core.config import LLM_MODEL, LLM_API_KEYS
from app.llm.schemas import ProposalOutput

PROMPT = """You are a dispute evidence auditor. Given this evidence bundle, return ONLY JSON:
{{"validity_score": float 0-1, "draft_response": string, "citations": [string]}}

Each citation MUST be a bare dotted path into the evidence bundle above, e.g.
"delivery.delivery_status" or "communication[0]". Do NOT append the value
(no "= delivered", no ": delivered") and do NOT paraphrase the field name.

Evidence bundle:
{bundle}
"""

MAX_ATTEMPTS_PER_KEY = 2

if not LLM_API_KEYS:
    raise RuntimeError("No LLM_API_KEYS or LLM_API_KEY set in .env")

_key_cycle_idx = 0


def _current_key():
    return LLM_API_KEYS[_key_cycle_idx % len(LLM_API_KEYS)]


def _rotate_key():
    global _key_cycle_idx
    old = _key_cycle_idx % len(LLM_API_KEYS)
    _key_cycle_idx += 1
    new = _key_cycle_idx % len(LLM_API_KEYS)
    print(f"Rotating key: index {old} -> {new} (of {len(LLM_API_KEYS)} keys)")


def _is_rate_limit_error(e: Exception) -> bool:
    if isinstance(e, litellm.RateLimitError):
        return True
    msg = str(e).lower()
    return any(s in msg for s in ["429", "rate_limit", "rate limit", "quota", "resource_exhausted"])


def propose_evidence_review(bundle: dict) -> ProposalOutput:
    total_keys = len(LLM_API_KEYS)
    keys_tried_this_call = 0
    last_err = None

    while keys_tried_this_call <= total_keys:
        key = _current_key()
        for attempt in range(MAX_ATTEMPTS_PER_KEY):
            try:
                # model is passed as-is, e.g. "groq/llama-3.3-70b-versatile"
                # litellm parses the provider prefix itself -- do NOT also pass custom_llm_provider,
                # that double-specifies provider and can break model resolution.
                resp = completion(
                    model=LLM_MODEL,
                    api_key=key,
                    messages=[{"role": "user", "content": PROMPT.format(bundle=json.dumps(bundle))}],
                )
                raw = resp["choices"][0]["message"]["content"]
                raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                data = json.loads(raw)
                return ProposalOutput(**data)
            except Exception as e:
                last_err = e
                if _is_rate_limit_error(e):
                    print(f"Key exhausted/rate-limited: {e}")
                    break
                wait = 2 ** attempt
                print(f"LLM call failed (attempt {attempt+1}/{MAX_ATTEMPTS_PER_KEY}) on current key: {e}. Retrying in {wait}s.")
                time.sleep(wait)
        else:
            pass

        _rotate_key()
        keys_tried_this_call += 1

    raise RuntimeError(f"All {total_keys} keys exhausted or failing. Last error: {last_err}")