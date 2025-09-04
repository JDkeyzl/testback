# TestBack API - 策略回测后端

基于FastAPI构建的策略回测平台后端服务，提供策略回测、指标计算等功能。

## 功能特性

- 🎯 **策略回测**: 支持复杂的策略逻辑回测
- 📊 **技术指标**: 内置MA、RSI、MACD等技术指标计算
- 📈 **回测指标**: 计算胜率、盈亏比、最大回撤、夏普比率等
- 🔄 **实时数据**: 生成模拟股票数据进行回测
- 🚀 **高性能**: 基于FastAPI的异步处理

## 技术栈

- **FastAPI**: 现代、快速的Web框架
- **Pydantic**: 数据验证和序列化
- **Pandas**: 数据处理和分析
- **NumPy**: 数值计算
- **Uvicorn**: ASGI服务器

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务器

```bash
python run_server.py
```

或者使用uvicorn直接启动：

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 访问API文档

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **健康检查**: http://localhost:8000/api/v1/health

## API接口

### POST /api/v1/backtest

运行策略回测

**请求体示例**:
```json
{
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
      },
      {
        "id": "action1",
        "type": "action",
        "position": {"x": 300, "y": 100},
        "data": {
          "type": "buy",
          "quantity": 100,
          "price_type": "market"
        }
      }
    ],
    "edges": [
      {
        "id": "e1-2",
        "source": "condition1",
        "target": "action1"
      }
    ],
    "start_date": "2023-01-01",
    "end_date": "2023-12-31",
    "initial_capital": 100000.0,
    "commission_rate": 0.001
  }
}
```

**响应示例**:
```json
{
  "metrics": {
    "total_return": 0.15,
    "annual_return": 0.12,
    "max_drawdown": 0.08,
    "sharpe_ratio": 1.2,
    "win_rate": 0.65,
    "profit_loss_ratio": 1.8,
    "total_trades": 50,
    "winning_trades": 32,
    "losing_trades": 18
  },
  "equity_curve": [
    {
      "date": "2023-01-01",
      "equity": 100000.0,
      "returns": 0.0
    }
  ],
  "trades": [
    {
      "date": "2023-01-15",
      "action": "buy",
      "price": 100.0,
      "quantity": 100,
      "amount": 10000.0,
      "pnl": null
    }
  ],
  "final_equity": 115000.0
}
```

## 策略节点类型

### 条件节点 (Condition Node)

#### 移动均线 (MA)
- `period`: 周期 (1-200)
- `threshold`: 阈值
- `operator`: 操作符 (>, <, >=, <=, ==, !=)

#### RSI指标
- `period`: 周期 (1-100)
- `threshold`: RSI阈值 (0-100)
- `operator`: 操作符

#### MACD指标
- `fast`: 快线周期 (1-50)
- `slow`: 慢线周期 (1-100)
- `signal`: 信号线周期 (1-20)
- `threshold`: 阈值
- `operator`: 操作符

#### 成交量/价格
- `threshold`: 阈值
- `operator`: 操作符

### 逻辑节点 (Logic Node)

- `type`: 逻辑类型 (and, or, not)

### 动作节点 (Action Node)

- `type`: 动作类型 (buy, sell, hold)
- `quantity`: 交易数量 (买入/卖出)
- `price_type`: 价格类型 (market, limit)

## 回测指标说明

- **总收益率**: 整个回测期间的总收益百分比
- **年化收益率**: 按年计算的收益率
- **最大回撤**: 从峰值到谷值的最大跌幅
- **夏普比率**: 风险调整后的收益率
- **胜率**: 盈利交易占总交易的比例
- **盈亏比**: 平均盈利与平均亏损的比值

## 开发说明

### 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI应用入口
│   ├── models/
│   │   ├── __init__.py
│   │   └── strategy.py      # 数据模型
│   ├── services/
│   │   ├── __init__.py
│   │   └── backtest_engine.py  # 回测引擎
│   └── api/
│       ├── __init__.py
│       └── backtest.py      # API路由
├── requirements.txt         # 依赖包
├── run_server.py           # 启动脚本
└── README.md               # 说明文档
```

### 添加新的技术指标

1. 在 `BacktestEngine.generate_mock_data()` 中添加指标计算
2. 在 `BacktestEngine.evaluate_condition()` 中添加评估逻辑
3. 更新数据模型以支持新参数

### 添加新的回测指标

在 `BacktestEngine._calculate_metrics()` 中添加计算逻辑。

## 部署

### Docker部署

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 生产环境

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## 许可证

MIT License