from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .api.backtest import router as backtest_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行
    print("TestBack API 启动中...")
    yield
    # 关闭时执行
    print("TestBack API 关闭中...")

app = FastAPI(
    title="TestBack API",
    description="策略回测平台后端API",
    version="1.0.0",
    lifespan=lifespan
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(backtest_router, prefix="/api/v1", tags=["backtest"])

@app.get("/")
async def root():
    return {
        "message": "TestBack API",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
