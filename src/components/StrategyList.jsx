import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useStrategyListStore } from '../store/strategyListStore'
import { useStrategyStore } from '../store/strategyStore'
import { Edit, Play, Trash2, Plus, Calendar, Clock, Save, X, Pencil, RefreshCw, BarChart3, Settings } from 'lucide-react'
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
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 初始化默认策略 - 优化性能
  useEffect(() => {
    if (strategies.length === 0) {
      initializeDefaultStrategies()
    }
  }, [initializeDefaultStrategies, strategies.length])

  // 强制重置为默认策略
  const handleResetToDefault = useCallback(() => {
    resetToSample()
  }, [resetToSample])

  // 强制刷新策略列表 - 优化性能
  const handleRefreshStrategies = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await initializeDefaultStrategies()
    } finally {
      setIsRefreshing(false)
    }
  }, [initializeDefaultStrategies])

  // 编辑策略 - 优化性能
  const handleEditStrategy = useCallback((strategy) => {
    resetAllParams()
    
    if (strategy.strategy?.nodes) {
      strategy.strategy.nodes.forEach(node => {
        if (node.data) {
          initNodeParams(node.id, node.data.nodeType, node.data.subType)
        }
      })
    }
    
    navigate(`/strategies/${strategy.id}/edit`)
  }, [navigate, resetAllParams, initNodeParams])

  // 打开回测设置面板
  const handleRunBacktest = useCallback((strategy) => {
    setSelectedStrategy(strategy)
    setBacktestModalOpen(true)
  }, [])

  // 执行回测
  const handleExecuteBacktest = useCallback(async (backtestParams) => {
    if (onBacktest) {
      await onBacktest(backtestParams)
    }
  }, [onBacktest])

  // 关闭回测面板
  const handleCloseBacktestModal = useCallback(() => {
    setBacktestModalOpen(false)
    setSelectedStrategy(null)
  }, [])

  // 开始重命名
  const handleStartRename = useCallback((strategy) => {
    setRenamingId(strategy.id)
    setNewName(strategy.name)
  }, [])

  // 保存重命名
  const handleSaveRename = useCallback(() => {
    if (newName.trim() && renamingId) {
      renameStrategy(renamingId, newName.trim())
      setRenamingId(null)
      setNewName('')
    }
  }, [newName, renamingId, renameStrategy])

  // 取消重命名
  const handleCancelRename = useCallback(() => {
    setRenamingId(null)
    setNewName('')
  }, [])

  // 删除策略
  const handleDeleteStrategy = useCallback(async (id) => {
    setDeletingId(id)
    if (window.confirm('确定要删除这个策略吗？')) {
      deleteStrategy(id)
    }
    setDeletingId(null)
  }, [deleteStrategy])

  // 格式化日期 - 使用useMemo优化
  const formatDate = useCallback((dateString) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }, [])

  // 计算策略统计信息
  const strategyStats = useMemo(() => {
    return {
      total: strategies.length,
      withNodes: strategies.filter(s => s.strategy?.nodes?.length > 0).length,
      lastUpdated: strategies.length > 0 ? Math.max(...strategies.map(s => new Date(s.updatedAt).getTime())) : 0
    }
  }, [strategies])

  return (
    <div className="space-y-6">
      {/* 优化的策略列表标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div>
            <h3 className="text-xl font-semibold text-foreground">我的策略</h3>
            <p className="text-sm text-muted-foreground">管理您的交易策略</p>
          </div>
          {/* 策略统计信息 */}
          {strategyStats.total > 0 && (
            <div className="flex items-center space-x-4 text-xs text-muted-foreground">
              <div className="flex items-center space-x-1">
                <BarChart3 className="h-4 w-4" />
                <span>{strategyStats.total} 个策略</span>
              </div>
              <div className="flex items-center space-x-1">
                <Settings className="h-4 w-4" />
                <span>{strategyStats.withNodes} 个已配置</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshStrategies}
            disabled={isRefreshing}
            className="flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? '刷新中...' : '刷新策略'}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetToDefault}
            className="flex items-center space-x-2"
          >
            <span>重置默认</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => navigate('/strategy')}
            className="flex items-center space-x-2 bg-primary hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span>新建策略</span>
          </Button>
        </div>
      </div>

      {/* 优化的策略列表 */}
      <div className="space-y-3">
        {strategies.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <div className="flex flex-col items-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Settings className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">暂无策略</p>
                  <p className="text-xs text-muted-foreground mt-1">点击"新建策略"开始创建您的第一个策略</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {strategies.map((strategy) => (
              <Card key={strategy.id} className="hover:shadow-lg transition-all duration-200 border-border/50 hover:border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-3">
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
                            <h4 className="font-medium text-base truncate text-foreground">{strategy.name}</h4>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStartRename(strategy)}
                              className="h-6 w-6 p-0 hover:bg-muted"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
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
                        className="flex items-center space-x-1 hover:bg-muted"
                      >
                        <Edit className="h-3 w-3" />
                        <span>编辑</span>
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRunBacktest(strategy)}
                        className="flex items-center space-x-1 hover:bg-primary/10 hover:text-primary"
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
            ))}
          </div>
        )}
      </div>

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
