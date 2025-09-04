#!/usr/bin/env python3
"""
测试回测API是否正常工作，确保没有无限循环
"""

import requests
import json
import time

def test_backtest_api():
    """测试回测API"""
    url = "http://localhost:8000/api/v1/backtest"
    
    # 简单的测试策略
    test_strategy = {
        "nodes": [
            {
                "id": "condition1",
                "type": "condition",
                "position": {"x": 100, "y": 100},
                "data": {
                    "type": "ma",
                    "period": 5,
                    "threshold": 0,
                    "operator": ">",
                    "nodeType": "condition",
                    "subType": "ma"
                }
            },
            {
                "id": "action1",
                "type": "action",
                "position": {"x": 300, "y": 150},
                "data": {
                    "type": "buy",
                    "quantity": 100,
                    "priceType": "market",
                    "nodeType": "action",
                    "subType": "buy"
                }
            }
        ],
        "edges": [
            {"id": "e-condition1-action1", "source": "condition1", "target": "action1"}
        ],
        "start_date": "2023-01-01",
        "end_date": "2023-12-31",
        "initial_capital": 100000.0,
        "commission_rate": 0.001
    }
    
    payload = {
        "strategy": test_strategy
    }
    
    print("开始测试回测API...")
    print(f"请求URL: {url}")
    print(f"策略节点数: {len(test_strategy['nodes'])}")
    print(f"策略边数: {len(test_strategy['edges'])}")
    
    start_time = time.time()
    
    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30  # 30秒超时
        )
        
        end_time = time.time()
        duration = end_time - start_time
        
        print(f"请求耗时: {duration:.2f}秒")
        print(f"响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 回测成功!")
            print(f"指标数量: {len(result.get('metrics', {}))}")
            print(f"资金曲线点数: {len(result.get('equity_curve', []))}")
            print(f"交易记录数: {len(result.get('trades', []))}")
            
            # 检查关键指标
            metrics = result.get('metrics', {})
            print(f"总收益率: {metrics.get('total_return', 0):.4f}")
            print(f"年化收益率: {metrics.get('annual_return', 0):.4f}")
            print(f"最大回撤: {metrics.get('max_drawdown', 0):.4f}")
            print(f"夏普比率: {metrics.get('sharpe_ratio', 0):.4f}")
            print(f"胜率: {metrics.get('win_rate', 0):.4f}")
            
            return True
        else:
            print(f"❌ 回测失败: {response.status_code}")
            print(f"错误信息: {response.text}")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ 请求超时 - 可能存在无限循环!")
        return False
    except requests.exceptions.RequestException as e:
        print(f"❌ 请求异常: {e}")
        return False
    except Exception as e:
        print(f"❌ 未知错误: {e}")
        return False

def test_health_check():
    """测试健康检查接口"""
    url = "http://localhost:8000/api/v1/health"
    
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            print("✅ 健康检查通过")
            return True
        else:
            print(f"❌ 健康检查失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 健康检查异常: {e}")
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("回测API测试")
    print("=" * 50)
    
    # 测试健康检查
    print("\n1. 测试健康检查...")
    health_ok = test_health_check()
    
    if health_ok:
        # 测试回测API
        print("\n2. 测试回测API...")
        backtest_ok = test_backtest_api()
        
        if backtest_ok:
            print("\n🎉 所有测试通过!")
        else:
            print("\n💥 回测API测试失败!")
    else:
        print("\n💥 健康检查失败，跳过回测测试")
    
    print("=" * 50)
