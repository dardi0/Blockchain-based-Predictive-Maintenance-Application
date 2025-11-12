import json
import time
import sys
from pathlib import Path

# Repo kökünü import path'e ekle
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hybrid_blockchain_handler import HybridBlockchainHandler


def main():
    h = HybridBlockchainHandler()
    if not h.is_ready():
        print("{\"ok\": false, \"stage\": \"init\", \"error\": \"Blockchain not ready (RPC/private key/contracts)\"}")
        return

    # 1) Sensör kanıtını oluştur ve zincire gönder
    # Aynı ölçümü tekrar tekrar göndermemek için küçük bir oynatma (hash farklı olsun)
    jitter = (int(time.time()) % 7) - 3  # -3..+3
    sensor_payload = {
        'air_temp': 298.1,
        'process_temp': 308.6,
        'rotation_speed': 1551 + jitter,
        'torque': 42.8,
        'tool_wear': max(0, jitter),
        'machine_type': 'M'
    }
    sres = h.submit_sensor_data_hybrid(sensor_payload)

    if not sres or not isinstance(sres, dict):
        print(json.dumps({"ok": False, "stage": "sensor", "error": "no_result"}))
        return

    if not sres.get('blockchain_submitted'):
        print(json.dumps({
            "ok": False,
            "stage": "sensor",
            "error": sres.get('error', 'blockchain_not_submitted'),
            "result": sres
        }))
        return

    proof_id = sres.get('blockchain_proof_id')
    local_id = sres.get('local_data_id')
    if not proof_id:
        print(json.dumps({
            "ok": False,
            "stage": "sensor",
            "error": "missing_proof_id_after_submission",
            "result": sres
        }))
        return

    # 2) Prediction kanıtını proof_id referansı ile gönder
    pred_payload = {
        'prediction': 0,
        'probability': 0.15,
        'data_proof_id_onchain': int(proof_id)
    }
    pres = h.submit_prediction_hybrid_v2(pred_payload, sensor_data_id=int(local_id))

    print(json.dumps({
        "ok": bool(pres and pres.get('success')),
        "stage": "prediction",
        "result": pres
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
