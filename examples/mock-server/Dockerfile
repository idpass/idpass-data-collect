FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_SYSTEM_PYTHON=1

WORKDIR /app

RUN pip install --no-cache-dir uv

# Copy the whole project. uv.lock is committed alongside pyproject.toml, so
# `uv sync --frozen` gives reproducible builds. If uv.lock is not yet
# committed, drop the --frozen flag and uv will resolve at build time.
COPY . .
RUN if [ -f uv.lock ]; then uv sync --frozen --no-dev; else uv sync --no-dev; fi

ENV MOCK_DB_PATH=/data/mock_registry.db \
    MOCK_HOST=0.0.0.0 \
    MOCK_PORT=9999

VOLUME ["/data"]
EXPOSE 9999

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request,sys; \
urllib.request.urlopen('http://127.0.0.1:9999/health', timeout=2).read(); sys.exit(0)" || exit 1

CMD ["uv", "run", "python", "-m", "mock_server"]
