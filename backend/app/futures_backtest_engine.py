"""
期货保证金回测引擎（独立于股票引擎）
账户采用权益口径：equity = cash + unrealized_pnl
下单单位为合约张数（contracts），采用合约乘数 multiplier 与保证金制度
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from pathlib import Path
import json
import math
import numpy as np
import pandas as pd

from .data_loader import load_stock_data


@dataclass
class ContractSpec:
    symbol: str
    multiplier: float = 10.0
    tick_size: float = 1.0
    fee_per_contract: float = 2.0  # 单边费用
    initial_margin_rate: float = 0.14
    maintenance_margin_rate: float = 0.14


def _round_to_tick(price: float, tick: float) -> float:
    if tick <= 0:
        return float(price)
    return round(round(price / tick) * tick, 6)


def load_contract_spec(symbol: str) -> ContractSpec:
    """从 data/features/contract_specs.json 加载合约规格，找不到则返回安全默认"""
    try:
        project_root = Path(__file__).resolve().parents[3]
        spec_path = project_root / 'data' / 'features' / 'contract_specs.json'
        if spec_path.exists():
            with open(spec_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    d = data.get(symbol)
                    if isinstance(d, dict):
                        return ContractSpec(
                            symbol=symbol,
                            multiplier=float(d.get('multiplier', 10.0)),
                            tick_size=float(d.get('tick_size', 1.0)),
                            fee_per_contract=float(d.get('fee_per_contract', 2.0)),
                            initial_margin_rate=float(d.get('initial_margin_rate', 0.1)),
                            maintenance_margin_rate=float(d.get('maintenance_margin_rate', 0.08)),
                        )
        # 默认：较为保守的参数；若配置中存在 __default__ 则继承
        default = None
        try:
            if spec_path.exists():
                with open(spec_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    d = data.get('__default__') if isinstance(data, dict) else None
                    if isinstance(d, dict):
                        default = ContractSpec(
                            symbol=symbol,
                            multiplier=float(d.get('multiplier', 10.0)),
                            tick_size=float(d.get('tick_size', 1.0)),
                            fee_per_contract=float(d.get('fee_per_contract', 2.0)),
                            initial_margin_rate=float(d.get('initial_margin_rate', 0.14)),
                            maintenance_margin_rate=float(d.get('maintenance_margin_rate', 0.14)),
                        )
        except Exception:
            default = None
        return default or ContractSpec(symbol=symbol)
    except Exception:
        return ContractSpec(symbol=symbol)


class FuturesBacktestEngine:
    """简化期货保证金回测引擎（长多开平，不含做空/持仓方向切换）"""

    def __init__(self, initial_capital: float = 100000.0, spec: Optional[ContractSpec] = None):
        self.initial_capital = float(initial_capital)
        self.spec = spec or ContractSpec(symbol='unknown')

    def _safe_num(self, x: Any) -> float:
        try:
            v = float(x)
            if not np.isfinite(v):
                return 0.0
            return v
        except Exception:
            return 0.0

    def calculate_max_open_contracts(self, equity: float, price: float) -> int:
        # 可开张数 ≈ equity / (price * multiplier * initial_margin_rate)
        denom = max(price * self.spec.multiplier * self.spec.initial_margin_rate, 1e-9)
        return max(0, int(equity // denom))

    def _append_equity(self, equity_curve: List[Dict[str, Any]], ts: pd.Timestamp, equity: float, price: float, prev_equity: Optional[float]) -> None:
        ret = 0.0
        if prev_equity and prev_equity > 0:
            ret = (equity - prev_equity) / prev_equity
        equity_curve.append({
            'timestamp': ts.strftime('%Y-%m-%d %H:%M:%S'),
            'equity': round(self._safe_num(equity), 2),
            'returns': round(self._safe_num(ret), 4),
            'price': round(self._safe_num(price), 2)
        })

    def _build_price_series(self, data: pd.DataFrame) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for _, row in data.iterrows():
            out.append({
                'timestamp': row['timestamp'].strftime('%Y-%m-%d %H:%M:%S'),
                'open': round(self._safe_num(row.get('open', row['close'])), 2),
                'high': round(self._safe_num(row.get('high', row['close'])), 2),
                'low': round(self._safe_num(row.get('low', row['close'])), 2),
                'close': round(self._safe_num(row['close']), 2),
            })
        return out

    def _max_drawdown(self, equity_curve: List[Dict[str, Any]]) -> float:
        if not equity_curve:
            return 0.0
        peak = equity_curve[0]['equity']
        mdd = 0.0
        for p in equity_curve:
            eq = p['equity']
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak if peak > 0 else 0.0
            if dd > mdd:
                mdd = dd
        return round(self._safe_num(mdd), 4)

    def run(self, data: pd.DataFrame, strategy: Dict[str, Any], debug: bool = False) -> Dict[str, Any]:
        equity = self.initial_capital
        cash = self.initial_capital
        position = 0  # 持仓张数（仅做多）
        entry_price = 0.0
        entry_fee_total = 0.0
        prev_close = None
        trades: List[Dict[str, Any]] = []
        equity_curve: List[Dict[str, Any]] = []
        stats: Dict[str, Any] = {
            'indicator': {},
            'signals': {'buy': 0, 'sell': 0},
            'orders': {'buy_attempts': 0, 'buys': 0, 'sell_attempts': 0, 'sells': 0},
            'rejections': {'no_capacity': 0, 'forced_liquidations': 0},
            'capacity': {'max_open_samples': [], 'avg_max_open': 0.0},
            'fees_total': 0.0,
        }

        nodes = strategy.get('nodes', [])
        first = nodes[0] if nodes else None
        sub_type = (first or {}).get('data', {}).get('subType') or (first or {}).get('data', {}).get('type') or 'ma'

        # 指标准备（使用与股票一致的轻量指标，条件触发仅用于示意）
        if sub_type == 'rsi':
            period = int((first or {}).get('data', {}).get('period', 14))
            s = data['close']
            delta = s.diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
            rs = gain / loss
            data = data.copy()
            data['rsi'] = 100 - (100 / (1 + rs))
            threshold = float((first or {}).get('data', {}).get('threshold', 30))
            operator = str((first or {}).get('data', {}).get('operator', '<'))
            if debug:
                stats['indicator'] = {
                    'type': 'rsi',
                    'period': period,
                    'notna': int(data['rsi'].notna().sum()),
                    'threshold': threshold,
                    'operator': operator,
                }
        else:
            # 简单双均线
            period = int((first or {}).get('data', {}).get('period', 20))
            short_p = min(10, period)
            data = data.copy()
            data['ma_s'] = data['close'].rolling(window=short_p).mean()
            data['ma_l'] = data['close'].rolling(window=period).mean()
            if debug:
                stats['indicator'] = {
                    'type': 'ma',
                    'short': short_p,
                    'long': period,
                    'na_s': int(data['ma_s'].isna().sum()),
                    'na_l': int(data['ma_l'].isna().sum()),
                }

        for i in range(max(20, 14), len(data)):
            row = data.iloc[i]
            ts = row['timestamp']
            px = _round_to_tick(float(row['close']), self.spec.tick_size)

            # 逐bar结算未实现盈亏
            if prev_close is not None and position != 0:
                d_pnl = (px - prev_close) * self.spec.multiplier * position
                equity += d_pnl
                cash += d_pnl  # 变动保证金制度：逐日盯市，盈亏入金/出金

            prev_equity = equity_curve[-1]['equity'] if equity_curve else None

            # 简化的触发：
            buy_signal = False
            sell_signal = False
            if sub_type == 'rsi':
                rsi_v = row.get('rsi')
                if pd.notna(rsi_v):
                    if operator in ('<','below'):
                        buy_signal = (position == 0 and rsi_v < threshold)
                    elif operator in ('>','above'):
                        buy_signal = (position == 0 and rsi_v > threshold)
                    # 平仓：反向条件
                    if position > 0:
                        if operator in ('<','below'):
                            sell_signal = rsi_v >= threshold
                        else:
                            sell_signal = rsi_v <= threshold
            else:
                ma_s = row.get('ma_s')
                ma_l = row.get('ma_l')
                if pd.notna(ma_s) and pd.notna(ma_l):
                    # 上穿买入，下穿卖出
                    prev = data.iloc[i-1]
                    prev_s, prev_l = prev.get('ma_s'), prev.get('ma_l')
                    if pd.notna(prev_s) and pd.notna(prev_l):
                        buy_signal = (position == 0 and ma_s > ma_l and prev_s <= prev_l)
                        sell_signal = (position > 0 and ma_s < ma_l and prev_s >= prev_l)

            traded_this_bar = False

            # 强平检查（维持保证金）
            if position > 0:
                used_margin = position * px * self.spec.multiplier * self.spec.initial_margin_rate
                maint_req = position * px * self.spec.multiplier * self.spec.maintenance_margin_rate
                if equity < maint_req:
                    # 全部平仓
                    fee = self.spec.fee_per_contract * position
                    cash -= fee
                    stats['fees_total'] += float(fee)
                    # 实现强平净盈亏（计入开仓与平仓费用）
                    pnl_gross = (px - entry_price) * self.spec.multiplier * position
                    pnl_net = pnl_gross - entry_fee_total - fee
                    trades.append({
                        'timestamp': ts.strftime('%Y-%m-%d %H:%M:%S'),
                        'action': 'sell',
                        'price': round(px, 2),
                        'quantity': int(position),
                        'amount': round(fee, 2),  # 期货amount记载费用更合理（本字段不代表现金流）
                        'pnl': round(pnl_net, 2)
                    })
                    position = 0
                    entry_fee_total = 0.0
                    if debug:
                        stats['rejections']['forced_liquidations'] += 1
                    traded_this_bar = True
            
            # 买入（开多）
            if (not traded_this_bar) and buy_signal and position == 0:
                max_open = self.calculate_max_open_contracts(equity, px)
                if debug:
                    stats['signals']['buy'] += 1
                    stats['orders']['buy_attempts'] += 1
                    stats['capacity']['max_open_samples'].append(int(max_open))
                qty = max(1, max_open)
                if qty > 0:
                    fee = self.spec.fee_per_contract * qty
                    cash -= fee
                    stats['fees_total'] += float(fee)
                    position += qty
                    entry_price = px
                    entry_fee_total = float(fee)
                    trades.append({
                        'timestamp': ts.strftime('%Y-%m-%d %H:%M:%S'),
                        'action': 'buy',
                        'price': round(px, 2),
                        'quantity': int(qty),
                        'amount': round(fee, 2),
                        'pnl': None
                    })
                    if debug:
                        stats['orders']['buys'] += 1
                    traded_this_bar = True
                else:
                    if debug:
                        stats['rejections']['no_capacity'] += 1

            # 卖出（平多）
            elif (not traded_this_bar) and sell_signal and position > 0:
                if debug:
                    stats['signals']['sell'] += 1
                    stats['orders']['sell_attempts'] += 1
                fee = self.spec.fee_per_contract * position
                cash -= fee
                stats['fees_total'] += float(fee)
                pnl_gross = (px - entry_price) * self.spec.multiplier * position
                pnl_net = pnl_gross - entry_fee_total - fee
                trades.append({
                    'timestamp': ts.strftime('%Y-%m-%d %H:%M:%S'),
                    'action': 'sell',
                    'price': round(px, 2),
                    'quantity': int(position),
                    'amount': round(fee, 2),
                    'pnl': round(pnl_net, 2)
                })
                position = 0
                entry_fee_total = 0.0
                if debug:
                    stats['orders']['sells'] += 1
                traded_this_bar = True

            # 记录权益曲线
            self._append_equity(equity_curve, ts, equity, px, prev_equity)
            prev_close = px

        # 结束时强制平仓（若有持仓），仅计费用
        if position > 0 and len(data) > 0:
            px = _round_to_tick(float(data['close'].iloc[-1]), self.spec.tick_size)
            fee = self.spec.fee_per_contract * position
            cash -= fee
            stats['fees_total'] += float(fee)
            pnl_gross = (px - entry_price) * self.spec.multiplier * position
            pnl_net = pnl_gross - entry_fee_total - fee
            trades.append({
                'timestamp': data['timestamp'].iloc[-1].strftime('%Y-%m-%d %H:%M:%S'),
                'action': 'sell',
                'price': round(px, 2),
                'quantity': int(position),
                'amount': round(fee, 2),
                'pnl': round(pnl_net, 2)
            })
            position = 0
            entry_fee_total = 0.0

        # 指标
        total_return = (equity - self.initial_capital) / self.initial_capital if self.initial_capital > 0 else 0.0
        sell_trades = [t for t in trades if t['action'] == 'sell' and t.get('pnl') is not None]
        wins = [t for t in sell_trades if float(t.get('pnl', 0)) > 0]
        win_rate = (len(wins) / len(sell_trades)) if sell_trades else 0.0
        profit_loss_ratio = 0.0
        if sell_trades:
            win_vals = [float(t['pnl']) for t in wins] or [0.0]
            loss_vals = [abs(float(t['pnl'])) for t in sell_trades if float(t['pnl']) < 0] or [0.0]
            if sum(loss_vals) > 0:
                profit_loss_ratio = abs(np.mean(win_vals) / np.mean(loss_vals)) if np.mean(loss_vals) != 0 else 0.0

        # 汇总容量统计
        if debug and stats['capacity']['max_open_samples']:
            arr = stats['capacity']['max_open_samples']
            stats['capacity']['avg_max_open'] = float(round(sum(arr) / max(len(arr), 1), 2))

        result = {
            'market': 'futures',
            'initial_capital': round(self._safe_num(self.initial_capital), 2),
            'final_equity': round(self._safe_num(equity), 2),
            'total_return': round(self._safe_num(total_return), 4),
            'win_rate': round(self._safe_num(win_rate), 4),
            'profit_loss_ratio': round(self._safe_num(profit_loss_ratio), 4),
            'max_drawdown': self._max_drawdown(equity_curve),
            'total_trades': int(len(trades)),
            'trades': trades,
            'equity_curve': equity_curve,
        }
        if debug:
            result['debug'] = {
                'spec': {
                    'multiplier': self.spec.multiplier,
                    'tick_size': self.spec.tick_size,
                    'initial_margin_rate': self.spec.initial_margin_rate,
                    'maintenance_margin_rate': self.spec.maintenance_margin_rate,
                    'fee_per_contract': self.spec.fee_per_contract,
                },
                'stats': stats,
            }
        return result


def run_futures_backtest(strategy: Dict[str, Any], symbol: str, timeframe: str,
                         start_date: Optional[str], end_date: Optional[str],
                         initial_capital: float = 100000.0, debug: bool = False) -> Dict[str, Any]:
    spec = load_contract_spec(symbol)
    engine = FuturesBacktestEngine(initial_capital=initial_capital, spec=spec)
    data = load_stock_data(symbol, timeframe)
    if start_date and end_date:
        start_dt = pd.to_datetime(start_date)
        end_dt = pd.to_datetime(end_date)
        data = data[(data['timestamp'] >= start_dt) & (data['timestamp'] <= end_dt)]
    if len(data) < 10:
        raise ValueError('过滤后数据量不足，至少需要10条记录')

    res = engine.run(data, strategy, debug=debug)
    # 附加数据概览与价格序列
    res['data_info'] = {
        'symbol': symbol,
        'timeframe': timeframe,
        'total_records': int(len(data)),
        'start_date': data['timestamp'].min().strftime('%Y-%m-%d %H:%M:%S'),
        'end_date': data['timestamp'].max().strftime('%Y-%m-%d %H:%M:%S'),
        'price_range': {
            'min': float(data['low'].min()),
            'max': float(data['high'].max()),
            'current': float(data['close'].iloc[-1])
        }
    }
    # 价格序列用于前端日线聚合
    res['price_series'] = FuturesBacktestEngine()._build_price_series(data)
    return res


