"""
Predictive Maintenance API - Main Entry Point

Bu dosya API'nin ana giriş noktasıdır ve tüm route'ları içeren modülleri birleştirir.
Route'lar routes/ klasöründe modüler olarak organize edilmiştir.
"""

import os
from dotenv import load_dotenv
load_dotenv()

# Environment validation
try:
    from env_validator import EnvValidator
    validator = EnvValidator(strict=False)
    validator.validate()
    if validator.warnings:
        validator.print_report()
except ImportError:
    print("Warning: env_validator not found, skipping environment validation")

import time
import logging
import queue
import threading
import numpy as np
import tensorflow as tf
import joblib
import requests
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any, Tuple, Set
from collections import defaultdict
import uvicorn
from database import PdMDatabaseManager
from datetime import datetime, timedelta
import asyncio

# TensorFlow uyarılarını bastır
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

# Config import
try:
    from config import FilePaths, TrainingConfig
except ImportError:
    print("HATA: config.py bulunamadı.")
    exit()

# Blockchain handler opsiyonel
try:
    from blockchain_client import HybridBlockchainHandler
except ImportError:
    HybridBlockchainHandler = None

# Automation Event Listener opsiyonel
try:
    from automation_event_listener import AutomationEventListener
    HAS_AUTOMATION_LISTENER = True
except ImportError:
    HAS_AUTOMATION_LISTENER = False
    AutomationEventListener = None

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
    global model, scaler, optimal_threshold, automation_listener_task

    if not os.path.exists(FilePaths.MODEL_PATH) or not os.path.exists(FilePaths.SCALER_PATH):
        print("⚠️ UYARI: Model dosyaları bulunamadı.")
    else:
        print("🤖 Model ve Scaler yükleniyor...")

    try:
        model = tf.keras.models.load_model(FilePaths.MODEL_PATH, compile=False)
        scaler = joblib.load(FilePaths.SCALER_PATH)
        print("✅ Model ve Scaler başarıyla yüklendi.")

        metadata_path = FilePaths.MODEL_PATH.parent / 'model_metadata.pkl'
        if metadata_path.exists():
            try:
                metadata = joblib.load(metadata_path)
                loaded_threshold = metadata.get('optimal_threshold')
                if loaded_threshold:
                    optimal_threshold = float(loaded_threshold)
                    print(f"🎯 Optimal eşik değeri: {optimal_threshold:.3f}")
            except Exception as e:
                print(f"⚠️ Metadata okuma hatası: {e}")

    except Exception as e:
        print(f"❌ Model yükleme hatası: {e}")

    _init_blockchain_handler()
    _start_monitor()

    route_deps.set_blockchain_handler(blockchain_handler)

    from routes import predictions
    predictions.set_model_refs(model, scaler, optimal_threshold, feature_names)

    # Expose control functions to automation router
    from routes import automation
    automation.set_automation_refs(
        automation_listener,
        automation_listener_task,
        AUTOMATION_ENABLED,
        HAS_AUTOMATION_LISTENER
    )
    automation.set_control_functions(
        restart_listener_task=restart_automation_listener,
        trigger_manual_prediction=trigger_manual_prediction
    )

    if _init_automation_listener():
        await start_automation_listener()

    yield  # Uygulama bu noktada çalışır

    # --- SHUTDOWN ---
    _stop_blockchain_workers()
    _stop_monitor()
    _stop_automation_listener()


# --- FastAPI Uygulaması ---
app = FastAPI(
    title="Predictive Maintenance API",
    description="Makine arızalarını LSTM-CNN modeli ile tahmin eden ve kullanıcı yönetimi sağlayan API.",
    version="2.0.0",
    lifespan=lifespan,
)

# Structured logging setup
try:
    from observability import configure_logging, set_correlation_id, clear_log_context
    configure_logging()
    _HAS_OBSERVABILITY = True
except ImportError:
    _HAS_OBSERVABILITY = False
    def set_correlation_id(*_a, **_kw): return ""   # type: ignore
    def clear_log_context(): pass                   # type: ignore

logger = logging.getLogger(__name__)

