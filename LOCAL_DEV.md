# 本地启动指南（前后端）

本文档记录在本机启动后端（FastAPI）与前端（Vite+React）的步骤、访问地址与常见问题处理。按顺序执行可一键复用。

## 环境准备

- Python 3.9+（建议使用虚拟环境 `.venv`）
- Node.js 18+（已包含 npm）

### 后端依赖安装（首次或依赖变动）
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r backend/requirements.txt
```

### 前端依赖安装（首次或依赖变动）
```bash
npm install
```

## 启动命令

建议在两个终端分别运行（或按下方“后台运行”方式）。

### 后端（FastAPI + Uvicorn）
- 绑定到 `127.0.0.1:8000`，以配合 Vite 代理到 `http://localhost:8000`
```bash
source .venv/bin/activate
python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
- 后台运行并输出日志到文件：
```bash
source .venv/bin/activate; nohup python3 -m uvicorn backend.app.main:app \
  --host 127.0.0.1 --port 8000 --reload > backend.out 2>&1 &
```

### 前端（Vite 开发服务器）
- 绑定到 `0.0.0.0:5173` 以便局域网访问；本机访问使用 `http://localhost:5173/`
```bash
npm run dev -- --host 0.0.0.0
```
- 后台运行并输出日志到文件：
```bash
pkill -f "vite" || true; npm run dev -- --host 0.0.0.0 > frontend.out 2>&1 &
```

## 访问地址
- 前端：
  - 本机 `http://localhost:5173/`
  - 局域网 `http://<你的局域网IP>:5173/`
- 后端：
  - `http://127.0.0.1:8000`
  - 接口示例：
    - `GET /api/v1/health`
    - `POST /api/v1/backtest/stocks`
    - `GET /api/v1/data/sources`
    - `GET /api/v1/data/stocklist`
    - `POST /api/v1/data/fetch`

说明：开发环境下，前端通过 Vite 代理将 `/api/*` 请求转发到 `http://localhost:8000`。因此后端需监听 `127.0.0.1:8000` 或 `localhost:8000`。

## 数据与缓存
- 拉取股票数据接口：`POST /api/v1/data/fetch`
  - 成功拉取后，后端会自动 `data_loader.clear_cache()`，避免继续命中旧缓存，确保可立即读取新生成的 CSV。
  - 本地 CSV 目录：`data/`（已在 `.gitignore` 中忽略，避免与线上冲突）。
- 股票字典：`data/stockList/all_pure_stock.json`（重要，已纳入版本控制）。

## 日志查看
```bash
# 后端
tail -f backend.out
# 前端
tail -f frontend.out
```

## 常见问题

### 1) 前端报错：请求发往 `http://0.0.0.0:5173/api/...` 且 500/ECONNREFUSED
- 检查 Vite 代理是否指向 `http://localhost:8000`（`vite.config.js` 已配置）。
- 确保后端已启动并监听 `127.0.0.1:8000`：
```bash
lsof -iTCP:8000 -sTCP:LISTEN
```
- 若端口被占用，可重启：
```bash
pkill -f "uvicorn.*backend.app.main" || true
```

### 2) 拉取数据后“读取不到”
- 后端现已在拉取成功后清理数据缓存。若仍旧：
  - 确认生成的 CSV 位于 `data/` 且命名为 `中文名-代码.csv`（例如 `三六零-601360.csv`）。
  - 再次尝试回测或访问 `/api/v1/data/sources` 确认数据源已被发现。

### 3) 最大回撤、收益率不一致
- 开发环境中已统一使用基于“资产口径（现金+市值）”的计算。若仍不一致，请确认页面是否使用历史快照，或刷新以取最新回测结果。

### 4) 端口/进程占用
```bash
# 查看
lsof -iTCP:5173 -sTCP:LISTEN
lsof -iTCP:8000 -sTCP:LISTEN
# 结束
pkill -f "vite" || true
pkill -f "uvicorn.*backend.app.main" || true
```

## 一键脚本（可选）
在项目根新建 `start.sh`（已存在可复用），示例：
```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
source .venv/bin/activate
# 后端
pkill -f "uvicorn.*backend.app.main" || true
nohup python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload > backend.out 2>&1 &
# 前端
pkill -f "vite" || true
nohup npm run dev -- --host 0.0.0.0 > frontend.out 2>&1 &

echo "Frontend: http://localhost:5173/"
echo "Backend:  http://127.0.0.1:8000/"
```
赋权并运行：
```bash
chmod +x start.sh
./start.sh
```

---
如需线上部署（Docker），参见 `DEPLOY_DOCKER.md`。
