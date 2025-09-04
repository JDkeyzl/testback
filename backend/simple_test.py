#!/usr/bin/env python3
import requests
import json

# 简化的测试数据
simple_data = {
    "strategy": {
        "nodes": [
            {
                "id": "condition1",
                "type": "condition",
                "position": {"x": 100, "y": 100},
                "data": {
                    "type": "ma",
                    "period": 20,
                    "threshold": 50.0,
                    "operator": ">"
                }
            }
        ],
        "edges": [],
        "start_date": "2023-01-01",
        "end_date": "2023-12-31",
        "initial_capital": 100000.0,
        "commission_rate": 0.001
    }
}

def test_simple():
    try:
        print("🚀 测试简化回测接口...")
        response = requests.post(
            "http://localhost:8000/api/v1/backtest",
            headers={"Content-Type": "application/json"},
            json=simple_data
        )
        
        print(f"状态码: {response.status_code}")
        print(f"响应头: {dict(response.headers)}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 回测成功!")
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print("❌ 回测失败!")
            print(f"错误信息: {response.text}")
            
    except Exception as e:
        print(f"❌ 测试失败: {e}")

if __name__ == "__main__":
    test_simple()
