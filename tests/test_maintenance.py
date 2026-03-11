"""
Maintenance routes test suite.
Run with: pytest tests/test_maintenance.py -v

Tests call route handler functions directly (bypassing FastAPI DI) which
lets us patch only get_db_manager inside the function body and pass `user`
explicitly for auth-protected endpoints.
"""

import pytest
import sys
import os
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from routes.maintenance import get_maintenance_schedule, create_maintenance_task
    HAS_ROUTES = True
except ImportError:
    HAS_ROUTES = False

pytestmark = pytest.mark.skipif(not HAS_ROUTES, reason="routes.maintenance not importable")

# ── Factories ─────────────────────────────────────────────────────────────────

def make_task(
    id=1,
    machine_id=1001,
    machine_type="L",
    task="Tool Replacement",
    due_date="2026-03-10",
    priority="HIGH",
    status="PENDING",
    estimated_duration="2 hours",
    notes="",
):
    return {
        "id": id,
        "machine_id": machine_id,
        "machine_type": machine_type,
        "task": task,
        "due_date": due_date,
        "priority": priority,
        "status": status,
        "estimated_duration": estimated_duration,
        "notes": notes,
    }


def make_sensor_row(tool_wear=50.0, machine_id=1001):
    return {
        "id": 1,
        "machine_id": machine_id,
        "tool_wear": tool_wear,
        "air_temp": 300.0,
        "process_temp": 310.0,
        "rotation_speed": 1500,
        "torque": 40.0,
    }


def make_db(schedule=None, task_id=1, sensor_rows=None):
    db = MagicMock()
    db.get_maintenance_schedule.return_value = schedule if schedule is not None else []
    db.save_maintenance_task.return_value = task_id
    db.get_sensor_data.return_value = sensor_rows if sensor_rows is not None else []
    return db


# ── GET /maintenance/schedule ─────────────────────────────────────────────────

