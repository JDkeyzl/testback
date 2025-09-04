import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
import random

from ..models.strategy import (
    StrategyDefinition, BacktestResult, BacktestMetrics, 
    EquityCurve, TradeRecord, Node, Edge
)

class BacktestEngine:
    def __init__(self, strategy: StrategyDefinition):
        self.strategy = strategy
        self.initial_capital = strategy.initial_capital
        self.commission_rate = strategy.commission_rate
        self.current_capital = strategy.initial_capital
        self.position = 0  # 当前持仓
        self.trades = []
        self.equity_curve = []
        
    def generate_mock_data(self) -> pd.DataFrame:
        """生成模拟股票数据"""
        start_date = datetime.strptime(self.strategy.start_date, '%Y-%m-%d')
        end_date = datetime.strptime(self.strategy.end_date, '%Y-%m-%d')
        
        # 生成日期序列
        date_range = pd.date_range(start=start_date, end=end_date, freq='D')
        
        # 生成模拟价格数据（随机游走）
        np.random.seed(42)  # 固定种子确保结果可重现
        n_days = len(date_range)
        
        # 初始价格
        initial_price = 100.0
        returns = np.random.normal(0.001, 0.02, n_days)  # 日收益率
        prices = [initial_price]
        
        for i in range(1, n_days):
            price = prices[-1] * (1 + returns[i])
            prices.append(max(price, 1.0))  # 价格不能为负
        
        # 生成成交量数据
        volumes = np.random.lognormal(10, 1, n_days)
        
        # 计算技术指标
        df = pd.DataFrame({
            'date': date_range,
            'close': prices,
            'volume': volumes
        })
        
        # 计算移动均线
        df['ma_20'] = df['close'].rolling(window=20).mean()
        df['ma_50'] = df['close'].rolling(window=50).mean()
        
        # 计算RSI
        df['rsi'] = self._calculate_rsi(df['close'], 14)
        
        # 计算MACD
        macd_data = self._calculate_macd(df['close'])
        df['macd'] = macd_data['macd']
        df['macd_signal'] = macd_data['signal']
        df['macd_histogram'] = macd_data['histogram']
        
        return df.dropna()
    
    def _calculate_rsi(self, prices: pd.Series, period: int = 14) -> pd.Series:
        """计算RSI指标"""
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
    
    def _calculate_macd(self, prices: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> Dict[str, pd.Series]:
        """计算MACD指标"""
        ema_fast = prices.ewm(span=fast).mean()
        ema_slow = prices.ewm(span=slow).mean()
        macd = ema_fast - ema_slow
        signal_line = macd.ewm(span=signal).mean()
        histogram = macd - signal_line
        
        return {
            'macd': macd,
            'signal': signal_line,
            'histogram': histogram
        }
    
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
        
        elif condition_type == 'macd':
            threshold = node_data.get('threshold', 0)
            operator = node_data.get('operator', '>')
            
            macd_value = market_data.get('macd', 0)
            return self._compare_values(macd_value, threshold, operator)
        
        elif condition_type == 'volume':
            threshold = node_data.get('threshold', 1000000)
            operator = node_data.get('operator', '>')
            
            volume_value = market_data.get('volume', 0)
            return self._compare_values(volume_value, threshold, operator)
        
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
    
    def evaluate_logic(self, node_data: Dict[str, Any], condition_results: List[bool]) -> bool:
        """评估逻辑节点"""
        logic_type = node_data.get('type', 'and')
        
        if logic_type == 'and':
            return all(condition_results)
        elif logic_type == 'or':
            return any(condition_results)
        elif logic_type == 'not':
            return not condition_results[0] if condition_results else False
        
        return False
    
    def execute_action(self, node_data: Dict[str, Any], current_price: float, date: str) -> bool:
        """执行动作节点"""
        action_type = node_data.get('type', 'hold')
        quantity = node_data.get('quantity', 100)
        
        if action_type == 'buy' and self.current_capital > 0:
            # 买入逻辑
            max_shares = int(self.current_capital / current_price)
            shares_to_buy = min(quantity, max_shares)
            
            if shares_to_buy > 0:
                cost = shares_to_buy * current_price
                commission = cost * self.commission_rate
                total_cost = cost + commission
                
                if total_cost <= self.current_capital:
                    self.current_capital -= total_cost
                    self.position += shares_to_buy
                    
                    trade = TradeRecord(
                        date=date,
                        action='buy',
                        price=current_price,
                        quantity=shares_to_buy,
                        amount=total_cost,
                        pnl=None
                    )
                    self.trades.append(trade)
                    return True
        
        elif action_type == 'sell' and self.position > 0:
            # 卖出逻辑
            shares_to_sell = min(quantity, self.position)
            
            if shares_to_sell > 0:
                revenue = shares_to_sell * current_price
                commission = revenue * self.commission_rate
                net_revenue = revenue - commission
                
                self.current_capital += net_revenue
                self.position -= shares_to_sell
                
                trade = TradeRecord(
                    date=date,
                    action='sell',
                    price=current_price,
                    quantity=shares_to_sell,
                    amount=net_revenue,
                    pnl=None
                )
                self.trades.append(trade)
                return True
        
        return False
    
    def run_backtest(self) -> BacktestResult:
        """运行回测"""
        # 生成模拟数据
        market_data = self.generate_mock_data()
        
        # 构建节点映射
        nodes_map = {node.id: node for node in self.strategy.nodes}
        edges_map = {edge.target: edge for edge in self.strategy.edges}
        
        # 找到起始节点（没有输入边的节点）
        start_nodes = []
        for node in self.strategy.nodes:
            if node.id not in edges_map:
                start_nodes.append(node)
        
        # 逐日回测
        for idx, row in market_data.iterrows():
            date = row['date'].strftime('%Y-%m-%d')
            current_price = row['close']
            
            # 评估所有条件节点
            condition_results = {}
            for node in self.strategy.nodes:
                if node.type == 'condition':
                    result = self.evaluate_condition(node.data, row)
                    condition_results[node.id] = result
            
            # 评估逻辑节点
            logic_results = {}
            for node in self.strategy.nodes:
                if node.type == 'logic':
                    # 找到输入到这个逻辑节点的条件
                    input_conditions = []
                    for edge in self.strategy.edges:
                        if edge.target == node.id:
                            input_conditions.append(condition_results.get(edge.source, False))
                    
                    result = self.evaluate_logic(node.data, input_conditions)
                    logic_results[node.id] = result
            
            # 执行动作节点
            for node in self.strategy.nodes:
                if node.type == 'action':
                    # 检查是否有逻辑节点连接到这个动作节点
                    should_execute = True
                    for edge in self.strategy.edges:
                        if edge.target == node.id:
                            source_result = logic_results.get(edge.source, False)
                            should_execute = should_execute and source_result
                    
                    if should_execute:
                        self.execute_action(node.data, current_price, date)
            
            # 记录资金曲线
            current_equity = self.current_capital + (self.position * current_price)
            daily_return = (current_equity - self.initial_capital) / self.initial_capital if idx == 0 else 0
            
            if idx > 0:
                prev_equity = self.equity_curve[-1].equity
                daily_return = (current_equity - prev_equity) / prev_equity
            
            equity_point = EquityCurve(
                date=date,
                equity=current_equity,
                returns=daily_return
            )
            self.equity_curve.append(equity_point)
        
        # 计算最终指标
        metrics = self._calculate_metrics()
        
        return BacktestResult(
            metrics=metrics,
            equity_curve=self.equity_curve,
            trades=self.trades,
            final_equity=self.current_capital + (self.position * market_data['close'].iloc[-1])
        )
    
    def _calculate_metrics(self) -> BacktestMetrics:
        """计算回测指标"""
        if not self.equity_curve:
            return BacktestMetrics(
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
        
        return BacktestMetrics(
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
