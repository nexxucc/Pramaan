import os
from dotenv import load_dotenv

load_dotenv()

DB_URL = "sqlite:///./pramaan.db"

LLM_MODEL = os.getenv("LLM_MODEL", "groq/llama-3.3-70b-versatile")

_raw_keys = os.getenv("LLM_API_KEYS", "")
LLM_API_KEYS = [k.strip() for k in _raw_keys.split(",") if k.strip()]
if not LLM_API_KEYS:
    single = os.getenv("LLM_API_KEY", "")
    if single:
        LLM_API_KEYS = [k.strip() for k in single.split(",") if k.strip()]