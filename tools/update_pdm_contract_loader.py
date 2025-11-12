import re
from pathlib import Path


FILE = Path("pdm_main.py")

SAFE_BODY = '''
def _load_contracts(self):
    """Contract'ları yükler (hata durumunda False döner)."""
    try:
        if not DEPLOYMENT_INFO_PATH.exists():
            print(f"⚠️ {DEPLOYMENT_INFO_PATH} bulunamadı - contract'lar yüklenmedi")
            return False

        with open(DEPLOYMENT_INFO_PATH, encoding='utf-8') as f:
            self.deployment_info = json.load(f)

        if not PDM_ARTIFACTS_PATH.exists():
            print("⚠️ Contract artifacts bulunamadı")
            return False

        with open(PDM_ARTIFACTS_PATH, encoding='utf-8') as f:
            pdm_artifact = json.load(f)

        pdm_address = None
        if isinstance(self.deployment_info, dict):
            contracts = self.deployment_info.get('contracts', {})
            if 'PdMSystemIntegrated' in contracts:
                pdm_address = (contracts.get('PdMSystemIntegrated') or {}).get('address')
            if not pdm_address:
                pdm_address = (
                    self.deployment_info.get('pdm_system_integrated_address') or
                    self.deployment_info.get('pdm_system_address')
                )

        if not pdm_address:
            print("⚠️ Deployment dosyasında kontrat adresi bulunamadı.")
            try:
                print(f"   ✅ Dosya anahtarları: {list((self.deployment_info or {}).keys())}")
                if isinstance(self.deployment_info, dict) and 'contracts' in self.deployment_info:
                    print(f"   ✅ Contracts: {list(self.deployment_info['contracts'].keys())}")
            except Exception:
                pass
            return False

        # Sözleşme örneğini oluştur
        self.pdm_contract = self.web3.eth.contract(
            address=self.web3.to_checksum_address(pdm_address),
            abi=pdm_artifact['abi']
        )

        print(f"✅ PDM Contract Yüklendi: {pdm_address}")
        print(f"🎯 {self.network_name} blockchain sistemi tamamen hazır!")
        return True

    except FileNotFoundError as file_e:
        print(f"⚠️ Dosya bulunamadı: {file_e}")
        return False
    except json.JSONDecodeError as json_e:
        print(f"⚠️ JSON parse hatası: {json_e}")
        return False
    except Exception as contract_e:
        print(f"⚠️ Contract yükleme hatası: {contract_e}")
            return False
'''.strip() + "\n"


def main():
    src = FILE.read_text(encoding="utf-8", errors="replace")

    # 1) initialize içindeki çağrıyı düzelt
    src = src.replace("_load_contracts_safe()", "_load_contracts()")

    # 2) _load_contracts fonksiyonunu güvenli gövde ile, sınıf içi girintili olarak değiştir
    pattern_func = re.compile(r"\n\s*def\s+_load_contracts\(self\):[\s\S]*?(?=\n\s*def\s+|\Z)", re.M)
    new_func = "\n" + ("    " + SAFE_BODY.replace("\n", "\n    "))
    if pattern_func.search(src):
        src = pattern_func.sub(new_func, src)

    # 3) _load_contracts_safe fonksiyonunu kaldır
    pattern_safe = re.compile(r"\n\s*def\s+_load_contracts_safe\(self\):[\s\S]*?(?=\n\s*def\s+|\Z)")
    src = pattern_safe.sub("\n", src)

    FILE.write_text(src, encoding="utf-8")


if __name__ == "__main__":
    main()
