"""
期货数据获取模块（AkShare）

职责：
- 使用 AkShare 拉取国内期货分钟级别 K 线数据
- 返回与股票数据加载器一致的列结构，便于直接接入现有回测逻辑：
  ['timestamp','open','high','low','close','volume','amount']

初版实现：
- 支持棕榈油期货合约 p2601 的分钟级别数据，接口示例：
  ak.futures_zh_minute_sina(symbol="p2601", period="5")
- period 支持 '1','5','15','30','60'（字符串或整数）
"""

from typing import Optional
import logging
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

try:
    import akshare as ak
except Exception as e:
    ak = None
    logger.warning("AkShare 未安装，期货数据获取将不可用: %s", e)


def _normalize_minutes(period: Optional[str]) -> str:
    """将 period 规范为 AkShare 期货分钟接口支持的字符串。默认 '5'。"""
    if period is None:
        return "5"
    s = str(period).strip().lower().replace("m", "")
    return s if s in {"1","5","15","30","60"} else "5"


def _format_futures_df(df: pd.DataFrame) -> pd.DataFrame:
    """将 AkShare 返回的数据格式化为统一列结构。"""
    if df is None or df.empty:
        return pd.DataFrame(columns=[
            "timestamp","open","high","low","close","volume","amount"
        ])

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
    return df[["timestamp","open","high","low","close","volume","amount"]]


def get_futures_data(symbol: str,
                     period: Optional[str] = "5",
                     start_date: Optional[str] = None,
                     end_date: Optional[str] = None) -> pd.DataFrame:
    """
    获取期货分钟级别 K 线数据（AkShare），并返回统一结构 DataFrame。

    Args:
        symbol: 合约代码，例如 "p2601"
        period: 分钟级别，'1','5','15','30','60' 之一
        start_date: 起始日期 'YYYY-MM-DD'（可选）
        end_date: 结束日期 'YYYY-MM-DD'（可选）

    Returns:
        DataFrame: 列为 ['timestamp','open','high','low','close','volume','amount']
    """
    if ak is None:
        raise RuntimeError("AkShare 未安装，无法获取期货数据。请在环境中安装 akshare。")

    per = _normalize_minutes(period)
    try:
        # 调用 AkShare 接口
        raw = ak.futures_zh_minute_sina(symbol=symbol, period=per)
        df = _format_futures_df(raw)

        # 过滤日期范围
        if start_date:
            df = df[df["timestamp"] >= pd.to_datetime(start_date)]
        if end_date:
            df = df[df["timestamp"] <= pd.to_datetime(end_date)]

        return df
    except Exception as e:
        logger.error("获取期货数据失败 symbol=%s period=%s err=%s", symbol, per, e)
        raise


