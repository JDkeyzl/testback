from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from .real_backtest_engine import run_real_backtest
from .data_loader import get_data_info

app = FastAPI(
    title="Simple TestBack API",
    description="简化的策略回测API",
    version="1.0.0"
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def generate_mock_backtest_result():
    """生成模拟回测结果 - 修复版本"""
    # 固定参数
    initial_capital = 100000.0
    start_date = datetime(2023, 1, 1)
    end_date = datetime(2023, 12, 31)
    days = (end_date - start_date).days
    
    # 模拟价格数据
    np.random.seed(42)  # 固定种子确保结果可重现
    prices = []
    current_price = 100.0
    for i in range(days):
        change = np.random.normal(0, 0.02)  # 2%的日波动
        current_price = max(current_price * (1 + change), 50.0)  # 价格不能低于50
        prices.append(current_price)
    
    # 回测逻辑
    current_capital = initial_capital
    position = 0  # 持仓数量
    trades = []
    equity_curve = []
    
    # 简单的移动平均策略
    ma_short = 5
    ma_long = 20
    
    for i in range(ma_long, days):  # 从第20天开始，确保有足够数据计算长期均线
        date = start_date + timedelta(days=i)
        current_price = prices[i]
        
        # 计算移动平均线
        if i >= ma_long:
            ma_short_value = np.mean(prices[i-ma_short+1:i+1])
            ma_long_value = np.mean(prices[i-ma_long+1:i+1])
            
            # 买入条件：短期均线上穿长期均线 且 没有持仓
            if ma_short_value > ma_long_value and position == 0:
                # 检查资金是否足够
                max_shares = int(current_capital / current_price)
                if max_shares > 0:
                    shares_to_buy = min(max_shares, 100)  # 最多买100股
                    cost = shares_to_buy * current_price
                    commission = cost * 0.001  # 0.1%手续费
                    total_cost = cost + commission
                    
                    if total_cost <= current_capital:
                        current_capital -= total_cost
                        position += shares_to_buy
                        
                        trades.append({
                            "date": date.strftime("%Y-%m-%d"),
                            "action": "buy",
                            "price": round(current_price, 2),
                            "quantity": shares_to_buy,
                            "amount": round(total_cost, 2),
                            "pnl": None
                        })
            
            # 卖出条件：短期均线下穿长期均线 且 有持仓
            elif ma_short_value < ma_long_value and position > 0:
                revenue = position * current_price
                commission = revenue * 0.001  # 0.1%手续费
                net_revenue = revenue - commission
                
                # 计算盈亏
                buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"])
                pnl = net_revenue - buy_cost
                
                current_capital += net_revenue
                
                trades.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "action": "sell",
                    "price": round(current_price, 2),
                    "quantity": position,
                    "amount": round(net_revenue, 2),
                    "pnl": round(pnl, 2)
                })
                
                position = 0  # 清空持仓
        
        # 记录资金曲线（每周记录一次）
        if i % 7 == 0:
            current_equity = current_capital + (position * current_price)
            daily_return = (current_equity - initial_capital) / initial_capital if i == 0 else 0
            
            if len(equity_curve) > 0:
                prev_equity = equity_curve[-1]["equity"]
                daily_return = (current_equity - prev_equity) / prev_equity
            
            equity_curve.append({
                "date": date.strftime("%Y-%m-%d"),
                "equity": round(current_equity, 2),
                "returns": round(daily_return, 4)
            })
    
    # 如果最后还有持仓，按最后价格卖出
    if position > 0:
        final_price = prices[-1]
        revenue = position * final_price
        commission = revenue * 0.001
        net_revenue = revenue - commission
        current_capital += net_revenue
        
        trades.append({
            "date": end_date.strftime("%Y-%m-%d"),
            "action": "sell",
            "price": round(final_price, 2),
            "quantity": position,
            "amount": round(net_revenue, 2),
            "pnl": round(net_revenue - sum([t["amount"] for t in trades if t["action"] == "buy"]), 2)
        })
    
    # 计算最终指标
    final_equity = current_capital
    total_return = (final_equity - initial_capital) / initial_capital
    annual_return = (1 + total_return) ** (365.25 / days) - 1
    
    # 计算最大回撤
    peak = initial_capital
    max_drawdown = 0
    for point in equity_curve:
        if point["equity"] > peak:
            peak = point["equity"]
        drawdown = (peak - point["equity"]) / peak
        max_drawdown = max(max_drawdown, drawdown)
    
    # 计算夏普比率
    returns = [point["returns"] for point in equity_curve[1:]]
    if returns:
        mean_return = np.mean(returns)
        std_return = np.std(returns)
        sharpe_ratio = mean_return / std_return * np.sqrt(252) if std_return > 0 else 0
    else:
        sharpe_ratio = 0
    
    # 计算交易统计
    total_trades = len(trades)
    winning_trades = len([t for t in trades if t["pnl"] and t["pnl"] > 0])
    losing_trades = len([t for t in trades if t["pnl"] and t["pnl"] < 0])
    win_rate = winning_trades / total_trades if total_trades > 0 else 0
    
    # 计算盈亏比
    total_profit = sum([t["pnl"] for t in trades if t["pnl"] and t["pnl"] > 0])
    total_loss = abs(sum([t["pnl"] for t in trades if t["pnl"] and t["pnl"] < 0]))
    profit_loss_ratio = total_profit / total_loss if total_loss > 0 else 0
    
    return {
        "metrics": {
            "total_return": round(total_return, 4),
            "annual_return": round(annual_return, 4),
            "max_drawdown": round(max_drawdown, 4),
            "sharpe_ratio": round(sharpe_ratio, 4),
            "win_rate": round(win_rate, 4),
            "profit_loss_ratio": round(profit_loss_ratio, 4),
            "total_trades": total_trades,
            "winning_trades": winning_trades,
            "losing_trades": losing_trades
        },
        "equity_curve": equity_curve,
        "trades": trades,
        "final_equity": round(final_equity, 2)
    }

