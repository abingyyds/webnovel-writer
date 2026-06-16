FROM node:22-bookworm-slim AS frontend

WORKDIR /app/webnovel-writer/dashboard/frontend
COPY webnovel-writer/dashboard/frontend/package*.json ./
RUN npm ci
COPY webnovel-writer/dashboard/frontend ./
RUN npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/webnovel-writer \
    WEBNOVEL_PLATFORM_ENABLED=true \
    WEBNOVEL_DATA_DIR=/data \
    HOST=0.0.0.0

WORKDIR /app

COPY requirements.txt ./requirements.txt
COPY webnovel-writer/dashboard/requirements.txt ./dashboard-requirements.txt
COPY webnovel-writer/scripts/requirements.txt ./scripts-requirements.txt
RUN pip install --no-cache-dir -r dashboard-requirements.txt -r scripts-requirements.txt

COPY webnovel-writer ./webnovel-writer
COPY --from=frontend /app/webnovel-writer/dashboard/frontend/dist ./webnovel-writer/dashboard/frontend/dist

RUN mkdir -p /data

CMD ["sh", "-c", "python -m dashboard.server --host 0.0.0.0 --port ${PORT:-8765} --no-browser"]
