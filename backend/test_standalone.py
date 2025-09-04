#!/usr/bin/env python3
import requests
import json

# 测试数据
test_data = {
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

def test_api():
    try:
        print("🔍 测试健康检查...")
        response = requests.get("http://localhost:8000/api/v1/health")
        print(f"健康检查状态: {response.status_code}")
        print(f"响应: {response.json()}")
        print()
        
        print("🚀 测试回测接口...")
        response = requests.post(
            "http://localhost:8000/api/v1/backtest",
            headers={"Content-Type": "application/json"},
            json=test_data
        )
        
        print(f"回测接口状态: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ 回测成功!")
            print(f"总收益率: {result['metrics']['total_return']:.2%}")
            print(f"年化收益率: {result['metrics']['annual_return']:.2%}")
            print(f"最大回撤: {result['metrics']['max_drawdown']:.2%}")
            print(f"夏普比率: {result['metrics']['sharpe_ratio']:.2f}")
            print(f"胜率: {result['metrics']['win_rate']:.2%}")
            print(f"盈亏比: {result['metrics']['profit_loss_ratio']:.2f}")
            print(f"总交易次数: {result['metrics']['total_trades']}")
            print(f"最终资金: {result['final_equity']:.2f}")
        else:
            print("❌ 回测失败!")
            print(f"错误信息: {response.text}")
            
    except Exception as e:
        print(f"❌ 测试失败: {e}")

if __name__ == "__main__":
    test_api()