# Validation Error Handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    error_details = exc.errors()
    logger.warning("Validation error", extra={"detail": str(error_details)})
    return JSONResponse(
        status_code=422,
        content={"detail": error_details, "body": error_details},
    )

# Correlation-ID middleware
@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    cid = request.headers.get("X-Correlation-ID") or set_correlation_id()
    try:
        response = await call_next(request)
    finally:
        clear_log_context()
    response.headers["X-Correlation-ID"] = str(cid)
    return response

# CORS Ayarları
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"],
)

# --- Rate Limiting Middleware ---
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))
rate_limit_store: Dict[str, List[float]] = defaultdict(list)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    current_time = time.time()
    window_start = current_time - RATE_LIMIT_WINDOW

    rate_limit_store[client_ip] = [t for t in rate_limit_store[client_ip] if t > window_start]

    if len(rate_limit_store[client_ip]) >= RATE_LIMIT_REQUESTS:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please try again later."}
        )

    rate_limit_store[client_ip].append(current_time)
    response = await call_next(request)
    return response

# --- Lifecycle & Error Handling ---
# Suppress asyncio ConnectionResetError (WinError 10054) on Windows
# This is a harmless error when clients disconnect abruptly
if os.name == 'nt':
    import asyncio
    import functools
    
    def silence_event_loop_closed(func):
        @functools.wraps(func)
        def wrapper(self, *args, **kwargs):
            try:
                return func(self, *args, **kwargs)
            except (RuntimeError, ConnectionResetError, OSError):
                return
        return wrapper

    from asyncio.proactor_events import _ProactorBasePipeTransport
    if hasattr(_ProactorBasePipeTransport, "__del__"):
        _ProactorBasePipeTransport.__del__ = silence_event_loop_closed(_ProactorBasePipeTransport.__del__)

# --- Global Değişkenler ---
model = None
scaler = None
optimal_threshold = TrainingConfig.DEFAULT_THRESHOLD
db_manager = PdMDatabaseManager()
blockchain_handler: Optional[Any] = None
blockchain_job_queue: Optional["queue.Queue[Tuple[int, Dict[str, Any]]]"] = None
blockchain_workers: List[threading.Thread] = []
blockchain_enabled = False
BLOCKCHAIN_WORKER_COUNT = int(os.getenv("BLOCKCHAIN_WORKERS", "1"))
BLOCKCHAIN_QUEUE_MAX = int(os.getenv("BLOCKCHAIN_QUEUE_MAX", "256"))

# Automation listener globals
automation_listener: Optional[Any] = None
automation_listener_task: Optional[asyncio.Task] = None
AUTOMATION_ENABLED = os.getenv("AUTOMATION_LISTENER_ENABLED", "true").lower() == "true"

feature_names = [
    'Air temperature [K]', 'Process temperature [K]', 'Rotational speed [rpm]',
    'Torque [Nm]', 'Tool wear [min]', 'Type_H', 'Type_L', 'Type_M'
]

# --- Logging Ayarları ---
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# --- Blockchain Yardımcıları ---
def _init_blockchain_handler():
    global blockchain_handler, blockchain_job_queue, blockchain_enabled
    if blockchain_handler or HybridBlockchainHandler is None:
        if HybridBlockchainHandler is None:
            print("⚠️ HybridBlockchainHandler import edilemedi, blockchain devre dışı")
        return
    try:
        print("🔄 Blockchain handler başlatılıyor...")
        handler = HybridBlockchainHandler(db_manager)
        ready = False
        if hasattr(handler, "_initialize_blockchain"):
            print("🔄 Blockchain bağlantısı kuruluyor...")
            ready = handler._initialize_blockchain()
        if not ready:
            ready = handler.is_ready()
        if ready:
            blockchain_handler = handler
            blockchain_job_queue = queue.Queue(maxsize=BLOCKCHAIN_QUEUE_MAX)
            _start_blockchain_workers()
            blockchain_enabled = True
            print("🔗 Blockchain handler initialized; on-chain logging enabled.")
            # Session keys: ephemeral key generation + on-chain authorization
            try:
                handler.setup_session_keys()
            except Exception as sk_err:
                print(f"⚠️ Session key setup failed (non-fatal): {sk_err}")
        else:
            print("⚠️ Blockchain handler could not initialize; running in local-only mode.")
    except Exception as exc:
        print(f"⚠️ Blockchain handler initialization failed: {exc}")
        import traceback
        traceback.print_exc()


