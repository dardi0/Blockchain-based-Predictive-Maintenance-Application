
import pytest
import sys
import os

if __name__ == "__main__":
    print("🚀 Running All Tests...")
    
    # Define test files
    test_files = [
        "tests/test_db_integration.py",
        "tests/test_zk_proofs.py",
        # Add other tests here if they exist
    ]
    
    # Filter existing files
    existing_tests = [f for f in test_files if os.path.exists(f)]
    
    if not existing_tests:
        print("❌ No test files found!")
        sys.exit(1)
        
    print(f"📄 Found {len(existing_tests)} test files: {existing_tests}")
    
    # Run pytest
    exit_code = pytest.main(existing_tests + ["-v"])
    
    if exit_code == 0:
        print("\n✅ All tests passed!")
    else:
        print(f"\n❌ Tests failed with exit code: {exit_code}")
    
    sys.exit(exit_code)
