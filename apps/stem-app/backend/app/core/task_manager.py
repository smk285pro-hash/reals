from __future__ import annotations

import threading
from typing import Any, Dict, Optional

from app.core.schemas import TaskState


class TaskManager:
    """Thread-safe in-memory task manager for tracking background audio analysis jobs."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tasks: Dict[str, TaskState] = {}
        self._results: Dict[str, Dict[str, Any]] = {}

    def create(self, task_id: str) -> TaskState:
        with self._lock:
            state = TaskState(
                task_id=task_id,
                status="QUEUED",
                stage="Initialized",
                percent=0,
                error=None,
            )
            self._tasks[task_id] = state
            return state.model_copy()

    def get(self, task_id: str) -> Optional[TaskState]:
        with self._lock:
            state = self._tasks.get(task_id)
            return state.model_copy() if state is not None else None

    def update(self, task_id: str, **fields: Any) -> Optional[TaskState]:
        with self._lock:
            state = self._tasks.get(task_id)
            if state is None:
                return None
            updated_data = state.model_dump()
            updated_data.update(fields)
            new_state = TaskState(**updated_data)
            self._tasks[task_id] = new_state
            return new_state.model_copy()

    def set_failed(self, task_id: str, err: str) -> Optional[TaskState]:
        return self.update(task_id, status="FAILED", error=err, stage="Failed")

    def attach_result(self, task_id: str, result: Dict[str, Any]) -> None:
        with self._lock:
            self._results[task_id] = result

    def get_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._results.get(task_id)

    def delete(self, task_id: str) -> None:
        with self._lock:
            self._tasks.pop(task_id, None)
            self._results.pop(task_id, None)


TASK_MANAGER: TaskManager = TaskManager()
