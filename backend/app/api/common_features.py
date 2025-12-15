"""
共同特征分析API端点
独立模块，与backtest.py解耦
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import logging

from ..services.common_features_analyzer import CommonFeaturesAnalyzer
from ..data_loader import data_loader

logger = logging.getLogger(__name__)

router = APIRouter()


class CommonFeaturesRequest(BaseModel):
    """共同特征分析请求"""
    symbols: List[str]  # 股票代码列表
    baseDate: Optional[str] = None  # 基准日 (YYYY-MM-DD)，可选，默认为startDate前一天
    startDate: str  # 大浪淘沙开始日期 (YYYY-MM-DD)，用于计算收益率
    endDate: str  # 大浪淘沙结束日期 (YYYY-MM-DD)，用于计算收益率
    lookbackDays: int = 60  # 价格位置回看天数，默认60
    macdFast: int = 12  # MACD快线周期，默认12
    macdSlow: int = 26  # MACD慢线周期，默认26
    macdSignal: int = 9  # MACD信号线周期，默认9


@router.post("/common-features/analyze")
async def analyze_common_features(request: CommonFeaturesRequest) -> Dict[str, Any]:
    """
    分析前N名股票的共同特征
    
    基于基准日的数据进行分析（如果未提供baseDate，则使用startDate前一天）
    """
    try:
        # 初始化分析器
        analyzer = CommonFeaturesAnalyzer(data_loader)
        
        # 执行分析
        result = analyzer.analyze(
            symbols=request.symbols,
            base_date=request.baseDate,  # 可选，如果为None则从start_date计算
            start_date=request.startDate,  # 用于计算收益率
            end_date=request.endDate,  # 用于计算收益率
            lookback_days=request.lookbackDays,
            macd_fast=request.macdFast,
            macd_slow=request.macdSlow,
            macd_signal=request.macdSignal
        )
        
        if not result.get("ok"):
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "分析失败")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"分析共同特征失败: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"分析失败: {str(e)}"
        )

