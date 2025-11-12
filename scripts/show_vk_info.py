import json
from pathlib import Path

vk_path = Path('temp/zk_proofs/verification_key.json')
if not vk_path.exists():
    print('no verification_key.json at', vk_path)
else:
    vk = json.loads(vk_path.read_text(encoding='utf-8'))
    print('IC length:', len(vk['IC']))
    print('alpha:', vk['vk_alpha_1'])
    print('beta X:', vk['vk_beta_2'][0])
    print('gamma X:', vk['vk_gamma_2'][0])
    print('delta X:', vk['vk_delta_2'][0])

