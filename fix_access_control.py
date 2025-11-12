#!/usr/bin/env python3
"""Access Control hızlı düzeltme"""
from web3 import Web3
import json
from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

# Deployment info yükle
deployment_file = Path("deployment_info_hybrid_ZKSYNC_ERA.json")
with open(deployment_file) as f:
    deployment = json.load(f)

# Web3 bağlantısı
rpc_url = os.getenv("ZKSYNC_ERA_RPC_URL")
private_key = os.getenv("PRIVATE_KEY")
web3 = Web3(Web3.HTTPProvider(rpc_url))
account = web3.eth.account.from_key(private_key)

print(f"👤 Account: {account.address}")

# AccessControlRegistry contract
access_control_addr = deployment['contracts']['AccessControlRegistry']['address']
print(f"🔑 AccessControl: {access_control_addr}")

# ABI yükle
with open("artifacts-zk/contracts/AccessControlRegistry.sol/AccessControlRegistry.json") as f:
    abi = json.load(f)['abi']

access_control = web3.eth.contract(address=access_control_addr, abi=abi)

# 1. Check existing nodes
print("\n📝 Checking nodes...")
try:
    nodes = access_control.functions.getNodesByAddress(account.address).call()
    print(f"Found {len(nodes)} nodes")
    
    if len(nodes) > 0:
        node_id = nodes[0]
        print(f"📋 Node ID: {node_id.hex()}")
        
        # Grant emergency access
        print("\n🔧 Granting emergency access...")
        sensor_data_resource = web3.keccak(text="SENSOR_DATA")
        
        tx = access_control.functions.grantEmergencyAccess(
            node_id,
            sensor_data_resource,
            "PDM System Access"
        ).build_transaction({
            'from': account.address,
            'nonce': web3.eth.get_transaction_count(account.address),
            'gas': 500000,
            'gasPrice': web3.eth.gas_price
        })
        
        signed = account.sign_transaction(tx)
        tx_hash = web3.eth.send_raw_transaction(signed.raw_transaction)
        print(f"📤 TX: {tx_hash.hex()}")
        
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"✅ Done! Status: {receipt.status}")
        exit(0)
        
except Exception as e:
    print(f"ℹ️ No nodes found: {e}")

# 2. Register new node
print("\n📝 Registering new node...")
tx = access_control.functions.registerNode(
    "PDM System",
    account.address,
    3,  # NodeType.DATA_PROCESSOR
    2,  # AccessLevel.WRITE_LIMITED (0=NO_ACCESS, 1=READ_ONLY, 2=WRITE_LIMITED, 3=FULL_ACCESS, 4=ADMIN_ACCESS)
    0,  # No expiry
    '{"version":"1.0"}'
).build_transaction({
    'from': account.address,
    'nonce': web3.eth.get_transaction_count(account.address),
    'gas': 500000,
    'gasPrice': web3.eth.gas_price
})

signed = account.sign_transaction(tx)
tx_hash = web3.eth.send_raw_transaction(signed.raw_transaction)
print(f"📤 TX: {tx_hash.hex()}")

receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
print(f"✅ Registered! Status: {receipt.status}")
print("\n🎉 Done! Şimdi sistemi tekrar deneyin.")

