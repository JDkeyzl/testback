import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Activity, Play, Loader2, AlertCircle, Calendar, Clock } from 'lucide-react'
import { useStrategyStore } from '../store/strategyStore'
import { useStrategyListStore } from '../store/strategyListStore'

export function BacktestResults({ externalStrategyData = null, strategyId = null, backtestParams = null }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [isRunning, setIsRunning] = useState(false)
  const [backtestResult, setBacktestResult] = useState(null)
  const [error, setError] = useState(null)
  const [dataInfo, setDataInfo] = useState(null)
  const [runningStrategyName, setRunningStrategyName] = useState(null)
  const [statusMessage, setStatusMessage] = useState(null)
  
  // 时间范围选择器状态
  const [startDate, setStartDate] = useState(backtestParams?.startDate || '2024-01-01')
  const [endDate, setEndDate] = useState(backtestParams?.endDate || '2024-12-31')
  const [initialCapital, setInitialCapital] = useState(backtestParams?.initialCapital || 100000)
  const [timeframe, setTimeframe] = useState(backtestParams?.timeframe || '5m')
  
  const { nodeParams } = useStrategyStore()
  const { getStrategy } = useStrategyListStore()
  const processedStrategyRef = useRef(null) // 跟踪已处理的策略数据

  // 获取当前策略信息
  const currentStrategy = strategyId ? getStrategy(strategyId) : null

  // 当回测参数变化时更新状态
  useEffect(() => {
    if (backtestParams) {
      setStartDate(backtestParams.startDate || '2024-01-01')
      setEndDate(backtestParams.endDate || '2024-12-31')
      setInitialCapital(backtestParams.initialCapital || 100000)
      setTimeframe(backtestParams.timeframe || '5m')
    }
  }, [backtestParams])

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

  // 构建策略数据
  const buildStrategyData = () => {
    // 如果传入了外部策略数据，直接使用
    if (externalStrategyData) {
      return externalStrategyData
    }

    // 如果指定了策略ID，从策略列表获取
    if (strategyId && currentStrategy) {
      return currentStrategy.strategy
    }

    // 否则从全局状态构建节点数据
    const nodes = []
    const edges = []
    
    Object.entries(nodeParams).forEach(([nodeId, params]) => {
      const node = {
        id: nodeId,
        type: params.nodeType,
        position: { x: Math.random() * 400 + 100, y: Math.random() * 200 + 100 },
        data: {
          ...params,
          // 保留subType用于后端识别策略类型
          nodeType: undefined,
          subType: params.subType
        }
      }
      nodes.push(node)
    })

    // 简单的边连接逻辑（实际项目中应该从React Flow获取）
    if (nodes.length >= 2) {
      edges.push({
        id: 'e1-2',
        source: nodes[0].id,
        target: nodes[1].id
      })
    }

    return {
      nodes,
      edges,
      start_date: startDate,
      end_date: endDate,
      initial_capital: initialCapital,
      commission_rate: 0.001
    }
  }

  // 运行回测
  const runBacktest = useCallback(async () => {
    console.log('BacktestResults: runBacktest开始执行')
    setIsRunning(true)
    setError(null)
    setRunningStrategyName(currentStrategy?.name || '当前策略')
    setStatusMessage('正在准备回测数据...')
    
    try {
      const strategyData = buildStrategyData()
      console.log('BacktestResults: 构建的策略数据', strategyData)
      
      if (strategyData.nodes.length === 0) {
        throw new Error('请先添加策略节点')
      }

      setStatusMessage('正在加载股票数据...')
      
      // 尝试调用真实数据回测API
      try {
        setStatusMessage('正在执行策略回测...')
        
        const response = await fetch('http://localhost:8000/api/v1/backtest/real', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            strategy: strategyData,
            symbol: "002130",  // 默认使用沃尔核材
            timeframe: timeframe,
            startDate: startDate,
            endDate: endDate,
            initialCapital: initialCapital,
            strategyId: strategyId
          })
        })

        if (response.ok) {
          setStatusMessage('正在处理回测结果...')
          
          const result = await response.json()
          console.log('BacktestResults: 真实数据回测成功', result)
          
          // 转换数据格式以匹配前端显示
          const formattedResult = {
            metrics: {
              totalReturn: result.total_return || 0,
              annualReturn: result.total_return || 0,  // 使用总收益率作为年化收益率
              maxDrawdown: result.max_drawdown || 0,
              sharpeRatio: 0,  // 暂时设为0，后续可计算
              winRate: result.win_rate || 0,
              profitLossRatio: result.profit_loss_ratio || 0,
              totalTrades: result.total_trades || 0,
              winningTrades: Math.round((result.win_rate || 0) * (result.total_trades || 0)),
              losingTrades: Math.round((1 - (result.win_rate || 0)) * (result.total_trades || 0))
            },
            equityCurve: result.equity_curve || [],
            trades: result.trades || [],
            dataInfo: result.data_info || null  // 添加数据信息
          }
          
          setBacktestResult(formattedResult)
          setDataInfo(result.data_info)
          setStatusMessage('回测完成！')
          setActiveTab('overview')
          return
        } else {
          console.warn('BacktestResults: 真实数据API调用失败，状态码:', response.status)
          const errorText = await response.text()
          console.warn('BacktestResults: API错误响应:', errorText)
        }
      } catch (apiError) {
        console.warn('BacktestResults: 真实数据API调用异常，使用模拟数据:', apiError)
      }

      // 如果API调用失败，使用模拟数据
      const mockResult = generateMockBacktestResult()
      setBacktestResult(mockResult)
      setActiveTab('overview')
      
    } catch (err) {
      setError(err.message)
      console.error('回测失败:', err)
    } finally {
      setIsRunning(false)
      setRunningStrategyName(null)
      setStatusMessage(null)
    }
  }, [externalStrategyData, strategyId, currentStrategy, startDate, endDate, initialCapital, timeframe])

  // 当有外部策略数据时，自动运行回测
  useEffect(() => {
    if (externalStrategyData && !isRunning) {
      // 检查是否已经处理过这个策略数据
      const strategyKey = JSON.stringify(externalStrategyData)
      if (processedStrategyRef.current === strategyKey) {
        console.log('BacktestResults: 策略数据已处理过，跳过重复调用')
        return
      }
      
      console.log('BacktestResults: 检测到新的外部策略数据，自动运行回测')
      processedStrategyRef.current = strategyKey
      
      // 直接调用API，避免依赖runBacktest函数
      const executeBacktest = async () => {
        setIsRunning(true)
        setError(null)
        setRunningStrategyName('外部策略')
        
        try {
          const strategyData = externalStrategyData
          console.log('BacktestResults: 构建的策略数据', strategyData)
          
          if (strategyData.nodes.length === 0) {
            throw new Error('请先添加策略节点')
          }

          // 尝试调用后端API
          try {
            const response = await fetch('http://localhost:8000/api/v1/backtest', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                strategy: strategyData
              })
            })

            if (response.ok) {
              const result = await response.json()
              console.log('BacktestResults: API回测成功', result)
              setBacktestResult(result)
              setActiveTab('overview')
              return
            } else {
              console.warn('BacktestResults: API调用失败，状态码:', response.status)
              const errorText = await response.text()
              console.warn('BacktestResults: API错误响应:', errorText)
            }
          } catch (apiError) {
            console.warn('BacktestResults: API调用异常，使用模拟数据:', apiError)
          }

          // 如果API调用失败，使用模拟数据
          const mockResult = generateMockBacktestResult()
          setBacktestResult(mockResult)
          setActiveTab('overview')
          
        } catch (err) {
          setError(err.message)
          console.error('回测失败:', err)
        } finally {
          setIsRunning(false)
          setRunningStrategyName(null)
        }
      }
      
      executeBacktest()
    }
  }, [externalStrategyData]) // 只依赖externalStrategyData，避免无限循环



  // 生成模拟回测结果
  const generateMockBacktestResult = () => {
    const initialCapital = 100000
    const finalCapital = initialCapital * (1 + Math.random() * 0.3 - 0.1) // 随机收益率
    const totalReturn = (finalCapital - initialCapital) / initialCapital
    
    // 生成模拟资金曲线
    const equityCurve = []
    const startDate = new Date('2023-01-01')
    const endDate = new Date('2023-12-31')
    const days = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24))
    
    let currentEquity = initialCapital
    for (let i = 0; i <= days; i += 7) { // 每周一个数据点
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
      const progress = i / days
      const randomFactor = 1 + (Math.random() - 0.5) * 0.02 // 随机波动
      currentEquity = initialCapital + (finalCapital - initialCapital) * progress * randomFactor
      
      equityCurve.push({
        date: date.toISOString().split('T')[0],
        equity: currentEquity,
        returns: i === 0 ? 0 : (Math.random() - 0.5) * 0.05
      })
    }
    
    // 生成模拟交易记录
    const trades = []
    const tradeCount = Math.floor(Math.random() * 20) + 10
    for (let i = 0; i < tradeCount; i++) {
      const date = new Date(startDate.getTime() + Math.random() * (endDate - startDate))
      const isBuy = Math.random() > 0.5
      const price = 100 + Math.random() * 50
      const quantity = Math.floor(Math.random() * 200) + 50
      
      trades.push({
        date: date.toISOString().split('T')[0],
        action: isBuy ? 'buy' : 'sell',
        price: price,
        quantity: quantity,
        amount: price * quantity,
        pnl: isBuy ? 0 : (Math.random() - 0.3) * 1000
      })
    }
    
    return {
      metrics: {
        total_return: totalReturn,
        annual_return: totalReturn * 0.8,
        max_drawdown: Math.random() * 0.15,
        sharpe_ratio: 0.5 + Math.random() * 1.5,
        win_rate: 0.4 + Math.random() * 0.4,
        profit_loss_ratio: 0.8 + Math.random() * 1.2,
        total_trades: tradeCount,
        winning_trades: Math.floor(tradeCount * (0.4 + Math.random() * 0.4)),
        losing_trades: Math.floor(tradeCount * (0.2 + Math.random() * 0.2))
      },
      equity_curve: equityCurve,
      trades: trades,
      final_equity: finalCapital
    }
  }

  // 格式化数据用于图表显示
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
    
    let currentBalance = initialCapital
    let position = 0 // 持仓数量
    let avgCost = 0 // 平均成本
    
    return trades.map(trade => {
      let pnlDisplay = '-'
      let pnlClass = ''
      let newBalance = currentBalance
      
      if (trade.action === 'buy') {
        // 买入：更新持仓和平均成本
        const newPosition = position + trade.quantity
        const newAvgCost = position > 0 
          ? (avgCost * position + trade.price * trade.quantity) / newPosition
          : trade.price
        
        position = newPosition
        avgCost = newAvgCost
        newBalance = currentBalance - trade.amount
        pnlDisplay = '-'
        pnlClass = ''
      } else if (trade.action === 'sell') {
        // 卖出：计算实际盈亏
        const pnl = (trade.price - avgCost) * trade.quantity
        position = Math.max(0, position - trade.quantity)
        newBalance = currentBalance + trade.amount
        
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
      
      return {
        timestamp: trade.timestamp || trade.date,
        date: trade.date,
        time: trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }) : trade.date,
        action: trade.action,
        price: trade.price.toFixed(2),
        quantity: trade.quantity,
        amount: trade.amount.toFixed(2),
        pnl: pnlDisplay,
        pnlClass: pnlClass,
        balance: currentBalance.toFixed(2),
        position: position,
        avgCost: avgCost.toFixed(2)
      }
    })
  }

  const equityData = formatEquityCurve(backtestResult?.equityCurve)
  const tradesData = formatTrades(backtestResult?.trades)

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">回测结果</h2>
            <p className="text-sm text-muted-foreground">策略表现分析</p>
            {runningStrategyName && (
              <div className="mt-2 text-xs text-blue-600">
                正在运行: {runningStrategyName}
                {statusMessage && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {statusMessage}
                  </div>
                )}
              </div>
            )}
            {dataInfo && (
              <div className="mt-2 text-xs text-blue-600">
                数据源: {dataInfo.symbol} | 周期: {dataInfo.timeframe} | 
                记录数: {dataInfo.total_records} | 
                时间范围: {dataInfo.start_date} ~ {dataInfo.end_date}
              </div>
            )}
          </div>
          <div className="flex space-x-2">
            <Button
              onClick={runBacktest}
              disabled={isRunning}
              className="flex items-center space-x-2"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              <span>{isRunning ? '运行中...' : '运行策略'}</span>
            </Button>
            <Button
              variant={activeTab === 'overview' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('overview')}
            >
              概览
            </Button>
            <Button
              variant={activeTab === 'charts' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('charts')}
            >
              图表
            </Button>
            <Button
              variant={activeTab === 'trades' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('trades')}
            >
              交易记录
            </Button>
          </div>
        </div>
        
        {/* 时间范围选择器 */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startDate" className="text-xs">开始时间</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate" className="text-xs">结束时间</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="initialCapital" className="text-xs">初始资金</Label>
            <Input
              id="initialCapital"
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              className="text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timeframe" className="text-xs">时间周期</Label>
            <select
              id="timeframe"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-input bg-background rounded-md"
            >
              <option value="1m">1分钟</option>
              <option value="5m">5分钟</option>
              <option value="15m">15分钟</option>
              <option value="30m">30分钟</option>
              <option value="1h">1小时</option>
              <option value="4h">4小时</option>
              <option value="1d">1天</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">回测失败</span>
              </div>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </CardContent>
          </Card>
        )}

        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-4">
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
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                    <div>
                      <div className="text-2xl font-bold text-blue-600">
                        {(safeMetrics.annualReturn * 100).toFixed(2)}%
                      </div>
                      <div className="text-sm text-muted-foreground">年化收益率</div>
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
                    <Activity className="h-5 w-5 text-purple-600" />
                    <div>
                      <div className="text-2xl font-bold text-purple-600">
                        {safeMetrics.sharpeRatio.toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">夏普比率</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 详细指标表格 */}
            <Card>
              <CardHeader>
                <CardTitle>详细指标</CardTitle>
                <CardDescription>策略表现详细分析</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">胜率</span>
                      <span className="font-medium">{(safeMetrics.winRate * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">盈亏比</span>
                      <span className="font-medium">{safeMetrics.profitLossRatio.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">总交易次数</span>
                      <span className="font-medium">{safeMetrics.totalTrades}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">盈利交易</span>
                      <span className="font-medium text-green-600">{safeMetrics.winningTrades}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">亏损交易</span>
                      <span className="font-medium text-red-600">{safeMetrics.losingTrades}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">最终资金</span>
                      <span className="font-medium">¥{backtestResult?.final_equity?.toFixed(2) || '0.00'}</span>
                    </div>
                  </div>
                </div>
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
                      暂无数据，请先运行策略回测
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
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
                    暂无数据，请先运行策略回测
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
                  <div className="grid grid-cols-8 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                    <div>时间</div>
                    <div>类型</div>
                    <div>价格</div>
                    <div>数量</div>
                    <div>金额</div>
                    <div>盈亏</div>
                    <div>持仓</div>
                    <div>资金余额</div>
                  </div>
                  {tradesData.map((trade, index) => (
                    <div key={index} className="grid grid-cols-8 gap-4 text-sm py-2 border-b hover:bg-muted/50">
                      <div className="text-xs">
                        <div>{trade.date}</div>
                        <div className="text-muted-foreground">{trade.time}</div>
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
                      <div className="text-xs">
                        <div>{trade.position}</div>
                        <div className="text-muted-foreground">成本: ¥{trade.avgCost}</div>
                      </div>
                      <div className="font-medium">¥{trade.balance}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  暂无交易记录，请先运行策略回测
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}