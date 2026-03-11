import psycopg2
from psycopg2 import pool, extras
import logging
import threading
import time
from typing import Optional
from config import DatabaseConfig

logger = logging.getLogger(__name__)

class DatabaseConnection:
    """Veritabanı bağlantı yönetimini sağlayan sınıf"""
    _pool = None
    _pool_lock = threading.Lock()

    def __init__(self):
        self._initialize_pool()
        self._initialize_database()

    def _initialize_pool(self):
        """Connection pool oluştur"""
        with DatabaseConnection._pool_lock:
            if DatabaseConnection._pool is None:
                try:
                    DatabaseConnection._pool = psycopg2.pool.SimpleConnectionPool(
                        1, 20,
                        user=DatabaseConfig.DB_USER,
                        password=DatabaseConfig.DB_PASSWORD,
                        host=DatabaseConfig.DB_HOST,
                        port=DatabaseConfig.DB_PORT,
                        database=DatabaseConfig.DB_NAME
                    )
                    logger.info("Connection pool created successfully")
                except Exception as e:
                    logger.error(f"Error creating connection pool: {e}")
                    DatabaseConnection._pool = None

    def get_connection(self):
        """Pool'dan bağlantı al"""
        if DatabaseConnection._pool:
            return DatabaseConnection._pool.getconn()
        return None

    def return_connection(self, conn):
        """Bağlantıyı pool'a geri ver"""
        if DatabaseConnection._pool and conn:
            DatabaseConnection._pool.putconn(conn)

    def _initialize_database(self):
        """Tabloları oluştur (PostgreSQL şeması)"""
        conn = self.get_connection()
        if not conn:
            return
            
        try:
            cur = conn.cursor()
            
            # Users tablosu (RBAC)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id SERIAL PRIMARY KEY,
                    address VARCHAR(42) UNIQUE NOT NULL,
                    role VARCHAR(20) NOT NULL,
                    name VARCHAR(100),
                    email VARCHAR(100),
                    department VARCHAR(100),
                    is_active BOOLEAN DEFAULT FALSE,
                    blockchain_node_id VARCHAR(66),
                    invited_by VARCHAR(42),
                    last_login TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Sensor Data tablosu (genişletilmiş)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sensor_data (
                    id SERIAL PRIMARY KEY,
                    machine_id INTEGER NOT NULL,
                    timestamp BIGINT NOT NULL,
                    air_temp FLOAT,
                    process_temp FLOAT,
                    rotation_speed INTEGER,
                    torque FLOAT,
                    tool_wear INTEGER,
                    machine_type VARCHAR(10),
                    submitter VARCHAR(42),
                    data_hash VARCHAR(66),
                    offchain_data_hash VARCHAR(66),
                    tx_hash VARCHAR(66),
                    zk_proof_hash VARCHAR(66),
                    blockchain_tx_hash VARCHAR(66),
                    blockchain_proof_id INTEGER,
                    prediction INTEGER,
                    probability FLOAT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Predictions tablosu
            cur.execute("""
                CREATE TABLE IF NOT EXISTS predictions (
                    id SERIAL PRIMARY KEY,
                    data_id INTEGER REFERENCES sensor_data(id),
                    prediction INTEGER,
                    probability FLOAT,
                    model_version VARCHAR(50),
                    model_hash VARCHAR(66),
                    predictor VARCHAR(42),
                    timestamp BIGINT,
                    blockchain_proof_id INTEGER,
                    tx_hash VARCHAR(66),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Maintenance Records tablosu
            cur.execute("""
                CREATE TABLE IF NOT EXISTS maintenance_records (
                    id SERIAL PRIMARY KEY,
                    machine_id INTEGER,
                    maintenance_type VARCHAR(20),
                    description TEXT,
                    technician VARCHAR(42),
                    timestamp BIGINT,
                    tx_hash VARCHAR(66),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Maintenance tasks tablosu (kullanıcı tarafından oluşturulan planlı görevler)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS maintenance_tasks (
                    id SERIAL PRIMARY KEY,
                    machine_id INTEGER NOT NULL,
                    machine_type VARCHAR(5),
                    task TEXT NOT NULL,
                    due_date DATE,
                    priority VARCHAR(10) DEFAULT 'MEDIUM',
                    status VARCHAR(20) DEFAULT 'PENDING',
                    estimated_duration VARCHAR(50),
                    notes TEXT,
                    created_by VARCHAR(42),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Notifications tablosu
            cur.execute("""
                CREATE TABLE IF NOT EXISTS notifications (
                    id SERIAL PRIMARY KEY,
                    user_address VARCHAR(42) REFERENCES users(address),
                    message TEXT,
                    type VARCHAR(20),
                    is_read BOOLEAN DEFAULT FALSE,
                    tx_hash VARCHAR(66),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Reports tablosu
            cur.execute("""
                CREATE TABLE IF NOT EXISTS saved_reports (
                    id SERIAL PRIMARY KEY,
                    report_name VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    report_data TEXT,
                    report_type VARCHAR(50)
                );
            """)
            
            # Batch submission ana tablosu
            cur.execute("""
                CREATE TABLE IF NOT EXISTS batch_submissions (
                    id           SERIAL PRIMARY KEY,
                    batch_type   VARCHAR(10) NOT NULL,
                    record_count INTEGER NOT NULL,
                    merkle_root  VARCHAR(100) NOT NULL,
                    tx_hash      VARCHAR(66),
                    block_number BIGINT,
                    gas_used     BIGINT,
                    status       VARCHAR(20) DEFAULT 'PENDING',
                    error_msg    TEXT,
                    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    submitted_at TIMESTAMP
                );
            """)

            # sensor_data tablosuna batch kolonları ekle
            cur.execute("""
                ALTER TABLE sensor_data
                    ADD COLUMN IF NOT EXISTS chain_hash  VARCHAR(100),
                    ADD COLUMN IF NOT EXISTS batch_id    INTEGER REFERENCES batch_submissions(id),
                    ADD COLUMN IF NOT EXISTS batch_index INTEGER;
            """)

            # Arıza kayıtları batch kuyruğu
            cur.execute("""
                CREATE TABLE IF NOT EXISTS batch_fault_queue (
                    id              SERIAL PRIMARY KEY,
                    machine_id      INTEGER NOT NULL,
                    data_proof_id   INTEGER NOT NULL DEFAULT 0,
                    prediction      INTEGER NOT NULL,
                    prediction_prob FLOAT NOT NULL,
                    recorded_by     VARCHAR(42),
                    data_hash       VARCHAR(66),
                    chain_hash      VARCHAR(100),
                    batch_id        INTEGER REFERENCES batch_submissions(id),
                    batch_index     INTEGER,
                    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            conn.commit()
            logger.info("Database tables initialized successfully")
            
        except Exception as e:
            conn.rollback()
            logger.error(f"Database initialization error: {e}")
        finally:
            if cur:
                cur.close()
            self.return_connection(conn)

    def test_connection(self):
        """Database bağlantısını test et"""
        conn = self.get_connection()
        if conn:
            try:
                cur = conn.cursor()
                cur.execute('SELECT 1')
                logger.info("Database connection test successful")
                return True
            except Exception as e:
                logger.error(f"Database connection test failed: {e}")
                return False
            finally:
                if cur:
                    cur.close()
                self.return_connection(conn)
        return False
