import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { StrategyList } from '../components/StrategyList'
import { StrategyBuilder } from '../components/StrategyBuilder'
import { BacktestModal } from '../components/BacktestModal'
import { ArrowLeft, Plus, List, Settings, BarChart3, RefreshCw } from 'lucide-react'

export function StrategiesPage() {
  const navigate = useNavigate()
  const { strategyId } = useParams()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('list')
  const [backtestModalOpen, setBacktestModalOpen] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const strategyBuilderRef = useRef(null)

  // 动态计算昨天（YYYY-MM-DD）
  const getYesterday = useCallback(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }, [])

  // 根据URL参数自动切换到策略构建器
  useEffect(() => {
    if (strategyId) {
      setActiveTab('builder')
    } else {
      setActiveTab('list')
    }
  }, [strategyId])

  // 监听路由变化，确保页面正确更新
  useEffect(() => {
    if (!strategyId) {
      setActiveTab('list')
      setBacktestModalOpen(false)
      setSelectedStrategy(null)
    }
  }, [strategyId, location.pathname])

  // 处理回测请求 - 优化性能
  const handleBacktest = useCallback(async (backtestParams) => {
    if (!backtestParams?.strategyId) {
      console.error('回测参数无效', backtestParams)
      alert('回测参数无效，请重试')
      return
    }
    
    setIsLoading(true)
    try {
      navigate(`/backtest/${backtestParams.strategyId}`, { 
        state: { backtestParams } 
      })
    } catch (error) {
      console.error('导航失败', error)
      alert('导航到回测结果页面失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }, [navigate])

  // 处理顶部导航的开始回测按钮 - 优化逻辑
  const handleStartBacktest = useCallback(() => {
    if (activeTab === 'builder') {
      if (!strategyBuilderRef.current) {
        alert('策略构建器未初始化，请刷新页面重试')
        return
      }
      
      const currentStrategy = strategyBuilderRef.current.getCurrentStrategy()
      if (!currentStrategy?.strategy?.nodes?.length) {
        alert('请先在策略构建器中添加节点构建策略')
        return
      }
      
      const strategyParams = JSON.parse(localStorage.getItem('strategyParams') || '{}')
      const backtestParams = {
        strategyId: strategyId || currentStrategy.id,
        strategy: currentStrategy.strategy,
        startDate: strategyParams.startDate || '2024-01-01',
        endDate: strategyParams.endDate || getYesterday(),
        initialCapital: strategyParams.initialCapital || 100000,
        timeframe: strategyParams.timeframe || '5m',
        positionManagement: strategyParams.positionManagement || 'full'
      }
      
      handleBacktest(backtestParams)
    } else if (activeTab === 'list') {
      alert('请先切换到策略构建页面构建策略，或从策略列表中选择一个策略进行回测')
    }
  }, [activeTab, handleBacktest, strategyId])

  // 监听顶部导航的开始回测事件
  useEffect(() => {
    const handleStartBacktestEvent = () => handleStartBacktest()
    window.addEventListener('startBacktest', handleStartBacktestEvent)
    return () => window.removeEventListener('startBacktest', handleStartBacktestEvent)
  }, [handleStartBacktest])

  // 打开回测设置面板
  const handleRunBacktest = useCallback((strategy) => {
    setSelectedStrategy(strategy)
    setBacktestModalOpen(true)
  }, [])

  // 关闭回测面板
  const handleCloseBacktestModal = useCallback(() => {
    setBacktestModalOpen(false)
    setSelectedStrategy(null)
  }, [])

  // 切换标签页
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab)
    if (tab === 'list') {
      navigate('/strategies')
    }
  }, [navigate])

  // 计算页面标题和描述
  const pageInfo = useMemo(() => {
    if (activeTab === 'list') {
      return {
        title: '策略管理',
        description: '管理您的交易策略',
        icon: <List className="h-5 w-5" />
      }
    } else {
      return {
        title: '策略构建',
        description: '构建新的交易策略',
        icon: <Settings className="h-5 w-5" />
      }
    }
  }, [activeTab])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* 优化的顶部导航 */}
      <div className="sticky top-0 z-40 border-b border-border/50 bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                {pageInfo.icon}
                <div>
                  <h1 className="text-xl font-semibold text-foreground">{pageInfo.title}</h1>
                  <p className="text-sm text-muted-foreground">{pageInfo.description}</p>
                </div>
              </div>
            </div>
            
            {/* 恢复顶部快速回测按钮，并放在标签切换前 */}
            <div className="flex items-center gap-2 flex-wrap">
              {activeTab === 'builder' && (
                <Button
                  onClick={handleStartBacktest}
                  disabled={isLoading}
                  className="flex items-center space-x-2 bg-primary hover:bg-primary/90"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>{isLoading ? '处理中...' : '快速回测'}</span>
                </Button>
              )}
              <div className="flex rounded-lg bg-muted p-1 flex-shrink-0">
                <Button
                  variant={activeTab === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleTabChange('list')}
                  className="flex items-center space-x-2 transition-all duration-200"
                >
                  <List className="h-4 w-4" />
                  <span>策略列表</span>
                </Button>
                <Button
                  variant={activeTab === 'builder' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => handleTabChange('builder')}
                  className="flex items-center space-x-2 transition-all duration-200"
                >
                  <Settings className="h-4 w-4" />
                  <span>策略构建</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="container mx-auto px-4 py-6">
        {activeTab === 'list' && (
          <div className="max-w-6xl mx-auto">
            <StrategyList onBacktest={handleBacktest} />
          </div>
        )}

        {activeTab === 'builder' && (
          <div className="h-[calc(100vh-8rem)]">
            <StrategyBuilder ref={strategyBuilderRef} />
          </div>
        )}
      </div>

      {/* 回测设置模态框 */}
      <BacktestModal
        isOpen={backtestModalOpen}
        onClose={handleCloseBacktestModal}
        strategy={selectedStrategy}
        onRunBacktest={handleBacktest}
      />
    </div>
  )
}
