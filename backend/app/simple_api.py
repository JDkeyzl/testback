from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List
import numpy as np
import pandas as pd
from datetime import datetime
import random

app = FastAPI(title="Simple TestBack API")

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def generate_mock_data(start_date: str, end_date: str) -> pd.DataFrame:
    """生成模拟股票数据"""
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    
    date_range = pd.date_range(start=start, end=end, freq='D')
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
    df['rsi'] = calculate_rsi(df['close'], 14)
    
    return df.dropna()

def calculate_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """计算RSI指标"""
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    return rsi

def run_simple_backtest(strategy_data: Dict[str, Any]) -> Dict[str, Any]:
    """运行简化的回测"""
    try:
        # 生成模拟数据
        market_data = generate_mock_data(
            strategy_data['start_date'], 
            strategy_data['end_date']
        )
        
        initial_capital = strategy_data.get('initial_capital', 100000.0)
        commission_rate = strategy_data.get('commission_rate', 0.001)
        
        current_capital = initial_capital
        position = 0
        trades = []
        equity_curve = []
        
        # 简化的策略逻辑：如果MA20 > 50，买入；如果MA20 < 50，卖出
        for idx, row in market_data.iterrows():
            date = row['date'].strftime('%Y-%m-%d')
            current_price = row['close']
            ma_20 = row['ma_20']
            
            # 简单的买入卖出逻辑
            if ma_20 > 50 and position == 0 and current_capital > current_price * 100:
                # 买入
                shares_to_buy = min(100, int(current_capital / current_price))
                cost = shares_to_buy * current_price
                commission = cost * commission_rate
                total_cost = cost + commission
                
                if total_cost <= current_capital:
                    current_capital -= total_cost
                    position += shares_to_buy
                    
                    trades.append({
                        'date': date,
                        'action': 'buy',
                        'price': current_price,
                        'quantity': shares_to_buy,
                        'amount': total_cost,
                        'pnl': 0.0
                    })
            
            elif ma_20 < 50 and position > 0:
                # 卖出
                revenue = position * current_price
                commission = revenue * commission_rate
                net_revenue = revenue - commission
                
                trades.append({
                    'date': date,
                    'action': 'sell',
                    'price': current_price,
                    'quantity': position,
                    'amount': net_revenue,
                    'pnl': net_revenue - (position * 50)  # 简化的盈亏计算
                })
                
                current_capital += net_revenue
                position = 0
            
            # 记录资金曲线
            current_equity = current_capital + (position * current_price)
            daily_return = 0.0
            
            if idx > 0 and len(equity_curve) > 0:
                prev_equity = equity_curve[-1]['equity']
                daily_return = (current_equity - prev_equity) / prev_equity
            
            equity_curve.append({
                'date': date,
                'equity': current_equity,
                'returns': daily_return
            })
        
        # 计算最终指标
        final_equity = equity_curve[-1]['equity'] if equity_curve else initial_capital
        total_return = (final_equity - initial_capital) / initial_capital
        
        # 计算年化收益率
        days = len(equity_curve)
        years = days / 365.25
        annual_return = (1 + total_return) ** (1 / years) - 1 if years > 0 else 0
        
        # 计算最大回撤
        peak = initial_capital
        max_drawdown = 0
        for point in equity_curve:
            if point['equity'] > peak:
                peak = point['equity']
            drawdown = (peak - point['equity']) / peak
            max_drawdown = max(max_drawdown, drawdown)
        
        # 计算夏普比率
        returns = [point['returns'] for point in equity_curve[1:]]
        if returns:
            mean_return = np.mean(returns)
            std_return = np.std(returns)
            sharpe_ratio = mean_return / std_return * np.sqrt(252) if std_return > 0 else 0
        else:
            sharpe_ratio = 0
        
        # 计算交易统计
        total_trades = len(trades)
        winning_trades = 0
        losing_trades = 0
        total_profit = 0
        total_loss = 0
        
        for i in range(0, len(trades), 2):
            if i + 1 < len(trades):
                buy_trade = trades[i]
                sell_trade = trades[i + 1]
                
                if buy_trade['action'] == 'buy' and sell_trade['action'] == 'sell':
                    pnl = sell_trade['amount'] - buy_trade['amount']
                    if pnl > 0:
                        winning_trades += 1
                        total_profit += pnl
                    else:
                        losing_trades += 1
                        total_loss += abs(pnl)
        
        win_rate = winning_trades / total_trades if total_trades > 0 else 0
        profit_loss_ratio = total_profit / total_loss if total_loss > 0 else 0
        
        return {
            'metrics': {
                'total_return': total_return,
                'annual_return': annual_return,
                'max_drawdown': max_drawdown,
                'sharpe_ratio': sharpe_ratio,
                'win_rate': win_rate,
                'profit_loss_ratio': profit_loss_ratio,
                'total_trades': total_trades,
                'winning_trades': winning_trades,
                'losing_trades': losing_trades
            },
            'equity_curve': equity_curve,
            'trades': trades,
            'final_equity': final_equity
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"回测执行失败: {str(e)}")

@app.post("/api/v1/backtest")
async def run_backtest(request: Dict[str, Any]):
    """运行策略回测"""
    try:
        if 'strategy' not in request:
            raise HTTPException(status_code=400, detail="缺少策略数据")
        
        strategy_data = request['strategy']
        
        if not strategy_data.get('nodes'):
            raise HTTPException(status_code=400, detail="策略必须包含至少一个节点")
        
        result = run_simple_backtest(strategy_data)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"回测执行失败: {str(e)}")

@app.get("/api/v1/health")
async def health_check():
    """健康检查接口"""
    return {"status": "healthy", "message": "Simple TestBack API is running"}

@app.get("/")
async def root():
    return {
        "message": "Simple TestBack API",
        "version": "1.0.0",
        "docs": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
