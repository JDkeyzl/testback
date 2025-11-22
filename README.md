# TestBack - 股票分析与选股平台

基于 FastAPI + React 构建的股票分析平台，提供条件选股、价格走势分析和最佳股票排名等功能。

## 🎯 核心功能模块

### 1. 条件选股 (Conditional Scanner)

智能筛选符合特定技术指标的股票，支持多维度条件组合。

#### 主要功能
- **MACD 筛选**：日线/周线 MACD 方向筛选，支持共振分析
- **成交量筛选**：放量倍数筛选，识别异常放量股票
- **均线筛选**：价格与移动平均线关系筛选
- **价格位置筛选**：基于历史价格区间的相对位置筛选
- **第一次主升段筛选**：识别 MACD 柱状图由绿转红后的首次主升段

#### 筛选条件
- 日线 MACD 方向（看涨/看跌）
- 周线 MACD 方向（看涨/看跌）
- 日线 MACD > 0（可选）
- 周线 MACD > 0（可选）
- 放量倍数阈值
- 短期/长期均线周期和关系
- 价格位置百分比阈值
- 数据截止日期选择

#### 导出功能
- 支持导出筛选结果为 CSV 文件
- 文件名格式：`日期_放量倍数_短均线_长均线_位置百分比_数量只.csv`
- 导出目录：`data/screening_results/`

---

### 2. 价格走势分析 (Price Trend)

分析股票在指定日期范围内的价格走势和持仓表现。

#### 主要功能
- **日期范围选择**：自定义分析的时间区间
- **CSV 批量导入**：支持上传 CSV 文件批量分析多只股票
- **价格走势展示**：显示每日价格变化和总体涨跌幅
- **汇总分析表格**：统计多只股票的平均表现
- **持仓天数分析**：分析不同持仓天数的收益情况

#### 分析指标
- **每日涨跌**：相对于前一日的涨跌幅
- **总体涨跌**：相对于基准日期的累计涨跌幅
- **汇总统计**：
  - 平均涨跌幅（按天数）
  - 上涨/下跌股票数量
  - 最大涨幅/跌幅
  - 连续上涨统计
  - 最佳持仓天数分析

#### 状态保存
- 自动保存分析结果和滚动位置
- 支持从其他页面返回后恢复状态

---

### 3. 大浪淘沙 - 最佳股票排名 (Best Stocks)

基于多维度评分系统，筛选出表现最佳的股票。

#### 评分维度
综合评分 = 加权平均，权重如下：

1. **区间收益 (Return)** - 权重 30%
   - 计算指定日期范围内的收益率

2. **最大回撤 (Max Drawdown)** - 权重 20%
   - 回撤越小越好，反映风险控制能力

3. **波动率 (Volatility)** - 权重 15%
   - 波动率越小越好，反映价格稳定性

4. **Sharpe 比率** - 权重 20%
   - 风险调整后的收益指标

5. **趋势斜率 (Trend Slope)** - 权重 10%
   - 使用线性回归计算趋势强度

6. **成交量健康度 (Volume Health)** - 权重 5%
   - 基于成交量的健康度评分

#### 主要功能
- **日期范围选择**：设置分析的时间区间
- **选股数量**：从所有股票中随机选择指定数量进行分析
- **返回前 N 只**：筛选出评分最高的 N 只股票
- **排序方式**：支持按综合评分或区间收益排序
- **实时排名**：计算过程中实时显示当前排名
- **共同特征分析**：分析前 N 名股票的共同技术特征

#### 导出功能
- 支持导出排名结果为 CSV 文件
- 文件名格式：`基准日期-数量-排名方式.csv`
- 导出目录：`data/best_stocks_results/`

#### 共同特征分析
分析前 N 名股票的共同点，包括：
- **MACD 共振**：日线/周线 MACD 状态分布
- **价格-均线关系**：多头排列、空头排列、均线粘合
- **价格位置**：底部、中下部、中部、中上部、顶部区域
- **成交量关系**：缩量、正常、温和放量、巨量
- **其他技术指标**：RSI、动量、K线形态、波动率、成交量比率、趋势强度

---

## 🚀 快速开始

### 环境要求
- Python 3.9+
- Node.js 16+
- npm 或 yarn

### 1. 安装依赖

#### 后端
```bash
cd backend
pip install -r requirements.txt
```

#### 前端
```bash
npm install
```

### 2. 启动服务

#### 方式一：使用启动脚本（推荐）
```bash
# Windows PowerShell
.\start.ps1

# Linux/Mac
./start.sh
```

#### 方式二：手动启动

**后端**：
```bash
cd backend
python run_server.py
```

**前端**：
```bash
npm run dev
```

### 3. 访问应用

- **前端应用**：http://localhost:5173
- **后端 API**：http://localhost:8000
- **API 文档**：http://localhost:8000/docs

---

## 📊 技术栈

### 前端
- **React 18** - UI 框架
- **Vite** - 构建工具
- **TailwindCSS** - 样式框架
- **shadcn/ui** - 组件库
- **Recharts** - 数据可视化
- **React Router** - 路由管理

