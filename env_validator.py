"""
Environment Variable Validator for PDM Project
Ensures all required environment variables are set before starting the application.
"""

import os
import sys
from typing import List, Tuple, Optional

class EnvValidator:
    """Validates required environment variables for the PDM project."""

    # Required variables with descriptions
    REQUIRED_VARS: List[Tuple[str, str]] = [
        ("ACTIVE_NETWORK", "Network selection (e.g., ZKSYNC_ERA)"),
        ("ZKSYNC_ERA_RPC_URL", "RPC URL for zkSync Era network"),
        ("PDM_SYSTEM_ADDRESS", "Deployed PDM System contract address"),
        ("ACCESS_CONTROL_ADDRESS", "Deployed Access Control contract address"),
    ]

    # Variables with private keys (sensitive)
    SENSITIVE_VARS: List[Tuple[str, str]] = [
        ("CONTRACT_OWNER_PRIVATE_KEY", "Contract owner's private key"),
        ("ENGINEER_PRIVATE_KEY", "Engineer's private key"),
        ("OPERATOR_PRIVATE_KEY", "Operator's private key"),
        ("MANAGER_PRIVATE_KEY", "Manager's private key"),
    ]

    # Optional but recommended variables
    OPTIONAL_VARS: List[Tuple[str, str]] = [
        ("CORS_ORIGINS", "Allowed CORS origins (comma-separated)"),
        ("RATE_LIMIT_REQUESTS", "Max requests per rate limit window"),
        ("RATE_LIMIT_WINDOW", "Rate limit window in seconds"),
        ("AUTOMATION_LISTENER_ENABLED", "Enable/disable automation listener"),
        ("POLL_INTERVAL", "Automation poll interval in seconds"),
        ("LOG_LEVEL", "Logging level (INFO, WARNING, ERROR, DEBUG)"),
    ]

    def __init__(self, strict: bool = False):
        """
        Initialize the validator.

        Args:
            strict: If True, missing sensitive vars will cause exit.
                   If False, warnings will be printed but execution continues.
        """
        self.strict = strict
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def validate(self) -> bool:
        """
        Validate all environment variables.

        Returns:
            True if all required variables are set, False otherwise.
        """
        self.errors = []
        self.warnings = []

        # Check required variables
        for var_name, description in self.REQUIRED_VARS:
            value = os.getenv(var_name)
            if not value:
                self.errors.append(f"Missing required: {var_name} - {description}")
            elif var_name.endswith("_ADDRESS") and not self._is_valid_address(value):
                self.errors.append(f"Invalid address format: {var_name} = {value}")

        # Check sensitive variables
        for var_name, description in self.SENSITIVE_VARS:
            value = os.getenv(var_name)
            if not value:
                msg = f"Missing sensitive: {var_name} - {description}"
                if self.strict:
                    self.errors.append(msg)
                else:
                    self.warnings.append(msg)
            elif self._is_exposed_key(value):
                self.warnings.append(f"WARNING: {var_name} appears to be a test/exposed key!")

        # Check optional variables (just warnings)
        for var_name, description in self.OPTIONAL_VARS:
            value = os.getenv(var_name)
            if not value:
                self.warnings.append(f"Optional not set: {var_name} - {description} (using default)")

        return len(self.errors) == 0

    def _is_valid_address(self, address: str) -> bool:
        """Check if an Ethereum address is valid format."""
        if not address:
            return False
        if not address.startswith("0x"):
            return False
        if len(address) != 42:
            return False
        try:
            int(address, 16)
            return True
        except ValueError:
            return False

    def _is_exposed_key(self, key: str) -> bool:
        """
        Check if a private key looks invalid (too short or all zeros).
        """
        if not key or len(key.replace('0x', '')) < 64:
            return True
        if key.replace('0x', '').replace('0', '') == '':
            return True
        return False

    def print_report(self):
        """Print validation report to console."""
        print("\n" + "=" * 60)
        print("ENVIRONMENT VALIDATION REPORT")
        print("=" * 60)

        if self.errors:
            print("\n[ERRORS] - Application may not work correctly:")
            for error in self.errors:
                print(f"  [X] {error}")

        if self.warnings:
            print("\n[WARNINGS] - Recommended to fix:")
            for warning in self.warnings:
                print(f"  [!] {warning}")

        if not self.errors and not self.warnings:
            print("\n[OK] All environment variables are properly configured!")

        print("\n" + "=" * 60)

    def exit_if_invalid(self):
        """Exit the application if validation fails."""
        if not self.validate():
            self.print_report()
            print("\n[FATAL] Cannot start application due to configuration errors.")
            print("Please check your .env file and ensure all required variables are set.")
            print("See .env.example for reference.\n")
            sys.exit(1)

        # Print warnings even if valid
        if self.warnings:
            self.print_report()


def validate_env(strict: bool = False) -> bool:
    """
    Convenience function to validate environment.

    Args:
        strict: If True, exit on missing sensitive variables.

    Returns:
        True if valid, False otherwise.
    """
    validator = EnvValidator(strict=strict)
    is_valid = validator.validate()
    validator.print_report()
    return is_valid


if __name__ == "__main__":
    # Load .env file
    from dotenv import load_dotenv
    load_dotenv()

    # Run validation
    validator = EnvValidator(strict=False)
    if validator.validate():
        print("Environment is valid!")
    else:
        print("Environment validation failed!")
        validator.print_report()
        sys.exit(1)
