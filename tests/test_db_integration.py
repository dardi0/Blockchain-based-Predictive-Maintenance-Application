import pytest
import os
import psycopg2
from database import PdMDatabaseManager, SensorData
from hybrid_storage_manager import LocalStorageManager
from config import DatabaseConfig
import time

# Mock environment variables for testing if needed, 
# but we want to test actual connection if possible.
# Assuming local postgres is available or we skip if not.

def is_postgres_available():
    try:
        conn = psycopg2.connect(
            dbname=DatabaseConfig.DB_NAME,
            user=DatabaseConfig.DB_USER,
            password=DatabaseConfig.DB_PASSWORD,
            host=DatabaseConfig.DB_HOST,
            port=DatabaseConfig.DB_PORT
        )
        conn.close()
        return True
    except:
        return False

@pytest.mark.skipif(not is_postgres_available(), reason="PostgreSQL not available")
class TestDBIntegration:
    @pytest.fixture
    def db_manager(self):
        manager = PdMDatabaseManager()
        # Clean up test data if needed? 
        # For now just return manager
        return manager

    @pytest.fixture
    def local_storage(self, db_manager):
        return LocalStorageManager(db_manager)

    def test_connection_and_initialization(self, db_manager):
        """Test connection pool and table creation"""
        conn = db_manager.get_connection()
        assert conn is not None
        
        with conn.cursor() as cursor:
            # Check if tables exist
            cursor.execute("SELECT to_regclass('public.sensor_data')")
            assert cursor.fetchone()[0] == 'sensor_data'
            
            cursor.execute("SELECT to_regclass('public.users')")
            assert cursor.fetchone()[0] == 'users'
            
        db_manager.return_connection(conn)

    def test_sensor_data_crud(self, db_manager):
        """Test insert and retrieval of sensor data"""
        data = SensorData(
            machine_id=9999,
            timestamp=int(time.time()),
            air_temp=300.0,
            process_temp=310.0,
            rotation_speed=1500,
            torque=40.0,
            tool_wear=5,
            machine_type="M",
            submitter="0xTestUser"
        )
        
        # Save
        data_dict = {
            'machine_id': data.machine_id,
            'timestamp': data.timestamp,
            'air_temp': data.air_temp,
            'process_temp': data.process_temp,
            'rotation_speed': data.rotation_speed,
            'torque': data.torque,
            'tool_wear': data.tool_wear,
            'machine_type': data.machine_type,
            'submitter': data.submitter
        }
        
        record_id = db_manager.save_sensor_data(data_dict)
        assert record_id > 0
        
        # Retrieve
        rows = db_manager.get_sensor_data(record_id=record_id)
        assert len(rows) == 1
        fetched = rows[0]
        assert fetched['machine_id'] == 9999
        assert fetched['air_temp'] == 300.0
        
        # Verify alias keys exist for backward compatibility
        assert 'air_temperature' in fetched
        assert fetched['air_temperature'] == 300.0

    def test_local_storage_wrapper(self, local_storage):
        """Test LocalStorageManager wrapper functionality"""
        data = SensorData(
            machine_id=8888,
            timestamp=int(time.time()),
            air_temp=305.0,
            process_temp=315.0,
            rotation_speed=1550,
            torque=42.0,
            tool_wear=2,
            machine_type="H",
            submitter="0xWrapperUser"
        )
        
        record_id = local_storage.store_sensor_data(data)
        assert record_id > 0
        
        # Test recent data
        recent = local_storage.get_recent_data(limit=5)
        ids = [r['id'] for r in recent]
        assert record_id in ids

if __name__ == "__main__":
    if is_postgres_available():
        print("✅ PostgreSQL connection successful.")
        # Manual run logic if needed
        m = PdMDatabaseManager()
        print("Initialized manager.")
    else:
        print("❌ PostgreSQL connection failed details in pytest.")
