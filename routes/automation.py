"""
Automation Routes - Chainlink Automation endpoint'leri

Endpoints:
- GET /automation/sensor-batch - Sensor batch for automation
- POST /automation/generate-proof - Generate proof for automation
- POST /automation/create-maintenance-task - Create maintenance task
- GET /automation/status - Automation status
- GET /automation/listener-status - Listener status
- POST /automation/listener-restart - Restart listener
- GET /automation/contracts - Chainlink contract info
- GET /automation/events - Recent automation events
"""

import os
import json
import time
import logging
import asyncio
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Header

from .dependencies import get_db_manager, get_blockchain_handler

router = APIRouter(prefix="/automation", tags=["Automation"])
logger = logging.getLogger(__name__)

# Global references (set by api_main)
_automation_listener = None
_automation_listener_task = None
_automation_enabled = False
_has_automation_listener = False
_restart_listener_task = None
_trigger_manual_prediction = None


def set_automation_refs(listener, task, enabled, has_listener):
    """Called by api_main on startup to set automation references."""
    global _automation_listener, _automation_listener_task, _automation_enabled, _has_automation_listener
    _automation_listener = listener
    _automation_listener_task = task
    _automation_enabled = enabled
    _has_automation_listener = has_listener


def get_automation_refs():
    """Get automation references."""
    return _automation_listener, _automation_listener_task, _automation_enabled, _has_automation_listener


def set_control_functions(restart_listener_task=None, trigger_manual_prediction=None):
    """Set control functions (called by api_main)."""
    global _restart_listener_task, _trigger_manual_prediction
    _restart_listener_task = restart_listener_task
    _trigger_manual_prediction = trigger_manual_prediction


# --- API Key Verification ---
CHAINLINK_AUTOMATION_API_KEY = os.getenv("CHAINLINK_AUTOMATION_API_KEY", "")

if not CHAINLINK_AUTOMATION_API_KEY:
    logger.debug(
        "CHAINLINK_AUTOMATION_API_KEY not set — "
        "generate-proof and create-maintenance-task endpoints require auth if called externally. "
        "Not needed when using BackendOracleConsumer pattern only."
    )


def verify_automation_key(x_automation_key: str = Header(None)):
    """Verify Chainlink automation API key.

    If the API key env var is not configured, write endpoints are BLOCKED to prevent
    unauthenticated access. Read-only endpoints (sensor-batch, status) remain accessible.
    """
    if not CHAINLINK_AUTOMATION_API_KEY:
        raise HTTPException(
            status_code=503,
            detail=(
                "Automation API key not configured on server. "
                "Set CHAINLINK_AUTOMATION_API_KEY in the environment."
            )
        )
    if x_automation_key != CHAINLINK_AUTOMATION_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid automation API key")
    return True


def verify_automation_key_optional(x_automation_key: str = Header(None)):
    """Verify key for read-only endpoints — allows access when key is unconfigured."""
    if not CHAINLINK_AUTOMATION_API_KEY:
        return True
    if x_automation_key != CHAINLINK_AUTOMATION_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid automation API key")
    return True


