# ==============================================================================
# StageLight Ghana Talent Hunt — Production Multi-Stage Dockerfile
# ==============================================================================

# STAGE 1: Build dependencies with compiler tools
FROM python:3.11-slim as builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# STAGE 2: Minimal hardened runtime image
FROM python:3.11-slim as runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged system user and group
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -s /bin/bash -m appuser

# Copy installed Python packages from builder
COPY --from=builder /root/.local /home/appuser/.local
ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV FLASK_ENV=production
ENV PORT=5050

# Copy application directories with ownership
COPY --chown=appuser:appgroup backend /app/backend
COPY --chown=appuser:appgroup frontend /app/frontend

# Create persistent uploads directory and set permissions
RUN mkdir -p /app/backend/uploads && chown -R appuser:appgroup /app/backend/uploads

EXPOSE 5050

WORKDIR /app/backend

# Built-in Docker health check on the deep health probe endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-5050}/api/v1/health || exit 1

# Launch production WSGI server with Gunicorn (ensures volume permissions before dropping privileges to appuser)
CMD ["/bin/sh", "-c", "mkdir -p /var/lib/postgresql/data/uploads 2>/dev/null; chown -R appuser:appgroup /var/lib/postgresql/data /app/backend/uploads 2>/dev/null; chmod -R 775 /var/lib/postgresql/data /app/backend/uploads 2>/dev/null; if [ -n \"$UPLOAD_FOLDER\" ]; then mkdir -p \"$UPLOAD_FOLDER\" 2>/dev/null; chown -R appuser:appgroup \"$UPLOAD_FOLDER\" 2>/dev/null; fi; exec gosu appuser gunicorn --config gunicorn.conf.py wsgi:app"]
