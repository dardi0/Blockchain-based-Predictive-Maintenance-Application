"""
Blockchain Routes - Blockchain endpoint'leri

Endpoints:
- GET /blockchain/status - Blockchain durumu
- GET /blockchain/tx/{tx_hash} - İşlem detayları
- GET /blockchain/ledger - Ledger kayıtları
- POST /blockchain/prepare - Sensor proof hazırla
- POST /blockchain/prepare-prediction - Prediction proof hazırla
- POST /blockchain/submit-prediction-proof - Prediction proof gönder
- POST /blockchain/confirm - TX hash onayla
"""

import os
import time
import json
import logging
import hashlib
import requests
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .dependencies import get_db_manager, require_role, get_blockchain_handler, is_blockchain_ready

router = APIRouter(prefix="/blockchain", tags=["Blockchain"])
logger = logging.getLogger(__name__)


# --- Pydantic Models ---
class SensorData(BaseModel):
    air_temp_k: float = Field(default=298.0, ge=250.0, le=350.0)
    process_temp_k: float = Field(default=308.0, ge=250.0, le=400.0)
    rotational_speed_rpm: int = Field(default=1500, ge=0, le=5000)
    torque_nm: float = Field(default=40.0, ge=0.0, le=100.0)
    tool_wear_min: float = Field(default=0.0, ge=0.0, le=500.0)
    machine_type: str = Field(default="M")
    id: Optional[int] = Field(default=None)


class PrepareProofRequest(BaseModel):
    record_id: int


class ConfirmTxRequest(BaseModel):
    record_id: int
    tx_hash: str
    proof_id: Optional[str] = None
    is_prediction: bool = False


# --- Helper Functions ---
def decode_input_data(input_hex: str) -> dict:
    """Input data'yı decode eder."""
    if not input_hex or len(input_hex) < 10:
        return None

    try:
        selector = input_hex[:10].lower()
        data = input_hex[10:]

        known_functions = {
            "0xa4ea8d58": {
                "name": "submitSensorDataProof",
                "signature": "submitSensorDataProof(...)",
            }
        }

        func_info = known_functions.get(selector)

        if not func_info:
            return {
                "functionName": f"Unknown ({selector})",
                "functionSignature": None,
                "parameters": [],
                "raw": True
            }

        return {
            "functionName": func_info["name"],
            "functionSignature": func_info["signature"],
            "parameters": [],
            "raw": False
        }

    except Exception as e:
        logger.warning(f"Input decode error: {e}")
        return {
            "functionName": "Decode Error",
            "error": str(e),
            "raw": True
        }


# --- Endpoints ---
@router.get("/status")
def get_blockchain_status():
    """Blockchain handler sağlık durumu"""
    handler = get_blockchain_handler()
    ready = is_blockchain_ready()
    diagnostics = {"status": "Not Initialized"}

    if ready and handler and hasattr(handler, "diagnose"):
        try:
            diagnostics = handler.diagnose()
        except Exception as exc:
            diagnostics = {"error": str(exc)}

    return {
        "ready": ready,
        "diagnostics": diagnostics
    }


