#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
验证数据库中的数据
"""

import sqlite3
from pathlib import Path


def verify_database():
    """
    验证数据库中的数据
    """
    # 定位项目根目录和数据库路径
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    db_path = project_root / 'data' / 'stock.db'
    
    # 连接数据库
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"[验证] 正在连接数据库: {db_path}")
    
    try:
        # 检查stocks表中的数据
        cursor.execute('SELECT COUNT(*) FROM stocks')
        stock_count = cursor.fetchone()[0]
        print(f"[验证] stocks表中的股票数量: {stock_count}")
        
        # 检查stocks表中的数据样本
        cursor.execute('SELECT * FROM stocks LIMIT 5')
        stocks = cursor.fetchall()
        print("[验证] stocks表数据样本:")
        for stock in stocks:
            print(f"  代码: {stock[0]}, 名称: {stock[1]}, 行业: {stock[2]}")
        
        # 检查stock_daily_data表中的数据
        cursor.execute('SELECT COUNT(*) FROM stock_daily_data')
        daily_count = cursor.fetchone()[0]
        print(f"[验证] stock_daily_data表中的记录数量: {daily_count}")
        
        # 检查stock_daily_data表中的数据样本
        cursor.execute('SELECT * FROM stock_daily_data LIMIT 5')
        daily_data = cursor.fetchall()
        print("[验证] stock_daily_data表数据样本:")
        for data in daily_data:
            print(f"  代码: {data[0]}, 时间: {data[1]}, 开盘: {data[2]}, 最高: {data[3]}, 最低: {data[4]}, 收盘: {data[5]}, 成交量: {data[6]}, 成交额: {data[7]}")
        
        # 检查是否有重复数据（应该没有，因为我们使用了INSERT OR IGNORE）
        cursor.execute('''
            SELECT code, timestamp, COUNT(*) 
            FROM stock_daily_data 
            GROUP BY code, timestamp 
            HAVING COUNT(*) > 1
        ''')
        duplicates = cursor.fetchall()
        if len(duplicates) > 0:
            print(f"[验证] 发现重复数据: {len(duplicates)} 条")
        else:
            print("[验证] 没有发现重复数据")
            
        print("[验证] 数据库验证完成")
        
    except sqlite3.Error as e:
        print(f"[验证] 数据库验证失败: {e}")
    finally:
        # 关闭连接
        conn.close()


if __name__ == '__main__':
    verify_database()
