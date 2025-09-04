from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Union
from enum import Enum

class OperatorType(str, Enum):
    GREATER = ">"
    LESS = "<"
    GREATER_EQUAL = ">="
    LESS_EQUAL = "<="
    EQUAL = "=="
    NOT_EQUAL = "!="

class LogicType(str, Enum):
    AND = "and"
    OR = "or"
    NOT = "not"

class ActionType(str, Enum):
    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"

class PriceType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"

class StrategyDefinition(BaseModel):
    nodes: List[Dict[str, Any]] = Field(..., description="策略节点列表")
    edges: List[Dict[str, Any]] = Field(..., description="节点连接列表")
    start_date: str = Field(..., description="回测开始日期 YYYY-MM-DD")
    end_date: str = Field(..., description="回测结束日期 YYYY-MM-DD")
    initial_capital: float = Field(100000.0, description="初始资金")
    commission_rate: float = Field(0.001, description="手续费率")

class BacktestRequest(BaseModel):
    strategy: StrategyDefinition = Field(..., description="策略定义")

class TradeRecord(BaseModel):
    date: str
    action: str
    price: float
    quantity: int
    amount: float
    pnl: Optional[float] = None

class EquityCurve(BaseModel):
    date: str
    equity: float
    returns: float

class BacktestMetrics(BaseModel):
    total_return: float = Field(..., description="总收益率")
    annual_return: float = Field(..., description="年化收益率")
    max_drawdown: float = Field(..., description="最大回撤")
    sharpe_ratio: float = Field(..., description="夏普比率")
    win_rate: float = Field(..., description="胜率")
    profit_loss_ratio: float = Field(..., description="盈亏比")
    total_trades: int = Field(..., description="总交易次数")
    winning_trades: int = Field(..., description="盈利交易次数")
    losing_trades: int = Field(..., description="亏损交易次数")

class BacktestResult(BaseModel):
    metrics: BacktestMetrics = Field(..., description="回测指标")
    equity_curve: List[EquityCurve] = Field(..., description="资金曲线")
    trades: List[TradeRecord] = Field(..., description="交易记录")
    final_equity: float = Field(..., description="最终资金")