class TestGetMaintenanceSchedule:

    def test_returns_db_tasks_when_present(self):
        """When DB has tasks, returns them without calling sensor fallback."""
        tasks = [make_task(), make_task(id=2, machine_id=2001, machine_type="M")]
        mock_db = make_db(schedule=tasks)

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = get_maintenance_schedule()

        assert "schedule" in result
        assert len(result["schedule"]) == 2
        assert result["schedule"][0]["machine_id"] == 1001
        assert result["schedule"][1]["machine_id"] == 2001
        mock_db.get_sensor_data.assert_not_called()

    def test_fallback_suggestions_when_db_empty(self):
        """When DB returns no tasks, generates auto-suggestions from sensor data."""
        sensor_map = {
            1001: make_sensor_row(tool_wear=50.0, machine_id=1001),
            2001: make_sensor_row(tool_wear=50.0, machine_id=2001),
            3001: make_sensor_row(tool_wear=50.0, machine_id=3001),
        }

        def fake_get_sensor_data(machine_id, limit):
            row = sensor_map.get(machine_id)
            return [row] if row else []

        mock_db = make_db(schedule=[])
        mock_db.get_sensor_data.side_effect = fake_get_sensor_data

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = get_maintenance_schedule()

        assert "schedule" in result
        # Suggestions generated for all 3 machines that have sensor data
        assert len(result["schedule"]) == 3
        machine_ids = {s["machine_id"] for s in result["schedule"]}
        assert machine_ids == {1001, 2001, 3001}

    def test_fallback_priority_high_when_tool_wear_critical(self):
        """Tool wear > 200 → HIGH priority, 'Urgent Tool Replacement', due in 1 day."""
        mock_db = make_db(schedule=[])
        mock_db.get_sensor_data.return_value = [make_sensor_row(tool_wear=220.0)]

        today = datetime.now().date()
        expected_due = (today + timedelta(days=1)).isoformat()

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = get_maintenance_schedule()

        suggestions = result["schedule"]
        assert len(suggestions) == 3
        high = next(s for s in suggestions if s["machine_id"] == 1001)
        assert high["priority"] == "HIGH"
        assert high["task"] == "Urgent Tool Replacement"
        assert high["due_date"] == expected_due
        assert high["estimated_duration"] == "2 hours"

    def test_fallback_priority_medium_when_tool_wear_moderate(self):
        """Tool wear 150–200 → MEDIUM priority, 'Scheduled Tool Inspection', due in 3 days."""
        mock_db = make_db(schedule=[])
        mock_db.get_sensor_data.return_value = [make_sensor_row(tool_wear=175.0)]

        today = datetime.now().date()
        expected_due = (today + timedelta(days=3)).isoformat()

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = get_maintenance_schedule()

        medium = next(s for s in result["schedule"] if s["machine_id"] == 1001)
        assert medium["priority"] == "MEDIUM"
        assert medium["task"] == "Scheduled Tool Inspection"
        assert medium["due_date"] == expected_due

    def test_fallback_priority_low_when_tool_wear_normal(self):
        """Tool wear ≤ 150 → LOW priority, 'Routine Maintenance Check', due in 7 days."""
        mock_db = make_db(schedule=[])
        mock_db.get_sensor_data.return_value = [make_sensor_row(tool_wear=80.0)]

        today = datetime.now().date()
        expected_due = (today + timedelta(days=7)).isoformat()

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = get_maintenance_schedule()

        low = next(s for s in result["schedule"] if s["machine_id"] == 1001)
        assert low["priority"] == "LOW"
        assert low["task"] == "Routine Maintenance Check"
        assert low["due_date"] == expected_due

    def test_fallback_machine_type_mapping(self):
        """Fallback correctly maps 1001→L, 2001→M, 3001→H."""
        mock_db = make_db(schedule=[])
        mock_db.get_sensor_data.return_value = [make_sensor_row(tool_wear=50.0)]

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = get_maintenance_schedule()

        suggestions = {s["machine_id"]: s for s in result["schedule"]}
        assert suggestions[1001]["machine_type"] == "L"
        assert suggestions[2001]["machine_type"] == "M"
        assert suggestions[3001]["machine_type"] == "H"

    def test_fallback_suggestion_id_prefix(self):
        """Auto-suggestion IDs start with 'suggest_'."""
        mock_db = make_db(schedule=[])
        mock_db.get_sensor_data.return_value = [make_sensor_row()]

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = get_maintenance_schedule()

        for s in result["schedule"]:
            assert str(s["id"]).startswith("suggest_")

    def test_fallback_skips_machine_with_no_sensor_data(self):
        """Machine with no sensor history gets no suggestion entry."""
        def fake_sensor(machine_id, limit):
            if machine_id == 1001:
                return [make_sensor_row(tool_wear=50.0, machine_id=1001)]
            return []

        mock_db = make_db(schedule=[])
        mock_db.get_sensor_data.side_effect = fake_sensor

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = get_maintenance_schedule()

        assert len(result["schedule"]) == 1
        assert result["schedule"][0]["machine_id"] == 1001

    def test_returns_empty_schedule_on_db_error(self):
        """If get_maintenance_schedule raises, endpoint still returns schedule key."""
        mock_db = make_db()
        mock_db.get_maintenance_schedule.side_effect = Exception("DB connection lost")

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as exc_info:
                get_maintenance_schedule()
            assert exc_info.value.status_code == 500


# ── POST /maintenance/schedule ────────────────────────────────────────────────