# --- Endpoints ---
@router.get("/sensor-batch")
def get_sensor_batch_for_automation(limit: int = 10, _: bool = Depends(verify_automation_key_optional)):
    """Returns latest sensor data batch for Chainlink Functions DON."""
    db = get_db_manager()

    try:
        conn = db.get_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database not available")

        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, machine_id, air_temp, process_temp, rotation_speed,
                           torque, tool_wear, machine_type, timestamp
                    FROM sensor_data
                    WHERE prediction IS NULL
                    ORDER BY timestamp DESC
                    LIMIT %s
                """, (limit,))
                columns = [desc[0] for desc in cur.description] if cur.description else []
                rows = [dict(zip(columns, row)) for row in cur.fetchall()]
        finally:
            db.return_connection(conn)

        sensors = []
        for row in rows:
            sensors.append({
                "id": row.get('id'),
                "machine_id": row.get('machine_id'),
                "air_temp": row.get('air_temp'),
                "process_temp": row.get('process_temp'),
                "rotation_speed": row.get('rotation_speed'),
                "torque": row.get('torque'),
                "tool_wear": row.get('tool_wear'),
                "machine_type": row.get('machine_type'),
                "timestamp": row.get('timestamp')
            })

        return {"sensors": sensors, "count": len(sensors)}

    except Exception as e:
        logger.error(f"Automation sensor batch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-proof")
def generate_proof_for_automation(
    machine_id: int,
    data_hash: str,
    prediction: int,
    confidence: float,
    _: bool = Depends(verify_automation_key)
):
    """Generates ZK proof for automated prediction."""
    db = get_db_manager()
    handler = get_blockchain_handler()

    try:
        if not handler:
            raise HTTPException(status_code=503, detail="Blockchain handler not available")

        conn = db.get_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database not available")

        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT * FROM sensor_data
                    WHERE machine_id = %s
                    ORDER BY timestamp DESC
                    LIMIT 1
                """, (machine_id,))
                row = cur.fetchone()
                columns = [desc[0] for desc in cur.description] if cur.description else []
        finally:
            db.return_connection(conn)

        if not row:
            raise HTTPException(status_code=404, detail=f"Sensor data not found for machine {machine_id}")

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

        # Update sensor record with prediction
        db.update_sensor_prediction(
            record_id=record['id'],
            prediction=prediction,
            probability=confidence / 10000.0,
            reason="Chainlink Automation"
        )

        prediction_data = {
            'prediction': prediction,
            'probability': confidence / 10000.0,
            'data_proof_id_onchain': int(data_proof_id)
        }

        sensor_data_id = record['id']
        result = handler.submit_prediction_hybrid_v2(prediction_data, sensor_data_id)

        if result.get('success'):
            tx_hash = result.get('tx_hash')
            proof_id = result.get('local_prediction_id')

            db.update_blockchain_info(
                record_id=record['id'],
                success=True,
                tx_hash=tx_hash,
                proof_id=proof_id,
                is_prediction=True
            )

            return {
                "success": True,
                "record_id": record['id'],
                "tx_hash": tx_hash,
                "proof_id": proof_id
            }
        else:
            raise HTTPException(status_code=500, detail=result.get('error', 'Unknown error'))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Automation generate proof error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-maintenance-task")
def create_maintenance_task_automated(
    machine_id: int,
    prediction_proof_id: int,
    failure_type: str = "Predicted Failure",
    priority: str = "high",
    _: bool = Depends(verify_automation_key)
):
    """Creates maintenance task when failure predicted."""
    db = get_db_manager()

    try:
        engineers = db.get_users_by_role("ENGINEER")
        assigned_engineer = engineers[0] if engineers else None

        task = {
            "machine_id": machine_id,
            "prediction_proof_id": prediction_proof_id,
            "failure_type": failure_type,
            "priority": priority,
            "assigned_to": assigned_engineer['address'] if assigned_engineer else None,
            "status": "pending",
            "created_at": int(time.time()),
            "created_by": "Chainlink Automation"
        }

        conn = db.get_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database not available")

        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO maintenance_tasks
                    (machine_id, prediction_proof_id, failure_type, priority, assigned_to, status, created_at, created_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    task['machine_id'],
                    task['prediction_proof_id'],
                    task['failure_type'],
                    task['priority'],
                    task['assigned_to'],
                    task['status'],
                    task['created_at'],
                    task['created_by']
                ))
                task_id = cur.fetchone()[0]
            conn.commit()
        finally:
            db.return_connection(conn)

        if assigned_engineer:
            db.create_notification(
                user_address=assigned_engineer['address'],
                message=f"[AUTOMATED] New {priority} priority task for Machine #{machine_id}",
                notif_type="warning"
            )

        return {"success": True, "task_id": task_id, "assigned_to": task['assigned_to']}

    except Exception as e:
        logger.error(f"Automation create maintenance task error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
def get_automation_status():
    """Returns current automation status and statistics."""
    db = get_db_manager()

    try:
        conn = db.get_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="Database not available")

        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM sensor_data WHERE prediction IS NULL")
                pending_predictions = cur.fetchone()[0]

                yesterday = int(time.time()) - 86400
                cur.execute("""
                    SELECT COUNT(*) FROM sensor_data
                    WHERE prediction_reason = 'Chainlink Automation'
                    AND timestamp > %s
                """, (yesterday,))
                automated_last_24h = cur.fetchone()[0]

                cur.execute("""
                    SELECT COUNT(*) FROM sensor_data
                    WHERE prediction = 1
                    AND prediction_reason = 'Chainlink Automation'
                """)
                failures_detected = cur.fetchone()[0]
        finally:
            db.return_connection(conn)

        return {
            "pending_predictions": pending_predictions,
            "automated_last_24h": automated_last_24h,
            "failures_detected": failures_detected,
            "automation_enabled": _automation_enabled,
            "timestamp": int(time.time())
        }

    except Exception as e:
        logger.error(f"Automation status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/listener-status")
