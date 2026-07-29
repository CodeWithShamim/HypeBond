#!/usr/bin/env python3
"""Runs the HypeBond contract test suite with the stdlib only.

    python3 packages/contracts/tests/run.py [-v]

No pytest, no genlayer install — the GenVM runtime is stubbed in
tests/stubs/genlayer.py so the contract executes in plain CPython.
"""

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

if __name__ == "__main__":
	verbosity = 2 if "-v" in sys.argv else 1
	suite = unittest.defaultTestLoader.discover(str(HERE), pattern="test_*.py")
	result = unittest.TextTestRunner(verbosity=verbosity).run(suite)
	sys.exit(0 if result.wasSuccessful() else 1)
