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

class MarketModel:
    """市场模型基类：定义撮合与规则（占位，后续扩展）。"""
    def __init__(self, commission_rate: float = 0.001):
        self.commission_rate = commission_rate

    def min_lot(self) -> int:
        return 100  # 股票默认手数；期货模型可覆盖

    def buy_commission(self, amount: float) -> float:
        return amount * self.commission_rate

    def sell_commission(self, amount: float) -> float:
        return amount * self.commission_rate

class StockMarketModel(MarketModel):
    pass

class FuturesMarketModel(MarketModel):
    def min_lot(self) -> int:
        return 1  # 期货以合约张数计（占位）

class RealBacktestEngine:
    """真实数据回测引擎"""
    
    def __init__(self, initial_capital: float = 100000.0, commission_rate: float = 0.001, market: Optional[MarketModel] = None):
        """
        初始化回测引擎
        
        Args:
            initial_capital: 初始资金
            commission_rate: 手续费率
        """
        self.initial_capital = initial_capital
        self.commission_rate = commission_rate
        self.market = market or StockMarketModel(commission_rate=commission_rate)
    
    def calculate_position_size(self, current_capital: float, current_price: float, 
                              position_management: str = 'full') -> int:
        """
        根据仓位管理策略计算买入股数
        
        Args:
            current_capital: 当前可用资金
            current_price: 当前股价
            position_management: 仓位管理策略 ('full', 'half', 'third', 'quarter')
            
        Returns:
            int: 买入股数（按市场模型的最小手数整数倍）
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
        
        available_capital = current_capital * available_ratio
        max_units = int(available_capital / max(current_price, 1e-9))
        lot = self.market.min_lot()
        shares_to_buy = (max_units // lot) * lot
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
            # 粗粒度选择市场模型：features 目录/非6位数字视为期货
            if not symbol.isdigit() or len(symbol) != 6:
                self.market = FuturesMarketModel(commission_rate=self.commission_rate)
            else:
                self.market = StockMarketModel(commission_rate=self.commission_rate)

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
        meta = strategy.get("meta") or {}
        stop_cfg = (meta.get('stop_loss') if isinstance(meta, dict) else None) or {}
        sl_type = str(stop_cfg.get('type') or 'pct')  # 'pct' | 'amount'
        sl_value = float(stop_cfg.get('value') or 0.0)
        sl_action = str(stop_cfg.get('action') or 'sell_all')  # 'sell_all' | 'reduce_half'
        
        logger.info(f"策略类型: {strategy_type}, 节点数: {len(nodes)}")
        
        # 根据节点数量判断策略类型
        if len(nodes) == 0:
            # 没有节点时使用默认简单移动平均策略
            return self._run_simple_ma_strategy(data, current_capital, position, trades, equity_curve, position_management)
        else:
            # 有节点时使用自定义策略
            return self._run_custom_strategy(data, strategy, current_capital, position, trades, equity_curve, position_management, (sl_type, sl_value, sl_action))
    
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
                
                if shares_to_buy >= self.market.min_lot():
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
                           position_management: str = "full",
                           stop_loss_cfg: Optional[Tuple[str, float, str]] = None) -> Dict[str, Any]:
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
        return self._run_condition_based_strategy(data, condition_nodes, current_capital, position, trades, equity_curve, position_management, stop_loss_cfg)
    
    def _run_condition_based_strategy(self, data: pd.DataFrame, condition_nodes: List[Dict], 
                                    current_capital: float, position: int, 
                                    trades: List[Dict], equity_curve: List[Dict], 
                                    position_management: str = "full",
                                    stop_loss_cfg: Optional[Tuple[str, float, str]] = None) -> Dict[str, Any]:
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
            return self._run_ma_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management, stop_loss_cfg)
        elif sub_type == "rsi":
            return self._run_rsi_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management, stop_loss_cfg)
        elif sub_type == "bollinger":
            return self._run_bollinger_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management, stop_loss_cfg)
        elif sub_type == "vwap":
            return self._run_vwap_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management, stop_loss_cfg)
        elif sub_type == "volume":
            return self._run_volume_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management, stop_loss_cfg)
        elif sub_type == "macd":
            return self._run_macd_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management, stop_loss_cfg)
        else:
            # 默认使用移动平均策略
            return self._run_ma_strategy(data, node_data, current_capital, position, trades, equity_curve, position_management)
    
    def _run_ma_strategy(self, data: pd.DataFrame, node_data: Dict, 
                        current_capital: float, position: int, 
                        trades: List[Dict], equity_curve: List[Dict], 
                        position_management: str = "full",
                        stop_loss_cfg: Optional[Tuple[str, float, str]] = None) -> Dict[str, Any]:
        """执行移动平均策略（双均线交叉）"""
        # 从节点数据获取参数
        period = node_data.get("period", 20)
        threshold = node_data.get("threshold", 0)
        operator = node_data.get("operator", ">")
        
        logger.info(f"MA策略参数: period={period}, threshold={threshold}, operator={operator}")
        
        # 计算短期和长期移动平均线（避免 SettingWithCopy，用副本并 assign）
        short_period = min(period, 10)
        long_period = period
        data = data.copy()
        data = data.assign(
            ma_short=data['close'].rolling(window=short_period).mean(),
            ma_long=data['close'].rolling(window=long_period).mean()
        )
        
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
                    
                    if shares_to_buy >= self.market.min_lot():
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
            
            # 止损检查
            if position > 0 and (stop_loss_cfg is not None):
                sl_type, sl_value, sl_action = stop_loss_cfg
                current_equity = current_capital + (position * current_price)
                max_loss = 0.0
                if sl_type == 'pct' and sl_value > 0:
                    max_loss = self.initial_capital * (sl_value / 100.0)
                elif sl_type == 'amount' and sl_value > 0:
                    max_loss = sl_value
                if max_loss > 0 and (self.initial_capital - current_equity) >= max_loss:
                    # 触发止损
                    if sl_action == 'reduce_half' and position > 0:
                        qty = max(self.market.min_lot(), (position // 2) // self.market.min_lot() * self.market.min_lot())
                    else:
                        qty = position
                    revenue = qty * current_price
                    commission = revenue * self.commission_rate
                    net_revenue = revenue - commission
                    buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"]) * (qty/position if position>0 else 1)
                    pnl = net_revenue - buy_cost
                    current_capital += net_revenue
                    position -= qty
                    trades.append({
                        "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                        "action": "sell",
                        "price": round(current_price, 2),
                        "quantity": qty,
                        "amount": round(net_revenue, 2),
                        "pnl": round(pnl, 2),
                        "note": "止损"
                    })

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
                         position_management: str = "full",
                         stop_loss_cfg: Optional[Tuple[str, float, str]] = None) -> Dict[str, Any]:
        """执行RSI策略"""
        period = node_data.get("period", 14)
        threshold = node_data.get("threshold", 30)
        operator = node_data.get("operator", "<")
        
        logger.info(f"RSI策略参数: period={period}, threshold={threshold}, operator={operator}")
        
        # 计算RSI（避免 SettingWithCopy）
        data = data.copy()
        data = data.assign(rsi=self._calculate_rsi(data['close'], period))
        # 调试统计
        stats = {
            'type': 'rsi',
            'params': {'period': period, 'threshold': threshold, 'operator': operator},
            'indicator_samples': {'rsi_notna': int(data['rsi'].notna().sum())},
            'signals': {'cond_true': 0},
            'orders': {'buy_attempts': 0, 'sell_attempts': 0, 'buys': 0, 'sells': 0},
            'rejections': {'min_lot': 0, 'insufficient_cash': 0},
            'min_lot': self.market.min_lot(),
        }
        
        # 回测逻辑（使用参数化阈值与操作符）
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
            
            # 参数化 RSI 交易逻辑：根据 operator/threshold 触发
            cond_buy = (position == 0 and (
                (operator in ('<','below') and rsi_value < threshold) or
                (operator in ('>','above') and rsi_value > threshold) or
                (operator == '<=' and rsi_value <= threshold) or
                (operator == '>=' and rsi_value >= threshold)
            ))
            if cond_buy:
                stats['signals']['cond_true'] += 1
                # 根据仓位管理策略计算买入股数
                shares_to_buy = self.calculate_position_size(current_capital, current_price, position_management)
                stats['orders']['buy_attempts'] += 1
                
                if shares_to_buy >= self.market.min_lot():
                    cost = shares_to_buy * current_price
                    commission = cost * self.commission_rate
                    total_cost = cost + commission
                    
                    if total_cost <= current_capital:
                        current_capital -= total_cost
                        position += shares_to_buy
                        stats['orders']['buys'] += 1
                        
                        trades.append({
                            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                            "action": "buy",
                            "price": round(current_price, 2),
                            "quantity": shares_to_buy,
                            "amount": round(total_cost, 2),
                            "pnl": None
                        })
                    else:
                        stats['rejections']['insufficient_cash'] += 1
                else:
                    stats['rejections']['min_lot'] += 1
            
            elif position > 0 and (
                (operator in ('>','above') and rsi_value > threshold) or
                (operator in ('<','below') and rsi_value < threshold) or
                (operator == '>=' and rsi_value >= threshold) or
                (operator == '<=' and rsi_value <= threshold)
            ):
                stats['orders']['sell_attempts'] += 1
                revenue = position * current_price
                commission = revenue * self.commission_rate
                net_revenue = revenue - commission
                
                buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"])
                pnl = net_revenue - buy_cost
                
                current_capital += net_revenue
                
                stats['orders']['sells'] += 1
                trades.append({
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "action": "sell",
                    "price": round(current_price, 2),
                    "quantity": position,
                    "amount": round(net_revenue, 2),
                    "pnl": round(pnl, 2)
                })
                
                position = 0
            
            # 止损检查
            if position > 0 and (stop_loss_cfg is not None):
                sl_type, sl_value, sl_action = stop_loss_cfg
                current_equity = current_capital + (position * current_price)
                max_loss = 0.0
                if sl_type == 'pct' and sl_value > 0:
                    max_loss = self.initial_capital * (sl_value / 100.0)
                elif sl_type == 'amount' and sl_value > 0:
                    max_loss = sl_value
                if max_loss > 0 and (self.initial_capital - current_equity) >= max_loss:
                    if sl_action == 'reduce_half' and position > 0:
                        qty = max(self.market.min_lot(), (position // 2) // self.market.min_lot() * self.market.min_lot())
                    else:
                        qty = position
                    revenue = qty * current_price
                    commission = revenue * self.commission_rate
                    net_revenue = revenue - commission
                    buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"]) * (qty/position if position>0 else 1)
                    pnl = net_revenue - buy_cost
                    current_capital += net_revenue
                    position -= qty
                    trades.append({
                        "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                        "action": "sell",
                        "price": round(current_price, 2),
                        "quantity": qty,
                        "amount": round(net_revenue, 2),
                        "pnl": round(pnl, 2),
                        "note": "止损"
                    })

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
        
        res = self._calculate_final_metrics(current_capital, position, data, trades, equity_curve)
        try:
            res.setdefault('debug', {})['rsi'] = stats
        except Exception:
            pass
        return res
    
    def _run_bollinger_strategy(self, data: pd.DataFrame, node_data: Dict, 
                               current_capital: float, position: int, 
                               trades: List[Dict], equity_curve: List[Dict], 
                               position_management: str = "full",
                               stop_loss_cfg: Optional[Tuple[str, float, str]] = None) -> Dict[str, Any]:
        """执行布林带策略"""
        period = node_data.get("period", 20)
        std_dev = node_data.get("stdDev", 2)
        
        logger.info(f"布林带策略参数: period={period}, std_dev={std_dev}")
        
        # 计算布林带（避免 SettingWithCopy）
        data = data.copy()
        bb_middle = data['close'].rolling(window=period).mean()
        bb_std = data['close'].rolling(window=period).std()
        data = data.assign(
            bb_middle=bb_middle,
            bb_std=bb_std,
            bb_upper=bb_middle + (bb_std * std_dev),
            bb_lower=bb_middle - (bb_std * std_dev)
        )
        
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
                
                if shares_to_buy >= self.market.min_lot():
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
            
            # 止损检查
            if position > 0 and (stop_loss_cfg is not None):
                sl_type, sl_value, sl_action = stop_loss_cfg
                current_equity = current_capital + (position * current_price)
                max_loss = 0.0
                if sl_type == 'pct' and sl_value > 0:
                    max_loss = self.initial_capital * (sl_value / 100.0)
                elif sl_type == 'amount' and sl_value > 0:
                    max_loss = sl_value
                if max_loss > 0 and (self.initial_capital - current_equity) >= max_loss:
                    if sl_action == 'reduce_half' and position > 0:
                        qty = max(self.market.min_lot(), (position // 2) // self.market.min_lot() * self.market.min_lot())
                    else:
                        qty = position
                    revenue = qty * current_price
                    commission = revenue * self.commission_rate
                    net_revenue = revenue - commission
                    buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"]) * (qty/position if position>0 else 1)
                    pnl = net_revenue - buy_cost
                    current_capital += net_revenue
                    position -= qty
                    trades.append({
                        "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                        "action": "sell",
                        "price": round(current_price, 2),
                        "quantity": qty,
                        "amount": round(net_revenue, 2),
                        "pnl": round(pnl, 2),
                        "note": "止损"
                    })

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

    def _run_macd_strategy(self, data: pd.DataFrame, node_data: Dict,
                           current_capital: float, position: int,
                           trades: List[Dict], equity_curve: List[Dict],
                           position_management: str = "full",
                           stop_loss_cfg: Optional[Tuple[str, float, str]] = None) -> Dict[str, Any]:
        """执行 MACD 策略
        参数（来自前端节点 data）:
          - fast: 快线周期，默认 12
          - slow: 慢线周期，默认 26
          - signal: 信号线周期，默认 9
          - threshold: 触发阈值（针对柱体 DIF-DEA），默认 0
          - operator: 比较符号（>、<、>=、<=），默认 '>'
        交易规则（简化）:
          - 买入：柱体从下向上突破 threshold（含0）且空仓
          - 卖出：柱体从上向下跌破 -threshold（含0）且持仓
        """
        fast = int(node_data.get("fast", 12) or 12)
        slow = int(node_data.get("slow", 26) or 26)
        signal = int(node_data.get("signal", 9) or 9)
        mode = str(node_data.get("mode", "hist_threshold") or "hist_threshold")
        threshold = float(node_data.get("threshold", 0) or 0.0)
        operator = str(node_data.get("operator", ">") or ">")

        logger.info(f"MACD策略参数: fast={fast}, slow={slow}, signal={signal}, mode={mode}, threshold={threshold}, operator={operator}")

        # 计算 MACD
        data = data.copy()
        ema_fast = data['close'].ewm(span=fast, adjust=False).mean()
        ema_slow = data['close'].ewm(span=slow, adjust=False).mean()
        dif = ema_fast - ema_slow
        dea = dif.ewm(span=signal, adjust=False).mean()
        hist = dif - dea
        data = data.assign(macd_dif=dif, macd_dea=dea, macd_hist=hist)

        def cmp(x: float, y: float, op: str) -> bool:
            if op == '>':
                return x > y
            if op == '<':
                return x < y
            if op == '>=':
                return x >= y
            if op == '<=':
                return x <= y
            if op == '==':
                return x == y
            if op == '!=':
                return x != y
            return x > y

        open_position_cost = 0.0  # 当前持仓的总成本（含手续费），用于精确计算止损和收益
        for i in range(max(slow, signal) + 1, len(data)):
            row = data.iloc[i]
            prev = data.iloc[i-1]
            current_price = row['close']
            timestamp = row['timestamp']
            h = row['macd_hist']
            hp = prev['macd_hist']

            if pd.isna(h) or pd.isna(hp):
                continue

            # 信号模式
            gc = (prev['macd_dif'] <= prev['macd_dea']) and (row['macd_dif'] > row['macd_dea'])
            dc = (prev['macd_dif'] >= prev['macd_dea']) and (row['macd_dif'] < row['macd_dea'])
            if mode == 'golden_cross':
                # 入场：金叉；出场：死叉
                buy_cross = gc
                sell_cross = dc
            elif mode == 'death_cross':
                # 入场：死叉；出场：金叉（与金叉模式相反）
                buy_cross = dc
                sell_cross = gc
            elif mode == 'zero_above':
                buy_cross = (prev['macd_dif'] <= 0) and (row['macd_dif'] > 0)
                sell_cross = dc  # 离场用死叉
            elif mode == 'zero_below':
                buy_cross = gc  # 入场用金叉
                sell_cross = (prev['macd_dif'] >= 0) and (row['macd_dif'] < 0)
            elif mode == 'hist_turn_positive':
                buy_cross = (hp <= 0) and (h > 0)
                sell_cross = dc
            elif mode == 'hist_turn_negative':
                buy_cross = gc
                sell_cross = (hp >= 0) and (h < 0)
            else:
                # 默认：柱体与阈值比较；离场仍用死叉保障闭环
                buy_cross = (hp <= threshold) and cmp(h, threshold, operator)
                sell_cross = dc

            if buy_cross and position == 0:
                shares_to_buy = self.calculate_position_size(current_capital, current_price, position_management)
                if shares_to_buy >= self.market.min_lot():
                    cost = shares_to_buy * current_price
                    commission = cost * self.commission_rate
                    total_cost = cost + commission
                    if total_cost <= current_capital:
                        current_capital -= total_cost
                        position += shares_to_buy
                        open_position_cost += total_cost
                        trades.append({
                            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                            "action": "buy",
                            "price": round(current_price, 2),
                            "quantity": shares_to_buy,
                            "amount": round(total_cost, 2),
                            "pnl": None
                        })

            elif sell_cross and position > 0:
                qty = position
                revenue = qty * current_price
                commission = revenue * self.commission_rate
                net_revenue = revenue - commission
                # 以当前持仓成本计算本次卖出盈亏
                sell_cost = open_position_cost * (qty / position) if position > 0 else 0.0
                pnl = net_revenue - sell_cost
                current_capital += net_revenue
                trades.append({
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "action": "sell",
                    "price": round(current_price, 2),
                    "quantity": qty,
                    "amount": round(net_revenue, 2),
                    "pnl": round(pnl, 2)
                })
                position -= qty
                open_position_cost -= sell_cost
                if position == 0:
                    open_position_cost = 0.0

            # 止损检查
            if position > 0 and (stop_loss_cfg is not None):
                sl_type, sl_value, sl_action = stop_loss_cfg
                # 以开仓成本（含手续费）衡量未实现亏损
                current_value = position * current_price
                unrealized_loss_amount = max(0.0, open_position_cost - current_value)
                trigger = False
                if sl_type == 'pct' and sl_value > 0:
                    # 按开仓成本百分比
                    trigger = unrealized_loss_amount >= (open_position_cost * (sl_value / 100.0))
                elif sl_type == 'amount' and sl_value > 0:
                    trigger = unrealized_loss_amount >= sl_value
                if trigger:
                    if sl_action == 'reduce_half' and position > 0:
                        qty = max(self.market.min_lot(), (position // 2) // self.market.min_lot() * self.market.min_lot())
                        qty = min(qty, position)
                    else:
                        qty = position
                    if qty > 0:
                        revenue = qty * current_price
                        commission = revenue * self.commission_rate
                        net_revenue = revenue - commission
                        sell_cost = open_position_cost * (qty / position) if position > 0 else 0.0
                        pnl = net_revenue - sell_cost
                        current_capital += net_revenue
                        position -= qty
                        open_position_cost -= sell_cost
                        trades.append({
                            "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                            "action": "sell",
                            "price": round(current_price, 2),
                            "quantity": qty,
                            "amount": round(net_revenue, 2),
                            "pnl": round(pnl, 2),
                            "note": "止损"
                        })
                        if position == 0:
                            open_position_cost = 0.0

            # 记录资金曲线（适度抽样）
            if i % 5 == 0:
                current_equity = current_capital + (position * current_price)
                equity_curve.append({
                    "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "equity": round(current_equity, 2),
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
                          position_management: str = "full",
                          stop_loss_cfg: Optional[Tuple[str, float, str]] = None) -> Dict[str, Any]:
        """执行VWAP策略"""
        # 从节点数据获取参数
        period = node_data.get("period", 20)
        deviation = node_data.get("deviation", 0.02)
        operator = node_data.get("operator", "below")
        
        logger.info(f"VWAP策略参数: period={period}, deviation={deviation}, operator={operator}")
        
        # 计算VWAP
        data = data.copy()
        roll_value = (data['close'] * data['volume']).rolling(window=period).sum()
        roll_vol = data['volume'].rolling(window=period).sum()
        data = data.assign(vwap=roll_value / roll_vol)
        
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
                
                if shares_to_buy >= self.market.min_lot():
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
            
            # 止损检查
            if position > 0 and (stop_loss_cfg is not None):
                sl_type, sl_value, sl_action = stop_loss_cfg
                current_equity = current_capital + (position * current_price)
                max_loss = 0.0
                if sl_type == 'pct' and sl_value > 0:
                    max_loss = self.initial_capital * (sl_value / 100.0)
                elif sl_type == 'amount' and sl_value > 0:
                    max_loss = sl_value
                if max_loss > 0 and (self.initial_capital - current_equity) >= max_loss:
                    if sl_action == 'reduce_half' and position > 0:
                        qty = max(self.market.min_lot(), (position // 2) // self.market.min_lot() * self.market.min_lot())
                    else:
                        qty = position
                    revenue = qty * current_price
                    commission = revenue * self.commission_rate
                    net_revenue = revenue - commission
                    buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"]) * (qty/position if position>0 else 1)
                    pnl = net_revenue - buy_cost
                    current_capital += net_revenue
                    position -= qty
                    trades.append({
                        "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                        "action": "sell",
                        "price": round(current_price, 2),
                        "quantity": qty,
                        "amount": round(net_revenue, 2),
                        "pnl": round(pnl, 2),
                        "note": "止损"
                    })

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
                            position_management: str = "full",
                            stop_loss_cfg: Optional[Tuple[str, float, str]] = None) -> Dict[str, Any]:
        """执行成交量策略"""
        # 从节点数据获取参数
        period = node_data.get("period", 5)
        multiplier = node_data.get("multiplier", 1.5)
        operator = node_data.get("operator", "greater_than")
        
        logger.info(f"Volume策略参数: period={period}, multiplier={multiplier}, operator={operator}")
        
        # 计算平均成交量
        data = data.copy()
        data = data.assign(avg_volume=data['volume'].rolling(window=period).mean())
        
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
                
                if shares_to_buy >= self.market.min_lot():
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
            
            # 止损检查
            if position > 0 and (stop_loss_cfg is not None):
                sl_type, sl_value, sl_action = stop_loss_cfg
                current_equity = current_capital + (position * current_price)
                max_loss = 0.0
                if sl_type == 'pct' and sl_value > 0:
                    max_loss = self.initial_capital * (sl_value / 100.0)
                elif sl_type == 'amount' and sl_value > 0:
                    max_loss = sl_value
                if max_loss > 0 and (self.initial_capital - current_equity) >= max_loss:
                    if sl_action == 'reduce_half' and position > 0:
                        qty = max(self.market.min_lot(), (position // 2) // self.market.min_lot() * self.market.min_lot())
                    else:
                        qty = position
                    revenue = qty * current_price
                    commission = revenue * self.commission_rate
                    net_revenue = revenue - commission
                    buy_cost = sum([t["amount"] for t in trades if t["action"] == "buy"]) * (qty/position if position>0 else 1)
                    pnl = net_revenue - buy_cost
                    current_capital += net_revenue
                    position -= qty
                    trades.append({
                        "timestamp": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                        "action": "sell",
                        "price": round(current_price, 2),
                        "quantity": qty,
                        "amount": round(net_revenue, 2),
                        "pnl": round(pnl, 2),
                        "note": "止损"
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
                     initial_capital: float = 100000.0, position_management: str = "full",
                     debug: bool = False) -> Dict[str, Any]:
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
    # 根据标的类型设置市场模型（非6位数字视为期货）
    try:
        if not str(symbol).isdigit() or len(str(symbol)) != 6:
            engine.market = FuturesMarketModel(commission_rate=engine.commission_rate)
        else:
            engine.market = StockMarketModel(commission_rate=engine.commission_rate)
    except Exception:
        pass
    
    # 加载数据并过滤时间范围
    data = load_stock_data(symbol, timeframe)
    
    # 过滤时间范围（严格使用前端选择的区间；若无数据则直接报错）
    if start_date and end_date:
        start_dt = pd.to_datetime(start_date)
        end_dt = pd.to_datetime(end_date)
        logger.info(f"原始数据量: {len(data)} 条记录")
        logger.info(f"过滤时间范围: {start_dt} 至 {end_dt}")
        data = data[(data['timestamp'] >= start_dt) & (data['timestamp'] <= end_dt)]
        logger.info(f"过滤后数据量: {len(data)} 条记录")
        if len(data) == 0:
            raise ValueError("过滤后数据量不足，至少需要10条记录")
    
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
    
    # 可选调试信息（合并而非覆盖，以保留各策略统计）
    if debug:
        try:
            dbg = result.setdefault("debug", {})
            dbg["data"] = {
                "rows": int(len(data)),
                "start": data['timestamp'].min().strftime('%Y-%m-%d %H:%M:%S') if len(data) else None,
                "end": data['timestamp'].max().strftime('%Y-%m-%d %H:%M:%S') if len(data) else None,
            }
        except Exception:
            pass
    return result
