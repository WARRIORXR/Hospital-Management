"""Count SQL statements emitted by the read-heavy dashboard endpoints.

Usage: python bench_queries.py
"""

import time
from statistics import mean

from sqlalchemy import event

from database import SessionLocal, engine
from main import get_admin_analytics, get_admin_overview, get_department_load, get_opd_status

counter = {"n": 0}


@event.listens_for(engine, "before_cursor_execute")
def _count(conn, cursor, statement, parameters, context, executemany):
    counter["n"] += 1


def measure(label, func, iterations=40):
    session = SessionLocal()
    try:
        # Warm up so connection setup and caches are not part of the sample.
        counter["n"] = 0
        func(db=session)
        warm_queries = counter["n"]

        durations = []
        for _ in range(iterations):
            started = time.perf_counter()
            func(db=session)
            durations.append((time.perf_counter() - started) * 1000)

        print(
            f"{label:<26} queries={warm_queries:>2}  "
            f"mean={mean(durations):6.2f} ms  max={max(durations):6.2f} ms"
        )
    finally:
        session.close()


if __name__ == "__main__":
    measure("GET /opds", get_opd_status)
    measure("GET /admin/department-load", get_department_load)
    measure("GET /admin/analytics", get_admin_analytics)
    measure("GET /admin/overview", get_admin_overview)
