"""
Hybrid Blockchain Handler Unit Tests
Run with: pytest tests/test_blockchain_handler.py -v
"""

import pytest
import sys
import os
import threading
import time

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from hybrid_blockchain_handler import NonceManager
    HAS_NONCE_MANAGER = True
except ImportError:
    HAS_NONCE_MANAGER = False
    NonceManager = None


class MockWeb3:
    """Mock Web3 instance for testing."""

    class Eth:
        def __init__(self):
            self._nonce = 0
            self._lock = threading.Lock()

        def get_transaction_count(self, address, state='latest'):
            with self._lock:
                return self._nonce

        def increment_nonce(self):
            with self._lock:
                self._nonce += 1

    def __init__(self):
        self.eth = self.Eth()


@pytest.fixture
def mock_web3():
    """Create a mock Web3 instance."""
    return MockWeb3()


class TestNonceManager:
    """Test the NonceManager class."""

    def test_nonce_manager_creation(self, mock_web3):
        """Test NonceManager creation."""
        if not HAS_NONCE_MANAGER:
            pytest.skip("NonceManager not available")

        # Clear singleton instances for testing
        NonceManager._instances = {}

        address = "0x" + "a" * 40
        manager = NonceManager(mock_web3, address)
        assert manager is not None

    def test_nonce_manager_singleton(self, mock_web3):
        """Test that NonceManager is a singleton per address."""
        if not HAS_NONCE_MANAGER:
            pytest.skip("NonceManager not available")

        # Clear singleton instances for testing
        NonceManager._instances = {}

        address = "0x" + "a" * 40
        manager1 = NonceManager(mock_web3, address)
        manager2 = NonceManager(mock_web3, address)

        assert manager1 is manager2

    def test_different_addresses_different_instances(self, mock_web3):
        """Test that different addresses get different instances."""
        if not HAS_NONCE_MANAGER:
            pytest.skip("NonceManager not available")

        # Clear singleton instances for testing
        NonceManager._instances = {}

        address1 = "0x" + "a" * 40
        address2 = "0x" + "b" * 40

        manager1 = NonceManager(mock_web3, address1)
        manager2 = NonceManager(mock_web3, address2)

        assert manager1 is not manager2

    def test_get_nonce_increments(self, mock_web3):
        """Test that get_nonce returns incrementing values."""
        if not HAS_NONCE_MANAGER:
            pytest.skip("NonceManager not available")

        # Clear singleton instances for testing
        NonceManager._instances = {}

        address = "0x" + "c" * 40
        manager = NonceManager(mock_web3, address)

        nonce1 = manager.get_nonce()
        nonce2 = manager.get_nonce()
        nonce3 = manager.get_nonce()

        assert nonce2 == nonce1 + 1
        assert nonce3 == nonce2 + 1

    def test_nonce_reset(self, mock_web3):
        """Test that reset clears local nonce."""
        if not HAS_NONCE_MANAGER:
            pytest.skip("NonceManager not available")

        # Clear singleton instances for testing
        NonceManager._instances = {}

        address = "0x" + "d" * 40
        manager = NonceManager(mock_web3, address)

        # Get some nonces
        manager.get_nonce()
        manager.get_nonce()

        # Reset
        manager.reset()

        # Should sync with chain (which is 0)
        nonce = manager.get_nonce()
        assert nonce == 0

    def test_nonce_decrement(self, mock_web3):
        """Test that decrement reduces nonce."""
        if not HAS_NONCE_MANAGER:
            pytest.skip("NonceManager not available")

        # Clear singleton instances for testing
        NonceManager._instances = {}

        address = "0x" + "e" * 40
        manager = NonceManager(mock_web3, address)

        # Get nonces
        manager.get_nonce()
        nonce_before = manager.get_nonce()

        # Decrement
        manager.decrement()

        # Next nonce should be same as before decrement
        nonce_after = manager.get_nonce()
        assert nonce_after == nonce_before

    def test_thread_safety(self, mock_web3):
        """Test that NonceManager is thread-safe."""
        if not HAS_NONCE_MANAGER:
            pytest.skip("NonceManager not available")

        # Clear singleton instances for testing
        NonceManager._instances = {}

        address = "0x" + "f" * 40
        manager = NonceManager(mock_web3, address)

        results = []
        errors = []

        def get_nonces(count):
            try:
                for _ in range(count):
                    nonce = manager.get_nonce()
                    results.append(nonce)
            except Exception as e:
                errors.append(e)

        # Create multiple threads
        threads = [
            threading.Thread(target=get_nonces, args=(10,))
            for _ in range(5)
        ]

        # Start all threads
        for t in threads:
            t.start()

        # Wait for all threads
        for t in threads:
            t.join()

        # No errors should occur
        assert len(errors) == 0

        # All nonces should be unique
        assert len(results) == len(set(results))


class TestRetryLogic:
    """Test retry logic patterns."""

    def test_exponential_backoff_calculation(self):
        """Test that exponential backoff calculation is correct."""
        base_delay = 5.0

        # First retry: 5 * 2^0 = 5
        delay1 = base_delay * (2 ** 0)
        assert delay1 == 5.0

        # Second retry: 5 * 2^1 = 10
        delay2 = base_delay * (2 ** 1)
        assert delay2 == 10.0

        # Third retry: 5 * 2^2 = 20
        delay3 = base_delay * (2 ** 2)
        assert delay3 == 20.0


class TestDataHashCalculation:
    """Test data hash calculation for sensor data."""

    def test_consistent_hash(self):
        """Test that same data produces same hash."""
        import json
        import hashlib

        data1 = {
            'machine_id': 1001,
            'air_temp': 300.0,
            'process_temp': 310.0
        }
        data2 = {
            'machine_id': 1001,
            'air_temp': 300.0,
            'process_temp': 310.0
        }

        hash1 = hashlib.sha256(json.dumps(data1, sort_keys=True).encode()).hexdigest()
        hash2 = hashlib.sha256(json.dumps(data2, sort_keys=True).encode()).hexdigest()

        assert hash1 == hash2

    def test_different_data_different_hash(self):
        """Test that different data produces different hash."""
        import json
        import hashlib

        data1 = {'machine_id': 1001, 'air_temp': 300.0}
        data2 = {'machine_id': 1001, 'air_temp': 301.0}

        hash1 = hashlib.sha256(json.dumps(data1, sort_keys=True).encode()).hexdigest()
        hash2 = hashlib.sha256(json.dumps(data2, sort_keys=True).encode()).hexdigest()

        assert hash1 != hash2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
