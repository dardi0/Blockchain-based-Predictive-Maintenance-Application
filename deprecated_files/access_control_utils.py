# -*- coding: utf-8 -*-
"""
🔐 Access Control Utilities - Erişim Kontrolü Yardımcı Fonksiyonları
===================================================================
Bu modül AccessControlRegistry sözleşmesi ile etkileşim için gerekli
yardımcı fonksiyonları içerir.
"""

import json
import logging
from web3 import Web3
from typing import Tuple, Optional, Dict, Any
from enum import IntEnum

# Config'ten import
from config import BlockchainConfig

class NodeType(IntEnum):
    """Düğüm türleri"""
    UNDEFINED = 0
    VERIFICATION_NODE = 1
    FAILURE_ANALYZER = 2
    DATA_PROCESSOR = 3
    MAINTENANCE_MANAGER = 4
    AUDIT_NODE = 5
    GATEWAY_NODE = 6

class AccessLevel(IntEnum):
    """Erişim seviyeleri"""
    NO_ACCESS = 0
    READ_ONLY = 1
    WRITE_LIMITED = 2
    FULL_ACCESS = 3
    ADMIN_ACCESS = 4

class NodeStatus(IntEnum):
    """Düğüm durumları"""
    INACTIVE = 0
    ACTIVE = 1
    SUSPENDED = 2
    MAINTENANCE = 3
    DEPRECATED = 4