def get_listener_status():
    """Get automation event listener status."""
    listener, task, enabled, has_listener = get_automation_refs()

    if not has_listener:
        return {
            "available": False,
            "reason": "Automation listener module not installed"
        }

    if not enabled:
        return {
            "available": True,
            "enabled": False,
            "reason": "Disabled via AUTOMATION_LISTENER_ENABLED=false"
        }

    is_running = (
        listener is not None and
        listener.running and
        task is not None and
        not task.done()
    )

    result = {
        "available": True,
        "enabled": enabled,
        "running": is_running,
        "last_processed_block": listener.last_processed_block if listener else None,
        "poll_interval": int(os.getenv("POLL_INTERVAL", "30"))
    }

    if listener and hasattr(listener, 'oracle_contract'):
        try:
            result["oracle_contract"] = listener.oracle_contract.address if listener.oracle_contract else None
        except:
            pass

    return result


@router.post("/listener-restart")
async def restart_listener(_: bool = Depends(verify_automation_key)):
    """Restart the automation event listener."""
    if not _restart_listener_task:
        raise HTTPException(status_code=503, detail="Restart function not available")
    
    success = await _restart_listener_task()
    if success:
        return {"success": True, "message": "Listener restarted successfully"}
    else:
        return {"success": False, "message": "Failed to restart listener"}


@router.post("/trigger-prediction")
async def trigger_prediction(_: bool = Depends(verify_automation_key), x_wallet_address: Optional[str] = Header(None)):
    """Manually trigger a prediction cycle."""
    if not _trigger_manual_prediction:
        raise HTTPException(status_code=503, detail="Manual trigger function not available")
    
    result = await _trigger_manual_prediction(x_wallet_address)
    if result.get("success"):
        return result
    else:
        raise HTTPException(status_code=500, detail=result.get("message", "Trigger failed"))


@router.get("/contracts")
def get_chainlink_contracts():
    """Returns Chainlink contract addresses and on-chain configuration."""
    # Load deployment info
    deployment_path = Path(__file__).parent.parent / "chainlink_deployment_info.json"
    deployment_info = {}
    try:
        if deployment_path.exists():
            with open(deployment_path, 'r') as f:
                deployment_info = json.load(f)
    except Exception as e:
        logger.warning(f"Could not load chainlink deployment info: {e}")

    contracts = deployment_info.get('contracts', {})
    linked = deployment_info.get('linkedContracts', {})

    # Get on-chain status from listener if available
    listener, _, _, _ = get_automation_refs()
    on_chain = {}
    if listener and listener.automation_contract:
        try:
            status = listener.automation_contract.functions.getAutomationStatus().call()
            on_chain = {
                "time_since_last_sensor": status[0],
                "time_since_last_report": status[1],
                "pending_to_process": status[2],
                "sensor_due": status[3],
                "report_due": status[4],
            }
            on_chain["pending_count"] = listener.automation_contract.functions.pendingCount().call()
            on_chain["processed_count"] = listener.automation_contract.functions.processedCount().call()
            on_chain["failure_threshold"] = listener.automation_contract.functions.failureThreshold().call()
            on_chain["sensor_interval"] = listener.automation_contract.functions.sensorCollectionInterval().call()
            on_chain["report_interval"] = listener.automation_contract.functions.reportGenerationInterval().call()
        except Exception as e:
            logger.debug(f"Could not fetch on-chain status: {e}")

    # Oracle contract info
    oracle_info = {}
    if listener and listener.oracle_contract:
        try:
            oracle_info["request_count"] = listener.oracle_contract.functions.getRequestHistoryLength().call()
            oracle_info["trusted_oracle"] = listener.oracle_contract.functions.trustedOracle().call()
        except Exception as e:
            logger.debug(f"Could not fetch oracle info: {e}")

    return {
        "network": deployment_info.get("network", "ZKSYNC_ERA_SEPOLIA"),
        "chain_id": deployment_info.get("chainId", 300),
        "deployer": deployment_info.get("deployer"),
        "contracts": {
            "BackendOracleConsumer": contracts.get("BackendOracleConsumer", {}),
            "ChainlinkPdMAutomation": contracts.get("ChainlinkPdMAutomation", {}),
            "PdMFunctionsConsumer": contracts.get("PdMFunctionsConsumer", {}),
        },
        "linked_contracts": {
            "AccessControlRegistry": linked.get("AccessControlRegistry"),
            "PdMSystemHybrid": linked.get("PdMSystemHybrid"),
        },
        "active_consumer": deployment_info.get("activeConsumer", "PdMFunctionsConsumer"),
        "on_chain_status": on_chain,
        "oracle_info": oracle_info,
        "explorer_base": "https://sepolia.explorer.zksync.io",
    }


