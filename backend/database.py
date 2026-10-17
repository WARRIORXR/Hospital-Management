import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base


def _load_environment():
    env_path = Path(__file__).resolve().parent / ".env"
    if env_path.exists():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            if key and value and "*" not in value:
                os.environ.setdefault(key, value)


_load_environment()


def _postgres_driver_available():
    try:
        import psycopg2  # noqa: F401
        return True
    except ModuleNotFoundError:
        return False


def _get_database_url():
    candidate = os.getenv("DATABASE_URL", "").strip().strip('"').strip("'")
    if candidate and "*" not in candidate:
        if candidate.startswith(("postgresql://", "postgres://")) and not _postgres_driver_available():
            return f"sqlite:///{Path(__file__).resolve().parent / 'queueless.db'}"
        if candidate.startswith("postgres://"):
            candidate = f"postgresql+psycopg2://{candidate.removeprefix('postgres://')}"
        elif candidate.startswith("postgresql://"):
            candidate = f"postgresql+psycopg2://{candidate.removeprefix('postgresql://')}"
        return candidate

    db_path = Path(__file__).resolve().parent / "queueless.db"
    return f"sqlite:///{db_path}"


DATABASE_URL = _get_database_url()


engine_kwargs = {"future": True}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


Base = declarative_base()


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
