import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useStrategyListStore } from '../store/strategyListStore'
import { useStrategyStore } from '../store/strategyStore'
import { Edit, Play, Trash2, Plus, Calendar, Clock, Save, X, Pencil, RefreshCw, BarChart3, Settings, Library, Eye } from 'lucide-react'
import { strategyLibrary } from '../data/strategyLibrary'
import { BacktestModal } from './BacktestModal'

export function StrategyList({ onBacktest }) {
  const navigate = useNavigate()
  const { strategies, addStrategy, deleteStrategy, renameStrategy, initializeDefaultStrategies, resetToSample } = useStrategyListStore()
  const { resetAllParams, initNodeParams } = useStrategyStore()
  const [deletingId, setDeletingId] = useState(null)
  const [backtestModalOpen, setBacktestModalOpen] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [newName, setNewName] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [previewItem, setPreviewItem] = useState(null)
  const [openedFromLibrary, setOpenedFromLibrary] = useState(false)
  const [shouldReopenLibraryOnClose, setShouldReopenLibraryOnClose] = useState(false)

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

  // 从策略库打开回测（关闭抽屉，关闭时如未执行回测则恢复抽屉）
  const handleRunBacktestFromLibrary = useCallback((strategy) => {
    setOpenedFromLibrary(true)
    setShouldReopenLibraryOnClose(true)
    setShowLibrary(false)
    setSelectedStrategy(strategy)
    setBacktestModalOpen(true)
  }, [])

  // 执行回测
  const handleExecuteBacktest = useCallback(async (backtestParams) => {
    // 用户确认执行回测时不再恢复抽屉
    setShouldReopenLibraryOnClose(false)
    if (onBacktest) {
      await onBacktest(backtestParams)
    }
  }, [onBacktest])

  // 关闭回测面板
  const handleCloseBacktestModal = useCallback(() => {
    setBacktestModalOpen(false)
    setSelectedStrategy(null)
    if (openedFromLibrary && shouldReopenLibraryOnClose) {
      setShowLibrary(true)
    }
    setOpenedFromLibrary(false)
    setShouldReopenLibraryOnClose(false)
  }, [])

  // 从策略库复制为我的策略（深拷贝，生成新ID）
  const handleCopyFromLibrary = useCallback((libItem) => {
    try {
      const deepCopy = JSON.parse(JSON.stringify(libItem))
      const toAdd = {
        ...deepCopy,
        id: undefined, // 让store自动生成新id
        name: deepCopy.name + '（副本）',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      addStrategy(toAdd)
      alert('已复制到我的策略')
    } catch (e) {
      console.error('复制策略失败', e)
      alert('复制策略失败，请重试')
    }
  }, [addStrategy])

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
            onClick={() => setShowLibrary(true)}
            className="flex items-center space-x-2"
          >
            <Library className="h-4 w-4" />
            <span>打开策略库</span>
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
            onClick={() => {
              // 立即创建一个空白策略并跳转到编辑页
              const newId = `strategy_${Date.now()}`
              const base = {
                id: newId,
                name: '新策略',
                description: '请在策略构建器中添加节点并保存',
                strategy: { nodes: [], edges: [] }
              }
              addStrategy(base)
              navigate(`/strategies/${newId}/edit`)
            }}
            className="flex items-center space-x-2 bg-primary hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            <span>新建策略</span>
          </Button>
        </div>
      </div>

      {/* 我的策略 */}
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

      {/* 策略库抽屉 */}
      {showLibrary && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLibrary(false)}></div>
          <div className="absolute right-0 top-0 h-full w-full md:w-[560px] bg-card border-l border-border shadow-2xl flex flex-col">
            <div className="p-4 md:p-5 border-b border-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Library className="h-4 w-4" />
                <span className="font-semibold">策略库</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowLibrary(false)}>关闭</Button>
            </div>
            <div className="p-4 md:p-5 overflow-y-auto flex-1">
              <div className="grid gap-3">
                {strategyLibrary.map((lib) => (
                  <Card key={lib.id} className="hover:shadow-lg transition-all duration-200 border-border/50 hover:border-border">
                    <CardContent className="p-3 md:p-4">
                      <div className="flex flex-col gap-2">
                        {/* 头部：名称 + 标签 */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-semibold text-sm md:text-base leading-tight break-words text-foreground">
                              {lib.name}
                            </h4>
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="px-1.5 py-0.5 rounded bg-muted">预置</span>
                              {lib.recommended && <span className="px-1.5 py-0.5 rounded bg-muted">建议：{lib.recommended}</span>}
                              {(() => { const t = lib?.strategy?.nodes?.[0]?.data?.subType || lib?.strategy?.nodes?.[0]?.data?.type; return t ? <span className="px-1.5 py-0.5 rounded bg-muted">类型：{t}</span> : null })()}
                            </div>
                          </div>
                        </div>

                        {/* 主体：简介与小信息行 */}
                        <div className="text-xs md:text-sm text-muted-foreground line-clamp-2">
                          {lib.description}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> 节点：{lib?.strategy?.nodes?.length || 0}
                          </span>
                          {lib.tips && (
                            <span className="inline-flex items-center gap-1">
                              <Settings className="h-3 w-3" /> 技巧：<span className="truncate max-w-[200px] md:max-w-[320px] inline-block align-bottom">{lib.tips}</span>
                            </span>
                          )}
                        </div>

                        {/* 底部：紧凑操作区，自动换行 */}
                        <div className="pt-1 flex flex-wrap items-center gap-2">
                          <div className="inline-flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPreviewItem(lib)}
                              className="h-8 px-2 flex items-center space-x-1 whitespace-nowrap"
                            >
                              <Eye className="h-3 w-3" />
                              <span>预览</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRunBacktestFromLibrary(lib)}
                              className="h-8 px-2 flex items-center space-x-1 hover:bg-primary/10 hover:text-primary whitespace-nowrap"
                            >
                              <Play className="h-3 w-3" />
                              <span>回测</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyFromLibrary(lib)}
                              className="h-8 px-2 flex items-center space-x-1 whitespace-nowrap"
                            >
                              <Plus className="h-3 w-3" />
                              <span>复制到我的策略</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 预览模态框（不影响当前页面操作） */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPreviewItem(null)}></div>
          <Card className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="pb-3 sticky top-0 bg-card z-10 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{previewItem.name} - 策略预览</CardTitle>
                  <CardDescription className="text-xs">预览策略原理与使用技巧</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPreviewItem(null)} className="h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div>
                <div className="text-sm font-medium mb-1">策略说明</div>
                <div className="text-sm text-muted-foreground whitespace-pre-line">
                  {previewItem.principle || '—'}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">适用场景</div>
                <div className="text-sm text-muted-foreground whitespace-pre-line">
                  {previewItem.scenarios || '—'}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">使用技巧</div>
                <div className="text-sm text-muted-foreground whitespace-pre-line">
                  {previewItem.tips || '—'}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">适用 K 线周期</div>
                <div className="text-sm text-muted-foreground whitespace-pre-line">
                  {previewItem.recommended || '—'}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-1">核心逻辑（节点式）</div>
                <div className="text-xs text-muted-foreground bg-muted rounded p-3 overflow-x-auto">
                  <pre className="whitespace-pre-wrap break-words">{JSON.stringify({ nodes: previewItem.strategy?.nodes?.map(n => ({ type: n.type, subType: n.data?.subType, desc: n.data?.description })) || [] }, null, 2)}</pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
