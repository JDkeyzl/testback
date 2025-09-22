import React, { useState, useEffect } from 'react'
import { Handle, Position } from 'reactflow'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Settings, X } from 'lucide-react'
import { useStrategyStore } from '../../store/strategyStore'

const conditionTypes = {
  ma: { label: '移动均线', params: ['period', 'value', 'operator'] },
  price_range: { label: '价格区间', params: ['minPrice', 'maxPrice'] },
  rsi: { label: 'RSI', params: ['period', 'value', 'operator', 'direction'] },
  bollinger: { label: '布林带', params: ['period', 'stdDev', 'condition', 'direction'] },
  macd: { label: 'MACD', params: ['fast', 'slow', 'signal', 'mode', 'operator', 'threshold'] },
  volume: { label: '成交量', params: ['avgPeriod', 'multiplier'] },
  price: { label: '价格', params: ['value', 'operator'] },
  trend: { label: '趋势判断', params: ['period', 'condition', 'direction'] },
  candlestick: { label: 'K线形态', params: ['pattern'] }
}

const operators = [
  { value: '>', label: '大于' },
  { value: '<', label: '小于' },
  { value: '>=', label: '大于等于' },
  { value: '<=', label: '小于等于' },
  { value: '==', label: '等于' },
  { value: '!=', label: '不等于' }
]

export function ConditionNode({ data, isConnectable, id }) {
  const { 
    initNodeParams, 
    getNodeParams, 
    setSelectedNode,
    selectedNodeId,
    removeNodeParams 
  } = useStrategyStore()
  
  const nodeId = id || 'unknown'
  
  // 初始化节点参数
  useEffect(() => {
    initNodeParams(nodeId, 'condition', data.type || 'ma')
  }, [nodeId, data.type, initNodeParams])

  // 从全局状态获取参数
  const nodeParams = getNodeParams(nodeId)
  const nodeData = nodeParams || {
    type: data.type || 'ma',
    period: 20,
    threshold: 50,
    operator: '>',
    fast: 12,
    slow: 26,
    signal: 9
  }

  const conditionType = conditionTypes[nodeData.type] || conditionTypes.ma

  const handleNodeClick = () => {
    setSelectedNode(nodeId)
  }

  const handleDelete = () => {
    removeNodeParams(nodeId)
    data.onDelete?.()
  }

  const getDisplayText = () => {
    // 使用subType或type来确定节点类型
    const nodeType = nodeData.subType || nodeData.type || data.type || 'ma'
    const timeframe = nodeData.timeframe || '1d'
    
    // 时间周期显示映射
    const timeframeMap = {
      '1m': '1分钟',
      '5m': '5分钟', 
      '15m': '15分钟',
      '30m': '30分钟',
      '1h': '1小时',
      '4h': '4小时',
      '1d': '1天',
      '1w': '1周',
      '1M': '1月'
    }
    
    const timeframeLabel = timeframeMap[timeframe] || timeframe
    
    switch (nodeType) {
      case 'ma':
        return `MA(${nodeData.period || 20}, ${timeframeLabel}) ${operators.find(op => op.value === nodeData.operator)?.label || '>'} ${nodeData.threshold || 50}`
      case 'price_range':
        return `价格区间(${timeframeLabel}) ${nodeData.minPrice || 100} - ${nodeData.maxPrice || 200}`
      case 'rsi':
        const rsiDirection = nodeData.direction === 'up' ? '↑' : nodeData.direction === 'down' ? '↓' : ''
        return `RSI(${nodeData.period || 14}, ${timeframeLabel}) ${operators.find(op => op.value === nodeData.operator)?.label || '<'} ${nodeData.threshold || 30}${rsiDirection}`
      case 'bollinger':
        const bollingerCondition = nodeData.condition === 'breakout' ? '突破' : '位置'
        const bollingerDirection = nodeData.direction === 'lower' ? '下轨' : '上轨'
        return `布林带(${nodeData.period || 20}, ${timeframeLabel}) ${bollingerCondition}${bollingerDirection}`
      case 'macd':
        {
          const modeLabelMap = {
            golden_cross: '金叉',
            death_cross: '死叉',
            zero_above: '零轴上',
            zero_below: '零轴下',
            hist_turn_positive: '柱转正',
            hist_turn_negative: '柱转负',
            hist_threshold: `${operators.find(op => op.value === nodeData.operator)?.label || '大于'} ${nodeData.threshold ?? 0}`
          }
          const modeText = modeLabelMap[nodeData.mode || 'hist_threshold'] || '阈值比较'
          return `MACD(${nodeData.fast || 12},${nodeData.slow || 26},${nodeData.signal || 9}, ${timeframeLabel}) ${modeText}`
        }
      case 'volume':
        return `成交量(${timeframeLabel}) ${nodeData.avgPeriod || 20}日均量×${nodeData.multiplier || 1.5}`
      case 'price':
        return `价格(${timeframeLabel}) ${operators.find(op => op.value === nodeData.operator)?.label || '>'} ${nodeData.threshold || 100}`
      case 'trend':
        const trendCondition = nodeData.condition === 'slope' ? '斜率' : '位置'
        const trendDirection = nodeData.direction === 'down' ? '向下' : '向上'
        return `趋势(${nodeData.period || 200}, ${timeframeLabel}) ${trendCondition}${trendDirection}`
      case 'candlestick':
        const pattern = nodeData.pattern === 'bullish' ? '阳线' : '阴线'
        return `K线(${timeframeLabel}) ${pattern}`
      default:
        return '条件节点'
    }
  }

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-blue-500"
      />
      
      <Card 
        className={`w-48 min-h-[80px] shadow-md hover:shadow-lg transition-shadow cursor-pointer ${
          selectedNodeId === nodeId ? 'ring-2 ring-blue-500' : ''
        }`}
        onClick={handleNodeClick}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-blue-600">
              {conditionTypes[nodeData.subType || nodeData.type || data.type || 'ma']?.label || '条件节点'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete()
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="text-sm text-gray-700">
            {getDisplayText()}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            点击配置参数
          </div>
        </CardContent>
      </Card>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-green-500"
      />
    </div>
  )
}
