#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量获取A股日K数据脚本
数据源：baostock
参考文档：http://baostock.com/mainContent?file=stockKData.md
"""

import baostock as bs
import pandas as pd
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta


def batch_fetch_daily_data(
    dict_path: str = None,
    output_dir: str = None,
    days: int = 365,
    limit: int = None
):
    """
    批量获取A股日K数据
    
    Args:
        dict_path: 股票字典路径，默认为 data/stockList/all_pure_stock.json
        output_dir: 输出目录，默认为 data/stocks
        days: 获取最近N天数据，默认365
        limit: 限制获取数量，用于测试
    
    Returns:
        dict: 统计信息 {ok: int, fail: int, total: int, errors: list}
    """
    # 定位项目根目录
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    
    # 默认路径
    if dict_path is None:
        dict_path = project_root / 'data' / 'stockList' / 'all_pure_stock.json'
    else:
        dict_path = Path(dict_path)
    
    if output_dir is None:
        output_dir = project_root / 'data' / 'stocks'
    else:
        output_dir = Path(output_dir)
    
    # 创建输出目录和子目录（10个子目录，每个最多500个文件）
    output_dir.mkdir(parents=True, exist_ok=True)
    subdirs = [output_dir / f'stocks_{i}' for i in range(10)]
    for subdir in subdirs:
        subdir.mkdir(parents=True, exist_ok=True)
    
    # 用于跟踪每个子目录的文件数量
    subdir_file_counts = {i: 0 for i in range(10)}
    
    # 读取股票字典
    if not dict_path.exists():
        raise FileNotFoundError(f"股票字典不存在: {dict_path}")
    
    with open(dict_path, 'r', encoding='utf-8') as f:
        raw_list = json.load(f)
    
    if not isinstance(raw_list, list) or len(raw_list) == 0:
        raise ValueError("股票字典为空或格式错误")
    
    # 归一化股票列表
    def pick(obj, keys):
        """从对象中提取第一个非空值"""
        for k in keys:
            v = obj.get(k)
            if v is not None and v != '':
                return str(v)
        return ''
    
    stocks = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        code_raw = pick(item, ['code', 'c', 'symbol', 'ticker', 'code_simple'])
        name = pick(item, ['code_name', 'name', 'n', 'nameZh', 'displayName', 'stock_name', 'sname'])
        
        # 提取纯6位数字代码（支持 sh.600000 或 600000 格式）
        code = None
        if code_raw:
            # 如果包含点号，取点号后面的部分
            if '.' in code_raw:
                code = code_raw.split('.')[-1]
            else:
                code = code_raw
        
        # 验证是否为6位数字
        if code and len(code) == 6 and code.isdigit():
            stocks.append({'code': code, 'name': name or code})
    
    if limit and isinstance(limit, int) and limit > 0:
        stocks = stocks[:limit]
    
    print(f"[批量获取] 共 {len(stocks)} 只股票待处理")
    print(f"[批量获取] 数据范围: 最近 {days} 天")
    print(f"[批量获取] 输出目录: {output_dir}")
    
    # 计算日期范围
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    # 登录 baostock（单次登录，循环使用）
    print("[baostock] 正在登录...")
    lg = bs.login()
    if lg.error_code != '0':
        raise RuntimeError(f"baostock 登录失败: {lg.error_msg}")
    print("[baostock] 登录成功")
    
    # 批量获取
    ok_count = 0
    fail_count = 0
    errors = []
    
    try:
        for idx, stock in enumerate(stocks, 1):
            code = stock['code']
            name = stock['name']
            
            # 安全文件名
            safe_name = "".join(ch for ch in name if ch.isalnum() or ch in ('-', '_', '.', '·', '（', '）')).strip() or "NONAME"
            
            # 根据文件数量分配到子目录（每个子目录最多500个文件）
            # 找到文件数量最少的子目录
            min_count = min(subdir_file_counts.values())
            target_subdir_idx = min([i for i, count in subdir_file_counts.items() if count == min_count])
            
            # 如果目标子目录已满（500个），找下一个未满的
            if subdir_file_counts[target_subdir_idx] >= 500:
                # 找第一个未满的子目录
                target_subdir_idx = next((i for i, count in subdir_file_counts.items() if count < 500), 0)
            
            target_subdir = subdirs[target_subdir_idx]
            csv_path = target_subdir / f"{safe_name}-{code}.csv"
            
            # baostock 代码格式：sh.600000 或 sz.000001
            bs_code = f"{'sh' if code.startswith('6') else 'sz'}.{code}"
            
            try:
                print(f"[{idx}/{len(stocks)}] 正在获取 {name}({code})...", end=' ', flush=True)
                
                # 调用 baostock API
                # 参考：http://baostock.com/mainContent?file=stockKData.md
                rs = bs.query_history_k_data_plus(
                    bs_code,
                    "date,code,open,high,low,close,volume,amount,turn,pctChg",
                    start_date=start_str,
                    end_date=end_str,
                    frequency="d",  # 日K线
                    adjustflag="3"  # 不复权
                )
                
                if rs.error_code != '0':
                    raise RuntimeError(f"baostock API 错误: {rs.error_msg}")
                
                # 获取数据（按照baostock文档标准方式）
                data_list = []
                while (rs.error_code == '0') & rs.next():
                    data_list.append(rs.get_row_data())
                
                if len(data_list) == 0:
                    raise RuntimeError("返回数据为空")
                
                # 转为 DataFrame
                df = pd.DataFrame(data_list, columns=rs.fields)
                
                # 重命名列以匹配项目格式
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
                
                # 按时间排序（确保时间顺序正确）
                df = df.sort_values('timestamp')
                
                # 格式化时间戳
                df['timestamp'] = df['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S')
                
                # 保存为 CSV
                df.to_csv(csv_path, index=False, encoding='utf-8')
                
                # 更新子目录文件计数
                subdir_file_counts[target_subdir_idx] += 1
                
                print(f"✓ 成功 ({len(df)} 条) -> {target_subdir.name}")
                ok_count += 1
                
            except Exception as e:
                error_msg = str(e)
                print(f"✗ 失败: {error_msg}")
                fail_count += 1
                errors.append({'code': code, 'name': name, 'error': error_msg})
    
    finally:
        # 登出 baostock
        bs.logout()
        print("[baostock] 已登出")
    
    # 统计信息
    summary = {
        'ok': ok_count,
        'fail': fail_count,
        'total': len(stocks),
        'errors': errors[:50]  # 只返回前50个错误
    }
    
    print(f"\n[批量获取] 完成: 成功 {ok_count}, 失败 {fail_count}, 总计 {len(stocks)}")
    
    return summary


if __name__ == '__main__':
    # 支持命令行参数
    import argparse
    
    parser = argparse.ArgumentParser(description='批量获取A股日K数据')
    parser.add_argument('--dict', type=str, help='股票字典路径')
    parser.add_argument('--output', type=str, help='输出目录')
    parser.add_argument('--days', type=int, default=365, help='获取最近N天数据')
    parser.add_argument('--limit', type=int, help='限制获取数量（测试用）')
    
    args = parser.parse_args()
    
    try:
        result = batch_fetch_daily_data(
            dict_path=args.dict,
            output_dir=args.output,
            days=args.days,
            limit=args.limit
        )
        
        # 输出 JSON 格式结果（供后端调用）
        print("\n=== JSON RESULT ===")
        print(json.dumps(result, ensure_ascii=False))
        
        sys.exit(0 if result['fail'] == 0 else 1)
        
    except Exception as e:
        print(f"\n[错误] {e}", file=sys.stderr)
        sys.exit(1)
