import json
import sys
from pathlib import Path

# Repo kökünü import path'e ekle
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hybrid_blockchain_handler import HybridBlockchainHandler


def main():
    h = HybridBlockchainHandler()
    diag = h.diagnose()
    print(json.dumps(diag, indent=2))
    print("\nready:", h.is_ready())


if __name__ == "__main__":
    main()
