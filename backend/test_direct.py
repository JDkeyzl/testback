#!/usr/bin/env python3
import sys
sys.path.append('.')

from app.models.simple import SimpleBacktestRequest, SimpleStrategyDefinition
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

def test_model():
    try:
        print("🔍 测试数据模型...")
        
        # 直接创建模型实例
        request = SimpleBacktestRequest(**test_data)
        print("✅ 数据模型验证成功!")
        print(f"策略节点数量: {len(request.strategy.nodes)}")
        print(f"策略连接数量: {len(request.strategy.edges)}")
        print(f"开始日期: {request.strategy.start_date}")
        print(f"结束日期: {request.strategy.end_date}")
        print(f"初始资金: {request.strategy.initial_capital}")
        
        # 转换为JSON
        json_data = request.model_dump()
        print("✅ JSON序列化成功!")
        print(json.dumps(json_data, indent=2, ensure_ascii=False))
        
    except Exception as e:
        print(f"❌ 数据模型测试失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_model()
