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
            # 优先使用项目根目录下的 data 目录（跨平台兼容）
            # 计算项目根目录：从 backend/app/data_loader.py 向上两级到项目根
            current_file = os.path.abspath(__file__)
            # backend/app/data_loader.py -> backend/app -> backend -> 项目根
            backend_dir = os.path.dirname(os.path.dirname(current_file))
            project_root = os.path.dirname(backend_dir) if os.path.basename(backend_dir) == 'backend' else os.path.dirname(current_file)
            fallback_dir = os.path.join(project_root, "data")
            
            # 可选：根据操作系统使用特定路径（如果存在）
            preferred_dir = None
            if sys.platform.startswith("win"):
                # Windows: 尝试使用环境变量或默认路径
                win_path = os.environ.get('TESTBACK_DATA_DIR') or r"F:\apps\testback\data"
                if os.path.isdir(win_path):
                    preferred_dir = win_path
            elif sys.platform == "darwin":
                # macOS: 尝试使用环境变量或默认路径
                mac_path = os.environ.get('TESTBACK_DATA_DIR') or "/Users/ranka/projects/testback/data"
                if os.path.isdir(mac_path):
                    preferred_dir = mac_path

            # 优先使用 preferred_dir（如果存在且有效），否则使用项目根目录下的 data
            self.data_dir = preferred_dir if preferred_dir and os.path.isdir(preferred_dir) else fallback_dir
        else:
            self.data_dir = data_dir
        self.cache = {}  # 数据缓存
        
    def load_stock_data(self, symbol: str, timeframe: str = "5m", end_date: Optional[str] = None) -> pd.DataFrame:
        """
        加载股票数据
        
        Args:
            symbol: 股票代码，如 "002130"
            timeframe: 时间周期，如 "5m", "1d" 等
            end_date: 截止日期（格式：YYYY-MM-DD），只使用该日期及之前的数据，None表示不过滤
            
        Returns:
            DataFrame: 包含OHLCV数据的DataFrame
        """
        # 构建文件路径
        filename = f"{symbol}.csv"
        filepath = os.path.join(self.data_dir, filename)
        
        # 检查缓存（包含end_date的缓存键）
        cache_key = f"{symbol}_{timeframe}_{end_date or 'all'}"
        if cache_key in self.cache:
            logger.info(f"从缓存加载数据: {symbol}")
            return self.cache[cache_key]
        
        # 扫描候选路径（支持期货 data/features 与批量日K data/stocks）
        candidates = []
        # 股票目录（根目录）
        if os.path.isdir(self.data_dir):
            for f in os.listdir(self.data_dir):
                if f.lower().endswith('.csv') and symbol in f:
                    candidates.append(os.path.join(self.data_dir, f))
        # 批量日K目录（所有文件直接在 stocks/ 目录下）
        stocks_dir = os.path.join(self.data_dir, 'stocks')
        if os.path.isdir(stocks_dir):
            # 只检查 stocks 目录下的直接文件
            for f in os.listdir(stocks_dir):
                if f.lower().endswith('.csv') and symbol in f:
                    candidates.append(os.path.join(stocks_dir, f))
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
            
            # 在聚合前过滤截止日期（重要：必须在聚合前过滤，避免使用未来数据）
            if end_date:
                try:
                    end_dt = pd.to_datetime(end_date).normalize()  # 转换为日期，时间设为00:00:00
                    # 只保留截止日期及之前的数据（timestamp的日期部分 <= end_date）
                    df = df[df['timestamp'].dt.date <= end_dt.date()].copy()
                    logger.info(f"已过滤截止日期 {end_date}，剩余 {len(df)} 条数据")
                except Exception as e:
                    logger.warning(f"截止日期过滤失败: {e}，使用全部数据")
            
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
        列出 data 目录、data/stocks 及 data/features 下的可用CSV数据源
        Returns: [{ symbol, filename, name, kind, path }]
        """
        entries: List[Dict[str, Any]] = []
        try:
            stock_dir = self.data_dir
            stocks_subdir = os.path.join(self.data_dir, 'stocks')
            futures_dir = os.path.join(self.data_dir, 'features')

            all_files: List[str] = []
            if os.path.isdir(stock_dir):
                all_files.extend([os.path.join(stock_dir, f) for f in os.listdir(stock_dir) if f.lower().endswith('.csv')])
            if os.path.isdir(stocks_subdir):
                # 只检查 stocks 目录下的直接文件（不再使用子目录）
                all_files.extend([os.path.join(stocks_subdir, f) for f in os.listdir(stocks_subdir) if f.lower().endswith('.csv')])
            if os.path.isdir(futures_dir):
                all_files.extend([os.path.join(futures_dir, f) for f in os.listdir(futures_dir) if f.lower().endswith('.csv')])

            for fullpath in all_files:
                f = os.path.basename(fullpath)
                if not f.lower().endswith('.csv'):
                    continue
                symbol = None
                name = os.path.splitext(f)[0]
                dir_name = os.path.basename(os.path.dirname(fullpath))
                kind = 'futures' if dir_name == 'features' else 'stock'
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

def load_stock_data(symbol: str, timeframe: str = "5m", end_date: Optional[str] = None) -> pd.DataFrame:
    """
    便捷函数：加载股票数据
    
    Args:
        symbol: 股票代码
        timeframe: 时间周期
        end_date: 截止日期（格式：YYYY-MM-DD），只使用该日期及之前的数据，None表示不过滤
        
    Returns:
        DataFrame: 股票数据
    """
    return data_loader.load_stock_data(symbol, timeframe, end_date)

def get_data_info(symbol: str) -> Dict[str, Any]:
    """
    便捷函数：获取数据信息
    
    Args:
        symbol: 股票代码
        
    Returns:
        Dict: 数据信息
    """
    return data_loader.get_data_info(symbol)
