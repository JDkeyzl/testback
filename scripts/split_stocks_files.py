#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
切分现有的stocks文件到10个子目录
每个子目录最多500个文件
"""

import os
import shutil
from pathlib import Path
from collections import defaultdict

def split_stocks_files(stocks_dir: str = None):
    """
    将stocks目录下的文件分散到10个子目录中
    
    Args:
        stocks_dir: stocks目录路径，默认为项目根目录下的 data/stocks
    """
    # 定位项目根目录
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    
    if stocks_dir is None:
        stocks_dir = project_root / 'data' / 'stocks'
    else:
        stocks_dir = Path(stocks_dir)
    
    if not stocks_dir.exists():
        print(f"错误: stocks目录不存在: {stocks_dir}")
        return
    
    print(f"[切分文件] 源目录: {stocks_dir}")
    
    # 获取所有CSV文件（排除子目录）
    csv_files = []
    for item in stocks_dir.iterdir():
        if item.is_file() and item.suffix.lower() == '.csv':
            csv_files.append(item)
    
    if len(csv_files) == 0:
        print("[切分文件] 未找到CSV文件")
        return
    
    print(f"[切分文件] 找到 {len(csv_files)} 个CSV文件")
    
    # 创建10个子目录
    subdirs = []
    for i in range(10):
        subdir = stocks_dir / f'stocks_{i}'
        subdir.mkdir(parents=True, exist_ok=True)
        subdirs.append(subdir)
        print(f"[切分文件] 创建子目录: {subdir.name}")
    
    # 统计每个子目录的现有文件数
    subdir_file_counts = {}
    for i, subdir in enumerate(subdirs):
        existing_files = list(subdir.glob('*.csv'))
        subdir_file_counts[i] = len(existing_files)
        if existing_files:
            print(f"[切分文件] {subdir.name} 已有 {len(existing_files)} 个文件")
    
    # 分配文件到子目录
    moved_count = 0
    skipped_count = 0
    
    for idx, csv_file in enumerate(csv_files, 1):
        # 找到文件数量最少的子目录
        min_count = min(subdir_file_counts.values())
        target_subdir_idx = min([i for i, count in subdir_file_counts.items() if count == min_count])
        
        # 如果目标子目录已满（500个），找下一个未满的
        if subdir_file_counts[target_subdir_idx] >= 500:
            # 找第一个未满的子目录
            target_subdir_idx = next((i for i, count in subdir_file_counts.items() if count < 500), None)
            if target_subdir_idx is None:
                print(f"[切分文件] 警告: 所有子目录都已满（500个文件），跳过剩余文件")
                skipped_count = len(csv_files) - idx + 1
                break
        
        target_subdir = subdirs[target_subdir_idx]
        target_path = target_subdir / csv_file.name
        
        # 如果目标文件已存在，跳过
        if target_path.exists():
            print(f"[{idx}/{len(csv_files)}] 跳过 {csv_file.name} (目标文件已存在)")
            skipped_count += 1
            continue
        
        try:
            # 移动文件
            shutil.move(str(csv_file), str(target_path))
            subdir_file_counts[target_subdir_idx] += 1
            moved_count += 1
            if idx % 100 == 0 or idx == len(csv_files):
                print(f"[{idx}/{len(csv_files)}] 已移动 {moved_count} 个文件，当前: {csv_file.name} -> {target_subdir.name}")
        except Exception as e:
            print(f"[{idx}/{len(csv_files)}] 移动失败 {csv_file.name}: {e}")
            skipped_count += 1
    
    # 输出统计信息
    print(f"\n[切分文件] 完成!")
    print(f"  移动文件: {moved_count}")
    print(f"  跳过文件: {skipped_count}")
    print(f"  总计: {len(csv_files)}")
    print(f"\n各子目录文件数:")
    for i, subdir in enumerate(subdirs):
        count = subdir_file_counts[i]
        print(f"  {subdir.name}: {count} 个文件")


if __name__ == '__main__':
    import sys
    import argparse
    
    parser = argparse.ArgumentParser(description='切分stocks文件到10个子目录')
    parser.add_argument('--stocks-dir', type=str, help='stocks目录路径')
    
    args = parser.parse_args()
    
    try:
        split_stocks_files(stocks_dir=args.stocks_dir)
    except Exception as e:
        print(f"\n[错误] {e}", file=sys.stderr)
        sys.exit(1)

