import React, { useState, useEffect } from 'react'
import { Handle, Position } from 'reactflow'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Settings, X } from 'lucide-react'
import { useStrategyStore } from '../../store/strategyStore'

const actionTypes = {
  buy: { label: '买入', color: 'bg-green-500', description: '买入信号' },
  sell: { label: '卖出', color: 'bg-red-500', description: '卖出信号' },
  hold: { label: '持有', color: 'bg-gray-500', description: '持有信号' }
}

export function ActionNode({ data, isConnectable, id }) {
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
    initNodeParams(nodeId, 'action', data.type || 'buy')
  }, [nodeId, data.type, initNodeParams])

  // 从全局状态获取参数
  const nodeParams = getNodeParams(nodeId)
  const nodeData = nodeParams || {
    type: data.type || 'buy',
    quantity: 100,
    priceType: 'market'
  }

  const actionType = actionTypes[nodeData.type] || actionTypes.buy

  const handleNodeClick = () => {
    setSelectedNode(nodeId)
  }

  const handleDelete = () => {
    removeNodeParams(nodeId)
    data.onDelete?.()
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
        className={`w-40 min-h-[80px] shadow-md hover:shadow-lg transition-shadow cursor-pointer ${
          selectedNodeId === nodeId ? 'ring-2 ring-blue-500' : ''
        }`}
        onClick={handleNodeClick}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">
              动作节点
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

          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold ${actionType.color}`}>
              {actionType.label}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {actionType.description}
            </div>
            {nodeData.type !== 'hold' && (
              <div className="text-xs text-gray-600 mt-1">
                数量: {nodeData.quantity}
              </div>
            )}
            <div className="text-xs text-gray-400 mt-1">
              点击配置
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