def _is_blockchain_ready() -> bool:
    return blockchain_handler is not None and blockchain_handler.is_ready()


def get_blockchain_handler():
    global blockchain_handler
    if blockchain_handler is None:
        _init_blockchain_handler()
    return blockchain_handler


def _start_blockchain_workers():
    if blockchain_job_queue is None:
        return
    for _ in range(max(1, BLOCKCHAIN_WORKER_COUNT)):
        worker = threading.Thread(target=_blockchain_worker, daemon=True)
        worker.start()
        blockchain_workers.append(worker)


def _stop_blockchain_workers():
    if blockchain_job_queue is None:
        return
    for _ in blockchain_workers:
        blockchain_job_queue.put(None)
    for worker in blockchain_workers:
        worker.join(timeout=2)
    blockchain_workers.clear()


def _blockchain_worker():
    while True:
        if blockchain_job_queue is None:
            break
        job = blockchain_job_queue.get()
        try:
            if job is None:
                break
            record_id, payload = job
            _process_blockchain_job(record_id, payload)
        finally:
            if blockchain_job_queue is not None:
                blockchain_job_queue.task_done()


def _process_blockchain_job(record_id: int, payload: Dict[str, Any]):
    try:
        print(f"🔄 Processing blockchain job for record #{record_id}...")
        result = blockchain_handler.submit_sensor_data_hybrid(payload, pdm_id=record_id)
        if isinstance(result, dict) and result.get('success'):
            tx_hash = result.get('tx_hash')
            proof_id = result.get('blockchain_proof_id')
            db_manager.update_blockchain_info(
                record_id=record_id,
                success=bool(result.get('blockchain_submitted')),
                tx_hash=tx_hash,
                proof_id=proof_id,
                offchain_hash=result.get('zk_proof_hash')
            )
            print(f"✅ Blockchain submission completed (record #{record_id}).")
        else:
            error_msg = result.get('error') if isinstance(result, dict) else 'Unknown error'
            print(f"⚠️ Blockchain submission failed for record #{record_id}: {error_msg}")
    except Exception as exc:
        print(f"❌ Blockchain job crashed for record #{record_id}: {exc}")


# --- Automation Listener Yardımcıları ---
async def _automation_listener_loop():
    global automation_listener
    if automation_listener is None:
        return

    print("🔄 Automation listener loop started")
    poll_interval = int(os.getenv("POLL_INTERVAL", "30"))

    while automation_listener and automation_listener.running:
        try:
            await asyncio.to_thread(automation_listener.poll_events)
        except Exception as e:
            print(f"⚠️ Automation listener error: {e}")
        await asyncio.sleep(poll_interval)

    print("🛑 Automation listener loop stopped")


def _init_automation_listener():
    global automation_listener

    if not HAS_AUTOMATION_LISTENER:
        print("⚠️ Automation listener module not available")
        return False

    if not AUTOMATION_ENABLED:
        print("ℹ️ Automation listener disabled via AUTOMATION_LISTENER_ENABLED=false")
        return False

    try:
        print("🔄 Initializing automation event listener...")
        automation_listener = AutomationEventListener()
        automation_listener.connect()
        automation_listener.running = True
        print("✅ Automation event listener initialized")
        return True
    except Exception as e:
        print(f"⚠️ Automation listener initialization failed: {e}")
        return False


async def start_automation_listener():
    global automation_listener_task
    if automation_listener and (automation_listener_task is None or automation_listener_task.done()):
        automation_listener_task = asyncio.create_task(_automation_listener_loop())
        print("🚀 Automation listener background task started")
        # Update refs in router
        from routes import automation
        automation.set_automation_refs(
            automation_listener,
            automation_listener_task,
            AUTOMATION_ENABLED,
            HAS_AUTOMATION_LISTENER
        )
        return True
    return False

