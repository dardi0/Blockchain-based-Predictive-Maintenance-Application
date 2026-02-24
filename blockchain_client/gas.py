import logging
from config import BlockchainConfig

logger = logging.getLogger(__name__)

class GasEstimator:
    """
    Dynamic gas estimation helper.
    Falls back to configured limits if estimation fails.
    """

    def __init__(self, web3):
        self.web3 = web3

    def estimate_gas(self, transaction: dict, fallback_limit: int, buffer: float = None) -> int:
        """
        Estimate gas for a transaction with fallback to configured limit.

        Args:
            transaction: Transaction dict (must include 'from', optionally 'to', 'data')
            fallback_limit: Fallback gas limit if estimation fails
            buffer: Gas buffer multiplier (default from config)

        Returns:
            Estimated gas with buffer, or fallback limit
        """
        if buffer is None:
            buffer = BlockchainConfig.GAS_ESTIMATION_BUFFER

        if not BlockchainConfig.USE_DYNAMIC_GAS_ESTIMATION:
            return fallback_limit

        try:
            estimated = self.web3.eth.estimate_gas(transaction)
            return int(estimated * buffer)
        except Exception as e:
            logger.debug(f"Gas estimation failed, using fallback: {e}")
            return fallback_limit

    def get_gas_price(self, buffer: float = None) -> int:
        """
        Get current gas price with buffer.

        Args:
            buffer: Gas price buffer multiplier (default from config)

        Returns:
            Gas price in wei with buffer applied
        """
        if buffer is None:
            buffer = BlockchainConfig.GAS_PRICE_BUFFER

        try:
            base_price = self.web3.eth.gas_price
            return int(base_price * buffer)
        except Exception:
            # Fallback to configured price
            return self.web3.to_wei(BlockchainConfig.SENSOR_DATA_GAS_PRICE_GWEI, 'gwei')
