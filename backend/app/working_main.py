from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Dict, Any, List
from pydantic import BaseModel, Field
import numpy as np
import pandas as pd
from datetime import datetime
import random

# 内联数据模型定义
class WorkingStrategyDefinition(BaseModel):
    nodes: List[Dict[str, Any]] = Field(..., description="策略节点列表")
    edges: List[Dict[str, Any]] = Field(..., description="节点连接列表")
    start_date: str = Field(..., description="回测开始日期 YYYY-MM-DD")
    end_date: str = Field(..., description="回测结束日期 YYYY-MM-DD")
    initial_capital: float = Field(100000.0, description="初始资金")
    commission_rate: float = Field(0.001, description="手续费率")

class WorkingBacktestRequest(BaseModel):
    strategy: WorkingStrategyDefinition = Field(..., description="策略定义")

class WorkingTradeRecord(BaseModel):
    date: str
    action: str
    price: float
    quantity: int
    amount: float
    pnl: float = 0.0

class WorkingEquityCurve(BaseModel):
    date: str
    equity: float
    returns: float

class WorkingBacktestMetrics(BaseModel):
    total_return: float = Field(..., description="总收益率")
    annual_return: float = Field(..., description="年化收益率")
    max_drawdown: float = Field(..., description="最大回撤")
    sharpe_ratio: float = Field(..., description="夏普比率")
    win_rate: float = Field(..., description="胜率")
    profit_loss_ratio: float = Field(..., description="盈亏比")
    total_trades: int = Field(..., description="总交易次数")
    winning_trades: int = Field(..., description="盈利交易次数")
    losing_trades: int = Field(..., description="亏损交易次数")

class WorkingBacktestResult(BaseModel):
    metrics: WorkingBacktestMetrics = Field(..., description="回测指标")
    equity_curve: List[WorkingEquityCurve] = Field(..., description="资金曲线")
    trades: List[WorkingTradeRecord] = Field(..., description="交易记录")
    final_equity: float = Field(..., description="最终资金")

