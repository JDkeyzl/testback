from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
import sys
from datetime import datetime
import os
import json
import subprocess
from pathlib import Path

from ..models.simple import SimpleBacktestRequest, SimpleBacktestResult
from ..services.backtest_engine import BacktestEngine
from ..real_backtest_engine import run_real_backtest
from ..futures_backtest_engine import run_futures_backtest
from ..data_loader import get_data_info, data_loader
from ..futures_data import get_futures_data
import numpy as np
import pandas as pd
import csv

router = APIRouter()
@router.get("/futures/contracts")
async def list_futures_contracts() -> Dict[str, Any]:
    """
    返回本地缓存的期货合约字典，若无缓存则返回空数组。
    约定缓存文件：data/features/contracts.json 或 contracts.csv
    """
    try:
        project_root = Path(__file__).resolve().parents[3]
        data_dir = project_root / 'data' / 'features'
        data_dir.mkdir(parents=True, exist_ok=True)
        json_path = data_dir / 'contracts.json'
        csv_path = data_dir / 'contracts.csv'

        contracts: List[Dict[str, Any]] = []
        if json_path.exists():
            with open(json_path, 'r', encoding='utf-8') as f:
                contracts = json.load(f)
        elif csv_path.exists():
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    symbol = row.get('symbol') or row.get('contract') or row.get('code')
                    name = row.get('name') or row.get('cn') or row.get('zh') or ''
                    if symbol:
                        contracts.append({ 'symbol': symbol, 'name': name })
        return { 'ok': True, 'list': contracts }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取期货合约字典失败: {str(e)}")


@router.post("/backtest", response_model=SimpleBacktestResult)
async def run_backtest(request: SimpleBacktestRequest) -> SimpleBacktestResult:
    """
    运行策略回测
    
    Args:
        request: 包含策略定义的回测请求
        
    Returns:
        BacktestResult: 回测结果，包含指标、资金曲线和交易记录
    """
    try:
        # 验证策略定义
        if not request.strategy.nodes:
            raise HTTPException(status_code=400, detail="策略必须包含至少一个节点")
        
        # 创建回测引擎
        engine = BacktestEngine(request.strategy)
        
        # 运行回测
        result = engine.run_backtest()
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"回测执行失败: {str(e)}")

@router.get("/health")
async def health_check() -> Dict[str, str]:
    """健康检查接口"""
    return {"status": "healthy", "message": "Backtest API is running"}

@router.get("/")
async def root() -> Dict[str, str]:
    """根路径"""
    return {
        "message": "TestBack API", 
        "version": "1.0.0",
        "endpoints": {
            "backtest": "/backtest",
            "health": "/health",
            "docs": "/docs"
        }
    }

