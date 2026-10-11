"""Loads backend/.env before anything reads os.getenv (keys, model name, thresholds)."""
from pathlib import Path

_env = Path(__file__).resolve().parent.parent / ".env"
try:
    from dotenv import load_dotenv
    load_dotenv(_env)
except ImportError:
    if _env.exists():
        print("[warning] .env found but python-dotenv is not installed. Run: pip install -r requirements.txt")
