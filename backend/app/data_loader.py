"""
股票数据加载模块
支持从CSV文件加载股票历史数据，为回测引擎提供真实数据
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import os
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class StockDataLoader:
    """股票数据加载器"""
    
    def __init__(self, data_dir: str = "data"):
        """
        初始化数据加载器
        
        Args:
            data_dir: 数据文件目录
        """
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
        
        # 检查文件是否存在
        if not os.path.exists(filepath):
            # 尝试查找包含股票名称的文件
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
            
            # 根据时间周期过滤数据
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
        if timeframe == "5m":
            # 5分钟数据，保持原样
            return df
        elif timeframe == "1d":
            # 日线数据，取每日最后一条记录
            df['date'] = df['timestamp'].dt.date
            daily_data = df.groupby('date').last().reset_index()
            return daily_data.drop('date', axis=1)
        elif timeframe == "1h":
            # 小时数据，取每小时最后一条记录
            df['hour'] = df['timestamp'].dt.floor('H')
            hourly_data = df.groupby('hour').last().reset_index()
            return hourly_data.drop('hour', axis=1)
        else:
            # 其他周期，保持原样
            return df
    
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
