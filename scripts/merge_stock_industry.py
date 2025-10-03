#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Merge stock industry data from Baostock with local stock list JSON.

- Input stock list: data/stockList/all_pure_stock.json (array of { code, code_name })
- Fetch industries via baostock.query_stock_industry()
- Merge by `code` (e.g., "sh.600000")
- Output enriched JSON: data/stockList/all_stock_with_industry.json with fields:
  { code, code_name, industry, industryClassification, updateDate }

Usage:
  python scripts/merge_stock_industry.py --input data/stockList/all_pure_stock.json \
      --output data/stockList/all_stock_with_industry.json

Requires: baostock, pandas
"""
import os
import sys
import json
import argparse
from typing import Dict, Any, List

try:
    import baostock as bs
    import pandas as pd
except Exception as e:
    print(f"[ERROR] Missing dependency: {e}. Install via: pip install baostock pandas", file=sys.stderr)
    sys.exit(1)


def load_stock_list(path: str) -> List[Dict[str, Any]]:
    if not os.path.exists(path):
        raise FileNotFoundError(f"Stock list not found: {path}")
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("Stock list JSON must be an array")
    return data


def fetch_industry_df() -> pd.DataFrame:
    lg = bs.login()
    if lg.error_code != '0':
        raise RuntimeError(f"baostock login failed: {lg.error_msg}")
    try:
        rs = bs.query_stock_industry()
        industry_list: List[List[str]] = []
        while (rs.error_code == '0') & rs.next():
            industry_list.append(rs.get_row_data())
        df = pd.DataFrame(industry_list, columns=rs.fields)
        # Expected columns include: updateDate, code, code_name, industry, industryClassification
        # Keep only needed columns and drop duplicates by code keeping latest updateDate
        if 'updateDate' in df.columns:
            df['updateDate'] = pd.to_datetime(df['updateDate'], errors='coerce')
        # Normalize code to lower-case prefix style
        if 'code' in df.columns:
            df['code'] = df['code'].astype(str)
        # Keep latest per code
        if 'updateDate' in df.columns:
            df = df.sort_values(['code', 'updateDate']).drop_duplicates(['code'], keep='last')
        return df
    finally:
        bs.logout()


def normalize_code(code: str) -> str:
    # Ensure format like "sh.600000" / "sz.000001"
    c = str(code).strip()
    return c


def merge_stock_and_industry(stock_list: List[Dict[str, Any]], df: pd.DataFrame) -> List[Dict[str, Any]]:
    df2 = df.copy()
    need_cols = ['code', 'industry', 'industryClassification', 'updateDate']
    for col in need_cols:
        if col not in df2.columns:
            df2[col] = None
    # Map code->row
    ind_by_code: Dict[str, Dict[str, Any]] = {
        normalize_code(row['code']): {
            'industry': row['industry'],
            'industryClassification': row['industryClassification'],
            'updateDate': row['updateDate'].strftime('%Y-%m-%d') if hasattr(row['updateDate'], 'strftime') and pd.notna(row['updateDate']) else (str(row['updateDate']) if row['updateDate'] is not None else None)
        }
        for _, row in df2.iterrows()
    }
    enriched: List[Dict[str, Any]] = []
    for item in stock_list:
        code = normalize_code(item.get('code'))
        entry = {
            'code': code,
            'code_name': item.get('code_name'),
        }
        ind = ind_by_code.get(code)
        if ind:
            entry.update(ind)
        enriched.append(entry)
    return enriched


def main():
    parser = argparse.ArgumentParser(description='Merge Baostock industry data into local stock list JSON')
    parser.add_argument('--input', default=os.path.join('data', 'stockList', 'all_pure_stock.json'), help='Path to input stock list JSON')
    parser.add_argument('--output', default=os.path.join('data', 'stockList', 'all_stock_with_industry.json'), help='Path to output JSON')
    args = parser.parse_args()

    try:
        stock_list = load_stock_list(args.input)
        df_ind = fetch_industry_df()
        merged = merge_stock_and_industry(stock_list, df_ind)
        os.makedirs(os.path.dirname(args.output), exist_ok=True)
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(merged, f, ensure_ascii=False, indent=2)
        print(f"[OK] Wrote merged list: {args.output} (count={len(merged)})")
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
