#!/usr/bin/env python3
"""
测试简化的回测API
"""

import requests
import json

def test_simple_backtest():
    """测试简化的回测API"""
    url = "http://localhost:8000/api/v1/backtest"
    
    # 使用与前端完全相同的格式
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
    
    print("测试数据:")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    
    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"\n响应状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 回测成功!")
            print(f"指标: {result.get('metrics', {})}")
            print(f"资金曲线点数: {len(result.get('equity_curve', []))}")
            print(f"交易记录数: {len(result.get('trades', []))}")
            return True
        else:
            print(f"❌ 回测失败: {response.status_code}")
            print(f"错误信息: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 请求异常: {e}")
        return False

if __name__ == "__main__":
    test_simple_backtest()