def _stop_automation_listener():
    global automation_listener, automation_listener_task

    if automation_listener:
        print("🛑 Stopping automation listener...")
        automation_listener.running = False
        automation_listener = None

    if automation_listener_task and not automation_listener_task.done():
        automation_listener_task.cancel()
        automation_listener_task = None

async def restart_automation_listener():
    _stop_automation_listener()
    await asyncio.sleep(1)
    if _init_automation_listener():
        return await start_automation_listener()
    return False

async def trigger_manual_prediction(wallet_address: str = None):
    """Manually triggers a prediction via the listener."""
    if not automation_listener:
        if not _init_automation_listener():
            return {"success": False, "message": "Listener not available"}
    
    try:
        # Generate a dummy event to reuse listener logic
        dummy_event = {
            'args': {
                'requestId': os.urandom(32),
                'timestamp': int(time.time()),
                'requester': wallet_address or "0x0000000000000000000000000000000000000000"
            }
        }
        # Run in thread to avoid blocking
        await asyncio.to_thread(automation_listener.process_prediction_request, dummy_event)
        return {"success": True, "message": "Manual prediction triggered"}
    except Exception as e:
        logger.error(f"Manual trigger error: {e}")
        return {"success": False, "message": str(e)}


# --- Transaction Monitor ---
monitor_thread = None
monitor_stop_event = threading.Event()


def _start_monitor():
    global monitor_thread
    monitor_stop_event.clear()
    monitor_thread = threading.Thread(target=_monitor_loop, daemon=True)
    monitor_thread.start()


def _stop_monitor():
    monitor_stop_event.set()
    if monitor_thread:
        monitor_thread.join(timeout=2)


def _monitor_loop():
    logger.info("🕵️ Transaction Monitor started")
    print("🕵️ Transaction Monitor started")

    RPC_URL = os.getenv("ZKSYNC_SEPOLIA_RPC", "https://sepolia.era.zksync.dev")

    while not monitor_stop_event.is_set():
        try:
            _check_pending_transactions(RPC_URL)
        except Exception as e:
            logger.error(f"Monitor loop error: {e}")
        time.sleep(10)