@router.get("/tx/{tx_hash}")
def get_transaction_details(tx_hash: str):
    """İşlem detaylarını zkSync API'den çeker."""
    try:
        RPC_URL = os.getenv("ZKSYNC_SEPOLIA_RPC", "https://sepolia.era.zksync.dev")

        def call_rpc(method: str, params: list):
            payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
            response = requests.post(RPC_URL, json=payload, timeout=10)
            return response.json().get("result")

        def hex_to_int(hex_val):
            if hex_val is None:
                return None
            if isinstance(hex_val, int):
                return hex_val
            return int(hex_val, 16) if hex_val.startswith("0x") else int(hex_val)

        def hex_to_eth(hex_val):
            if hex_val is None:
                return "0"
            wei = hex_to_int(hex_val)
            return f"{wei / 1e18:.8f}"

        zk_details = call_rpc("zks_getTransactionDetails", [tx_hash])
        tx_data = call_rpc("eth_getTransactionByHash", [tx_hash])
        tx_receipt = call_rpc("eth_getTransactionReceipt", [tx_hash])

        if not tx_data:
            raise HTTPException(status_code=404, detail="Transaction not found")

        receipt_status = tx_receipt.get("status") if tx_receipt else None
        zk_status = zk_details.get("status", "unknown") if zk_details else "unknown"

        if receipt_status == "0x1":
            final_status = zk_status.capitalize() if zk_status != "unknown" else "Success"
        elif receipt_status == "0x0":
            final_status = "Failed"
        else:
            final_status = "Pending"

        return {
            "txHash": tx_hash,
            "status": final_status,
            "blockNumber": hex_to_int(tx_data.get("blockNumber")),
            "from": tx_data.get("from"),
            "to": tx_data.get("to"),
            "value": hex_to_eth(tx_data.get("value")),
            "gasUsed": hex_to_int(tx_receipt.get("gasUsed")) if tx_receipt else None,
            "inputData": tx_data.get("input"),
            "decodedInput": decode_input_data(tx_data.get("input")),
            "explorerUrl": f"https://sepolia.explorer.zksync.io/tx/{tx_hash}"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get transaction details error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ledger")
def get_blockchain_ledger(limit: int = 500):
    """Blockchain'e kaydedilmiş işlemleri getir"""
    db = get_db_manager()

    try:
        conn = db.get_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database not available")

        try:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT %s", (limit,))
                columns = [desc[0] for desc in cur.description] if cur.description else []
                rows = [dict(zip(columns, row)) for row in cur.fetchall()]
        finally:
            db.return_connection(conn)

        records = []
        for r in rows:

            action = "Sensor Data Log"
            prediction_val = r.get('prediction')
            has_prediction_proof = bool(r.get('prediction_tx_hash'))

            if has_prediction_proof:
                action = "Prediction Proof Submitted"
            elif prediction_val == 1:
                action = "Failure Detected"
            elif prediction_val == 0:
                action = "Normal Operation"
            elif r.get('proof_id'):
                action = "Sensor Proof Verified"

            ts = r.get('timestamp')
            ts_iso = ts
            if isinstance(ts, (int, float)):
                ts_iso = datetime.fromtimestamp(ts).isoformat()

            prediction_info = None
            if prediction_val is not None:
                prediction_info = {
                    "prediction": int(prediction_val),
                    "probability": float(r.get('prediction_probability') or 0),
                    "reason": r.get('prediction_reason'),
                    "hasBlockchainProof": has_prediction_proof,
                    "predictionTxHash": r.get('prediction_tx_hash'),
                    "predictionProofId": r.get('prediction_proof_id')
                }

            records.append({
                "id": str(r['id']),
                "machineId": str(r['machine_id']),
                "action": action,
                "operatorAddress": r.get('recorded_by') or "Unknown",
                "timestamp": ts_iso,
                "verified": bool(r.get('blockchain_success')),
                "txHashFull": r.get('blockchain_tx_hash'),
                "sensorProofId": r.get('proof_id'),
                "predictionInfo": prediction_info
            })

        return {"records": records}

    except Exception as e:
        logger.error(f"Get ledger error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prepare")
def prepare_blockchain_proof(
    data: SensorData,
    machine_id: int,
    record_id: Optional[int] = None,
    user: dict = Depends(require_role('OPERATOR', 'ENGINEER'))
):
    """Frontend için ZK proof hazırlar"""
    db = get_db_manager()
    handler = get_blockchain_handler()

    try:
        current_ts = int(time.time())
        existing_record_id = record_id

        if record_id:
            saved_data = db.get_sensor_data(record_id=record_id)
            if saved_data and isinstance(saved_data, list) and len(saved_data) > 0:
                saved_record = saved_data[0]
                payload = {
                    "machine_id": saved_record['machine_id'],
                    "air_temp": float(saved_record['air_temp']),
                    "process_temp": float(saved_record['process_temp']),
                    "rotation_speed": float(saved_record['rotation_speed']),
                    "torque": float(saved_record['torque']),
                    "tool_wear": float(saved_record['tool_wear']),
                    "machine_type": saved_record['machine_type'],
                    "timestamp": saved_record['timestamp'],
                    "recorded_by": user.get('address', 'Unknown'),
                    "actor_role": user.get('role')
                }
            else:
                existing_record_id = None
                payload = {
                    "machine_id": machine_id,
                    "air_temp": float(data.air_temp_k),
                    "process_temp": float(data.process_temp_k),
                    "rotation_speed": float(data.rotational_speed_rpm),
                    "torque": float(data.torque_nm),
                    "tool_wear": float(data.tool_wear_min),
                    "machine_type": data.machine_type,
                    "timestamp": current_ts,
                    "recorded_by": user.get('address', 'Unknown'),
                    "actor_role": user.get('role')
                }
        else:
            payload = {
                "machine_id": machine_id,
                "air_temp": float(data.air_temp_k),
                "process_temp": float(data.process_temp_k),
                "rotation_speed": float(data.rotational_speed_rpm),
                "torque": float(data.torque_nm),
                "tool_wear": float(data.tool_wear_min),
                "machine_type": data.machine_type,
                "timestamp": current_ts,
                "recorded_by": user.get('address', 'Unknown'),
                "actor_role": user.get('role')
            }

        result = handler.prepare_sensor_proof(payload, pdm_id=existing_record_id)

        if result.get('success'):
            logger.info(f"Proof prepared for record #{result.get('record_id')}")

            args = result.get('proof_args', {})

            def make_safe(val):
                if isinstance(val, list):
                    return [make_safe(x) for x in val]
                return str(val)

            for key in ['a', 'b', 'c', 'public_inputs']:
                if key in args:
                    args[key] = make_safe(args[key])

            result['proof_args'] = args

            user_addr = user.get('address')
            if user_addr and user_addr != 'Unknown':
                try:
                    db.create_notification(
                        user_address=user_addr,
                        message="Sensor data saved locally. Please confirm in your wallet.",
                        notif_type="info"
                    )
                except Exception:
                    pass

            return Response(content=json.dumps(result), media_type="application/json")
        else:
            raise HTTPException(status_code=500, detail=result.get('error'))

    except Exception as e:
        logger.error(f"Prepare proof error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prepare-prediction")
def prepare_prediction_proof(
    request: PrepareProofRequest,
    user: dict = Depends(require_role('ENGINEER', 'OWNER'))
):
    """submitPredictionProof için argümanları hazırlar"""
    db = get_db_manager()

    try:
        record_id = request.record_id
        if not record_id:
            raise HTTPException(status_code=400, detail="record_id required")

        conn = db.get_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database not available")

        try:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM sensor_data WHERE id = %s", (record_id,))
                row = cur.fetchone()
                columns = [desc[0] for desc in cur.description] if cur.description else []
        finally:
            db.return_connection(conn)

        has_proof_id = True  # PostgreSQL schema always has proof_id

        if not row:
            raise HTTPException(status_code=404, detail="Record not found")

        record = dict(zip(columns, row))

        if record.get('prediction_tx_hash'):
            raise HTTPException(
                status_code=409,
                detail=f"Already recorded: {record.get('prediction_tx_hash')}"
            )

        data_proof_id = record.get('proof_id') if has_proof_id else None

        if not data_proof_id:
            raise HTTPException(
                status_code=400,
                detail="Sensor data must be verified on blockchain first."
            )

        pred_val = record.get('prediction', 0)
        pred_prob = record.get('prediction_probability', 0.0)
        confidence = int(pred_prob * 10000)

        pred_data = f"{record_id}-{pred_val}-{confidence}".encode()
        prediction_hash = "0x" + hashlib.sha256(pred_data).hexdigest()
        model_commitment = "0x" + hashlib.sha256(b"v1.1.0-LSTM-CNN").hexdigest()

        a = ["0x1234567890abcdef" * 4, "0x1234567890abcdef" * 4]
        b = [["0x1234567890abcdef" * 4, "0x1234567890abcdef" * 4], ["0x1234567890abcdef" * 4, "0x1234567890abcdef" * 4]]
        c = ["0x1234567890abcdef" * 4, "0x1234567890abcdef" * 4]

        data_proof_id_str = "{:.0f}".format(float(data_proof_id)) if data_proof_id else "0"

        public_inputs = [
            data_proof_id_str,
            str(int(prediction_hash, 16)),
            str(int(model_commitment, 16)),
            str(pred_val),
            str(confidence)
        ]

        response_data = {
            "record_id": record_id,
            "proof_args": {
                "dataProofId": data_proof_id_str,
                "predictionHash": prediction_hash,
                "modelCommitment": model_commitment,
                "prediction": str(pred_val),
                "confidence": str(confidence),
                "a": a,
                "b": b,
                "c": c,
                "publicInputs": public_inputs
            }
        }

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Prepare prediction proof error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/submit-prediction-proof")
def submit_prediction_proof(
    request: PrepareProofRequest,
    user: dict = Depends(require_role('ENGINEER', 'OWNER'))
):
    """Generate real ZK prediction proof and submit to blockchain."""
    db = get_db_manager()
    handler = get_blockchain_handler()

    try:
        record_id = request.record_id
        if not record_id:
            raise HTTPException(status_code=400, detail="record_id required")

        if not handler or not handler.is_ready():
            raise HTTPException(status_code=503, detail="Blockchain handler not available")

        conn = db.get_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database not available")

        try:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM sensor_data WHERE id = %s", (record_id,))
                row = cur.fetchone()
                columns = [desc[0] for desc in cur.description] if cur.description else []
        finally:
            db.return_connection(conn)

        if not row:
            raise HTTPException(status_code=404, detail="Record not found")

        record = dict(zip(columns, row))

        if record.get('prediction_tx_hash'):
            raise HTTPException(
                status_code=409,
                detail=f"Already on blockchain: {record.get('prediction_tx_hash')}"
            )

        data_proof_id = record.get('proof_id')
        if not data_proof_id:
            raise HTTPException(
                status_code=400,
                detail="Sensor data must be verified first."
            )

        prediction_data = {
            'prediction': int(record.get('prediction', 0)),
            'probability': float(record.get('prediction_probability', 0.0)),
            'data_proof_id_onchain': int(data_proof_id)
        }

        sensor_data_id = record['id']

        result = handler.submit_prediction_hybrid_v2(prediction_data, sensor_data_id)

        if result.get('success'):
            tx_hash = result.get('tx_hash')
            proof_id = result.get('local_prediction_id')

            db.update_blockchain_info(
                record_id=record_id,
                success=True,
                tx_hash=tx_hash,
                proof_id=proof_id,
                is_prediction=True
            )

            user_addr = user.get('address')
            if user_addr and user_addr != 'Unknown':
                db.create_notification(
                    user_address=user_addr,
                    message=f"Prediction verified for Machine #{record.get('machine_id')}",
                    notif_type="success",
                    tx_hash=tx_hash
                )

            return {
                "success": True,
                "record_id": record_id,
                "tx_hash": tx_hash,
                "proof_id": proof_id
            }
        else:
            raise HTTPException(status_code=500, detail=result.get('error', 'Unknown error'))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Submit prediction proof error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session-key-status")
def get_session_key_status():
    """Her rol için ephemeral session key durumunu döndür."""
    handler = get_blockchain_handler()
    if not handler:
        return {
            "available": False,
            "roles": {
                "OPERATOR": {"active": False, "address": None, "smart_account": None},
                "ENGINEER": {"active": False, "address": None, "smart_account": None},
            }
        }

    session_keys = getattr(handler, '_ephemeral_session_keys', {})
    smart_account_map = getattr(handler, 'smart_account_map', {})

    roles: Dict[str, Any] = {}
    for role in ('OPERATOR', 'ENGINEER'):
        sk = session_keys.get(role)
        roles[role] = {
            "active": sk is not None,
            "address": sk.get('address') if sk else None,
            "smart_account": smart_account_map.get(role),
        }

    return {
        "available": any(v["active"] for v in roles.values()),
        "roles": roles,
    }


@router.post("/submit-sensor")
def submit_sensor_via_backend(
    data: SensorData,
    machine_id: int,
    user: dict = Depends(require_role('OPERATOR', 'ENGINEER'))
):
    """
    Sensor proof'u backend üzerinden blockchain'e gönder.
    OPERATOR için Smart Account (session key) varsa type-113 TX,
    yoksa standart EOA imzalaması kullanılır.
    Frontend'in MetaMask ile TX imzalamasına gerek kalmaz.
    """
    db = get_db_manager()
    handler = get_blockchain_handler()

    if not handler or not handler.is_ready():
        raise HTTPException(status_code=503, detail="Blockchain handler not available")

    try:
        payload = {
            "machine_id": machine_id,
            "air_temp": float(data.air_temp_k),
            "process_temp": float(data.process_temp_k),
            "rotation_speed": float(data.rotational_speed_rpm),
            "torque": float(data.torque_nm),
            "tool_wear": float(data.tool_wear_min),
            "machine_type": data.machine_type,
            "timestamp": int(time.time()),
            "recorded_by": user.get('address', 'Unknown'),
            "actor_role": user.get('role'),
        }

        result = handler.submit_sensor_data_hybrid(payload)

        if result.get('success'):
            tx_hash = result.get('tx_hash')
            proof_id = result.get('blockchain_proof_id')
            record_id = result.get('record_id')

            session_keys = getattr(handler, '_ephemeral_session_keys', {})
            smart_account_map = getattr(handler, 'smart_account_map', {})
            submission_mode = (
                "smart_account"
                if smart_account_map.get('OPERATOR') and 'OPERATOR' in session_keys
                else "eoa"
            )

            user_addr = user.get('address')
            if user_addr and user_addr != 'Unknown':
                try:
                    db.create_notification(
                        user_address=user_addr,
                        message=f"Sensor data submitted via {submission_mode.replace('_', ' ').title()}",
                        notif_type="success",
                        tx_hash=tx_hash,
                    )
                except Exception:
                    pass

            return {
                "success": True,
                "tx_hash": tx_hash,
                "proof_id": str(proof_id) if proof_id is not None else None,
                "record_id": record_id,
                "submission_mode": submission_mode,
            }
        else:
            raise HTTPException(status_code=500, detail=result.get('error', 'Submission failed'))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Submit sensor via backend error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/confirm")
def confirm_blockchain_tx(
    request: ConfirmTxRequest,
    user: dict = Depends(require_role('OPERATOR', 'ENGINEER'))
):
    """Frontend'den gönderilen TX hash'i kaydeder"""
    db = get_db_manager()

    try:
        success = db.update_blockchain_info(
            record_id=request.record_id,
            success=True,
            tx_hash=request.tx_hash,
            proof_id=request.proof_id,
            is_prediction=request.is_prediction
        )

        if success:
            user_addr = user.get('address')
            if user_addr and user_addr != 'Unknown':
                msg = "Prediction" if request.is_prediction else "Sensor data"
                db.create_notification(
                    user_address=user_addr,
                    message=f"{msg} proof verified on blockchain",
                    notif_type="success",
                    tx_hash=request.tx_hash
                )

            return {"success": True, "message": "Transaction recorded"}
        else:
            raise HTTPException(status_code=500, detail="Database update failed")

    except Exception as e:
        logger.error(f"Confirm tx error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
