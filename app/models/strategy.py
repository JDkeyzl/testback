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

class ConditionNode(BaseModel):
    id: str
    type: str = Field(..., description="条件类型: ma, rsi, macd, volume, price")
    period: Optional[int] = Field(None, description="周期参数")
    threshold: float = Field(..., description="阈值")
    operator: OperatorType = Field(..., description="操作符")
    fast: Optional[int] = Field(None, description="MACD快线周期")
    slow: Optional[int] = Field(None, description="MACD慢线周期")
    signal: Optional[int] = Field(None, description="MACD信号线周期")

class LogicNode(BaseModel):
    id: str
    type: LogicType = Field(..., description="逻辑类型")

class ActionNode(BaseModel):
    id: str
    type: ActionType = Field(..., description="动作类型")
    quantity: Optional[int] = Field(None, description="交易数量")
    price_type: Optional[PriceType] = Field(None, description="价格类型")

class Node(BaseModel):
    id: str
    type: str = Field(..., description="节点类型: condition, logic, action")
    position: Dict[str, float] = Field(..., description="节点位置")
    data: Union[ConditionNode, LogicNode, ActionNode] = Field(..., description="节点数据")

class Edge(BaseModel):
    id: str
    source: str = Field(..., description="源节点ID")
    target: str = Field(..., description="目标节点ID")
    source_handle: Optional[str] = Field(None, description="源连接点")
    target_handle: Optional[str] = Field(None, description="目标连接点")

class StrategyDefinition(BaseModel):
    nodes: List[Node] = Field(..., description="策略节点列表")
    edges: List[Edge] = Field(..., description="节点连接列表")
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
