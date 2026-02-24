import threading
from typing import Dict

class NonceManager:
    """
    Thread-safe nonce management for blockchain transactions.
    Prevents nonce conflicts in parallel transaction scenarios.
    """
    _instances: Dict[str, 'NonceManager'] = {}
    _lock = threading.Lock()

    def __new__(cls, web3, address: str):
        """Singleton per address"""
        with cls._lock:
            if address not in cls._instances:
                instance = super().__new__(cls)
                instance._initialized = False
                cls._instances[address] = instance
            return cls._instances[address]

    def __init__(self, web3, address: str):
        # M1 FIX: Always update web3 reference to handle reconnections
        self.web3 = web3
        
        if getattr(self, '_initialized', False):
            return
            
        self.address = address
        self._nonce = None
        self._nonce_lock = threading.Lock()
        self._initialized = True

    def get_nonce(self) -> int:
        """Get next nonce, thread-safe with automatic sync from chain"""
        with self._nonce_lock:
            # Get pending nonce from chain
            chain_nonce = self.web3.eth.get_transaction_count(self.address, 'pending')

            if self._nonce is None or self._nonce < chain_nonce:
                self._nonce = chain_nonce
            else:
                self._nonce += 1

            return self._nonce

    def reset(self):
        """Reset local nonce to sync with chain"""
        with self._nonce_lock:
            self._nonce = None

    def decrement(self):
        """Decrement nonce on transaction failure"""
        with self._nonce_lock:
            if self._nonce is not None and self._nonce > 0:
                self._nonce -= 1