class AccessControlManager:
    """
    AccessControlRegistry sözleşmesi ile etkileşim yöneten sınıf
    """
    
    def __init__(self, web3_instance: Web3, contract_address: str, private_key: str):
        """
        AccessControlManager'ı başlatır
        
        Args:
            web3_instance: Web3 bağlantısı
            contract_address: AccessControlRegistry contract adresi
            private_key: İşlem imzalama için private key
        """
        self.w3 = web3_instance
        self.contract_address = Web3.toChecksumAddress(contract_address)
        self.private_key = private_key
        self.account = self.w3.eth.account.from_key(private_key)
        
        # Contract ABI'yi yükle
        self.contract_abi = self._load_contract_abi()
        self.contract = self.w3.eth.contract(
            address=self.contract_address,
            abi=self.contract_abi
        )
        
        # Resource hash'leri (sözleşmelerle uyumlu olması için)
        self.RESOURCES = {
            'SENSOR_DATA': Web3.keccak(text='SENSOR_DATA'),
            'PREDICTION': Web3.keccak(text='PREDICTION'),
            'MAINTENANCE': Web3.keccak(text='MAINTENANCE'),
            'USER_MANAGEMENT': Web3.keccak(text='USER_MANAGEMENT'),
            'FAILURE_VERIFICATION': Web3.keccak(text='FAILURE_VERIFICATION'),
            'PROOF_SUBMISSION': Web3.keccak(text='PROOF_SUBMISSION'),
            'VERIFICATION_APPROVAL': Web3.keccak(text='VERIFICATION_APPROVAL')
        }
        
        logging.info(f"🔐 AccessControlManager başlatıldı: {self.contract_address}")
    
    def _load_contract_abi(self) -> list:
        """AccessControlRegistry ABI'sini yükler"""
        try:
            abi_path = "artifacts/contracts/AccessControlRegistry.sol/AccessControlRegistry.json"
            with open(abi_path, 'r') as f:
                contract_data = json.load(f)
                return contract_data['abi']
        except FileNotFoundError:
            logging.error(f"❌ ABI dosyası bulunamadı: {abi_path}")
            # Fallback: Minimal ABI
            return [
                {
                    "inputs": [
                        {"name": "caller", "type": "address"},
                        {"name": "resource", "type": "bytes32"},
                        {"name": "requiredLevel", "type": "uint8"}
                    ],
                    "name": "checkAccess",
                    "outputs": [
                        {"name": "hasAccess", "type": "bool"},
                        {"name": "reason", "type": "string"}
                    ],
                    "stateMutability": "view",
                    "type": "function"
                }
            ]
    
    def check_access(self, caller_address: str, resource: str, required_level: AccessLevel) -> Tuple[bool, str]:
        """
        Belirtilen adresin kaynağa erişim hakkını kontrol eder
        
        Args:
            caller_address: Kontrol edilecek adres
            resource: Kaynak adı ('SENSOR_DATA', 'PREDICTION', etc.)
            required_level: Gerekli erişim seviyesi
            
        Returns:
            (has_access, reason): Erişim durumu ve açıklama
        """
        try:
            caller_checksum = Web3.toChecksumAddress(caller_address)
            resource_hash = self.RESOURCES.get(resource, Web3.keccak(text=resource))
            
            result = self.contract.functions.checkAccess(
                caller_checksum,
                resource_hash,
                required_level.value
            ).call()
            
            has_access, reason = result
            
            logging.debug(f"🔍 Erişim kontrolü - Adres: {caller_address[:8]}..., "
                         f"Kaynak: {resource}, Seviye: {required_level.name}, "
                         f"Sonuç: {'✅' if has_access else '❌'} {reason}")
            
            return has_access, reason
            
        except Exception as e:
            logging.error(f"❌ Erişim kontrolü hatası: {e}")
            return False, f"Erişim kontrolü hatası: {str(e)}"
    
    def register_node(self, 
                     node_name: str, 
                     node_address: str, 
                     node_type: NodeType, 
                     access_level: AccessLevel,
                     access_duration: int = 0,
                     metadata: str = "") -> Optional[str]:
        """
        Yeni düğüm kaydeder
        
        Args:
            node_name: Düğüm adı
            node_address: Düğüm blockchain adresi
            node_type: Düğüm türü
            access_level: Erişim seviyesi
            access_duration: Erişim süresi (saniye, 0=süresiz)
            metadata: Ek bilgiler (JSON formatında)
            
        Returns:
            node_id: Oluşturulan düğüm ID'si (hex string)
        """
        try:
            node_address_checksum = Web3.toChecksumAddress(node_address)
            
            # Transaction oluştur
            transaction = self.contract.functions.registerNode(
                node_name,
                node_address_checksum,
                node_type.value,
                access_level.value,
                access_duration,
                metadata
            ).buildTransaction({
                'from': self.account.address,
                'gas': 500000,
                'gasPrice': self.w3.toWei(BlockchainConfig.SENSOR_DATA_GAS_PRICE_GWEI, 'gwei'),
                'nonce': self.w3.eth.get_transaction_count(self.account.address)
            })
            
            # İmzala ve gönder
            signed_txn = self.w3.eth.account.sign_transaction(transaction, self.private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_txn.rawTransaction)
            
            # Onay bekle
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=BlockchainConfig.TRANSACTION_TIMEOUT)
            
            if receipt.status == 1:
                # Event'lerden node ID'yi çıkar
                node_registered_event = None
                for log in receipt.logs:
                    try:
                        decoded = self.contract.events.NodeRegistered().processLog(log)
                        node_registered_event = decoded
                        break
                    except:
                        continue
                
                if node_registered_event:
                    node_id = node_registered_event['args']['nodeId'].hex()
                    logging.info(f"✅ Düğüm kaydedildi - Ad: {node_name}, ID: {node_id[:16]}...")
                    return node_id
                else:
                    logging.warning("⚠️ Düğüm kaydı başarılı ama event bulunamadı")
                    return receipt.transactionHash.hex()
            else:
                logging.error(f"❌ Düğüm kayıt işlemi başarısız - TX: {tx_hash.hex()}")
                return None
                
        except Exception as e:
            logging.error(f"❌ Düğüm kayıt hatası: {e}")
            return None
    
    def request_access(self, 
                      node_id: str, 
                      target_resource: str, 
                      requested_level: AccessLevel,
                      duration: int,
                      justification: str) -> Optional[str]:
        """
        Erişim izni ister
        
        Args:
            node_id: Düğüm ID'si
            target_resource: Hedef kaynak
            requested_level: İstenen erişim seviyesi
            duration: İstek süresi (saniye)
            justification: Gerekçe
            
        Returns:
            request_id: İstek ID'si
        """
        try:
            resource_hash = self.RESOURCES.get(target_resource, Web3.keccak(text=target_resource))
            node_id_bytes = bytes.fromhex(node_id.replace('0x', ''))
            
            transaction = self.contract.functions.requestAccess(
                node_id_bytes,
                resource_hash,
                requested_level.value,
                duration,
                justification
            ).buildTransaction({
                'from': self.account.address,
                'gas': 300000,
                'gasPrice': self.w3.toWei(BlockchainConfig.SENSOR_DATA_GAS_PRICE_GWEI, 'gwei'),
                'nonce': self.w3.eth.get_transaction_count(self.account.address)
            })
            
            signed_txn = self.w3.eth.account.sign_transaction(transaction, self.private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_txn.rawTransaction)
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=BlockchainConfig.TRANSACTION_TIMEOUT)
            
            if receipt.status == 1:
                logging.info(f"✅ Erişim isteği gönderildi - Kaynak: {target_resource}")
                return tx_hash.hex()
            else:
                logging.error(f"❌ Erişim isteği başarısız")
                return None
                
        except Exception as e:
            logging.error(f"❌ Erişim isteği hatası: {e}")
            return None
    
    def get_node_info(self, node_id: str) -> Optional[Dict[str, Any]]:
        """
        Düğüm bilgilerini getirir
        
        Args:
            node_id: Düğüm ID'si
            
        Returns:
            Düğüm bilgileri dict'i
        """
        try:
            node_id_bytes = bytes.fromhex(node_id.replace('0x', ''))
            result = self.contract.functions.getNode(node_id_bytes).call()
            
            # Solidity struct'ını Python dict'ine çevir
            node_info = {
                'nodeId': result[0].hex(),
                'nodeName': result[1],
                'nodeAddress': result[2],
                'nodeType': NodeType(result[3]),
                'status': NodeStatus(result[4]),
                'accessLevel': AccessLevel(result[5]),
                'owner': result[6],
                'createdAt': result[7],
                'lastActiveAt': result[8],
                'accessExpiresAt': result[9],
                'assignedRoles': [role.hex() for role in result[10]],
                'isBlacklisted': result[11],
                'metadata': result[12]
            }
            
            return node_info
            
        except Exception as e:
            logging.error(f"❌ Düğüm bilgisi alma hatası: {e}")
            return None
    
    def get_nodes_by_address(self, address: str) -> list:
        """
        Belirtilen adresin sahip olduğu düğümleri getirir
        
        Args:
            address: Sahip adresi
            
        Returns:
            Düğüm ID'leri listesi
        """
        try:
            address_checksum = Web3.toChecksumAddress(address)
            result = self.contract.functions.getNodesByAddress(address_checksum).call()
            return [node_id.hex() for node_id in result]
            
        except Exception as e:
            logging.error(f"❌ Adres düğümleri alma hatası: {e}")
            return []
    
    def is_system_ready(self) -> bool:
        """
        AccessControl sisteminin hazır olup olmadığını kontrol eder
        
        Returns:
            True if system is ready
        """
        try:
            # Basit bir view fonksiyonu çağırarak sistem durumunu kontrol et
            node_counter = self.contract.functions.nodeCounter().call()
            logging.info(f"🔍 AccessControl sistemi aktif - Toplam düğüm: {node_counter}")
            return True
            
        except Exception as e:
            logging.error(f"❌ AccessControl sistem kontrolü hatası: {e}")
            return False

