import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Where the database, tablet photos and prescriptions live. In production point DATA_DIR at a persistent disk.
DATA_DIR = Path(os.getenv("DATA_DIR") or Path(__file__).resolve().parent.parent)
DATA_DIR.mkdir(parents=True, exist_ok=True)


def normalize_db_url(url: str) -> str:
    """Hosts hand out postgres:// or postgresql://. SQLAlchemy needs the driver name in the URL."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    return url


DATABASE_URL = normalize_db_url(os.getenv("DATABASE_URL") or f"sqlite:///{(DATA_DIR / 'caredose.db').as_posix()}")
_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(DATABASE_URL, pool_pre_ping=True, **({"connect_args": {"check_same_thread": False}} if _sqlite else {}))
SessionLocal = sessionmaker(bind=engine, autoflush=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