### 后端
- **FastAPI** - Web 框架
- **Pandas** - 数据处理
- **NumPy** - 数值计算
- **SciPy** - 科学计算（线性回归等）
- **Uvicorn** - ASGI 服务器

---

## 📁 项目结构

```
testback/
├── src/                          # React 前端
│   ├── pages/                    # 页面组件
│   │   ├── ConditionalScannerPage.jsx    # 条件选股
│   │   ├── PriceTrendPage.jsx            # 价格走势分析
│   │   └── BestStocksPage.jsx            # 最佳股票排名
│   ├── components/               # 通用组件
│   │   ├── ui/                   # UI 组件
│   │   └── CommonFeaturesAnalysis.jsx    # 共同特征分析
│   └── App.jsx                   # 应用入口
├── backend/                      # FastAPI 后端
│   ├── app/
│   │   ├── api/
│   │   │   └── backtest.py       # API 路由
│   │   ├── services/
│   │   │   └── common_features_analyzer.py  # 共同特征分析
│   │   ├── data_loader.py        # 数据加载器
│   │   └── main.py               # 应用入口
│   └── requirements.txt          # Python 依赖
├── data/                         # 数据目录
│   ├── stocks/                   # 股票数据
│   ├── screening_results/        # 筛选结果
│   └── best_stocks_results/      # 最佳股票结果
├── start.ps1                     # Windows 启动脚本
└── README.md                     # 项目文档
```

---

## 🔧 API 接口

### 条件选股

#### POST `/api/v1/screener/multi-macd-async`
启动异步筛选任务

**请求体**：
```json
{
  "direction": "bull",
  "fast": 12,
  "slow": 26,
  "signal": 9,
  "endDate": "2024-01-01",
  "enableVolume": true,
  "volumeRatio": 1.5,
  "enableMA": true,
  "maShort": 5,
  "maLong": 20,
  "enablePosition": true,
  "priceThreshold": 30
}
```

#### GET `/api/v1/screener/status/{task_id}`
查询筛选任务状态

#### POST `/api/v1/screener/export-csv`
导出筛选结果为 CSV

---

### 价格走势分析

#### POST `/api/v1/price-trend/analyze`
分析股票价格走势

**请求体**：
```json
{
  "symbols": ["600000", "000001"],
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

---

### 最佳股票排名

#### POST `/api/v1/best-stocks/score-async`
启动异步评分任务

**请求体**：
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "sampleSize": 500,
  "topN": 20,
  "sortMethod": "return"
}
```

#### GET `/api/v1/best-stocks/status/{task_id}`
查询评分任务状态

#### POST `/api/v1/best-stocks/export-csv`
导出排名结果为 CSV

#### POST `/api/v1/common-features/analyze`
分析前 N 名股票的共同特征

**请求体**：
```json
{
  "symbols": ["600000", "000001"],
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "lookbackDays": 60
}
```

---

## 📈 数据说明

### 股票数据格式
CSV 文件应包含以下列：
- `timestamp` - 日期时间
- `open` - 开盘价
- `high` - 最高价
- `low` - 最低价
- `close` - 收盘价
- `volume` - 成交量
- `amount` - 成交额

### 数据目录结构
```
data/
├── stocks/
│   ├── stocks_0/
│   ├── stocks_1/
│   └── ...
├── screening_results/        # 条件选股导出结果
└── best_stocks_results/      # 最佳股票排名导出结果
```

---

## 🎨 功能特性

### 状态持久化
- 条件选股：保存筛选进度和结果
- 价格走势：保存分析结果和滚动位置
- 最佳股票：保存参数和排名结果

### 实时更新
- 条件选股：实时显示筛选进度和匹配数量
- 最佳股票：计算过程中实时显示当前排名

### 数据导出
- 支持 CSV 格式导出
- 自动生成有意义的文件名
- 使用 UTF-8-sig 编码，支持 Excel 直接打开

---

## 🔍 使用示例

### 条件选股示例
1. 设置筛选条件（MACD、成交量、均线等）
2. 选择数据截止日期
3. 点击"开始筛选"
4. 查看筛选结果
5. 导出结果为 CSV

### 价格走势分析示例
1. 选择日期范围
2. 上传包含股票代码的 CSV 文件
3. 点击"开始分析"
4. 查看每日价格变化和汇总统计
5. 分析不同持仓天数的收益

### 最佳股票排名示例
1. 设置日期范围
2. 设置选股数量（如 500）
3. 设置返回前 N 只（如 20）
4. 选择排序方式（综合评分或区间收益）
5. 点击"开始计算"
6. 查看实时排名和共同特征分析
7. 导出排名结果为 CSV

---

## 🛠️ 开发说明

### 添加新的筛选条件
1. 在 `backend/app/api/backtest.py` 中添加条件判断逻辑
2. 在前端 `ConditionalScannerPage.jsx` 中添加 UI 控件
3. 更新 API 请求参数

### 添加新的评分维度
1. 在 `_run_best_stocks_task` 函数中添加计算逻辑
2. 更新权重配置
3. 在前端显示新的指标

---

## 📝 许可证

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