@router.get("/events")
def get_recent_events(limit: int = 20):
    """Returns recent automation events from the listener."""
    listener, _, _, _ = get_automation_refs()

    events = []

    if not listener or not listener.w3:
        return {"events": events, "count": 0}

    try:
        current_block = listener.w3.eth.block_number
        from_block = max(0, current_block - 5000)  # Last ~5000 blocks

        # Fetch PredictionRequested events
        if listener.oracle_contract:
            try:
                pred_events = listener.oracle_contract.events.PredictionRequested.get_logs(
                    from_block=from_block, to_block=current_block
                )
                for evt in pred_events[-limit:]:
                    events.append({
                        "type": "PredictionRequested",
                        "block": evt['blockNumber'],
                        "tx_hash": evt['transactionHash'].hex(),
                        "request_id": evt['args']['requestId'].hex(),
                        "timestamp": evt['args']['timestamp'],
                        "requester": evt['args']['requester'],
                    })
            except Exception:
                pass

            # Fetch PredictionFulfilled events
            try:
                fulfilled_events = listener.oracle_contract.events.PredictionFulfilled.get_logs(
                    from_block=from_block, to_block=current_block
                )
                for evt in fulfilled_events[-limit:]:
                    events.append({
                        "type": "PredictionFulfilled",
                        "block": evt['blockNumber'],
                        "tx_hash": evt['transactionHash'].hex(),
                        "request_id": evt['args']['requestId'].hex(),
                        "machine_id": evt['args']['machineId'],
                        "prediction": evt['args']['prediction'],
                        "confidence": evt['args']['confidence'],
                    })
            except Exception:
                pass

        # Fetch FailureDetected and MaintenanceTaskRequested from automation
        if listener.automation_contract:
            try:
                failure_events = listener.automation_contract.events.FailureDetected.get_logs(
                    from_block=from_block, to_block=current_block
                )
                for evt in failure_events[-limit:]:
                    events.append({
                        "type": "FailureDetected",
                        "block": evt['blockNumber'],
                        "tx_hash": evt['transactionHash'].hex(),
                        "machine_id": evt['args']['machineId'],
                        "confidence": evt['args']['confidence'],
                        "timestamp": evt['args']['timestamp'],
                    })
            except Exception:
                pass

            try:
                maint_events = listener.automation_contract.events.MaintenanceTaskRequested.get_logs(
                    from_block=from_block, to_block=current_block
                )
                for evt in maint_events[-limit:]:
                    events.append({
                        "type": "MaintenanceTaskRequested",
                        "block": evt['blockNumber'],
                        "tx_hash": evt['transactionHash'].hex(),
                        "machine_id": evt['args']['machineId'],
                        "prediction_id": evt['args']['predictionId'],
                    })
            except Exception:
                pass

    except Exception as e:
        logger.error(f"Error fetching events: {e}")

    # Sort by block number descending
    events.sort(key=lambda x: x.get('block', 0), reverse=True)

    return {"events": events[:limit], "count": len(events)}
