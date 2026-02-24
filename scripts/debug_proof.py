# -*- coding: utf-8 -*-
"""
Debug script - Sensor Data ZK Proof test
Bu script proof generation ve verification akisini test eder
"""

import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv
from web3 import Web3

# Fix encoding for Windows
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

load_dotenv()

def test_proof_verification():
    """Test proof verification directly on the verifier contract"""

    print("=" * 70)
    print("[DEBUG] SENSOR DATA ZK PROOF DEBUG")
    print("=" * 70)

    # Connect to zkSync
    rpc_url = os.getenv('ZKSYNC_ERA_RPC_URL')
    w3 = Web3(Web3.HTTPProvider(rpc_url))

    if not w3.is_connected():
        print("[ERROR] Cannot connect to zkSync")
        return

    print("[OK] Connected to zkSync Era Sepolia")

    # Contract addresses
    verifier_addr = os.getenv('VERIFIER_ADDRESS')
    pdm_addr = os.getenv('PDM_SYSTEM_ADDRESS')

    print(f"\n[INFO] Contract Addresses:")
    print(f"   Verifier: {verifier_addr}")
    print(f"   PDM System: {pdm_addr}")

    # Load verifier ABI
    verifier_abi_path = Path(__file__).parent.parent / "artifacts-zk" / "contracts" / "UnifiedGroth16Verifier.sol" / "UnifiedGroth16Verifier.json"

    if not verifier_abi_path.exists():
        print(f"[ERROR] Verifier ABI not found at {verifier_abi_path}")
        return

    with open(verifier_abi_path, 'r') as f:
        verifier_artifact = json.load(f)

    verifier = w3.eth.contract(address=verifier_addr, abi=verifier_artifact['abi'])

    # Check VK status
    print(f"\n" + "-" * 70)
    print("[1] CHECKING VK STATUS")
    print("-" * 70)

    try:
        ic_length = verifier.functions.getICLength(0).call()
        print(f"   CircuitType.SENSOR_DATA IC Length: {ic_length}")

        if ic_length == 4:
            print("   [OK] VK correctly set (4 IC points for 3 public inputs)")
        else:
            print(f"   [ERROR] VK IC length wrong! Expected 4, got {ic_length}")
            return
    except Exception as e:
        print(f"   [ERROR] Error reading VK: {e}")
        return

    # Generate a test proof
    print(f"\n" + "-" * 70)
    print("[2] GENERATING TEST PROOF")
    print("-" * 70)

    try:
        from zk_proof_generator import ZKProofGenerator, SensorData

        generator = ZKProofGenerator()

        # Create test sensor data
        test_sensor = SensorData(
            machine_id=1001,
            timestamp=int(w3.eth.get_block('latest')['timestamp']),
            air_temperature=298.5,
            process_temperature=308.2,
            rotational_speed=1500,
            torque=42.5,
            tool_wear=120,
            machine_type='M',
            submitter='0xD65418E1D8280219939270263813F5b5cAe3a8Df'
        )

        print(f"   Machine ID: {test_sensor.machine_id}")
        print(f"   Timestamp: {test_sensor.timestamp}")

        # Generate proof
        proof_result = generator.generate_sensor_proof_v2(test_sensor)

        if not proof_result:
            print("   [ERROR] Proof generation failed!")
            return

        print("   [OK] Proof generated successfully!")

        proof = proof_result.get('proof', {})
        public_inputs = proof_result.get('publicInputs', [])

        print(f"\n   Public Inputs ({len(public_inputs)}):")
        for i, inp in enumerate(public_inputs):
            print(f"      [{i}]: {inp}")

    except Exception as e:
        print(f"   [ERROR] Proof generation error: {e}")
        import traceback
        traceback.print_exc()
        return

    # Parse proof components
    print(f"\n" + "-" * 70)
    print("[3] PARSING PROOF COMPONENTS")
    print("-" * 70)

    try:
        # Extract a, b, c from proof
        if 'pi_a' in proof:
            a = [int(proof['pi_a'][0]), int(proof['pi_a'][1])]
            b_native = [[int(proof['pi_b'][0][0]), int(proof['pi_b'][0][1])],
                        [int(proof['pi_b'][1][0]), int(proof['pi_b'][1][1])]]
            c = [int(proof['pi_c'][0]), int(proof['pi_c'][1])]
        else:
            a = [int(proof['a'][0]), int(proof['a'][1])]
            b_native = [[int(proof['b'][0][0]), int(proof['b'][0][1])],
                        [int(proof['b'][1][0]), int(proof['b'][1][1])]]
            c = [int(proof['c'][0]), int(proof['c'][1])]

        # Convert public inputs to int
        public_inputs_int = [int(x) for x in public_inputs[:3]]

        print(f"   a[0]: {str(a[0])[:30]}...")
        print(f"   a[1]: {str(a[1])[:30]}...")
        print(f"   b_native[0][0]: {str(b_native[0][0])[:25]}...")
        print(f"   b_native[0][1]: {str(b_native[0][1])[:25]}...")
        print(f"   b_native[1][0]: {str(b_native[1][0])[:25]}...")
        print(f"   b_native[1][1]: {str(b_native[1][1])[:25]}...")
        print(f"   c[0]: {str(c[0])[:30]}...")
        print(f"   c[1]: {str(c[1])[:30]}...")
        print(f"   publicInputs: {public_inputs_int}")

    except Exception as e:
        print(f"   [ERROR] Proof parsing error: {e}")
        import traceback
        traceback.print_exc()
        return

    # Test verification with different B orderings
    print(f"\n" + "-" * 70)
    print("[4] TESTING VERIFICATION (2 VARIANTS)")
    print("-" * 70)

    # Variant 1: Native B (no swap)
    b_variants = {
        "native": b_native,
        "swapped": [[b_native[0][1], b_native[0][0]], [b_native[1][1], b_native[1][0]]],
    }

    for variant_name, b in b_variants.items():
        print(f"\n   Testing B variant: {variant_name}")

        try:
            result = verifier.functions.verifySensorDataProof(
                a, b, c, public_inputs_int
            ).call()

            if result:
                print(f"      [SUCCESS] VERIFICATION PASSED!")
            else:
                print(f"      [FAIL] Verification returned false")

        except Exception as e:
            error_msg = str(e)
            if "VK not set" in error_msg:
                print(f"      [ERROR] VK not set!")
            elif "bad inputs" in error_msg:
                print(f"      [ERROR] Bad inputs (IC length mismatch)")
            else:
                print(f"      [ERROR] {error_msg[:100]}")

    print("\n" + "=" * 70)
    print("DEBUG COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    test_proof_verification()
