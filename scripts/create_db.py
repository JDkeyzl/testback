#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
创建SQLite数据库和表结构
"""

import sqlite3
from pathlib import Path


def create_database():
    """
    创建数据库和表结构
    """
    # 定位项目根目录和数据库路径
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    db_path = project_root / 'data' / 'stock.db'
    
    # 确保data目录存在
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 连接数据库
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"[数据库] 正在创建数据库: {db_path}")
    
    try:
        # 创建stocks表（股票基本信息）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS stocks (
                code TEXT PRIMARY KEY,
                code_name TEXT NOT NULL,
                industry TEXT
            )
        ''')
        print("[数据库] stocks表创建成功")
        
        # 创建stock_daily_data表（日K线数据）
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS stock_daily_data (
                code TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume INTEGER,
                amount REAL,
                PRIMARY KEY (code, timestamp),
                FOREIGN KEY (code) REFERENCES stocks(code) ON DELETE CASCADE
            )
        ''')
        print("[数据库] stock_daily_data表创建成功")
        
        # 创建索引以提高查询性能
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_stock_daily_data_code ON stock_daily_data(code)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_stock_daily_data_timestamp ON stock_daily_data(timestamp)
        ''')
        print("[数据库] 索引创建成功")
        
        # 提交事务
        conn.commit()
        print(f"[数据库] 数据库创建完成: {db_path}")
        
    except sqlite3.Error as e:
        print(f"[数据库] 创建失败: {e}")
        conn.rollback()
    finally:
        # 关闭连接
        conn.close()


if __name__ == '__main__':
    create_database()
