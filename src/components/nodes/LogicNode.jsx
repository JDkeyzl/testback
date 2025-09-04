import React, { useState, useEffect } from 'react'
import { Handle, Position } from 'reactflow'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Settings, X } from 'lucide-react'
import { useStrategyStore } from '../../store/strategyStore'

const logicTypes = {
  and: { label: 'AND', color: 'bg-orange-500', description: '逻辑与' },
  or: { label: 'OR', color: 'bg-purple-500', description: '逻辑或' },
  not: { label: 'NOT', color: 'bg-red-500', description: '逻辑非' }
}

export function LogicNode({ data, isConnectable, id }) {
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
    initNodeParams(nodeId, 'logic', data.type || 'and')
  }, [nodeId, data.type, initNodeParams])

  // 从全局状态获取参数
  const nodeParams = getNodeParams(nodeId)
  const nodeData = nodeParams || {
    type: data.type || 'and'
  }

  const logicType = logicTypes[nodeData.type] || logicTypes.and

  const handleNodeClick = () => {
    setSelectedNode(nodeId)
  }

  const handleDelete = () => {
    removeNodeParams(nodeId)
    data.onDelete?.()
  }

  const getInputCount = () => {
    return nodeData.type === 'not' ? 1 : 2
  }

  return (
    <div className="relative">
      {/* 输入连接点 */}
      {nodeData.type === 'not' ? (
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
          className="w-3 h-3 bg-blue-500"
          id="input"
        />
      ) : (
        <>
          <Handle
            type="target"
            position={Position.Top}
            isConnectable={isConnectable}
            className="w-3 h-3 bg-blue-500"
            id="input1"
            style={{ left: '30%' }}
          />
          <Handle
            type="target"
            position={Position.Top}
            isConnectable={isConnectable}
            className="w-3 h-3 bg-blue-500"
            id="input2"
            style={{ left: '70%' }}
          />
        </>
      )}

      <Card 
        className={`w-32 min-h-[60px] shadow-md hover:shadow-lg transition-shadow cursor-pointer ${
          selectedNodeId === nodeId ? 'ring-2 ring-blue-500' : ''
        }`}
        onClick={handleNodeClick}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">
              逻辑节点
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
            <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold ${logicType.color}`}>
              {logicType.label}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {logicType.description}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              点击配置
            </div>
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
