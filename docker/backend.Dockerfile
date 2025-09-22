FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Asia/Shanghai

WORKDIR /app

# OS deps (按需精简/扩展)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tzdata ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# 安装依赖：仅安装 backend/requirements.txt，避免根依赖版本冲突
COPY backend/requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

# 复制后端代码
COPY backend /app/backend
COPY app /app/app
COPY scripts /app/scripts


ENV PYTHONPATH=/app/backend

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]


