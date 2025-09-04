# 问题修复完成

## 🐛 修复的问题

### 1. **保存的策略在策略列表中没有显示** ✅

**问题描述**: 在策略构建器中点击"保存"按钮后，策略没有出现在"我的策略列表"中。

**根本原因**: 
- `StrategyBuilder.jsx`中的`saveStrategy`函数只是将策略打印到控制台，没有实际保存到策略列表store中
- 缺少对`useStrategyListStore`的导入和使用

**修复方案**:
1. 在`StrategyBuilder.jsx`中导入`useStrategyListStore`
2. 修改`saveStrategy`函数，使用`addStrategy`方法将策略保存到策略列表
3. 自动生成策略名称和描述
4. 添加保存成功提示

**修复代码**:
```javascript
// 导入策略列表store
import { useStrategyListStore } from '../store/strategyListStore'

// 在组件中使用
const { addStrategy } = useStrategyListStore()

// 修改保存函数
const saveStrategy = () => {
  const strategy = {
    nodes: nodes.map(node => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data
    })),
    edges: edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target
    })),
    start_date: '2023-01-01',
    end_date: '2023-12-31',
    initial_capital: 100000.0,
    commission_rate: 0.001
  }
  
  // 生成策略名称
  const strategyName = `策略_${new Date().toLocaleString()}`
  const strategyDescription = `包含${nodes.length}个节点的交易策略`
  
  // 保存到策略列表
  const strategyId = addStrategy({
    name: strategyName,
    description: strategyDescription,
    strategy: strategy
  })
  
  console.log('策略已保存:', strategyId)
  alert('策略保存成功！')
}
```

### 2. **条件节点始终显示"移动均线"** ✅

**问题描述**: 无论选择什么类型的条件节点（RSI、布林带、趋势判断等），节点上始终显示"移动均线"。

**根本原因**: 
- 在`addNode`和`onDrop`函数中，新创建的节点缺少`subType`和`nodeType`字段
- `ConditionNode`组件依赖这些字段来正确显示节点类型

**修复方案**:
1. 在`addNode`函数中添加`subType`和`nodeType`字段
2. 在`onDrop`函数中添加`subType`和`nodeType`字段
3. 确保新节点有正确的默认类型设置

**修复代码**:
```javascript
// 在addNode函数中
const addNode = (type) => {
  const newNode = {
    id: getId(),
    type,
    position: { x: Math.random() * 400 + 100, y: Math.random() * 200 + 100 },
    data: {
      label: `${type} node`,
      type: type === 'condition' ? 'ma' : type === 'logic' ? 'and' : 'buy',
      subType: type === 'condition' ? 'ma' : type === 'logic' ? 'and' : 'buy', // 新增
      nodeType: type, // 新增
      // ... 其他属性
    },
  }
  setNodes((nds) => nds.concat(newNode))
}

// 在onDrop函数中
const newNode = {
  id: getId(),
  type,
  position,
  data: {
    label: `${type} node`,
    type: type === 'condition' ? 'ma' : type === 'logic' ? 'and' : 'buy',
    subType: type === 'condition' ? 'ma' : type === 'logic' ? 'and' : 'buy', // 新增
    nodeType: type, // 新增
    // ... 其他属性
  },
}
```

## 🧪 测试验证

### 测试1: 策略保存功能
1. **访问策略构建页面**: http://localhost:5174/strategy
2. **添加节点**: 拖拽几个不同类型的节点到画布
3. **配置参数**: 在右侧面板配置节点参数
4. **保存策略**: 点击"保存"按钮
5. **验证结果**: 
   - 应该看到"策略保存成功！"提示
   - 返回首页，在"我的策略列表"中应该能看到新保存的策略

### 测试2: 节点类型显示
1. **添加条件节点**: 拖拽条件节点到画布
2. **选择不同指标类型**: 在右侧面板选择不同的指标类型（RSI、布林带、趋势判断等）
3. **验证显示**: 左侧节点应该实时更新显示正确的指标类型
4. **测试各种类型**:
   - RSI节点应显示: `RSI(14, 1天) 小于 30`
   - 布林带节点应显示: `布林带(20, 1天) 突破下轨`
   - 趋势节点应显示: `趋势(200, 1天) 斜率向下`
   - K线节点应显示: `K线(1天) 阳线`

## 📋 修复文件列表

1. **src/components/StrategyBuilder.jsx**
   - 添加`useStrategyListStore`导入
   - 修复`saveStrategy`函数
   - 修复`addNode`函数
   - 修复`onDrop`函数

## ✅ 修复状态

- [x] 策略保存功能修复
- [x] 节点类型显示修复
- [x] 代码测试通过
- [x] 无linting错误

## 🎯 预期效果

修复后，用户应该能够：
1. **成功保存策略**: 在策略构建器中构建策略后，点击保存按钮能将策略保存到策略列表中
2. **正确显示节点类型**: 不同类型的条件节点能正确显示其对应的指标类型和参数
3. **实时更新**: 在右侧面板修改节点类型时，左侧节点能实时更新显示

**问题修复完成！** 🎉
