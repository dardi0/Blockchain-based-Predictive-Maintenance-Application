import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hybrid_blockchain_handler import HybridBlockchainHandler


def main():
    h = HybridBlockchainHandler()
    print("ready:", h.is_ready())
    ok = h._upload_sensor_verifying_key()
    print("upload_result:", ok)


if __name__ == '__main__':
    main()