@app.post("/api/v1/backtest")
async def run_backtest(request: Dict[str, Any]):
    """运行策略回测 - 简化版本"""
    try:
        print("收到回测请求")
        print(f"策略节点数: {len(request.get('strategy', {}).get('nodes', []))}")
        
        # 直接返回模拟结果，不进行复杂的验证
        result = generate_mock_backtest_result()
        
        print(f"生成回测结果: {len(result['equity_curve'])} 个资金曲线点")
        return result
        
    except Exception as e:
        print(f"回测失败: {e}")
        raise HTTPException(status_code=500, detail=f"回测执行失败: {str(e)}")

@app.post("/api/v1/backtest/real")
async def real_backtest(request: Dict[str, Any]):
    """
    真实数据回测接口
    使用真实股票数据进行策略回测
    """
    try:
        print("收到真实数据回测请求")
        
        # 获取请求参数
        strategy = request.get("strategy", {})
        symbol = request.get("symbol", "002130")
        timeframe = request.get("timeframe", "5m")
        start_date = request.get("startDate", "2024-01-01")
        end_date = request.get("endDate", "2024-12-31")
        initial_capital = request.get("initialCapital", 100000)
        strategy_id = request.get("strategyId", None)
        position_management = request.get("positionManagement", "full")
        
        print(f"策略ID: {strategy_id}")
        print(f"策略节点数: {len(strategy.get('nodes', []))}")
        print(f"股票代码: {symbol}, 时间周期: {timeframe}")
        print(f"时间范围: {start_date} ~ {end_date}")
        print(f"初始资金: {initial_capital}")
        print(f"仓位管理: {position_management}")
        
        # 详细记录策略配置
        print("=== 策略配置详情 ===")
        print(f"策略JSON: {json.dumps(strategy, indent=2, ensure_ascii=False)}")
        
        # 分析策略节点类型
        nodes = strategy.get('nodes', [])
        node_types = {}
        for node in nodes:
            node_type = node.get('type', 'unknown')
            sub_type = node.get('data', {}).get('subType', 'unknown')
            node_types[f"{node_type}_{sub_type}"] = node_types.get(f"{node_type}_{sub_type}", 0) + 1
        
        print(f"节点类型统计: {node_types}")
        print("==================")
        
        # 运行真实数据回测
        result = run_real_backtest(strategy, symbol, timeframe, start_date, end_date, initial_capital, position_management)
        
        print(f"生成回测结果: {len(result['equity_curve'])} 个资金曲线点")
        return result
        
    except Exception as e:
        print(f"真实数据回测失败: {e}")
        raise HTTPException(status_code=500, detail=f"真实数据回测执行失败: {str(e)}")

@app.get("/api/v1/data/info/{symbol}")
async def get_stock_data_info(symbol: str):
    """
    获取股票数据信息
    """
    try:
        info = get_data_info(symbol)
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取数据信息失败: {str(e)}")

@app.get("/api/v1/health")
async def health_check():
    """健康检查接口"""
    return {"status": "healthy", "message": "Simple Backtest API is running"}

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
