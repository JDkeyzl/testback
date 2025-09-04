from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Dict, Any
import json

from .models.simple import SimpleBacktestRequest, SimpleBacktestResult
from .services.backtest_engine import BacktestEngine

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行
    print("🚀 TestBack API 启动中...")
    yield
    # 关闭时执行
    print("🛑 TestBack API 关闭中...")

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
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/v1/backtest", response_model=SimpleBacktestResult)
async def run_backtest(request: SimpleBacktestRequest) -> SimpleBacktestResult:
    """
    运行策略回测
    
    Args:
        request: 包含策略定义的回测请求
        
    Returns:
        SimpleBacktestResult: 回测结果，包含指标、资金曲线和交易记录
    """
    try:
        # 验证策略定义
        if not request.strategy.nodes:
            raise HTTPException(status_code=400, detail="策略必须包含至少一个节点")
        
        # 创建回测引擎
        engine = BacktestEngine(request.strategy)
        
        # 运行回测
        result = engine.run_backtest()
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"回测执行失败: {str(e)}")

@app.get("/api/v1/health")
async def health_check() -> Dict[str, str]:
    """健康检查接口"""
    return {"status": "healthy", "message": "Backtest API is running"}

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
