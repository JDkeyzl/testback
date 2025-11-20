from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List, Optional
import sys
from datetime import datetime, timedelta
import os
import json
import subprocess
from pathlib import Path
import uuid
import threading
import shutil

from ..models.simple import SimpleBacktestRequest, SimpleBacktestResult
from ..services.backtest_engine import BacktestEngine
from ..real_backtest_engine import run_real_backtest
from ..futures_backtest_engine import run_futures_backtest
from ..data_loader import get_data_info, data_loader, load_stock_data
from ..futures_data import get_futures_data
import numpy as np
import pandas as pd
import csv

router = APIRouter()

# 全局任务存储（内存版，适合单机）
screening_tasks: Dict[str, Dict[str, Any]] = {}
tasks_lock = threading.Lock()

def get_python_executable() -> str:
    """
    获取 Python 可执行文件路径（跨平台兼容）
    优先级: 环境变量 PYTHON > sys.executable > 查找 python/python3/py
    """
    # 优先使用环境变量
    if 'PYTHON' in os.environ:
        return os.environ['PYTHON']
    
    # 使用当前解释器（最可靠）
    if sys.executable:
        return sys.executable
    
    # 尝试查找常见的 Python 命令
    for cmd in ['python', 'python3', 'py']:
        found = shutil.which(cmd)
        if found:
            return found
    
    # 最后 fallback（Windows 上通常是 python）
    return 'python' if sys.platform.startswith('win') else 'python3'
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

