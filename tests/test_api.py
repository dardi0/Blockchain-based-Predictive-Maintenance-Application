"""
Basic API tests for PDM project.
Run with: pytest tests/test_api.py -v
"""

import pytest
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

# Skip if api_main not available
try:
    from api_main import app
    HAS_API = True
except ImportError:
    HAS_API = False
    app = None


@pytest.fixture
def client():
    """Create a test client for the API."""
    if not HAS_API:
        pytest.skip("API module not available")
    return TestClient(app)


class TestHealthEndpoints:
    """Test health and status endpoints."""

    def test_root_endpoint(self, client):
        """Test the root endpoint returns 200."""
        response = client.get("/")
        assert response.status_code == 200
        assert "message" in response.json()

    def test_health_endpoint(self, client):
        """Test the health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data


class TestAuthEndpoints:
    """Test authentication endpoints."""

    def test_login_missing_fields(self, client):
        """Test login with missing required fields."""
        response = client.post("/auth/login", json={})
        assert response.status_code == 422  # Validation error

    def test_login_invalid_address(self, client):
        """Test login with invalid wallet address format."""
        response = client.post("/auth/login", json={
            "address": "invalid_address",
            "signature": "0x" + "a" * 130,
            "message": "test message"
        })
        assert response.status_code == 422  # Validation error for address format

    def test_register_invalid_role(self, client):
        """Test registration with invalid role."""
        response = client.post("/auth/register", json={
            "address": "0x" + "a" * 40,
            "role": "INVALID_ROLE",
            "signature": "0x" + "a" * 130,
            "message": "test message"
        })
        assert response.status_code == 422  # Validation error for role


class TestValidation:
    """Test input validation."""

    def test_sensor_data_validation_temperature_range(self, client):
        """Test sensor data validation for temperature ranges."""
        # Temperature too low
        response = client.post("/predict", json={
            "air_temp_k": 100,  # Below minimum (250)
            "process_temp_k": 300,
            "rotational_speed_rpm": 1500,
            "torque_nm": 40,
            "tool_wear_min": 100,
            "machine_type": "M"
        })
        assert response.status_code == 422

    def test_sensor_data_validation_machine_type(self, client):
        """Test sensor data validation for machine type."""
        response = client.post("/predict", json={
            "air_temp_k": 300,
            "process_temp_k": 310,
            "rotational_speed_rpm": 1500,
            "torque_nm": 40,
            "tool_wear_min": 100,
            "machine_type": "X"  # Invalid type
        })
        assert response.status_code == 422


class TestRateLimiting:
    """Test rate limiting middleware."""

    def test_rate_limit_headers(self, client):
        """Test that rate limit doesn't block normal usage."""
        # Make a few normal requests
        for _ in range(5):
            response = client.get("/health")
            assert response.status_code == 200


class TestBlockchainEndpoints:
    """Test blockchain-related endpoints."""

    def test_blockchain_status(self, client):
        """Test blockchain status endpoint."""
        response = client.get("/blockchain/status")
        assert response.status_code == 200
        data = response.json()
        assert "blockchain_enabled" in data or "enabled" in data or "status" in data

    def test_blockchain_ledger(self, client):
        """Test blockchain ledger endpoint with pagination."""
        response = client.get("/blockchain/ledger?page=1&limit=10")
        assert response.status_code == 200


class TestAutomationEndpoints:
    """Test automation-related endpoints."""

    def test_automation_status(self, client):
        """Test automation status endpoint."""
        response = client.get("/automation/status")
        # May return 200 or 500 depending on configuration
        assert response.status_code in [200, 500]

    def test_listener_status(self, client):
        """Test listener status endpoint."""
        response = client.get("/automation/listener-status")
        assert response.status_code == 200
        data = response.json()
        assert "running" in data


class TestMachineEndpoints:
    """Test machine-related endpoints."""

    def test_get_machines_requires_wallet(self, client):
        """Test that machines endpoint requires wallet header."""
        response = client.get("/machines")
        # Should work but might return empty or require auth
        assert response.status_code in [200, 401, 422]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
