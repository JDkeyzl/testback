import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Cell } from 'recharts'
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Activity, Calendar, Clock, BarChart3, List, ArrowUp, ArrowDown } from 'lucide-react'
import { useStrategyListStore } from '../store/strategyListStore'
import { formatTradesWithFees as fmtTradesFees, buildDailyAssetsFromRows, computeMetricsFromTrades as computeFromTrades, computeMetricsFromAssets as computeFromAssets } from '../utils/metrics'
import { useBacktestHistoryStore } from '../store/backtestHistoryStore'

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
  const { addRecord } = useBacktestHistoryStore()
  const hasLoggedRef = useRef(false)
  
  // 从路由状态获取回测参数，或使用URL参数
  const backtestParams = location.state?.backtestParams || { strategyId }
  const rawSnapshot = location.state?.rawResult
  // 允许从路由状态直接提供策略配置（支持策略库临时回测）
  const strategyFromStore = backtestParams?.strategyId ? getStrategy(backtestParams.strategyId) : null
  const strategy = strategyFromStore || (backtestParams?.strategy ? { id: backtestParams.strategyId || 'temp', name: backtestParams.name || '临时策略', strategy: backtestParams.strategy } : null)

  // 统一默认参数，避免直接打开路由时参数缺失导致回测异常
  const todayStr = (() => { const d = new Date(); return d.toISOString().slice(0,10) })()
  const safeParams = {
    strategyId: backtestParams?.strategyId || strategy?.id || 'temp',
    strategy: backtestParams?.strategy || strategy?.strategy,
    symbol: backtestParams?.symbol || '002130',
    timeframe: backtestParams?.timeframe || '1d',
    startDate: backtestParams?.startDate || '2025-01-01',
    endDate: backtestParams?.endDate || todayStr,
    initialCapital: backtestParams?.initialCapital || 100000
  }

  const isFutures = useMemo(() => {
    const sym = String(safeParams.symbol || '')
    return (location.state?.from === '/futures-backtest') || !/^\d{6}$/.test(sym)
  }, [safeParams.symbol, location.state])
  
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

  // 格式化资金曲线数据（后端曲线）
  const formatEquityCurve = (equityCurve) => {
    if (!equityCurve) return []
    
    return equityCurve.map(point => {
      const dateStr = point.date || (point.timestamp ? String(point.timestamp).split(' ')[0] : '')
      return {
        date: dateStr,
        value: point.equity,
        returns: (Number(point.returns || 0) * 100).toFixed(2),
        price: Number(point.price || 0)
      }
    })
  }

  // 从交易记录构建资金曲线（以交易记录为准，保持一致性）
  const buildEquityFromTrades = (tradesRows) => {
    if (!tradesRows || tradesRows.length === 0) return []
    let prev = null
    return tradesRows.map(row => {
      const curr = Number(row.totalAssets)
      const ret = prev ? (((curr - prev) / prev) * 100).toFixed(2) : 0
      prev = curr
      return {
        date: row.date || row.time || '',
        value: curr,
        returns: ret
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
        pnlValue: trade.action === 'sell' ? Number((trade.price - avgCost) * trade.quantity) : null,
        balance: currentBalance.toFixed(2), // 可用资金
        position: position, // 持仓数量
        securityValue: securityValue.toFixed(2), // 证券价值
        totalAssets: totalAssets.toFixed(2), // 总资产
        avgCost: avgCost.toFixed(2)
      }
    })
  }

  const tradesData = useMemo(() => {
    if (isFutures) {
      const list = Array.isArray(backtestResult?.trades) ? backtestResult.trades : []
      let pos = 0
      return list.map((t) => {
        const ts = t.timestamp || t.date || ''
        const dateStr = ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : ''
        const dateKey = String(ts).slice(0, 10) // 统一用 YYYY-MM-DD 对齐日资产
        if (t.action === 'buy') pos += Number(t.quantity || 0)
        else if (t.action === 'sell') pos = Math.max(0, pos - Number(t.quantity || 0))
        return {
          timestamp: ts,
          date: ts ? new Date(ts).toLocaleDateString('zh-CN') : ts,
          dateKey,
          time: dateStr,
          action: t.action,
          price: Number(t.price || 0).toFixed(2),
          quantity: Number(t.quantity || 0),
          amount: Number(t.amount || 0).toFixed(2),
          pnl: t.pnl == null ? '-' : (Number(t.pnl) >= 0 ? `+¥${Number(t.pnl).toFixed(2)}` : `-¥${Math.abs(Number(t.pnl)).toFixed(2)}`),
          pnlClass: t.pnl == null ? '' : (Number(t.pnl) >= 0 ? 'text-red-600' : 'text-green-600'),
          pnlValue: t.pnl == null ? null : Number(t.pnl),
          balance: 0, // 数值0，避免 NaN
          position: pos,
          securityValue: 0,
          totalAssets: 0,
          avgCost: '-'
        }
      })
    }
    return fmtTradesFees(backtestResult?.trades, backtestParams?.initialCapital)
  }, [isFutures, backtestResult?.trades, backtestParams?.initialCapital])

  // 将5分钟价格序列聚合为日线收盘价折线
  const buildDailyPriceData = (series) => {
    if (!series) return []
    const dailyMap = new Map()
    for (const p of series) {
      const ts = p.timestamp || p.date || ''
      const dateStr = String(ts).split(' ')[0]
      const close = Number(p.close)
      // 直接覆盖，假设序列按时间升序，最后一次为当日收盘
      dailyMap.set(dateStr, close)
    }
    const result = []
    for (const [date, close] of dailyMap.entries()) {
      result.push({ date, close })
    }
    result.sort((a,b) => String(a.date).localeCompare(String(b.date)))
    return result
  }
  const dailyPriceData = buildDailyPriceData(backtestResult?.priceSeries)
  // 计算 MACD 指标（基于日收盘价）
  const macdData = useMemo(() => {
    if (!dailyPriceData || dailyPriceData.length === 0) return []
    const closes = dailyPriceData.map(d => Number(d.close))
    const ema = (period) => {
      const k = 2 / (period + 1)
      const out = []
      let prev = closes[0]
      for (let i = 0; i < closes.length; i++) {
        const v = i === 0 ? closes[0] : (closes[i] * k + prev * (1 - k))
        out.push(v)
        prev = v
      }
      return out
    }
    const fastP = 12, slowP = 26, signalP = 9
    const emaFast = ema(fastP)
    const emaSlow = ema(slowP)
    const dif = emaFast.map((v, i) => v - emaSlow[i])
    const signal = (() => {
      const k = 2 / (signalP + 1)
      const out = []
      let prev = dif[0]
      for (let i = 0; i < dif.length; i++) {
        const v = i === 0 ? dif[0] : (dif[i] * k + prev * (1 - k))
        out.push(v)
        prev = v
      }
      return out
    })()
    const hist = dif.map((v, i) => v - signal[i])
    return dailyPriceData.map((d, i) => ({ date: d.date, dif: Number(dif[i].toFixed(4)), dea: Number(signal[i].toFixed(4)), hist: Number(hist[i].toFixed(4)) }))
  }, [dailyPriceData])
  // 资金曲线改为“资产口径”：股票=交易记录+价格聚合；期货=仅基于交易记录（卖出回合累计）
  const dailyAssets = useMemo(() => {
    if (isFutures) {
      // 仅用交易记录（卖出回合）构建阶梯型资产序列
      const list = Array.isArray(backtestResult?.trades) ? backtestResult.trades : []
      const dayPnL = new Map()
      for (const t of list) {
        if (String(t?.action) !== 'sell') continue
        const d = String(t?.timestamp || t?.date || '').slice(0, 10)
        const v = Number(t?.pnl || 0)
        dayPnL.set(d, (dayPnL.get(d) || 0) + v)
      }
      const initial = safeParams.initialCapital || 0
      let acc = initial
      const out = []
      for (const [d, pnl] of Array.from(dayPnL.entries()).sort((a,b)=>a[0].localeCompare(b[0]))) {
        acc += pnl
        out.push({ date: d, totalAssets: acc, cash: acc, position: 0, price: 0 })
      }
      return out
    }
    return buildDailyAssetsFromRows(tradesData, dailyPriceData, safeParams.startDate, safeParams.endDate, safeParams.initialCapital)
  }, [isFutures, backtestResult, tradesData, dailyPriceData, safeParams.startDate, safeParams.endDate, safeParams.initialCapital])
  const equityData = dailyAssets.map(a => ({ date: a.date, value: a.totalAssets }))
  const equityReturnsData = (() => {
    const out = []
    let prev = null
    for (const a of dailyAssets) {
      const v = Number(a.totalAssets)
      const ret = prev ? ((v - prev) / prev) * 100 : 0
      out.push({ date: a.date, returns: Number(ret.toFixed(2)) })
      prev = v
    }
    return out
  })()

  // R2 回撤：不再追加“持有”行

  // 基于资产序列的指标与区间表现（资产口径）
  const initialCap = backtestParams?.initialCapital || 100000
  const assetsMetrics = computeFromAssets(dailyAssets)
  const strategyLast = assetsMetrics.endAsset || initialCap
  const strategyRet = assetsMetrics.totalReturn || 0
  const firstClose = assetsMetrics.startPrice || 0
  const lastClose = assetsMetrics.endPrice || firstClose
  const startOpen = backtestResult?.priceSeries && backtestResult.priceSeries.length > 0
    ? Number(backtestResult.priceSeries[0].open ?? backtestResult.priceSeries[0].close ?? 0)
    : firstClose
  const stockRet = firstClose > 0 ? (lastClose - firstClose) / firstClose : 0
  const outperformDiff = strategyRet - stockRet
  const outperformText = outperformDiff >= 0 ? '跑赢' : '跑输'

  // 区间对比新增比值（结束/开始），>1 红，<1 绿，=1 中性；百分比整数
  const fundRatio = initialCap > 0 ? strategyLast / initialCap : 0
  const fundRatioPct = Math.round((fundRatio - 1) * 100)
  const fundRatioClass = fundRatio > 1 ? 'text-red-600' : (fundRatio < 1 ? 'text-green-600' : 'text-muted-foreground')

  const priceOpenCloseRatio = startOpen > 0 ? lastClose / startOpen : 0
  const priceOpenClosePct = Math.round((priceOpenCloseRatio - 1) * 100)
  const priceOpenCloseClass = priceOpenCloseRatio > 1 ? 'text-red-600' : (priceOpenCloseRatio < 1 ? 'text-green-600' : 'text-muted-foreground')

  // 从交易记录计算概览指标（与交易记录保持一致）
  const computeMaxDrawdown = (values) => {
    if (!values || values.length === 0) return 0
    let peak = values[0]
    let maxDd = 0
    for (let i = 1; i < values.length; i++) {
      const v = values[i]
      if (v > peak) peak = v
      const dd = peak > 0 ? (peak - v) / peak : 0
      if (dd > maxDd) maxDd = dd
    }
    return maxDd
  }

  const computeMetricsFromTrades = (rows) => {
    if (!rows || rows.length === 0) {
      return {
        totalReturn: safeMetrics.totalReturn,
        maxDrawdown: safeMetrics.maxDrawdown,
        winRate: safeMetrics.winRate,
        totalTrades: safeMetrics.totalTrades,
        winningTrades: safeMetrics.winningTrades,
        losingTrades: safeMetrics.losingTrades,
      }
    }
    const initial = backtestParams?.initialCapital || 100000
    const assets = rows.map(r => Number(r.totalAssets))
    const last = assets[assets.length - 1]
    const totalReturn = initial > 0 ? (last - initial) / initial : 0
    const maxDrawdown = computeMaxDrawdown(assets)
    const sellRows = rows.filter(r => r.action === 'sell' && r.pnlValue !== null && r.pnlValue !== undefined)
    const wins = sellRows.filter(r => r.pnlValue > 0).length
    const losses = sellRows.filter(r => r.pnlValue < 0).length
    const totalSell = sellRows.length
    const winRate = totalSell > 0 ? wins / totalSell : 0
    return {
      totalReturn,
      maxDrawdown,
      winRate,
      totalTrades: rows.length,
      winningTrades: wins,
      losingTrades: losses,
    }
  }

  // 指标合并：收益/回撤用资产口径；胜率/交易次数用成交口径
  const tradeMetrics = computeFromTrades(tradesData)
  const displayMetrics = {
    totalReturn: strategyRet,
    maxDrawdown: assetsMetrics.maxDrawdown || 0,
    winRate: tradeMetrics.winRate || 0,
    totalTrades: tradeMetrics.totalTrades || 0,
    winningTrades: tradeMetrics.winningTrades || 0,
    losingTrades: tradeMetrics.losingTrades || 0
  }

  // 交易记录页滚动控制（页面级）
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const scrollToBottom = () => {
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
    window.scrollTo({ top: height, behavior: 'smooth' })
  }

  // 如果从历史进入并携带快照，则直接使用，不再重新回测
  useEffect(() => {
    const snap = location.state?.useHistorySnapshot
    if (rawSnapshot && !backtestResult) {
      try {
        const r = rawSnapshot
        const formatted = {
          metrics: {
            totalReturn: r?.total_return ?? 0,
            annualReturn: r?.total_return ?? 0,
            maxDrawdown: r?.max_drawdown ?? 0,
            sharpeRatio: 0,
            winRate: r?.win_rate ?? 0,
            profitLossRatio: 0,
            totalTrades: r?.total_trades ?? 0,
            winningTrades: 0,
            losingTrades: 0
          },
          equityCurve: r?.equity_curve || [],
          priceSeries: r?.price_series || [],
          trades: r?.trades || [],
          dataInfo: r?.data_info || null
        }
        setBacktestResult(formatted)
      } catch {}
    }
  }, [rawSnapshot, backtestResult])

  // 运行回测
  const runBacktest = useCallback(async () => {
    if (location.state?.useHistorySnapshot || rawSnapshot) return
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
    hasLoggedRef.current = false
    setError(null)
    setStatusMessage(`正在运行：${strategy?.name || backtestParams.strategyId}`)
    
    try {
      setStatusMessage('正在加载股票数据...')
      
      // 预取数据信息，若数据不足目标日期，自动夹取至数据末日
      let usedEndDate = safeParams.endDate
      try {
        const infoRes = await fetch(`/api/v1/data/info/${safeParams.symbol}`)
        if (infoRes.ok) {
          const info = await infoRes.json()
          const lastDataDate = String(info?.end_date || '').split(' ')[0]
          if (lastDataDate) {
            usedEndDate = usedEndDate && usedEndDate > lastDataDate ? lastDataDate : usedEndDate
          }
        }
      } catch {}
      
      const requestBody = {
        strategy: safeParams.strategy || strategy.strategy,
        symbol: safeParams.symbol,
        timeframe: safeParams.timeframe,
        startDate: safeParams.startDate,
        endDate: usedEndDate,
        initialCapital: safeParams.initialCapital,
        strategyId: safeParams.strategyId || strategy?.id
      }
      
      console.log('BacktestResultPage: 发送回测请求', requestBody)
      
      const url = isFutures ? '/api/v1/backtest/futures' : '/api/v1/backtest/real'
      const response = await fetch(url, {
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
        console.log('BacktestResultPage: Result counts', {
          trades: (result.trades || []).length,
          equityCurve: (result.equity_curve || []).length,
          priceSeries: (result.price_series || []).length,
          requestBody,
          url
        })
        
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
          priceSeries: result.price_series || [],
          trades: result.trades || [],
          dataInfo: result.data_info || null
        }
        
        // 调试输出：关键计数与参数
        try {
          console.debug('Result counts', {
            trades: (result.trades || []).length,
            equityCurve: (result.equity_curve || []).length,
            priceSeries: (result.price_series || []).length,
            requestBody
          })
        } catch {}
        
        setBacktestResult(formattedResult)
        setDataInfo(result.data_info)
        setStatusMessage('回测完成！')

        // 写入回测历史记录（前端本地持久化，可扩展后端）
        try {
          if (!hasLoggedRef.current) {
            // 基于这次返回结果即时计算概要，避免依赖旧的组件状态
            const tradesRowsLog = formattedResult.trades ? formatTrades(formattedResult.trades) : []
            const equityFromTradesLog = tradesRowsLog.length > 0
              ? buildEquityFromTrades(tradesRowsLog)
              : formatEquityCurve(formattedResult.equityCurve)
            const strategyLastLog = equityFromTradesLog.length > 0
              ? Number(equityFromTradesLog[equityFromTradesLog.length - 1].value)
              : (backtestParams?.initialCapital || 100000)
            const initialCapLog = backtestParams?.initialCapital || 100000
            const strategyRetLog = initialCapLog > 0 ? (strategyLastLog - initialCapLog) / initialCapLog : 0
            const dailyPriceDataLog = buildDailyPriceData(formattedResult.priceSeries)
            const firstCloseLog = dailyPriceDataLog.length > 0 ? dailyPriceDataLog[0].close : 0
            const lastCloseLog = dailyPriceDataLog.length > 0 ? dailyPriceDataLog[dailyPriceDataLog.length - 1].close : firstCloseLog
            const stockRetLog = firstCloseLog > 0 ? (lastCloseLog - firstCloseLog) / firstCloseLog : 0
            const outperformDiffLog = strategyRetLog - stockRetLog
            const metricsLog = computeMetricsFromTrades(tradesRowsLog)

            const historyRecord = {
              strategyId: backtestParams.strategyId || strategy?.id || 'unknown',
              strategyName: strategy?.name || '未命名策略',
              params: {
                timeframe: backtestParams.timeframe,
                startDate: backtestParams.startDate,
                endDate: usedEndDate,
                initialCapital: backtestParams.initialCapital,
                symbol: safeParams.symbol,
                strategySnapshot: backtestParams.strategy || strategy?.strategy
              },
              summary: {
                totalReturn: metricsLog.totalReturn,
                maxDrawdown: metricsLog.maxDrawdown,
                winRate: metricsLog.winRate,
                totalTrades: metricsLog.totalTrades,
                finalEquity: strategyLastLog,
                outperform: outperformDiffLog,
                priceStart: firstCloseLog,
                priceEnd: lastCloseLog
              },
              links: {
                toResultRoute: `/backtest/${backtestParams.strategyId || strategy?.id || 'temp'}`
              },
              meta: {}
            }
            addRecord(historyRecord)
            hasLoggedRef.current = true
          }
        } catch (e) {
          console.warn('写入回测历史记录失败', e)
        }
      } else {
        const errorText = await response.text()
        console.error('BacktestResultPage: 回测失败', { status: response.status, url, body: requestBody, errorText })
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
                <Button variant="outline" size="sm" onClick={() => {
                  const from = location.state?.from
                  if (from) navigate(from)
                  else navigate(-1)
                }}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  返回上一页
                </Button>
                <h1 className="text-xl font-semibold">回测结果</h1>
                <p className="text-sm text-muted-foreground">
                  {strategy.name} - {backtestParams.startDate} 至 {backtestParams.endDate}
                </p>
                <div className="text-xs text-muted-foreground mt-1">
                  策略ID: {safeParams.strategyId} | 周期: {safeParams.timeframe} | 初始资金: ¥{safeParams.initialCapital?.toLocaleString()}
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
                      <div className={`text-2xl font-bold ${displayMetrics.totalReturn > 0 ? 'text-red-600' : (displayMetrics.totalReturn < 0 ? 'text-green-600' : 'text-muted-foreground')}`}>
                        {displayMetrics.totalReturn > 0 ? '+' : ''}{(displayMetrics.totalReturn * 100).toFixed(2)}%
                      </div>
                      <div className="text-sm text-muted-foreground">总收益率</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <TrendingDown className="h-5 w-5 text-green-600" />
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {(displayMetrics.maxDrawdown * 100).toFixed(2)}%
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
                        {(displayMetrics.winRate * 100).toFixed(2)}%
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
                        {displayMetrics.totalTrades}
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
                      <span className="font-medium text-red-600">{displayMetrics.winningTrades}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">亏损交易</span>
                      <span className="font-medium text-green-600">{displayMetrics.losingTrades}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">最终资金</span>
                      <span className="font-medium">¥{Number(strategyLast).toFixed(2)}</span>
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
                <CardTitle>资金曲线（资产口径）</CardTitle>
                <CardDescription>总资产（现金+持仓市值，含未平仓浮盈亏）</CardDescription>
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
                          formatter={(value) => [`¥${Number(value).toLocaleString()}`, '总资产']}
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

            {/* 股票价格折线图（日线） */}
            <Card>
              <CardHeader>
                <CardTitle>价格折线图（按日）</CardTitle>
                <CardDescription>5分钟数据聚合为日线收盘价</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  {dailyPriceData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailyPriceData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip 
                          formatter={(value) => [`¥${Number(value).toFixed(2)}`, '收盘价']} 
                          labelFormatter={(label) => `日期: ${label}`}
                        />
                        <Line type="monotone" dataKey="close" stroke="#ef4444" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      {isRunning ? '正在生成图表...' : '暂无数据'}
                    </div>
                  )}
                </div>
                {/* MACD 子图 */}
                <div className="h-40 mt-4">
                  {macdData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={macdData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis yAxisId="left" orientation="left" />
                        <Tooltip labelFormatter={(label) => `日期: ${label}`} />
                        {/* DIF 与 DEA 线 */}
                        <Line yAxisId="left" type="monotone" dataKey="dif" stroke="#f59e0b" dot={false} name="DIF" />
                        <Line yAxisId="left" type="monotone" dataKey="dea" stroke="#10b981" dot={false} name="DEA" />
                        {/* 柱：hist 上红下绿 */}
                        <Bar yAxisId="left" dataKey="hist" barSize={6} name="Hist">
                          {macdData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.hist >= 0 ? '#ef4444' : '#22c55e'} />
                          ))}
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      {isRunning ? '正在计算MACD...' : '暂无MACD数据'}
                    </div>
                  )}
                </div>
                <div className="mt-3 text-xs text-muted-foreground space-y-1">
                  <div>说明：</div>
                  <div>- 总资产来源：以交易记录计算（可用资金 + 持仓价值）。</div>
                  <div>- 价格来源：回测原始CSV数据（5分钟K线聚合为日收盘价折线）。</div>
                  <div>- MACD 计算：基于日收盘价，参数(12,26,9)，DIF/DEA线与柱状图。</div>
                  <div>- 回撤、收益率、胜率等概览指标均以交易记录为准。</div>
                </div>
              </CardContent>
            </Card>

            {/* 区间表现对比 */}
            <Card>
              <CardHeader>
                <CardTitle>区间表现对比</CardTitle>
                <CardDescription>策略资金区间表现</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {/* 隐藏：策略区间收益 与 结果 */}
                  <div className="grid grid-cols-[max-content_8px_1fr] items-center gap-x-1 gap-y-1">
                    <span className="w-28 md:w-32 text-right">区间起始资产</span>
                    <span className="text-center">：</span>
                    <span>¥{initialCap.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-[max-content_8px_1fr] items-center gap-x-1 gap-y-1">
                    <span className="w-28 md:w-32 text-right">区间开始收盘价</span>
                    <span className="text-center">：</span>
                    <span>¥{firstClose?.toFixed(2)}</span>
                  </div>
                  <div className="grid grid-cols-[max-content_8px_1fr] items-center gap-x-1 gap-y-1">
                    <span className="w-28 md:w-32 text-right">区间结束资产</span>
                    <span className="text-center">：</span>
                    <span>¥{strategyLast.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-[max-content_8px_1fr] items-center gap-x-1 gap-y-1">
                    <span className="w-28 md:w-32 text-right">区间结束收盘价</span>
                    <span className="text-center">：</span>
                    <span>¥{lastClose?.toFixed(2)}</span>
                  </div>
                  <div className="grid grid-cols-[max-content_8px_1fr] items-center gap-x-1 gap-y-1">
                    <span className="w-28 md:w-32 text-right">资金涨跌幅</span>
                    <span className="text-center">：</span>
                    <span className={fundRatioClass}>{fundRatioPct >= 0 ? '+' : ''}{fundRatioPct}%</span>
                  </div>
                  <div className="grid grid-cols-[max-content_8px_1fr] items-center gap-x-1 gap-y-1">
                    <span className="w-28 md:w-32 text-right">股价涨跌幅</span>
                    <span className="text-center">：</span>
                    <span className={priceOpenCloseClass}>{priceOpenClosePct >= 0 ? '+' : ''}{priceOpenClosePct}%</span>
                  </div>
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
                {equityReturnsData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={equityReturnsData}>
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
              {/* 右侧垂直居中的 Top/Bottom 按钮 */}
              <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col space-y-2 z-50">
                <Button variant="secondary" size="sm" onClick={scrollToTop} aria-label="Scroll to top">
                  <ArrowUp className="h-4 w-4 mr-1" /> Top
                </Button>
                <Button variant="secondary" size="sm" onClick={scrollToBottom} aria-label="Scroll to bottom">
                  <ArrowDown className="h-4 w-4 mr-1" /> Bottom
                </Button>
              </div>
              {tradesData.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-9 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                    <div>时间</div>
                    <div>类型</div>
                    <div>价格</div>
                    <div>数量</div>
                    <div>盈亏</div>
                    <div>持仓</div>
                    <div>股票价值</div>
                    <div>现金</div>
                    <div>总资产</div>
                  </div>
                  {tradesData.map((trade, index) => {
                    // 用 dailyAssets 对齐当日资产口径，若缺则回退到行内数据
                    const a = dailyAssets.find(x => x.date === String(trade.date).split(' ')[0])
                    const sec = a ? (a.position * a.price) : Number(trade.securityValue || 0)
                    const cash = a ? a.cash : Number(trade.balance || 0)
                    const ta = a ? a.totalAssets : Number(trade.totalAssets || (cash + sec))
                    return (
                    <div key={index} className="grid grid-cols-9 gap-4 text-sm py-2 border-b hover:bg-muted/50">
                      <div className="text-xs">
                        <div>{trade.time}</div>
                      </div>
                      <div className={trade.action === 'buy' ? 'text-green-600' : (trade.action === 'sell' ? 'text-red-600' : 'text-blue-600')}>
                        {trade.action === 'buy' ? '买入' : (trade.action === 'sell' ? '卖出' : '持有')}
                      </div>
                      <div>¥{trade.price}</div>
                      <div>{trade.quantity}</div>
                      <div className={trade.pnlClass}>
                        {trade.pnl}
                      </div>
                      <div className="font-medium">{trade.position}</div>
                      <div className="font-medium">¥{sec.toFixed ? sec.toFixed(2) : sec}</div>
                      <div className="font-medium">¥{cash.toFixed ? cash.toFixed(2) : cash}</div>
                      <div className="font-medium">¥{ta.toFixed ? ta.toFixed(2) : ta}</div>
                    </div>
                    )
                  })}
                </div>
              ) : (
                <div className="p-4 border rounded-md bg-muted/30">
                  <div className="text-sm font-medium text-muted-foreground">本次回测未产生交易</div>
                  <div className="text-xs text-muted-foreground mt-2 space-y-1">
                    <div>- 可能原因：策略条件在所选时间区间内未被触发。</div>
                    <div>- 建议操作：
                      <span className="ml-1">尝试调整时间区间或K线周期；在策略库预览中查看“适用K线周期”与“使用技巧”。</span>
                    </div>
                    <div>- 数据提示：
                      <span className="ml-1">数据范围 {dataInfo?.start_date || '—'} 至 {dataInfo?.end_date || '—'}；总记录 {dataInfo?.total_records ?? '—'}。</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
