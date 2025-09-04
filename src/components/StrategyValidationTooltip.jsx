import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { CheckCircle, AlertCircle, Info } from 'lucide-react'

export function StrategyValidationTooltip({ strategy, onAutoFix }) {
  const [isHovered, setIsHovered] = useState(false)
  const [hoverTimeout, setHoverTimeout] = useState(null)

  // 改进的策略验证逻辑
  const validateStrategy = (strategy) => {
    const { nodes, edges } = strategy
    const issues = []
    const warnings = []

    // 检查是否有节点
    if (!nodes || nodes.length === 0) {
      issues.push('策略中没有节点')
      return { issues, warnings }
    }

    // 检查买入条件 - 更全面的检测
    const buyConditions = nodes.filter(node => {
      const data = node.data
      if (!data || data.type !== 'condition') return false
      
      // 检查各种买入条件
      const isBuyCondition = 
        // RSI超卖
        (data.subType === 'rsi' && data.operator === 'below' && data.threshold < 50) ||
        // 移动平均线金叉
        (data.subType === 'ma' && data.operator === 'above') ||
        // 布林带下轨
        (data.subType === 'bollinger' && data.operator === 'below') ||
        // 其他买入信号
        (data.subType === 'trend' && data.operator === 'above') ||
        (data.subType === 'volume' && data.operator === 'above')
      
      return isBuyCondition
    })

    // 检查卖出条件 - 更全面的检测
    const sellConditions = nodes.filter(node => {
      const data = node.data
      if (!data || data.type !== 'condition') return false
      
      // 检查各种卖出条件
      const isSellCondition = 
        // RSI超买
        (data.subType === 'rsi' && data.operator === 'above' && data.threshold > 50) ||
        // 移动平均线死叉
        (data.subType === 'ma' && data.operator === 'below') ||
        // 布林带上轨
        (data.subType === 'bollinger' && data.operator === 'above') ||
        // 止损止盈
        (data.subType === 'stop_loss' || data.subType === 'take_profit') ||
        // 其他卖出信号
        (data.subType === 'trend' && data.operator === 'below')
      
      return isSellCondition
    })

    // 检查动作节点
    const buyActions = nodes.filter(node => 
      node.data?.type === 'action' && 
      (node.data?.subType === 'buy' || node.data?.type === 'buy')
    )
    const sellActions = nodes.filter(node => 
      node.data?.type === 'action' && 
      (node.data?.subType === 'sell' || node.data?.type === 'sell')
    )

    // 验证逻辑
    if (buyConditions.length === 0) {
      issues.push('缺少买入条件')
    }
    if (sellConditions.length === 0) {
      issues.push('缺少卖出条件')
    }
    if (buyActions.length === 0) {
      warnings.push('建议添加买入动作节点')
    }
    if (sellActions.length === 0) {
      warnings.push('建议添加卖出动作节点')
    }

    // 检查连接
    if (edges && edges.length === 0 && nodes.length > 1) {
      warnings.push('节点之间没有连接')
    }

    return { issues, warnings }
  }

  // 生成修复后的策略
  const generateFixedStrategy = (strategy) => {
    const { nodes = [], edges = [] } = strategy
    const newNodes = [...nodes]
    const newEdges = [...edges]
    let nodeId = Math.max(...nodes.map(n => parseInt(n.id.split('_').pop()) || 0), 0) + 1

    // 检查并添加买入条件
    const hasBuyCondition = nodes.some(node => {
      const data = node.data
      return data?.type === 'condition' && (
        (data.subType === 'rsi' && data.operator === 'below' && data.threshold < 50) ||
        (data.subType === 'ma' && data.operator === 'above') ||
        (data.subType === 'bollinger' && data.operator === 'below')
      )
    })

    if (!hasBuyCondition) {
      const buyCondition = {
        id: `condition_${nodeId++}`,
        type: 'condition',
        position: { x: 100, y: 100 },
        data: {
          type: 'condition',
          subType: 'rsi',
          nodeType: 'condition',
          period: 14,
          threshold: 30,
          operator: 'below',
          timeframe: '5m',
          description: 'RSI低于30，超卖信号'
        }
      }
      newNodes.push(buyCondition)
    }

    // 检查并添加卖出条件
    const hasSellCondition = nodes.some(node => {
      const data = node.data
      return data?.type === 'condition' && (
        (data.subType === 'rsi' && data.operator === 'above' && data.threshold > 50) ||
        (data.subType === 'ma' && data.operator === 'below') ||
        (data.subType === 'bollinger' && data.operator === 'above') ||
        (data.subType === 'stop_loss' || data.subType === 'take_profit')
      )
    })

    if (!hasSellCondition) {
      const sellCondition = {
        id: `condition_${nodeId++}`,
        type: 'condition',
        position: { x: 100, y: 200 },
        data: {
          type: 'condition',
          subType: 'rsi',
          nodeType: 'condition',
          period: 14,
          threshold: 70,
          operator: 'above',
          timeframe: '5m',
          description: 'RSI高于70，超买信号'
        }
      }
      newNodes.push(sellCondition)
    }

    // 检查并添加买入动作
    const hasBuyAction = nodes.some(node => 
      node.data?.type === 'action' && 
      (node.data?.subType === 'buy' || node.data?.type === 'buy')
    )

    if (!hasBuyAction) {
      const buyAction = {
        id: `action_${nodeId++}`,
        type: 'action',
        position: { x: 300, y: 100 },
        data: {
          type: 'action',
          subType: 'buy',
          nodeType: 'action',
          quantity: 100,
          priceType: 'market',
          timeframe: '5m',
          description: '执行买入操作'
        }
      }
      newNodes.push(buyAction)
    }

    // 检查并添加卖出动作
    const hasSellAction = nodes.some(node => 
      node.data?.type === 'action' && 
      (node.data?.subType === 'sell' || node.data?.type === 'sell')
    )

    if (!hasSellAction) {
      const sellAction = {
        id: `action_${nodeId++}`,
        type: 'action',
        position: { x: 300, y: 200 },
        data: {
          type: 'action',
          subType: 'sell',
          nodeType: 'action',
          quantity: 100,
          priceType: 'market',
          timeframe: '5m',
          description: '执行卖出操作'
        }
      }
      newNodes.push(sellAction)
    }

    // 添加基本连接
    if (newEdges.length === 0 && newNodes.length > 1) {
      const buyCondition = newNodes.find(n => n.data?.subType === 'rsi' && n.data?.operator === 'below')
      const sellCondition = newNodes.find(n => n.data?.subType === 'rsi' && n.data?.operator === 'above')
      const buyAction = newNodes.find(n => n.data?.type === 'action' && n.data?.subType === 'buy')
      const sellAction = newNodes.find(n => n.data?.type === 'action' && n.data?.subType === 'sell')

      if (buyCondition && buyAction) {
        newEdges.push({
          id: `edge_${Date.now()}_1`,
          source: buyCondition.id,
          target: buyAction.id
        })
      }

      if (sellCondition && sellAction) {
        newEdges.push({
          id: `edge_${Date.now()}_2`,
          source: sellCondition.id,
          target: sellAction.id
        })
      }
    }

    return { nodes: newNodes, edges: newEdges }
  }

  const { issues, warnings } = validateStrategy(strategy)
  const isValid = issues.length === 0

  const getStatusIcon = () => {
    if (issues.length > 0) {
      return <AlertCircle className="h-4 w-4 text-red-500" />
    } else if (warnings.length > 0) {
      return <Info className="h-4 w-4 text-yellow-500" />
    } else {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    }
  }

  const getStatusText = () => {
    if (issues.length > 0) {
      return `${issues.length}个问题`
    } else if (warnings.length > 0) {
      return `${warnings.length}个建议`
    } else {
      return '策略完整'
    }
  }

  const handleMouseEnter = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
      setHoverTimeout(null)
    }
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    const timeout = setTimeout(() => {
      setIsHovered(false)
    }, 300) // 300ms延迟
    setHoverTimeout(timeout)
  }

  const handleTooltipMouseEnter = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
      setHoverTimeout(null)
    }
  }

  const handleTooltipMouseLeave = () => {
    const timeout = setTimeout(() => {
      setIsHovered(false)
    }, 300) // 300ms延迟
    setHoverTimeout(timeout)
  }

  return (
    <div 
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 触发器 */}
      <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-muted/50 to-muted/30 rounded-lg cursor-pointer hover:from-muted/70 hover:to-muted/50 transition-all duration-200 shadow-sm border border-border/50">
        {getStatusIcon()}
        <span className="text-sm font-medium text-foreground">{getStatusText()}</span>
      </div>

      {/* 悬浮层 */}
      {isHovered && (
        <div 
          className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 z-50 w-80"
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <Card className="shadow-xl border-0 bg-gradient-to-br from-card to-card/95 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center space-x-2">
                {getStatusIcon()}
                <span>策略验证</span>
              </CardTitle>
              <CardDescription className="text-xs">
                策略完整性检查结果
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 问题列表 */}
              {issues.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-red-600 mb-2">需要修复的问题：</h4>
                  <ul className="space-y-1">
                    {issues.map((issue, index) => (
                      <li key={index} className="text-xs text-red-600 flex items-start space-x-2">
                        <span className="text-red-500 mt-0.5">•</span>
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 警告列表 */}
              {warnings.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-yellow-600 mb-2">建议改进：</h4>
                  <ul className="space-y-1">
                    {warnings.map((warning, index) => (
                      <li key={index} className="text-xs text-yellow-600 flex items-start space-x-2">
                        <span className="text-yellow-500 mt-0.5">•</span>
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 成功状态 */}
              {isValid && warnings.length === 0 && (
                <div className="text-center py-2">
                  <p className="text-xs text-green-600">策略配置完整，可以开始回测</p>
                </div>
              )}

              {/* 自动修复按钮 */}
              {issues.length > 0 && onAutoFix && (
                <div className="pt-2 border-t border-border/50">
                  <button
                    onClick={() => {
                      const fixedStrategy = generateFixedStrategy(strategy)
                      onAutoFix(fixedStrategy)
                    }}
                    className="w-full px-4 py-2 text-xs bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-md hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-sm font-medium"
                  >
                    自动修复策略
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