@router.post("/backtest/real")
async def real_backtest_endpoint(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    使用真实数据运行策略回测（与前端 /api/v1/backtest/real 对齐）
    期望请求体包含：strategy, symbol, timeframe, startDate, endDate, initialCapital
    """
    try:
        strategy = request.get("strategy")
        if not strategy:
            raise HTTPException(status_code=400, detail="缺少 strategy 字段")

        symbol = request.get("symbol", "002130")
        timeframe = request.get("timeframe", "5m")
        start_date = request.get("startDate", "2024-01-01")
        end_date = request.get("endDate", "2024-12-31")
        initial_capital = request.get("initialCapital", 100000.0)
        position_management = request.get("positionManagement", "full")

        result = run_real_backtest(
            strategy=strategy,
            symbol=symbol,
            timeframe=timeframe,
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital,
            position_management=position_management,
            debug=bool(request.get("debug", False))
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"回测执行失败: {str(e)}")

@router.post("/backtest/stocks")
async def stocks_backtest_endpoint(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    股票回测端点（与期货分离）。保持现有 RealBacktestEngine 行为，稳态迁移。
    请求体：{ strategy, symbol, timeframe, startDate, endDate, initialCapital, positionManagement?, debug? }
    """
    try:
        strategy = request.get("strategy")
        if not strategy:
            raise HTTPException(status_code=400, detail="缺少 strategy 字段")

        symbol = request.get("symbol") or "002130"
        timeframe = request.get("timeframe", "5m")
        start_date = request.get("startDate") or "2025-01-01"
        end_date = request.get("endDate") or None
        initial_capital = float(request.get("initialCapital", 100000.0))
        position_management = request.get("positionManagement", "full")
        debug = bool(request.get("debug", False))

        # 直接复用现有股票引擎
        result = run_real_backtest(
            strategy=strategy,
            symbol=str(symbol),
            timeframe=str(timeframe),
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital,
            position_management=position_management,
            debug=debug,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"股票回测执行失败: {str(e)}")

@router.post("/backtest/futures")
async def futures_backtest_endpoint(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    期货保证金制度回测端点（独立于股票），按合约规格计算权益曲线
    期望：{ strategy, symbol, timeframe, startDate, endDate, initialCapital }
    """
    try:
        strategy = request.get("strategy")
        if not strategy:
            raise HTTPException(status_code=400, detail="缺少 strategy 字段")
        symbol = request.get("symbol")
        if not symbol:
            raise HTTPException(status_code=400, detail="缺少 symbol")
        timeframe = request.get("timeframe", "5m")
        start_date = request.get("startDate")
        end_date = request.get("endDate")
        initial_capital = float(request.get("initialCapital", 100000.0))

        result = run_futures_backtest(
            strategy=strategy,
            symbol=str(symbol),
            timeframe=str(timeframe),
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital,
            debug=bool(request.get("debug", False)),
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"期货回测执行失败: {str(e)}")

@router.get("/data/info/{symbol}")
async def get_stock_data_info(symbol: str) -> Dict[str, Any]:
    """获取股票数据信息（统一在主应用下暴露）"""
    try:
        return get_data_info(symbol)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取数据信息失败: {str(e)}")

@router.get("/data/sources")
async def list_data_sources() -> Dict[str, Any]:
    """列出可用CSV数据源"""
    try:
        return {"sources": data_loader.list_symbols()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"列出数据源失败: {str(e)}")

@router.get("/data/stocklist")
async def get_stock_list() -> Dict[str, Any]:
    """返回 data/stockList/all_pure_stock.json 的内容"""
    try:
        project_root = Path(__file__).resolve().parents[3]
        json_path = project_root / 'data' / 'stockList' / 'all_pure_stock.json'
        if not json_path.exists():
            raise HTTPException(status_code=404, detail="股票列表文件不存在")
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return {"list": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取股票列表失败: {str(e)}")

@router.post("/data/fetch")
async def fetch_stock_data(body: Dict[str, Any]) -> Dict[str, Any]:
    """调用脚本拉取单只股票数据并导出为CSV
    body: { codeFull: 'sh.601360', name: '360', startDate, endDate, timeframe }
    """
    try:
        code_full = body.get('codeFull') or body.get('code')
        name = body.get('name') or (code_full or '').split('.')[-1]
        start_date = body.get('startDate') or '2025-01-01'
        end_date = body.get('endDate') or datetime.now().strftime('%Y-%m-%d')
        timeframe = body.get('timeframe') or '1d'

        # timeframe 映射为 baostock 频率
        tf = timeframe
        tf_map = {
            '1d': 'd', '1w': 'w', '1M': 'm',
            '5m': '5', '15m': '15', '30m': '30', '1h': '60', '60m': '60'
        }
        freq = tf_map.get(tf, 'd')

        if not code_full or '.' not in code_full:
            raise HTTPException(status_code=400, detail="缺少有效的 codeFull，例如 sh.601360")

        # 更健壮地定位项目根与脚本路径
        here = Path(__file__).resolve()
        candidate_roots = [
            here.parents[3] if len(here.parents) >= 4 else here.parent,
            here.parents[2] if len(here.parents) >= 3 else here.parent,
            here.parents[1] if len(here.parents) >= 2 else here.parent,
            here.parents[0] if len(here.parents) >= 1 else here.parent,
        ]
        script_path = None
        project_root = None
        for root in candidate_roots:
            cand = root / 'scripts' / 'getSingleStock.py'
            if cand.exists():
                script_path = cand
                project_root = root
                break
        if script_path is None:
            roots_str = "; ".join(str(r) for r in candidate_roots)
            raise HTTPException(status_code=404, detail=f"抓取脚本不存在（查找过的根：{roots_str}）")

        env = os.environ.copy()
        # 通过环境变量传参数，避免修改脚本签名（脚本将读取这些变量覆盖默认）
        env['TB_STOCK_CODE'] = code_full
        env['TB_STOCK_NAME'] = str(name)
        env['TB_START_DATE'] = start_date
        env['TB_END_DATE'] = end_date or ''
        env['TB_FREQUENCY'] = freq

        # 以python启动脚本
        py_exec = env.get('PYTHON') or sys.executable or 'python3'
        proc = subprocess.run([py_exec, str(script_path)], cwd=str(project_root), env=env, capture_output=True, text=True, timeout=180)

        if proc.returncode != 0:
            raise HTTPException(status_code=500, detail=f"脚本执行失败: {proc.stderr or proc.stdout}")

        # 返回文件是否存在；若不存在则按 code 后缀兜底搜索
        data_dir = project_root / 'data'
        code = code_full.split('.')[-1]
        expected = data_dir / f"{name}-{code}.csv"
        resolved = None
        if expected.exists():
            resolved = expected
        else:
            # 兜底：按 *-code.csv 搜索（以实际生成的为准）
            cand = list(data_dir.glob(f"*-{code}.csv"))
            if cand:
                resolved = cand[0]
        if not resolved:
            raise HTTPException(status_code=500, detail=f"脚本执行成功但未找到CSV：期望 {expected}；stdout: {proc.stdout[-500:]} ")
        return {"ok": True, "stdout": proc.stdout, "csv": str(resolved), "code": code, "name": name}
    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="脚本执行超时")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"抓取失败: {str(e)}")

@router.get("/futures/data")
async def fetch_futures_data(symbol: str, period: str = "5", startDate: str = None, endDate: str = None, save: bool = False, name: str = None) -> Dict[str, Any]:
    """
    拉取期货分钟K线（AkShare），返回统一结构；可选保存为CSV。
    - symbol: 如 p2601
    - period: '1','5','15','30','60'
    - startDate/endDate: 可选，'YYYY-MM-DD'
    - save: 为 True 时写入 data 目录 CSV
    """
    try:
        # 统一基线为 1 分钟，便于后续聚合为任意更大周期，只保存一个文件
        base_period = "1"
        df = get_futures_data(symbol=symbol, period=base_period, start_date=startDate, end_date=endDate)
        # 清洗 NaN/Inf，并将时间戳转字符串，避免 JSON 序列化报错
        records: List[Dict[str, Any]] = []
        if df is not None and not df.empty:
            # 统一列
            expect_cols = ["timestamp","open","high","low","close","volume","amount"]
            for c in expect_cols:
                if c not in df.columns:
                    df[c] = np.nan
            # 转换时间戳为字符串
            try:
                df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce').dt.strftime('%Y-%m-%d %H:%M:%S')
            except Exception:
                df['timestamp'] = df['timestamp'].astype(str)
            # 数值列安全化
            for col in ["open","high","low","close","volume","amount"]:
                df[col] = pd.to_numeric(df[col], errors='coerce').replace([np.inf, -np.inf], np.nan).fillna(0.0)
            # 只保留需要的列
            df = df[expect_cols]
            records = df.to_dict(orient='records')
            try:
                min_ts = str(df['timestamp'].iloc[0])
                max_ts = str(df['timestamp'].iloc[-1])
            except Exception:
                min_ts = max_ts = None
        else:
            min_ts = max_ts = None

        csv_path = None
        if save:
            project_root = Path(__file__).resolve().parents[3]
            data_dir = project_root / 'data' / 'features'
            data_dir.mkdir(parents=True, exist_ok=True)
            safe_name = (name or '').strip()
            # 文件名：合约号_中文名.csv；若无中文名，仅合约号
            fname = f"{symbol}{('_' + safe_name) if safe_name else ''}.csv"
            out_path = data_dir / fname
            df.to_csv(out_path, index=False, encoding='utf-8')
            csv_path = str(out_path)

        # 标记是否由于三方接口限制，仅返回了部分区间数据
        requested = {"start": startDate, "end": endDate}
        actual = {"start": min_ts, "end": max_ts}
        partial = False
        if startDate and min_ts:
            try:
                partial = pd.to_datetime(min_ts) > pd.to_datetime(startDate)
            except Exception:
                partial = False
        return {"ok": True, "count": len(records), "data": records[:5000], "csv": csv_path, "range": {"requested": requested, "actual": actual, "partial": partial}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"期货数据获取失败: {str(e)}")
