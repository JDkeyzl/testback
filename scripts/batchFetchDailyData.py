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
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta

# 在 Windows 上强制使用 UTF-8 编码输出，避免特殊字符编码错误
if sys.platform == 'win32':
    import io
    # 重新配置 stdout 和 stderr 使用 UTF-8 编码
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')


def batch_fetch_daily_data(
    days: int = 365,
    limit: int = None
):
    """
    批量获取A股日K数据
    
    Args:
        days: 获取最近N天数据，默认365
        limit: 限制获取数量，用于测试
    
    Returns:
        dict: 统计信息 {ok: int, fail: int, total: int, errors: list}
    """
    # 定位项目根目录
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    
    # 数据库路径
    db_path = project_root / 'data' / 'stock.db'
    
    def get_db_connection():
        """
        获取数据库连接
        """
        return sqlite3.connect(db_path)
    
    # 从数据库获取股票列表
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        print(f"[批量获取] 正在从数据库获取股票列表...")
        
        # 执行查询
        cursor.execute('SELECT code, code_name, code_prefix FROM stocks')
        stock_rows = cursor.fetchall()
        
        if not stock_rows:
            raise ValueError("数据库中没有股票数据，请先运行import_stocks.py导入股票列表")
        
        # 转换为股票列表格式
        stocks = []
        for row in stock_rows:
            code, code_name, code_prefix = row
            stocks.append({'code': code, 'name': code_name or code, 'code_prefix': code_prefix})
        
        # 限制获取数量
        if limit and isinstance(limit, int) and limit > 0:
            stocks = stocks[:limit]
        
        print(f"[批量获取] 共 {len(stocks)} 只股票待处理")
        print(f"[批量获取] 数据范围: 最近 {days} 天")
        print(f"[批量获取] 数据将保存到数据库: {db_path}")
    finally:
        conn.close()
    
    # 计算日期范围
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    # 登录 baostock（单次登录，循环使用）
    def ensure_login():
        """确保 baostock 已登录，如果未登录则重新登录"""
        lg = bs.login()
        if lg.error_code != '0':
            raise RuntimeError(f"baostock 登录失败: {lg.error_msg}")
        return lg
    
    print("[baostock] 正在登录...")
    ensure_login()
    print("[baostock] 登录成功")
    
    # 批量获取
    ok_count = 0
    fail_count = 0
    errors = []
    last_login_time = datetime.now()
    login_interval = timedelta(minutes=30)  # 每30分钟检查一次登录状态
    
    try:
        for idx, stock in enumerate(stocks, 1):
            code = stock['code']
            name = stock['name']
            
            # baostock 代码格式：sh.600000 或 sz.000001
            bs_code = f"{stock['code_prefix']}.{code}"
            
            # 从数据库获取行业信息
            industry = ''
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute('SELECT industry FROM stocks WHERE code = ?', (code,))
                result = cursor.fetchone()
                if result:
                    industry = result[0]
            finally:
                conn.close()
            
            try:
                print(f"[{idx}/{len(stocks)}] 正在获取 {name}({code})...", end=' ', flush=True)
                
                # 定期检查登录状态（每30分钟或每100只股票）
                current_time = datetime.now()
                if (current_time - last_login_time) > login_interval or (idx % 100 == 0):
                    try:
                        # 尝试一个简单的查询来检查登录状态
                        test_rs = bs.query_history_k_data_plus(
                            "sh.600000",
                            "date",
                            start_date=start_str,
                            end_date=start_str,
                            frequency="d",
                            adjustflag="3"
                        )
                        if test_rs.error_code != '0' and "未登录" in test_rs.error_msg:
                            print(f"\n[baostock] 检测到登录过期，正在重新登录...", flush=True)
                            bs.logout()  # 先登出
                            ensure_login()
                            last_login_time = datetime.now()
                            print(f"[baostock] 重新登录成功", flush=True)
                    except:
                        # 如果检查失败，尝试重新登录
                        try:
                            bs.logout()
                        except:
                            pass
                        print(f"\n[baostock] 检测到登录问题，正在重新登录...", flush=True)
                        ensure_login()
                        last_login_time = datetime.now()
                        print(f"[baostock] 重新登录成功", flush=True)
                
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
                    # 如果是登录错误，尝试重新登录并重试一次
                    if "未登录" in rs.error_msg:
                        print(f"\n[baostock] 检测到登录过期，正在重新登录并重试...", flush=True)
                        try:
                            bs.logout()
                        except:
                            pass
                        ensure_login()
                        last_login_time = datetime.now()
                        # 重试一次
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
                
                # 调试：输出最后日期
                last_date = df['timestamp'].iloc[-1] if len(df) > 0 else 'N/A'
                
                # 保存到数据库
                conn = get_db_connection()
                try:
                    # 插入或更新股票基本信息
                    conn.execute('''
                        INSERT OR REPLACE INTO stocks (code, code_name, industry)
                        VALUES (?, ?, ?)
                    ''', (code, name, industry))
                    
                    # 批量插入数据
                    # 使用参数化查询来提高性能
                    for _, row in df.iterrows():
                        try:
                            conn.execute('''
                                INSERT OR IGNORE INTO stock_daily_data 
                                (code, timestamp, open, high, low, close, volume, amount)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (code, row['timestamp'], row['open'], row['high'], 
                                  row['low'], row['close'], row['volume'], row['amount']))
                        except Exception as e:
                            # 单个数据行插入失败，继续处理下一行
                            print(f"\n[警告] 数据行插入失败: {e}")
                            continue
                    
                    # 提交事务
                    conn.commit()
                    
                    print(f"✓ 成功 ({len(df)} 条, 最后: {last_date})")
                    ok_count += 1
                except Exception as e:
                    raise e
                finally:
                    conn.close()
                
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
    parser.add_argument('--days', type=int, default=365, help='获取最近N天数据')
    parser.add_argument('--limit', type=int, help='限制获取数量（测试用）')
    
    args = parser.parse_args()
    
    try:
        result = batch_fetch_daily_data(
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
