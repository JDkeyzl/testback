import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from './ui/button'
import { Settings, Download, Upload, ArrowLeft, Home, BarChart3, History, List } from 'lucide-react'

export function TopNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  
  // 判断是否显示导航按钮
  const showNavigation = location.pathname !== '/welcome'
  const canGoBack = window.history.length > 1
  
  // 判断是否在策略构建页面
  const isStrategyPage = location.pathname === '/strategies' || location.pathname.startsWith('/strategies/')
  
  const handleGoBack = () => {
    // 如果在策略编辑页面，返回到策略列表
    if (location.pathname.startsWith('/strategies/') && location.pathname.includes('/edit')) {
      navigate('/strategies', { replace: true })
    } else if (location.pathname === '/strategies') {
      // 如果在策略列表页面，返回到首页
      navigate('/welcome', { replace: true })
    } else if (canGoBack) {
      navigate(-1)
    } else {
      navigate('/welcome', { replace: true })
    }
  }
  
  const handleGoHome = () => {
    navigate('/welcome')
  }
  
  const handleStartBacktest = () => {
    console.log('TopNavigation: 开始回测按钮被点击', { isStrategyPage, pathname: location.pathname })
    
    if (isStrategyPage) {
      // 触发自定义事件，让StrategiesPage监听
      console.log('TopNavigation: 触发开始回测事件')
      window.dispatchEvent(new CustomEvent('startBacktest'))
    } else {
      // 其他页面的默认行为 - 导航到策略页面
      console.log('TopNavigation: 导航到策略页面')
      navigate('/strategies')
    }
  }
  
  return (
    <header className="h-16 border-b border-border bg-background">
      <div className="flex h-full items-center justify-between px-6">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-foreground">TestBack</h1>
          <span className="text-sm text-muted-foreground">策略回测平台</span>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* 导航按钮 */}
          {showNavigation && (
            <>
              {canGoBack && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleGoBack}
                  className="flex items-center space-x-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>返回上一页</span>
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleGoHome}
                className="flex items-center space-x-2"
              >
                <Home className="h-4 w-4" />
                <span>返回首页</span>
              </Button>
            </>
          )}
          
          {/* 功能按钮（简化：保留设置与股票回测，移除 导入策略 / 导出结果 / 期货回测） */}
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            设置
          </Button>
          {/* 网格交易入口：位于 设置 与 股票回测 之间 */}
          <Button variant="outline" size="sm" onClick={() => navigate('/grid-lab')}>
            网格交易
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={() => navigate('/symbol-backtest')}>
              <BarChart3 className="h-4 w-4 mr-2" />
              股票回测
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/stock-selection')}>
              <List className="h-4 w-4 mr-2" />
              选股
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/history')}>
              <History className="h-4 w-4 mr-2" />
              回测记录
            </Button>
          </div>
          {/* 顶部全局“开始回测”按钮已移除，保留页内的回测入口 */}
        </div>
      </div>
    </header>
  )
}
