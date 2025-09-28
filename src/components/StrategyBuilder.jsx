import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Settings, BarChart3 } from 'lucide-react'
import { NodeToolbar } from './NodeToolbar'
import { StrategyValidator } from './StrategyValidator'
import { StrategyValidationTooltip } from './StrategyValidationTooltip'
import { ToastContainer } from './Toast'
import { ParameterPanel } from './ParameterPanel'
import { useStrategyStore } from '../store/strategyStore'
import { useStrategyListStore } from '../store/strategyListStore'

import { ConditionNode } from './nodes/ConditionNode'
import { LogicNode } from './nodes/LogicNode'
import { ActionNode } from './nodes/ActionNode'

const nodeTypes = {
  condition: ConditionNode,
  logic: LogicNode,
  action: ActionNode,
}

let id = 0
const getId = () => `dndnode_${id++}`

export const StrategyBuilder = React.forwardRef((props, ref) => {
  const reactFlowWrapper = useRef(null)
  const { strategyId } = useParams()
  const { nodeParams, setSelectedNode, setNodeParams, resetAllParams } = useStrategyStore()
  const { strategies, getStrategy, updateStrategy, addStrategy } = useStrategyListStore()
  const [toasts, setToasts] = useState([])
  const [isLoadingStrategy, setIsLoadingStrategy] = useState(false)
  // 计算昨天日期（YYYY-MM-DD）
  const getYesterday = () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  // 止损参数（仅策略层配置）
  const [stopLoss, setStopLoss] = useState({ type: 'pct', value: 5, action: 'sell_all', mode: 'close' })
  
  // Toast管理函数
  const addToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, duration }])
  }

  useEffect(() => {}, [stopLoss])

  useEffect(() => {}, [])
  
  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }
  
  // 加载策略数据
  const loadStrategy = useCallback(async (id) => {
    if (!id) return null
    
    console.log('StrategyBuilder: 开始加载策略', id)
    setIsLoadingStrategy(true)
    
    try {
      const strategy = getStrategy(id)
      if (strategy && strategy.strategy) {
        console.log('StrategyBuilder: 找到策略数据', strategy)
        return strategy
      } else {
        console.warn('StrategyBuilder: 未找到策略数据', id)
        return null
      }
    } catch (error) {
      console.error('StrategyBuilder: 加载策略失败', error)
      return null
    } finally {
      setIsLoadingStrategy(false)
    }
  }, [getStrategy])

  // 处理节点选择
  const handleNodeClick = useCallback((event, node) => {
    console.log('StrategyBuilder: 节点被点击', node)
    setSelectedNode(node.id)
  }, [setSelectedNode])

  // 处理画布点击（取消选择）
  const handlePaneClick = useCallback(() => {
    console.log('StrategyBuilder: 画布被点击，取消节点选择')
    setSelectedNode(null)
  }, [setSelectedNode])
  
  // 默认节点和边配置
  const getDefaultNodes = () => [
    {
      id: 'condition1',
      type: 'condition',
      position: { x: 100, y: 100 },
      data: {
        type: 'ma',
        period: 20,
        value: 50,
        operator: '>',
        onChange: (newData) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === 'condition1' ? { ...node, data: { ...node.data, ...newData } } : node
            )
          )
        },
        onDelete: () => {
          setNodes((nds) => nds.filter((node) => node.id !== 'condition1'))
          setEdges((eds) => eds.filter((edge) => edge.source !== 'condition1' && edge.target !== 'condition1'))
        },
      },
    },
    {
      id: 'condition2',
      type: 'condition',
      position: { x: 100, y: 200 },
      data: {
        type: 'ma',
        period: 50,
        value: 50,
        operator: '<',
        onChange: (newData) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === 'condition2' ? { ...node, data: { ...node.data, ...newData } } : node
            )
          )
        },
        onDelete: () => {
          setNodes((nds) => nds.filter((node) => node.id !== 'condition2'))
          setEdges((eds) => eds.filter((edge) => edge.source !== 'condition2' && edge.target !== 'condition2'))
        },
      },
    },
    {
      id: 'logic1',
      type: 'logic',
      position: { x: 300, y: 150 },
      data: {
        type: 'and',
        onChange: (newData) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === 'logic1' ? { ...node, data: { ...node.data, ...newData } } : node
            )
          )
        },
        onDelete: () => {
          setNodes((nds) => nds.filter((node) => node.id !== 'logic1'))
          setEdges((eds) => eds.filter((edge) => edge.source !== 'logic1' && edge.target !== 'logic1'))
        },
      },
    },
    {
      id: 'action1',
      type: 'action',
      position: { x: 500, y: 150 },
      data: {
        type: 'buy',
        quantity: 100,
        onChange: (newData) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === 'action1' ? { ...node, data: { ...node.data, ...newData } } : node
            )
          )
        },
        onDelete: () => {
          setNodes((nds) => nds.filter((node) => node.id !== 'action1'))
          setEdges((eds) => eds.filter((edge) => edge.source !== 'action1' && edge.target !== 'action1'))
        },
      },
    },
  ]
  
  const getDefaultEdges = () => [
    { id: 'e1-3', source: 'condition1', target: 'logic1', sourceHandle: null, targetHandle: 'input1' },
    { id: 'e2-3', source: 'condition2', target: 'logic1', sourceHandle: null, targetHandle: 'input2' },
    { id: 'e3-4', source: 'logic1', target: 'action1' },
  ]
  
  const [nodes, setNodes, onNodesChange] = useNodesState(getDefaultNodes())
  const [edges, setEdges, onEdgesChange] = useEdgesState(getDefaultEdges())
  
  // 暴露给父组件的方法
  React.useImperativeHandle(ref, () => ({
    getCurrentStrategy: () => {
      console.log('StrategyBuilder: getCurrentStrategy 被调用', { nodesCount: nodes.length, edgesCount: edges.length })
      
      // 检查是否有有效的策略
      if (nodes.length === 0) {
        console.log('StrategyBuilder: 没有节点，返回null')
        return null
      }
      
      const strategy = {
        id: strategyId || `strategy_${Date.now()}`,
        name: '当前策略',
        strategy: {
          nodes: nodes,
          edges: edges
        },
        description: '从策略构建器获取的当前策略'
      }
      
      console.log('StrategyBuilder: 返回策略', strategy)
      return strategy
    }
  }), [nodes, edges])
  
  // 加载策略数据
  useEffect(() => {
    if (strategyId) {
      console.log('StrategyBuilder: 检测到策略ID，开始加载策略', strategyId)
      loadStrategy(strategyId).then((strategy) => {
        if (strategy && strategy.strategy) {
          console.log('StrategyBuilder: 加载策略成功，更新节点和边', strategy)
          const rawNodes = strategy.strategy.nodes || getDefaultNodes()
          // 兼容历史策略：为MACD条件节点补齐mode字段
          const fixedNodes = rawNodes.map(n => {
            if (n?.type === 'condition' && (n?.data?.subType === 'macd' || n?.data?.type === 'macd')) {
              return { ...n, data: { mode: n.data.mode || 'hist_threshold', ...n.data } }
            }
            return n
          })
          setNodes(fixedNodes)
          setEdges(strategy.strategy.edges || getDefaultEdges())

          // 将已加载策略节点的数据写入全局参数仓库，避免旧的 nodeParams 覆盖画布数据
          try {
            resetAllParams()
            fixedNodes.forEach((n) => {
              const nodeType = n.type
              const subType = n.data?.subType || n.data?.type || (nodeType === 'logic' ? 'and' : nodeType === 'action' ? 'buy' : 'ma')
              // 将节点 data 作为参数写入，确保如 MACD.mode 等保持一致
              setNodeParams(
                n.id,
                nodeType,
                subType,
                {
                  ...n.data,
                  nodeType,
                  subType,
                }
              )
            })
          } catch (e) {
            console.warn('StrategyBuilder: 同步节点参数到store失败', e)
          }

          // 恢复并填充已保存的止损配置（策略级）
          try {
            const savedSL = strategy.strategy?.meta?.stop_loss
            if (savedSL && (typeof savedSL === 'object')) {
              const type = savedSL.type === 'amount' ? 'amount' : 'pct'
              const action = savedSL.action === 'reduce_half' ? 'reduce_half' : 'sell_all'
              const valueNum = Number(savedSL.value)
              const mode = (['intrabar','next_open','close'].includes(savedSL.mode)) ? savedSL.mode : 'close'
              setStopLoss({
                type,
                action,
                value: Number.isFinite(valueNum) ? valueNum : (type === 'pct' ? 5 : 500),
                mode
              })
              console.log('StrategyBuilder: 已恢复止损配置', { type, action, value: valueNum, mode })
            }
          } catch (e) {
            console.warn('StrategyBuilder: 恢复止损配置失败', e)
          }
        } else {
          console.log('StrategyBuilder: 未找到策略数据，使用默认配置')
        }
      })
    }
  }, [strategyId, loadStrategy])

  
  const [reactFlowInstance, setReactFlowInstance] = useState(null)

  // 监听节点参数变化，同步到React Flow节点
  useEffect(() => {
    setNodes((nds) => {
      // 首先清理无效节点
      const validNodes = nds.filter((node) => {
        if (!node || !node.id || !node.data || !node.data.type) {
          console.warn('StrategyBuilder: 发现无效节点，将移除', node)
          return false
        }
        return true
      })
      
      // 然后更新有效节点
      return validNodes.map((node) => {
        const nodeParam = nodeParams[node.id]
        if (nodeParam) {
          const nodeType = node.type
          const subType = nodeParam.subType || node.data.subType || (nodeType === 'logic' ? 'and' : nodeType === 'action' ? 'buy' : 'ma')
          const resolvedType = nodeType === 'action'
            ? (nodeParam.type || subType || node.data.type)
            : (nodeParam.subType || node.data.type)
          return {
            ...node,
            data: {
              ...node.data,
              ...nodeParam,
              // 对于动作节点，type 取 nodeParam.type；其他节点取 subType
              type: resolvedType,
              subType,
              // 确保所有参数都传递到节点
              mode: nodeParam.mode,
              period: nodeParam.period,
              threshold: nodeParam.threshold,
              operator: nodeParam.operator,
              minPrice: nodeParam.minPrice,
              maxPrice: nodeParam.maxPrice,
              stdDev: nodeParam.stdDev,
              fast: nodeParam.fast,
              slow: nodeParam.slow,
              signal: nodeParam.signal,
              timeframe: nodeParam.timeframe, // 添加时间周期参数
              // 新增参数
              direction: nodeParam.direction,
              condition: nodeParam.condition,
              avgPeriod: nodeParam.avgPeriod,
              multiplier: nodeParam.multiplier,
              pattern: nodeParam.pattern
            },
          }
        }
        return node
      })
    })
  }, [nodeParams, setNodes])

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const onDragOver = useCallback((event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event) => {
      event.preventDefault()

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect()
      const type = event.dataTransfer.getData('application/reactflow')

      if (typeof type === 'undefined' || !type) {
        return
      }

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      })

      const newNode = {
        id: getId(),
        type,
        position,
        data: {
          label: `${type} node`,
          type: type === 'condition' ? 'ma' : type === 'logic' ? 'and' : 'buy', // 设置默认子类型
          subType: type === 'condition' ? 'ma' : type === 'logic' ? 'and' : 'buy', // 添加subType字段
          nodeType: type, // 添加nodeType字段
          onChange: (newData) => {
            setNodes((nds) =>
              nds.map((node) =>
                node.id === newNode.id ? { ...node, data: { ...node.data, ...newData } } : node
              )
            )
          },
          onDelete: () => {
            setNodes((nds) => nds.filter((node) => node.id !== newNode.id))
            setEdges((eds) => eds.filter((edge) => edge.source !== newNode.id && edge.target !== newNode.id))
          },
        },
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [reactFlowInstance, setNodes, setEdges]
  )

  const addNode = (type) => {
    // 验证节点类型
    if (!type || typeof type !== 'string') {
      console.error('StrategyBuilder: 无效的节点类型', type)
      return
    }

    // 计算新节点的合理位置，避免与现有节点重叠
    const getNextPosition = () => {
      const existingNodes = nodes || []
      const nodeSpacing = 200 // 节点间距
      const startX = 100
      const startY = 100
      
      // 按类型分组计算位置
      const typeCounts = existingNodes.reduce((acc, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1
        return acc
      }, {})
      
      const typeIndex = typeCounts[type] || 0
      const row = Math.floor(typeIndex / 3) // 每行最多3个节点
      const col = typeIndex % 3
      
      return {
        x: startX + col * nodeSpacing,
        y: startY + row * nodeSpacing
      }
    }

    const newNode = {
      id: getId(),
      type,
      position: getNextPosition(),
      data: {
        label: `${type} node`,
        type: type === 'condition' ? 'ma' : type === 'logic' ? 'and' : 'buy', // 设置默认子类型
        subType: type === 'condition' ? 'ma' : type === 'logic' ? 'and' : 'buy', // 添加subType字段
        nodeType: type, // 添加nodeType字段
        // 添加默认参数
        period: type === 'condition' ? 20 : undefined,
        threshold: type === 'condition' ? 50 : undefined,
        operator: type === 'condition' ? '>' : undefined,
        onChange: (newData) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === newNode.id ? { ...node, data: { ...node.data, ...newData } } : node
            )
          )
        },
        onDelete: () => {
          setNodes((nds) => nds.filter((node) => node.id !== newNode.id))
          setEdges((eds) => eds.filter((edge) => edge.source !== newNode.id && edge.target !== newNode.id))
        },
      },
    }
    
    // 验证节点数据完整性
    if (!newNode.data || !newNode.data.type || !newNode.data.subType) {
      console.error('StrategyBuilder: 节点数据不完整，跳过添加', newNode)
      return
    }
    
    setNodes((nds) => nds.concat(newNode))
    
    // 添加节点后自动调整视图，确保新节点可见
    setTimeout(() => {
      if (reactFlowInstance) {
        reactFlowInstance.fitView({ padding: 0.1, duration: 500 })
      }
    }, 100)
  }

  const clearAll = () => {
    setNodes([])
    setEdges([])
  }

  const saveStrategy = () => {
    // 去除不可序列化字段（函数）以避免后续路由 state 克隆错误
    const sanitize = (obj) => {
      if (Array.isArray(obj)) return obj.map(sanitize)
      if (obj && typeof obj === 'object') {
        const out = {}
        for (const k in obj) {
          const v = obj[k]
          if (typeof v === 'function') continue
          out[k] = sanitize(v)
        }
        return out
      }
      return obj
    }

    const strategy = {
      nodes: nodes.map(node => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: sanitize(node.data) // 过滤 onChange/onDelete 等函数引用
      })),
      edges: edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target
      })),
      // 将止损参数写入策略元数据
      meta: {
        stop_loss: {
          type: stopLoss.type, // 'pct' | 'amount'
          value: Number(stopLoss.value) || 0,
          action: stopLoss.action, // 'sell_all' | 'reduce_half'
          mode: stopLoss.mode || 'close' // 'close' | 'intrabar' | 'next_open'
        }
      }
    }
    
    // 生成策略名称
    const strategyName = `策略_${new Date().toLocaleString()}`
    const strategyDescription = `包含${nodes.length}个节点的交易策略`
    // 调试打印：保存的策略数据
    try {
      console.log('StrategyBuilder: 保存策略数据', {
        strategyId,
        name: strategyName,
        description: strategyDescription,
        nodes: strategy.nodes,
        edges: strategy.edges
      })
    } catch {}
    
    // 若为编辑已有策略，则更新；否则新增
    const existing = strategyId ? getStrategy(strategyId) : null
    if (existing) {
      updateStrategy(strategyId, {
        name: existing.name || strategyName,
        description: strategyDescription,
        strategy
      })
      console.log('策略已更新:', strategyId)
      alert('策略更新成功！')
    } else {
      addStrategy({
        id: strategyId || undefined,
        name: strategyName,
        description: strategyDescription,
        strategy
      })
      console.log('策略已保存(新建)')
      alert('策略保存成功！')
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏区域 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-background to-muted/20 flex-shrink-0">
        <NodeToolbar 
          onAddNode={addNode}
          onClearAll={clearAll}
          onSave={saveStrategy}
          onLoad={loadStrategy}
        />
      </div>

      {/* 主要内容区域：左右布局 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：画布和策略参数区域 */}
        <div 
          className={`flex flex-col min-h-0 transition-all duration-300 ${
            nodeParams && Object.keys(nodeParams).length > 0 
              ? 'w-2/3' 
              : 'w-full'
          }`}
        >
          {/* 画布区域 */}
          <div className="flex-1 relative min-h-0">
            <ReactFlowProvider>
              <div className="h-full w-full" ref={reactFlowWrapper}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={setReactFlowInstance}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={handleNodeClick}
                onPaneClick={handlePaneClick}
                nodeTypes={nodeTypes}
                fitView
                attributionPosition="top-right"
                proOptions={{ hideAttribution: true }}
                style={{ width: '100%', height: '100%' }}
              >
                <Controls />
                <Background variant="dots" gap={12} size={1} />
                
                {/* 策略验证提示框 - 固定在画布右上角 */}
                <div className="absolute top-4 right-4 z-50">
                  <StrategyValidationTooltip 
                    strategy={{ nodes, edges }}
                    onAutoFix={(fixedStrategy) => {
                      console.log('自动修复策略:', fixedStrategy)
                      
                      // 更新React Flow的节点和边
                      if (fixedStrategy.nodes) {
                        setNodes(fixedStrategy.nodes)
                      }
                      if (fixedStrategy.edges) {
                        setEdges(fixedStrategy.edges)
                      }
                      
                      // 显示修复成功提示
                      addToast('策略已自动修复！已添加缺失的节点和连接。', 'success', 4000)
                    }}
                  />
                </div>
              </ReactFlow>
              </div>
            </ReactFlowProvider>
          </div>
          
          {/* 策略参数配置区域 - 与画布同宽度 */}
          <div className="bg-card border-t border-border p-4 flex-shrink-0" style={{ height: '120px' }}>
            <div className="max-w-6xl mx-auto h-full flex items-center">
              <div className="w-full">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground/80">策略参数配置（止损）</h3>
                  <div />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/70">止损类型</label>
                    <select
                      value={stopLoss.type}
                      onChange={(e)=>setStopLoss(prev=>({...prev,type:e.target.value}))}
                      className="w-full h-8 text-xs px-3 py-1 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    >
                      <option value="pct">百分比(%)</option>
                      <option value="amount">资金额(¥)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/70">止损值</label>
                    <Input
                      type="number"
                      value={stopLoss.value}
                      onChange={(e)=>setStopLoss(prev=>({...prev,value:e.target.value}))}
                      className="w-full h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/70">触发动作</label>
                    <select
                      value={stopLoss.action}
                      onChange={(e)=>setStopLoss(prev=>({...prev,action:e.target.value}))}
                      className="w-full h-8 text-xs px-3 py-1 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    >
                      <option value="sell_all">卖出全部</option>
                      <option value="reduce_half">减半仓位</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground/70">止损模式</label>
                    <select
                      value={stopLoss.mode}
                      onChange={(e)=>setStopLoss(prev=>({...prev,mode:e.target.value}))}
                      className="w-full h-8 text-xs px-3 py-1 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    >
                      <option value="close">收盘触发</option>
                      <option value="intrabar">K线内触发</option>
                      <option value="next_open">次开触发</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：节点编辑面板 - 只在选中节点时显示 */}
        {nodeParams && Object.keys(nodeParams).length > 0 && (
          <div className="w-1/3 border-l border-border bg-muted/30 flex flex-col">
            <ParameterPanel />
          </div>
        )}
      </div>
      
      {/* Toast通知 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
})
