"""
股票数据加载模块
支持从CSV文件加载股票历史数据，为回测引擎提供真实数据
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import os
import sys
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class StockDataLoader:
    """股票数据加载器"""
    
    def __init__(self, data_dir: Optional[str] = None):
        """
        初始化数据加载器
        
        Args:
            data_dir: 数据文件目录
        """
        if data_dir is None:
            # 根据操作系统选择默认数据目录
            if sys.platform.startswith("win"):
                preferred_dir = r"F:\apps\testback\data"
            elif sys.platform == "darwin":
                preferred_dir = "/Users/ranka/projects/testback/data"
            else:
                preferred_dir = None

            # 项目根目录下的 data 作为兜底
            project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
            fallback_dir = os.path.join(project_root, "data")

            self.data_dir = preferred_dir if preferred_dir and os.path.isdir(preferred_dir) else fallback_dir
        else:
            self.data_dir = data_dir
        self.cache = {}  # 数据缓存
        
    def load_stock_data(self, symbol: str, timeframe: str = "5m") -> pd.DataFrame:
        """
        加载股票数据
        
        Args:
            symbol: 股票代码，如 "002130"
            timeframe: 时间周期，如 "5m", "1d" 等
            
        Returns:
            DataFrame: 包含OHLCV数据的DataFrame
        """
        # 构建文件路径
        filename = f"{symbol}.csv"
        filepath = os.path.join(self.data_dir, filename)
        
        # 检查缓存
        cache_key = f"{symbol}_{timeframe}"
        if cache_key in self.cache:
            logger.info(f"从缓存加载数据: {symbol}")
            return self.cache[cache_key]
        
        # 扫描候选路径（支持期货 data/features）
        candidates = []
        # 股票目录
        if os.path.isdir(self.data_dir):
            for f in os.listdir(self.data_dir):
                if f.lower().endswith('.csv') and symbol in f:
                    candidates.append(os.path.join(self.data_dir, f))
        # 期货目录
        futures_dir = os.path.join(self.data_dir, 'features')
        if os.path.isdir(futures_dir):
            for f in os.listdir(futures_dir):
                if f.lower().endswith('.csv') and symbol in f:
                    candidates.append(os.path.join(futures_dir, f))
        
        if candidates:
            # 优先选择 features 目录中的文件
            candidates.sort(key=lambda p: (0 if os.path.dirname(p).endswith('features') else 1, len(os.path.basename(p))))
            filepath = candidates[0]
            logger.info(f"找到匹配文件: {os.path.basename(filepath)}")
        else:
            # 仍按旧逻辑兜底
            if not os.path.exists(filepath):
                csv_files = [f for f in os.listdir(self.data_dir) if f.endswith('.csv')]
                matching_files = [f for f in csv_files if symbol in f]
                if matching_files:
                    filepath = os.path.join(self.data_dir, matching_files[0])
                    logger.info(f"找到匹配文件: {matching_files[0]}")
                else:
                    raise FileNotFoundError(f"未找到股票 {symbol} 的数据文件")
        
        try:
            # 读取CSV文件
            logger.info(f"正在加载数据文件: {filepath}")
            df = pd.read_csv(filepath)
            
            # 数据预处理
            df = self._preprocess_data(df)
            
            # 根据时间周期过滤数据（若基础为分钟线，可聚合为更大周期）
            df = self._filter_by_timeframe(df, timeframe)
            
            # 缓存数据
            self.cache[cache_key] = df
            
            logger.info(f"成功加载 {len(df)} 条数据记录")
            return df
            
        except Exception as e:
            logger.error(f"加载数据失败: {str(e)}")
            raise
    
    def _preprocess_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        数据预处理
        
        Args:
            df: 原始DataFrame
            
        Returns:
            DataFrame: 预处理后的DataFrame
        """
        # 重命名列名（统一格式）
        column_mapping = {
            'timestamps': 'timestamp',
            'open': 'open',
            'high': 'high', 
            'low': 'low',
            'close': 'close',
            'volume': 'volume',
            'amount': 'amount'
        }
        
        # 重命名列
        df = df.rename(columns=column_mapping)
        
        # 确保时间列存在
        if 'timestamp' not in df.columns:
            raise ValueError("数据文件必须包含 'timestamp' 列")
        
        # 转换时间格式
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        # 确保数值列为float类型
        numeric_columns = ['open', 'high', 'low', 'close', 'volume', 'amount']
        for col in numeric_columns:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # 删除包含NaN的行
        df = df.dropna()
        
        # 按时间排序
        df = df.sort_values('timestamp').reset_index(drop=True)
        
        # 验证数据完整性
        self._validate_data(df)
        
        return df
    
    def _validate_data(self, df: pd.DataFrame) -> None:
        """
        验证数据完整性
        
        Args:
            df: DataFrame
        """
        required_columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            raise ValueError(f"缺少必要的列: {missing_columns}")
        
        # 检查价格数据的合理性
        if (df['high'] < df['low']).any():
            raise ValueError("存在 high < low 的数据")
        
        if (df['close'] > df['high']).any() or (df['close'] < df['low']).any():
            raise ValueError("存在 close 超出 [low, high] 范围的数据")
        
        if (df['open'] > df['high']).any() or (df['open'] < df['low']).any():
            raise ValueError("存在 open 超出 [low, high] 范围的数据")
        
        # 检查成交量
        if (df['volume'] < 0).any():
            raise ValueError("存在负成交量数据")
        
        logger.info("数据验证通过")
    
    def _filter_by_timeframe(self, df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
        """
        根据时间周期过滤数据
        
        Args:
            df: DataFrame
            timeframe: 时间周期
            
        Returns:
            DataFrame: 过滤后的DataFrame
        """
        # 对常见周期统一基于聚合，确保1w/1d等周期正确处理
        # 若原始数据为5m，则"5m"无需重采样，直接返回
        if timeframe == "5m":
            return df

        # 日线与周线采用“组内最后一根K线的时间戳”，避免边界偏移
        if timeframe in ("1d", "1w"):
            dfx = df.copy().sort_values('timestamp')
            if timeframe == "1d":
                grp_key = dfx['timestamp'].dt.date
            else:
                # 使用以周五收盘为周期的分组
                grp_key = dfx['timestamp'].dt.to_period('W-FRI')

            def _agg(group):
                out = {
                    'timestamp': group['timestamp'].max(),
                    'open': group['open'].iloc[0],
                    'high': group['high'].max(),
                    'low': group['low'].min(),
                    'close': group['close'].iloc[-1],
                    'volume': group['volume'].sum(),
                }
                if 'amount' in group.columns:
                    out['amount'] = group['amount'].sum()
                return pd.Series(out)

            agg_df = dfx.groupby(grp_key, as_index=False).apply(_agg)
            # 丢弃OHLC为NaN的行，避免amount缺失导致删除
            agg_df = agg_df.dropna(subset=['open', 'high', 'low', 'close'])
            # 确保类型正确
            for col in ['open', 'high', 'low', 'close', 'volume']:
                agg_df[col] = pd.to_numeric(agg_df[col], errors='coerce')
            if 'amount' in agg_df.columns:
                agg_df['amount'] = pd.to_numeric(agg_df['amount'], errors='coerce')
            agg_df = agg_df.sort_values('timestamp').reset_index(drop=True)
            return agg_df

        # 小时与4小时采用floor分组并取组内最后一根K线时间戳（与旧逻辑一致）
        if timeframe in ("1h", "4h"):
            dfx = df.copy().sort_values('timestamp')
            freq = 'H' if timeframe == '1h' else '4H'
            dfx['grp'] = dfx['timestamp'].dt.floor(freq)

            def _agg_h(group):
                out = {
                    'timestamp': group['timestamp'].max(),
                    'open': group['open'].iloc[0],
                    'high': group['high'].max(),
                    'low': group['low'].min(),
                    'close': group['close'].iloc[-1],
                    'volume': group['volume'].sum(),
                }
                if 'amount' in group.columns:
                    out['amount'] = group['amount'].sum()
                return pd.Series(out)

            agg_df = dfx.groupby('grp', as_index=False).apply(_agg_h)
            agg_df = agg_df.dropna(subset=['open', 'high', 'low', 'close'])
            for col in ['open', 'high', 'low', 'close', 'volume']:
                agg_df[col] = pd.to_numeric(agg_df[col], errors='coerce')
            if 'amount' in agg_df.columns:
                agg_df['amount'] = pd.to_numeric(agg_df['amount'], errors='coerce')
            agg_df = agg_df.sort_values('timestamp').reset_index(drop=True)
            return agg_df

        # 其它周期采用resample
        rule_map = {
            "1m": "T",
            "5m": "5T",
            "15m": "15T",
            "30m": "30T",
            "1h": "H",
            "4h": "4H",
            "1d": "D",
            "1w": "W-FRI",
            "1M": "M",
        }

        rule = rule_map.get(timeframe)
        if not rule:
            # 未知周期，保持原样
            return df

        df_res = df.copy().sort_values('timestamp').set_index('timestamp')
        agg_dict = {
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }
        if 'amount' in df_res.columns:
            agg_dict['amount'] = 'sum'

        out = df_res.resample(rule, label='right', closed='right').agg(agg_dict)
        out = out.dropna(subset=['open', 'high', 'low', 'close']).reset_index()
        return out
    
    def get_data_info(self, symbol: str) -> Dict[str, Any]:
        """
        获取数据信息
        
        Args:
            symbol: 股票代码
            
        Returns:
            Dict: 数据信息
        """
        df = self.load_stock_data(symbol)
        
        return {
            "symbol": symbol,
            "total_records": len(df),
            "start_date": df['timestamp'].min().strftime('%Y-%m-%d %H:%M:%S'),
            "end_date": df['timestamp'].max().strftime('%Y-%m-%d %H:%M:%S'),
            "price_range": {
                "min": float(df['low'].min()),
                "max": float(df['high'].max()),
                "current": float(df['close'].iloc[-1])
            },
            "volume_info": {
                "total_volume": int(df['volume'].sum()),
                "avg_volume": float(df['volume'].mean()),
                "max_volume": int(df['volume'].max())
            }
        }
    
    def clear_cache(self):
        """清空缓存"""
        self.cache.clear()
        logger.info("数据缓存已清空")

    def list_symbols(self) -> List[Dict[str, Any]]:
        """
        列出 data 目录及 data/features 下的可用CSV数据源
        Returns: [{ symbol, filename, name, kind, path }]
        """
        entries: List[Dict[str, Any]] = []
        try:
            stock_dir = self.data_dir
            futures_dir = os.path.join(self.data_dir, 'features')

            all_files: List[str] = []
            if os.path.isdir(stock_dir):
                all_files.extend([os.path.join(stock_dir, f) for f in os.listdir(stock_dir) if f.lower().endswith('.csv')])
            if os.path.isdir(futures_dir):
                all_files.extend([os.path.join(futures_dir, f) for f in os.listdir(futures_dir) if f.lower().endswith('.csv')])

            for fullpath in all_files:
                f = os.path.basename(fullpath)
                if not f.lower().endswith('.csv'):
                    continue
                symbol = None
                name = os.path.splitext(f)[0]
                kind = 'futures' if os.path.dirname(fullpath).endswith('features') else 'stock'
                base = os.path.splitext(f)[0]

                if '-' in base:
                    # 股票命名：中文名-代码
                    parts = base.split('-')
                    symbol = parts[-1]
                    name = '-'.join(parts[:-1]) or symbol
                else:
                    # 期货命名：合约_中文名 或 仅合约
                    if '_' in base:
                        parts = base.split('_')
                        symbol = parts[0]
                        name = parts[1] if len(parts) > 1 else parts[0]
                    else:
                        symbol = base
                        name = base

                entries.append({
                    'symbol': symbol,
                    'filename': f,
                    'name': name,
                    'kind': kind,
                    'path': fullpath
                })
        except Exception as e:
            logger.error(f"列出数据源失败: {e}")
        return entries

# 全局数据加载器实例
data_loader = StockDataLoader()

def load_stock_data(symbol: str, timeframe: str = "5m") -> pd.DataFrame:
    """
    便捷函数：加载股票数据
    
    Args:
        symbol: 股票代码
        timeframe: 时间周期
        
    Returns:
        DataFrame: 股票数据
    """
    return data_loader.load_stock_data(symbol, timeframe)

def get_data_info(symbol: str) -> Dict[str, Any]:
    """
    便捷函数：获取数据信息
    
    Args:
        symbol: 股票代码
        
    Returns:
        Dict: 数据信息
    """
    return data_loader.get_data_info(symbol)