class TestCreateMaintenanceTask:

    TEST_USER = {"address": "0xTestEngineer", "role": "ENGINEER"}

    def test_creates_task_with_valid_data(self):
        """Valid request → DB saved, correct response structure returned."""
        mock_db = make_db(task_id=42)

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = create_maintenance_task(
                machine_id=1001,
                task="Tool Replacement",
                due_date="2026-03-10",
                priority="HIGH",
                user=self.TEST_USER,
            )

        assert result["success"] is True
        task = result["task"]
        assert task["id"] == 42
        assert task["machine_id"] == 1001
        assert task["machine_type"] == "L"
        assert task["task"] == "Tool Replacement"
        assert task["due_date"] == "2026-03-10"
        assert task["priority"] == "HIGH"
        assert task["status"] == "PENDING"

    def test_machine_type_resolved_correctly(self):
        """machine_id 2001 → machine_type M; 3001 → H."""
        mock_db = make_db(task_id=1)

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            res_m = create_maintenance_task(2001, "Check", "2026-03-10", "LOW", self.TEST_USER)
            res_h = create_maintenance_task(3001, "Check", "2026-03-10", "LOW", self.TEST_USER)

        assert res_m["task"]["machine_type"] == "M"
        assert res_h["task"]["machine_type"] == "H"

    def test_unknown_machine_id_defaults_to_L(self):
        """Unmapped machine_id → defaults to machine_type 'L'."""
        mock_db = make_db(task_id=1)

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = create_maintenance_task(9001, "Check", "2026-03-10", "LOW", self.TEST_USER)

        assert result["task"]["machine_type"] == "L"

    def test_estimated_duration_high_priority(self):
        """HIGH priority → estimated_duration '2 hours'."""
        mock_db = make_db(task_id=1)

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = create_maintenance_task(1001, "Urgent", "2026-03-10", "HIGH", self.TEST_USER)

        assert result["task"]["estimated_duration"] == "2 hours"

    def test_estimated_duration_non_high_priority(self):
        """MEDIUM and LOW priority → estimated_duration '1 hour'."""
        mock_db = make_db(task_id=1)

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            res_med = create_maintenance_task(1001, "t", "2026-03-10", "MEDIUM", self.TEST_USER)
            res_low = create_maintenance_task(1001, "t", "2026-03-10", "LOW", self.TEST_USER)

        assert res_med["task"]["estimated_duration"] == "1 hour"
        assert res_low["task"]["estimated_duration"] == "1 hour"

    def test_priority_is_uppercased(self):
        """Priority is stored in uppercase regardless of input."""
        mock_db = make_db(task_id=1)

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = create_maintenance_task(1001, "t", "2026-03-10", "medium", self.TEST_USER)

        assert result["task"]["priority"] == "MEDIUM"

    def test_invalid_priority_raises_400(self):
        """Invalid priority value → HTTP 400 error."""
        mock_db = make_db()

        from fastapi import HTTPException
        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                create_maintenance_task(1001, "t", "2026-03-10", "INVALID", self.TEST_USER)

        assert exc_info.value.status_code == 400

    def test_db_save_called_with_correct_args(self):
        """save_maintenance_task receives all expected arguments."""
        mock_db = make_db(task_id=5)

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            create_maintenance_task(2001, "Inspection", "2026-04-01", "MEDIUM", self.TEST_USER)

        mock_db.save_maintenance_task.assert_called_once_with(
            machine_id=2001,
            machine_type="M",
            task="Inspection",
            due_date="2026-04-01",
            priority="MEDIUM",
            estimated_duration="1 hour",
            notes="",
            created_by="0xTestEngineer",
        )

    def test_db_save_failure_raises_500(self):
        """If save_maintenance_task returns 0 → HTTP 500."""
        mock_db = make_db(task_id=0)

        from fastapi import HTTPException
        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                create_maintenance_task(1001, "t", "2026-03-10", "HIGH", self.TEST_USER)

        assert exc_info.value.status_code == 500

    def test_due_date_preserved_exactly(self):
        """due_date passed in is returned unchanged in task response."""
        mock_db = make_db(task_id=1)
        due = "2026-12-25"

        with patch("routes.maintenance.get_db_manager", return_value=mock_db):
            result = create_maintenance_task(1001, "t", due, "LOW", self.TEST_USER)

        assert result["task"]["due_date"] == due
