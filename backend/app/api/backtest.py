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

@router.post("/data/split-stocks")
async def split_stocks_files_api() -> Dict[str, Any]:
    """
    切分现有的stocks文件到10个子目录
    每个子目录最多500个文件
    """
    try:
        # 定位脚本路径
        here = Path(__file__).resolve()
        candidate_roots = [
            here.parents[3] if len(here.parents) >= 4 else here.parent,
            here.parents[2] if len(here.parents) >= 3 else here.parent,
        ]
        script_path = None
        project_root = None
        for root in candidate_roots:
            cand = root / 'scripts' / 'split_stocks_files.py'
            if cand.exists():
                script_path = cand
                project_root = root
                break
        
        if script_path is None:
            raise HTTPException(status_code=404, detail="切分脚本不存在")
        
        # 执行脚本
        py_exec = get_python_executable()
        cmd = [py_exec, str(script_path)]
        
        print(f"[切分文件] 执行命令: {' '.join(cmd)}")
        print(f"[切分文件] 工作目录: {project_root}")
        
        proc = subprocess.run(
            cmd,
            cwd=str(project_root),
            capture_output=True,
            text=True,
            timeout=600,
            encoding='utf-8',
            errors='replace'
        )
        
        if proc.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"切分失败: {proc.stderr or proc.stdout}"
            )
        
        return {
            "ok": True,
            "stdout": proc.stdout,
            "message": "文件切分完成"
        }
        
    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="切分操作超时")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"切分失败: {str(e)}")

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
        # 从当前文件向上查找项目根目录（包含 scripts 目录的目录）
        # backtest.py 在 backend/app/api/ 下，项目根目录应该是 here.parents[3]
        script_path = None
        project_root = None
        for i in range(min(5, len(here.parents))):
            root = here.parents[i]
            cand = root / 'scripts' / 'batchFetchDailyData.py'
            if cand.exists():
                script_path = cand
                project_root = root
                break
        
        if script_path is None:
            # 如果没找到，尝试所有可能的路径
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
        print(f"[批量获取] Python可执行文件: {py_exec}")
        print(f"[批量获取] 脚本路径: {script_path}")
        print(f"[批量获取] 脚本是否存在: {script_path.exists()}")
        
        try:
            # 设置环境变量，强制使用UTF-8编码
            import os
            env = os.environ.copy()
            env['PYTHONIOENCODING'] = 'utf-8'
            env['PYTHONUTF8'] = '1'
            
            # 先使用 bytes 模式捕获输出，然后尝试多种编码解码
            proc = subprocess.run(
                cmd, 
                cwd=str(project_root), 
                capture_output=True, 
                timeout=3600,
                env=env  # 传递环境变量，强制使用UTF-8
            )
            
            # 尝试多种编码解码输出
            def decode_output(data: bytes) -> str:
                if not data:
                    return ''
                # 尝试的编码顺序：UTF-8, GBK, GB2312, latin1
                encodings = ['utf-8', 'gbk', 'gb2312', 'latin1']
                for enc in encodings:
                    try:
                        return data.decode(enc, errors='replace')
                    except:
                        continue
                # 如果都失败，使用 errors='replace' 强制解码
                return data.decode('utf-8', errors='replace')
            
            # 解码 stdout 和 stderr
            proc.stdout_decoded = decode_output(proc.stdout)
            proc.stderr_decoded = decode_output(proc.stderr)
            # 为了兼容后续代码，设置 stdout 和 stderr 属性
            proc.stdout = proc.stdout_decoded
            proc.stderr = proc.stderr_decoded
        except subprocess.TimeoutExpired:
            print(f"[批量获取] 脚本执行超时（>1小时）")
            raise HTTPException(status_code=500, detail="脚本执行超时（>1小时）")
        except Exception as e:
            import traceback
            import re
            error_trace = traceback.format_exc()
            print(f"[批量获取] 执行脚本时发生异常: {error_trace}")
            error_msg = str(e)
            # 清理错误信息，确保UTF-8编码
            try:
                cleaned_msg = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f-\x9f]', '', error_msg)
                cleaned_msg = cleaned_msg.encode('utf-8', errors='replace').decode('utf-8')
                error_msg = cleaned_msg
            except:
                pass
            raise HTTPException(status_code=500, detail=f"执行脚本时发生异常: {error_msg}")
        
        print(f"[批量获取] 返回码: {proc.returncode}")
        print(f"[批量获取] stdout长度: {len(proc.stdout)}")
        print(f"[批量获取] stderr长度: {len(proc.stderr)}")
        
        if proc.returncode != 0:
            error_msg = proc.stderr or proc.stdout or "未知错误"
            print(f"[批量获取] 错误输出 (stderr): {proc.stderr[:1000] if proc.stderr else 'N/A'}")
            print(f"[批量获取] 错误输出 (stdout): {proc.stdout[:1000] if proc.stdout else 'N/A'}")
            # 尝试提取更详细的错误信息
            full_error = (proc.stderr or '') + '\n' + (proc.stdout or '')
            # 清理错误信息：移除控制字符，确保UTF-8编码
            import re
            # 移除控制字符（除了换行符和制表符）
            cleaned_error = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f-\x9f]', '', full_error)
            # 确保是有效的UTF-8字符串
            try:
                cleaned_error = cleaned_error.encode('utf-8', errors='replace').decode('utf-8')
            except:
                cleaned_error = full_error.encode('utf-8', errors='replace').decode('utf-8')
            error_preview = cleaned_error[:2000] if len(cleaned_error) > 2000 else cleaned_error
            raise HTTPException(
                status_code=500, 
                detail=f"脚本执行失败 (返回码: {proc.returncode}): {error_preview}"
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
    except Exception as e:
        import traceback
        import re
        error_trace = traceback.format_exc()
        print(f"[批量获取] 异常: {error_trace}")
        error_msg = str(e)
        # 如果是超时异常，提供更友好的错误信息
        if isinstance(e, subprocess.TimeoutExpired):
            error_msg = "脚本执行超时（>1小时）"
        # 清理错误信息，确保UTF-8编码
        try:
            # 移除控制字符（除了换行符和制表符）
            cleaned_msg = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f-\x9f]', '', error_msg)
            cleaned_msg = cleaned_msg.encode('utf-8', errors='replace').decode('utf-8')
            error_msg = cleaned_msg
        except:
            pass
        raise HTTPException(status_code=500, detail=f"批量获取失败: {error_msg}")

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
        end_date = body.get('endDate')  # 数据截止日期（YYYY-MM-DD），None表示使用全部数据

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
                        df = load_stock_data(sym, tf, end_date=end_date)
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
    try:
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
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[multi-macd-async] 异常: {error_trace}")
        raise HTTPException(status_code=500, detail=f"启动筛选任务失败: {str(e)}")

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
        enable_daily_macd_positive = bool(params.get('enableDailyMacdPositive', False))  # 日线MACD>0
        enable_weekly_macd_positive = bool(params.get('enableWeeklyMacdPositive', False))  # 周线MACD>0
        enable_price_above_ma = bool(params.get('enablePriceAboveMA', False))  # 价格大于MA
        price_above_ma_period = int(params.get('priceAboveMAPeriod') or 60)  # 价格大于MA的周期
        enable_first_rise_phase = bool(params.get('enableFirstRisePhase', False))  # 第一次主升段筛选
        end_date = params.get('endDate')  # 数据截止日期（YYYY-MM-DD），None表示使用全部数据
        
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
        
        def get_macd_dif(df: pd.DataFrame) -> float:
            """获取MACD的DIF值（快线-慢线），用于判断MACD>0"""
            if df is None or df.empty or 'close' not in df.columns:
                return None
            closes = pd.to_numeric(df['close'], errors='coerce').dropna()
            if len(closes) < max(slow, signal_period):
                return None
            
            # 只取最后 slow*3 根K线计算，减少计算量
            tail_len = min(len(closes), max(slow * 3, 100))
            closes_tail = closes.iloc[-tail_len:]
            
            ema_fast = closes_tail.ewm(span=fast, adjust=False).mean()
            ema_slow = closes_tail.ewm(span=slow, adjust=False).mean()
            dif = ema_fast - ema_slow
            
            if len(dif) == 0:
                return None
            
            last_dif = dif.iloc[-1]
            return float(last_dif) if pd.notna(last_dif) else None
        
        def get_macd_hist(df: pd.DataFrame) -> float:
            """获取MACD柱状图值（hist = DIF - DEA），用于判断MACD柱状图是否为红色（>0）"""
            if df is None or df.empty or 'close' not in df.columns:
                return None
            closes = pd.to_numeric(df['close'], errors='coerce').dropna()
            if len(closes) < max(slow, signal_period) + 1:
                return None
            
            # 只取最后 slow*3 根K线计算，减少计算量
            tail_len = min(len(closes), max(slow * 3, 100))
            closes_tail = closes.iloc[-tail_len:]
            
            ema_fast = closes_tail.ewm(span=fast, adjust=False).mean()
            ema_slow = closes_tail.ewm(span=slow, adjust=False).mean()
            dif = ema_fast - ema_slow
            dea = dif.ewm(span=signal_period, adjust=False).mean()
            hist = dif - dea  # MACD柱状图
            
            if len(hist) == 0:
                return None
            
            last_hist = hist.iloc[-1]
            return float(last_hist) if pd.notna(last_hist) else None
        
        def check_first_rise_phase(df: pd.DataFrame) -> bool:
            """
            检查是否满足第一次主升段条件（严格模式）：
            红色柱子向上突破零轴后，每个柱子都是变高的，没有任何回撤
            """
            if df is None or df.empty or 'close' not in df.columns:
                return False
            
            closes = pd.to_numeric(df['close'], errors='coerce').dropna()
            if len(closes) < max(slow, signal_period) + 5:  # 至少需要足够的数据
                return False
            
            # 计算MACD柱状图
            ema_fast = closes.ewm(span=fast, adjust=False).mean()
            ema_slow = closes.ewm(span=slow, adjust=False).mean()
            dif = ema_fast - ema_slow
            dea = dif.ewm(span=signal_period, adjust=False).mean()
            hist = dif - dea  # MACD柱状图
            
            # 清理NaN值
            hist = hist.dropna()
            if len(hist) < 3:
                return False
            
            # 从后往前找，找到最近一次从负转正的位置（绿转红，突破零轴）
            # 需要找到：hist[i] <= 0 且 hist[i+1] > 0 的位置
            turn_red_idx = None
            for i in range(len(hist) - 2, -1, -1):
                if hist.iloc[i] <= 0 and hist.iloc[i + 1] > 0:
                    turn_red_idx = i + 1
                    break
            
            # 如果没有找到绿转红的位置，不符合条件
            if turn_red_idx is None:
                return False
            
            # 检查转红后是否每个柱子都是变高的（严格：不允许任何回撤）
            # 从转红位置到最新，每个柱子的值都必须 >= 前一个柱子
            red_phase_hist = hist.iloc[turn_red_idx:]
            
            if len(red_phase_hist) < 2:
                return False
            
            # 严格检查：每个柱子都必须 >= 前一个柱子（不允许任何减小）
            for i in range(1, len(red_phase_hist)):
                current_hist = red_phase_hist.iloc[i]
                prev_hist = red_phase_hist.iloc[i - 1]
                
                # 如果当前柱子比前一个柱子小（有任何回撤），不符合条件
                if current_hist < prev_hist:
                    return False
            
            # 所有检查通过：转红后每个柱子都是变高的，没有任何回撤
            return True
        
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
            weekly_df = None  # 保存周线数据用于MACD值判断
            try:
                for tf in timeframes:
                    try:
                        df = load_stock_data(sym, tf, end_date=end_date)
                        if tf == '1d':
                            daily_df = df  # 保存日线数据
                        elif tf == '1w':
                            weekly_df = df  # 保存周线数据
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
                # 不再支持 'both' 方向
                
                # MACD值筛选（日线和周线MACD>0）
                if keep:
                    # 检查日线MACD>0（柱状图为红色，即hist>0）
                    if enable_daily_macd_positive:
                        if daily_df is None or daily_df.empty:
                            keep = False
                        else:
                            daily_hist = get_macd_hist(daily_df)
                            if daily_hist is None or daily_hist <= 0:
                                keep = False
                    
                    # 检查周线MACD>0（柱状图为红色，即hist>0）
                    if keep and enable_weekly_macd_positive:
                        if weekly_df is None or weekly_df.empty:
                            keep = False
                            print(f"[周线MACD>0] {sym}: 周线数据为空或加载失败")
                        else:
                            weekly_hist = get_macd_hist(weekly_df)
                            if weekly_hist is None:
                                keep = False
                                print(f"[周线MACD>0] {sym}: 周线MACD柱状图计算失败（数据不足）")
                            elif weekly_hist <= 0:
                                keep = False
                                print(f"[周线MACD>0] {sym}: 周线MACD柱状图={weekly_hist:.4f} <= 0（绿柱），不符合条件")
                            else:
                                print(f"[周线MACD>0] {sym}: 周线MACD柱状图={weekly_hist:.4f} > 0（红柱），符合条件")
                    
                    # 检查第一次主升段
                    if keep and enable_first_rise_phase:
                        if daily_df is None or daily_df.empty:
                            keep = False
                        else:
                            if not check_first_rise_phase(daily_df):
                                keep = False
                
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
                
                # 价格大于MA筛选（仅在日线数据上判断）
                price_above_ma_ok = True
                if keep and volume_ok and ma_ok and enable_price_above_ma and daily_df is not None and not daily_df.empty:
                    try:
                        closes = pd.to_numeric(daily_df['close'], errors='coerce').dropna()
                        if len(closes) >= price_above_ma_period:
                            # 找到截止日期对应的数据
                            if end_date:
                                try:
                                    end_dt = pd.to_datetime(end_date)
                                    daily_df['date'] = pd.to_datetime(daily_df['timestamp']).dt.date
                                    end_date_only = end_dt.date()
                                    # 找到截止日期及之前的最后一条记录
                                    filtered_df = daily_df[daily_df['date'] <= end_date_only]
                                    if not filtered_df.empty:
                                        # 使用截止日期及之前的数据计算MA
                                        closes_for_ma = pd.to_numeric(filtered_df['close'], errors='coerce').dropna()
                                        if len(closes_for_ma) >= price_above_ma_period:
                                            ma_value = closes_for_ma.iloc[-price_above_ma_period:].mean()
                                            current_price = closes_for_ma.iloc[-1]
                                            if pd.notna(ma_value) and pd.notna(current_price):
                                                price_above_ma_ok = (current_price > ma_value)
                                            else:
                                                price_above_ma_ok = False
                                        else:
                                            price_above_ma_ok = False  # 数据不足
                                    else:
                                        price_above_ma_ok = False  # 找不到截止日期的数据
                                except Exception:
                                    # 如果日期解析失败，使用最后一条数据
                                    ma_value = closes.iloc[-price_above_ma_period:].mean()
                                    current_price = closes.iloc[-1]
                                    if pd.notna(ma_value) and pd.notna(current_price):
                                        price_above_ma_ok = (current_price > ma_value)
                                    else:
                                        price_above_ma_ok = False
                            else:
                                # 没有截止日期，使用最后一条数据
                                ma_value = closes.iloc[-price_above_ma_period:].mean()
                                current_price = closes.iloc[-1]
                                if pd.notna(ma_value) and pd.notna(current_price):
                                    price_above_ma_ok = (current_price > ma_value)
                                else:
                                    price_above_ma_ok = False
                        else:
                            price_above_ma_ok = False  # 数据不足
                    except Exception:
                        price_above_ma_ok = False
                
                # 位置筛选（仅在日线数据上判断）
                position_ok = True
                price_percentile = None
                position_current_price = None
                min_price = None
                max_price = None
                if keep and volume_ok and ma_ok and price_above_ma_ok and enable_position and daily_df is not None and not daily_df.empty:
                    try:
                        closes = pd.to_numeric(daily_df['close'], errors='coerce').dropna()
                        if len(closes) >= lookback_days + 1:
                            recent_closes = closes.iloc[-lookback_days:]
                            position_current_price = closes.iloc[-1]
                            min_price = recent_closes.min()
                            max_price = recent_closes.max()
                            
                            if pd.notna(position_current_price) and pd.notna(min_price) and pd.notna(max_price) and max_price > min_price:
                                # 计算当前价格在区间中的位置（0-100%）
                                price_percentile = ((position_current_price - min_price) / (max_price - min_price)) * 100
                                
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
                
                if keep and volume_ok and ma_ok and price_above_ma_ok and position_ok:
                    # 计算最新价格、日MACD、周MACD
                    latest_price = None
                    daily_macd_value = None
                    weekly_macd_value = None
                    
                    # 获取最新价格（截止日期当天的收盘价，如果没有截止日期则用最后一条）
                    if daily_df is not None and not daily_df.empty:
                        try:
                            closes = pd.to_numeric(daily_df['close'], errors='coerce').dropna()
                            if len(closes) > 0:
                                if end_date:
                                    try:
                                        end_dt = pd.to_datetime(end_date)
                                        daily_df['date'] = pd.to_datetime(daily_df['timestamp']).dt.date
                                        end_date_only = end_dt.date()
                                        filtered_df = daily_df[daily_df['date'] <= end_date_only]
                                        if not filtered_df.empty:
                                            latest_price = float(pd.to_numeric(filtered_df.iloc[-1]['close'], errors='coerce'))
                                    except Exception:
                                        latest_price = float(closes.iloc[-1])
                                else:
                                    latest_price = float(closes.iloc[-1])
                        except Exception:
                            pass
                    
                    # 计算日MACD值
                    if daily_df is not None and not daily_df.empty:
                        daily_macd_value = get_macd_dif(daily_df)
                        if daily_macd_value is not None:
                            daily_macd_value = round(daily_macd_value, 4)
                    
                    # 计算周MACD值
                    if weekly_df is not None and not weekly_df.empty:
                        weekly_macd_value = get_macd_dif(weekly_df)
                        if weekly_macd_value is not None:
                            weekly_macd_value = round(weekly_macd_value, 4)
                    
                    result_item = {
                        "code": sym,
                        "name": name_map.get(sym) or sym,
                        "directions": tf_results,
                        "latestPrice": latest_price,
                        "dailyMacd": daily_macd_value,
                        "weeklyMacd": weekly_macd_value,
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
                            "currentPrice": round(float(position_current_price), 2) if pd.notna(position_current_price) else None,
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
        
        # 计算每只股票第一到第五天的涨跌幅，并计算平均值
        summary_stats = None
        if selected and end_date:
            try:
                end_dt = pd.to_datetime(end_date).normalize()
                day_returns = {1: [], 2: [], 3: [], 4: [], 5: []}  # 存储每只股票各天的涨跌幅
                day1_rise_count = 0  # 第一天涨的股票数量
                day2_rise_count = 0  # 前两天都涨的股票数量
                
                for item in selected:
                    sym = item.get('code')
                    if not sym:
                        continue
                    
                    try:
                        # 加载日线数据（不限制截止日期，需要获取截止日期之后的数据）
                        df_full = load_stock_data(sym, '1d', end_date=None)
                        if df_full is None or df_full.empty:
                            continue
                        
                        # 找到截止日期对应的K线位置
                        df_full['date'] = pd.to_datetime(df_full['timestamp']).dt.date
                        end_date_only = end_dt.date()
                        
                        # 找到截止日期及之前的最后一条记录作为基准
                        base_df = df_full[df_full['date'] <= end_date_only]
                        if base_df.empty:
                            continue
                        
                        base_idx = base_df.index[-1]
                        base_price = pd.to_numeric(base_df.iloc[-1]['close'], errors='coerce')
                        if pd.isna(base_price) or base_price <= 0:
                            continue
                        
                        # 计算第一到第五天的涨跌幅（截止日期的下一日当做第一天）
                        # 统计第一天涨的股票数量、前两天涨的股票数量
                        day1_rise = False
                        day1_price = None
                        day2_rise = False
                        
                        for day in range(1, 6):
                            target_idx = base_idx + day
                            if target_idx < len(df_full):
                                target_row = df_full.iloc[target_idx]
                                target_date = pd.to_datetime(target_row['timestamp']).date()
                                # 确保目标日期在截止日期之后（下一日）
                                if target_date > end_date_only:
                                    target_price = pd.to_numeric(target_row['close'], errors='coerce')
                                    if pd.notna(target_price) and target_price > 0:
                                        pct_change = ((target_price - base_price) / base_price) * 100
                                        day_returns[day].append(pct_change)
                                        
                                        # 统计第一天涨的股票
                                        if day == 1:
                                            day1_price = target_price
                                            if pct_change > 0:
                                                day1_rise = True
                                        # 统计前两天涨的股票（第一天和第二天都涨）
                                        elif day == 2 and day1_price is not None:
                                            if pct_change > 0 and day1_rise:
                                                day2_rise = True
                        
                        # 更新统计计数
                        if day1_rise:
                            day1_rise_count += 1
                        if day2_rise:
                            day2_rise_count += 1
                    
                    except Exception as e:
                        # 单只股票计算失败，跳过
                        continue
                
                # 计算平均值
                avg_returns = {}
                for day in range(1, 6):
                    if day_returns[day]:
                        avg_returns[f'day{day}'] = round(float(np.mean(day_returns[day])), 2)
                    else:
                        avg_returns[f'day{day}'] = None
                
                summary_stats = {
                    "avgReturns": avg_returns,
                    "sampleCount": len(day_returns[1]) if day_returns[1] else 0,  # 有数据的股票数量
                    "day1RiseCount": day1_rise_count,  # 第一天涨的股票数量
                    "day2RiseCount": day2_rise_count   # 前两天都涨的股票数量
                }
                
            except Exception as e:
                # 计算失败，不影响主流程
                import traceback
                print(f"[筛选统计] 计算涨跌幅失败: {e}")
                print(traceback.format_exc())
        
        # 任务完成
        with tasks_lock:
            screening_tasks[task_id]["status"] = "completed"
            screening_tasks[task_id]["errors"] = errors[:100]
            if summary_stats:
                screening_tasks[task_id]["summary"] = summary_stats
                print(f"[筛选统计] 已设置summary: {summary_stats}")
            else:
                print(f"[筛选统计] 未生成summary，selected数量: {len(selected)}, end_date: {end_date}")
    
    except Exception as e:
        with tasks_lock:
            screening_tasks[task_id]["status"] = "error"
            screening_tasks[task_id]["errors"] = [{"error": str(e)}]

@router.post("/screener/export-csv")
async def export_screening_results_to_csv(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    导出筛选结果为CSV文件
    body: { 
        results: [...], 
        direction?: string, 
        fast?: int, 
        slow?: int, 
        signal?: int,
        endDate?: string,  # 截止日期（用于文件名）
        volumeRatio?: float,  # 放量倍数（用于文件名）
        maShort?: int,  # 短期均线周期（用于文件名）
        maLong?: int,  # 长期均线周期（用于文件名）
        priceThreshold?: float  # 位置百分比阈值（用于文件名）
    }
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
        end_date = body.get('endDate')  # 截止日期
        volume_ratio = body.get('volumeRatio')  # 放量倍数（可能为None）
        ma_short = body.get('maShort')  # 短期均线周期（可能为None）
        ma_long = body.get('maLong')  # 长期均线周期（可能为None）
        price_threshold = body.get('priceThreshold')  # 位置百分比阈值（可能为None）
        
        # 定位项目根目录
        here = Path(__file__).resolve()
        project_root = here.parents[3] if len(here.parents) >= 4 else here.parent
        
        # 创建筛选结果目录
        output_dir = project_root / 'data' / 'screening_results'
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # 生成文件名：日期_放量倍数_短均线_长均线_位置百分比_数量只.csv
        # 使用截止日期，如果没有则使用当前日期
        if end_date:
            try:
                # 将日期格式从 YYYY-MM-DD 转换为 YYYYMMDD
                date_obj = datetime.strptime(end_date, '%Y-%m-%d')
                date_str = date_obj.strftime('%Y%m%d')
            except:
                date_str = datetime.now().strftime('%Y%m%d')
        else:
            date_str = datetime.now().strftime('%Y%m%d')
        
        count = len(results)
        # 格式化参数：如果参数为None，使用默认值或占位符
        # 放量倍数：保留1位小数，去掉小数点（1.5 -> 15）
        if volume_ratio is not None:
            volume_str = f"{float(volume_ratio):.1f}".replace('.', '')
        else:
            volume_str = '0'  # 未启用放量筛选
        
        # 短期均线周期
        if ma_short is not None:
            ma_short_str = str(int(ma_short))
        else:
            ma_short_str = '0'  # 未启用均线筛选
        
        # 长期均线周期
        if ma_long is not None:
            ma_long_str = str(int(ma_long))
        else:
            ma_long_str = '0'  # 未启用均线筛选
        
        # 位置百分比阈值
        if price_threshold is not None:
            price_str = str(int(price_threshold))
        else:
            price_str = '0'  # 未启用位置筛选
        
        filename = f"{date_str}_{volume_str}_{ma_short_str}_{ma_long_str}_{price_str}_{count}只.csv"
        filepath = output_dir / filename
        
        # 如果文件已存在，添加时间戳
        if filepath.exists():
            time_str = datetime.now().strftime('%H%M%S')
            filename = f"{date_str}_{volume_str}_{ma_short_str}_{ma_long_str}_{price_str}_{count}只_{time_str}.csv"
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

@router.post("/best-stocks/export-csv")
async def export_best_stocks_to_csv(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    导出最佳股票排名结果为CSV文件
    body: { 
        results: [...], 
        startDate: string,  # 基准日期（开始日期）
        topN: int,  # 数量
        sortMethod: string  # 排名方式：'score' | 'return'
    }
    返回: { ok: bool, filepath: str, filename: str }
    """
    try:
        import csv
        from pathlib import Path
        
        results = body.get('results', [])
        if not isinstance(results, list) or len(results) == 0:
            raise HTTPException(status_code=400, detail="排名结果为空")
        
        # 获取参数（用于文件名）
        start_date = body.get('startDate', '')
        top_n = body.get('topN', 0)
        sort_method = body.get('sortMethod', 'return')
        
        # 定位项目根目录
        here = Path(__file__).resolve()
        project_root = here.parents[3] if len(here.parents) >= 4 else here.parent
        
        # 创建最佳股票排名导出目录
        output_dir = project_root / 'data' / 'best_stocks_results'
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # 生成文件名：基准日期-数量-排名方式.csv
        # 例如：2024-01-01-20-return.csv 或 2024-01-01-20-score.csv
        date_str = start_date if start_date else 'unknown'
        sort_str = 'return' if sort_method == 'return' else 'score'
        filename = f"{date_str}-{top_n}-{sort_str}.csv"
        filepath = output_dir / filename
        
        # 如果文件已存在，添加时间戳
        if filepath.exists():
            from datetime import datetime
            timestamp = datetime.now().strftime('%H%M%S')
            filename = f"{date_str}-{top_n}-{sort_str}-{timestamp}.csv"
            filepath = output_dir / filename
        
        count = len(results)
        
        # 准备CSV数据
        csv_rows = []
        for idx, r in enumerate(results, 1):
            # 股票代码使用等号格式，确保Excel将其识别为文本格式（保留前导0）
            code = str(r.get('symbol', ''))
            code_formatted = f'="{code}"' if code else ''
            
            row = {
                '排名': idx,
                '股票代码': code_formatted,
                '股票名称': r.get('name', ''),
                '综合评分': f"{r.get('score', 0):.4f}" if r.get('score') is not None else '',
                '区间收益(%)': f"{r.get('return', 0):.2f}" if r.get('return') is not None else '',
                '最大回撤(%)': f"{r.get('maxDrawdown', 0):.2f}" if r.get('maxDrawdown') is not None else '',
                '波动率(%)': f"{r.get('volatility', 0):.2f}" if r.get('volatility') is not None else '',
                'Sharpe比率': f"{r.get('sharpeRatio', 0):.4f}" if r.get('sharpeRatio') is not None else '',
                '趋势斜率': f"{r.get('trendSlope', 0):.6f}" if r.get('trendSlope') is not None else '',
                '成交量健康度': f"{r.get('volumeScore', 0):.4f}" if r.get('volumeScore') is not None else '',
                '起始价格': f"{r.get('startPrice', 0):.2f}" if r.get('startPrice') is not None else '',
                '结束价格': f"{r.get('endPrice', 0):.2f}" if r.get('endPrice') is not None else '',
                '交易日数': r.get('days', 0)
            }
            
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
            "message": f"已导出 {count} 条排名结果到 {filename}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出CSV失败: {str(e)}")

@router.post("/price-trend/analyze")
async def analyze_price_trend(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    分析股票价格走势（指定日期范围）
    body: { 
        symbols: string[]  # 股票代码列表，如 ["000560", "300896"]
        startDate?: string  # 可选：开始日期（YYYY-MM-DD），默认使用最近5天
        endDate?: string    # 可选：结束日期（YYYY-MM-DD），默认使用今天
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
        start_date_str = body.get('startDate')
        end_date_str = body.get('endDate')
        
        # 解析日期范围
        from datetime import datetime as dt
        if end_date_str:
            try:
                end_date = dt.strptime(end_date_str, '%Y-%m-%d')
            except:
                raise HTTPException(status_code=400, detail=f"无效的结束日期格式: {end_date_str}，应为 YYYY-MM-DD")
        else:
            end_date = dt.now()
        
        if start_date_str:
            try:
                start_date = dt.strptime(start_date_str, '%Y-%m-%d')
            except:
                raise HTTPException(status_code=400, detail=f"无效的开始日期格式: {start_date_str}，应为 YYYY-MM-DD")
        else:
            # 如果没有指定开始日期，默认使用结束日期前5天
            from datetime import timedelta
            start_date = end_date - timedelta(days=5)
        
        if start_date > end_date:
            raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
        
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
                    # 转换时间列为datetime类型
                    df[time_col] = pd.to_datetime(df[time_col], errors='coerce')
                    df = df.sort_values(time_col, ascending=False).reset_index(drop=True)
                    
                    # 根据日期范围筛选数据
                    # 筛选结束日期及之前的数据
                    df_filtered = df[df[time_col] <= pd.Timestamp(end_date)].copy()
                    # 筛选开始日期及之后的数据
                    df_filtered = df_filtered[df_filtered[time_col] >= pd.Timestamp(start_date)].copy()
                    
                    if df_filtered.empty:
                        errors.append({"symbol": symbol, "error": f"在日期范围 {start_date_str} 至 {end_date_str} 内没有数据"})
                        continue
                    
                    # 获取基准价格（开始日期前一天的价格）
                    from datetime import timedelta
                    base_date = start_date - timedelta(days=1)
                    base_df = df[df[time_col] <= pd.Timestamp(base_date)].copy()
                    
                    if base_df.empty:
                        errors.append({"symbol": symbol, "error": f"无法获取基准价格（{base_date.strftime('%Y-%m-%d')}及之前的数据）"})
                        continue
                    
                    # 获取基准价格（最接近基准日期的数据）
                    base_price = float(base_df.iloc[0]['close']) if pd.notna(base_df.iloc[0]['close']) else None
                    
                    if base_price is None:
                        errors.append({"symbol": symbol, "error": "无法获取基准价格"})
                        continue
                    
                    # 使用筛选后的数据，按时间正序排列（从旧到新）
                    range_days = df_filtered.sort_values(time_col, ascending=True).reset_index(drop=True)
                else:
                    # 如果没有时间列，假设数据已经是倒序的，使用前N天数据
                    # 计算需要的天数
                    days_diff = (end_date - start_date).days + 1
                    if len(df) < days_diff + 1:
                        errors.append({"symbol": symbol, "error": f"数据不足，需要至少 {days_diff + 1} 天数据（{days_diff} 天走势 + 1 天基准），只有 {len(df)} 天"})
                        continue
                    
                    # 获取指定天数的数据
                    range_days = df.head(days_diff).copy()
                    
                    # 获取基准价格（第days_diff行的收盘价，作为基准）
                    base_price = float(df.iloc[days_diff]['close']) if pd.notna(df.iloc[days_diff]['close']) else None
                    
                    if base_price is None:
                        errors.append({"symbol": symbol, "error": "无法获取基准价格"})
                        continue
                    
                    # 反转顺序（从旧到新）
                    range_days = range_days.iloc[::-1].reset_index(drop=True)
                
                # 构建每日数据（从旧到新：第1天是最旧的，第N天是最新的）
                # range_days是按时间正序的：iloc[0]是最旧（第1天），iloc[-1]是最新（第N天）
                days_data = []
                for idx in range(len(range_days)):
                    # idx=0是最旧的（第1天），idx=-1是最新的（第N天）
                    row = range_days.iloc[idx]
                    # day_num：idx=0对应第1天（最旧），idx=-1对应第N天（最新）
                    day_num = idx + 1  # 第1天到第N天（第1天最旧，第N天最新）
                    close_price = float(row['close']) if pd.notna(row['close']) else None
                    
                    if close_price is None:
                        continue
                    
                    # 计算与基准价格的差值（总体涨跌）
                    change = round(close_price - base_price, 2)
                    change_percent = round((change / base_price * 100), 2) if base_price > 0 else 0
                    
                    # 计算当天涨跌（相对于前一天）
                    daily_change = None
                    daily_change_percent = None
                    if idx > 0:
                        # 有前一天数据（idx-1对应更早的日期，即前一天）
                        prev_close = float(range_days.iloc[idx - 1]['close']) if pd.notna(range_days.iloc[idx - 1]['close']) else None
                        if prev_close is not None:
                            daily_change = round(close_price - prev_close, 2)
                            daily_change_percent = round((daily_change / prev_close * 100), 2) if prev_close > 0 else 0
                    else:
                        # 第1天（最旧，idx=0），与基准价格（第0天）对比
                        daily_change = round(close_price - base_price, 2)
                        daily_change_percent = round((daily_change / base_price * 100), 2) if base_price > 0 else 0
                    
                    # 获取日期
                    date_str = ''
                    if time_col and time_col in row:
                        ts = row[time_col]
                        if isinstance(ts, pd.Timestamp):
                            date_str = ts.strftime('%Y-%m-%d')
                        else:
                            date_str = str(ts).split()[0] if ' ' in str(ts) else str(ts)
                    elif 'timestamp' in row:
                        ts = row['timestamp']
                        if isinstance(ts, pd.Timestamp):
                            date_str = ts.strftime('%Y-%m-%d')
                        else:
                            date_str = str(ts).split()[0] if ' ' in str(ts) else str(ts)
                    elif 'datetime' in row:
                        dt_val = row['datetime']
                        if isinstance(dt_val, pd.Timestamp):
                            date_str = dt_val.strftime('%Y-%m-%d')
                        else:
                            date_str = str(dt_val).split()[0] if ' ' in str(dt_val) else str(dt_val)
                    
                    days_data.append({
                        "day": day_num,
                        "date": date_str,
                        "close": round(close_price, 2),
                        "change": change,
                        "changePercent": change_percent,
                        "dailyChange": daily_change,
                        "dailyChangePercent": daily_change_percent
                    })
                
                # days_data已经是按时间正序的（第1天最旧，第N天最新），不需要反转
                
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
        
        # 计算汇总统计：平均涨跌幅、第一天涨的股票数量、前两天涨的股票数量
        summary = None
        if len(results) > 0:
            # 动态收集所有股票每天的涨跌幅（根据实际天数）
            max_days = 0
            for result in results:
                days = result.get('days', [])
                if len(days) > max_days:
                    max_days = len(days)
            
            # 初始化天数字典
            day_returns = {i: [] for i in range(1, max_days + 1)}
            day_rise_counts = {i: 0 for i in range(1, max_days + 1)}  # 每天上涨的股票数量
            day_fall_counts = {i: 0 for i in range(1, max_days + 1)}  # 每天下跌的股票数量
            consecutive_rise_counts = {i: 0 for i in range(1, max_days + 1)}  # 连续上涨N天的股票数量
            best_hold_days = []  # 每只股票的最佳持仓天数（收益最高的天数）
            hold_day_returns = {i: [] for i in range(1, max_days + 1)}  # 持仓N天的收益列表
            
            for result in results:
                days = result.get('days', [])
                if len(days) == 0:
                    continue
                
                day1_rise = False
                day2_rise = False
                max_return_day = 1  # 收益最高的天数
                max_return = days[0].get('changePercent', 0) if days else 0
                max_consecutive_rise = 0  # 最大连续上涨天数（基于当天涨跌）
                current_consecutive_rise = 0  # 当前连续上涨天数（基于当天涨跌）
                
                for day_data in days:
                    day_num = day_data.get('day')
                    change_percent = day_data.get('changePercent', 0)  # 总体涨跌（相对于基准）
                    daily_change_percent = day_data.get('dailyChangePercent', 0)  # 当天涨跌（相对于前一天）
                    
                    if day_num in day_returns:
                        day_returns[day_num].append(change_percent)
                    
                    # 统计每天上涨/下跌的股票数量（基于总体涨跌）
                    if change_percent > 0:
                        if day_num in day_rise_counts:
                            day_rise_counts[day_num] += 1
                    elif change_percent < 0:
                        if day_num in day_fall_counts:
                            day_fall_counts[day_num] += 1
                    
                    # 统计连续上涨（基于当天涨跌，相对于前一天）
                    if daily_change_percent is not None:
                        if daily_change_percent > 0:
                            current_consecutive_rise += 1
                            if current_consecutive_rise > max_consecutive_rise:
                                max_consecutive_rise = current_consecutive_rise
                        elif daily_change_percent < 0:
                            current_consecutive_rise = 0
                        else:
                            current_consecutive_rise = 0
                    
                    # 记录最佳持仓天数（收益最高的天数）
                    if change_percent > max_return:
                        max_return = change_percent
                        max_return_day = day_num
                    
                    # 统计第一天涨的股票
                    if day_num == 1:
                        if change_percent > 0:
                            day1_rise = True
                    
                    # 统计前两天都涨的股票（第1天和第2天都涨）
                    if day_num == 2:
                        if change_percent > 0 and day1_rise:
                            day2_rise = True
                    
                    # 记录持仓不同天数的收益
                    if day_num in hold_day_returns:
                        hold_day_returns[day_num].append(change_percent)
                
                # 记录最佳持仓天数
                best_hold_days.append(max_return_day)
                
                # 统计连续上涨N天的股票（只记录最大连续上涨天数）
                if max_consecutive_rise > 0 and max_consecutive_rise <= max_days:
                    if max_consecutive_rise in consecutive_rise_counts:
                        consecutive_rise_counts[max_consecutive_rise] += 1
            
            # 计算每天上涨的股票数量（使用day_rise_counts）
            day1_rise_count = day_rise_counts.get(1, 0)
            day2_rise_count = consecutive_rise_counts.get(2, 0)  # 连续2天上涨的数量
            
            # 计算各种统计指标（动态天数）
            day_stats = {}
            for day_num in sorted(day_returns.keys()):
                returns = day_returns[day_num]
                if len(returns) > 0:
                    # 平均值
                    avg_return = sum(returns) / len(returns)
                    
                    # 上涨和下跌数量
                    rise_count = sum(1 for r in returns if r > 0)
                    fall_count = sum(1 for r in returns if r < 0)
                    flat_count = len(returns) - rise_count - fall_count
                    
                    # 上涨比例
                    rise_ratio = (rise_count / len(returns) * 100) if len(returns) > 0 else 0
                    
                    # 最大涨幅和最大跌幅
                    max_return = max(returns) if returns else 0
                    min_return = min(returns) if returns else 0
                    
                    # 中位数
                    sorted_returns = sorted(returns)
                    median_return = sorted_returns[len(sorted_returns) // 2] if sorted_returns else 0
                    if len(sorted_returns) % 2 == 0 and len(sorted_returns) > 0:
                        median_return = (sorted_returns[len(sorted_returns) // 2 - 1] + sorted_returns[len(sorted_returns) // 2]) / 2
                    
                    # 标准差（波动性）
                    variance = sum((r - avg_return) ** 2 for r in returns) / len(returns) if len(returns) > 0 else 0
                    std_dev = variance ** 0.5
                    
                    day_stats[f"day{day_num}"] = {
                        "avg": round(avg_return, 2),
                        "riseCount": rise_count,
                        "fallCount": fall_count,
                        "flatCount": flat_count,
                        "riseRatio": round(rise_ratio, 1),
                        "max": round(max_return, 2),
                        "min": round(min_return, 2),
                        "median": round(median_return, 2),
                        "stdDev": round(std_dev, 2)
                    }
                else:
                    day_stats[f"day{day_num}"] = {
                        "avg": 0.0,
                        "riseCount": 0,
                        "fallCount": 0,
                        "flatCount": 0,
                        "riseRatio": 0.0,
                        "max": 0.0,
                        "min": 0.0,
                        "median": 0.0,
                        "stdDev": 0.0
                    }
            
            # 计算最佳持仓天数统计
            best_hold_day_stats = {}
            if best_hold_days:
                for day in range(1, max_days + 1):
                    count = best_hold_days.count(day)
                    if count > 0:
                        best_hold_day_stats[day] = count
            
            # 计算持仓不同天数的平均收益
            hold_day_avg_returns = {}
            for day_num in range(1, max_days + 1):
                returns = hold_day_returns.get(day_num, [])
                if returns:
                    avg_return = sum(returns) / len(returns)
                    hold_day_avg_returns[day_num] = round(avg_return, 2)
            
            summary = {
                "dayStats": day_stats,
                "day1RiseCount": day1_rise_count,
                "day2RiseCount": day2_rise_count,
                "totalStocks": len(results),
                "dayRiseCounts": day_rise_counts,  # 每天上涨的股票数量
                "dayFallCounts": day_fall_counts,  # 每天下跌的股票数量
                "consecutiveRiseCounts": consecutive_rise_counts,  # 连续上涨N天的股票数量
                "bestHoldDayStats": best_hold_day_stats,  # 最佳持仓天数统计
                "holdDayAvgReturns": hold_day_avg_returns  # 持仓不同天数的平均收益
            }
        
        return {
            "ok": True,
            "results": results,
            "errors": errors,
            "total": len(symbols),
            "success": len(results),
            "failed": len(errors),
            "summary": summary
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析价格走势失败: {str(e)}")

@router.post("/best-stocks/score-async")
async def calculate_best_stocks_async(body: Dict[str, Any], background_tasks: BackgroundTasks) -> Dict[str, Any]:
    """
    异步计算一段时间内表现最好的N只股票（带进度）
    
    Args:
        body: {
            startDate: 开始日期 (YYYY-MM-DD)
            endDate: 结束日期 (YYYY-MM-DD)
            sampleSize: 选股数量，从所有股票中随机选择，0表示全部计算，默认500
            topN: 返回前N只股票，默认20
        }
        
    Returns:
        { ok: true, taskId: "xxx" }
    """
    try:
        startDate = body.get('startDate')
        endDate = body.get('endDate')
        sample_size = int(body.get('sampleSize', 500))
        topN = int(body.get('topN', 20))
        sort_method = body.get('sortMethod', 'return')  # 排序方式：'score' | 'return'，默认按收益排序
        
        if not startDate or not endDate:
            raise HTTPException(status_code=400, detail="必须提供startDate和endDate")
        
        if sample_size < 0:
            raise HTTPException(status_code=400, detail="选股数量不能为负数")
        
        if topN < 1:
            raise HTTPException(status_code=400, detail="返回前N只必须大于0")
        
        if sort_method not in ['score', 'return']:
            raise HTTPException(status_code=400, detail="排序方式必须是'score'或'return'")
        
        # 生成任务ID
        task_id = str(uuid.uuid4())
        
        # 初始化任务状态
        with tasks_lock:
            screening_tasks[task_id] = {
                "status": "running",
                "progress": {
                    "processed": 0,
                    "total": 0,
                    "current": ""
                },
                "results": [],
                "errors": []
            }
        
        # 启动后台任务
        background_tasks.add_task(
            _run_best_stocks_task,
            task_id,
            startDate,
            endDate,
            sample_size,
            topN,
            sort_method
        )
        
        return {"ok": True, "taskId": task_id}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"启动任务失败: {str(e)}")

@router.get("/best-stocks/status/{task_id}")
async def get_best_stocks_status(task_id: str) -> Dict[str, Any]:
    """
    获取最佳股票计算任务状态与进度
    返回: { ok: true, task: {status, progress, results, errors} }
    """
    with tasks_lock:
        task = screening_tasks.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    
    return {"ok": True, "task": task}

@router.post("/best-stocks/score")
async def calculate_best_stocks(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    计算一段时间内表现最好的N只股票
    
    Args:
        body: {
            startDate: 开始日期 (YYYY-MM-DD)
            endDate: 结束日期 (YYYY-MM-DD)
            sampleSize: 选股数量，从所有股票中随机选择，0表示全部计算，默认500
            topN: 返回前N只股票，默认20
        }
        
    Returns:
        包含评分最高的N只股票及其详细指标
    """
    try:
        startDate = body.get('startDate')
        endDate = body.get('endDate')
        sample_size = int(body.get('sampleSize', 500))  # 选股数量
        topN = int(body.get('topN', 20))  # 返回前N只
        
        if not startDate or not endDate:
            raise HTTPException(status_code=400, detail="必须提供startDate和endDate")
        
        if sample_size < 0:
            raise HTTPException(status_code=400, detail="选股数量不能为负数")
        
        if topN < 1:
            raise HTTPException(status_code=400, detail="返回前N只必须大于0")
        # 尝试导入scipy，如果没有则使用numpy实现线性回归
        try:
            from scipy import stats
            has_scipy = True
        except ImportError:
            has_scipy = False
        
        # 获取股票列表
        project_root = Path(__file__).resolve().parents[3]
        with_industry = project_root / 'data' / 'stockList' / 'all_stock_with_industry.json'
        pure = project_root / 'data' / 'stockList' / 'all_pure_stock.json'
        
        stock_list: list = []
        if with_industry.exists():
            with open(with_industry, 'r', encoding='utf-8') as f:
                stock_list = json.load(f)
        elif pure.exists():
            with open(pure, 'r', encoding='utf-8') as f:
                stock_list = json.load(f)
        else:
            raise HTTPException(status_code=404, detail="股票列表文件不存在")
        
        # 构建名称映射
        name_map: Dict[str, str] = {}
        for it in (stock_list or []):
            try:
                code_raw = str(it.get('code') or '')
                code = code_raw.split('.')[-1] if '.' in code_raw else code_raw
                nm = str(it.get('code_name') or it.get('name') or '')
                if code and nm:
                    name_map[code] = nm
            except Exception:
                continue
        
        # 获取所有可用的股票代码（从CSV文件）
        entries = data_loader.list_symbols()
        available_symbols = []
        for e in (entries or []):
            try:
                if not isinstance(e, dict) or e.get('kind') != 'stock':
                    continue
                code = str(e.get('symbol') or '')
                if code:
                    available_symbols.append(code)
            except Exception:
                continue
        
        if not available_symbols:
            raise HTTPException(status_code=404, detail="未找到可用的股票数据")
        
        # 如果指定了选股数量，从所有股票中随机选择
        if sample_size > 0 and sample_size < len(available_symbols):
            import random
            available_symbols = random.sample(available_symbols, sample_size)
        
        # 解析日期
        start_dt = pd.to_datetime(startDate)
        end_dt = pd.to_datetime(endDate)
        
        if start_dt >= end_dt:
            raise HTTPException(status_code=400, detail="开始日期必须早于结束日期")
        
        results = []
        errors = []
        
        # 计算所有股票的评分
        for symbol in available_symbols:
            try:
                # 加载股票数据
                df = load_stock_data(symbol, timeframe='1d')
                if df is None or df.empty:
                    continue
                
                # 过滤日期范围
                df = df[(df['timestamp'] >= start_dt) & (df['timestamp'] <= end_dt)]
                if df.empty or len(df) < 2:
                    continue
                
                df = df.sort_values('timestamp').reset_index(drop=True)
                
                # 获取价格和成交量数据
                closes = df['close'].values
                volumes = df['volume'].values
                
                if len(closes) < 2:
                    continue
                
                # 1. 计算区间收益 Return（权重 0.30）
                start_price = closes[0]
                end_price = closes[-1]
                return_pct = (end_price - start_price) / start_price if start_price > 0 else 0
                
                # 2. 计算最大回撤 MaxDrawdown（权重 0.20，回撤越小越好）
                peak = start_price
                max_drawdown = 0
                for price in closes:
                    if price > peak:
                        peak = price
                    drawdown = (peak - price) / peak if peak > 0 else 0
                    max_drawdown = max(max_drawdown, drawdown)
                
                # 3. 计算波动率 Volatility（权重 0.15，越小越好）
                daily_returns = np.diff(closes) / closes[:-1]
                volatility = np.std(daily_returns) * np.sqrt(252) if len(daily_returns) > 0 else 0
                
                # 4. 计算Sharpe比率（权重 0.20）
                if len(daily_returns) > 0 and np.std(daily_returns) > 0:
                    mean_return = np.mean(daily_returns)
                    sharpe_ratio = (mean_return / np.std(daily_returns)) * np.sqrt(252) if np.std(daily_returns) > 0 else 0
                else:
                    sharpe_ratio = 0
                
                # 5. 计算趋势斜率 TrendSlope，使用线性回归（权重 0.10）
                x = np.arange(len(closes))
                if len(closes) > 1:
                    # 使用scipy的linregress或numpy实现
                    if has_scipy:
                        slope, intercept, r_value, p_value, std_err = stats.linregress(x, closes)
                    else:
                        # 使用numpy实现最小二乘法线性回归
                        A = np.vstack([x, np.ones(len(x))]).T
                        slope, intercept = np.linalg.lstsq(A, closes, rcond=None)[0]
                    trend_slope = slope / start_price if start_price > 0 else 0  # 归一化斜率
                else:
                    trend_slope = 0
                
                # 6. 计算成交量健康度 VolumeScore（权重 0.05）
                # 成交量健康度：上涨时放量，下跌时缩量
                volume_score = 0
                if len(volumes) > 1 and len(daily_returns) > 0:
                    volume_changes = np.diff(volumes) / volumes[:-1]
                    # 计算价格变化与成交量变化的相关性
                    # 正相关（上涨放量、下跌缩量）得分高
                    if len(volume_changes) > 0:
                        # 简化计算：上涨日平均成交量 / 下跌日平均成交量
                        up_days = daily_returns > 0
                        down_days = daily_returns < 0
                        if np.sum(up_days) > 0 and np.sum(down_days) > 0:
                            avg_vol_up = np.mean(volumes[1:][up_days])
                            avg_vol_down = np.mean(volumes[1:][down_days])
                            if avg_vol_down > 0:
                                volume_ratio = avg_vol_up / avg_vol_down
                                # 归一化到0-1范围（假设合理范围是0.5-2.0）
                                volume_score = min(max((volume_ratio - 0.5) / 1.5, 0), 1)
                        elif np.sum(up_days) > 0:
                            volume_score = 0.5  # 只有上涨日，给中等分数
                        else:
                            volume_score = 0.2  # 只有下跌日，给低分
                
                # 归一化各项指标到0-1范围（用于评分）
                # 收益：直接使用（已经是百分比）
                normalized_return = min(max(return_pct, -1), 1)  # 限制在-100%到100%
                normalized_return = (normalized_return + 1) / 2  # 转换到0-1范围
                
                # 最大回撤：越小越好，所以用1减去
                normalized_drawdown = 1 - min(max_drawdown, 1)
                
                # 波动率：越小越好，需要反向归一化
                # 假设波动率范围是0-1（年化），超过1的视为1
                normalized_volatility = 1 - min(volatility, 1)
                
                # Sharpe比率：越大越好，需要归一化
                # 假设Sharpe比率范围是-2到2，超过的视为边界值
                normalized_sharpe = (min(max(sharpe_ratio, -2), 2) + 2) / 4
                
                # 趋势斜率：越大越好，需要归一化
                # 假设斜率范围是-0.1到0.1（归一化后）
                normalized_trend = (min(max(trend_slope, -0.1), 0.1) + 0.1) / 0.2
                
                # 成交量健康度：已经在0-1范围
                normalized_volume = volume_score
                
                # 计算综合评分
                score = (
                    0.30 * normalized_return +
                    0.20 * normalized_drawdown +
                    0.15 * normalized_volatility +
                    0.20 * normalized_sharpe +
                    0.10 * normalized_trend +
                    0.05 * normalized_volume
                )
                
                # 获取股票名称
                stock_name = name_map.get(symbol, symbol)
                
                results.append({
                    "symbol": symbol,
                    "name": stock_name,
                    "score": round(score, 4),
                    "return": round(return_pct * 100, 2),  # 转换为百分比
                    "maxDrawdown": round(max_drawdown * 100, 2),  # 转换为百分比
                    "volatility": round(volatility * 100, 2),  # 转换为百分比
                    "sharpeRatio": round(sharpe_ratio, 4),
                    "trendSlope": round(trend_slope, 6),
                    "volumeScore": round(volume_score, 4),
                    "startPrice": round(start_price, 2),
                    "endPrice": round(end_price, 2),
                    "days": len(df)
                })
                
            except Exception as e:
                errors.append({
                    "symbol": symbol,
                    "error": str(e)
                })
                continue
        
        # 按评分排序，取前N只
        # 优先按收益率排序，如果收益率相同再按综合评分排序
        results.sort(key=lambda x: (x['return'], x['score']), reverse=True)
        # 确保返回至少topN个结果，如果结果不足则返回全部
        top_results = results[:topN] if len(results) >= topN else results
        
        return {
            "ok": True,
            "results": top_results,
            "total": len(results),
            "sampleSize": sample_size if sample_size > 0 else len(available_symbols),
            "errors": errors[:10] if errors else [],  # 只返回前10个错误
            "params": {
                "startDate": startDate,
                "endDate": endDate,
                "sampleSize": sample_size,
                "topN": topN
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"计算最佳股票失败: {str(e)}")

def _run_best_stocks_task(task_id: str, startDate: str, endDate: str, sample_size: int, topN: int, sort_method: str = 'return'):
    """
    后台任务：计算最佳股票评分
    
    Args:
        sort_method: 排序方式，'score' 按综合评分，'return' 按区间收益，默认'return'
    """
    try:
        # 尝试导入scipy，如果没有则使用numpy实现线性回归
        try:
            from scipy import stats
            has_scipy = True
        except ImportError:
            has_scipy = False
        
        # 获取股票列表
        project_root = Path(__file__).resolve().parents[3]
        with_industry = project_root / 'data' / 'stockList' / 'all_stock_with_industry.json'
        pure = project_root / 'data' / 'stockList' / 'all_pure_stock.json'
        
        stock_list: list = []
        if with_industry.exists():
            with open(with_industry, 'r', encoding='utf-8') as f:
                stock_list = json.load(f)
        elif pure.exists():
            with open(pure, 'r', encoding='utf-8') as f:
                stock_list = json.load(f)
        else:
            with tasks_lock:
                screening_tasks[task_id]["status"] = "error"
                screening_tasks[task_id]["errors"] = [{"error": "股票列表文件不存在"}]
            return
        
        # 构建名称映射
        name_map: Dict[str, str] = {}
        for it in (stock_list or []):
            try:
                code_raw = str(it.get('code') or '')
                code = code_raw.split('.')[-1] if '.' in code_raw else code_raw
                nm = str(it.get('code_name') or it.get('name') or '')
                if code and nm:
                    name_map[code] = nm
            except Exception:
                continue
        
        # 获取所有可用的股票代码（从CSV文件）
        entries = data_loader.list_symbols()
        available_symbols = []
        for e in (entries or []):
            try:
                if not isinstance(e, dict) or e.get('kind') != 'stock':
                    continue
                code = str(e.get('symbol') or '')
                if code:
                    available_symbols.append(code)
            except Exception:
                continue
        
        if not available_symbols:
            with tasks_lock:
                screening_tasks[task_id]["status"] = "error"
                screening_tasks[task_id]["errors"] = [{"error": "未找到可用的股票数据"}]
            return
        
        # 如果指定了选股数量，从所有股票中随机选择
        if sample_size > 0 and sample_size < len(available_symbols):
            import random
            available_symbols = random.sample(available_symbols, sample_size)
        
        # 更新总数量
        with tasks_lock:
            screening_tasks[task_id]["progress"]["total"] = len(available_symbols)
        
        # 解析日期
        start_dt = pd.to_datetime(startDate)
        end_dt = pd.to_datetime(endDate)
        
        if start_dt >= end_dt:
            with tasks_lock:
                screening_tasks[task_id]["status"] = "error"
                screening_tasks[task_id]["errors"] = [{"error": "开始日期必须早于结束日期"}]
            return
        
        results = []
        errors = []
        processed = 0
        
        # 计算所有股票的评分
        for symbol in available_symbols:
            try:
                # 更新当前处理的股票（包含名称和代码）
                stock_name = name_map.get(symbol, symbol)
                current_info = f"{stock_name}--{symbol}"
                with tasks_lock:
                    screening_tasks[task_id]["progress"]["current"] = current_info
                
                # 加载股票数据
                df = load_stock_data(symbol, timeframe='1d')
                if df is None or df.empty:
                    processed += 1
                    with tasks_lock:
                        screening_tasks[task_id]["progress"]["processed"] = processed
                    continue
                
                # 过滤日期范围
                df = df[(df['timestamp'] >= start_dt) & (df['timestamp'] <= end_dt)]
                # 至少需要1天数据（开始和结束价格）
                if df.empty or len(df) < 1:
                    processed += 1
                    with tasks_lock:
                        screening_tasks[task_id]["progress"]["processed"] = processed
                    continue
                
                df = df.sort_values('timestamp').reset_index(drop=True)
                
                # 获取价格和成交量数据
                closes = df['close'].values
                volumes = df['volume'].values
                
                # 1. 计算区间收益 Return（权重 0.30）
                start_price = closes[0]
                end_price = closes[-1]
                return_pct = (end_price - start_price) / start_price if start_price > 0 else 0
                
                # 如果只有1天数据，使用默认值
                if len(closes) < 2:
                    # 单日数据，无法计算其他指标，使用默认值
                    max_drawdown = 0
                    volatility = 0
                    sharpe_ratio = 0
                    trend_slope = 0
                    volume_score = 0.5
                else:
                    # 2. 计算最大回撤 MaxDrawdown（权重 0.20，回撤越小越好）
                    peak = start_price
                    max_drawdown = 0
                    for price in closes:
                        if price > peak:
                            peak = price
                        drawdown = (peak - price) / peak if peak > 0 else 0
                        max_drawdown = max(max_drawdown, drawdown)
                    
                    # 3. 计算波动率 Volatility（权重 0.15，越小越好）
                    daily_returns = np.diff(closes) / closes[:-1]
                    volatility = np.std(daily_returns) * np.sqrt(252) if len(daily_returns) > 0 else 0
                    
                    # 4. 计算Sharpe比率（权重 0.20）
                    if len(daily_returns) > 0 and np.std(daily_returns) > 0:
                        mean_return = np.mean(daily_returns)
                        sharpe_ratio = (mean_return / np.std(daily_returns)) * np.sqrt(252) if np.std(daily_returns) > 0 else 0
                    else:
                        sharpe_ratio = 0
                    
                    # 5. 计算趋势斜率 TrendSlope，使用线性回归（权重 0.10）
                    x = np.arange(len(closes))
                    if len(closes) > 1:
                        # 使用scipy的linregress或numpy实现
                        if has_scipy:
                            slope, intercept, r_value, p_value, std_err = stats.linregress(x, closes)
                        else:
                            # 使用numpy实现最小二乘法线性回归
                            A = np.vstack([x, np.ones(len(x))]).T
                            slope, intercept = np.linalg.lstsq(A, closes, rcond=None)[0]
                        trend_slope = slope / start_price if start_price > 0 else 0  # 归一化斜率
                    else:
                        trend_slope = 0
                    
                    # 6. 计算成交量健康度 VolumeScore（权重 0.05）
                    # 成交量健康度：上涨时放量，下跌时缩量
                    volume_score = 0
                    if len(volumes) > 1 and len(daily_returns) > 0:
                        volume_changes = np.diff(volumes) / volumes[:-1]
                        # 计算价格变化与成交量变化的相关性
                        # 正相关（上涨放量、下跌缩量）得分高
                        if len(volume_changes) > 0:
                            # 简化计算：上涨日平均成交量 / 下跌日平均成交量
                            up_days = daily_returns > 0
                            down_days = daily_returns < 0
                            if np.sum(up_days) > 0 and np.sum(down_days) > 0:
                                avg_vol_up = np.mean(volumes[1:][up_days])
                                avg_vol_down = np.mean(volumes[1:][down_days])
                                if avg_vol_down > 0:
                                    volume_ratio = avg_vol_up / avg_vol_down
                                    # 归一化到0-1范围（假设合理范围是0.5-2.0）
                                    volume_score = min(max((volume_ratio - 0.5) / 1.5, 0), 1)
                            elif np.sum(up_days) > 0:
                                volume_score = 0.5  # 只有上涨日，给中等分数
                            else:
                                volume_score = 0.2  # 只有下跌日，给低分
                
                # 归一化各项指标到0-1范围（用于评分）
                # 收益：直接使用（已经是百分比）
                normalized_return = min(max(return_pct, -1), 1)  # 限制在-100%到100%
                normalized_return = (normalized_return + 1) / 2  # 转换到0-1范围
                
                # 最大回撤：越小越好，所以用1减去
                normalized_drawdown = 1 - min(max_drawdown, 1)
                
                # 波动率：越小越好，需要反向归一化
                # 假设波动率范围是0-1（年化），超过1的视为1
                normalized_volatility = 1 - min(volatility, 1)
                
                # Sharpe比率：越大越好，需要归一化
                # 假设Sharpe比率范围是-2到2，超过的视为边界值
                normalized_sharpe = (min(max(sharpe_ratio, -2), 2) + 2) / 4
                
                # 趋势斜率：越大越好，需要归一化
                # 假设斜率范围是-0.1到0.1（归一化后）
                normalized_trend = (min(max(trend_slope, -0.1), 0.1) + 0.1) / 0.2
                
                # 成交量健康度：已经在0-1范围
                normalized_volume = volume_score
                
                # 计算综合评分
                score = (
                    0.30 * normalized_return +
                    0.20 * normalized_drawdown +
                    0.15 * normalized_volatility +
                    0.20 * normalized_sharpe +
                    0.10 * normalized_trend +
                    0.05 * normalized_volume
                )
                
                # 获取股票名称
                stock_name_result = name_map.get(symbol, symbol)
                
                stock_result = {
                    "symbol": symbol,
                    "name": stock_name_result,
                    "score": round(score, 4),
                    "return": round(return_pct * 100, 2),  # 转换为百分比
                    "maxDrawdown": round(max_drawdown * 100, 2),  # 转换为百分比
                    "volatility": round(volatility * 100, 2),  # 转换为百分比
                    "sharpeRatio": round(sharpe_ratio, 4),
                    "trendSlope": round(trend_slope, 6),
                    "volumeScore": round(volume_score, 4),
                    "startPrice": round(start_price, 2),
                    "endPrice": round(end_price, 2),
                    "days": len(df)
                }
                
                results.append(stock_result)
                
                # 实时更新结果：每次计算完一只股票后，立即排序并更新前N只
                # 先去重（基于symbol），保留最新的结果（使用字典更高效）
                seen_symbols = {}
                deduplicated_results = []
                for r in reversed(results):  # 从后往前遍历，保留最新的
                    sym = r.get('symbol')
                    if sym and sym not in seen_symbols:
                        seen_symbols[sym] = True
                        deduplicated_results.insert(0, r)  # 插入到开头，保持顺序
                
                results = deduplicated_results
                
                # 按指定方式排序
                if sort_method == 'return':
                    results.sort(key=lambda x: (x['return'], x['score']), reverse=True)
                else:
                    results.sort(key=lambda x: (x['score'], x['return']), reverse=True)
                
                # 只保留前topN只
                current_top_results = results[:topN] if len(results) >= topN else results
                
                # 实时更新任务状态中的结果
                with tasks_lock:
                    screening_tasks[task_id]["results"] = current_top_results.copy()
                
            except Exception as e:
                errors.append({
                    "symbol": symbol,
                    "error": str(e)
                })
            
            processed += 1
            # 更新进度
            with tasks_lock:
                screening_tasks[task_id]["progress"]["processed"] = processed
        
        # 最终去重（确保没有重复的股票）
        seen_symbols = {}
        deduplicated_results = []
        for r in results:
            sym = r.get('symbol')
            if sym and sym not in seen_symbols:
                seen_symbols[sym] = True
                deduplicated_results.append(r)
        
        results = deduplicated_results
        
        # 最终排序（确保结果正确）
        # 注意：在循环中已经实时排序和更新了，这里再做一次最终确认
        if sort_method == 'return':
            # 按收益率排序，如果收益率相同再按综合评分排序
            results.sort(key=lambda x: (x['return'], x['score']), reverse=True)
        else:
            # 按综合评分排序，如果评分相同再按收益率排序
            results.sort(key=lambda x: (x['score'], x['return']), reverse=True)
        
        # 确保返回至少topN个结果，如果结果不足则返回全部
        top_results = results[:topN] if len(results) >= topN else results
        
        # 如果结果数量不足topN，记录警告信息
        if len(top_results) < topN:
            import logging
            logging.warning(f"最佳股票计算结果不足：请求{topN}只，实际只有{len(top_results)}只有效结果")
        
        # 更新任务状态为完成
        with tasks_lock:
            screening_tasks[task_id]["status"] = "completed"
            screening_tasks[task_id]["results"] = top_results
            screening_tasks[task_id]["errors"] = errors[:10] if errors else []
            screening_tasks[task_id]["progress"]["current"] = ""
            # 记录最终统计信息
            screening_tasks[task_id]["progress"]["totalProcessed"] = processed
            screening_tasks[task_id]["progress"]["totalResults"] = len(results)
            screening_tasks[task_id]["progress"]["finalTopN"] = len(top_results)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        with tasks_lock:
            screening_tasks[task_id]["status"] = "error"
            screening_tasks[task_id]["errors"] = [{"error": str(e)}]

