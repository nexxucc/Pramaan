import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

raw = os.getenv("LLM_API_KEYS", "") or os.getenv("LLM_API_KEY", "")
keys = [k.strip() for k in raw.split(",") if k.strip()]
if not keys:
    print("No keys found in LLM_API_KEYS/LLM_API_KEY", file=sys.stderr)
    sys.exit(2)

k = keys[0]
headers = {"Authorization": f"Bearer {k}"}
url = "https://api.groq.com/openai/v1/models"

try:
    r = requests.get(url, headers=headers, timeout=15)
    print(r.status_code)
    try:
        print(r.json())
    except Exception:
        print(r.text[:1000])
except Exception as e:
    print("Request failed:", e, file=sys.stderr)
    sys.exit(1)