# 内联回测引擎
class WorkingBacktestEngine:
    def __init__(self, strategy: WorkingStrategyDefinition):
        self.strategy = strategy
        self.initial_capital = strategy.initial_capital
        self.commission_rate = strategy.commission_rate
        self.current_capital = strategy.initial_capital
        self.position = 0
        self.trades = []
        self.equity_curve = []
        
    def generate_mock_data(self) -> pd.DataFrame:
        """生成模拟股票数据"""
        start_date = datetime.strptime(self.strategy.start_date, '%Y-%m-%d')
        end_date = datetime.strptime(self.strategy.end_date, '%Y-%m-%d')
        
        date_range = pd.date_range(start=start_date, end=end_date, freq='D')
        n_days = len(date_range)
        
        # 生成模拟价格数据
        np.random.seed(42)
        initial_price = 100.0
        returns = np.random.normal(0.001, 0.02, n_days)
        prices = [initial_price]
        
        for i in range(1, n_days):
            price = prices[-1] * (1 + returns[i])
            prices.append(max(price, 1.0))
        
        volumes = np.random.lognormal(10, 1, n_days)
        
        df = pd.DataFrame({
            'date': date_range,
            'close': prices,
            'volume': volumes
        })
        
        # 计算技术指标
        df['ma_20'] = df['close'].rolling(window=20).mean()
        df['ma_50'] = df['close'].rolling(window=50).mean()
        df['rsi'] = self._calculate_rsi(df['close'], 14)
        
        return df.dropna()
    
    def _calculate_rsi(self, prices: pd.Series, period: int = 14) -> pd.Series:
        """计算RSI指标"""
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
    
    def evaluate_condition(self, node_data: Dict[str, Any], market_data: pd.Series) -> bool:
        """评估条件节点"""
        condition_type = node_data.get('type')
        
        if condition_type == 'ma':
            period = node_data.get('period', 20)
            threshold = node_data.get('threshold', 50)
            operator = node_data.get('operator', '>')
            
            ma_value = market_data.get(f'ma_{period}', 0)
            return self._compare_values(ma_value, threshold, operator)
        
        elif condition_type == 'rsi':
            period = node_data.get('period', 14)
            threshold = node_data.get('threshold', 30)
            operator = node_data.get('operator', '<')
            
            rsi_value = market_data.get('rsi', 50)
            return self._compare_values(rsi_value, threshold, operator)
        
        elif condition_type == 'price':
            threshold = node_data.get('threshold', 100)
            operator = node_data.get('operator', '>')
            
            price_value = market_data.get('close', 0)
            return self._compare_values(price_value, threshold, operator)
        
        return False
    
    def _compare_values(self, value1: float, value2: float, operator: str) -> bool:
        """比较两个值"""
        if operator == '>':
            return value1 > value2
        elif operator == '<':
            return value1 < value2
        elif operator == '>=':
            return value1 >= value2
        elif operator == '<=':
            return value1 <= value2
        elif operator == '==':
            return abs(value1 - value2) < 1e-6
        elif operator == '!=':
            return abs(value1 - value2) >= 1e-6
        return False
    
    def execute_action(self, node_data: Dict[str, Any], current_price: float, date: str) -> bool:
        """执行动作节点"""
        action_type = node_data.get('type', 'hold')
        quantity = node_data.get('quantity', 100)
        
        if action_type == 'buy' and self.current_capital > 0:
            max_shares = int(self.current_capital / current_price)
            shares_to_buy = min(quantity, max_shares)
            
            if shares_to_buy > 0:
                cost = shares_to_buy * current_price
                commission = cost * self.commission_rate
                total_cost = cost + commission
                
                if total_cost <= self.current_capital:
                    self.current_capital -= total_cost
                    self.position += shares_to_buy
                    
                    trade = WorkingTradeRecord(
                        date=date,
                        action='buy',
                        price=current_price,
                        quantity=shares_to_buy,
                        amount=total_cost,
                        pnl=0.0
                    )
                    self.trades.append(trade)
                    return True
        
        elif action_type == 'sell' and self.position > 0:
            shares_to_sell = min(quantity, self.position)
            
            if shares_to_sell > 0:
                revenue = shares_to_sell * current_price
                commission = revenue * self.commission_rate
                net_revenue = revenue - commission
                
                self.current_capital += net_revenue
                self.position -= shares_to_sell
                
                trade = WorkingTradeRecord(
                    date=date,
                    action='sell',
                    price=current_price,
                    quantity=shares_to_sell,
                    amount=net_revenue,
                    pnl=0.0
                )
                self.trades.append(trade)
                return True
        
        return False
    
    def run_backtest(self) -> WorkingBacktestResult:
        """运行回测"""
        market_data = self.generate_mock_data()
        
        # 逐日回测
        for idx, row in market_data.iterrows():
            date = row['date'].strftime('%Y-%m-%d')
            current_price = row['close']
            
            # 评估条件节点
            condition_results = {}
            for node in self.strategy.nodes:
                if node['type'] == 'condition':
                    result = self.evaluate_condition(node['data'], row)
                    condition_results[node['id']] = result
            
            # 执行动作节点
            for node in self.strategy.nodes:
                if node['type'] == 'action':
                    should_execute = True
                    for edge in self.strategy.edges:
                        if edge['target'] == node['id']:
                            source_result = condition_results.get(edge['source'], False)
                            should_execute = should_execute and source_result
                    
                    if should_execute:
                        self.execute_action(node['data'], current_price, date)
            
            # 记录资金曲线
            current_equity = self.current_capital + (self.position * current_price)
            daily_return = 0.0
            
            if idx > 0 and len(self.equity_curve) > 0:
                prev_equity = self.equity_curve[-1].equity
                daily_return = (current_equity - prev_equity) / prev_equity
            
            equity_point = WorkingEquityCurve(
                date=date,
                equity=current_equity,
                returns=daily_return
            )
            self.equity_curve.append(equity_point)
        
        # 计算最终指标
        metrics = self._calculate_metrics()
        
        return WorkingBacktestResult(
            metrics=metrics,
            equity_curve=self.equity_curve,
            trades=self.trades,
            final_equity=self.current_capital + (self.position * market_data['close'].iloc[-1])
        )
    
    def _calculate_metrics(self) -> WorkingBacktestMetrics:
        """计算回测指标"""
        if not self.equity_curve:
            return WorkingBacktestMetrics(
                total_return=0, annual_return=0, max_drawdown=0,
                sharpe_ratio=0, win_rate=0, profit_loss_ratio=0,
                total_trades=0, winning_trades=0, losing_trades=0
            )
        
        # 计算总收益率
        final_equity = self.equity_curve[-1].equity
        total_return = (final_equity - self.initial_capital) / self.initial_capital
        
        # 计算年化收益率
        days = len(self.equity_curve)
        years = days / 365.25
        annual_return = (1 + total_return) ** (1 / years) - 1 if years > 0 else 0
        
        # 计算最大回撤
        peak = self.initial_capital
        max_drawdown = 0
        for point in self.equity_curve:
            if point.equity > peak:
                peak = point.equity
            drawdown = (peak - point.equity) / peak
            max_drawdown = max(max_drawdown, drawdown)
        
        # 计算夏普比率
        returns = [point.returns for point in self.equity_curve[1:]]
        if returns:
            mean_return = np.mean(returns)
            std_return = np.std(returns)
            sharpe_ratio = mean_return / std_return * np.sqrt(252) if std_return > 0 else 0
        else:
            sharpe_ratio = 0
        
        # 计算交易统计
        total_trades = len(self.trades)
        winning_trades = 0
        losing_trades = 0
        total_profit = 0
        total_loss = 0
        
        # 计算每笔交易的盈亏
        for i in range(0, len(self.trades), 2):
            if i + 1 < len(self.trades):
                buy_trade = self.trades[i]
                sell_trade = self.trades[i + 1]
                
                if buy_trade.action == 'buy' and sell_trade.action == 'sell':
                    pnl = sell_trade.amount - buy_trade.amount
                    if pnl > 0:
                        winning_trades += 1
                        total_profit += pnl
                    else:
                        losing_trades += 1
                        total_loss += abs(pnl)
        
        # 计算胜率和盈亏比
        win_rate = winning_trades / total_trades if total_trades > 0 else 0
        profit_loss_ratio = total_profit / total_loss if total_loss > 0 else 0
        
        return WorkingBacktestMetrics(
            total_return=total_return,
            annual_return=annual_return,
            max_drawdown=max_drawdown,
            sharpe_ratio=sharpe_ratio,
            win_rate=win_rate,
            profit_loss_ratio=profit_loss_ratio,
            total_trades=total_trades,
            winning_trades=winning_trades,
            losing_trades=losing_trades
        )

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 TestBack API 启动中...")
    yield
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

@app.post("/api/v1/backtest", response_model=WorkingBacktestResult)
async def run_backtest(request: WorkingBacktestRequest) -> WorkingBacktestResult:
    """
    运行策略回测
    
    Args:
        request: 包含策略定义的回测请求
        
    Returns:
        WorkingBacktestResult: 回测结果，包含指标、资金曲线和交易记录
    """
    try:
        # 验证策略定义
        if not request.strategy.nodes:
            raise HTTPException(status_code=400, detail="策略必须包含至少一个节点")
        
        # 创建回测引擎
        engine = WorkingBacktestEngine(request.strategy)
        
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
