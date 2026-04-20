"""CLI entrypoint.

Usage::

    python -m mock_server                 # run the server
    python -m mock_server serve            # same as above (explicit)
    python -m mock_server migrate          # create tables (no Alembic)
    python -m mock_server seed [--reset]   # load fixture data
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from mock_server.config import get_settings
from mock_server.logging_conf import configure_logging

logger = logging.getLogger(__name__)


def _run_serve() -> None:
    """Start the server via uvicorn.

    We import the app lazily so the ``migrate`` / ``seed`` subcommands do not
    pull in the whole Litestar stack when they are the only thing requested.
    """
    import uvicorn

    from mock_server.app import create_app

    settings = get_settings()
    # Trigger secret warnings early.
    settings.effective_jwt_secret()
    settings.effective_session_secret()

    app = create_app(settings)
    logger.info("starting mock-registry on http://%s:%d", settings.host, settings.port)
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
    )


def _run_migrate() -> None:
    """Create all tables (idempotent)."""
    from mock_server.db import create_all

    async def _do() -> None:
        await create_all()
        logger.info("tables created")

    asyncio.run(_do())


def _run_seed(reset: bool) -> None:
    """Run the seed helper."""
    from mock_server.seed import seed

    asyncio.run(seed(reset=reset))


def main(argv: list[str] | None = None) -> int:
    """CLI dispatcher. Returns an exit code."""
    parser = argparse.ArgumentParser(prog="mock-server", description="Mock Registry CLI")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("serve", help="Run the HTTP server (default).")
    subparsers.add_parser("migrate", help="Create or update database tables.")
    seed_p = subparsers.add_parser("seed", help="Load fixture data.")
    seed_p.add_argument("--reset", action="store_true", help="Drop and recreate tables first.")

    args = parser.parse_args(argv)

    # Configure logging as early as possible.
    configure_logging(get_settings().log_level)

    cmd = args.command or "serve"
    if cmd == "serve":
        _run_serve()
    elif cmd == "migrate":
        _run_migrate()
    elif cmd == "seed":
        _run_seed(reset=bool(args.reset))
    else:  # pragma: no cover
        parser.print_help()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
