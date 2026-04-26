FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends git openssh-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --upgrade pip \
    && pip install .

COPY planner_bot ./planner_bot
COPY scripts ./scripts

RUN mkdir -p /app/logs /app/repo

CMD ["python", "-m", "planner_bot.bot"]
