#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
重新获取失败的股票数据
用法: python retryFailedStocks.py --errors-file errors.json --days 365
或者: python retryFailedStocks.py --codes "600000,600001,600002" --days 365
"""

import baostock as bs
import pandas as pd
import json
import sys
import argparse
from pathlib import Path
from datetime import datetime, timedelta

# 在 Windows 上强制使用 UTF-8 编码输出
if sys.platform == 'win32':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')


def ensure_login():
    """确保 baostock 已登录，如果未登录则重新登录"""
    lg = bs.login()
    if lg.error_code != '0':
        raise RuntimeError(f"baostock 登录失败: {lg.error_msg}")
    return lg


def fetch_single_stock(code: str, name: str, days: int, output_dir: Path, subdirs: list, subdir_file_counts: dict):
    """获取单只股票的数据"""
    # 安全文件名
    safe_name = "".join(ch for ch in name if ch.isalnum() or ch in ('-', '_', '.', '·', '（', '）')).strip() or "NONAME"
    
    # 根据文件数量分配到子目录
    min_count = min(subdir_file_counts.values())
    target_subdir_idx = min([i for i, count in subdir_file_counts.items() if count == min_count])
    
    if subdir_file_counts[target_subdir_idx] >= 500:
        target_subdir_idx = next((i for i, count in subdir_file_counts.items() if count < 500), 0)
    
    target_subdir = subdirs[target_subdir_idx]
    csv_path = target_subdir / f"{safe_name}-{code}.csv"
    
    # baostock 代码格式
    bs_code = f"{'sh' if code.startswith('6') else 'sz'}.{code}"
    
    # 计算日期范围
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    try:
        # 调用 baostock API
        rs = bs.query_history_k_data_plus(
            bs_code,
            "date,code,open,high,low,close,volume,amount,turn,pctChg",
            start_date=start_str,
            end_date=end_str,
            frequency="d",
            adjustflag="3"
        )
        
        if rs.error_code != '0':
            if "未登录" in rs.error_msg:
                # 重新登录并重试
                try:
                    bs.logout()
                except:
                    pass
                ensure_login()
                rs = bs.query_history_k_data_plus(
                    bs_code,
                    "date,code,open,high,low,close,volume,amount,turn,pctChg",
                    start_date=start_str,
                    end_date=end_str,
                    frequency="d",
                    adjustflag="3"
                )
                if rs.error_code != '0':
                    raise RuntimeError(f"baostock API 错误: {rs.error_msg}")
            else:
                raise RuntimeError(f"baostock API 错误: {rs.error_msg}")
        
        # 获取数据
        data_list = []
        while (rs.error_code == '0') & rs.next():
            data_list.append(rs.get_row_data())
        
        if len(data_list) == 0:
            raise RuntimeError("返回数据为空")
        
        # 转为 DataFrame
        df = pd.DataFrame(data_list, columns=rs.fields)
        
        # 重命名列
        df = df.rename(columns={
            'date': 'timestamp',
            'open': 'open',
            'high': 'high',
            'low': 'low',
            'close': 'close',
            'volume': 'volume',
            'amount': 'amount'
        })
        
        # 选择需要的列
        required_cols = ['timestamp', 'open', 'high', 'low', 'close', 'volume', 'amount']
        df = df[required_cols]
        
        # 数据类型转换
        df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
        for col in ['open', 'high', 'low', 'close', 'volume', 'amount']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # 删除无效行
        df = df.dropna(subset=['timestamp', 'open', 'high', 'low', 'close'])
        
        if len(df) == 0:
            raise RuntimeError("清洗后数据为空")
        
        # 按时间排序
        df = df.sort_values('timestamp')
        df['timestamp'] = df['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S')
        
        # 保存为 CSV
        df.to_csv(csv_path, index=False, encoding='utf-8')
        
        # 更新子目录文件计数
        subdir_file_counts[target_subdir_idx] += 1
        
        return True, len(df), None
    except Exception as e:
        return False, 0, str(e)


def retry_failed_stocks(errors: list, days: int = 365, output_dir: Path = None):
    """重新获取失败的股票数据"""
    # 定位项目根目录
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    
    if output_dir is None:
        output_dir = project_root / 'data' / 'stocks'
    else:
        output_dir = Path(output_dir)
    
    # 创建输出目录和子目录
    output_dir.mkdir(parents=True, exist_ok=True)
    subdirs = [output_dir / f'stocks_{i}' for i in range(10)]
    for subdir in subdirs:
        subdir.mkdir(parents=True, exist_ok=True)
    
    # 用于跟踪每个子目录的文件数量
    subdir_file_counts = {i: 0 for i in range(10)}
    
    # 统计现有文件数量
    for subdir in subdirs:
        idx = int(subdir.name.split('_')[1])
        subdir_file_counts[idx] = len(list(subdir.glob('*.csv')))
    
    print(f"[重试] 共 {len(errors)} 只失败股票待重新获取")
    print(f"[重试] 数据范围: 最近 {days} 天")
    print(f"[重试] 输出目录: {output_dir}")
    
    # 登录 baostock
    print("[baostock] 正在登录...")
    ensure_login()
    print("[baostock] 登录成功")
    
    ok_count = 0
    fail_count = 0
    new_errors = []
    last_login_time = datetime.now()
    login_interval = timedelta(minutes=30)
    
    try:
        for idx, error_item in enumerate(errors, 1):
            code = error_item.get('code', '')
            name = error_item.get('name', code)
            
            # 定期检查登录状态
            current_time = datetime.now()
            if (current_time - last_login_time) > login_interval or (idx % 100 == 0):
                try:
                    test_rs = bs.query_history_k_data_plus(
                        "sh.600000",
                        "date",
                        start_date=(datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d'),
                        end_date=datetime.now().strftime('%Y-%m-%d'),
                        frequency="d",
                        adjustflag="3"
                    )
                    if test_rs.error_code != '0' and "未登录" in test_rs.error_msg:
                        print(f"\n[baostock] 检测到登录过期，正在重新登录...", flush=True)
                        bs.logout()
                        ensure_login()
                        last_login_time = datetime.now()
                        print(f"[baostock] 重新登录成功", flush=True)
                except:
                    try:
                        bs.logout()
                    except:
                        pass
                    print(f"\n[baostock] 检测到登录问题，正在重新登录...", flush=True)
                    ensure_login()
                    last_login_time = datetime.now()
                    print(f"[baostock] 重新登录成功", flush=True)
            
            print(f"[{idx}/{len(errors)}] 正在获取 {name}({code})...", end=' ', flush=True)
            
            success, data_count, error_msg = fetch_single_stock(
                code, name, days, output_dir, subdirs, subdir_file_counts
            )
            
            if success:
                print(f"✓ 成功 ({data_count} 条)")
                ok_count += 1
            else:
                print(f"✗ 失败: {error_msg}")
                fail_count += 1
                new_errors.append({'code': code, 'name': name, 'error': error_msg})
    
    finally:
        bs.logout()
        print("[baostock] 已登出")
    
    summary = {
        'ok': ok_count,
        'fail': fail_count,
        'total': len(errors),
        'errors': new_errors[:50]
    }
    
    print(f"\n[重试] 完成: 成功 {ok_count}, 失败 {fail_count}, 总计 {len(errors)}")
    
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='重新获取失败的股票数据')
    parser.add_argument('--errors-file', type=str, help='错误列表JSON文件路径')
    parser.add_argument('--codes', type=str, help='股票代码列表，逗号分隔，如: 600000,600001,600002')
    parser.add_argument('--days', type=int, default=365, help='获取最近N天数据')
    parser.add_argument('--output', type=str, help='输出目录')
    
    args = parser.parse_args()
    
    errors = []
    
    if args.errors_file:
        # 从文件读取错误列表
        errors_path = Path(args.errors_file)
        if not errors_path.exists():
            print(f"错误: 文件不存在: {errors_path}")
            sys.exit(1)
        
        with open(errors_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, dict) and 'errors' in data:
                errors = data['errors']
            elif isinstance(data, list):
                errors = data
            else:
                print(f"错误: 无效的错误列表格式")
                sys.exit(1)
    
    elif args.codes:
        # 从命令行参数读取代码列表
        codes = [c.strip() for c in args.codes.split(',')]
        errors = [{'code': code, 'name': code} for code in codes]
    
    else:
        print("错误: 必须提供 --errors-file 或 --codes 参数")
        parser.print_help()
        sys.exit(1)
    
    if not errors:
        print("错误: 没有需要重试的股票")
        sys.exit(1)
    
    try:
        output_dir = Path(args.output) if args.output else None
        result = retry_failed_stocks(errors, days=args.days, output_dir=output_dir)
        
        # 输出 JSON 格式结果
        print("\n=== JSON RESULT ===")
        print(json.dumps(result, ensure_ascii=False))
        
        sys.exit(0 if result['fail'] == 0 else 1)
    
    except Exception as e:
        print(f"\n[错误] {e}", file=sys.stderr)
        sys.exit(1)

