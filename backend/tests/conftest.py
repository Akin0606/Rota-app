"""Make the backend package root importable so `import services.solver` works
when pytest is run from either the repo root or the backend/ directory."""

import os
import sys

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)
