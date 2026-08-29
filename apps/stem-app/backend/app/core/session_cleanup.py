"""TTL-based session cleanup for orphaned task directories.

Sessions become orphans when a user abandons the app mid-upload / mid-analysis
(page refresh, tab close, network drop): the client can no longer call
DELETE /api/session/{task_id}, so server-side storage grows forever.
This module scans the storage roots and removes task dirs whose newest file is
older than the configured TTL. Dirs whose names are not UUIDs (e.g. test data)
are left untouched, and tasks still QUEUED/RUNNING are skipped via a caller-
supplied `is_active` callback.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import time
from pathlib import Path
from typing import Callable, Optional, Set

logger = logging.getLogger(__name__)

_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

DEFAULT_TTL_HOURS = float(os.getenv("SESSION_TTL_HOURS", "24"))
DEFAULT_SWEEP_INTERVAL_MINUTES = float(os.getenv("SESSION_SWEEP_INTERVAL_MINUTES", "60"))


def _newest_mtime(paths: list[Path]) -> Optional[float]:
    """Newest modification time across the given directories (recursive)."""
    newest: Optional[float] = None
    for base in paths:
        if not base.exists():
            continue
        try:
            mtime = base.stat().st_mtime
            if newest is None or mtime > newest:
                newest = mtime
        except OSError:
            continue
        for root, _dirs, files in os.walk(base):
            for name in files:
                try:
                    mtime = os.stat(os.path.join(root, name)).st_mtime
                except OSError:
                    continue
                if newest is None or mtime > newest:
                    newest = mtime
    return newest


def sweep_stale_sessions(
    upload_dir: Path,
    stems_dir: Path,
    export_dir: Path,
    ttl_seconds: float,
    is_active: Optional[Callable[[str], bool]] = None,
) -> Set[str]:
    """Delete UUID-named task dirs idle for more than ttl_seconds.

    Args:
        is_active: returns True for tasks that must be preserved even if stale
            (e.g. currently QUEUED/RUNNING).

    Returns:
        The set of removed task ids.
    """
    now = time.time()
    roots = (upload_dir, stems_dir, export_dir)

    known_tasks: Set[str] = set()
    for root in roots:
        if not root.exists():
            continue
        try:
            children = list(root.iterdir())
        except OSError:
            continue
        for child in children:
            if child.is_dir() and _UUID_RE.match(child.name):
                known_tasks.add(child.name)

    removed: Set[str] = set()
    for task_id in sorted(known_tasks):
        if is_active is not None and is_active(task_id):
            continue

        newest = _newest_mtime([root / task_id for root in roots])
        if newest is not None and (now - newest) < ttl_seconds:
            continue

        for root in roots:
            target = root / task_id
            if target.exists():
                shutil.rmtree(target, ignore_errors=True)
        removed.add(task_id)

    if removed:
        logger.info("Session cleanup removed %d stale task(s): %s", len(removed), sorted(removed))
    return removed


def read_status_file(upload_dir: Path, task_id: str) -> Optional[str]:
    """Best-effort read of a task's status.json (Modal volume layout). Returns its status string."""
    status_file = upload_dir / task_id / "status.json"
    try:
        import json

        data = json.loads(status_file.read_text(encoding="utf-8"))
        status_value = data.get("status")
        return str(status_value) if status_value else None
    except Exception:
        return None
