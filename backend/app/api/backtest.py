from fastapi import APIRouter, HTTPException
from typing import Dict, Any

from ..models.simple import SimpleBacktestRequest, SimpleBacktestResult
from ..services.backtest_engine import BacktestEngine

router = APIRouter()

@router.post("/backtest", response_model=SimpleBacktestResult)
async def run_backtest(request: SimpleBacktestRequest) -> SimpleBacktestResult:
    """
    运行策略回测
    
    Args:
        request: 包含策略定义的回测请求
        
    Returns:
        BacktestResult: 回测结果，包含指标、资金曲线和交易记录
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

@router.get("/health")
async def health_check() -> Dict[str, str]:
    """健康检查接口"""
    return {"status": "healthy", "message": "Backtest API is running"}

@router.get("/")
async def root() -> Dict[str, str]:
    """根路径"""
    return {
        "message": "TestBack API", 
        "version": "1.0.0",
        "endpoints": {
            "backtest": "/backtest",
            "health": "/health",
            "docs": "/docs"
        }
    }
