"""
真实数据回测引擎
使用真实股票数据进行策略回测
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
import logging
from .data_loader import load_stock_data

logger = logging.getLogger(__name__)

class RealBacktestEngine:
    """真实数据回测引擎"""
    
    def __init__(self, initial_capital: float = 100000.0, commission_rate: float = 0.001):
        """
        初始化回测引擎
        
        Args:
            initial_capital: 初始资金
            commission_rate: 手续费率
        """
        self.initial_capital = initial_capital
        self.commission_rate = commission_rate
    
    def calculate_position_size(self, current_capital: float, current_price: float, 
                              position_management: str = 'full') -> int:
        """
        根据仓位管理策略计算买入股数
        
        Args:
            current_capital: 当前可用资金
            current_price: 当前股价
            position_management: 仓位管理策略 ('full', 'half', 'third', 'quarter')
            
        Returns:
            int: 买入股数（100的整数倍）
        """
        # 根据仓位管理策略计算可用资金比例
        if position_management == 'full':
            available_ratio = 1.0
        elif position_management == 'half':
            available_ratio = 0.5
        elif position_management == 'third':
            available_ratio = 1.0 / 3.0
        elif position_management == 'quarter':
            available_ratio = 0.25
        else:
            available_ratio = 1.0  # 默认全仓
        
        # 计算可用资金
        available_capital = current_capital * available_ratio
        
        # 计算可买股数（向下取整到100的整数倍）
        max_shares = int(available_capital / current_price)
        shares_to_buy = (max_shares // 100) * 100  # 确保是100的整数倍
        
        return max(0, shares_to_buy)
        
    def run_backtest(self, strategy: Dict[str, Any], symbol: str = "002130", timeframe: str = "5m", 
                    position_management: str = "full") -> Dict[str, Any]:
        """
        运行回测
        
        Args:
            strategy: 策略定义
            symbol: 股票代码
            timeframe: 时间周期
            position_management: 仓位管理策略
            
        Returns:
            Dict: 回测结果
        """
        try:
            # 加载真实数据
            logger.info(f"正在加载股票数据: {symbol}")
            data = load_stock_data(symbol, timeframe)
            logger.info(f"成功加载 {len(data)} 条数据记录")
            
            # 放宽最小样本量限制：<50 时仍可运行，<10 才报错
            if len(data) < 10:
                raise ValueError("数据量不足，至少需要10条记录")
            
            # 运行回测
            result = self._execute_backtest(data, strategy, position_management)
            
            # 添加数据信息
            result["data_info"] = {
                "symbol": symbol,
                "timeframe": timeframe,
                "total_records": len(data),
                "start_date": data['timestamp'].min().strftime('%Y-%m-%d %H:%M:%S'),
                "end_date": data['timestamp'].max().strftime('%Y-%m-%d %H:%M:%S'),
                "price_range": {
                    "min": float(data['low'].min()),
                    "max": float(data['high'].max()),
                    "current": float(data['close'].iloc[-1])
                }
            }
            
            return result
            
        except Exception as e:
            logger.error(f"回测执行失败: {str(e)}")
            raise
    
    def _execute_backtest(self, data: pd.DataFrame, strategy: Dict[str, Any], 
                         position_management: str = "full") -> Dict[str, Any]:
        """
        执行回测逻辑
        
        Args:
            data: 股票数据
            strategy: 策略定义
            position_management: 仓位管理策略
            
        Returns:
            Dict: 回测结果
        """
        # 初始化状态
        current_capital = self.initial_capital
        position = 0  # 持仓数量
        trades = []
        equity_curve = []
        
        # 获取策略参数
        strategy_type = strategy.get("type", "simple_ma")
        nodes = strategy.get("nodes", [])
        
        logger.info(f"策略类型: {strategy_type}, 节点数: {len(nodes)}")
        
        # 根据节点数量判断策略类型
        if len(nodes) == 0:
            # 没有节点时使用默认简单移动平均策略
            return self._run_simple_ma_strategy(data, current_capital, position, trades, equity_curve, position_management)
        else:
            # 有节点时使用自定义策略
            return self._run_custom_strategy(data, strategy, current_capital, position, trades, equity_curve, position_management)
    
    def _run_simple_ma_strategy(self, data: pd.DataFrame, current_capital: float, 
                               position: int, trades: List[Dict], equity_curve: List[Dict], 
                               position_management: str = "full") -> Dict[str, Any]:
        """
        运行简单移动平均策略
        
        Args:
            data: 股票数据
            current_capital: 当前资金
            position: 当前持仓
            trades: 交易记录
            equity_curve: 资金曲线
            
        Returns:
            Dict: 回测结果
        """
        # 策略参数
        ma_short = 5
        ma_long = 20
        
        # 计算移动平均线
        data['ma_short'] = data['close'].rolling(window=ma_short).mean()
        data['ma_long'] = data['close'].rolling(window=ma_long).mean()
        
        # 回测逻辑
        for i in range(ma_long, len(data)):
            row = data.iloc[i]
            current_price = row['close']
            timestamp = row['timestamp']
            
            # 跳过无效数据
            if pd.isna(row['ma_short']) or pd.isna(row['ma_long']):
                continue
            
            ma_short_value = row['ma_short']
            ma_long_value = row['ma_long']
            
            # 买入条件：短期均线上穿长期均线 且 没有持仓
            if ma_short_value > ma_long_value and position == 0:
                # 根据仓位管理策略计算买入股数
                shares_to_buy = self.calculate_position_size(current_capital, current_price, position_management)
                
                if shares_to_buy >= 100:  # 至少100股才能买入
                    cost = shares_to_buy * current_price
                    commission = cost * self.commission_rate
                    total_cost = cost + commission
                    
                    if total_cost <= current_capital:
                        current_capital -= total_cost
                        position += shares_to_buy
                        
                        trades.append({
                            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                            "action": "buy",
                            "price": round(current_price, 2),
                            "quantity": shares_to_buy,
                            "amount": round(total_cost, 2),
                            "pnl": None
                        })
            
            # 卖出条件：短期均线下穿长期均线 且 有持仓
            elif ma_short_value < ma_long_value and position > 0:
                revenue = position * current_price
                commission = revenue * self.commission_rate
                net_revenue = revenue - commission
                
                # 计算盈亏
                buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"])
                pnl = net_revenue - buy_cost
                
                current_capital += net_revenue
                
                trades.append({
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "action": "sell",
                    "price": round(current_price, 2),
                    "quantity": position,
                    "amount": round(net_revenue, 2),
                    "pnl": round(pnl, 2)
                })
                
                position = 0  # 清空持仓
            
            # 记录资金曲线（每10条记录记录一次）
            if i % 10 == 0:
                current_equity = current_capital + (position * current_price)
                daily_return = 0
                
                if len(equity_curve) > 0:
                    prev_equity = equity_curve[-1]["equity"]
                    daily_return = (current_equity - prev_equity) / prev_equity
                
                equity_curve.append({
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "equity": round(current_equity, 2),
                    "returns": round(daily_return, 4),
                    "price": round(current_price, 2)
                })
        
        # 计算最终结果
        final_equity = current_capital + (position * data['close'].iloc[-1])
        total_return = (final_equity - self.initial_capital) / self.initial_capital
        
        # 计算胜率
        sell_trades = [t for t in trades if t["action"] == "sell" and t["pnl"] is not None]
        win_trades = [t for t in sell_trades if t["pnl"] > 0]
        win_rate = len(win_trades) / len(sell_trades) if sell_trades else 0
        
        # 计算盈亏比（防止 NaN/Inf）
        if sell_trades:
            wins_pnls = [float(t["pnl"]) for t in win_trades] if win_trades else []
            losses_pnls = [float(t["pnl"]) for t in sell_trades if float(t["pnl"]) < 0]
            avg_win = float(np.mean(wins_pnls)) if len(wins_pnls) > 0 else 0.0
            avg_loss = float(np.mean(losses_pnls)) if len(losses_pnls) > 0 else 0.0
            if avg_loss == 0.0:
                profit_loss_ratio = 0.0
            else:
                try:
                    profit_loss_ratio = abs(avg_win / avg_loss)
                    if not np.isfinite(profit_loss_ratio):
                        profit_loss_ratio = 0.0
                except Exception:
                    profit_loss_ratio = 0.0
        else:
            profit_loss_ratio = 0.0
        
        # 计算最大回撤
        max_drawdown = self._calculate_max_drawdown(equity_curve)
        
        # 清理数值中的 NaN/Inf，避免 JSON 序列化失败
        def safe_num(x):
            try:
                v = float(x)
                if not np.isfinite(v):
                    return 0.0
                return v
            except Exception:
                return 0.0

        clean_trades = []
        for t in trades:
            ct = dict(t)
            for k in ("price","quantity","amount","pnl"):
                if k in ct and ct[k] is not None:
                    ct[k] = safe_num(ct[k])
            clean_trades.append(ct)

        clean_equity = []
        for p in equity_curve:
            cp = dict(p)
            cp["equity"] = safe_num(p.get("equity", 0))
            cp["returns"] = safe_num(p.get("returns", 0))
            cp["price"] = safe_num(p.get("price", 0))
            clean_equity.append(cp)

        return {
            "initial_capital": self.initial_capital,
            "final_equity": safe_num(round(final_equity, 2)),
            "total_return": safe_num(round(total_return, 4)),
            "win_rate": safe_num(round(win_rate, 4)),
            "profit_loss_ratio": safe_num(round(profit_loss_ratio, 4)),
            "max_drawdown": safe_num(round(max_drawdown, 4)),
            "total_trades": int(len(trades)),
            "trades": clean_trades,
            "equity_curve": clean_equity,
            "final_market_price": safe_num(round(data['close'].iloc[-1], 2)),
            "price_series": self._build_price_series(data)
        }
    
    def _run_custom_strategy(self, data: pd.DataFrame, strategy: Dict[str, Any], 
                           current_capital: float, position: int, 
                           trades: List[Dict], equity_curve: List[Dict], 
                           position_management: str = "full") -> Dict[str, Any]:
        """
        运行自定义策略（基于节点）
        
        Args:
            data: 股票数据
            strategy: 策略定义
            current_capital: 当前资金
            position: 当前持仓
            trades: 交易记录
            equity_curve: 资金曲线
            
        Returns:
            Dict: 回测结果
        """
        nodes = strategy.get("nodes", [])
        logger.info(f"执行自定义策略，节点数: {len(nodes)}")
        
        # 解析策略节点
        condition_nodes = []
        logic_nodes = []
        action_nodes = []
        
        for node in nodes:
            node_data = node.get("data", {})
            # 使用顶层 node.type 判断节点大类（condition/logic/action）
            node_category = node.get("type", "")
            
            if node_category == "condition":
                condition_nodes.append(node)
            elif node_category == "logic":
                logic_nodes.append(node)
                
            elif node_category == "action":
                action_nodes.append(node)
        
        logger.info(f"条件节点: {len(condition_nodes)}, 逻辑节点: {len(logic_nodes)}, 动作节点: {len(action_nodes)}")
        
        # 如果没有条件节点，使用默认策略
        if len(condition_nodes) == 0:
            logger.info("没有条件节点，使用默认移动平均策略")
            return self._run_simple_ma_strategy(data, current_capital, position, trades, equity_curve, position_management)
        
        # 根据条件节点类型执行不同策略
        return self._run_condition_based_strategy(data, condition_nodes, current_capital, position, trades, equity_curve, position_management)
    
    def _run_condition_based_strategy(self, data: pd.DataFrame, condition_nodes: List[Dict], 
                                    current_capital: float, position: int, 
                                    trades: List[Dict], equity_curve: List[Dict], 
                                    position_management: str = "full") -> Dict[str, Any]:
        """
        基于条件节点执行策略
        
        Args:
            data: 股票数据
            condition_nodes: 条件节点列表
            current_capital: 当前资金
            position: 当前持仓
            trades: 交易记录
            equity_curve: 资金曲线
            
        Returns:
            Dict: 回测结果
        """
        # 获取第一个条件节点的参数
        first_node = condition_nodes[0]
        node_data = first_node.get("data", {})
        # 使用 data.subType 识别策略子类型（ma/rsi/bollinger/vwap/volume）
        sub_type = node_data.get("subType", node_data.get("type", "ma"))
        
        logger.info(f"执行条件策略: {sub_type}")
        
        # 根据条件类型执行不同策略
        if sub_type == "ma":
            return self._run_ma_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management)
        elif sub_type == "rsi":
            return self._run_rsi_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management)
        elif sub_type == "bollinger":
            return self._run_bollinger_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management)
        elif sub_type == "vwap":
            return self._run_vwap_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management)
        elif sub_type == "volume":
            return self._run_volume_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management)
        else:
            # 默认使用移动平均策略
            return self._run_ma_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management)
    
    def _run_ma_strategy(self, data: pd.DataFrame, node_data: Dict, 
                        current_capital: float, position: int, 
                        trades: List[Dict], equity_curve: List[Dict], 
                        position_management: str = "full") -> Dict[str, Any]:
        """执行移动平均策略（双均线交叉）"""
        # 从节点数据获取参数
        period = node_data.get("period", 20)
        threshold = node_data.get("threshold", 0)
        operator = node_data.get("operator", ">")
        
        logger.info(f"MA策略参数: period={period}, threshold={threshold}, operator={operator}")
        
        # 计算短期和长期移动平均线
        short_period = min(period, 10)
        long_period = period
        data['ma_short'] = data['close'].rolling(window=short_period).mean()
        data['ma_long'] = data['close'].rolling(window=long_period).mean()
        
        # 回测逻辑
        for i in range(long_period, len(data)):
            row = data.iloc[i]
            current_price = row['close']
            timestamp = row['timestamp']
            ma_short = row['ma_short']
            ma_long = row['ma_long']
            
            if pd.isna(ma_short) or pd.isna(ma_long):
                continue
            
            # 双均线交叉策略：短期均线上穿长期均线买入，下穿卖出
            if i > long_period:
                prev_ma_short = data.iloc[i-1]['ma_short']
                prev_ma_long = data.iloc[i-1]['ma_long']
                
                # 金叉：短期均线上穿长期均线
                golden_cross = (ma_short > ma_long) and (prev_ma_short <= prev_ma_long)
                # 死叉：短期均线下穿长期均线
                death_cross = (ma_short < ma_long) and (prev_ma_short >= prev_ma_long)
                
                # 买入条件：金叉且没有持仓
                if golden_cross and position == 0:
                    # 根据仓位管理策略计算买入股数
                    shares_to_buy = self.calculate_position_size(current_capital, current_price, position_management)
                    
                    if shares_to_buy >= 100:  # 至少100股才能买入
                        cost = shares_to_buy * current_price
                        commission = cost * self.commission_rate
                        total_cost = cost + commission
                        
                        if total_cost <= current_capital:
                            current_capital -= total_cost
                            position += shares_to_buy
                            
                            trades.append({
                                "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                                "action": "buy",
                                "price": round(current_price, 2),
                                "quantity": shares_to_buy,
                                "amount": round(total_cost, 2),
                                "pnl": None
                            })
            
                # 卖出条件：死叉且有持仓
                elif death_cross and position > 0:
                    revenue = position * current_price
                    commission = revenue * self.commission_rate
                    net_revenue = revenue - commission
                    
                    buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"])
                    pnl = net_revenue - buy_cost
                    
                    current_capital += net_revenue
                    
                    trades.append({
                        "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                        "action": "sell",
                        "price": round(current_price, 2),
                        "quantity": position,
                        "amount": round(net_revenue, 2),
                        "pnl": round(pnl, 2)
                    })
                    
                    position = 0
            
            # 记录资金曲线
            if i % 10 == 0:
                current_equity = current_capital + (position * current_price)
                daily_return = 0
                
                if len(equity_curve) > 0:
                    prev_equity = equity_curve[-1]["equity"]
                    daily_return = (current_equity - prev_equity) / prev_equity
                
                equity_curve.append({
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "equity": round(current_equity, 2),
                    "returns": round(daily_return, 4),
                    "price": round(current_price, 2)
                })
        
        return self._calculate_final_metrics(current_capital, position, data, trades, equity_curve)
    
    def _run_rsi_strategy(self, data: pd.DataFrame, node_data: Dict, 
                         current_capital: float, position: int, 
                         trades: List[Dict], equity_curve: List[Dict], 
                         position_management: str = "full") -> Dict[str, Any]:
        """执行RSI策略"""
        period = node_data.get("period", 14)
        threshold = node_data.get("threshold", 30)
        operator = node_data.get("operator", "<")
        
        logger.info(f"RSI策略参数: period={period}, threshold={threshold}, operator={operator}")
        
        # 计算RSI
        data['rsi'] = self._calculate_rsi(data['close'], period)
        
        # 回测逻辑（类似MA策略）
        for i in range(period, len(data)):
            row = data.iloc[i]
            current_price = row['close']
            timestamp = row['timestamp']
            rsi_value = row['rsi']
            
            if pd.isna(rsi_value):
                continue
            
            condition_met = False
            if operator == ">":
                condition_met = rsi_value > threshold
            elif operator == "<":
                condition_met = rsi_value < threshold
            elif operator == ">=":
                condition_met = rsi_value >= threshold
            elif operator == "<=":
                condition_met = rsi_value <= threshold
            
            # RSI交易逻辑：RSI < 30 买入（超卖），RSI > 70 卖出（超买）
            if rsi_value < 30 and position == 0:  # 超卖买入
                # 根据仓位管理策略计算买入股数
                shares_to_buy = self.calculate_position_size(current_capital, current_price, position_management)
                
                if shares_to_buy >= 100:  # 至少100股才能买入
                    cost = shares_to_buy * current_price
                    commission = cost * self.commission_rate
                    total_cost = cost + commission
                    
                    if total_cost <= current_capital:
                        current_capital -= total_cost
                        position += shares_to_buy
                        
                        trades.append({
                            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                            "action": "buy",
                            "price": round(current_price, 2),
                            "quantity": shares_to_buy,
                            "amount": round(total_cost, 2),
                            "pnl": None
                        })
            
            elif rsi_value > 70 and position > 0:  # 超买卖出
                revenue = position * current_price
                commission = revenue * self.commission_rate
                net_revenue = revenue - commission
                
                buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"])
                pnl = net_revenue - buy_cost
                
                current_capital += net_revenue
                
                trades.append({
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "action": "sell",
                    "price": round(current_price, 2),
                    "quantity": position,
                    "amount": round(net_revenue, 2),
                    "pnl": round(pnl, 2)
                })
                
                position = 0
            
            # 记录资金曲线
            if i % 10 == 0:
                current_equity = current_capital + (position * current_price)
                daily_return = 0
                
                if len(equity_curve) > 0:
                    prev_equity = equity_curve[-1]["equity"]
                    daily_return = (current_equity - prev_equity) / prev_equity
                
                equity_curve.append({
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "equity": round(current_equity, 2),
                    "returns": round(daily_return, 4),
                    "price": round(current_price, 2)
                })
        
        return self._calculate_final_metrics(current_capital, position, data, trades, equity_curve)
    
    def _run_bollinger_strategy(self, data: pd.DataFrame, node_data: Dict, 
                               current_capital: float, position: int, 
                               trades: List[Dict], equity_curve: List[Dict], 
                               position_management: str = "full") -> Dict[str, Any]:
        """执行布林带策略"""
        period = node_data.get("period", 20)
        std_dev = node_data.get("stdDev", 2)
        
        logger.info(f"布林带策略参数: period={period}, std_dev={std_dev}")
        
        # 计算布林带
        data['bb_middle'] = data['close'].rolling(window=period).mean()
        data['bb_std'] = data['close'].rolling(window=period).std()
        data['bb_upper'] = data['bb_middle'] + (data['bb_std'] * std_dev)
        data['bb_lower'] = data['bb_middle'] - (data['bb_std'] * std_dev)
        
        # 回测逻辑（简化版）
        for i in range(period, len(data)):
            row = data.iloc[i]
            current_price = row['close']
            timestamp = row['timestamp']
            bb_upper = row['bb_upper']
            bb_lower = row['bb_lower']
            
            if pd.isna(bb_upper) or pd.isna(bb_lower):
                continue
            
            # 布林带策略：价格突破上轨买入，跌破下轨卖出
            if current_price > bb_upper and position == 0:
                # 根据仓位管理策略计算买入股数
                shares_to_buy = self.calculate_position_size(current_capital, current_price, position_management)
                
                if shares_to_buy >= 100:  # 至少100股才能买入
                    cost = shares_to_buy * current_price
                    commission = cost * self.commission_rate
                    total_cost = cost + commission
                    
                    if total_cost <= current_capital:
                        current_capital -= total_cost
                        position += shares_to_buy
                        
                        trades.append({
                            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                            "action": "buy",
                            "price": round(current_price, 2),
                            "quantity": shares_to_buy,
                            "amount": round(total_cost, 2),
                            "pnl": None
                        })
            
            elif current_price < bb_lower and position > 0:
                revenue = position * current_price
                commission = revenue * self.commission_rate
                net_revenue = revenue - commission
                
                buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"])
                pnl = net_revenue - buy_cost
                
                current_capital += net_revenue
                
                trades.append({
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "action": "sell",
                    "price": round(current_price, 2),
                    "quantity": position,
                    "amount": round(net_revenue, 2),
                    "pnl": round(pnl, 2)
                })
                
                position = 0
            
            # 记录资金曲线
            if i % 10 == 0:
                current_equity = current_capital + (position * current_price)
                daily_return = 0
                
                if len(equity_curve) > 0:
                    prev_equity = equity_curve[-1]["equity"]
                    daily_return = (current_equity - prev_equity) / prev_equity
                
                equity_curve.append({
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "equity": round(current_equity, 2),
                    "returns": round(daily_return, 4),
                    "price": round(current_price, 2)
                })
        
        return self._calculate_final_metrics(current_capital, position, data, trades, equity_curve)
    
    def _calculate_rsi(self, prices: pd.Series, period: int = 14) -> pd.Series:
        """计算RSI指标"""
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
    
    def _run_vwap_strategy(self, data: pd.DataFrame, node_data: Dict, 
                          current_capital: float, position: int, 
                          trades: List[Dict], equity_curve: List[Dict], 
                          position_management: str = "full") -> Dict[str, Any]:
        """执行VWAP策略"""
        # 从节点数据获取参数
        period = node_data.get("period", 20)
        deviation = node_data.get("deviation", 0.02)
        operator = node_data.get("operator", "below")
        
        logger.info(f"VWAP策略参数: period={period}, deviation={deviation}, operator={operator}")
        
        # 计算VWAP
        data['vwap'] = (data['close'] * data['volume']).rolling(window=period).sum() / data['volume'].rolling(window=period).sum()
        
        # 回测逻辑
        for i in range(period, len(data)):
            row = data.iloc[i]
            current_price = row['close']
            timestamp = row['timestamp']
            vwap = row['vwap']
            
            if pd.isna(vwap):
                continue
            
            # 计算价格与VWAP的偏差
            price_deviation = (current_price - vwap) / vwap
            
            # 买入条件：价格低于VWAP一定百分比
            if operator == "below" and price_deviation < -deviation and position == 0:
                # 根据仓位管理策略计算买入股数
                shares_to_buy = self.calculate_position_size(current_capital, current_price, position_management)
                
                if shares_to_buy >= 100:  # 至少100股才能买入
                    cost = shares_to_buy * current_price
                    commission = cost * self.commission_rate
                    total_cost = cost + commission
                    
                    if total_cost <= current_capital:
                        current_capital -= total_cost
                        position += shares_to_buy
                        
                        trades.append({
                            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                            "action": "buy",
                            "price": round(current_price, 2),
                            "quantity": shares_to_buy,
                            "amount": round(total_cost, 2),
                            "pnl": None
                        })
            
            # 卖出条件：价格高于VWAP一定百分比
            elif operator == "above" and price_deviation > deviation and position > 0:
                revenue = position * current_price
                commission = revenue * self.commission_rate
                net_revenue = revenue - commission
                
                buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"])
                pnl = net_revenue - buy_cost
                
                current_capital += net_revenue
                
                trades.append({
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "action": "sell",
                    "price": round(current_price, 2),
                    "quantity": position,
                    "amount": round(net_revenue, 2),
                    "pnl": round(pnl, 2)
                })
                
                position = 0
            
            # 记录资金曲线
            current_equity = current_capital + (position * current_price)
            equity_curve.append({
                "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                "equity": round(current_equity, 2),
                "price": round(current_price, 2)
            })
        
        return self._calculate_final_metrics(current_capital, position, data, trades, equity_curve)
    
    def _run_volume_strategy(self, data: pd.DataFrame, node_data: Dict, 
                            current_capital: float, position: int, 
                            trades: List[Dict], equity_curve: List[Dict], 
                            position_management: str = "full") -> Dict[str, Any]:
        """执行成交量策略"""
        # 从节点数据获取参数
        period = node_data.get("period", 5)
        multiplier = node_data.get("multiplier", 1.5)
        operator = node_data.get("operator", "greater_than")
        
        logger.info(f"Volume策略参数: period={period}, multiplier={multiplier}, operator={operator}")
        
        # 计算平均成交量
        data['avg_volume'] = data['volume'].rolling(window=period).mean()
        
        # 回测逻辑
        for i in range(period, len(data)):
            row = data.iloc[i]
            current_price = row['close']
            timestamp = row['timestamp']
            current_volume = row['volume']
            avg_volume = row['avg_volume']
            
            if pd.isna(avg_volume) or avg_volume == 0:
                continue
            
            # 计算成交量倍数
            volume_ratio = current_volume / avg_volume
            
            # 买入条件：成交量放大
            if operator == "greater_than" and volume_ratio > multiplier and position == 0:
                # 根据仓位管理策略计算买入股数
                shares_to_buy = self.calculate_position_size(current_capital, current_price, position_management)
                
                if shares_to_buy >= 100:  # 至少100股才能买入
                    cost = shares_to_buy * current_price
                    commission = cost * self.commission_rate
                    total_cost = cost + commission
                    
                    if total_cost <= current_capital:
                        current_capital -= total_cost
                        position += shares_to_buy
                        
                        trades.append({
                            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                            "action": "buy",
                            "price": round(current_price, 2),
                            "quantity": shares_to_buy,
                            "amount": round(total_cost, 2),
                            "pnl": None
                        })
            
            # 记录资金曲线
            current_equity = current_capital + (position * current_price)
            equity_curve.append({
                "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                "equity": round(current_equity, 2),
                "price": round(current_price, 2)
            })
        
        return self._calculate_final_metrics(current_capital, position, data, trades, equity_curve)
    
    def _calculate_final_metrics(self, current_capital: float, position: int, 
                                data: pd.DataFrame, trades: List[Dict], 
                                equity_curve: List[Dict]) -> Dict[str, Any]:
        """计算最终回测指标"""
        final_equity = current_capital + (position * data['close'].iloc[-1])
        total_return = (final_equity - self.initial_capital) / self.initial_capital
        
        # 计算胜率
        sell_trades = [t for t in trades if t["action"] == "sell" and t["pnl"] is not None]
        win_trades = [t for t in sell_trades if t["pnl"] > 0]
        win_rate = len(win_trades) / len(sell_trades) if sell_trades else 0
        
        # 计算盈亏比（防止 NaN/Inf）
        if sell_trades:
            wins_pnls = [float(t["pnl"]) for t in win_trades] if win_trades else []
            losses_pnls = [float(t["pnl"]) for t in sell_trades if float(t["pnl"]) < 0]
            avg_win = float(np.mean(wins_pnls)) if len(wins_pnls) > 0 else 0.0
            avg_loss = float(np.mean(losses_pnls)) if len(losses_pnls) > 0 else 0.0
            if avg_loss == 0.0:
                profit_loss_ratio = 0.0
            else:
                try:
                    profit_loss_ratio = abs(avg_win / avg_loss)
                    if not np.isfinite(profit_loss_ratio):
                        profit_loss_ratio = 0.0
                except Exception:
                    profit_loss_ratio = 0.0
        else:
            profit_loss_ratio = 0.0
        
        # 计算最大回撤
        max_drawdown = self._calculate_max_drawdown(equity_curve)
        
        return {
            "initial_capital": self.initial_capital,
            "final_equity": round(final_equity, 2),
            "total_return": round(total_return, 4),
            "win_rate": round(win_rate, 4),
            "profit_loss_ratio": round(profit_loss_ratio, 4),
            "max_drawdown": round(max_drawdown, 4),
            "total_trades": len(trades),
            "trades": trades,
            "equity_curve": equity_curve,
            "final_market_price": round(data['close'].iloc[-1], 2),
            "price_series": self._build_price_series(data)
        }
    
    def _calculate_max_drawdown(self, equity_curve: List[Dict]) -> float:
        """
        计算最大回撤
        
        Args:
            equity_curve: 资金曲线
            
        Returns:
            float: 最大回撤
        """
        if not equity_curve:
            return 0
        
        equities = [point["equity"] for point in equity_curve]
        peak = equities[0]
        max_drawdown = 0
        
        for equity in equities:
            if equity > peak:
                peak = equity
            drawdown = (peak - equity) / peak
            max_drawdown = max(max_drawdown, drawdown)
        
        return max_drawdown

    def _build_price_series(self, data: pd.DataFrame) -> List[Dict[str, Any]]:
        """从原始数据构建价格序列用于前端K线图"""
        series: List[Dict[str, Any]] = []
        for _, row in data.iterrows():
            series.append({
                "timestamp": row['timestamp'].strftime('%Y-%m-%d %H:%M:%S'),
                "open": round(float(row['open']), 2) if 'open' in row else round(float(row['close']), 2),
                "high": round(float(row['high']), 2) if 'high' in row else round(float(row['close']), 2),
                "low": round(float(row['low']), 2) if 'low' in row else round(float(row['close']), 2),
                "close": round(float(row['close']), 2)
            })
        return series

# 全局回测引擎实例
backtest_engine = RealBacktestEngine()

def run_real_backtest(strategy: Dict[str, Any], symbol: str = "002130", timeframe: str = "5m", 
                     start_date: str = "2024-01-01", end_date: str = "2024-12-31", 
                     initial_capital: float = 100000.0, position_management: str = "full") -> Dict[str, Any]:
    """
    便捷函数：运行真实数据回测
    
    Args:
        strategy: 策略定义
        symbol: 股票代码
        timeframe: 时间周期
        start_date: 开始日期
        end_date: 结束日期
        initial_capital: 初始资金
        position_management: 仓位管理策略
        
    Returns:
        Dict: 回测结果
    """
    # 创建新的回测引擎实例，使用指定的初始资金
    engine = RealBacktestEngine(initial_capital=initial_capital)
    
    # 加载数据并过滤时间范围
    data = load_stock_data(symbol, timeframe)
    
    # 过滤时间范围
    if start_date and end_date:
        start_dt = pd.to_datetime(start_date)
        end_dt = pd.to_datetime(end_date)
        logger.info(f"原始数据量: {len(data)} 条记录")
        logger.info(f"过滤时间范围: {start_dt} 至 {end_dt}")
        
        data = data[(data['timestamp'] >= start_dt) & (data['timestamp'] <= end_dt)]
        logger.info(f"过滤后数据量: {len(data)} 条记录")
        
        if len(data) > 0:
            logger.info(f"数据时间范围: {data['timestamp'].min()} 至 {data['timestamp'].max()}")
        else:
            logger.warning("过滤后没有数据，使用原始数据")
            data = load_stock_data(symbol, timeframe)
    
    # 放宽最小样本量限制：<50 时仍可运行，<10 才报错
    if len(data) < 10:
        raise ValueError("过滤后数据量不足，至少需要10条记录")
    
    # 执行回测
    result = engine._execute_backtest(data, strategy, position_management)
    
    # 添加数据信息
    result["data_info"] = {
        "symbol": symbol,
        "timeframe": timeframe,
        "total_records": len(data),
        "start_date": data['timestamp'].min().strftime('%Y-%m-%d %H:%M:%S'),
        "end_date": data['timestamp'].max().strftime('%Y-%m-%d %H:%M:%S'),
        "price_range": {
            "min": float(data['low'].min()),
            "max": float(data['high'].max()),
            "current": float(data['close'].iloc[-1])
        }
    }
    
    return result
