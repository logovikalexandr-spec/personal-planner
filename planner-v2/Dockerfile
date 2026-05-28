FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir -e .
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY --from=frontend /fe/dist ./frontend/dist
ENV MINI_APP_DIST_DIR=/app/frontend/dist
ENV PYTHONPATH=/app/src
CMD ["uvicorn", "planner.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
