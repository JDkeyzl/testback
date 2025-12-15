"""
前N名股票共同点分析服务
基于基准日（大浪淘沙开始日期的前一天）的数据进行分析
"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class CommonFeaturesAnalyzer:
    """共同特征分析器"""
    
    def __init__(self, data_loader):
        """
        初始化分析器
        
        Args:
            data_loader: 数据加载器实例
        """
        self.data_loader = data_loader
    
    def analyze(
        self,
        symbols: List[str],
        start_date: str,
        end_date: str,
        base_date: Optional[str] = None,
        lookback_days: int = 60,
        macd_fast: int = 12,
        macd_slow: int = 26,
        macd_signal: int = 9
    ) -> Dict[str, Any]:
        """
        分析股票的共同特征
        
        Args:
            symbols: 股票代码列表
            start_date: 大浪淘沙开始日期 (YYYY-MM-DD)，用于计算收益率
            end_date: 大浪淘沙结束日期 (YYYY-MM-DD)，用于计算收益率
            base_date: 基准日 (YYYY-MM-DD)，可选，默认为start_date前一天
            lookback_days: 价格位置回看天数，默认60
            macd_fast: MACD快线周期，默认12
            macd_slow: MACD慢线周期，默认26
            macd_signal: MACD信号线周期，默认9
            
        Returns:
            分析结果字典
        """
        # 计算基准日：如果未提供，则使用start_date前一天
        if base_date:
            base_date_dt = pd.to_datetime(base_date)
            base_date_str = base_date
        else:
            start_dt = pd.to_datetime(start_date)
            base_date_dt = start_dt - timedelta(days=1)
            base_date_str = base_date_dt.strftime('%Y-%m-%d')
        
        logger.info(f"开始分析 {len(symbols)} 只股票的共同特征，基准日：{base_date_str}")
        
        # 存储每只股票的指标数据
        stock_features = []
        errors = []
        
        for symbol in symbols:
            try:
                features = self._analyze_single_stock(
                    symbol,
                    base_date_dt,
                    lookback_days,
                    macd_fast,
                    macd_slow,
                    macd_signal
                )
                if features:
                    # 添加股票代码到特征中
                    features['symbol'] = symbol
                    stock_features.append(features)
            except Exception as e:
                logger.error(f"分析股票 {symbol} 失败: {str(e)}")
                errors.append({"symbol": symbol, "error": str(e)})
        
        if not stock_features:
            return {
                "ok": False,
                "error": "没有成功分析任何股票",
                "errors": errors
            }
        
        # 统计共同特征
        analysis_result = self._statistics_analysis(stock_features)
        
        # 提取共同特征总结
        summary = self._extract_common_features(analysis_result, len(stock_features))
        
        # 计算每只股票的收益率和维度信息
        stock_rankings = self._calculate_stock_rankings_with_return(
            stock_features, 
            analysis_result,
            start_date,
            end_date
        )
        
        # 统计所有维度出现的次数
        dimension_stats = self._calculate_dimension_statistics(analysis_result)
        
        return {
            "ok": True,
            "baseDate": base_date_str,
            "totalStocks": len(stock_features),
            "analysis": analysis_result,
            "summary": summary,
            "stockRankings": stock_rankings,
            "dimensionStatistics": dimension_stats,  # 维度统计
            "errors": errors[:10] if errors else []
        }
    
    def _analyze_single_stock(
        self,
        symbol: str,
        base_date: pd.Timestamp,
        lookback_days: int,
        macd_fast: int,
        macd_slow: int,
        macd_signal: int
    ) -> Optional[Dict[str, Any]]:
        """
        分析单只股票的特征
        
        Returns:
            股票特征字典，如果失败返回None
        """
        # 加载日线数据（到基准日）
        base_date_str = base_date.strftime('%Y-%m-%d')
        daily_df = self.data_loader.load_stock_data(symbol, timeframe='1d', end_date=base_date_str)
        if daily_df is None or daily_df.empty:
            return None
        
        # 确保数据按时间排序
        daily_df = daily_df.sort_values('timestamp').reset_index(drop=True)
        
        # 获取基准日的数据
        base_data = daily_df[daily_df['timestamp'] <= base_date]
        if base_data.empty:
            return None
        
        # 取基准日或最近的数据
        base_row = base_data.iloc[-1]
        base_price = float(base_row['close']) if pd.notna(base_row['close']) else None
        base_volume = float(base_row['volume']) if pd.notna(base_row['volume']) else None
        
        if base_price is None:
            return None
        
        features = {}
        
        # 1. MACD日线分析
        daily_macd = self._calculate_macd(
            daily_df['close'],
            macd_fast,
            macd_slow,
            macd_signal
        )
        if daily_macd:
            features['dailyMacd'] = {
                'dif': daily_macd.get('dif'),
                'dea': daily_macd.get('dea'),
                'hist': daily_macd.get('hist'),
                'histColor': 'red' if daily_macd.get('hist', 0) > 0 else 'green',
                'histTrend': daily_macd.get('trend'),  # 'up', 'down', 'neutral'
                'zeroAxis': 'above' if daily_macd.get('dif', 0) > 0 else ('below' if daily_macd.get('dif', 0) < 0 else 'near')
            }
        
        # 2. MACD周线分析
        weekly_df = self.data_loader.load_stock_data(symbol, timeframe='1w', end_date=base_date_str)
        if weekly_df is not None and not weekly_df.empty:
            weekly_df = weekly_df.sort_values('timestamp').reset_index(drop=True)
            weekly_data = weekly_df[weekly_df['timestamp'] <= base_date]
            if not weekly_data.empty:
                weekly_macd = self._calculate_macd(
                    weekly_data['close'],
                    macd_fast,
                    macd_slow,
                    macd_signal
                )
                if weekly_macd:
                    features['weeklyMacd'] = {
                        'dif': weekly_macd.get('dif'),
                        'dea': weekly_macd.get('dea'),
                        'hist': weekly_macd.get('hist'),
                        'histColor': 'red' if weekly_macd.get('hist', 0) > 0 else 'green',
                        'histTrend': weekly_macd.get('trend')
                    }
        
        # 3. 价格与MA均线关系
        ma_relation = self._analyze_price_ma_relation(daily_df, base_date, base_price)
        if ma_relation:
            features['priceMARelation'] = ma_relation
        
        # 4. 价格位置分析
        price_position = self._analyze_price_position(daily_df, base_date, base_price, lookback_days)
        if price_position:
            features['pricePosition'] = price_position
        
        # 5. 放量关系分析
        volume_relation = self._analyze_volume_relation(daily_df, base_date, base_volume, lookback_days)
        if volume_relation:
            features['volumeRelation'] = volume_relation
        
        # 6. 其他量价维度
        other_indicators = self._analyze_other_indicators(daily_df, base_date, base_price, base_volume)
        if other_indicators:
            features['otherIndicators'] = other_indicators
        
        return features
    
    def _calculate_macd(
        self,
        closes: pd.Series,
        fast: int,
        slow: int,
        signal: int
    ) -> Optional[Dict[str, float]]:
        """计算MACD指标"""
        try:
            closes_clean = pd.to_numeric(closes, errors='coerce').dropna()
            if len(closes_clean) < max(slow, signal) + 1:
                return None
            
            # 只取最后足够的数据计算
            tail_len = min(len(closes_clean), max(slow * 3, 100))
            closes_tail = closes_clean.iloc[-tail_len:]
            
            ema_fast = closes_tail.ewm(span=fast, adjust=False).mean()
            ema_slow = closes_tail.ewm(span=slow, adjust=False).mean()
            dif = ema_fast - ema_slow
            dea = dif.ewm(span=signal, adjust=False).mean()
            hist = dif - dea
            
            if len(hist) < 2:
                return None
            
            last_dif = float(dif.iloc[-1]) if pd.notna(dif.iloc[-1]) else None
            last_dea = float(dea.iloc[-1]) if pd.notna(dea.iloc[-1]) else None
            last_hist = float(hist.iloc[-1]) if pd.notna(hist.iloc[-1]) else None
            prev_hist = float(hist.iloc[-2]) if pd.notna(hist.iloc[-2]) else None
            
            if last_dif is None or last_dea is None or last_hist is None:
                return None
            
            # 判断趋势
            if prev_hist is not None:
                if last_hist > prev_hist:
                    trend = 'up'
                elif last_hist < prev_hist:
                    trend = 'down'
                else:
                    trend = 'neutral'
            else:
                trend = 'neutral'
            
            return {
                'dif': last_dif,
                'dea': last_dea,
                'hist': last_hist,
                'trend': trend
            }
        except Exception as e:
            logger.error(f"计算MACD失败: {str(e)}")
            return None
    
    def _analyze_price_ma_relation(
        self,
        df: pd.DataFrame,
        base_date: pd.Timestamp,
        base_price: float
    ) -> Optional[Dict[str, Any]]:
        """分析价格与MA均线关系"""
        try:
            data = df[df['timestamp'] <= base_date]
            if len(data) < 120:  # 需要足够数据计算MA120
                return None
            
            closes = pd.to_numeric(data['close'], errors='coerce').dropna()
            if len(closes) < 120:
                return None
            
            # 计算各周期MA
            ma5 = closes.rolling(window=5).mean().iloc[-1]
            ma10 = closes.rolling(window=10).mean().iloc[-1]
            ma20 = closes.rolling(window=20).mean().iloc[-1]
            ma30 = closes.rolling(window=30).mean().iloc[-1]
            ma60 = closes.rolling(window=60).mean().iloc[-1]
            ma120 = closes.rolling(window=120).mean().iloc[-1]
            
            # 价格与MA关系
            price_above_ma = {
                'MA5': base_price > ma5 if pd.notna(ma5) else False,
                'MA10': base_price > ma10 if pd.notna(ma10) else False,
                'MA20': base_price > ma20 if pd.notna(ma20) else False,
                'MA30': base_price > ma30 if pd.notna(ma30) else False,
                'MA60': base_price > ma60 if pd.notna(ma60) else False,
                'MA120': base_price > ma120 if pd.notna(ma120) else False
            }
            
            # 均线排列
            if pd.notna(ma5) and pd.notna(ma10) and pd.notna(ma20) and pd.notna(ma30):
                if ma5 > ma10 > ma20 > ma30:
                    alignment = 'bullish'  # 多头排列
                elif ma5 < ma10 < ma20 < ma30:
                    alignment = 'bearish'  # 空头排列
                else:
                    # 检查是否粘合（MA5与MA20差距<3%）
                    if abs(ma5 - ma20) / ma20 < 0.03:
                        alignment = 'neutral'  # 均线粘合
                    else:
                        alignment = 'mixed'  # 混合
            else:
                alignment = 'unknown'
            
            # 价格相对MA20的距离
            if pd.notna(ma20):
                distance = ((base_price - ma20) / ma20) * 100
                price_distance = {
                    'aboveMA20': distance if distance > 0 else None,
                    'belowMA20': abs(distance) if distance < 0 else None
                }
            else:
                price_distance = {'aboveMA20': None, 'belowMA20': None}
            
            return {
                'priceAboveMA': price_above_ma,
                'maAlignment': alignment,
                'priceDistanceFromMA': price_distance
            }
        except Exception as e:
            logger.error(f"分析价格MA关系失败: {str(e)}")
            return None
    
    def _analyze_price_position(
        self,
        df: pd.DataFrame,
        base_date: pd.Timestamp,
        base_price: float,
        lookback_days: int
    ) -> Optional[Dict[str, Any]]:
        """分析价格位置"""
        try:
            data = df[df['timestamp'] <= base_date]
            if len(data) < lookback_days:
                return None
            
            # 过去N日价格
            lookback_data = data.tail(lookback_days)
            closes = pd.to_numeric(lookback_data['close'], errors='coerce').dropna()
            
            if len(closes) == 0:
                return None
            
            min_price = closes.min()
            max_price = closes.max()
            
            if max_price <= min_price:
                return None
            
            # 计算价格位置（百分位）
            price_position = ((base_price - min_price) / (max_price - min_price)) * 100
            
            # 价格区间分类
            if price_position < 20:
                position_range = '<20'
            elif price_position < 40:
                position_range = '20-40'
            elif price_position < 60:
                position_range = '40-60'
            elif price_position < 80:
                position_range = '60-80'
            else:
                position_range = '>80'
            
            return {
                'position': price_position,
                'positionRange': position_range,
                'high60d': float(max_price),
                'low60d': float(min_price),
                'volatility': float((max_price - min_price) / min_price * 100) if min_price > 0 else 0
            }
        except Exception as e:
            logger.error(f"分析价格位置失败: {str(e)}")
            return None
    
    def _analyze_volume_relation(
        self,
        df: pd.DataFrame,
        base_date: pd.Timestamp,
        base_volume: Optional[float],
        lookback_days: int
    ) -> Optional[Dict[str, Any]]:
        """分析放量关系"""
        try:
            if base_volume is None:
                return None
            
            data = df[df['timestamp'] <= base_date]
            if len(data) < lookback_days:
                return None
            
            lookback_data = data.tail(lookback_days)
            volumes = pd.to_numeric(lookback_data['volume'], errors='coerce').dropna()
            
            if len(volumes) == 0:
                return None
            
            # 计算均量
            avg_volume = volumes.mean()
            if avg_volume == 0:
                return None
            
            # 成交量倍数
            volume_ratio = base_volume / avg_volume
            
            # 放量分类
            if volume_ratio < 1:
                volume_category = '<1'
            elif volume_ratio < 1.5:
                volume_category = '1-1.5'
            elif volume_ratio < 2:
                volume_category = '1.5-2'
            elif volume_ratio < 3:
                volume_category = '2-3'
            else:
                volume_category = '>3'
            
            # 成交量趋势（过去5日）
            if len(volumes) >= 5:
                recent_volumes = volumes.tail(5)
                if len(recent_volumes) >= 2:
                    if recent_volumes.iloc[-1] > recent_volumes.iloc[-2]:
                        volume_trend = 'up'
                    elif recent_volumes.iloc[-1] < recent_volumes.iloc[-2]:
                        volume_trend = 'down'
                    else:
                        volume_trend = 'neutral'
                else:
                    volume_trend = 'neutral'
            else:
                volume_trend = 'neutral'
            
            # 量价关系（需要价格数据）
            closes = pd.to_numeric(lookback_data['close'], errors='coerce').dropna()
            if len(closes) >= 2 and len(volumes) >= 2:
                price_change = closes.iloc[-1] - closes.iloc[-2]
                volume_change = volumes.iloc[-1] - volumes.iloc[-2]
                
                if price_change > 0 and volume_change > 0:
                    price_volume_relation = 'priceUpVolumeUp'
                elif price_change < 0 and volume_change < 0:
                    price_volume_relation = 'priceDownVolumeDown'
                elif price_change > 0 and volume_change < 0:
                    price_volume_relation = 'priceUpVolumeDown'
                elif price_change < 0 and volume_change > 0:
                    price_volume_relation = 'priceDownVolumeUp'
                else:
                    price_volume_relation = 'neutral'
            else:
                price_volume_relation = 'neutral'
            
            # 成交量健康度（上涨日/下跌日平均成交量）
            if len(closes) >= 2 and len(volumes) >= 2:
                daily_returns = closes.diff().dropna()
                up_days = daily_returns > 0
                down_days = daily_returns < 0
                
                if up_days.sum() > 0 and down_days.sum() > 0:
                    # 对齐索引
                    volumes_aligned = volumes.iloc[1:].reset_index(drop=True)
                    daily_returns_aligned = daily_returns.reset_index(drop=True)
                    
                    if len(volumes_aligned) == len(daily_returns_aligned):
                        avg_vol_up = volumes_aligned[up_days].mean()
                        avg_vol_down = volumes_aligned[down_days].mean()
                        volume_health_ratio = avg_vol_up / avg_vol_down if avg_vol_down > 0 else None
                    else:
                        avg_vol_up = None
                        avg_vol_down = None
                        volume_health_ratio = None
                else:
                    avg_vol_up = None
                    avg_vol_down = None
                    volume_health_ratio = None
            else:
                avg_vol_up = None
                avg_vol_down = None
                volume_health_ratio = None
            
            return {
                'volumeRatio': volume_ratio,
                'volumeCategory': volume_category,
                'volumeTrend': volume_trend,
                'priceVolumeRelation': price_volume_relation,
                'volumeHealth': {
                    'avgVolumeUp': float(avg_vol_up) if avg_vol_up is not None else None,
                    'avgVolumeDown': float(avg_vol_down) if avg_vol_down is not None else None,
                    'volumeRatio': float(volume_health_ratio) if volume_health_ratio is not None else None
                }
            }
        except Exception as e:
            logger.error(f"分析放量关系失败: {str(e)}")
            return None
    
    def _analyze_other_indicators(
        self,
        df: pd.DataFrame,
        base_date: pd.Timestamp,
        base_price: float,
        base_volume: Optional[float]
    ) -> Optional[Dict[str, Any]]:
        """分析其他量价维度"""
        try:
            data = df[df['timestamp'] <= base_date]
            if len(data) < 20:  # 至少需要20天数据
                return None
            
            closes = pd.to_numeric(data['close'], errors='coerce').dropna()
            volumes = pd.to_numeric(data['volume'], errors='coerce').dropna()
            
            if len(closes) < 14:  # RSI需要14天
                return None
            
            indicators = {}
            
            # RSI计算
            rsi = self._calculate_rsi(closes, 14)
            if rsi is not None:
                if rsi < 30:
                    rsi_range = '<30'
                elif rsi < 50:
                    rsi_range = '30-50'
                elif rsi < 70:
                    rsi_range = '50-70'
                else:
                    rsi_range = '>70'
                indicators['rsi'] = {
                    'value': rsi,
                    'range': rsi_range
                }
            
            # 价格动量
            if len(closes) >= 20:
                change_5d = ((closes.iloc[-1] - closes.iloc[-5]) / closes.iloc[-5] * 100) if len(closes) >= 5 else None
                change_10d = ((closes.iloc[-1] - closes.iloc[-10]) / closes.iloc[-10] * 100) if len(closes) >= 10 else None
                change_20d = ((closes.iloc[-1] - closes.iloc[-20]) / closes.iloc[-20] * 100) if len(closes) >= 20 else None
                
                indicators['priceMomentum'] = {
                    'change5d': float(change_5d) if change_5d is not None else None,
                    'change10d': float(change_10d) if change_10d is not None else None,
                    'change20d': float(change_20d) if change_20d is not None else None
                }
            
            # 成交量动量
            if len(volumes) >= 10:
                vol_change_5d = ((volumes.iloc[-1] - volumes.iloc[-5]) / volumes.iloc[-5] * 100) if len(volumes) >= 5 else None
                vol_change_10d = ((volumes.iloc[-1] - volumes.iloc[-10]) / volumes.iloc[-10] * 100) if len(volumes) >= 10 else None
                
                # 量比（当前量/均量）
                if len(volumes) >= 20:
                    avg_volume = volumes.tail(20).mean()
                    volume_ratio_current = volumes.iloc[-1] / avg_volume if avg_volume > 0 else None
                else:
                    volume_ratio_current = None
                
                indicators['volumeMomentum'] = {
                    'change5d': float(vol_change_5d) if vol_change_5d is not None else None,
                    'change10d': float(vol_change_10d) if vol_change_10d is not None else None,
                    'volumeRatio': float(volume_ratio_current) if volume_ratio_current is not None else None
                }
            
            # K线形态
            if len(data) > 0:
                base_row = data.iloc[-1]
                open_price = float(base_row['open']) if pd.notna(base_row['open']) else None
                if open_price is not None:
                    is_yang = base_price > open_price
                    body_size = abs(base_price - open_price) / open_price * 100 if open_price > 0 else 0
                    
                    indicators['klinePattern'] = {
                        'isYang': is_yang,
                        'bodySize': float(body_size)
                    }
            
            # 波动性（ATR简化版：使用最高最低价差）
            if len(data) >= 14:
                recent_data = data.tail(14)
                highs = pd.to_numeric(recent_data['high'], errors='coerce').dropna()
                lows = pd.to_numeric(recent_data['low'], errors='coerce').dropna()
                
                if len(highs) > 0 and len(lows) > 0:
                    atr_simple = (highs - lows).mean()
                    volatility_pct = (atr_simple / base_price * 100) if base_price > 0 else 0
                    
                    if volatility_pct < 2:
                        volatility_range = 'low'
                    elif volatility_pct < 5:
                        volatility_range = 'medium'
                    else:
                        volatility_range = 'high'
                    
                    indicators['volatility'] = {
                        'atr': float(atr_simple),
                        'volatility': float(volatility_pct),
                        'range': volatility_range
                    }
            
            # 换手率（需要流通股本，这里简化处理）
            # 实际换手率 = 成交量 / 流通股本，这里用成交量作为代理
            if base_volume is not None and len(volumes) >= 20:
                avg_volume_20d = volumes.tail(20).mean()
                turnover_proxy = base_volume / avg_volume_20d if avg_volume_20d > 0 else None
                
                if turnover_proxy is not None:
                    if turnover_proxy < 0.5:
                        turnover_range = '<0.5'
                    elif turnover_proxy < 0.8:
                        turnover_range = '0.5-0.8'
                    elif turnover_proxy < 1.0:
                        turnover_range = '0.8-1'
                    elif turnover_proxy < 1.2:
                        turnover_range = '1-1.2'
                    elif turnover_proxy < 2.0:
                        turnover_range = '1.2-2'
                    else:
                        turnover_range = '>2'
                    
                    indicators['turnover'] = {
                        'rate': float(turnover_proxy),
                        'range': turnover_range
                    }
            
            # 趋势强度（价格斜率）
            if len(closes) >= 20:
                # 使用线性回归计算斜率
                x = np.arange(len(closes.tail(20)))
                y = closes.tail(20).values
                
                if len(x) == len(y) and len(x) > 1:
                    # 简单线性回归
                    slope = np.polyfit(x, y, 1)[0]
                    slope_pct = (slope / base_price * 100) if base_price > 0 else 0
                    
                    if slope_pct > 0.05:
                        trend_direction = 'up'
                    elif slope_pct < -0.05:
                        trend_direction = 'down'
                    else:
                        trend_direction = 'neutral'
                    
                    indicators['trendStrength'] = {
                        'slope20d': float(slope_pct),
                        'direction': trend_direction
                    }
            
            return indicators if indicators else None
        except Exception as e:
            logger.error(f"分析其他指标失败: {str(e)}")
            return None
    
    def _calculate_rsi(self, closes: pd.Series, period: int = 14) -> Optional[float]:
        """计算RSI指标"""
        try:
            delta = closes.diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
            
            if len(gain) == 0 or len(loss) == 0:
                return None
            
            rs = gain.iloc[-1] / loss.iloc[-1] if loss.iloc[-1] != 0 else None
            if rs is None:
                return None
            
            rsi = 100 - (100 / (1 + rs))
            return float(rsi) if pd.notna(rsi) else None
        except Exception:
            return None
    
    def _statistics_analysis(self, stock_features: List[Dict[str, Any]]) -> Dict[str, Any]:
        """统计所有股票的特征"""
        if not stock_features:
            return {}
        
        result = {}
        
        # 1. MACD共振分析
        daily_macd_list = [f.get('dailyMacd') for f in stock_features if f.get('dailyMacd')]
        weekly_macd_list = [f.get('weeklyMacd') for f in stock_features if f.get('weeklyMacd')]
        
        if daily_macd_list:
            result['macdResonance'] = {
                'daily': self._stat_macd(stock_features, 'dailyMacd'),
                'weekly': self._stat_macd(stock_features, 'weeklyMacd') if weekly_macd_list else {},
                'resonance': self._stat_resonance(stock_features)
            }
        
        # 2. 价格与MA关系
        ma_relation_list = [f.get('priceMARelation') for f in stock_features if f.get('priceMARelation')]
        if ma_relation_list:
            result['priceMARelation'] = self._stat_price_ma(stock_features)
        
        # 3. 价格位置
        price_position_list = [f.get('pricePosition') for f in stock_features if f.get('pricePosition')]
        if price_position_list:
            result['pricePosition'] = self._stat_price_position(stock_features)
        
        # 4. 放量关系
        volume_relation_list = [f.get('volumeRelation') for f in stock_features if f.get('volumeRelation')]
        if volume_relation_list:
            result['volumeRelation'] = self._stat_volume_relation(stock_features)
        
        # 5. 其他指标
        other_indicators_list = [f.get('otherIndicators') for f in stock_features if f.get('otherIndicators')]
        if other_indicators_list:
            result['otherIndicators'] = self._stat_other_indicators(stock_features)
        
        return result
    
    def _stat_macd(self, stock_features: List[Dict[str, Any]], macd_key: str = 'dailyMacd') -> Dict[str, Any]:
        """统计MACD指标"""
        difs = []
        deas = []
        hists = []
        hist_colors_with_symbols = []
        hist_trends_with_symbols = []
        zero_axes_with_symbols = []
        
        for stock_feature in stock_features:
            macd = stock_feature.get(macd_key)
            symbol = stock_feature.get('symbol')
            if macd and symbol:
                if macd.get('dif') is not None:
                    difs.append(macd['dif'])
                if macd.get('dea') is not None:
                    deas.append(macd['dea'])
                if macd.get('hist') is not None:
                    hists.append(macd['hist'])
                if macd.get('histColor'):
                    hist_colors_with_symbols.append((macd['histColor'], symbol))
                if macd.get('histTrend'):
                    hist_trends_with_symbols.append((macd['histTrend'], symbol))
                if macd.get('zeroAxis'):
                    zero_axes_with_symbols.append((macd['zeroAxis'], symbol))
        
        return {
            'dif': self._calc_stats(difs),
            'dea': self._calc_stats(deas),
            'hist': self._calc_stats(hists),
            'histColor': self._count_distribution([c[0] for c in hist_colors_with_symbols]),
            'histColorWithSymbols': self._count_distribution_with_symbols(hist_colors_with_symbols),
            'histTrend': self._count_distribution([t[0] for t in hist_trends_with_symbols]),
            'histTrendWithSymbols': self._count_distribution_with_symbols(hist_trends_with_symbols),
            'zeroAxis': self._count_distribution([z[0] for z in zero_axes_with_symbols]),
            'zeroAxisWithSymbols': self._count_distribution_with_symbols(zero_axes_with_symbols)
        }
    
    def _stat_resonance(self, stock_features: List[Dict[str, Any]]) -> Dict[str, Any]:
        """统计共振情况"""
        both_up_symbols = []
        both_red_symbols = []
        both_rising_symbols = []
        same_direction_symbols = []
        
        for stock_feature in stock_features:
            daily_macd = stock_feature.get('dailyMacd')
            weekly_macd = stock_feature.get('weeklyMacd')
            symbol = stock_feature.get('symbol')
            
            if daily_macd and weekly_macd and symbol:
                daily_trend = daily_macd.get('histTrend')
                weekly_trend = weekly_macd.get('histTrend')
                daily_color = daily_macd.get('histColor')
                weekly_color = weekly_macd.get('histColor')
                
                if daily_trend == 'up' and weekly_trend == 'up':
                    both_up_symbols.append(symbol)
                if daily_color == 'red' and weekly_color == 'red':
                    both_red_symbols.append(symbol)
                if daily_trend == 'up' and weekly_trend == 'up':
                    both_rising_symbols.append(symbol)
                if (daily_trend == 'up' and weekly_trend == 'up') or (daily_trend == 'down' and weekly_trend == 'down'):
                    same_direction_symbols.append(symbol)
        
        return {
            'bothUp': len(both_up_symbols),
            'bothUpSymbols': both_up_symbols,
            'bothRed': len(both_red_symbols),
            'bothRedSymbols': both_red_symbols,
            'bothRising': len(both_rising_symbols),
            'bothRisingSymbols': both_rising_symbols,
            'sameDirection': len(same_direction_symbols),
            'sameDirectionSymbols': same_direction_symbols
        }
    
    def _stat_price_ma(self, stock_features: List[Dict[str, Any]]) -> Dict[str, Any]:
        """统计价格与MA关系"""
        price_above_ma = {
            'MA5': {'count': 0, 'symbols': []},
            'MA10': {'count': 0, 'symbols': []},
            'MA20': {'count': 0, 'symbols': []},
            'MA30': {'count': 0, 'symbols': []},
            'MA60': {'count': 0, 'symbols': []},
            'MA120': {'count': 0, 'symbols': []}
        }
        
        alignments_with_symbols = []
        distances_above = []
        distances_below = []
        
        for stock_feature in stock_features:
            ma = stock_feature.get('priceMARelation')
            symbol = stock_feature.get('symbol')
            if ma and symbol:
                price_above = ma.get('priceAboveMA', {})
                for key in price_above_ma.keys():
                    if price_above.get(key):
                        price_above_ma[key]['count'] += 1
                        price_above_ma[key]['symbols'].append(symbol)
                
                alignment = ma.get('maAlignment')
                if alignment:
                    alignments_with_symbols.append((alignment, symbol))
                
                distance = ma.get('priceDistanceFromMA', {})
                if distance.get('aboveMA20') is not None:
                    distances_above.append(distance['aboveMA20'])
                if distance.get('belowMA20') is not None:
                    distances_below.append(distance['belowMA20'])
        
        # 转换 price_above_ma 格式以保持兼容性
        price_above_ma_count = {k: v['count'] for k, v in price_above_ma.items()}
        price_above_ma_symbols = {k: v['symbols'] for k, v in price_above_ma.items()}
        
        return {
            'priceAboveMA': price_above_ma_count,
            'priceAboveMAWithSymbols': price_above_ma_symbols,
            'maAlignment': self._count_distribution([a[0] for a in alignments_with_symbols]),
            'maAlignmentWithSymbols': self._count_distribution_with_symbols(alignments_with_symbols),
            'priceDistanceFromMA': {
                'aboveMA20': self._calc_stats(distances_above) if distances_above else {},
                'belowMA20': self._calc_stats(distances_below) if distances_below else {}
            }
        }
    
    def _stat_price_position(self, stock_features: List[Dict[str, Any]]) -> Dict[str, Any]:
        """统计价格位置"""
        positions = []
        ranges_with_symbols = []
        highs = []
        lows = []
        volatilities = []
        
        for stock_feature in stock_features:
            position = stock_feature.get('pricePosition')
            symbol = stock_feature.get('symbol')
            if position and symbol:
                if position.get('position') is not None:
                    positions.append(position['position'])
                if position.get('positionRange'):
                    ranges_with_symbols.append((position['positionRange'], symbol))
                if position.get('high60d') is not None:
                    highs.append(position['high60d'])
                if position.get('low60d') is not None:
                    lows.append(position['low60d'])
                if position.get('volatility') is not None:
                    volatilities.append(position['volatility'])
        
        return {
            'lookbackDays': 60,  # 固定值
            'positionRange': self._calc_stats(positions),
            'positionDistribution': self._count_distribution([r[0] for r in ranges_with_symbols]),
            'positionDistributionWithSymbols': self._count_distribution_with_symbols(ranges_with_symbols),
            'priceRange': {
                'high60d': self._calc_stats(highs),
                'low60d': self._calc_stats(lows),
                'volatility': self._calc_stats(volatilities)
            }
        }
    
    def _stat_volume_relation(self, stock_features: List[Dict[str, Any]]) -> Dict[str, Any]:
        """统计放量关系"""
        ratios = []
        categories_with_symbols = []
        trends_with_symbols = []
        relations_with_symbols = []
        
        # 成交量健康度
        health_ratios = []
        
        for stock_feature in stock_features:
            volume = stock_feature.get('volumeRelation')
            symbol = stock_feature.get('symbol')
            if volume and symbol:
                if volume.get('volumeRatio') is not None:
                    ratios.append(volume['volumeRatio'])
                if volume.get('volumeCategory'):
                    categories_with_symbols.append((volume['volumeCategory'], symbol))
                if volume.get('volumeTrend'):
                    trends_with_symbols.append((volume['volumeTrend'], symbol))
                if volume.get('priceVolumeRelation'):
                    relations_with_symbols.append((volume['priceVolumeRelation'], symbol))
                
                health = volume.get('volumeHealth', {})
                if health.get('volumeRatio') is not None:
                    health_ratios.append(health['volumeRatio'])
        
        return {
            'volumeRatio': self._calc_stats(ratios),
            'volumeDistribution': self._count_distribution([c[0] for c in categories_with_symbols]),
            'volumeDistributionWithSymbols': self._count_distribution_with_symbols(categories_with_symbols),
            'volumeTrend': self._count_distribution([t[0] for t in trends_with_symbols]),
            'volumeTrendWithSymbols': self._count_distribution_with_symbols(trends_with_symbols),
            'priceVolumeRelation': self._count_distribution([r[0] for r in relations_with_symbols]),
            'priceVolumeRelationWithSymbols': self._count_distribution_with_symbols(relations_with_symbols),
            'volumeHealth': {
                'volumeRatio': self._calc_stats(health_ratios) if health_ratios else {}
            }
        }
    
    def _stat_other_indicators(self, stock_features: List[Dict[str, Any]]) -> Dict[str, Any]:
        """统计其他指标"""
        result = {}
        
        # RSI
        rsi_values = []
        rsi_ranges_with_symbols = []
        for stock_feature in stock_features:
            ind = stock_feature.get('otherIndicators')
            symbol = stock_feature.get('symbol')
            if ind and ind.get('rsi') and symbol:
                rsi_values.append(ind['rsi'].get('value'))
                rsi_ranges_with_symbols.append((ind['rsi'].get('range'), symbol))
        
        if rsi_values:
            result['rsi'] = {
                'value': self._calc_stats([v for v in rsi_values if v is not None]),
                'distribution': self._count_distribution([r[0] for r in rsi_ranges_with_symbols]),
                'distributionWithSymbols': self._count_distribution_with_symbols(rsi_ranges_with_symbols)
            }
        
        # 价格动量
        change5d_list = []
        change10d_list = []
        change20d_list = []
        for stock_feature in stock_features:
            ind = stock_feature.get('otherIndicators')
            if ind and ind.get('priceMomentum'):
                pm = ind['priceMomentum']
                if pm.get('change5d') is not None:
                    change5d_list.append(pm['change5d'])
                if pm.get('change10d') is not None:
                    change10d_list.append(pm['change10d'])
                if pm.get('change20d') is not None:
                    change20d_list.append(pm['change20d'])
        
        if change5d_list or change10d_list or change20d_list:
            result['priceMomentum'] = {
                'change5d': self._calc_stats(change5d_list),
                'change10d': self._calc_stats(change10d_list),
                'change20d': self._calc_stats(change20d_list)
            }
        
        # 成交量动量
        vol_change5d_list = []
        vol_change10d_list = []
        vol_ratio_list = []
        for stock_feature in stock_features:
            ind = stock_feature.get('otherIndicators')
            if ind and ind.get('volumeMomentum'):
                vm = ind['volumeMomentum']
                if vm.get('change5d') is not None:
                    vol_change5d_list.append(vm['change5d'])
                if vm.get('change10d') is not None:
                    vol_change10d_list.append(vm['change10d'])
                if vm.get('volumeRatio') is not None:
                    vol_ratio_list.append(vm['volumeRatio'])
        
        if vol_change5d_list or vol_change10d_list or vol_ratio_list:
            result['volumeMomentum'] = {
                'change5d': self._calc_stats(vol_change5d_list),
                'change10d': self._calc_stats(vol_change10d_list),
                'volumeRatio': self._calc_stats(vol_ratio_list)
            }
        
        # K线形态
        yang_count = 0
        yin_count = 0
        body_sizes = []
        for stock_feature in stock_features:
            ind = stock_feature.get('otherIndicators')
            if ind and ind.get('klinePattern'):
                kp = ind['klinePattern']
                if kp.get('isYang'):
                    yang_count += 1
                else:
                    yin_count += 1
                if kp.get('bodySize') is not None:
                    body_sizes.append(kp['bodySize'])
        
        if yang_count > 0 or yin_count > 0:
            result['klinePattern'] = {
                'yang': yang_count,
                'yin': yin_count,
                'bodySize': self._calc_stats(body_sizes)
            }
        
        # 波动性
        atr_list = []
        volatility_list = []
        volatility_ranges_with_symbols = []
        for stock_feature in stock_features:
            ind = stock_feature.get('otherIndicators')
            symbol = stock_feature.get('symbol')
            if ind and ind.get('volatility') and symbol:
                vol = ind['volatility']
                if vol.get('atr') is not None:
                    atr_list.append(vol['atr'])
                if vol.get('volatility') is not None:
                    volatility_list.append(vol['volatility'])
                if vol.get('range'):
                    volatility_ranges_with_symbols.append((vol['range'], symbol))
        
        if atr_list or volatility_list:
            result['volatility'] = {
                'atr': self._calc_stats(atr_list),
                'volatility': self._calc_stats(volatility_list),
                'distribution': self._count_distribution([r[0] for r in volatility_ranges_with_symbols]),
                'distributionWithSymbols': self._count_distribution_with_symbols(volatility_ranges_with_symbols)
            }
        
        # 换手率（成交量比率）
        turnover_rates = []
        turnover_ranges_with_symbols = []
        for stock_feature in stock_features:
            ind = stock_feature.get('otherIndicators')
            symbol = stock_feature.get('symbol')
            if ind and ind.get('turnover') and symbol:
                to = ind['turnover']
                if to.get('rate') is not None:
                    turnover_rates.append(to['rate'])
                if to.get('range'):
                    turnover_ranges_with_symbols.append((to['range'], symbol))
        
        if turnover_rates:
            result['turnover'] = {
                'rate': self._calc_stats(turnover_rates),
                'distribution': self._count_distribution([r[0] for r in turnover_ranges_with_symbols]),
                'distributionWithSymbols': self._count_distribution_with_symbols(turnover_ranges_with_symbols)
            }
        
        # 趋势强度
        slopes = []
        directions_with_symbols = []
        for stock_feature in stock_features:
            ind = stock_feature.get('otherIndicators')
            symbol = stock_feature.get('symbol')
            if ind and ind.get('trendStrength') and symbol:
                ts = ind['trendStrength']
                if ts.get('slope20d') is not None:
                    slopes.append(ts['slope20d'])
                if ts.get('direction'):
                    directions_with_symbols.append((ts['direction'], symbol))
        
        if slopes or directions_with_symbols:
            result['trendStrength'] = {
                'slope20d': self._calc_stats(slopes),
                'direction': self._count_distribution([d[0] for d in directions_with_symbols]),
                'directionWithSymbols': self._count_distribution_with_symbols(directions_with_symbols)
            }
        
        return result
    
    def _calc_stats(self, values: List[float]) -> Dict[str, float]:
        """计算统计值（最小/最大/平均/中位数）"""
        if not values:
            return {}
        
        clean_values = [v for v in values if v is not None and pd.notna(v)]
        if not clean_values:
            return {}
        
        return {
            'min': float(min(clean_values)),
            'max': float(max(clean_values)),
            'avg': float(np.mean(clean_values)),
            'median': float(np.median(clean_values))
        }
    
    def _count_distribution(self, values: List[Any]) -> Dict[str, int]:
        """统计分布"""
        if not values:
            return {}
        
        distribution = {}
        for v in values:
            if v is not None:
                key = str(v)
                distribution[key] = distribution.get(key, 0) + 1
        
        return distribution
    
    def _count_distribution_with_symbols(self, value_symbol_pairs: List[tuple]) -> Dict[str, Dict]:
        """统计分布并记录每只股票"""
        if not value_symbol_pairs:
            return {}
        
        distribution = {}
        for value, symbol in value_symbol_pairs:
            if value is not None and symbol is not None:
                key = str(value)
                if key not in distribution:
                    distribution[key] = {'count': 0, 'symbols': []}
                distribution[key]['count'] += 1
                distribution[key]['symbols'].append(symbol)
        
        return distribution
    
    def _calculate_stock_rankings(
        self,
        stock_features: List[Dict[str, Any]],
        analysis_result: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        统计每只股票符合的维度数量并排名
        统计所有出现过的维度，不仅仅是共同特征
        
        Returns:
            排名列表，每项包含：symbol, matchCount, matchedDimensions
        """
        # 定义维度及其对应的股票列表（统计所有维度，不设阈值）
        all_dimensions = {}
        
        # MACD日线
        macd_daily = analysis_result.get('macdResonance', {}).get('daily', {})
        if macd_daily:
            hist_color_symbols = macd_daily.get('histColorWithSymbols', {})
            for key, data in hist_color_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'日线MACD-{key}'] = data.get('symbols', [])
            
            hist_trend_symbols = macd_daily.get('histTrendWithSymbols', {})
            for key, data in hist_trend_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'日线MACD趋势-{key}'] = data.get('symbols', [])
            
            zero_axis_symbols = macd_daily.get('zeroAxisWithSymbols', {})
            for key, data in zero_axis_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'日线MACD零轴-{key}'] = data.get('symbols', [])
        
        # MACD周线
        macd_weekly = analysis_result.get('macdResonance', {}).get('weekly', {})
        if macd_weekly:
            hist_color_symbols = macd_weekly.get('histColorWithSymbols', {})
            for key, data in hist_color_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'周线MACD-{key}'] = data.get('symbols', [])
            
            hist_trend_symbols = macd_weekly.get('histTrendWithSymbols', {})
            for key, data in hist_trend_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'周线MACD趋势-{key}'] = data.get('symbols', [])
        
        # 共振
        resonance = analysis_result.get('macdResonance', {}).get('resonance', {})
        if resonance.get('bothRedSymbols'):
            all_dimensions['日周都红柱'] = resonance.get('bothRedSymbols', [])
        if resonance.get('bothUpSymbols'):
            all_dimensions['日周都上升'] = resonance.get('bothUpSymbols', [])
        if resonance.get('bothRisingSymbols'):
            all_dimensions['日周都持续上升'] = resonance.get('bothRisingSymbols', [])
        if resonance.get('sameDirectionSymbols'):
            all_dimensions['日周趋势同向'] = resonance.get('sameDirectionSymbols', [])
        
        # 价格与MA关系
        price_ma = analysis_result.get('priceMARelation', {})
        if price_ma:
            # 价格高于各均线
            price_above_ma_symbols = price_ma.get('priceAboveMAWithSymbols', {})
            for key, symbols_list in price_above_ma_symbols.items():
                if symbols_list:
                    all_dimensions[f'价格高于{key}'] = symbols_list
            
            # 均线排列
            ma_alignment_symbols = price_ma.get('maAlignmentWithSymbols', {})
            for key, data in ma_alignment_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'均线排列-{key}'] = data.get('symbols', [])
        
        # 价格位置
        price_position = analysis_result.get('pricePosition', {})
        if price_position:
            position_symbols = price_position.get('positionDistributionWithSymbols', {})
            for key, data in position_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'价格位置-{key}'] = data.get('symbols', [])
        
        # 成交量关系
        volume_relation = analysis_result.get('volumeRelation', {})
        if volume_relation:
            volume_symbols = volume_relation.get('volumeDistributionWithSymbols', {})
            for key, data in volume_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'成交量-{key}'] = data.get('symbols', [])
            
            volume_trend_symbols = volume_relation.get('volumeTrendWithSymbols', {})
            for key, data in volume_trend_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'成交量趋势-{key}'] = data.get('symbols', [])
            
            price_vol_symbols = volume_relation.get('priceVolumeRelationWithSymbols', {})
            for key, data in price_vol_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'量价关系-{key}'] = data.get('symbols', [])
        
        # 其他指标
        other_indicators = analysis_result.get('otherIndicators', {})
        if other_indicators:
            rsi = other_indicators.get('rsi', {})
            if rsi:
                rsi_symbols = rsi.get('distributionWithSymbols', {})
                for key, data in rsi_symbols.items():
                    if data.get('symbols'):
                        all_dimensions[f'RSI-{key}'] = data.get('symbols', [])
            
            volatility = other_indicators.get('volatility', {})
            if volatility:
                vol_symbols = volatility.get('distributionWithSymbols', {})
                for key, data in vol_symbols.items():
                    if data.get('symbols'):
                        all_dimensions[f'波动性-{key}'] = data.get('symbols', [])
            
            turnover = other_indicators.get('turnover', {})
            if turnover:
                turnover_symbols = turnover.get('distributionWithSymbols', {})
                for key, data in turnover_symbols.items():
                    if data.get('symbols'):
                        all_dimensions[f'成交量比率-{key}'] = data.get('symbols', [])
            
            trend_strength = other_indicators.get('trendStrength', {})
            if trend_strength:
                trend_symbols = trend_strength.get('directionWithSymbols', {})
                for key, data in trend_symbols.items():
                    if data.get('symbols'):
                        all_dimensions[f'趋势强度-{key}'] = data.get('symbols', [])
        
        # 统计每只股票符合的维度
        stock_matches = {}
        for symbol in [f.get('symbol') for f in stock_features if f.get('symbol')]:
            stock_matches[symbol] = {
                'symbol': symbol,
                'matchCount': 0,
                'matchedDimensions': []
            }
        
        # 遍历所有维度，统计每只股票符合的数量
        for dimension_name, symbols_list in all_dimensions.items():
            for symbol in symbols_list:
                if symbol in stock_matches:
                    stock_matches[symbol]['matchCount'] += 1
                    stock_matches[symbol]['matchedDimensions'].append(dimension_name)
        
        # 转换为列表并按符合维度数量排序
        rankings = list(stock_matches.values())
        rankings.sort(key=lambda x: x['matchCount'], reverse=True)
        
        return rankings
    
    def _calculate_stock_rankings_with_return(
        self,
        stock_features: List[Dict[str, Any]],
        analysis_result: Dict[str, Any],
        start_date: str,
        end_date: str
    ) -> List[Dict[str, Any]]:
        """
        计算每只股票的收益率和维度信息，按收益率排序
        
        Returns:
            排名列表，每项包含：symbol, name, return, matchedDimensions
        """
        # 收集所有维度及其对应的股票列表
        all_dimensions = {}
        
        # MACD日线
        macd_daily = analysis_result.get('macdResonance', {}).get('daily', {})
        if macd_daily:
            hist_color_symbols = macd_daily.get('histColorWithSymbols', {})
            for key, data in hist_color_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'日线MACD-{key}'] = data.get('symbols', [])
            
            hist_trend_symbols = macd_daily.get('histTrendWithSymbols', {})
            for key, data in hist_trend_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'日线MACD趋势-{key}'] = data.get('symbols', [])
            
            zero_axis_symbols = macd_daily.get('zeroAxisWithSymbols', {})
            for key, data in zero_axis_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'日线MACD零轴-{key}'] = data.get('symbols', [])
        
        # MACD周线
        macd_weekly = analysis_result.get('macdResonance', {}).get('weekly', {})
        if macd_weekly:
            hist_color_symbols = macd_weekly.get('histColorWithSymbols', {})
            for key, data in hist_color_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'周线MACD-{key}'] = data.get('symbols', [])
            
            hist_trend_symbols = macd_weekly.get('histTrendWithSymbols', {})
            for key, data in hist_trend_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'周线MACD趋势-{key}'] = data.get('symbols', [])
        
        # 共振
        resonance = analysis_result.get('macdResonance', {}).get('resonance', {})
        if resonance.get('bothRedSymbols'):
            all_dimensions['日周都红柱'] = resonance.get('bothRedSymbols', [])
        if resonance.get('bothUpSymbols'):
            all_dimensions['日周都上升'] = resonance.get('bothUpSymbols', [])
        if resonance.get('bothRisingSymbols'):
            all_dimensions['日周都持续上升'] = resonance.get('bothRisingSymbols', [])
        if resonance.get('sameDirectionSymbols'):
            all_dimensions['日周趋势同向'] = resonance.get('sameDirectionSymbols', [])
        
        # 价格与MA关系
        price_ma = analysis_result.get('priceMARelation', {})
        if price_ma:
            price_above_ma_symbols = price_ma.get('priceAboveMAWithSymbols', {})
            for key, symbols_list in price_above_ma_symbols.items():
                if symbols_list:
                    all_dimensions[f'价格高于{key}'] = symbols_list
            
            ma_alignment_symbols = price_ma.get('maAlignmentWithSymbols', {})
            for key, data in ma_alignment_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'均线排列-{key}'] = data.get('symbols', [])
        
        # 价格位置
        price_position = analysis_result.get('pricePosition', {})
        if price_position:
            position_symbols = price_position.get('positionDistributionWithSymbols', {})
            for key, data in position_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'价格位置-{key}'] = data.get('symbols', [])
        
        # 成交量关系
        volume_relation = analysis_result.get('volumeRelation', {})
        if volume_relation:
            volume_symbols = volume_relation.get('volumeDistributionWithSymbols', {})
            for key, data in volume_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'成交量-{key}'] = data.get('symbols', [])
            
            volume_trend_symbols = volume_relation.get('volumeTrendWithSymbols', {})
            for key, data in volume_trend_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'成交量趋势-{key}'] = data.get('symbols', [])
            
            price_vol_symbols = volume_relation.get('priceVolumeRelationWithSymbols', {})
            for key, data in price_vol_symbols.items():
                if data.get('symbols'):
                    all_dimensions[f'量价关系-{key}'] = data.get('symbols', [])
        
        # 其他指标
        other_indicators = analysis_result.get('otherIndicators', {})
        if other_indicators:
            rsi = other_indicators.get('rsi', {})
            if rsi:
                rsi_symbols = rsi.get('distributionWithSymbols', {})
                for key, data in rsi_symbols.items():
                    if data.get('symbols'):
                        all_dimensions[f'RSI-{key}'] = data.get('symbols', [])
            
            volatility = other_indicators.get('volatility', {})
            if volatility:
                vol_symbols = volatility.get('distributionWithSymbols', {})
                for key, data in vol_symbols.items():
                    if data.get('symbols'):
                        all_dimensions[f'波动性-{key}'] = data.get('symbols', [])
            
            turnover = other_indicators.get('turnover', {})
            if turnover:
                turnover_symbols = turnover.get('distributionWithSymbols', {})
                for key, data in turnover_symbols.items():
                    if data.get('symbols'):
                        all_dimensions[f'成交量比率-{key}'] = data.get('symbols', [])
            
            trend_strength = other_indicators.get('trendStrength', {})
            if trend_strength:
                trend_symbols = trend_strength.get('directionWithSymbols', {})
                for key, data in trend_symbols.items():
                    if data.get('symbols'):
                        all_dimensions[f'趋势强度-{key}'] = data.get('symbols', [])
        
        # 统计每只股票符合的维度并计算收益率
        stock_results = []
        for sf in stock_features:
            symbol = sf.get('symbol')
            if not symbol:
                continue
            
            # 收集该股票符合的所有维度
            matched_dimensions = []
            for dimension_name, symbols_list in all_dimensions.items():
                if symbol in symbols_list:
                    matched_dimensions.append(dimension_name)
            
            # 计算收益率
            try:
                daily_df = self.data_loader.load_stock_data(symbol, timeframe='1d', end_date=end_date)
                if daily_df is not None and not daily_df.empty:
                    daily_df = daily_df.sort_values('timestamp').reset_index(drop=True)
                    start_dt = pd.to_datetime(start_date)
                    end_dt = pd.to_datetime(end_date)
                    
                    # 找到开始日期和结束日期的数据
                    start_data = daily_df[daily_df['timestamp'] >= start_dt]
                    end_data = daily_df[daily_df['timestamp'] <= end_dt]
                    
                    if not start_data.empty and not end_data.empty:
                        start_price = pd.to_numeric(start_data.iloc[0]['close'], errors='coerce')
                        end_price = pd.to_numeric(end_data.iloc[-1]['close'], errors='coerce')
                        
                        if pd.notna(start_price) and pd.notna(end_price) and start_price > 0:
                            stock_return = (end_price - start_price) / start_price * 100
                        else:
                            stock_return = None
                    else:
                        stock_return = None
                else:
                    stock_return = None
            except Exception as e:
                logger.error(f"计算股票 {symbol} 收益率失败: {str(e)}")
                stock_return = None
            
            # 获取股票名称
            try:
                entries = self.data_loader.list_symbols()
                name = symbol
                for entry in entries:
                    if isinstance(entry, dict) and entry.get('symbol') == symbol:
                        name = entry.get('name', symbol)
                        break
            except Exception:
                name = symbol
            
            stock_results.append({
                'symbol': symbol,
                'name': name,
                'return': stock_return,
                'matchedDimensions': matched_dimensions
            })
        
        # 按收益率排序（从高到低）
        stock_results.sort(key=lambda x: x['return'] if x['return'] is not None else float('-inf'), reverse=True)
        
        return stock_results
    
    def _calculate_dimension_statistics(
        self,
        analysis_result: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        统计所有维度出现的次数，按次数排序
        
        Returns:
            维度统计列表，每项包含：dimension, count
        """
        dimension_counts = {}
        
        # MACD日线
        macd_daily = analysis_result.get('macdResonance', {}).get('daily', {})
        if macd_daily:
            hist_color_symbols = macd_daily.get('histColorWithSymbols', {})
            for key, data in hist_color_symbols.items():
                if data.get('symbols'):
                    dimension_counts[f'日线MACD-{key}'] = len(data.get('symbols', []))
            
            hist_trend_symbols = macd_daily.get('histTrendWithSymbols', {})
            for key, data in hist_trend_symbols.items():
                if data.get('symbols'):
                    dimension_counts[f'日线MACD趋势-{key}'] = len(data.get('symbols', []))
            
            zero_axis_symbols = macd_daily.get('zeroAxisWithSymbols', {})
            for key, data in zero_axis_symbols.items():
                if data.get('symbols'):
                    dimension_counts[f'日线MACD零轴-{key}'] = len(data.get('symbols', []))
        
        # MACD周线
        macd_weekly = analysis_result.get('macdResonance', {}).get('weekly', {})
        if macd_weekly:
            hist_color_symbols = macd_weekly.get('histColorWithSymbols', {})
            for key, data in hist_color_symbols.items():
                if data.get('symbols'):
                    dimension_counts[f'周线MACD-{key}'] = len(data.get('symbols', []))
            
            hist_trend_symbols = macd_weekly.get('histTrendWithSymbols', {})
            for key, data in hist_trend_symbols.items():
                if data.get('symbols'):
                    dimension_counts[f'周线MACD趋势-{key}'] = len(data.get('symbols', []))
        
        # 共振
        resonance = analysis_result.get('macdResonance', {}).get('resonance', {})
        if resonance.get('bothRedSymbols'):
            dimension_counts['日周都红柱'] = len(resonance.get('bothRedSymbols', []))
        if resonance.get('bothUpSymbols'):
            dimension_counts['日周都上升'] = len(resonance.get('bothUpSymbols', []))
        if resonance.get('bothRisingSymbols'):
            dimension_counts['日周都持续上升'] = len(resonance.get('bothRisingSymbols', []))
        if resonance.get('sameDirectionSymbols'):
            dimension_counts['日周趋势同向'] = len(resonance.get('sameDirectionSymbols', []))
        
        # 价格与MA关系
        price_ma = analysis_result.get('priceMARelation', {})
        if price_ma:
            price_above_ma_symbols = price_ma.get('priceAboveMAWithSymbols', {})
            for key, symbols_list in price_above_ma_symbols.items():
                if symbols_list:
                    dimension_counts[f'价格高于{key}'] = len(symbols_list)
            
            ma_alignment_symbols = price_ma.get('maAlignmentWithSymbols', {})
            for key, data in ma_alignment_symbols.items():
                if data.get('symbols'):
                    dimension_counts[f'均线排列-{key}'] = len(data.get('symbols', []))
        
        # 价格位置
        price_position = analysis_result.get('pricePosition', {})
        if price_position:
            position_symbols = price_position.get('positionDistributionWithSymbols', {})
            for key, data in position_symbols.items():
                if data.get('symbols'):
                    dimension_counts[f'价格位置-{key}'] = len(data.get('symbols', []))
        
        # 成交量关系
        volume_relation = analysis_result.get('volumeRelation', {})
        if volume_relation:
            volume_symbols = volume_relation.get('volumeDistributionWithSymbols', {})
            for key, data in volume_symbols.items():
                if data.get('symbols'):
                    dimension_counts[f'成交量-{key}'] = len(data.get('symbols', []))
            
            volume_trend_symbols = volume_relation.get('volumeTrendWithSymbols', {})
            for key, data in volume_trend_symbols.items():
                if data.get('symbols'):
                    dimension_counts[f'成交量趋势-{key}'] = len(data.get('symbols', []))
            
            price_vol_symbols = volume_relation.get('priceVolumeRelationWithSymbols', {})
            for key, data in price_vol_symbols.items():
                if data.get('symbols'):
                    dimension_counts[f'量价关系-{key}'] = len(data.get('symbols', []))
        
        # 其他指标
        other_indicators = analysis_result.get('otherIndicators', {})
        if other_indicators:
            rsi = other_indicators.get('rsi', {})
            if rsi:
                rsi_symbols = rsi.get('distributionWithSymbols', {})
                for key, data in rsi_symbols.items():
                    if data.get('symbols'):
                        dimension_counts[f'RSI-{key}'] = len(data.get('symbols', []))
            
            volatility = other_indicators.get('volatility', {})
            if volatility:
                vol_symbols = volatility.get('distributionWithSymbols', {})
                for key, data in vol_symbols.items():
                    if data.get('symbols'):
                        dimension_counts[f'波动性-{key}'] = len(data.get('symbols', []))
            
            turnover = other_indicators.get('turnover', {})
            if turnover:
                turnover_symbols = turnover.get('distributionWithSymbols', {})
                for key, data in turnover_symbols.items():
                    if data.get('symbols'):
                        dimension_counts[f'成交量比率-{key}'] = len(data.get('symbols', []))
            
            trend_strength = other_indicators.get('trendStrength', {})
            if trend_strength:
                trend_symbols = trend_strength.get('directionWithSymbols', {})
                for key, data in trend_symbols.items():
                    if data.get('symbols'):
                        dimension_counts[f'趋势强度-{key}'] = len(data.get('symbols', []))
        
        # 转换为列表并按次数排序（从高到低）
        dimension_stats = [
            {'dimension': dim, 'count': count}
            for dim, count in dimension_counts.items()
        ]
        dimension_stats.sort(key=lambda x: x['count'], reverse=True)
        
        return dimension_stats
    
    def _extract_common_features(
        self,
        analysis_result: Dict[str, Any],
        total_stocks: int
    ) -> List[str]:
        """提取共同特征总结（占比>=60%）"""
        features = []
        threshold = 0.6  # 60%阈值
        
        # MACD共振
        macd_resonance = analysis_result.get('macdResonance', {})
        if macd_resonance:
            daily = macd_resonance.get('daily', {})
            weekly = macd_resonance.get('weekly', {})
            resonance = macd_resonance.get('resonance', {})
            
            hist_color = daily.get('histColor', {})
            if hist_color.get('red', 0) / total_stocks >= threshold:
                features.append(f"{int(hist_color.get('red', 0) / total_stocks * 100)}%的股票日线MACD为红柱")
            
            weekly_hist_color = weekly.get('histColor', {})
            if weekly_hist_color.get('red', 0) / total_stocks >= threshold:
                features.append(f"{int(weekly_hist_color.get('red', 0) / total_stocks * 100)}%的股票周线MACD为红柱")
            
            if resonance.get('bothRed', 0) / total_stocks >= threshold:
                features.append(f"{int(resonance.get('bothRed', 0) / total_stocks * 100)}%的股票日线周线都红柱")
            
            if resonance.get('bothUp', 0) / total_stocks >= threshold:
                features.append(f"{int(resonance.get('bothUp', 0) / total_stocks * 100)}%的股票日线周线都上升")
        
        # 价格与MA关系
        price_ma = analysis_result.get('priceMARelation', {})
        if price_ma:
            price_above = price_ma.get('priceAboveMA', {})
            for ma_name, count in price_above.items():
                if count / total_stocks >= threshold:
                    features.append(f"{int(count / total_stocks * 100)}%的股票价格>{ma_name}")
        
        # 价格位置
        price_position = analysis_result.get('pricePosition', {})
        if price_position:
            position_dist = price_position.get('positionDistribution', {})
            bottom_count = position_dist.get('<20', 0) + position_dist.get('20-40', 0)
            if bottom_count / total_stocks >= threshold:
                features.append(f"{int(bottom_count / total_stocks * 100)}%的股票处于底部启动位置（价格位置<40%）")
        
        # 放量关系
        volume_relation = analysis_result.get('volumeRelation', {})
        if volume_relation:
            volume_dist = volume_relation.get('volumeDistribution', {})
            significant_volume = (
                volume_dist.get('1.5-2', 0) +
                volume_dist.get('2-3', 0) +
                volume_dist.get('>3', 0)
            )
            if significant_volume / total_stocks >= threshold:
                features.append(f"{int(significant_volume / total_stocks * 100)}%的股票明显放量（1.5倍以上）")
            
            price_vol_relation = volume_relation.get('priceVolumeRelation', {})
            if price_vol_relation.get('priceUpVolumeUp', 0) / total_stocks >= threshold:
                features.append(f"{int(price_vol_relation.get('priceUpVolumeUp', 0) / total_stocks * 100)}%的股票价涨量增")
        
        return features

