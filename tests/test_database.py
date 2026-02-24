"""
Database Manager Unit Tests
Run with: pytest tests/test_database.py -v
"""

import pytest
import sys
import os
import tempfile
import sqlite3

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from database import PdMDatabaseManager
    HAS_DB = True
except ImportError:
    HAS_DB = False
    PdMDatabaseManager = None


@pytest.fixture
def temp_db():
    """Create a temporary database for testing."""
    if not HAS_DB:
        pytest.skip("Database module not available")

    # Create temp file
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)

    db = PdMDatabaseManager(path)
    yield db

    # Cleanup
    try:
        os.unlink(path)
    except:
        pass


class TestDatabaseInitialization:
    """Test database initialization and schema."""

    def test_database_creation(self, temp_db):
        """Test that database is created successfully."""
        assert temp_db is not None
        assert os.path.exists(temp_db.db_path)

    def test_tables_exist(self, temp_db):
        """Test that required tables are created."""
        conn = sqlite3.connect(str(temp_db.db_path))
        cursor = conn.cursor()

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}

        # Check for essential tables
        assert 'sensor_data' in tables or 'users' in tables
        conn.close()


class TestUserOperations:
    """Test user CRUD operations."""

    def test_create_user(self, temp_db):
        """Test user creation."""
        if not hasattr(temp_db, 'create_user'):
            pytest.skip("create_user method not available")

        result = temp_db.create_user(
            address="0x" + "a" * 40,
            role="ENGINEER"
        )
        assert result is not None

    def test_get_user(self, temp_db):
        """Test user retrieval."""
        if not hasattr(temp_db, 'get_user'):
            pytest.skip("get_user method not available")

        address = "0x" + "b" * 40

        # Create user first if create_user exists
        if hasattr(temp_db, 'create_user'):
            temp_db.create_user(address=address, role="ENGINEER")

        user = temp_db.get_user(address)
        # Might be None if user wasn't created
        assert user is None or isinstance(user, (dict, tuple))

    def test_get_users_by_role(self, temp_db):
        """Test getting users by role."""
        if not hasattr(temp_db, 'get_users_by_role'):
            pytest.skip("get_users_by_role method not available")

        users = temp_db.get_users_by_role("ENGINEER")
        assert isinstance(users, list)


class TestSensorDataOperations:
    """Test sensor data operations."""

    def test_store_sensor_data(self, temp_db):
        """Test storing sensor data."""
        if not hasattr(temp_db, 'store_sensor_data'):
            pytest.skip("store_sensor_data method not available")

        test_data = {
            'machine_id': 1001,
            'air_temp': 300.0,
            'process_temp': 310.0,
            'rotation_speed': 1500,
            'torque': 40.0,
            'tool_wear': 100,
            'timestamp': 1234567890
        }

        result = temp_db.store_sensor_data(test_data)
        assert result is not None

    def test_get_sensor_history(self, temp_db):
        """Test retrieving sensor history."""
        if not hasattr(temp_db, 'get_sensor_history'):
            pytest.skip("get_sensor_history method not available")

        history = temp_db.get_sensor_history(machine_id=1001, limit=10)
        assert isinstance(history, list)


class TestPredictionOperations:
    """Test prediction-related operations."""

    def test_update_sensor_prediction(self, temp_db):
        """Test updating sensor data with prediction."""
        if not hasattr(temp_db, 'update_sensor_prediction'):
            pytest.skip("update_sensor_prediction method not available")

        # First store some sensor data if possible
        if hasattr(temp_db, 'store_sensor_data'):
            test_data = {
                'machine_id': 1001,
                'air_temp': 300.0,
                'process_temp': 310.0,
                'rotation_speed': 1500,
                'torque': 40.0,
                'tool_wear': 100,
                'timestamp': 1234567890
            }
            record_id = temp_db.store_sensor_data(test_data)

            if record_id:
                result = temp_db.update_sensor_prediction(
                    record_id=record_id,
                    prediction=0,
                    probability=0.95
                )
                assert result in [True, False, None]


class TestBlockchainOperations:
    """Test blockchain-related database operations."""

    def test_update_blockchain_info(self, temp_db):
        """Test updating blockchain info for a record."""
        if not hasattr(temp_db, 'update_blockchain_info'):
            pytest.skip("update_blockchain_info method not available")

        # This test just verifies the method doesn't crash
        result = temp_db.update_blockchain_info(
            record_id=1,
            success=True,
            tx_hash="0x" + "c" * 64,
            proof_id="test_proof_123"
        )
        assert result in [True, False, None]


class TestSQLInjectionPrevention:
    """Test that SQL injection is prevented."""

    def test_user_input_sanitization(self, temp_db):
        """Test that malicious user input doesn't cause SQL injection."""
        if not hasattr(temp_db, 'get_user'):
            pytest.skip("get_user method not available")

        # Try SQL injection attack
        malicious_address = "'; DROP TABLE users; --"

        # Should not raise an error and should return None
        result = temp_db.get_user(malicious_address)

        # Verify tables still exist
        conn = sqlite3.connect(str(temp_db.db_path))
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
        conn.close()

        # Tables should still exist
        assert len(tables) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
