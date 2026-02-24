import os
import json
from pathlib import Path
from typing import Optional

try:
    from eth_account import Account
except Exception:  # pragma: no cover
    Account = None  # type: ignore

try:
    # Yerel config yardımcıları mevcutsa kullan
    import config
    from config import ConfigUtils
except Exception:  # pragma: no cover
    config = None  # type: ignore
    ConfigUtils = None  # type: ignore


def _derive_address_from_private_key(pk: str) -> Optional[str]:
    if not pk or not Account:
        return None
    pk_norm = str(pk).strip().strip('"').strip("'").replace(' ', '')
    if not pk_norm:
        return None
    if not pk_norm.lower().startswith('0x'):
        pk_norm = '0x' + pk_norm
    try:
        acct = Account.from_key(pk_norm)
        return acct.address
    except Exception:
        return None


def get_default_address() -> str:
    """
    Demo ve yardımcı scriptler için varsayılan EOA adresini döndürür.
    Öncelik sırası:
      1) Env: PRIVATE_KEY / Private_Key -> adres türet
      2) deployment_info_hybrid_ZKSYNC_ERA.json içindeki "deployer"
    """
    # 1) Env'den PK bul ve adres türet
    pk_candidates = [
        os.getenv('MANAGER_PRIVATE_KEY'),
        os.getenv('ENGINEER_PRIVATE_KEY'),
        os.getenv('OPERATOR_PRIVATE_KEY'),
        os.getenv('PRIVATE_KEY') or os.getenv('Private_Key')
    ]
    pk = next((val for val in pk_candidates if val), None)
    # Config.EnvConfig varsa oradan da dene
    try:
        if not pk and hasattr(config, 'EnvConfig'):
            pk = getattr(config.EnvConfig, 'get_PRIVATE_KEY', lambda: None)()  # type: ignore
    except Exception:
        pass

    addr = _derive_address_from_private_key(pk) if pk else None
    if addr:
        return addr

    # 2) Deployment info dosyasından al
    dep_path: Optional[Path] = None
    try:
        if ConfigUtils and hasattr(ConfigUtils, 'get_deployment_info_path'):
            dep_path = ConfigUtils.get_deployment_info_path()
    except Exception:
        dep_path = None
    if not dep_path:
        dep_path = Path('deployment_info_hybrid_ZKSYNC_ERA.json')

    if dep_path and dep_path.exists():
        try:
            with open(dep_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, dict) and data.get('deployer'):
                return str(data['deployer'])
        except Exception:
            pass

    raise ValueError('Varsayılan adres belirlenemedi: PRIVATE_KEY veya deployment_info bulunamadı')

