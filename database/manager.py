import psycopg2
from psycopg2 import extras
import logging
import time
import json
from decimal import Decimal, InvalidOperation
from typing import List, Dict, Optional, Tuple, Any
from .connection import DatabaseConnection
from .models import SensorData, PredictionData, MaintenanceData

logger = logging.getLogger(__name__)

class PdMDatabaseManager(DatabaseConnection):
    """
    PdMDatabase PostgreSQL manager sınıfı.
    Connection pooling ve işlem metodlarını içerir.
    """

    def __init__(self):
        super().__init__()

    # ----- NOTIFICATION METHODS -----

    def delete_notification(self, notif_id: int) -> bool:
        """Bildirimi veritabanından sil"""
        conn = self.get_connection()
        if not conn: return False
        try:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM notifications WHERE id = %s", (notif_id,))
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"❌ Bildirim silme hatası: {e}")
            return False
        finally:
            self.return_connection(conn)

    def get_recent_notifications(self, user_address: str, limit: int = 50) -> List[Dict]:
        """Son bildirimleri getir"""
        conn = self.get_connection()
        if not conn: return []
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT * FROM notifications 
                    WHERE lower(user_address) = lower(%s)
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (user_address, limit))
                
                notifs = []
                for row in cursor.fetchall():
                    notifs.append(dict(row))
                return notifs
        except Exception as e:
            logger.error(f"❌ Bildirimleri getirme hatası: {e}")
            return []
        finally:
            self.return_connection(conn)

    def mark_notification_read(self, notification_id: int) -> bool:
        """Bildirimi okundu olarak işaretle"""
        conn = self.get_connection()
        if not conn: return False
        try:
            with conn.cursor() as cursor:
                cursor.execute("UPDATE notifications SET is_read = TRUE WHERE id = %s", (notification_id,))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"❌ Bildirim güncelleme hatası: {e}")
            return False
        finally:
            self.return_connection(conn)

    def update_blockchain_info(self, record_id, success, tx_hash=None, proof_id=None, offchain_hash=None, is_prediction=False) -> bool:
        """Belirli bir sensör kaydı için blockchain alanlarını günceller."""
        conn = self.get_connection()
        if not conn: return False
        try:
            with conn.cursor() as cursor:
                set_parts = []
                params = []

                if is_prediction:
                    if tx_hash:
                        set_parts.append("prediction_tx_hash = %s")
                        params.append(tx_hash)
                    if proof_id is not None:
                        set_parts.append("prediction_proof_id = %s")
                        params.append(proof_id)
                else:
                    set_parts.append("blockchain_success = %s")
                    params.append(success)
                    
                    if tx_hash:
                        set_parts.append("blockchain_tx_hash = %s")
                        params.append(tx_hash)
                    if proof_id is not None:
                        set_parts.append("proof_id = %s")
                        params.append(proof_id)
                    if offchain_hash:
                        set_parts.append("offchain_data_hash = %s")
                        params.append(offchain_hash)

                if not set_parts:
                    return True

                params.append(record_id)
                sql = f"UPDATE sensor_data SET {', '.join(set_parts)} WHERE id = %s"
                cursor.execute(sql, params)
                conn.commit()
                return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Blockchain update error: {e}")
            return False
        finally:
            self.return_connection(conn)

    def update_sensor_prediction(self, record_id: int, prediction: int, probability: float, reason: str = None) -> bool:
        """Update sensor record with prediction results"""
        conn = self.get_connection()
        if not conn: return False
        try:
            with conn.cursor() as cursor:
                set_parts = ["prediction = %s", "prediction_probability = %s"]
                params = [prediction, probability]

                if reason:
                    set_parts.append("prediction_reason = %s")
                    params.append(reason)

                params.append(record_id)
                sql = f"UPDATE sensor_data SET {', '.join(set_parts)} WHERE id = %s"
                cursor.execute(sql, params)
                conn.commit()
                return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Prediction update error: {e}")
            return False
        finally:
            self.return_connection(conn)

    def get_users_by_role(self, role: str) -> list:
        """Get users by role name"""
        conn = self.get_connection()
        if not conn: return []
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                cursor.execute("SELECT * FROM users WHERE role = %s", (role,))
                return [dict(row) for row in cursor.fetchall()]
        except Exception:
            return []
        finally:
            self.return_connection(conn)

    def create_notification(self, user_address: str, message: str, notif_type: str = "info", tx_hash: str = None) -> int:
        """Create a notification for a user"""
        conn = self.get_connection()
        if not conn: return 0
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO notifications (user_address, message, type, network_tx_hash, is_read, created_at)
                    VALUES (%s, %s, %s, %s, FALSE, CURRENT_TIMESTAMP)
                    RETURNING id
                """, (user_address, message, notif_type, tx_hash))
                notif_id = cursor.fetchone()[0]
                conn.commit()
                return notif_id
        except Exception as e:
            logger.error(f"Create notification error: {e}")
            return 0
        finally:
            self.return_connection(conn)

    def save_sensor_data(self, sensor_data: Dict) -> int:
        """Sensör verisini database'e kaydet"""
        conn = self.get_connection()
        if not conn: return -1
        try:
            with conn.cursor() as cursor:
                # Machine ID oluştur
                machine_id = sensor_data.get('machine_id', int(time.time()) % 10000)
                
                # Kolon ismi dönüşümleri
                air_temp = sensor_data.get('air_temp') or sensor_data.get('air_temperature', 300.0)
                process_temp = sensor_data.get('process_temp') or sensor_data.get('process_temperature', 310.0)
                rotation_speed = sensor_data.get('rotation_speed') or sensor_data.get('rotational_speed', 1500)
                recorded_by = sensor_data.get('recorded_by') or sensor_data.get('submitter', '')
                
                # data_hash oluştur
                import hashlib
                data_str = f"{machine_id}-{air_temp}-{process_temp}-{rotation_speed}-{sensor_data.get('timestamp', int(time.time()))}"
                data_hash = "0x" + hashlib.sha256(data_str.encode()).hexdigest()

                cursor.execute("""
                    INSERT INTO sensor_data (
                        machine_id, timestamp, air_temp, process_temp, rotation_speed,
                        torque, tool_wear, machine_type, prediction, prediction_probability,
                        prediction_reason, analysis_time, blockchain_success, blockchain_tx_hash, 
                        data_hash, offchain_data_hash, tx_hash, zk_proof_hash, proof_id, recorded_by
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    machine_id,
                    sensor_data.get('timestamp', int(time.time())),
                    air_temp,
                    process_temp,
                    rotation_speed,
                    sensor_data.get('torque', 40.0),
                    sensor_data.get('tool_wear', 0),
                    sensor_data.get('machine_type', 'M'),
                    sensor_data.get('prediction'),
                    sensor_data.get('prediction_probability'),
                    sensor_data.get('prediction_reason'),
                    sensor_data.get('analysis_time'),
                    sensor_data.get('blockchain_success', False),
                    sensor_data.get('blockchain_tx_hash'),
                    data_hash,
                    sensor_data.get('offchain_data_hash'),
                    sensor_data.get('tx_hash'),
                    sensor_data.get('zk_proof_hash'),
                    sensor_data.get('proof_id'),
                    recorded_by
                ))
                
                record_id = cursor.fetchone()[0]
                conn.commit()
                return record_id

        except Exception as e:
            conn.rollback()
            logger.error(f"Database kayit hatasi: {e}")
            raise
        finally:
            self.return_connection(conn)

    # ----- KULLANICI YÖNETİMİ -----
    def create_user(self, address: str, role: str, name: str = None) -> bool:
        """Yeni kullanıcı oluştur"""
        conn = self.get_connection()
        if not conn: return False
        try:
            with conn.cursor() as cursor:
                cursor.execute("INSERT INTO users (address, role, name) VALUES (%s, %s, %s)", (address, role, name))
                conn.commit()
                return True
        except psycopg2.IntegrityError:
            logger.warning(f"⚠️ Kullanıcı zaten mevcut: {address}")
            return False
        except Exception as e:
            logger.error(f"❌ Kullanıcı oluşturma hatası: {e}")
            return False
        finally:
            self.return_connection(conn)

    def get_user(self, address: str) -> Optional[Dict]:
        """Kullanıcı bilgilerini getir"""
        conn = self.get_connection()
        if not conn: return None
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                cursor.execute("SELECT * FROM users WHERE lower(address) = lower(%s)", (address,))
                result = cursor.fetchone()
                return dict(result) if result else None
        except Exception as e:
            logger.error(f"❌ Kullanıcı sorgu hatası: {e}")
            return None
        finally:
            self.return_connection(conn)
    
    def get_all_users(self) -> List[Dict]:
        """Tüm kullanıcıları getir"""
        conn = self.get_connection()
        if not conn: return []
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                cursor.execute("SELECT * FROM users ORDER BY created_at DESC")
                users = []
                for row in cursor.fetchall():
                    users.append(dict(row))
                return users
        except Exception as e:
            logger.error(f"❌ Kullanıcı listeleme hatası: {e}")
            return []
        finally:
            self.return_connection(conn)

    def invite_user(self, address: str, role: str, name: str, email: str = None,
                    department: str = None, invited_by: str = None) -> bool:
        """Owner tarafından yeni kullanıcı davet et"""
        conn = self.get_connection()
        if not conn: return False
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO users (address, role, name, email, department, status, invited_by)
                    VALUES (%s, %s, %s, %s, %s, 'pending', %s)
                """, (address.lower(), role, name, email, department, invited_by))
                conn.commit()
                return True
        except psycopg2.IntegrityError:
            logger.warning(f"Kullanici zaten mevcut: {address}")
            return False
        except Exception as e:
            logger.error(f"Kullanici davet hatasi: {e}")
            return False
        finally:
            self.return_connection(conn)

    def activate_user(self, address: str, blockchain_node_id: str = None) -> bool:
        """Kullanıcıyı aktif et"""
        conn = self.get_connection()
        if not conn: return False
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    UPDATE users
                    SET status = 'active',
                    activated_at = CURRENT_TIMESTAMP,
                    blockchain_node_id = %s,
                    blockchain_registered_at = CURRENT_TIMESTAMP
                    WHERE lower(address) = lower(%s)
                """, (blockchain_node_id, address))
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"Kullanici aktivasyon hatasi: {e}")
            return False
        finally:
            self.return_connection(conn)

    def get_pending_users(self) -> List[Dict]:
        """Bekleyen kullanıcıları getir"""
        conn = self.get_connection()
        if not conn: return []
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                cursor.execute("SELECT * FROM users WHERE status = 'pending' ORDER BY created_at DESC")
                return [dict(row) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"Pending users hatasi: {e}")
            return []
        finally:
            self.return_connection(conn)

    def update_last_login(self, address: str) -> bool:
        """Kullanıcının son giriş zamanını güncelle"""
        conn = self.get_connection()
        if not conn: return False
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    UPDATE users SET last_login_at = CURRENT_TIMESTAMP
                    WHERE lower(address) = lower(%s)
                """, (address,))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"Last login update hatasi: {e}")
            return False
        finally:
            self.return_connection(conn)

    def update_user(self, address: str, name: str = None, email: str = None,
                   department: str = None, role: str = None) -> bool:
        """Kullanıcı bilgilerini güncelle"""
        conn = self.get_connection()
        if not conn: return False
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT is_owner FROM users WHERE lower(address) = lower(%s)", (address,))
                row = cursor.fetchone()
                if row and row[0] and role and role != 'OWNER':
                    logger.warning(f"Owner rolu degistirilemez: {address}")
                    return False

                updates = []
                values = []
                if name is not None:
                    updates.append("name = %s")
                    values.append(name)
                if email is not None:
                    updates.append("email = %s")
                    values.append(email)
                if department is not None:
                    updates.append("department = %s")
                    values.append(department)
                if role is not None:
                    updates.append("role = %s")
                    values.append(role)

                if not updates:
                    return True

                values.append(address)
                cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE lower(address) = lower(%s)", values)
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            logger.error(f"User update hatasi: {e}")
            return False
        finally:
            self.return_connection(conn)

    def delete_user(self, address: str) -> bool:
        """Kullanıcı sil"""
        conn = self.get_connection()
        if not conn: return False
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT is_owner FROM users WHERE lower(address) = lower(%s)", (address,))
                row = cursor.fetchone()
                if row and row[0]:
                    logger.warning(f"Owner silinemez: {address}")
                    return False

                cursor.execute("DELETE FROM users WHERE lower(address) = lower(%s)", (address,))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"❌ Kullanıcı silme hatası: {e}")
            return False
        finally:
            self.return_connection(conn)

    def update_user_role(self, address: str, role: str) -> bool:
        """Kullanıcı rolünü güncelle"""
        conn = self.get_connection()
        if not conn: return False
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT is_owner FROM users WHERE address = %s", (address,))
                row = cursor.fetchone()
                if row and row[0]:
                    logger.warning(f"⚠️ Owner rolü değiştirilemez: {address}")
                    return False

                cursor.execute("UPDATE users SET role = %s WHERE address = %s", (role, address))
                conn.commit()
                return True
        except Exception as e:
            logger.error(f"❌ Rol güncelleme hatası: {e}")
            return False
        finally:
            self.return_connection(conn)
    
    def get_sensor_data(self, record_id: int = None, machine_id: int = None, limit: int = 10, 
                       prediction_filter: str = None, machine_type_filter: str = None,
                       blockchain_filter: str = None, start_date: str = None, 
                       end_date: str = None) -> List[Dict]:
        """Sensör verilerini getir (filtreleme ile)"""
        conn = self.get_connection()
        if not conn: return []
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                if record_id:
                    cursor.execute("SELECT * FROM sensor_data WHERE id = %s", (record_id,))
                    result = cursor.fetchone()
                    return [self._row_to_dict(dict(result))] if result else []
                else:
                    query = "SELECT * FROM sensor_data WHERE 1=1"
                    params = []
                    
                    if machine_id is not None:
                        query += " AND machine_id = %s"
                        params.append(machine_id)

                    if prediction_filter == "Normal":
                        query += " AND prediction = 0"
                    elif prediction_filter == "Arıza":
                        query += " AND prediction = 1"
                    
                    if machine_type_filter and machine_type_filter in ["L", "M", "H"]:
                        query += " AND machine_type = %s"
                        params.append(machine_type_filter)
                    
                    if blockchain_filter == "Başarılı":
                        query += " AND blockchain_success = TRUE"
                    elif blockchain_filter == "Başarısız":
                        query += " AND blockchain_success = FALSE"
                    
                    if start_date:
                        query += " AND created_at::DATE >= %s"
                        params.append(start_date)
                    
                    if end_date:
                        query += " AND created_at::DATE <= %s"
                        params.append(end_date)
                    
                    query += " ORDER BY created_at DESC LIMIT %s"
                    params.append(limit)
                    
                    cursor.execute(query, params)
                    results = cursor.fetchall()
                    
                    return [self._row_to_dict(dict(row)) for row in results]
                
        except Exception as e:
            logger.error(f"❌ Database sorgu hatası: {e}")
            return []
        finally:
            self.return_connection(conn)

    def _row_to_dict(self, d: Dict) -> Dict:
        """Helper to process row dict if needed"""
        if 'air_temp' in d and 'air_temperature' not in d:
             d['air_temperature'] = d['air_temp']
        if 'process_temp' in d and 'process_temperature' not in d:
             d['process_temperature'] = d['process_temp']
        if 'rotation_speed' in d and 'rotational_speed' not in d:
             d['rotational_speed'] = d['rotation_speed']
        
        for k, v in d.items():
            if isinstance(v, (time.struct_time, bytes)):
                pass 
            if hasattr(v, 'isoformat'):
                d[k] = v.isoformat()
        
        if 'is_verified' in d and not d.get('blockchain_success'):
            d['blockchain_success'] = d['is_verified']
            
        return d

    def _safe_percent(self, value) -> str:
        """Probability değerini Decimal ile yüzde formatına çevirir"""
        try:
            if value is None:
                return 'N/A'
            if isinstance(value, (bytes, bytearray)):
                import struct
                if len(value) == 8:
                    value = struct.unpack('d', value)[0]
                elif len(value) == 4:
                    value = struct.unpack('f', value)[0]
                else:
                    return f"Binary({len(value)} bytes)"
            dec = Decimal(str(value))
            percent = (dec * Decimal('100')).quantize(Decimal('0.01'))
            return f"{percent}%"
        except (InvalidOperation, ValueError):
            return f"Raw: {value}"

    def format_record(self, record: Dict) -> Dict:
        """GUI-agnostik biçimde tek bir kaydı kullanıcı dostu alanlarla zenginleştirir."""
        from datetime import datetime
        created_at = record.get('created_at', '')
        try:
            dt = datetime.strptime(created_at, '%Y-%m-%d %H:%M:%S')
            time_str = dt.strftime('%d.%m.%Y %H:%M:%S')
        except Exception:
            time_str = created_at or 'N/A'

        prediction = record.get('prediction')
        pred_text = 'Arıza' if prediction == 1 else 'Normal' if prediction == 0 else 'N/A'

        prob_text = self._safe_percent(record.get('prediction_probability'))

        reason = record.get('prediction_reason', '') or ''
        reason_short = (reason[:20] + '...') if len(reason) > 20 else reason

        analysis_time = record.get('analysis_time')
        analysis_text = f"{analysis_time:.4f}s" if isinstance(analysis_time, (int, float)) else 'N/A'

        bc_success = bool(record.get('blockchain_success', False))
        bc_text = '✅' if bc_success else '❌'

        return {
            'id': record.get('id', ''),
            'time_str': time_str,
            'air_temp': f"{record.get('air_temp', 0):.1f}K",
            'process_temp': f"{record.get('process_temp', 0):.1f}K",
            'rotation_speed': f"{record.get('rotation_speed', 0)} rpm",
            'torque': f"{record.get('torque', 0):.1f} Nm",
            'tool_wear': f"{record.get('tool_wear', 0)} min",
            'machine_type': record.get('machine_type', ''),
            'pred_text': pred_text,
            'prob_text': prob_text,
            'reason_short': reason_short,
            'analysis_text': analysis_text,
            'bc_text': bc_text,
            'prediction': prediction
        }
    
    def get_statistics(self) -> Dict:
        """Database istatistikleri"""
        conn = self.get_connection()
        if not conn: return {}
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM sensor_data")
                total_records = cursor.fetchone()[0]
                
                cursor.execute("""
                    SELECT prediction, COUNT(*) as count 
                    FROM sensor_data 
                    WHERE prediction IS NOT NULL 
                    GROUP BY prediction
                """)
                prediction_dist = dict(cursor.fetchall())
                
                cursor.execute("""
                    SELECT machine_type, COUNT(*) as count 
                    FROM sensor_data 
                    GROUP BY machine_type
                """)
                machine_type_dist = dict(cursor.fetchall())
                
                cursor.execute("SELECT MAX(created_at) FROM sensor_data")
                last_record = cursor.fetchone()[0]
            
            return {
                'total_records': total_records,
                'prediction_distribution': prediction_dist,
                'machine_type_distribution': machine_type_dist,
                'last_record_time': last_record
            }
        except Exception as e:
            logger.error(f"❌ İstatistik hatası: {e}")
            return {}
        finally:
            self.return_connection(conn)

    def search_by_prediction(self, prediction: int, limit: int = 50):
        """Tahmin sonucuna göre ara"""
        conn = self.get_connection()
        if not conn: return []
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT * FROM sensor_data 
                    WHERE prediction = %s
                    ORDER BY timestamp DESC
                    LIMIT %s
                """, (prediction, limit))
                
                columns = [desc[0] for desc in cursor.description] if cursor.description else []
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            return results
        except Exception as e:
            logger.error(f"❌ search_by_prediction hatası: {e}")
            return []
        finally:
            self.return_connection(conn)

    # ========== ASSET MANAGEMENT ==========
    
    def get_all_assets(self) -> List[Dict]:
        """Sabit 3 makine döndür"""
        MACHINES = [
            {'id': 1001, 'type': 'L', 'name': 'L (ID: 1001)'},
            {'id': 2001, 'type': 'M', 'name': 'M (ID: 2001)'},
            {'id': 3001, 'type': 'H', 'name': 'H (ID: 3001)'},
        ]
        
        conn = self.get_connection()
        if not conn: return MACHINES
        try:
            assets = []
            with conn.cursor() as cursor:
                for machine in MACHINES:
                    cursor.execute("""
                        SELECT 
                            MIN(timestamp) as first_seen,
                            MAX(timestamp) as last_seen,
                            COUNT(*) as record_count
                        FROM sensor_data
                        WHERE machine_id = %s
                    """, (machine['id'],))
                    
                    row = cursor.fetchone()
                    assets.append({
                        'id': machine['id'],
                        'type': machine['type'],
                        'name': machine['name'],
                        'first_seen': row[0] if row else None,
                        'last_seen': row[1] if row else None,
                        'record_count': row[2] if row else 0
                    })
            return assets
        except Exception as e:
            logger.error(f"❌ get_all_assets hatası: {e}")
            return MACHINES
        finally:
            self.return_connection(conn)
    
    def get_asset_by_id(self, machine_id: int) -> Optional[Dict]:
        """Belirli bir makineyi getir"""
        conn = self.get_connection()
        if not conn: return None
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        machine_id,
                        machine_type,
                        MIN(timestamp) as first_seen,
                        MAX(timestamp) as last_seen,
                        COUNT(*) as record_count,
                        AVG(CASE WHEN prediction = 0 THEN 100 ELSE 0 END) as health_score
                    FROM sensor_data
                    WHERE machine_id = %s
                    GROUP BY machine_id, machine_type
                """, (machine_id,))
                
                row = cursor.fetchone()
            
            if not row: return None
                
            return {
                'id': row[0],
                'type': row[1],
                'first_seen': row[2],
                'last_seen': row[3],
                'record_count': row[4],
                'health_score': int(row[5]) if row[5] else 0
            }
        except Exception as e:
            logger.error(f"❌ get_asset_by_id hatası: {e}")
            return None
        finally:
            self.return_connection(conn)
    
    def save_prediction_log(self, machine_id: int, prediction_prob: float, 
                           prediction: int, reason: str, sensor_snapshot: Dict) -> int:
        """Tahmin sonucunu logla"""
        sensor_data = {
            'machine_id': machine_id,
            'timestamp': int(time.time()),
            'air_temp': sensor_snapshot.get('air_temp_k', 300),
            'process_temp': sensor_snapshot.get('process_temp_k', 310),
            'rotation_speed': sensor_snapshot.get('rotational_speed_rpm', 1500),
            'torque': sensor_snapshot.get('torque_nm', 40),
            'tool_wear': sensor_snapshot.get('tool_wear_min', 0),
            'machine_type': sensor_snapshot.get('machine_type', 'M'),
            'prediction': prediction,
            'prediction_probability': prediction_prob,
            'prediction_reason': reason
        }
        return self.save_sensor_data(sensor_data)
    
    def get_prediction_history(self, machine_id: Optional[int] = None, limit: int = 50) -> List[Dict]:
        """Tahmin geçmişini getir"""
        conn = self.get_connection()
        if not conn: return []
        try:
            with conn.cursor() as cursor:
                if machine_id:
                    cursor.execute("""
                        SELECT * FROM sensor_data
                        WHERE machine_id = %s AND prediction IS NOT NULL
                        ORDER BY timestamp DESC
                        LIMIT %s
                    """, (machine_id, limit))
                else:
                    cursor.execute("""
                        SELECT * FROM sensor_data
                        WHERE prediction IS NOT NULL
                        ORDER BY timestamp DESC
                        LIMIT %s
                    """, (limit,))
                
                columns = [desc[0] for desc in cursor.description] if cursor.description else []
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            return results
        except Exception as e:
            logger.error(f"❌ get_prediction_history hatası: {e}")
            return []
        finally:
            self.return_connection(conn)
    
    # ========== DASHBOARD STATISTICS ==========
    
    def count_assets(self) -> int:
        """Toplam makine sayısı"""
        conn = self.get_connection()
        if not conn: return 0
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT COUNT(DISTINCT machine_id) FROM sensor_data WHERE machine_id IS NOT NULL")
                count = cursor.fetchone()[0]
            return count
        except Exception as e:
            logger.error(f"❌ count_assets hatası: {e}")
            return 0
        finally:
            self.return_connection(conn)
    
    def count_critical_assets(self) -> int:
        """Kritik durumda makine sayısı (son tahmin arıza)"""
        conn = self.get_connection()
        if not conn: return 0
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT COUNT(*) FROM (
                        SELECT DISTINCT ON (machine_id) machine_id, prediction
                        FROM sensor_data
                        WHERE prediction IS NOT NULL AND machine_id IS NOT NULL
                        ORDER BY machine_id, timestamp DESC
                    ) sub
                    WHERE prediction = 1
                """)
                count = cursor.fetchone()[0]
            return count
        except Exception as e:
            logger.error(f"❌ count_critical_assets hatası: {e}")
            return 0
        finally:
            self.return_connection(conn)
    
    def get_avg_health(self) -> float:
        """Ortalama sağlık skoru"""
        conn = self.get_connection()
        if not conn: return 85.0
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT AVG(CASE WHEN prediction = 1 THEN 50 ELSE 100 END)
                    FROM (
                        SELECT DISTINCT ON (machine_id) machine_id, prediction
                        FROM sensor_data
                        WHERE prediction IS NOT NULL AND machine_id IS NOT NULL
                        ORDER BY machine_id, timestamp DESC
                    ) sub
                """)
                avg = cursor.fetchone()[0]
            return round(avg if avg else 85.0, 1)
        except Exception as e:
            logger.error(f"❌ get_avg_health hatası: {e}")
            return 85.0
        finally:
            self.return_connection(conn)
    
    def get_recent_predictions(self, limit: int = 10) -> List[Dict]:
        """Son tahminleri getir"""
        return self.get_prediction_history(machine_id=None, limit=limit)

    def save_report(self, title: str, content: Dict, created_by: str = "System") -> int:
        """Raporu JSON olarak kaydet"""
        conn = self.get_connection()
        if not conn: return -1
        try:
            content_json = json.dumps(content)
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO saved_reports (title, content, created_by)
                    VALUES (%s, %s, %s)
                    RETURNING id
                """, (title, content_json, created_by))
                report_id = cursor.fetchone()[0]
            conn.commit()
            return report_id
        except Exception as e:
            conn.rollback()
            logger.error(f"❌ Rapor kaydetme hatası: {e}")
            return -1
        finally:
            self.return_connection(conn)

    def get_saved_reports(self, limit: int = 50) -> List[Dict]:
        """Kayıtlı raporların listesini getir"""
        conn = self.get_connection()
        if not conn: return []
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT id, title, created_by, created_at 
                    FROM saved_reports 
                    ORDER BY created_at DESC 
                    LIMIT %s
                """, (limit,))
                columns = [desc[0] for desc in cursor.description] if cursor.description else []
                reports = []
                for row in cursor.fetchall():
                    d = dict(zip(columns, row))
                    if d.get('created_at') and isinstance(d['created_at'], str) and not d['created_at'].endswith('Z'):
                        d['created_at'] += 'Z'
                    reports.append(d)
            return reports
        except Exception as e:
            logger.error(f"❌ Rapor listeleme hatası: {e}")
            return []
        finally:
            self.return_connection(conn)

    def get_saved_report(self, report_id: int) -> Optional[Dict]:
        """Tek bir raporun detayını ve içeriğini getir"""
        conn = self.get_connection()
        if not conn: return None
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM saved_reports WHERE id = %s", (report_id,))
                row = cursor.fetchone()
                columns = [desc[0] for desc in cursor.description] if cursor.description else []
            if row:
                d = dict(zip(columns, row))
                d['content'] = json.loads(d['content']) if isinstance(d['content'], str) else d['content']
                if d.get('created_at') and isinstance(d['created_at'], str) and not d['created_at'].endswith('Z'):
                    d['created_at'] += 'Z'
                return d
            return None
        except Exception as e:
            logger.error(f"❌ Rapor getirme hatası: {e}")
            return None
        finally:
            self.return_connection(conn)

    def get_maintenance_records(self, machine_id: int = None, limit: int = 100) -> List[Dict]:
        """Bakım kayıtlarını getir"""
        conn = self.get_connection()
        if not conn:
            return []
        try:
            with conn.cursor() as cursor:
                if machine_id:
                    cursor.execute(
                        "SELECT * FROM maintenance_records WHERE machine_id = %s ORDER BY created_at DESC LIMIT %s",
                        (machine_id, limit)
                    )
                else:
                    cursor.execute(
                        "SELECT * FROM maintenance_records ORDER BY created_at DESC LIMIT %s",
                        (limit,)
                    )
                columns = [desc[0] for desc in cursor.description] if cursor.description else []
                return [dict(zip(columns, row)) for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"❌ Bakım kayıtları getirme hatası: {e}")
            return []
        finally:
            self.return_connection(conn)