@router.get("/data/kline/{symbol}")
async def get_kline_data(symbol: str, timeframe: str = "1d") -> Dict[str, Any]:
    """
    获取指定股票的K线数据（用于图表展示）
    参数：symbol=股票代码，timeframe=周期（1d/1w等）
    返回：{ ok: true, symbol, timeframe, data: [{timestamp, open, high, low, close, volume}] }
    """
    try:
        df = load_stock_data(symbol, timeframe)
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail=f"未找到股票 {symbol} 的数据")
        
        # 转为前端可用的格式
        records = []
        for _, row in df.iterrows():
            try:
                records.append({
                    "timestamp": str(row['timestamp']),
                    "open": float(row['open']) if pd.notna(row['open']) else 0,
                    "high": float(row['high']) if pd.notna(row['high']) else 0,
                    "low": float(row['low']) if pd.notna(row['low']) else 0,
                    "close": float(row['close']) if pd.notna(row['close']) else 0,
                    "volume": float(row['volume']) if pd.notna(row['volume']) else 0
                })
            except Exception:
                continue
        
        return {
            "ok": True,
            "symbol": symbol,
            "timeframe": timeframe,
            "count": len(records),
            "data": records
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取K线数据失败: {str(e)}")

@router.get("/data/stocklist")
async def get_stock_list() -> Dict[str, Any]:
    """返回股票列表，优先使用包含行业的文件。

    优先顺序：
    1) data/stockList/all_stock_with_industry.json
    2) data/stockList/all_pure_stock.json
    """
    try:
        project_root = Path(__file__).resolve().parents[3]
        with_industry = project_root / 'data' / 'stockList' / 'all_stock_with_industry.json'
        pure = project_root / 'data' / 'stockList' / 'all_pure_stock.json'

        data: list = []
        if with_industry.exists():
            with open(with_industry, 'r', encoding='utf-8') as f:
                data = json.load(f)
        elif pure.exists():
            with open(pure, 'r', encoding='utf-8') as f:
                data = json.load(f)
        else:
            raise HTTPException(status_code=404, detail="股票列表文件不存在")

        # 确保字段存在，industry 若缺失则置为 ''
        normalized = []
        for it in (data or []):
            if isinstance(it, dict):
                normalized.append({
                    'code': it.get('code'),
                    'code_name': it.get('code_name') or it.get('name') or '',
                    'industry': it.get('industry') or it.get('industryClassification') or ''
                })
        return {"list": normalized or data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取股票列表失败: {str(e)}")

@router.post("/data/batch-daily")
async def batch_fetch_daily_data(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    批量获取A股日K数据（调用 scripts/batchFetchDailyData.py）
    body: { days?: 365, limit?: number }
    """
    try:
        days = int(body.get('days') or 365)
        limit = body.get('limit')
        
        # 定位脚本路径
        here = Path(__file__).resolve()
        candidate_roots = [
            here.parents[3] if len(here.parents) >= 4 else here.parent,
            here.parents[2] if len(here.parents) >= 3 else here.parent,
        ]
        script_path = None
        project_root = None
        for root in candidate_roots:
            cand = root / 'scripts' / 'batchFetchDailyData.py'
            if cand.exists():
                script_path = cand
                project_root = root
                break
        if script_path is None:
            # 尝试更多路径
            all_roots = [here.parents[i] for i in range(min(5, len(here.parents)))]
            checked_paths = [str(root / 'scripts' / 'batchFetchDailyData.py') for root in all_roots]
            raise HTTPException(
                status_code=404, 
                detail=f"批量获取脚本不存在。已检查路径: {', '.join(checked_paths)}"
            )
        
        # 执行脚本
        py_exec = get_python_executable()
        cmd = [py_exec, str(script_path), '--days', str(days)]
        if limit:
            cmd.extend(['--limit', str(limit)])
        
        print(f"[批量获取] 执行命令: {' '.join(cmd)}")
        print(f"[批量获取] 工作目录: {project_root}")
        
        proc = subprocess.run(
            cmd, 
            cwd=str(project_root), 
            capture_output=True, 
            text=True, 
            timeout=3600,
            encoding='utf-8',
            errors='replace'
        )
        
        print(f"[批量获取] 返回码: {proc.returncode}")
        print(f"[批量获取] stdout长度: {len(proc.stdout)}")
        print(f"[批量获取] stderr长度: {len(proc.stderr)}")
        
        if proc.returncode != 0:
            error_msg = proc.stderr or proc.stdout or "未知错误"
            print(f"[批量获取] 错误输出: {error_msg[:500]}")
            raise HTTPException(
                status_code=500, 
                detail=f"脚本执行失败 (返回码: {proc.returncode}): {error_msg[:1000]}"
            )
        
        # 解析 JSON 结果
        lines = proc.stdout.strip().split('\n')
        json_start = -1
        for i, line in enumerate(lines):
            if '=== JSON RESULT ===' in line:
                json_start = i + 1
                break
        
        result = {'ok': 0, 'fail': 0, 'total': 0, 'errors': []}
        if json_start >= 0 and json_start < len(lines):
            try:
                json_str = '\n'.join(lines[json_start:])
                result = json.loads(json_str)
                print(f"[批量获取] 解析结果: {result}")
            except Exception as e:
                print(f"[批量获取] JSON解析失败: {e}")
                print(f"[批量获取] JSON内容: {json_str[:500] if 'json_str' in locals() else 'N/A'}")
                # 即使JSON解析失败，也尝试从stdout中提取信息
                if '完成:' in proc.stdout:
                    # 尝试从输出中提取数字
                    import re
                    match = re.search(r'成功 (\d+), 失败 (\d+), 总计 (\d+)', proc.stdout)
                    if match:
                        result = {
                            'ok': int(match.group(1)),
                            'fail': int(match.group(2)),
                            'total': int(match.group(3)),
                            'errors': []
                        }
        
        # 清缓存
        try:
            data_loader.clear_cache()
        except Exception as e:
            print(f"[批量获取] 清缓存失败: {e}")
        
        return {
            "ok": True, 
            "summary": result, 
            "stdout": proc.stdout[-2000:] if len(proc.stdout) > 2000 else proc.stdout
        }
    except HTTPException:
        raise
    except subprocess.TimeoutExpired as e:
        print(f"[批量获取] 超时: {e}")
        raise HTTPException(status_code=500, detail="脚本执行超时（>1小时）")
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[批量获取] 异常: {error_trace}")
        raise HTTPException(status_code=500, detail=f"批量获取失败: {str(e)}")

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
        py_exec = get_python_executable()
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
        # 新数据生成后清空数据缓存，确保后续读取能命中新文件
        try:
            data_loader.clear_cache()
        except Exception:
            pass
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

@router.post("/screener/multi-macd")
async def screener_multi_macd(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    多周期MACD共振筛选：
    body: {
      timeframes?: ['5m','15m','1h','1d'],
      direction?: 'bull' | 'bear' | 'both',  // 默认 bull（全部>0）
      symbols?: string[],                    // 可选；不传时使用本地data中的CSV可用标的
      fast?: number, slow?: number, signal?: number
    }
    返回满足所有周期同向的股票清单（按最后一根K线判断趋势）。
    """
    try:
        timeframes = body.get('timeframes') or ['5m', '15m', '1h', '1d']
        direction = (body.get('direction') or 'bull').lower()
        fast = int(body.get('fast') or 12)
        slow = int(body.get('slow') or 26)
        signal = int(body.get('signal') or 9)

        # 候选标的
        if isinstance(body.get('symbols'), list) and body.get('symbols'):
            symbols = [str(x) for x in body['symbols'] if x]
        else:
            try:
                entries = data_loader.list_symbols()
                symbols = [str(e['symbol']) for e in entries if isinstance(e, dict) and e.get('kind') == 'stock' and e.get('symbol')]
            except Exception:
                symbols = []
        if not symbols:
            raise HTTPException(status_code=400, detail="没有可用的本地数据源或未提供 symbols")

        # 名称映射（可选）
        name_map: Dict[str, str] = {}
        try:
            project_root = Path(__file__).resolve().parents[3]
            with_industry = project_root / 'data' / 'stockList' / 'all_stock_with_industry.json'
            pure = project_root / 'data' / 'stockList' / 'all_pure_stock.json'
            data: list = []
            if with_industry.exists():
                data = json.loads(with_industry.read_text(encoding='utf-8'))
            elif pure.exists():
                data = json.loads(pure.read_text(encoding='utf-8'))
            for it in (data or []):
                try:
                    code = str(it.get('code') or '')
                    nm = str(it.get('code_name') or it.get('name') or '')
                    if code and nm:
                        name_map[code] = nm
                except Exception:
                    continue
        except Exception:
            pass
        # 兜底：用本地CSV文件名解析出的中文名补充映射
        try:
            entries = data_loader.list_symbols()
            for e in (entries or []):
                try:
                    if not isinstance(e, dict):
                        continue
                    if e.get('kind') != 'stock':
                        continue
                    code = str(e.get('symbol') or '')
                    nm = str(e.get('name') or '')
                    if code and nm and not name_map.get(code):
                        name_map[code] = nm
                except Exception:
                    continue
        except Exception:
            pass

        def macd_trend(df: pd.DataFrame) -> str:
            """
            判断MACD柱状图是否上升/下降（动能方向）
            - bull: 柱子上升（hist[-1] > hist[-2]），动能增强
            - bear: 柱子下降（hist[-1] < hist[-2]），动能减弱
            - neutral: 数据不足或持平
            """
            if df is None or df.empty or 'close' not in df.columns:
                return 'neutral'
            closes = pd.to_numeric(df['close'], errors='coerce')
            if len(closes) < max(slow, signal) + 2:  # 至少需要slow+2根K线
                return 'neutral'
            
            ema_fast = closes.ewm(span=fast, adjust=False).mean()
            ema_slow = closes.ewm(span=slow, adjust=False).mean()
            dif = ema_fast - ema_slow
            dea = dif.ewm(span=signal, adjust=False).mean()
            hist = dif - dea  # MACD柱状图
            
            if len(hist) < 2:
                return 'neutral'
            
            # 取最后两根柱子
            last_hist = hist.iloc[-1]
            prev_hist = hist.iloc[-2]
            
            if pd.isna(last_hist) or pd.isna(prev_hist):
                return 'neutral'
            
            # 判断柱子变化方向
            if last_hist > prev_hist:
                return 'bull'  # 柱子上升，动能增强
            elif last_hist < prev_hist:
                return 'bear'  # 柱子下降，动能减弱
            else:
                return 'neutral'  # 持平

        selected: List[Dict[str, Any]] = []
        errors: List[Dict[str, Any]] = []
        for sym in symbols:
            tf_results: Dict[str, str] = {}
            try:
                for tf in timeframes:
                    try:
                        df = load_stock_data(sym, tf)
                    except Exception as ee:
                        tf_results[tf] = 'error'
                        continue
                    tf_results[tf] = macd_trend(df)
                # 判定是否同向
                signs = [s for s in tf_results.values() if s in ('bull', 'bear')]
                if len(signs) != len(timeframes):
                    continue
                all_bull = all(s == 'bull' for s in signs)
                all_bear = all(s == 'bear' for s in signs)
                keep = False
                if direction == 'bull':
                    keep = all_bull
                elif direction == 'bear':
                    keep = all_bear
                else:
                    keep = (all_bull or all_bear)
                if keep:
                    selected.append({
                        "code": sym,
                        "name": name_map.get(sym) or sym,
                        "trends": tf_results
                    })
            except Exception as e:
                errors.append({"symbol": sym, "error": str(e)})
                continue

        return {
            "ok": True,
            "count": len(selected),
            "timeframes": timeframes,
            "direction": direction,
            "items": selected,
            "errors": errors
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"条件选股失败: {str(e)}")

@router.post("/screener/multi-macd-async")
async def start_screening_task_async(body: Dict[str, Any], background_tasks: BackgroundTasks) -> Dict[str, Any]:
    """
    异步启动多周期MACD共振筛选任务
    body: { timeframes, direction, fast, slow, signal, symbols? }
    返回: { ok: true, taskId: string }
    """
    task_id = str(uuid.uuid4())
    
    with tasks_lock:
        screening_tasks[task_id] = {
            "status": "running",  # running | completed | error
            "progress": {"processed": 0, "total": 0, "matched": 0, "current": ""},
            "results": [],
            "errors": [],
            "params": body,
            "created_at": datetime.now().isoformat()
        }
    
    # 后台执行筛选任务
    background_tasks.add_task(_run_screening_task, task_id, body)
    
    return {"ok": True, "taskId": task_id}

@router.get("/screener/status/{task_id}")
async def get_screening_task_status(task_id: str) -> Dict[str, Any]:
    """
    获取筛选任务状态与进度
    返回: { ok: true, task: {status, progress, results, errors} }
    """
    with tasks_lock:
        task = screening_tasks.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    
    return {"ok": True, "task": task}

def _run_screening_task(task_id: str, params: Dict[str, Any]):
    """
    后台执行筛选任务（同步函数，由BackgroundTasks调用）
    """
    try:
        timeframes = params.get('timeframes') or ['1d', '1w']
        direction = (params.get('direction') or 'bull').lower()
        fast = int(params.get('fast') or 12)
        slow = int(params.get('slow') or 26)
        signal_period = int(params.get('signal') or 9)
        limit = params.get('limit')  # 限制筛选数量
        enable_volume = bool(params.get('enableVolume', True))
        volume_period = int(params.get('volumePeriod') or 20)
        volume_ratio = float(params.get('volumeRatio') or 1.5)
        enable_position = bool(params.get('enablePosition', True))
        position_type = str(params.get('positionType') or 'bottom')  # bottom | early
        lookback_days = int(params.get('lookbackDays') or 60)
        price_threshold = float(params.get('priceThreshold') or 30)
        enable_ma = bool(params.get('enableMA', False))
        ma_short = int(params.get('maShort') or 20)
        ma_long = int(params.get('maLong') or 30)
        ma_relation = str(params.get('maRelation') or 'above')  # above | below
        
        # 候选标的
        if isinstance(params.get('symbols'), list) and params.get('symbols'):
            symbols = [str(x) for x in params['symbols'] if x]
        else:
            try:
                entries = data_loader.list_symbols()
                symbols = [str(e['symbol']) for e in entries if isinstance(e, dict) and e.get('kind') == 'stock' and e.get('symbol')]
            except Exception:
                symbols = []
        
        # 应用limit限制
        if limit and isinstance(limit, int) and limit > 0:
            symbols = symbols[:limit]
        
        if not symbols:
            with tasks_lock:
                screening_tasks[task_id]["status"] = "error"
                screening_tasks[task_id]["errors"] = [{"error": "没有可用的本地数据源"}]
            return
        
        # 更新总数
        with tasks_lock:
            screening_tasks[task_id]["progress"]["total"] = len(symbols)
        
        # 名称映射
        name_map: Dict[str, str] = {}
        try:
            project_root = Path(__file__).resolve().parents[3]
            with_industry = project_root / 'data' / 'stockList' / 'all_stock_with_industry.json'
            pure = project_root / 'data' / 'stockList' / 'all_pure_stock.json'
            data: list = []
            if with_industry.exists():
                data = json.loads(with_industry.read_text(encoding='utf-8'))
            elif pure.exists():
                data = json.loads(pure.read_text(encoding='utf-8'))
            for it in (data or []):
                try:
                    code_raw = str(it.get('code') or '')
                    # 提取纯6位代码
                    code = code_raw.split('.')[-1] if '.' in code_raw else code_raw
                    nm = str(it.get('code_name') or it.get('name') or '')
                    if code and nm:
                        name_map[code] = nm
                except Exception:
                    continue
        except Exception:
            pass
        
        # 兜底：用本地CSV文件名
        try:
            entries = data_loader.list_symbols()
            for e in (entries or []):
                try:
                    if not isinstance(e, dict) or e.get('kind') != 'stock':
                        continue
                    code = str(e.get('symbol') or '')
                    nm = str(e.get('name') or '')
                    if code and nm and not name_map.get(code):
                        name_map[code] = nm
                except Exception:
                    continue
        except Exception:
            pass
        
        def macd_trend(df: pd.DataFrame) -> str:
            """判断MACD柱状图是否上升/下降（优化版：只计算最后几根）"""
            if df is None or df.empty or 'close' not in df.columns:
                return 'neutral'
            closes = pd.to_numeric(df['close'], errors='coerce').dropna()
            if len(closes) < max(slow, signal_period) + 2:
                return 'neutral'
            
            # 只取最后 slow*3 根K线计算，减少计算量
            tail_len = min(len(closes), max(slow * 3, 100))
            closes_tail = closes.iloc[-tail_len:]
            
            ema_fast = closes_tail.ewm(span=fast, adjust=False).mean()
            ema_slow = closes_tail.ewm(span=slow, adjust=False).mean()
            dif = ema_fast - ema_slow
            dea = dif.ewm(span=signal_period, adjust=False).mean()
            hist = dif - dea
            
            if len(hist) < 2:
                return 'neutral'
            
            last_hist = hist.iloc[-1]
            prev_hist = hist.iloc[-2]
            
            if pd.isna(last_hist) or pd.isna(prev_hist):
                return 'neutral'
            
            if last_hist > prev_hist:
                return 'bull'
            elif last_hist < prev_hist:
                return 'bear'
            else:
                return 'neutral'
        
        # 逐只筛选
        selected: List[Dict[str, Any]] = []
        errors: List[Dict[str, Any]] = []
        processed = 0
        
        for sym in symbols:
            # 更新当前处理的股票
            with tasks_lock:
                screening_tasks[task_id]["progress"]["current"] = sym
            
            tf_results: Dict[str, str] = {}
            daily_df = None  # 保存日线数据用于放量判断
            try:
                for tf in timeframes:
                    try:
                        df = load_stock_data(sym, tf)
                        if tf == '1d':
                            daily_df = df  # 保存日线数据
                    except Exception:
                        tf_results[tf] = 'error'
                        continue
                    tf_results[tf] = macd_trend(df)
                
                # 判定是否同向
                signs = [s for s in tf_results.values() if s in ('bull', 'bear')]
                if len(signs) != len(timeframes):
                    processed += 1
                    continue
                
                all_bull = all(s == 'bull' for s in signs)
                all_bear = all(s == 'bear' for s in signs)
                keep = False
                if direction == 'bull':
                    keep = all_bull
                elif direction == 'bear':
                    keep = all_bear
                else:
                    keep = (all_bull or all_bear)
                
                # 放量筛选（仅在日线数据上判断）
                volume_ok = True
                last_volume = None
                avg_volume = None
                if keep and enable_volume and daily_df is not None and not daily_df.empty:
                    try:
                        volumes = pd.to_numeric(daily_df['volume'], errors='coerce').dropna()
                        if len(volumes) >= volume_period + 1:
                            last_volume = volumes.iloc[-1]
                            avg_volume = volumes.iloc[-(volume_period+1):-1].mean()
                            if pd.notna(last_volume) and pd.notna(avg_volume) and avg_volume > 0:
                                volume_ok = (last_volume >= avg_volume * volume_ratio)
                            else:
                                volume_ok = False
                        else:
                            volume_ok = False  # 数据不足，不满足放量条件
                    except Exception:
                        volume_ok = False
                
                # 均线筛选（仅在日线数据上判断）
                ma_ok = True
                ma_short_value = None
                ma_long_value = None
                if keep and volume_ok and enable_ma and daily_df is not None and not daily_df.empty:
                    try:
                        closes = pd.to_numeric(daily_df['close'], errors='coerce').dropna()
                        max_ma = max(ma_short, ma_long)
                        if len(closes) >= max_ma:
                            # 计算均线
                            ma_short_series = closes.rolling(window=ma_short).mean()
                            ma_long_series = closes.rolling(window=ma_long).mean()
                            
                            ma_short_value = ma_short_series.iloc[-1]
                            ma_long_value = ma_long_series.iloc[-1]
                            
                            if pd.notna(ma_short_value) and pd.notna(ma_long_value):
                                if ma_relation == 'above':
                                    ma_ok = (ma_short_value > ma_long_value)
                                elif ma_relation == 'below':
                                    ma_ok = (ma_short_value < ma_long_value)
                                else:
                                    ma_ok = True
                            else:
                                ma_ok = False
                        else:
                            ma_ok = False  # 数据不足
                    except Exception:
                        ma_ok = False
                
                # 位置筛选（仅在日线数据上判断）
                position_ok = True
                price_percentile = None
                current_price = None
                min_price = None
                max_price = None
                if keep and volume_ok and ma_ok and enable_position and daily_df is not None and not daily_df.empty:
                    try:
                        closes = pd.to_numeric(daily_df['close'], errors='coerce').dropna()
                        if len(closes) >= lookback_days + 1:
                            recent_closes = closes.iloc[-lookback_days:]
                            current_price = closes.iloc[-1]
                            min_price = recent_closes.min()
                            max_price = recent_closes.max()
                            
                            if pd.notna(current_price) and pd.notna(min_price) and pd.notna(max_price) and max_price > min_price:
                                # 计算当前价格在区间中的位置（0-100%）
                                price_percentile = ((current_price - min_price) / (max_price - min_price)) * 100
                                
                                if position_type == 'bottom':
                                    # 底部启动：价格在前30%区间（刚脱离底部）
                                    position_ok = (price_percentile <= price_threshold)
                                elif position_type == 'early':
                                    # 主升浪初期：价格在30%-60%区间（避开高位）
                                    position_ok = (price_threshold <= price_percentile <= 60)
                                else:
                                    position_ok = True
                            else:
                                position_ok = False
                        else:
                            position_ok = False  # 数据不足
                    except Exception:
                        position_ok = False
                
                if keep and volume_ok and ma_ok and position_ok:
                    result_item = {
                        "code": sym,
                        "name": name_map.get(sym) or sym,
                        "directions": tf_results,
                        "volumeInfo": {
                            "last": round(float(last_volume), 2) if pd.notna(last_volume) else None,
                            "avg": round(float(avg_volume), 2) if pd.notna(avg_volume) else None,
                            "ratio": round(float(last_volume / avg_volume), 2) if (pd.notna(last_volume) and pd.notna(avg_volume) and avg_volume > 0) else None
                        } if enable_volume else None,
                        "maInfo": {
                            "short": ma_short,
                            "long": ma_long,
                            "maShort": round(float(ma_short_value), 2) if pd.notna(ma_short_value) else None,
                            "maLong": round(float(ma_long_value), 2) if pd.notna(ma_long_value) else None,
                            "relation": ma_relation
                        } if enable_ma else None,
                        "positionInfo": {
                            "percentile": round(float(price_percentile), 2) if pd.notna(price_percentile) else None,
                            "currentPrice": round(float(current_price), 2) if pd.notna(current_price) else None,
                            "minPrice": round(float(min_price), 2) if pd.notna(min_price) else None,
                            "maxPrice": round(float(max_price), 2) if pd.notna(max_price) else None,
                            "type": position_type
                        } if enable_position else None
                    }
                    selected.append(result_item)
                    # 实时更新结果
                    with tasks_lock:
                        screening_tasks[task_id]["results"].append(result_item)
                        screening_tasks[task_id]["progress"]["matched"] = len(selected)
            
            except Exception as e:
                errors.append({"symbol": sym, "error": str(e)})
            
            processed += 1
            # 更新进度
            with tasks_lock:
                screening_tasks[task_id]["progress"]["processed"] = processed
        
        # 任务完成
        with tasks_lock:
            screening_tasks[task_id]["status"] = "completed"
            screening_tasks[task_id]["errors"] = errors[:100]
    
    except Exception as e:
        with tasks_lock:
            screening_tasks[task_id]["status"] = "error"
            screening_tasks[task_id]["errors"] = [{"error": str(e)}]

@router.post("/screener/export-csv")
async def export_screening_results_to_csv(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    导出筛选结果为CSV文件
    body: { results: [...], direction?: string, fast?: int, slow?: int, signal?: int }
    返回: { ok: bool, filepath: str, filename: str }
    """
    try:
        results = body.get('results', [])
        if not isinstance(results, list) or len(results) == 0:
            raise HTTPException(status_code=400, detail="筛选结果为空")
        
        # 获取筛选参数（用于文件名）
        direction = body.get('direction', 'bull')
        fast = body.get('fast', 12)
        slow = body.get('slow', 26)
        signal = body.get('signal', 9)
        
        # 定位项目根目录
        here = Path(__file__).resolve()
        project_root = here.parents[3] if len(here.parents) >= 4 else here.parent
        
        # 创建筛选结果目录
        output_dir = project_root / 'data' / 'screening_results'
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # 生成文件名：screening_日期_数量只.csv
        date_str = datetime.now().strftime('%Y%m%d')
        count = len(results)
        filename = f"screening_{date_str}_{count}只.csv"
        filepath = output_dir / filename
        
        # 如果文件已存在，添加时间戳
        if filepath.exists():
            time_str = datetime.now().strftime('%H%M%S')
            filename = f"screening_{date_str}_{time_str}_{count}只.csv"
            filepath = output_dir / filename
        
        # 准备CSV数据
        csv_rows = []
        for r in results:
            # 股票代码使用等号格式，确保Excel将其识别为文本格式（保留前导0）
            code = str(r.get('code', ''))
            code_formatted = f'="{code}"' if code else ''
            
            row = {
                '股票代码': code_formatted,
                '股票名称': r.get('name', ''),
                '日线MACD方向': r.get('directions', {}).get('1d', 'neutral'),
                '周线MACD方向': r.get('directions', {}).get('1w', 'neutral'),
            }
            
            # 添加放量信息
            if r.get('volumeInfo'):
                vol_info = r['volumeInfo']
                ratio = vol_info.get('ratio')
                row['放量倍数'] = f"{ratio:.2f}" if ratio is not None else ''
                last = vol_info.get('last')
                row['最后一天成交量'] = f"{last:.2f}" if last is not None else ''
                avg = vol_info.get('avg')
                row['均量'] = f"{avg:.2f}" if avg is not None else ''
            else:
                row['放量倍数'] = ''
                row['最后一天成交量'] = ''
                row['均量'] = ''
            
            # 添加均线信息
            if r.get('maInfo'):
                ma_info = r['maInfo']
                row['短期均线周期'] = ma_info.get('short', '')
                row['长期均线周期'] = ma_info.get('long', '')
                ma_short_val = ma_info.get('maShort')
                row['短期均线值'] = f"{ma_short_val:.2f}" if ma_short_val is not None else ''
                ma_long_val = ma_info.get('maLong')
                row['长期均线值'] = f"{ma_long_val:.2f}" if ma_long_val is not None else ''
                row['均线关系'] = '上方' if ma_info.get('relation') == 'above' else '下方'
            else:
                row['短期均线周期'] = ''
                row['长期均线周期'] = ''
                row['短期均线值'] = ''
                row['长期均线值'] = ''
                row['均线关系'] = ''
            
            # 添加位置信息
            if r.get('positionInfo'):
                pos_info = r['positionInfo']
                percentile = pos_info.get('percentile')
                row['价格位置百分位'] = f"{percentile:.2f}" if percentile is not None else ''
                current_price = pos_info.get('currentPrice')
                row['当前价格'] = f"{current_price:.2f}" if current_price is not None else ''
                min_price = pos_info.get('minPrice')
                row['最低价'] = f"{min_price:.2f}" if min_price is not None else ''
                max_price = pos_info.get('maxPrice')
                row['最高价'] = f"{max_price:.2f}" if max_price is not None else ''
            else:
                row['价格位置百分位'] = ''
                row['当前价格'] = ''
                row['最低价'] = ''
                row['最高价'] = ''
            
            csv_rows.append(row)
        
        # 写入CSV
        if csv_rows:
            fieldnames = list(csv_rows[0].keys())
            with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:  # utf-8-sig 支持Excel打开
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(csv_rows)
        
        # 返回相对路径（相对于项目根）
        relative_path = filepath.relative_to(project_root)
        
        return {
            "ok": True,
            "filepath": str(relative_path),
            "filename": filename,
            "count": count,
            "message": f"已导出 {count} 条筛选结果到 {filename}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出CSV失败: {str(e)}")

@router.post("/price-trend/analyze")
async def analyze_price_trend(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    分析股票价格走势（最近5天）
    body: { 
        symbols: string[]  # 股票代码列表，如 ["000560", "300896"]
        csvFile?: string   # 可选：CSV文件路径（相对于项目根）
    }
    返回: {
        ok: true,
        results: [
            {
                symbol: "000560",
                name: "股票名称",
                days: [
                    { day: 1, date: "2024-11-20", close: 3.07, change: 0.05, changePercent: 1.66 },
                    { day: 2, date: "2024-11-21", close: 3.10, change: 0.08, changePercent: 2.65 },
                    ...
                ],
                basePrice: 3.02  # 5天前的价格
            }
        ]
    }
    """
    try:
        symbols = body.get('symbols', [])
        csv_file = body.get('csvFile')
        
        # 如果提供了CSV文件，从中读取股票代码
        if csv_file:
            try:
                project_root = Path(__file__).resolve().parents[3]
                csv_path = project_root / csv_file
                
                if not csv_path.exists():
                    raise HTTPException(status_code=404, detail=f"CSV文件不存在: {csv_file}")
                
                # 读取CSV文件，提取股票代码
                with open(csv_path, 'r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    csv_symbols = []
                    for row in reader:
                        # 尝试从不同字段名获取代码
                        code = row.get('股票代码') or row.get('code') or row.get('Code') or ''
                        # 移除可能的等号格式
                        code = code.strip().lstrip('="').rstrip('"')
                        if code and code not in csv_symbols:
                            csv_symbols.append(code)
                    symbols.extend(csv_symbols)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"读取CSV文件失败: {str(e)}")
        
        if not symbols or len(symbols) == 0:
            raise HTTPException(status_code=400, detail="未提供股票代码")
        
        # 去重
        symbols = list(set(symbols))
        
        results = []
        errors = []
        
        for symbol in symbols:
            try:
                # 加载股票数据（日线）
                df = load_stock_data(symbol, '1d')
                
                if df is None or df.empty:
                    errors.append({"symbol": symbol, "error": "数据为空"})
                    continue
                
                # 确保数据按时间排序（最新的在前）
                time_col = 'timestamp' if 'timestamp' in df.columns else ('datetime' if 'datetime' in df.columns else None)
                if time_col:
                    df = df.sort_values(time_col, ascending=False).reset_index(drop=True)
                else:
                    # 如果没有时间列，假设数据已经是倒序的
                    df = df.reset_index(drop=True)
                
                # 需要至少6天数据（5天 + 1天基准）
                if len(df) < 6:
                    errors.append({"symbol": symbol, "error": f"数据不足6天，只有{len(df)}天（需要至少6天：5天走势 + 1天基准）"})
                    continue
                
                # 获取最近5天的数据（第0-4行，最新的5天）
                recent_5_days = df.head(5).copy()
                
                # 获取5天前的价格（第5行的收盘价，即第6天的数据）
                base_price = float(df.iloc[5]['close']) if pd.notna(df.iloc[5]['close']) else None
                
                if base_price is None:
                    errors.append({"symbol": symbol, "error": "无法获取基准价格"})
                    continue
                
                # 构建每日数据（从旧到新：第1天是最旧的，第5天是最新的）
                # recent_5_days是按时间倒序的：iloc[0]是最新，iloc[4]是最旧
                days_data = []
                for idx in range(len(recent_5_days)):
                    # idx=0是最新的，idx=4是最旧的
                    row = recent_5_days.iloc[idx]
                    # day_num：idx=4对应第1天（最旧），idx=0对应第5天（最新）
                    day_num = len(recent_5_days) - idx  # 第1天到第5天（第1天最旧，第5天最新）
                    close_price = float(row['close']) if pd.notna(row['close']) else None
                    
                    if close_price is None:
                        continue
                    
                    # 计算与基准价格的差值（总体涨跌）
                    change = round(close_price - base_price, 2)
                    change_percent = round((change / base_price * 100), 2) if base_price > 0 else 0
                    
                    # 计算当天涨跌（相对于前一天）
                    # 前一天是idx+1（更早的日期）
                    daily_change = None
                    daily_change_percent = None
                    if idx < len(recent_5_days) - 1:
                        # 有前一天数据（idx+1对应更早的日期，即前一天）
                        prev_close = float(recent_5_days.iloc[idx + 1]['close']) if pd.notna(recent_5_days.iloc[idx + 1]['close']) else None
                        if prev_close is not None:
                            daily_change = round(close_price - prev_close, 2)
                            daily_change_percent = round((daily_change / prev_close * 100), 2) if prev_close > 0 else 0
                    else:
                        # 第5天（最旧，idx=4），与基准价格（第6天）对比
                        daily_change = round(close_price - base_price, 2)
                        daily_change_percent = round((daily_change / base_price * 100), 2) if base_price > 0 else 0
                    
                    # 获取日期
                    date_str = ''
                    if 'timestamp' in row:
                        ts = row['timestamp']
                        if isinstance(ts, pd.Timestamp):
                            date_str = ts.strftime('%Y-%m-%d')
                        else:
                            date_str = str(ts).split()[0] if ' ' in str(ts) else str(ts)
                    elif 'datetime' in row:
                        dt = row['datetime']
                        if isinstance(dt, pd.Timestamp):
                            date_str = dt.strftime('%Y-%m-%d')
                        else:
                            date_str = str(dt).split()[0] if ' ' in str(dt) else str(dt)
                    
                    days_data.append({
                        "day": day_num,
                        "date": date_str,
                        "close": round(close_price, 2),
                        "change": change,
                        "changePercent": change_percent,
                        "dailyChange": daily_change,
                        "dailyChangePercent": daily_change_percent
                    })
                
                # 反转数组，使第1天（最旧）在前，第5天（最新）在后
                days_data.reverse()
                
                # 获取股票名称
                stock_name = symbol
                try:
                    entries = data_loader.list_symbols()
                    for e in entries:
                        if isinstance(e, dict) and e.get('symbol') == symbol:
                            stock_name = e.get('name', symbol)
                            break
                except Exception:
                    pass
                
                results.append({
                    "symbol": symbol,
                    "name": stock_name,
                    "days": days_data,
                    "basePrice": round(base_price, 2)
                })
                
            except FileNotFoundError:
                errors.append({"symbol": symbol, "error": "数据文件不存在"})
            except Exception as e:
                errors.append({"symbol": symbol, "error": str(e)})
        
        return {
            "ok": True,
            "results": results,
            "errors": errors,
            "total": len(symbols),
            "success": len(results),
            "failed": len(errors)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析价格走势失败: {str(e)}")

