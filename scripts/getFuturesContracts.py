#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
拉取国内期货合约列表，生成 data/features/contracts.csv

用法：
  python scripts/getFuturesContracts.py --output data/features/contracts.csv

说明：
- 优先尝试 AkShare 的多种合约列表接口；不同版本函数名可能不同。
- 统一输出两列：symbol,name（UTF-8）。
- 若第三方不可用，脚本将给出友好错误信息。
"""

import os
import sys
import csv
import json
import argparse
from typing import List, Dict, Any


def try_import_akshare():
    try:
        import akshare as ak  # type: ignore
        return ak
    except Exception as e:
        print("[ERROR] 无法导入 akshare，请先安装：pip install akshare", file=sys.stderr)
        raise


def normalize_contracts(df) -> List[Dict[str, Any]]:
    import pandas as pd  # lazy import
    if df is None:
        return []
    if not hasattr(df, 'empty'):
        return []
    if df.empty:
        return []

    # 统一列名到小写，便于匹配
    cols = {str(c).strip().lower(): c for c in df.columns}

    # 可能的字段名
    symbol_keys = [
        'symbol', 'contract', 'code', '合约代码', '合约', '品种代码', 'contract_id'
    ]
    name_keys = [
        'name', 'cn', 'zh', '中文名', '品种', 'variety', 'underlying_symbol_name'
    ]

    # 选择映射到标准字段
    def pick(col_keys):
        for k in col_keys:
            if k in cols:
                return cols[k]
        return None

    col_symbol = pick(symbol_keys)
    col_name = pick(name_keys)

    out: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        sym = str(row[col_symbol]).strip() if col_symbol in row else ''
        nm = str(row[col_name]).strip() if (col_name and col_name in row) else ''
        if not sym or sym.lower() == 'nan':
            continue
        out.append({'symbol': sym, 'name': nm})

    # 去重
    seen = set()
    dedup: List[Dict[str, Any]] = []
    for it in out:
        key = it['symbol']
        if key in seen:
            continue
        seen.add(key)
        dedup.append(it)

    # 排序
    dedup.sort(key=lambda x: x['symbol'])
    return dedup


def fetch_contracts() -> List[Dict[str, Any]]:
    ak = try_import_akshare()

    candidates = [
        ('futures_zh_contract_sina', {}),
        ('futures_zh_symbol_sina', {}),
        # 有些接口返回一列字符串（如合约列表），需要专门处理
        ('futures_zh_minute_sina', {'symbol': 'p2601', 'period': '5'}),  # 用来探测可用性
    ]

    last_err = None
    for func_name, kwargs in candidates:
        func = getattr(ak, func_name, None)
        if func is None:
            continue
        try:
            df = func(**kwargs)
            # 特殊处理：若接口返回 Series/单列，需要转换
            import pandas as pd
            if not hasattr(df, 'columns') and hasattr(df, 'values'):
                series_values = list(map(str, list(df.values)))
                df = pd.DataFrame({'symbol': series_values})
            elif hasattr(df, 'columns') and len(getattr(df, 'columns', [])) == 1 and str(df.columns[0]).lower() not in ['symbol','contract','code','合约代码']:
                # 单列但列名不可用，重命名
                df.columns = ['symbol']
            items = normalize_contracts(df)
            if items:
                print(f"[INFO] 使用 {func_name} 获取到 {len(items)} 条合约/样本")
                return items
        except Exception as e:
            last_err = e
            continue

    # 若均失败
    msg = "未能通过可用的 AkShare 接口获取到期货合约列表"
    if last_err:
        msg += f"，最后错误：{last_err}"
    raise RuntimeError(msg)


def ensure_dir(path: str):
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)


def save_csv(rows: List[Dict[str, Any]], output: str):
    ensure_dir(output)
    with open(output, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['symbol', 'name'])
        writer.writeheader()
        for r in rows:
            writer.writerow({'symbol': r.get('symbol', ''), 'name': r.get('name', '')})
    print(f"[OK] 成功写入 {len(rows)} 条到 {output}")


def save_json(rows: List[Dict[str, Any]], output_json: str):
    ensure_dir(output_json)
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    print(f"[OK] 同步写入 JSON 到 {output_json}")


def main():
    parser = argparse.ArgumentParser(description='Fetch futures contracts and save to CSV')
    parser.add_argument('--output', default=os.path.join('data', 'features', 'contracts.csv'))
    parser.add_argument('--also-json', action='store_true', help='同时输出 contracts.json')
    args = parser.parse_args()

    try:
        rows = fetch_contracts()
        save_csv(rows, args.output)
        if args.also_json:
            json_path = os.path.join(os.path.dirname(args.output), 'contracts.json')
            save_json(rows, json_path)
    except Exception as e:
        print(f"[ERROR] 拉取失败：{e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()


