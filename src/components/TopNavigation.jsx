import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from './ui/button'
import { Settings, Download, Upload, ArrowLeft, Home, BarChart3, History, List, Filter, TrendingUp } from 'lucide-react'
import { getNavigationSettings } from '../pages/SettingsPage'

export function TopNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuSettings, setMenuSettings] = useState(getNavigationSettings())

  // 监听设置变化（通过storage事件）
  useEffect(() => {
    const handleStorageChange = () => {
      setMenuSettings(getNavigationSettings())
    }
    
    // 监听localStorage变化
    window.addEventListener('storage', handleStorageChange)
    
    // 监听自定义事件（同页面内设置变化）
    const handleSettingsChange = () => {
      setMenuSettings(getNavigationSettings())
    }
    window.addEventListener('settingsChanged', handleSettingsChange)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('settingsChanged', handleSettingsChange)
    }
  }, [])
  
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
          
          {/* 功能按钮 */}
          <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
            <Settings className="h-4 w-4 mr-2" />
            设置
          </Button>
          {/* 网格交易入口：根据设置显示/隐藏 */}
          {menuSettings.showGridLab && (
            <Button variant="outline" size="sm" onClick={() => navigate('/grid-lab')}>
              网格交易
            </Button>
          )}
          <div className="flex items-center gap-2">
            {/* 股票回测：根据设置显示/隐藏 */}
            {menuSettings.showSymbolBacktest && (
              <Button variant="default" size="sm" onClick={() => navigate('/symbol-backtest')}>
                <BarChart3 className="h-4 w-4 mr-2" />
                股票回测
              </Button>
            )}
            {/* 选股：根据设置显示/隐藏 */}
            {menuSettings.showStockSelection && (
              <Button variant="outline" size="sm" onClick={() => navigate('/stock-selection')}>
                <List className="h-4 w-4 mr-2" />
                选股
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate('/conditional-screener')}>
              <Filter className="h-4 w-4 mr-2" />
              条件选股
            </Button>
            {/* 回测记录：根据设置显示/隐藏 */}
            {menuSettings.showHistory && (
              <Button variant="outline" size="sm" onClick={() => navigate('/history')}>
                <History className="h-4 w-4 mr-2" />
                回测记录
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate('/price-trend')}>
              <TrendingUp className="h-4 w-4 mr-2" />
              价格走势
            </Button>
          </div>
          {/* 顶部全局“开始回测”按钮已移除，保留页内的回测入口 */}
        </div>
      </div>
    </header>
  )
}
