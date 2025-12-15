#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
补全股票数据到最新日期（增量更新）
文件名: sync_data.py
功能: 检查每个股票的最后日期，只获取缺失的部分并追加
"""

import sys
import io
import baostock as bs
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta

# Windows UTF-8 编码
if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

def sync_stock_data(limit: int = None, target_date: str = None):
    """
    补全股票数据到最新日期
    
    Args:
        limit: 限制更新数量（测试用）
        target_date: 目标日期（YYYY-MM-DD），默认为今天
    """
    # 定位项目根目录
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir
    
    # 股票数据目录（所有文件直接在 stocks/ 目录下）
    stocks_dir = project_root / 'data' / 'stocks'
    if not stocks_dir.exists():
        print(f"[错误] 数据目录不存在: {stocks_dir}")
        return {"ok": 0, "skip": 0, "fail": 0, "total": 0}
    
    # 目标日期
    if target_date:
        target_dt = datetime.strptime(target_date, '%Y-%m-%d')
    else:
        target_dt = datetime.now()
    target_str = target_dt.strftime('%Y-%m-%d')
    
    print(f"[数据同步] 目标日期: {target_str}")
    print(f"[数据同步] 数据目录: {stocks_dir}")
    
    # 查找所有股票CSV文件（只在主目录，不递归子目录）
    csv_files = list(stocks_dir.glob('*.csv'))
    
    if limit and limit > 0:
        csv_files = csv_files[:limit]
    
    print(f"[数据同步] 共 {len(csv_files)} 个文件待检查\n")
    
    # 登录 baostock
    print("[baostock] 正在登录...")
    lg = bs.login()
    if lg.error_code != '0':
        print(f"[错误] baostock 登录失败: {lg.error_msg}")
        return {"ok": 0, "skip": 0, "fail": 0, "total": len(csv_files)}
    print("[baostock] 登录成功\n")
    
    ok_count = 0
    skip_count = 0
    fail_count = 0
    
    try:
        for idx, csv_file in enumerate(csv_files, 1):
            try:
                # 从文件名提取股票代码（格式：股票名称-代码.csv）
                filename = csv_file.stem
                if '-' not in filename:
                    skip_count += 1
                    continue
                
                code = filename.split('-')[-1]
                name = filename.rsplit('-', 1)[0]
                
                # 读取现有数据
                df = pd.read_csv(csv_file)
                if df.empty:
                    print(f"[{idx}/{len(csv_files)}] {name}({code}): 文件为空，跳过")
                    skip_count += 1
                    continue
                
                # 获取最后日期
                last_date_str = df['timestamp'].iloc[-1]
                last_date = pd.to_datetime(last_date_str).date()
                target_date_only = target_dt.date()
                
                # 如果已经是最新，跳过
                if last_date >= target_date_only:
                    print(f"[{idx}/{len(csv_files)}] {name}({code}): 已是最新 ({last_date}) ✓")
                    skip_count += 1
                    continue
                
                # 计算需要获取的日期范围
                start_date = last_date + timedelta(days=1)
                days_to_fetch = (target_date_only - last_date).days
                
                if days_to_fetch <= 0:
                    skip_count += 1
                    continue
                
                print(f"[{idx}/{len(csv_files)}] {name}({code}): 从 {start_date} 更新到 {target_str}...", end=' ', flush=True)
                
                # baostock 代码格式
                bs_code = f"{'sh' if code.startswith('6') else 'sz'}.{code}"
                
                # 获取新数据
                rs = bs.query_history_k_data_plus(
                    bs_code,
                    "date,code,open,high,low,close,volume,amount",
                    start_date=start_date.strftime('%Y-%m-%d'),
                    end_date=target_str,
                    frequency="d",
                    adjustflag="3"
                )
                
                if rs.error_code != '0':
                    print(f"✗ API错误: {rs.error_msg}")
                    fail_count += 1
                    continue
                
                # 获取新数据
                new_data = []
                while (rs.error_code == '0') & rs.next():
                    new_data.append(rs.get_row_data())
                
                if len(new_data) == 0:
                    print(f"✓ 无新数据")
                    skip_count += 1
                    continue
                
                # 转为 DataFrame
                new_df = pd.DataFrame(new_data, columns=rs.fields)
                new_df = new_df.rename(columns={'date': 'timestamp'})
                new_df = new_df[['timestamp', 'open', 'high', 'low', 'close', 'volume', 'amount']]
                
                # 数据类型转换
                new_df['timestamp'] = pd.to_datetime(new_df['timestamp'])
                for col in ['open', 'high', 'low', 'close', 'volume', 'amount']:
                    new_df[col] = pd.to_numeric(new_df[col], errors='coerce')
                
                # 删除无效行
                new_df = new_df.dropna(subset=['timestamp', 'open', 'high', 'low', 'close'])
                
                if len(new_df) == 0:
                    print(f"✓ 清洗后无有效数据")
                    skip_count += 1
                    continue
                
                # 格式化时间戳
                new_df['timestamp'] = new_df['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S')
                
                # 追加到现有数据
                combined_df = pd.concat([df, new_df], ignore_index=True)
                
                # 去重并按时间排序
                combined_df['timestamp'] = pd.to_datetime(combined_df['timestamp'])
                combined_df = combined_df.drop_duplicates(subset=['timestamp'], keep='last')
                combined_df = combined_df.sort_values('timestamp')
                combined_df['timestamp'] = combined_df['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S')
                
                # 保存
                combined_df.to_csv(csv_file, index=False, encoding='utf-8')
                
                new_last_date = pd.to_datetime(combined_df['timestamp'].iloc[-1]).date()
                print(f"✓ 追加 {len(new_df)} 条，最新: {new_last_date}")
                ok_count += 1
                
            except Exception as e:
                print(f"[{idx}/{len(csv_files)}] {csv_file.name}: ✗ 失败 - {e}")
                fail_count += 1
    
    finally:
        bs.logout()
        print("\n[baostock] 已登出")
    
    summary = {
        "ok": ok_count,
        "skip": skip_count,
        "fail": fail_count,
        "total": len(csv_files)
    }
    
    print(f"\n[数据同步] 完成:")
    print(f"  更新: {ok_count}")
    print(f"  跳过: {skip_count}")
    print(f"  失败: {fail_count}")
    print(f"  总计: {len(csv_files)}")
    
    return summary

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='补全股票数据到最新日期')
    parser.add_argument('--limit', type=int, help='限制更新数量（测试用）')
    parser.add_argument('--date', type=str, help='目标日期（YYYY-MM-DD），默认为今天')
    
    args = parser.parse_args()
    
    try:
        result = sync_stock_data(
            limit=args.limit,
            target_date=args.date
        )
        
        import json
        print("\n=== JSON RESULT ===")
        print(json.dumps(result, ensure_ascii=False))
        
        sys.exit(0 if result['fail'] == 0 else 1)
    except Exception as e:
        print(f"\n[错误] {e}", file=sys.stderr)
        sys.exit(1)

