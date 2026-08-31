import os
from dotenv import load_dotenv

load_dotenv()

DB_URL = "sqlite:///./pramaan.db"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gemini/gemini-3.6-flash")
