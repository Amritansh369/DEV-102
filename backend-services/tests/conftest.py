"""Makes the agent's top-level modules (config, vision, schemas, agents) importable from tests."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def pytest_sessionfinish(session, exitstatus):
    """Closes MediaPipe models before interpreter shutdown, which otherwise prints noisy tracebacks."""
    import vision

    for name in ("_mesh", "_objects"):
        model = getattr(vision, name, None)
        if model is not None and hasattr(model, "close"):
            model.close()
            setattr(vision, name, None)
