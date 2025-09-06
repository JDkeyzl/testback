import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Activity, Calendar, Clock, BarChart3, List } from 'lucide-react'
import { useStrategyListStore } from '../store/strategyListStore'

export function BacktestResultPage() {
  const navigate = useNavigate()
  const { strategyId } = useParams()
  const location = useLocation()
  const { getStrategy } = useStrategyListStore()
  
  const [isRunning, setIsRunning] = useState(false)
  const [backtestResult, setBacktestResult] = useState(null)
  const [error, setError] = useState(null)
  const [dataInfo, setDataInfo] = useState(null)
  const [statusMessage, setStatusMessage] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  
  // 从路由状态获取回测参数，或使用URL参数
  const backtestParams = location.state?.backtestParams || { strategyId }
  const strategy = getStrategy(backtestParams.strategyId)
  
  console.log('BacktestResultPage: 策略获取调试', {
    backtestParams,
    strategyId,
    strategy,
    locationState: location.state,
    hasStrategy: !!strategy,
    hasBacktestParams: !!backtestParams,
    strategyIdFromParams: backtestParams?.strategyId
  })

  // 默认指标数据
  const defaultMetrics = {
    totalReturn: 0,
    annualReturn: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    winRate: 0,
    profitLossRatio: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0
  }

  const metrics = backtestResult?.metrics || defaultMetrics
  
  // 确保所有指标都有默认值，避免undefined错误
  const safeMetrics = {
    totalReturn: metrics.totalReturn ?? 0,
    annualReturn: metrics.annualReturn ?? 0,
    maxDrawdown: metrics.maxDrawdown ?? 0,
    sharpeRatio: metrics.sharpeRatio ?? 0,
    winRate: metrics.winRate ?? 0,
    profitLossRatio: metrics.profitLossRatio ?? 0,
    totalTrades: metrics.totalTrades ?? 0,
    winningTrades: metrics.winningTrades ?? 0,
    losingTrades: metrics.losingTrades ?? 0
  }

  // 格式化资金曲线数据
  const formatEquityCurve = (equityCurve) => {
    if (!equityCurve) return []
    
    return equityCurve.map(point => {
      const dateStr = point.date || (point.timestamp ? String(point.timestamp).split(' ')[0] : '')
      return {
        date: dateStr,
        value: point.equity,
        returns: (Number(point.returns || 0) * 100).toFixed(2)
      }
    })
  }

  // 格式化交易记录 - 修复盈亏逻辑
  const formatTrades = (trades) => {
    if (!trades) return []
    
    let currentBalance = backtestParams?.initialCapital || 100000
    let position = 0 // 持仓数量
    let avgCost = 0 // 平均成本
    
    return trades.map(trade => {
      let pnlDisplay = '-'
      let pnlClass = ''
      let newBalance = currentBalance
      let tradeAmount = 0 // 计算正确的交易金额
      
      if (trade.action === 'buy') {
        // 买入：更新持仓和平均成本
        tradeAmount = trade.price * trade.quantity // 修复金额计算
        const newPosition = position + trade.quantity
        const newAvgCost = position > 0 
          ? (avgCost * position + trade.price * trade.quantity) / newPosition
          : trade.price
        
        position = newPosition
        avgCost = newAvgCost
        newBalance = currentBalance - tradeAmount
        pnlDisplay = '-'
        pnlClass = ''
      } else if (trade.action === 'sell') {
        // 卖出：计算实际盈亏
        tradeAmount = trade.price * trade.quantity // 修复金额计算
        const pnl = (trade.price - avgCost) * trade.quantity
        position = Math.max(0, position - trade.quantity)
        newBalance = currentBalance + tradeAmount
        
        if (pnl > 0) {
          pnlDisplay = `+¥${pnl.toFixed(2)}`
          pnlClass = 'text-red-600' // 盈利显示红色
        } else if (pnl < 0) {
          pnlDisplay = `-¥${Math.abs(pnl).toFixed(2)}`
          pnlClass = 'text-green-600' // 亏损显示绿色
        } else {
          pnlDisplay = '¥0.00'
        }
      }
      
      currentBalance = newBalance
      
      // 计算证券价值（持仓数量 × 当前价格）
      const securityValue = position * trade.price
      // 计算总资产（可用资金 + 证券价值）
      const totalAssets = currentBalance + securityValue
      
      return {
        timestamp: trade.timestamp || trade.date,
        date: trade.timestamp ? new Date(trade.timestamp).toLocaleDateString('zh-CN') : trade.date,
        time: trade.timestamp ? new Date(trade.timestamp).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }) : trade.date,
        action: trade.action,
        price: trade.price.toFixed(2),
        quantity: trade.quantity,
        amount: tradeAmount.toFixed(2), // 使用计算出的正确金额
        pnl: pnlDisplay,
        pnlClass: pnlClass,
        balance: currentBalance.toFixed(2), // 可用资金
        position: position, // 持仓数量
        securityValue: securityValue.toFixed(2), // 证券价值
        totalAssets: totalAssets.toFixed(2), // 总资产
        avgCost: avgCost.toFixed(2)
      }
    })
  }

  const equityData = formatEquityCurve(backtestResult?.equityCurve)
  const tradesData = formatTrades(backtestResult?.trades)

  // 运行回测
  const runBacktest = useCallback(async () => {
    if (!backtestParams || !strategy) {
      console.log('BacktestResultPage: 缺少参数或策略，无法运行回测', {
        hasBacktestParams: !!backtestParams,
        hasStrategy: !!strategy,
        backtestParams,
        strategy
      })
      return
    }

    console.log('BacktestResultPage: 开始回测', backtestParams)
    console.log('BacktestResultPage: 策略配置', backtestParams.strategy || strategy.strategy)
    setIsRunning(true)
    setError(null)
    setStatusMessage(`正在运行：${strategy?.name || backtestParams.strategyId}`)
    
    try {
      setStatusMessage('正在加载股票数据...')
      
      const requestBody = {
        strategy: backtestParams.strategy || strategy.strategy,
        symbol: "002130",
        timeframe: backtestParams.timeframe,
        startDate: backtestParams.startDate,
        endDate: backtestParams.endDate,
        initialCapital: backtestParams.initialCapital,
        strategyId: backtestParams.strategyId
      }
      
      console.log('BacktestResultPage: 发送回测请求', requestBody)
      
      const response = await fetch('http://localhost:8000/api/v1/backtest/real', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })

      if (response.ok) {
        setStatusMessage('正在处理回测结果...')
        
        const result = await response.json()
        console.log('BacktestResultPage: 回测成功', result)
        
        // 转换数据格式以匹配前端显示
        const formattedResult = {
          metrics: {
            totalReturn: result.total_return || 0,
            annualReturn: result.total_return || 0,
            maxDrawdown: result.max_drawdown || 0,
            sharpeRatio: 0,
            winRate: result.win_rate || 0,
            profitLossRatio: result.profit_loss_ratio || 0,
            totalTrades: result.total_trades || 0,
            winningTrades: Math.round((result.win_rate || 0) * (result.total_trades || 0)),
            losingTrades: Math.round((1 - (result.win_rate || 0)) * (result.total_trades || 0))
          },
          equityCurve: result.equity_curve || [],
          trades: result.trades || [],
          dataInfo: result.data_info || null
        }
        
        setBacktestResult(formattedResult)
        setDataInfo(result.data_info)
        setStatusMessage('回测完成！')
      } else {
        const errorText = await response.text()
        throw new Error(`回测失败: ${errorText}`)
      }
    } catch (err) {
      setError(err.message)
      console.error('回测失败:', err)
    } finally {
      setIsRunning(false)
      setStatusMessage(null)
    }
  }, [backtestParams, strategy])

  // 页面加载时自动运行回测
  useEffect(() => {
    console.log('BacktestResultPage: useEffect触发', {
      backtestParams: !!backtestParams,
      strategy: !!strategy,
      backtestResult: !!backtestResult,
      strategyId: backtestParams?.strategyId
    })
    
    if (backtestParams && strategy && !backtestResult) {
      console.log('BacktestResultPage: 开始自动运行回测')
      runBacktest()
    }
  }, [backtestParams, strategy, backtestResult, runBacktest])

  // 如果没有回测参数或策略，返回策略管理页
  useEffect(() => {
    console.log('BacktestResultPage: 检查参数和策略', {
      backtestParams: !!backtestParams,
      strategy: !!strategy,
      strategyId: backtestParams?.strategyId
    })
    
    if (!backtestParams || !strategy) {
      console.log('BacktestResultPage: 缺少参数或策略，导航回策略页面')
      navigate('/strategies')
    }
  }, [backtestParams, strategy, navigate])

  // 如果没有回测参数或策略，显示加载状态
  if (!backtestParams || !strategy) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">正在加载策略...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-xl font-semibold">回测结果</h1>
                <p className="text-sm text-muted-foreground">
                  {strategy.name} - {backtestParams.startDate} 至 {backtestParams.endDate}
                </p>
                <div className="text-xs text-muted-foreground mt-1">
                  策略ID: {backtestParams.strategyId} | 周期: {backtestParams.timeframe} | 初始资金: ¥{backtestParams.initialCapital?.toLocaleString()}
                </div>
              </div>
            </div>
            
            {isRunning && (
              <div className="flex items-center space-x-2 text-blue-600">
                <Activity className="h-4 w-4 animate-pulse" />
                <span className="text-sm">
                  {statusMessage || '正在运行回测...'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* 策略信息卡片 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5" />
              <span>策略信息</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">策略名称</div>
                <div className="font-medium">{strategy.name}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">策略ID</div>
                <div className="font-medium text-xs">{backtestParams.strategyId}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">回测周期</div>
                <div className="font-medium">{backtestParams.timeframe}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">初始资金</div>
                <div className="font-medium">¥{backtestParams.initialCapital.toLocaleString()}</div>
              </div>
            </div>
            {dataInfo && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground mb-2">数据信息</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>数据源: {dataInfo.symbol}</div>
                  <div>记录数: {dataInfo.total_records}</div>
                  <div>开始: {dataInfo.start_date}</div>
                  <div>结束: {dataInfo.end_date}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 错误提示 */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2 text-red-600">
                <Activity className="h-5 w-5" />
                <span className="font-medium">回测失败</span>
              </div>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* 标签页切换 */}
        <div className="flex space-x-2 mb-6">
          <Button
            variant={activeTab === 'overview' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('overview')}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            概览
          </Button>
          <Button
            variant={activeTab === 'charts' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('charts')}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            图表
          </Button>
          <Button
            variant={activeTab === 'trades' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('trades')}
          >
            <List className="h-4 w-4 mr-2" />
            交易记录
          </Button>
        </div>

        {/* 内容区域 */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* 关键指标 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {safeMetrics.totalReturn > 0 ? '+' : ''}{(safeMetrics.totalReturn * 100).toFixed(2)}%
                      </div>
                      <div className="text-sm text-muted-foreground">总收益率</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <TrendingDown className="h-5 w-5 text-red-600" />
                    <div>
                      <div className="text-2xl font-bold text-red-600">
                        {(safeMetrics.maxDrawdown * 100).toFixed(2)}%
                      </div>
                      <div className="text-sm text-muted-foreground">最大回撤</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Activity className="h-5 w-5 text-blue-600" />
                    <div>
                      <div className="text-2xl font-bold text-blue-600">
                        {(safeMetrics.winRate * 100).toFixed(2)}%
                      </div>
                      <div className="text-sm text-muted-foreground">胜率</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                    <div>
                      <div className="text-2xl font-bold text-purple-600">
                        {safeMetrics.totalTrades}
                      </div>
                      <div className="text-sm text-muted-foreground">总交易次数</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 详细统计 */}
            <Card>
              <CardHeader>
                <CardTitle>详细统计</CardTitle>
                <CardDescription>策略表现详细分析</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">盈亏比</span>
                      <span className="font-medium">{safeMetrics.profitLossRatio.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">盈利交易</span>
                      <span className="font-medium text-green-600">{safeMetrics.winningTrades}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">亏损交易</span>
                      <span className="font-medium text-red-600">{safeMetrics.losingTrades}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">最终资金</span>
                      <span className="font-medium">¥{backtestResult?.final_equity?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">夏普比率</span>
                      <span className="font-medium">{safeMetrics.sharpeRatio.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                
                {/* 数据时间范围信息 */}
                {backtestResult?.dataInfo && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="text-sm text-muted-foreground mb-2">数据时间范围</div>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="flex justify-between">
                        <span>数据开始时间</span>
                        <span>{backtestResult.dataInfo.start_date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>数据结束时间</span>
                        <span>{backtestResult.dataInfo.end_date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>数据记录数</span>
                        <span>{backtestResult.dataInfo.total_records}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>价格范围</span>
                        <span>¥{backtestResult.dataInfo.price_range?.min?.toFixed(2)} - ¥{backtestResult.dataInfo.price_range?.max?.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 资金曲线 */}
            <Card>
              <CardHeader>
                <CardTitle>资金曲线</CardTitle>
                <CardDescription>策略净值变化趋势</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {equityData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={equityData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value) => [`¥${Number(value).toLocaleString()}`, '净值']}
                          labelFormatter={(label) => `日期: ${label}`}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="#2563eb" 
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      {isRunning ? '正在生成图表...' : '暂无数据'}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'charts' && (
          <Card>
            <CardHeader>
              <CardTitle>收益率分布</CardTitle>
              <CardDescription>策略收益率变化趋势</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {equityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={equityData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip 
                        formatter={(value) => [`${value}%`, '收益率']}
                        labelFormatter={(label) => `日期: ${label}`}
                      />
                      <Bar 
                        dataKey="returns" 
                        fill="#10b981"
                        name="收益率"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    {isRunning ? '正在生成图表...' : '暂无数据'}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'trades' && (
          <Card>
            <CardHeader>
              <CardTitle>交易记录</CardTitle>
              <CardDescription>详细的买卖交易历史</CardDescription>
            </CardHeader>
            <CardContent>
              {tradesData.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-9 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                    <div>时间</div>
                    <div>类型</div>
                    <div>价格</div>
                    <div>数量</div>
                    <div>金额</div>
                    <div>盈亏</div>
                    <div>持仓</div>
                    <div>证券价值</div>
                    <div>可用资金</div>
                  </div>
                  {tradesData.map((trade, index) => (
                    <div key={index} className="grid grid-cols-9 gap-4 text-sm py-2 border-b hover:bg-muted/50">
                      <div className="text-xs">
                        <div>{trade.time}</div>
                      </div>
                      <div className={trade.action === 'buy' ? 'text-green-600' : 'text-red-600'}>
                        {trade.action === 'buy' ? '买入' : '卖出'}
                      </div>
                      <div>¥{trade.price}</div>
                      <div>{trade.quantity}</div>
                      <div>¥{trade.amount}</div>
                      <div className={trade.pnlClass}>
                        {trade.pnl}
                      </div>
                      <div className="font-medium">{trade.position}</div>
                      <div className="font-medium">¥{trade.securityValue}</div>
                      <div className="font-medium">¥{trade.balance}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  {isRunning ? '正在生成交易记录...' : '暂无交易记录'}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
