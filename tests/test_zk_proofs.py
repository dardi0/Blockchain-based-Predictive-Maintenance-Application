import pytest
import json
import os
from unittest.mock import MagicMock, patch
from blockchain_client import HybridBlockchainHandler
from zk_proof_generator import ZKProofGenerator
from database import SensorData

class TestZKProofs:
    @pytest.fixture
    def mock_handler(self):
        handler = HybridBlockchainHandler()
        # Mock web3 and contract to prevent actual network calls
        handler.web3 = MagicMock()
        handler.pdm_contract = MagicMock()
        return handler

    @pytest.fixture
    def zk_generator(self):
        return ZKProofGenerator()

    def test_g2_formatting_logic(self):
        """Test G2 point swapping logic used in verify_g2_consistency.py"""
        # [x, y] where x=[x0, x1], y=[y0, y1]
        dummy_point = [["1", "2"], ["3", "4"]] 
        
        # Swapped: [x1, x0], [y1, y0] => [["2", "1"], ["4", "3"]]
        
        from verify_g2_consistency import format_g2_swapped, normalize_g2
        
        normalized = normalize_g2(dummy_point)
        swapped = format_g2_swapped(normalized)
        
        assert swapped[0][0] == 2
        assert swapped[0][1] == 1
        assert swapped[1][0] == 4
        assert swapped[1][1] == 3

    @patch('zk_proof_generator.ZKProofGenerator.generate_sensor_proof_v2')
    def test_proof_generation_flow(self, mock_gen, mock_handler):
        """Test full flow of proof simulation with mocked generator"""
        # Mock proof data
        mock_proof = {
            'proof': {
                'pi_a': ['1', '2'],
                'pi_b': [['3', '4'], ['5', '6']],
                'pi_c': ['7', '8']
            },
            'publicInputs': ['100', '200', '300'] # machineId, timestamp, commitment
        }
        mock_gen.return_value = mock_proof
        
        # Test data
        prediction_data = {
            'machine_id': 123,
            'air_temp': 300.0,
            'process_temp': 310.0,
            'rotation_speed': 1500,
            'torque': 40.0,
            'tool_wear': 5,
            'timestamp': 1700000000,
            'recorded_by': '0xTestUser'
        }
        
        # Prepare proof via handler
        # We need to mock storage_manager too to avoid DB calls
        mock_handler.storage_manager = MagicMock()
        mock_handler.storage_manager.store_sensor_data.return_value = (1, "0xhash")
        mock_handler.zk_proof_generator = mock_gen
        
        # Mock pmd_contract.address
        mock_handler.pdm_contract.address = "0xContract"
        
        result = mock_handler.prepare_sensor_proof(prediction_data)
        
        assert result['success'] is True
        assert result['record_id'] == 1
        args = result['proof_args']
        assert args['a'] == ['1', '2']
        assert args['b'] == [['3', '4'], ['5', '6']]
        # Check if commitment hash is derived from public input '300'
        # 300 -> hex 012c -> bytes ...
        expected_comm = int(300).to_bytes(32, 'big').hex()
        assert args['commitment_hash_bytes'].endswith(expected_comm)

if __name__ == "__main__":
    pytest.main([__file__])
