import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useStrategyListStore } from '../store/strategyListStore'
import { useStrategyStore } from '../store/strategyStore'
import { Edit, Play, Trash2, Plus, Calendar, Clock, Save, X, Pencil } from 'lucide-react'
import { BacktestModal } from './BacktestModal'

export function StrategyList({ onBacktest }) {
  const navigate = useNavigate()
  const { strategies, deleteStrategy, renameStrategy, initializeDefaultStrategies, resetToSample } = useStrategyListStore()
  const { resetAllParams, initNodeParams } = useStrategyStore()
  const [deletingId, setDeletingId] = useState(null)
  const [backtestModalOpen, setBacktestModalOpen] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [newName, setNewName] = useState('')

  // 初始化默认策略
  useEffect(() => {
    console.log('Current strategies count:', strategies.length)
    const initialized = initializeDefaultStrategies()
    if (initialized) {
      console.log('Default strategies initialized')
    }
    console.log('After init strategies count:', strategies.length)
  }, [initializeDefaultStrategies, strategies.length])

  // 强制重置为默认策略
  const handleResetToDefault = () => {
    console.log('Resetting to default strategies...')
    resetToSample()
  }

  // 强制刷新策略列表
  const handleRefreshStrategies = () => {
    console.log('Refreshing strategies...')
    const initialized = initializeDefaultStrategies()
    if (initialized) {
      console.log('Strategies refreshed successfully')
    }
  }

  // 编辑策略
  const handleEditStrategy = (strategy) => {
    // 清空当前策略状态
    resetAllParams()
    
    // 加载策略数据到策略构建器
    if (strategy.strategy && strategy.strategy.nodes) {
      strategy.strategy.nodes.forEach(node => {
        if (node.data) {
          initNodeParams(node.id, node.data.nodeType, node.data.subType)
        }
      })
    }
    
    // 跳转到策略编辑页面，携带 strategyId
    navigate(`/strategies/${strategy.id}/edit`)
  }

  // 打开回测设置面板
  const handleRunBacktest = (strategy) => {
    setSelectedStrategy(strategy)
    setBacktestModalOpen(true)
  }

  // 执行回测
  const handleExecuteBacktest = async (backtestParams) => {
    if (onBacktest) {
      await onBacktest(backtestParams)
    }
  }

  // 关闭回测面板
  const handleCloseBacktestModal = () => {
    setBacktestModalOpen(false)
    setSelectedStrategy(null)
  }

  // 开始重命名
  const handleStartRename = (strategy) => {
    setRenamingId(strategy.id)
    setNewName(strategy.name)
  }

  // 保存重命名
  const handleSaveRename = () => {
    if (newName.trim() && renamingId) {
      renameStrategy(renamingId, newName.trim())
      setRenamingId(null)
      setNewName('')
    }
  }

  // 取消重命名
  const handleCancelRename = () => {
    setRenamingId(null)
    setNewName('')
  }

  // 删除策略
  const handleDeleteStrategy = async (id) => {
    setDeletingId(id)
    // 添加确认对话框
    if (window.confirm('确定要删除这个策略吗？')) {
      deleteStrategy(id)
    }
    setDeletingId(null)
  }

  // 格式化日期
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="space-y-4">
      {/* 策略列表标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">我的策略</h3>
          <p className="text-sm text-muted-foreground">管理您的交易策略</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshStrategies}
            className="flex items-center space-x-2"
          >
            <span>刷新策略</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetToDefault}
            className="flex items-center space-x-2"
          >
            <span>重置默认策略</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/strategy')}
            className="flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>新建策略</span>
          </Button>
        </div>
      </div>

      {/* 策略列表 */}
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">
          调试信息: 策略数量 = {strategies.length}
        </div>
        {strategies.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-muted-foreground">
                <p className="text-sm">暂无策略</p>
                <p className="text-xs mt-1">点击"新建策略"开始创建您的第一个策略</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          strategies.map((strategy) => (
            <Card key={strategy.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      {renamingId === strategy.id ? (
                        <div className="flex items-center space-x-2 flex-1">
                          <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="h-8 text-sm"
                            placeholder="策略名称"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename()
                              if (e.key === 'Escape') handleCancelRename()
                            }}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleSaveRename}
                            className="h-8 w-8 p-0"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCancelRename}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <h4 className="font-medium text-sm truncate">{strategy.name}</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStartRename(strategy)}
                            className="h-6 w-6 p-0"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {strategy.strategy?.nodes?.length || 0} 个节点
                      </span>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {strategy.description}
                    </p>
                    
                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>创建: {formatDate(strategy.createdAt)}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>更新: {formatDate(strategy.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditStrategy(strategy)}
                      className="flex items-center space-x-1"
                    >
                      <Edit className="h-3 w-3" />
                      <span>编辑</span>
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRunBacktest(strategy)}
                      className="flex items-center space-x-1"
                    >
                      <Play className="h-3 w-3" />
                      <span>回测</span>
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteStrategy(strategy.id)}
                      disabled={deletingId === strategy.id}
                      className="flex items-center space-x-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>删除</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 策略统计 */}
      {strategies.length > 0 && (
        <div className="text-xs text-muted-foreground text-center pt-2">
          共 {strategies.length} 个策略
        </div>
      )}

      {/* 回测设置面板 */}
      <BacktestModal
        isOpen={backtestModalOpen}
        onClose={handleCloseBacktestModal}
        strategy={selectedStrategy}
        onRunBacktest={handleExecuteBacktest}
      />
    </div>
  )
}
