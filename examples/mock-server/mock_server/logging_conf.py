"""Structured logging (plain text + optional JSON).

Using stdlib logging keeps the dependency surface small. A simple formatter
emits a compact, grep-friendly line; never log PII — see the module docstring
in :mod:`mock_server.services.person_service`.
"""

from __future__ import annotations

import logging
import sys


def configure_logging(level: str = "INFO") -> None:
    """Configure the root logger with a concise stderr handler."""
    root = logging.getLogger()
    if root.handlers:
        # Avoid duplicate handlers if called twice (tests).
        for h in list(root.handlers):
            root.removeHandler(h)

    handler = logging.StreamHandler(stream=sys.stderr)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s %(name)s — %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    root.addHandler(handler)
    root.setLevel(level.upper())

    # Quiet down noisy libraries by default.
    logging.getLogger("uvicorn.access").setLevel("INFO")
    logging.getLogger("sqlalchemy.engine").setLevel("WARNING")
