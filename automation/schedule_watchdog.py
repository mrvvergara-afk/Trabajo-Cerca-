"""Liveness guard for the 4x/day Motor D schedule and hourly Motor A schedule.

The existing morning guard only looks once, at 07:45/09:15. If GitHub skips or
delays the 18:15 D invocation, the heartbeat can be many hours old while every
workflow run still looks green. This guard is deliberately read-only: it emits
a machine-readable state for a scheduled workflow to dispatch a recovery run.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

DEFAULT = Path("automation/motor_d_discovery/producer_heartbeat.json")


def age_hours(stamp: str | None, now: datetime) -> float | None:
    if not isinstance(stamp, str):
        return None
    try:
        value = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if value.tzinfo is None:
        return None
    return (now - value.astimezone(timezone.utc)).total_seconds() / 3600


def assess(heartbeat: dict, now: datetime | None = None, max_age_hours: float = 5.0) -> dict:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("watchdog_clock_requires_timezone")
    stamp = heartbeat.get("scan_completed_at") if isinstance(heartbeat, dict) else None
    age = age_hours(stamp, now)
    stale = age is None or age > max_age_hours
    return {
        "schema_version": 1,
        "checked_at": now.isoformat(),
        "heartbeat_at": stamp,
        "age_hours": None if age is None else round(age, 2),
        "max_age_hours": max_age_hours,
        "status": "STALE" if stale else "OK",
        "action": "dispatch_motor_d" if stale else "none",
        "missing_communes": heartbeat.get("missing_communes") if isinstance(heartbeat, dict) else None,
        "sources_total": heartbeat.get("sources_total") if isinstance(heartbeat, dict) else None,
        "sources_accessible": heartbeat.get("sources_accessible") if isinstance(heartbeat, dict) else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--heartbeat", type=Path, default=DEFAULT)
    parser.add_argument("--max-age-hours", type=float, default=5.0)
    parser.add_argument("--output", type=Path, default=Path("output/schedule_watchdog.json"))
    args = parser.parse_args()
    heartbeat = json.loads(args.heartbeat.read_text(encoding="utf-8")) if args.heartbeat.exists() else {}
    result = assess(heartbeat, max_age_hours=args.max_age_hours)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    # The workflow decides the recovery action from `status`; a stale heartbeat
    # is operational data, not a Python failure that should skip the next step.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())