# Yardımcı fonksiyonlar
def create_access_control_manager(contract_address: str, private_key: str, rpc_url: str) -> Optional[AccessControlManager]:
    """
    AccessControlManager örneği oluşturur
    
    Args:
        contract_address: AccessControlRegistry adresi
        private_key: Private key
        rpc_url: RPC URL
        
    Returns:
        AccessControlManager örneği veya None
    """
    try:
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not w3.isConnected():
            logging.error("❌ Blockchain bağlantısı kurulamadı")
            return None
            
        return AccessControlManager(w3, contract_address, private_key)
        
    except Exception as e:
        logging.error(f"❌ AccessControlManager oluşturma hatası: {e}")
        return None

def format_access_level(level: int) -> str:
    """Erişim seviyesini okunabilir formatta döndürür"""
    level_names = {
        0: "❌ Erişim Yok",
        1: "👁️ Sadece Okuma",
        2: "✏️ Sınırlı Yazma", 
        3: "✅ Tam Erişim",
        4: "🔑 Yönetici Erişimi"
    }
    return level_names.get(level, f"❓ Bilinmeyen ({level})")

def format_node_status(status: int) -> str:
    """Düğüm durumunu okunabilir formatta döndürür"""
    status_names = {
        0: "⚫ Pasif",
        1: "🟢 Aktif",
        2: "🟡 Askıda",
        3: "🔧 Bakımda",
        4: "🔴 Kullanımdan Kaldırılmış"
    }
    return status_names.get(status, f"❓ Bilinmeyen ({status})")

def format_node_type(node_type: int) -> str:
    """Düğüm türünü okunabilir formatta döndürür"""
    type_names = {
        0: "❓ Tanımlanmamış",
        1: "🔍 Doğrulama Düğümü",
        2: "⚠️ Arıza Analiz Düğümü",
        3: "📊 Veri İşleme Düğümü",
        4: "🔧 Bakım Yönetimi Düğümü",
        5: "📋 Denetim Düğümü",
        6: "🌐 Gateway Düğümü"
    }
    return type_names.get(node_type, f"❓ Bilinmeyen ({node_type})")
