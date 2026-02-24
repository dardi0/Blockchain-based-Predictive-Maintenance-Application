import os
import json
from dotenv import load_dotenv
from eth_account import Account
from zksync2.core.types import ZkBlockParams
from zksync2.module.module_builder import ZkSyncBuilder
from zksync2.signer.eth_signer import PrivateKeyEthSigner
from zksync2.transaction.transaction_builders import TxFunctionCall
from web3 import Web3

load_dotenv()
RPC_URL = os.getenv("ZKSYNC_ERA_RPC_URL", "https://sepolia.era.zksync.dev")

web3 = ZkSyncBuilder.build(RPC_URL)
owner_pk = os.getenv("OPERATOR_PRIVATE_KEY")
signer = PrivateKeyEthSigner(Account.from_key(owner_pk), web3.eth.chain_id)

tx_func_call = TxFunctionCall(
    chain_id=web3.eth.chain_id,
    nonce=1,
    from_=Web3.to_checksum_address(os.getenv("OPERATOR_SMART_ACCOUNT")),
    to=Web3.to_checksum_address(os.getenv("OPERATOR_SMART_ACCOUNT")),
    data=b"",
    gas_limit=2_000_000,
    gas_price=25000000,
    max_priority_fee_per_gas=0
)
tx_712 = tx_func_call.tx712(2000000)
print("DIR of tx712:", dir(tx_712))
print("DIR of signer:", dir(signer))
try:
    print("Method to_eip712_struct exists:", hasattr(tx_712, "to_eip712_struct"))
except:
    pass
