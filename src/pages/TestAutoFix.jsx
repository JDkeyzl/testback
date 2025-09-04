import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { StrategyValidator } from '../components/StrategyValidator'
import { ToastContainer } from '../components/Toast'

export function TestAutoFix() {
  const [toasts, setToasts] = useState([])
  const [strategy, setStrategy] = useState({
    nodes: [
      // 只有一个买入条件，缺少其他必要节点
      {
        id: 'test_condition',
        type: 'condition',
        position: { x: 100, y: 100 },
        data: {
          type: 'ma',
          period: 5,
          threshold: 0,
          operator: 'crossover',
          nodeType: 'condition',
          subType: 'ma',
          timeframe: '5m'
        }
      }
    ],
    edges: []
  })

  const addToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, duration }])
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const handleFixStrategy = (fixedStrategy) => {
    console.log('修复后的策略:', fixedStrategy)
    setStrategy(fixedStrategy)
    addToast('策略已自动修复！已添加缺失的节点和连接。', 'success', 4000)
  }

  const resetStrategy = () => {
    setStrategy({
      nodes: [
        {
          id: 'test_condition',
          type: 'condition',
          position: { x: 100, y: 100 },
          data: {
            type: 'ma',
            period: 5,
            threshold: 0,
            operator: 'crossover',
            nodeType: 'condition',
            subType: 'ma',
            timeframe: '5m'
          }
        }
      ],
      edges: []
    })
    addToast('策略已重置为测试状态', 'info', 2000)
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">自动修复策略功能测试</h1>
          <p className="text-muted-foreground mt-2">
            测试策略自动修复功能，点击"自动修复策略"按钮查看效果
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 策略信息 */}
          <Card>
            <CardHeader>
              <CardTitle>当前策略信息</CardTitle>
              <CardDescription>策略节点和连接状态</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">节点数量: {strategy.nodes.length}</h4>
                  <div className="text-sm text-muted-foreground">
                    {strategy.nodes.map((node, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        <span>{node.type} - {node.data?.subType || 'unknown'}</span>
                        {node.data?.description && (
                          <span className="text-xs text-gray-500">({node.data.description})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">连接数量: {strategy.edges.length}</h4>
                  <div className="text-sm text-muted-foreground">
                    {strategy.edges.map((edge, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span>{edge.source} → {edge.target}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 策略验证 */}
          <Card>
            <CardHeader>
              <CardTitle>策略验证</CardTitle>
              <CardDescription>检查策略完整性并提供修复建议</CardDescription>
            </CardHeader>
            <CardContent>
              <StrategyValidator 
                strategy={strategy}
                onFixStrategy={handleFixStrategy}
              />
            </CardContent>
          </Card>
        </div>

        {/* 操作按钮 */}
        <div className="flex space-x-4">
          <Button onClick={resetStrategy} variant="outline">
            重置为测试策略
          </Button>
          <Button 
            onClick={() => {
              const jsonStr = JSON.stringify(strategy, null, 2)
              navigator.clipboard.writeText(jsonStr)
              addToast('策略JSON已复制到剪贴板', 'success', 2000)
            }}
            variant="outline"
          >
            复制策略JSON
          </Button>
        </div>

        {/* 策略JSON显示 */}
        <Card>
          <CardHeader>
            <CardTitle>策略JSON</CardTitle>
            <CardDescription>当前策略的完整JSON结构</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto max-h-96">
              {JSON.stringify(strategy, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>

      {/* Toast通知 */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
