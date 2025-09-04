import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { BacktestResults } from '../components/BacktestResults'
import { StrategyList } from '../components/StrategyList'
import { Settings, BarChart3, TrendingUp, Play, List, ArrowLeft } from 'lucide-react'

export function HomePage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('welcome') // 'welcome' 或 'strategies'
  const [currentStrategyData, setCurrentStrategyData] = useState(null)
  const [currentStrategyId, setCurrentStrategyId] = useState(null)
  const [backtestParams, setBacktestParams] = useState(null)

  const handleGoToStrategy = () => {
    navigate('/strategy')
  }

  const handleBacktest = async (backtestParams) => {
    console.log('HomePage: 收到回测请求，将导航到回测结果页面', backtestParams)
    // 回测现在在独立页面处理，这里不需要特殊处理
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* 左侧：欢迎和操作区域 */}
      <div className="w-1/2 border-r border-border flex flex-col">
        {/* 标签页切换 */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('welcome')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'welcome'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <TrendingUp className="h-4 w-4" />
              <span>欢迎</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('strategies')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'strategies'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <List className="h-4 w-4" />
              <span>我的策略</span>
            </div>
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'welcome' ? (
            <div className="space-y-6">
              {/* 欢迎卡片 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <TrendingUp className="h-6 w-6 text-primary" />
                    <span>欢迎使用 TestBack</span>
                  </CardTitle>
                  <CardDescription>
                    专业的策略回测平台，帮助您构建、测试和优化交易策略
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/50">
                        <Settings className="h-5 w-5 text-blue-600" />
                        <div>
                          <div className="font-medium text-sm">策略构建</div>
                          <div className="text-xs text-muted-foreground">可视化策略编辑器</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/50">
                        <BarChart3 className="h-5 w-5 text-green-600" />
                        <div>
                          <div className="font-medium text-sm">回测分析</div>
                          <div className="text-xs text-muted-foreground">详细的结果分析</div>
                        </div>
                      </div>
                    </div>
                    
                    <Button 
                      onClick={handleGoToStrategy}
                      className="w-full flex items-center space-x-2"
                      size="lg"
                    >
                      <Play className="h-5 w-5" />
                      <span>进入策略操作</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 功能说明 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">平台功能</CardTitle>
                  <CardDescription>了解 TestBack 的核心功能</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2"></div>
                        <div>
                          <div className="font-medium text-sm">策略构建器</div>
                          <div className="text-xs text-muted-foreground">
                            使用 React Flow 可视化构建交易策略，支持条件节点、逻辑节点和动作节点
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2"></div>
                        <div>
                          <div className="font-medium text-sm">参数配置</div>
                          <div className="text-xs text-muted-foreground">
                            实时调整策略参数，支持滑块和输入框，参数变化立即生效
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2"></div>
                        <div>
                          <div className="font-medium text-sm">策略回测</div>
                          <div className="text-xs text-muted-foreground">
                            完整的回测引擎，计算胜率、盈亏比、最大回撤等关键指标
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-start space-x-3">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2"></div>
                        <div>
                          <div className="font-medium text-sm">结果分析</div>
                          <div className="text-xs text-muted-foreground">
                            丰富的图表展示，包括资金曲线、收益率分布和交易记录
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <StrategyList onBacktest={handleBacktest} />
          )}
        </div>
      </div>

      {/* 右侧：回测结果区域 */}
      <div className="w-1/2">
        <BacktestResults 
          externalStrategyData={currentStrategyData} 
          strategyId={currentStrategyId}
          backtestParams={backtestParams}
        />
      </div>
    </div>
  )
}
