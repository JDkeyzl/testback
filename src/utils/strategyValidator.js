/**
 * 策略验证工具
 * 检查策略的完整性和逻辑正确性
 */

export const STRATEGY_VALIDATION_RULES = {
  // 必须包含的节点类型
  REQUIRED_NODE_TYPES: {
    BUY_CONDITION: 'condition', // 买入条件
    SELL_CONDITION: 'condition', // 卖出条件
    BUY_ACTION: 'action', // 买入动作
    SELL_ACTION: 'action' // 卖出动作
  },
  
  // 最小节点数量
  MIN_NODES: 4,
  
  // 必须包含的动作类型
  REQUIRED_ACTION_TYPES: ['buy', 'sell'],
  
  // 必须包含的条件类型
  REQUIRED_CONDITION_TYPES: ['ma', 'rsi', 'bollinger', 'vwap', 'volume', 'trend', 'candlestick']
}

/**
 * 验证策略完整性
 * @param {Object} strategy - 策略对象
 * @returns {Object} 验证结果
 */
export function validateStrategy(strategy) {
  const errors = []
  const warnings = []
  
  if (!strategy || !strategy.nodes || !Array.isArray(strategy.nodes)) {
    return {
      isValid: false,
      errors: ['策略定义无效：缺少节点数据'],
      warnings: []
    }
  }
  
  const nodes = strategy.nodes
  const edges = strategy.edges || []
  
  // 检查节点数量
  if (nodes.length < STRATEGY_VALIDATION_RULES.MIN_NODES) {
    errors.push(`策略节点数量不足：至少需要${STRATEGY_VALIDATION_RULES.MIN_NODES}个节点`)
  }
  
  // 分析节点类型
  const nodeTypes = {
    condition: nodes.filter(n => n.type === 'condition'),
    action: nodes.filter(n => n.type === 'action'),
    logic: nodes.filter(n => n.type === 'logic')
  }
  
  // 检查条件节点
  if (nodeTypes.condition.length === 0) {
    errors.push('策略缺少条件节点：需要至少一个买入条件和卖出条件')
  }
  
  // 检查动作节点
  if (nodeTypes.action.length === 0) {
    errors.push('策略缺少动作节点：需要买入和卖出动作')
  }
  
  // 检查买入和卖出动作
  const buyActions = nodeTypes.action.filter(n => n.data?.subType === 'buy')
  const sellActions = nodeTypes.action.filter(n => n.data?.subType === 'sell')
  
  if (buyActions.length === 0) {
    errors.push('策略缺少买入动作：无法执行买入操作')
  }
  
  if (sellActions.length === 0) {
    errors.push('策略缺少卖出动作：无法执行卖出操作')
  }
  
  // 检查条件节点是否有买入和卖出逻辑
  const buyConditions = nodeTypes.condition.filter(n => 
    n.data?.operator === 'above' || n.data?.operator === 'crossover' || n.data?.operator === 'below'
  )
  const sellConditions = nodeTypes.condition.filter(n => 
    n.data?.operator === 'below' || n.data?.operator === 'crossunder' || n.data?.operator === 'above'
  )
  
  if (buyConditions.length === 0) {
    warnings.push('建议添加买入条件：当前策略可能无法确定买入时机')
  }
  
  if (sellConditions.length === 0) {
    warnings.push('建议添加卖出条件：当前策略可能无法确定卖出时机')
  }
  
  // 检查连接关系
  if (edges.length === 0) {
    warnings.push('策略节点未连接：请添加节点之间的连接关系')
  }
  
  // 检查买入条件是否连接到买入动作
  const buyConnections = edges.filter(e => 
    buyActions.some(a => a.id === e.target) && 
    buyConditions.some(c => c.id === e.source)
  )
  
  if (buyConnections.length === 0 && buyActions.length > 0 && buyConditions.length > 0) {
    warnings.push('买入条件未连接到买入动作：请检查节点连接')
  }
  
  // 检查卖出条件是否连接到卖出动作
  const sellConnections = edges.filter(e => 
    sellActions.some(a => a.id === e.target) && 
    sellConditions.some(c => c.id === e.source)
  )
  
  if (sellConnections.length === 0 && sellActions.length > 0 && sellConditions.length > 0) {
    warnings.push('卖出条件未连接到卖出动作：请检查节点连接')
  }
  
  // 检查仓位管理
  const hasPositionManagement = nodes.some(n => 
    n.data?.subType === 'position' || 
    n.data?.type === 'position' ||
    (n.data?.quantity && n.data?.quantity > 0)
  )
  
  if (!hasPositionManagement) {
    warnings.push('建议添加仓位管理：设置合理的买入数量和卖出数量')
  }
  
  // 检查风险控制
  const hasRiskControl = nodes.some(n => 
    n.data?.subType === 'stop_loss' || 
    n.data?.subType === 'take_profit' ||
    n.data?.type === 'risk'
  )
  
  if (!hasRiskControl) {
    warnings.push('建议添加风险控制：设置止损或止盈条件')
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalNodes: nodes.length,
      conditionNodes: nodeTypes.condition.length,
      actionNodes: nodeTypes.action.length,
      logicNodes: nodeTypes.logic.length,
      buyActions: buyActions.length,
      sellActions: sellActions.length,
      buyConditions: buyConditions.length,
      sellConditions: sellConditions.length,
      connections: edges.length
    }
  }
}

