import json
from pathlib import Path
import sys

# Repo kökünü import path'e ekle
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hybrid_blockchain_handler import HybridBlockchainHandler


def norm_int(v):
    if isinstance(v, int):
        return v
    s = str(v)
    return int(s, 16) if s.lower().startswith('0x') else int(s)


def main():
    h = HybridBlockchainHandler()
    vc = getattr(h, "_get_verifier_contract")()
    if not vc:
        print("verifier_contract: not loaded")
        return
    on = vc.functions.circuitKeys(0).call()
    # on: (alpha, beta, gamma, delta, IC, isSet) OR depending on ABI encoding order
    # Due to ABI tuple packing, web3 returns tuple with last element is isSet
    # We will attempt to parse by name using contract.caller if available; otherwise index-based.
    try:
        alpha_on, beta_on, gamma_on, delta_on, ic_on, is_set = on
    except Exception:
        # Fallback: sometimes the struct returns (alpha,beta,gamma,delta,isSet) without IC in older ABI
        print("unexpected tuple shape:", on)
        return

    print("isSet:", bool(is_set))
    print("IC on-chain length:", len(ic_on) if hasattr(ic_on, '__len__') else 'n/a')

    temp_dir = Path('temp/zk_proofs')
    vk_path = temp_dir / 'verification_key.json'
    if not vk_path.exists():
        print("local verification_key.json missing at", vk_path)
        return
    vk = json.loads(vk_path.read_text(encoding='utf-8'))

    def g1_from_json(pt):
        return [norm_int(pt[0]), norm_int(pt[1])]

    ic_local = [g1_from_json(pt) for pt in vk['IC']]
    # Only first 4 IC points are used (constant + 3 publics)
    ic_local4 = ic_local[:4]

    # Normalize on-chain IC to [[x,y], ...]
    ic_on_xy = [[norm_int(p[0]), norm_int(p[1])] for p in ic_on]

    same = ic_on_xy == ic_local4
    print("IC match:", same)
    if not same:
        print("on-chain IC:")
        for i, pt in enumerate(ic_on_xy):
            print(i, pt)
        print("local IC (first 4):")
        for i, pt in enumerate(ic_local4):
            print(i, pt)


if __name__ == '__main__':
    main()
