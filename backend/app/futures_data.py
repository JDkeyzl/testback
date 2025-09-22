"""
期货数据获取模块（AkShare）

要求实现：
- 历史分钟: ak.futures_zh_minute_sina(symbol, period)
- 历史日线: ak.futures_zh_daily_sina(symbol)
- 实时数据: ak.futures_zh_spot(symbol)
- 失败重试；参数校验；返回结构与股票数据尽量一致

统一返回：至少包含列
- datetime (datetime64[ns])
- open, high, low, close, volume (float)

为兼容现有加载器，额外保留 timestamp 列（等于 datetime），并附带 amount=0.0 列。
"""

from typing import Optional, Callable, Any
import logging
import pandas as pd
import numpy as np
import time
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    import akshare as ak
except Exception as e:
    ak = None
    logger.warning("AkShare 未安装，期货数据获取将不可用: %s", e)


def _normalize_period(period: Optional[str]) -> str:
    """规范 period: '1','5','15','30','60','day'"""
    if period is None:
        return "1"
    s = str(period).strip().lower()
    if s.endswith('m'):
        s = s[:-1]
    if s in {"1","5","15","30","60"}:
        return s
    if s in {"d","1d","day","daily"}:
        return "day"
    return "1"


def _format_futures_df(df: pd.DataFrame) -> pd.DataFrame:
    """将 AkShare 返回的数据格式化为统一列结构。"""
    if df is None or df.empty:
        out = pd.DataFrame(columns=["datetime","open","high","low","close","volume"])  # 空壳
        out["timestamp"] = pd.to_datetime(out.get("datetime"))
        out["amount"] = 0.0
        return out

    # 兼容不同字段命名
    rename_map = {}
    cols = {c.lower(): c for c in df.columns}

    # 时间列
    if "datetime" in cols:
        rename_map[cols["datetime"]] = "timestamp"
    elif "time" in cols:
        rename_map[cols["time"]] = "timestamp"
    elif "date" in cols:
        rename_map[cols["date"]] = "timestamp"

    # 价格列
    for key in ["open","high","low","close","volume","vol","amount","turnover"]:
        if key in cols:
            # 规范小写 -> 目标名
            target = key
            if key == "vol":
                target = "volume"
            if key == "turnover":
                target = "amount"
            rename_map[cols[key]] = target

    df = df.rename(columns=rename_map)

    # 构造缺失列
    for need in ["timestamp","open","high","low","close","volume"]:
        if need not in df.columns:
            df[need] = np.nan
    if "amount" not in df.columns:
        df["amount"] = np.nan

    # 类型与清洗
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    for col in ["open","high","low","close","volume","amount"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["timestamp","open","high","low","close"]).sort_values("timestamp").reset_index(drop=True)
    # 附带 datetime 列以满足新接口约定
    df["datetime"] = df["timestamp"]
    return df[["datetime","timestamp","open","high","low","close","volume","amount"]]


def _retry_call(fn: Callable[[], Any], retries: int = 3, delay: float = 0.6) -> Any:
    last_err = None
    for i in range(retries):
        try:
            return fn()
        except Exception as e:
            last_err = e
            time.sleep(delay)
    if last_err:
        raise last_err
    return None


def _date_span_days(start_date: Optional[str], end_date: Optional[str]) -> int:
    try:
        if not start_date or not end_date:
            return 0
        s = pd.to_datetime(start_date)
        e = pd.to_datetime(end_date)
        return max(0, (e - s).days)
    except Exception:
        return 0


def _load_local_csv(symbol: str) -> pd.DataFrame:
    try:
        project_root = Path(__file__).resolve().parents[3]
        fpath = project_root / 'data' / 'features' / f'{symbol}.csv'
        if not fpath.exists():
            return pd.DataFrame()
        raw = pd.read_csv(fpath)
        df = _format_futures_df(raw)
        # 标记来源
        df.attrs['source'] = 'local_csv'
        return df
    except Exception as e:
        logging.warning("加载本地期货CSV失败 %s: %s", symbol, e)
        return pd.DataFrame()


def get_futures_data(symbol: str,
                     period: Optional[str] = "1",
                     start_date: Optional[str] = None,
                     end_date: Optional[str] = None,
                     realtime: bool = False) -> pd.DataFrame:
    """
    获取期货数据（分钟 / 日线 / 实时），返回统一结构 DataFrame。

    Args:
        symbol: 合约代码，例如 "p2601"
        period: "1","5","15","30","60","day"
        start_date: 起始日期 'YYYY-MM-DD'
        end_date: 结束日期 'YYYY-MM-DD'
        realtime: True=实时现货，False=历史K线

    Returns:
        DataFrame: 列为至少 ['datetime','open','high','low','close','volume']，额外包含 ['timestamp','amount'] 以兼容旧逻辑
    """
    # 参数校验
    if not isinstance(symbol, str) or len(symbol.strip()) == 0:
        logger.warning("get_futures_data 参数 symbol 非法: %r", symbol)
        return _format_futures_df(pd.DataFrame())
    if ak is None:
        logger.error("AkShare 未安装，无法获取期货数据")
        return _format_futures_df(pd.DataFrame())

    per = _normalize_period(period)

    try:
        if realtime:
            # 实时行情
            def _call():
                return ak.futures_zh_spot(symbol=symbol)
            raw = _retry_call(_call)
            df = _format_futures_df(raw)
            # 仅保留最新一条（若返回多条，则按时间排序已保证末行最新）
            return df.tail(1).reset_index(drop=True)

        # 历史数据：分钟/日线
        span_days = _date_span_days(start_date, end_date)

        # 分钟源超过约3天：优先本地缓存；否则降级日线
        if per != "day" and span_days > 3:
            local_df = _load_local_csv(symbol)
            if not local_df.empty:
                df = local_df
                # 过滤
                if start_date:
                    df = df[df["timestamp"] >= pd.to_datetime(start_date)]
                if end_date:
                    df = df[df["timestamp"] <= pd.to_datetime(end_date)]
                df.attrs['period'] = per
                df.attrs['downgraded'] = False
                return df
            # 本地无缓存，降级为日线
            per = "day"

        if per == "day":
            def _call_day():
                return ak.futures_zh_daily_sina(symbol=symbol)
            raw = _retry_call(_call_day)
        else:
            def _call_min():
                return ak.futures_zh_minute_sina(symbol=symbol, period=per)
            raw = _retry_call(_call_min)

        df = _format_futures_df(raw)
        # 标记来源与降级信息
        try:
            if per == 'day':
                df.attrs['source'] = df.attrs.get('source') or 'akshare_daily'
            else:
                df.attrs['source'] = df.attrs.get('source') or 'akshare_minute'
            df.attrs['period'] = per
            if span_days > 3 and per == 'day':
                df.attrs['downgraded'] = True
            else:
                df.attrs['downgraded'] = False
        except Exception:
            pass

        # 过滤日期范围
        if start_date:
            df = df[df["timestamp"] >= pd.to_datetime(start_date)]
        if end_date:
            df = df[df["timestamp"] <= pd.to_datetime(end_date)]

        return df
    except Exception as e:
        logger.error("获取期货数据失败 symbol=%s period=%s realtime=%s err=%s", symbol, per, realtime, e)
        # 返回空表，保持项目稳定
        return _format_futures_df(pd.DataFrame())