/**
 * 获取策略建议
 * @param {Object} validationResult - 验证结果
 * @returns {Array} 建议列表
 */
export function getStrategySuggestions(validationResult) {
  const suggestions = []
  
  if (validationResult.summary.buyActions === 0) {
    suggestions.push('添加买入动作节点')
  }
  
  if (validationResult.summary.sellActions === 0) {
    suggestions.push('添加卖出动作节点')
  }
  
  if (validationResult.summary.buyConditions === 0) {
    suggestions.push('添加买入条件节点（如：短期均线上穿长期均线）')
  }
  
  if (validationResult.summary.sellConditions === 0) {
    suggestions.push('添加卖出条件节点（如：短期均线下穿长期均线）')
  }
  
  if (validationResult.summary.connections === 0) {
    suggestions.push('连接节点：将条件节点连接到对应的动作节点')
  }
  
  if (validationResult.summary.conditionNodes < 2) {
    suggestions.push('添加更多条件节点：如技术指标、趋势判断等')
  }
  
  return suggestions
}

/**
 * 自动修复策略
 * @param {Object} strategy - 原始策略
 * @param {Array} suggestions - 修复建议
 * @returns {Object} 修复后的策略
 */
export function autoFixStrategy(strategy, suggestions) {
  const fixedStrategy = JSON.parse(JSON.stringify(strategy)) // 深拷贝
  const nodes = fixedStrategy.nodes || []
  const edges = fixedStrategy.edges || []
  
  let nodeIdCounter = 1
  const getNextNodeId = () => `auto_fix_${nodeIdCounter++}`
  
  // 检查并添加缺失的节点
  const hasBuyAction = nodes.some(n => n.type === 'action' && n.data?.subType === 'buy')
  const hasSellAction = nodes.some(n => n.type === 'action' && n.data?.subType === 'sell')
  const hasBuyCondition = nodes.some(n => n.type === 'condition' && (n.data?.operator === 'crossover' || n.data?.operator === 'above'))
  const hasSellCondition = nodes.some(n => n.type === 'condition' && (n.data?.operator === 'crossunder' || n.data?.operator === 'below'))
  
  // 添加买入条件节点
  if (!hasBuyCondition) {
    const buyConditionId = getNextNodeId()
    nodes.push({
      id: buyConditionId,
      type: 'condition',
      position: { x: 100, y: 100 },
      data: {
        type: 'ma',
        period: 5,
        threshold: 0,
        operator: 'crossover',
        nodeType: 'condition',
        subType: 'ma',
        timeframe: '5m',
        description: '短期均线上穿长期均线（自动添加）'
      }
    })
  }
  
  // 添加卖出条件节点
  if (!hasSellCondition) {
    const sellConditionId = getNextNodeId()
    nodes.push({
      id: sellConditionId,
      type: 'condition',
      position: { x: 100, y: 200 },
      data: {
        type: 'ma',
        period: 5,
        threshold: 0,
        operator: 'crossunder',
        nodeType: 'condition',
        subType: 'ma',
        timeframe: '5m',
        description: '短期均线下穿长期均线（自动添加）'
      }
    })
  }
  
  // 添加买入动作节点
  if (!hasBuyAction) {
    const buyActionId = getNextNodeId()
    nodes.push({
      id: buyActionId,
      type: 'action',
      position: { x: 300, y: 100 },
      data: {
        type: 'buy',
        quantity: 1000,
        priceType: 'market',
        nodeType: 'action',
        subType: 'buy',
        timeframe: '5m',
        description: '买入动作（自动添加）'
      }
    })
  }
  
  // 添加卖出动作节点
  if (!hasSellAction) {
    const sellActionId = getNextNodeId()
    nodes.push({
      id: sellActionId,
      type: 'action',
      position: { x: 300, y: 200 },
      data: {
        type: 'sell',
        quantity: 1000,
        priceType: 'market',
        nodeType: 'action',
        subType: 'sell',
        timeframe: '5m',
        description: '卖出动作（自动添加）'
      }
    })
  }
  
  // 重新获取节点引用
  const buyCondition = nodes.find(n => n.type === 'condition' && (n.data?.operator === 'crossover' || n.data?.operator === 'above'))
  const sellCondition = nodes.find(n => n.type === 'condition' && (n.data?.operator === 'crossunder' || n.data?.operator === 'below'))
  const buyAction = nodes.find(n => n.type === 'action' && n.data?.subType === 'buy')
  const sellAction = nodes.find(n => n.type === 'action' && n.data?.subType === 'sell')
  
  // 添加缺失的连接
  const existingConnections = new Set(edges.map(e => `${e.source}-${e.target}`))
  
  if (buyCondition && buyAction && !existingConnections.has(`${buyCondition.id}-${buyAction.id}`)) {
    edges.push({
      id: `auto_edge_${Date.now()}_1`,
      source: buyCondition.id,
      target: buyAction.id
    })
  }
  
  if (sellCondition && sellAction && !existingConnections.has(`${sellCondition.id}-${sellAction.id}`)) {
    edges.push({
      id: `auto_edge_${Date.now()}_2`,
      source: sellCondition.id,
      target: sellAction.id
    })
  }
  
  // 添加仓位管理节点
  const hasPositionManagement = nodes.some(n => n.type === 'position')
  if (!hasPositionManagement) {
    const positionBuyId = getNextNodeId()
    const positionSellId = getNextNodeId()
    
    nodes.push({
      id: positionBuyId,
      type: 'position',
      position: { x: 200, y: 100 },
      data: {
        type: 'position',
        quantity: 1000,
        maxPosition: 5000,
        nodeType: 'position',
        subType: 'buy',
        timeframe: '5m',
        description: '买入仓位管理（自动添加）'
      }
    })
    
    nodes.push({
      id: positionSellId,
      type: 'position',
      position: { x: 200, y: 200 },
      data: {
        type: 'position',
        quantity: 1000,
        maxPosition: 5000,
        nodeType: 'position',
        subType: 'sell',
        timeframe: '5m',
        description: '卖出仓位管理（自动添加）'
      }
    })
    
    // 连接仓位管理节点
    if (buyCondition && !existingConnections.has(`${buyCondition.id}-${positionBuyId}`)) {
      edges.push({
        id: `auto_edge_${Date.now()}_3`,
        source: buyCondition.id,
        target: positionBuyId
      })
    }
    
    if (sellCondition && !existingConnections.has(`${sellCondition.id}-${positionSellId}`)) {
      edges.push({
        id: `auto_edge_${Date.now()}_4`,
        source: sellCondition.id,
        target: positionSellId
      })
    }
    
    if (!existingConnections.has(`${positionBuyId}-${buyAction.id}`)) {
      edges.push({
        id: `auto_edge_${Date.now()}_5`,
        source: positionBuyId,
        target: buyAction.id
      })
    }
    
    if (!existingConnections.has(`${positionSellId}-${sellAction.id}`)) {
      edges.push({
        id: `auto_edge_${Date.now()}_6`,
        source: positionSellId,
        target: sellAction.id
      })
    }
  }
  
  // 添加风险控制节点
  const hasRiskControl = nodes.some(n => n.data?.subType === 'stop_loss' || n.data?.subType === 'take_profit')
  if (!hasRiskControl) {
    const stopLossId = getNextNodeId()
    const takeProfitId = getNextNodeId()
    
    nodes.push({
      id: stopLossId,
      type: 'condition',
      position: { x: 100, y: 300 },
      data: {
        type: 'stop_loss',
        threshold: 0.05,
        operator: 'below',
        nodeType: 'condition',
        subType: 'stop_loss',
        timeframe: '5m',
        description: '止损5%（自动添加）'
      }
    })
    
    nodes.push({
      id: takeProfitId,
      type: 'condition',
      position: { x: 200, y: 300 },
      data: {
        type: 'take_profit',
        threshold: 0.10,
        operator: 'above',
        nodeType: 'condition',
        subType: 'take_profit',
        timeframe: '5m',
        description: '止盈10%（自动添加）'
      }
    })
    
    // 连接风险控制节点到卖出动作
    if (sellAction && !existingConnections.has(`${stopLossId}-${sellAction.id}`)) {
      edges.push({
        id: `auto_edge_${Date.now()}_7`,
        source: stopLossId,
        target: sellAction.id
      })
    }
    
    if (sellAction && !existingConnections.has(`${takeProfitId}-${sellAction.id}`)) {
      edges.push({
        id: `auto_edge_${Date.now()}_8`,
        source: takeProfitId,
        target: sellAction.id
      })
    }
  }
  
  return {
    ...fixedStrategy,
    nodes,
    edges
  }
}
