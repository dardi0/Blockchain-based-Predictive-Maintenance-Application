import sys
import json
import ast
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hybrid_blockchain_handler import HybridBlockchainHandler


def main():
    cmd = [
        "npx", "--yes", "snarkjs", "zkey", "export", "soliditycalldata",
        "temp/zk_proofs/sensor_data_proof_public.json",
        "temp/zk_proofs/sensor_data_proof_proof.json",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(json.dumps({"ok": False, "error": res.stderr}))
        return
    text = res.stdout.strip()
    calldata = ast.literal_eval('[' + text + ']')
    A, B, C, INPUTS = calldata
    A = [int(x, 16) for x in A]
    B = [[int(x, 16) for x in row] for row in B]
    C = [int(x, 16) for x in C]
    INPUTS = [int(x, 16) for x in INPUTS]

    h = HybridBlockchainHandler()
    vc = getattr(h, "_get_verifier_contract")()
    if not vc:
        print(json.dumps({"ok": False, "error": "verifier_contract_not_loaded"}))
        return
    ok = vc.functions.verifySensorDataProof(A, B, C, INPUTS).call()
    print(json.dumps({"ok": bool(ok), "inputs": INPUTS}))


if __name__ == '__main__':
    main()