def _check_pending_transactions(rpc_url):
    if not db_manager or not hasattr(db_manager, '_connected') or not getattr(db_manager, '_connected', False):
        # Fallback: try get_connection directly
        pass
    
    conn = db_manager.get_connection()
    if not conn:
        return
    
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, blockchain_tx_hash, machine_id, recorded_by
                FROM sensor_data
                WHERE blockchain_tx_hash IS NOT NULL AND proof_id IS NULL
            """)
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            pending_sensor = [dict(zip(columns, row)) for row in cursor.fetchall()]

            for rec in pending_sensor:
                _check_and_update_tx(rec, rpc_url, is_prediction=False)

            cursor.execute("""
                SELECT id, prediction_tx_hash, machine_id, recorded_by
                FROM sensor_data
                WHERE prediction_tx_hash IS NOT NULL AND prediction_proof_id IS NULL
            """)
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            pending_pred = [dict(zip(columns, row)) for row in cursor.fetchall()]

            for rec in pending_pred:
                rec['blockchain_tx_hash'] = rec.get('prediction_tx_hash')
                _check_and_update_tx(rec, rpc_url, is_prediction=True)

    finally:
        db_manager.return_connection(conn)


def _check_and_update_tx(record, rpc_url, is_prediction):
    tx_hash = record.get('blockchain_tx_hash')
    if not tx_hash or len(tx_hash) < 10:
        return

    try:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getTransactionReceipt",
            "params": [tx_hash]
        }
        res = requests.post(rpc_url, json=payload, timeout=5)
        data = res.json()

        receipt = data.get('result')
        if not receipt:
            return

        status_hex = receipt.get('status')
        if not status_hex:
            return

        is_success = int(status_hex, 16) == 1

        if is_success:
            block_num = int(receipt.get('blockNumber', '0'), 16)
            tx_index = int(receipt.get('transactionIndex', '0'), 16)
            new_proof_id = block_num * 10000 + tx_index

            print(f"✅ TX Confirmed ({'Prediction' if is_prediction else 'Sensor'}): {tx_hash} -> ProofID: {new_proof_id}")

            db_manager.update_blockchain_info(
                record_id=record['id'],
                success=True,
                tx_hash=tx_hash,
                proof_id=new_proof_id,
                is_prediction=is_prediction
            )

            user_addr = record.get('recorded_by') or "Unknown"
            if user_addr and user_addr != "Unknown":
                msg = f"Machine #{record['machine_id']} {'Prediction' if is_prediction else 'Sensor Data'} verified on blockchain!"
                db_manager.create_notification(
                    user_address=user_addr,
                    message=msg,
                    notif_type="success",
                    tx_hash=tx_hash
                )

    except Exception as e:
        logger.error(f"Check TX error ({tx_hash}): {e}")


# --- Import Route Modules and Register ---
from routes import (
    auth_router,
    admin_router,
    sensors_router,
    predictions_router,
    blockchain_router,
    machines_router,
    maintenance_router,
    analytics_router,
    automation_router,
    notifications_router,
    reports_router,
    training_router,
)

# Import dependencies module to set shared references
from routes import dependencies as route_deps

# Register all routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(sensors_router)
app.include_router(predictions_router)
app.include_router(blockchain_router)
app.include_router(machines_router)
app.include_router(maintenance_router)
app.include_router(analytics_router)
app.include_router(automation_router)
app.include_router(notifications_router)
app.include_router(reports_router)
app.include_router(training_router)


# --- General Endpoints (kept in main) ---
@app.get("/", tags=["General"])
def read_root():
    return {"message": "Predictive Maintenance API çalışıyor. Tahmin için /predict endpoint'ine POST isteği gönderin."}


@app.get("/health", tags=["General"])
def health_check():
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "scaler_loaded": scaler is not None,
        "db_connected": db_manager.test_connection()
    }


@app.get("/model/info", tags=["Model"])
def get_model_info():
    try:
        model_info = {
            'loaded': model is not None,
            'scaler_loaded': scaler is not None,
            'model_path': str(FilePaths.MODEL_PATH),
            'scaler_path': str(FilePaths.SCALER_PATH)
        }

        if os.path.exists(FilePaths.MODEL_PATH):
            stat = os.stat(FilePaths.MODEL_PATH)
            model_info['model_file_size'] = f"{stat.st_size / 1024 / 1024:.2f} MB"
            model_info['model_modified'] = datetime.fromtimestamp(stat.st_mtime).isoformat()

        if model is not None:
            model_info['model_type'] = 'LSTM-CNN'
            model_info['input_shape'] = str(model.input_shape)
            model_info['output_shape'] = str(model.output_shape)
            model_info['total_params'] = model.count_params()
            model_info['trainable_params'] = sum([np.prod(v.shape) for v in model.trainable_weights])

        model_info['features'] = feature_names if feature_names else []

        return model_info
    except Exception as e:
        logger.error(f"Get model info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- WebSocket for Real-time ---
active_connections: Set[WebSocket] = set()


@app.websocket("/ws/realtime")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)

    try:
        while True:
            data = {
                'type': 'update',
                'timestamp': datetime.now().isoformat(),
                'machines': []
            }

            for machine_id in [1001, 2001, 3001]:
                history = db_manager.get_sensor_data(machine_id=machine_id, limit=1)
                if history:
                    latest = history[0]
                    data['machines'].append({
                        'machine_id': machine_id,
                        'health_score': round((1 - latest.get('prediction_probability', 0)) * 100, 1),
                        'status': 'CRITICAL' if latest.get('prediction', 0) == 1 else 'OPERATIONAL',
                        'tool_wear': latest.get('tool_wear', 0),
                        'last_update': latest.get('timestamp')
                    })

            await websocket.send_json(data)
            await asyncio.sleep(5)

    except WebSocketDisconnect:
        active_connections.discard(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        active_connections.discard(websocket)


if __name__ == "__main__":
    print("🚀 API sunucusu başlatılıyor...")
    print("API dökümantasyonu için http://127.0.0.1:8000/docs adresini ziyaret edin.")
    uvicorn.run("api_main:app", host="0.0.0.0", port=8000, reload=False, log_level="warning")
