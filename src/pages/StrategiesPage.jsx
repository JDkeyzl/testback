import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { StrategyList } from '../components/StrategyList'
import { StrategyBuilder } from '../components/StrategyBuilder'
import { BacktestModal } from '../components/BacktestModal'
import { ArrowLeft, Plus, List, Settings } from 'lucide-react'

export function StrategiesPage() {
  const navigate = useNavigate()
  const { strategyId } = useParams()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('list') // 'list' or 'builder'
  const [backtestModalOpen, setBacktestModalOpen] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState(null)
  const strategyBuilderRef = useRef(null)

  // 根据URL参数自动切换到策略构建器
  useEffect(() => {
    if (strategyId) {
      setActiveTab('builder')
    } else {
      // 如果没有strategyId，确保显示策略列表
      setActiveTab('list')
    }
  }, [strategyId])

  // 监听路由变化，确保页面正确更新
  useEffect(() => {
    // 当路由变化时，重置相关状态
    if (!strategyId) {
      setActiveTab('list')
      setBacktestModalOpen(false)
      setSelectedStrategy(null)
    }
  }, [strategyId, location.pathname])

  // 处理回测请求
  const handleBacktest = useCallback(async (backtestParams) => {
    console.log('StrategiesPage: 收到回测请求，将导航到回测结果页面', backtestParams)
    
    if (!backtestParams || !backtestParams.strategyId) {
      console.error('StrategiesPage: 回测参数无效', backtestParams)
      alert('回测参数无效，请重试')
      return
    }
    
    try {
      // 导航到回测结果页面，传递回测参数
      navigate(`/backtest/${backtestParams.strategyId}`, { 
        state: { backtestParams } 
      })
    } catch (error) {
      console.error('StrategiesPage: 导航失败', error)
      alert('导航到回测结果页面失败，请重试')
    }
  }, [navigate])

  // 处理顶部导航的开始回测按钮
  const handleStartBacktest = useCallback(() => {
    console.log('StrategiesPage: handleStartBacktest 被调用', { 
      activeTab, 
      strategyBuilderRef: !!strategyBuilderRef.current,
      strategyId,
      location: location.pathname
    })
    
    if (activeTab === 'builder') {
      if (!strategyBuilderRef.current) {
        console.error('StrategiesPage: strategyBuilderRef 为空')
        alert('策略构建器未初始化，请刷新页面重试')
        return
      }
      
      // 从策略构建器获取当前策略
      const currentStrategy = strategyBuilderRef.current.getCurrentStrategy()
      console.log('StrategiesPage: 获取到当前策略', currentStrategy)
      
      if (!currentStrategy) {
        alert('请先在策略构建器中添加节点构建策略')
        return
      }
      
      if (!currentStrategy.strategy || !currentStrategy.strategy.nodes || currentStrategy.strategy.nodes.length === 0) {
        alert('策略数据无效，请重新构建策略')
        return
      }
      
      // 使用策略ID或生成新的ID
      const finalStrategyId = strategyId || currentStrategy.id
      console.log('StrategiesPage: 使用策略ID', { strategyId, finalStrategyId })
      
      // 直接执行回测，不打开模态框
                // 获取策略参数
          const strategyParams = JSON.parse(localStorage.getItem('strategyParams') || '{}')
          
          const backtestParams = {
            strategyId: finalStrategyId,
            strategy: currentStrategy.strategy,
            startDate: strategyParams.startDate || '2024-01-01',
            endDate: strategyParams.endDate || '2024-12-31',
            initialCapital: strategyParams.initialCapital || 100000,
            timeframe: strategyParams.timeframe || '5m'
          }
      console.log('StrategiesPage: 准备执行回测', backtestParams)
      handleBacktest(backtestParams)
    } else if (activeTab === 'list') {
      alert('请先切换到策略构建页面构建策略，或从策略列表中选择一个策略进行回测')
    } else {
      console.log('StrategiesPage: 无法执行回测', { activeTab, strategyBuilderRef: !!strategyBuilderRef.current })
      alert('当前页面不支持回测功能')
    }
  }, [activeTab, handleBacktest, strategyId, location.pathname])

  // 监听顶部导航的开始回测事件
  useEffect(() => {
    const handleStartBacktestEvent = () => {
      console.log('StrategiesPage: 收到开始回测事件', { activeTab, strategyBuilderRef: !!strategyBuilderRef.current })
      handleStartBacktest()
    }

    window.addEventListener('startBacktest', handleStartBacktestEvent)
    return () => {
      window.removeEventListener('startBacktest', handleStartBacktestEvent)
    }
  }, [activeTab, handleStartBacktest])

  // 打开回测设置面板
  const handleRunBacktest = (strategy) => {
    setSelectedStrategy(strategy)
    setBacktestModalOpen(true)
  }

  // 关闭回测面板
  const handleCloseBacktestModal = () => {
    setBacktestModalOpen(false)
    setSelectedStrategy(null)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-xl font-semibold">策略管理</h1>
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'list' ? '管理您的交易策略' : '构建新的交易策略'}
                </p>
              </div>
            </div>
            
            {/* 标签页切换 */}
            <div className="flex space-x-2">
              <Button
                variant={activeTab === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('list')}
                className="flex items-center space-x-2"
              >
                <List className="h-4 w-4" />
                <span>策略列表</span>
              </Button>
              <Button
                variant={activeTab === 'builder' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('builder')}
                className="flex items-center space-x-2"
              >
                <Settings className="h-4 w-4" />
                <span>策略构建</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {activeTab === 'list' && (
          <div className="max-w-4xl mx-auto">
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
