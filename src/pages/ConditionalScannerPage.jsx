import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { Input } from '../components/ui/input'
import { Filter, Loader2, TrendingUp, TrendingDown, ArrowRight, Eye, Download } from 'lucide-react'

const PERSIST_KEY = 'conditional-screener-state'

export function ConditionalScannerPage() {
  const navigate = useNavigate()
  
  // 获取今天的日期（YYYY-MM-DD格式）
  const getToday = () => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  // 日线+周线MACD共振筛选
  const [direction, setDirection] = useState('bull') // bull | bear
  const [fast, setFast] = useState(12)
  const [slow, setSlow] = useState(26)
  const [signal, setSignal] = useState(9)
  const [enableDailyMacdPositive, setEnableDailyMacdPositive] = useState(false) // 日线MACD>0
  const [enableWeeklyMacdPositive, setEnableWeeklyMacdPositive] = useState(false) // 周线MACD>0
  const [endDate, setEndDate] = useState(getToday()) // 数据截止日期，默认今天
  const [enableVolume, setEnableVolume] = useState(true) // 是否启用放量筛选
  const [volumePeriod, setVolumePeriod] = useState(20) // 均量周期
  const [volumeRatio, setVolumeRatio] = useState(1.5) // 放量倍数
  const [enablePosition, setEnablePosition] = useState(true) // 是否启用位置筛选
  const [positionType, setPositionType] = useState('bottom') // bottom=底部启动 | early=主升浪初期
  const [lookbackDays, setLookbackDays] = useState(60) // 回看周期（天）
  const [priceThreshold, setPriceThreshold] = useState(30) // 价格位置阈值（%）
  const [enableMA, setEnableMA] = useState(false) // 是否启用均线筛选
  const [maShort, setMaShort] = useState(20) // 短期均线周期
  const [maLong, setMaLong] = useState(30) // 长期均线周期
  const [maRelation, setMaRelation] = useState('above') // above=短期在长期上方 | below=短期在长期下方
  const [enablePriceAboveMA, setEnablePriceAboveMA] = useState(false) // 是否启用价格大于MA筛选
  const [priceAboveMAPeriods, setPriceAboveMAPeriods] = useState([5, 20, 30, 60]) // 价格大于MA的周期列表（多选）
  const [enableFirstRisePhase, setEnableFirstRisePhase] = useState(false) // 是否启用第一次主升段筛选
  const [enableTrendStrength, setEnableTrendStrength] = useState(false) // 是否启用趋势强度筛选
  const [trendStrength, setTrendStrength] = useState('up') // up | down | neutral
  const [enableVolatility, setEnableVolatility] = useState(false) // 是否启用波动性筛选
  const [volatility, setVolatility] = useState('medium') // low | medium | high
  const [enableMAAlignment, setEnableMAAlignment] = useState(false) // 是否启用均线排列筛选
  const [maAlignment, setMaAlignment] = useState('bullish') // bullish | bearish | neutral | mixed
  const [limit, setLimit] = useState(50) // 限制筛选数量，用于测试
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState({ processed: 0, total: 0, matched: 0, current: '' })
  const [taskId, setTaskId] = useState(null)
  const [pollIntervalId, setPollIntervalId] = useState(null)
  const [sortBy, setSortBy] = useState('volume') // 排序字段：volume | name | code
  const [sortOrder, setSortOrder] = useState('desc') // 排序方向：asc | desc
  const [summary, setSummary] = useState(null) // 概括统计信息

  // 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId)
      }
    }
  }, [pollIntervalId])

  // 恢复筛选任务轮询（如果页面刷新时任务还在运行）
  useEffect(() => {
    // 如果taskId存在且isRunning为true，重新启动轮询
    if (taskId && isRunning && !pollIntervalId) {
      console.log(`恢复筛选任务轮询: taskId=${taskId}`)
      setStatus('正在恢复筛选任务...')
      
      const intervalId = setInterval(async () => {
        try {
          const statusResp = await fetch(`/api/v1/screener/status/${taskId}`)
          const statusData = await statusResp.json().catch(() => ({}))
          
          if (!statusResp.ok || !statusData?.ok || !statusData.task) {
            clearInterval(intervalId)
            setPollIntervalId(null)
            setStatus('获取进度失败，任务可能已结束')
            setIsRunning(false)
            setTaskId(null)
            return
          }
          
          const task = statusData.task
          const prog = task.progress || {}
          setProgress(prog)
          setResults(Array.isArray(task.results) ? task.results : [])
          // 更新概括统计
          if (task.summary) {
            setSummary(task.summary)
          } else {
            setSummary(null)
          }
          
          // 更新状态文本
          if (task.status === 'running') {
            const percent = prog.total > 0 ? Math.round((prog.processed / prog.total) * 100) : 0
            setStatus(`正在筛选 ${prog.processed}/${prog.total} (${percent}%)，已找到 ${prog.matched} 只`)
          } else if (task.status === 'completed') {
            clearInterval(intervalId)
            setPollIntervalId(null)
            setStatus(`✅ 筛选完成：共筛选 ${prog.total} 只，找到 ${prog.matched} 只符合条件的股票`)
            setIsRunning(false)
            setTaskId(null)
          } else if (task.status === 'error') {
            clearInterval(intervalId)
            setPollIntervalId(null)
            const errMsg = (Array.isArray(task.errors) && task.errors[0]?.error) || '未知错误'
            setStatus(`❌ 筛选失败：${errMsg}`)
            setIsRunning(false)
            setTaskId(null)
          }
        } catch (e) {
          console.error('轮询进度失败', e)
        }
      }, 500) // 每500ms轮询一次
      
      setPollIntervalId(intervalId)
      
      // 设置超时保护（1小时）
      const timeoutId = setTimeout(() => {
        clearInterval(intervalId)
        setPollIntervalId(null)
        if (isRunning) {
          setStatus('任务超时')
          setIsRunning(false)
          setTaskId(null)
        }
      }, 3600000)
      
      return () => {
        clearTimeout(timeoutId)
      }
    }
  }, [taskId, isRunning, pollIntervalId])

  // 加载持久化状态
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PERSIST_KEY)
      if (saved) {
        const state = JSON.parse(saved)
        if (state.direction) setDirection(state.direction)
        if (state.fast) setFast(state.fast)
        if (state.slow) setSlow(state.slow)
        if (state.signal) setSignal(state.signal)
        if (state.enableVolume !== undefined) setEnableVolume(state.enableVolume)
        if (state.volumePeriod) setVolumePeriod(state.volumePeriod)
        if (state.volumeRatio) setVolumeRatio(state.volumeRatio)
        if (state.enablePosition !== undefined) setEnablePosition(state.enablePosition)
        if (state.positionType) setPositionType(state.positionType)
        if (state.lookbackDays) setLookbackDays(state.lookbackDays)
        if (state.priceThreshold) setPriceThreshold(state.priceThreshold)
        if (state.enableMA !== undefined) setEnableMA(state.enableMA)
        if (state.maShort) setMaShort(state.maShort)
        if (state.maLong) setMaLong(state.maLong)
        if (state.maRelation) setMaRelation(state.maRelation)
        if (state.enablePriceAboveMA !== undefined) setEnablePriceAboveMA(state.enablePriceAboveMA)
        if (state.priceAboveMAPeriods) setPriceAboveMAPeriods(state.priceAboveMAPeriods)
        else if (state.priceAboveMAPeriod) setPriceAboveMAPeriods([state.priceAboveMAPeriod]) // 兼容旧数据
        if (state.enableFirstRisePhase !== undefined) setEnableFirstRisePhase(state.enableFirstRisePhase)
        if (state.enableTrendStrength !== undefined) setEnableTrendStrength(state.enableTrendStrength)
        if (state.trendStrength) setTrendStrength(state.trendStrength)
        if (state.enableVolatility !== undefined) setEnableVolatility(state.enableVolatility)
        if (state.volatility) setVolatility(state.volatility)
        if (state.enableMAAlignment !== undefined) setEnableMAAlignment(state.enableMAAlignment)
        if (state.maAlignment) setMaAlignment(state.maAlignment)
        if (state.limit) setLimit(state.limit)
        if (state.endDate) setEndDate(state.endDate)
        if (state.enableDailyMacdPositive !== undefined) setEnableDailyMacdPositive(state.enableDailyMacdPositive)
        if (state.enableWeeklyMacdPositive !== undefined) setEnableWeeklyMacdPositive(state.enableWeeklyMacdPositive)
        if (Array.isArray(state.results)) setResults(state.results)
        // 恢复筛选进度状态
        if (state.taskId) setTaskId(state.taskId)
        if (state.isRunning !== undefined) setIsRunning(state.isRunning)
        if (state.status) setStatus(state.status)
        if (state.progress) setProgress(state.progress)
        if (state.summary) setSummary(state.summary)
      }
    } catch {}
  }, [])

  // 保存状态
  useEffect(() => {
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({
        direction, fast, slow, signal, endDate, enableVolume, volumePeriod, volumeRatio,
        enablePosition, positionType, lookbackDays, priceThreshold,
        enableMA, maShort, maLong, maRelation, limit, results,
        enableDailyMacdPositive, enableWeeklyMacdPositive,
        enablePriceAboveMA, priceAboveMAPeriods, enableFirstRisePhase,
        enableTrendStrength, trendStrength, enableVolatility, volatility, enableMAAlignment, maAlignment,
        taskId, isRunning, status, progress, summary
      }))
    } catch {}
  }, [direction, fast, slow, signal, endDate, enableVolume, volumePeriod, volumeRatio, enablePosition, positionType, lookbackDays, priceThreshold, enableMA, maShort, maLong, maRelation, limit, results, enableDailyMacdPositive, enableWeeklyMacdPositive, enablePriceAboveMA, priceAboveMAPeriods, enableFirstRisePhase, enableTrendStrength, trendStrength, enableVolatility, volatility, enableMAAlignment, maAlignment, taskId, isRunning, status, progress, summary])

  const runScreen = async () => {
    // 不再强制要求选择方向
    // 清除旧的轮询
    if (pollIntervalId) {
      clearInterval(pollIntervalId)
      setPollIntervalId(null)
    }
    setIsRunning(true)
    setStatus('正在启动筛选任务...')
    setResults([])
    setProgress({ processed: 0, total: 0, matched: 0, current: '' })
    setSummary(null)  // 重置概括统计
    setTaskId(null)  // 清除旧的taskId
    
    try {
      // 1. 启动异步任务
      const controller = new AbortController()
      const fetchTimeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时（启动任务应该很快，但给足够时间）
      
      const startResp = await fetch('/api/v1/screener/multi-macd-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          timeframes: ['1d', '1w'],
          direction,
          fast,
          slow,
          signal,
          endDate: endDate || undefined,  // 数据截止日期
          limit: limit || undefined,  // 传递limit参数
          enableVolume,
          volumePeriod,
          volumeRatio,
          enablePosition,
          positionType,
          lookbackDays,
          priceThreshold,
          enableMA,
          maShort,
          maLong,
          maRelation,
          enableDailyMacdPositive,
          enableWeeklyMacdPositive,
          enablePriceAboveMA,
          priceAboveMAPeriods: enablePriceAboveMA ? priceAboveMAPeriods : undefined,
          enableFirstRisePhase,
          enableTrendStrength,
          trendStrength,
          enableVolatility,
          volatility,
          enableMAAlignment,
          maAlignment
        })
      })
      clearTimeout(fetchTimeoutId)
      
      if (!startResp.ok) {
        const errorText = await startResp.text().catch(() => '未知错误')
        throw new Error(`启动任务失败: ${startResp.status} ${errorText}`)
      }
      
      const startData = await startResp.json().catch((e) => {
        console.error('解析响应失败:', e)
        return {}
      })
      
      if (!startData?.ok || !startData.taskId) {
        throw new Error((startData && startData.detail) || '启动任务失败：未返回taskId')
      }
      
      const tid = startData.taskId
      setTaskId(tid)
      setStatus('任务已启动，正在筛选...')
      
      // 2. 轮询进度
      const intervalId = setInterval(async () => {
        try {
          const statusResp = await fetch(`/api/v1/screener/status/${tid}`)
          const statusData = await statusResp.json().catch(() => ({}))
          
          if (!statusResp.ok || !statusData?.ok || !statusData.task) {
            clearInterval(intervalId)
            setPollIntervalId(null)
            setStatus('获取进度失败')
            setIsRunning(false)
            setTaskId(null)
            return
          }
          
          const task = statusData.task
          const prog = task.progress || {}
          setProgress(prog)
          setResults(Array.isArray(task.results) ? task.results : [])
          // 更新概括统计
          if (task.summary) {
            console.log('收到summary数据:', task.summary)
            setSummary(task.summary)
          } else {
            setSummary(null)
          }
          
          // 更新状态文本
          if (task.status === 'running') {
            const percent = prog.total > 0 ? Math.round((prog.processed / prog.total) * 100) : 0
            setStatus(`正在筛选 ${prog.processed}/${prog.total} (${percent}%)，已找到 ${prog.matched} 只`)
          } else if (task.status === 'completed') {
            clearInterval(intervalId)
            setPollIntervalId(null)
            setStatus(`✅ 筛选完成：共筛选 ${prog.total} 只，找到 ${prog.matched} 只符合条件的股票`)
            setIsRunning(false)
            setTaskId(null)
          } else if (task.status === 'error') {
            clearInterval(intervalId)
            setPollIntervalId(null)
            const errMsg = (Array.isArray(task.errors) && task.errors[0]?.error) || '未知错误'
            setStatus(`❌ 筛选失败：${errMsg}`)
            setIsRunning(false)
            setTaskId(null)
          }
        } catch (e) {
          console.error('轮询进度失败', e)
        }
      }, 500) // 每500ms轮询一次
      
      setPollIntervalId(intervalId)
      
      // 设置超时保护（1小时）
      const timeoutId = setTimeout(() => {
        clearInterval(intervalId)
        setPollIntervalId(null)
        if (isRunning) {
          setStatus('任务超时')
          setIsRunning(false)
        }
      }, 3600000)
      
      // 保存超时ID，以便提前清理
      return () => clearTimeout(timeoutId)
      
    } catch (e) {
      console.error('启动筛选失败:', e)
      const errorMsg = e?.message || (typeof e === 'string' ? e : '未知错误')
      
      // 如果是取消错误，显示更友好的提示
      if (e?.name === 'AbortError' || errorMsg.includes('aborted')) {
        alert('请求被取消或超时，请检查网络连接或稍后重试')
      } else {
        alert('启动筛选失败：' + errorMsg)
      }
      
      setStatus('')
      setIsRunning(false)
      setTaskId(null)
      if (pollIntervalId) {
        clearInterval(pollIntervalId)
        setPollIntervalId(null)
      }
    }
  }

  // 排序结果
  const sortedResults = useMemo(() => {
    if (!Array.isArray(results) || results.length === 0) return []
    
    const sorted = [...results].sort((a, b) => {
      let valA, valB
      
      if (sortBy === 'volume') {
        valA = a.volumeInfo?.ratio || 0
        valB = b.volumeInfo?.ratio || 0
      } else if (sortBy === 'position') {
        valA = a.positionInfo?.percentile || 0
        valB = b.positionInfo?.percentile || 0
      } else if (sortBy === 'name') {
        valA = a.name || ''
        valB = b.name || ''
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
      } else if (sortBy === 'code') {
        valA = a.code || ''
        valB = b.code || ''
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
      } else {
        return 0
      }
      
      return sortOrder === 'asc' ? valA - valB : valB - valA
    })
    
    return sorted
  }, [results, sortBy, sortOrder])

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            条件选股 - 日线+周线MACD共振
          </CardTitle>
          <CardDescription>
            筛选日K与周K的MACD柱状图变化方向一致的股票（柱子同时上升或下降，数据源：data/stocks/）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* MACD参数与放量条件 */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">快线周期</Label>
              <Input
                type="number"
                value={fast}
                onChange={e => setFast(Number(e.target.value))}
                disabled={isRunning}
                className="text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">慢线周期</Label>
              <Input
                type="number"
                value={slow}
                onChange={e => setSlow(Number(e.target.value))}
                disabled={isRunning}
                className="text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">信号线周期</Label>
              <Input
                type="number"
                value={signal}
                onChange={e => setSignal(Number(e.target.value))}
                disabled={isRunning}
                className="text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">限制数量（测试用）</Label>
              <Input
                type="number"
                value={limit}
                onChange={e => setLimit(Number(e.target.value))}
                disabled={isRunning}
                placeholder="留空=全部"
                className="text-xs"
              />
            </div>
          </div>

          {/* 数据截止日期 */}
          <div className="border rounded-lg p-3 bg-muted/20">
            <Label className="text-sm font-medium mb-2 block">数据截止日期</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                disabled={isRunning}
                className="text-xs max-w-[200px]"
              />
              <span className="text-xs text-muted-foreground">
                只使用该日期及之前的数据进行筛选
              </span>
            </div>
          </div>

          {/* 放量条件 */}
          <div className="border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="enableVolume"
                checked={enableVolume}
                onChange={e => setEnableVolume(e.target.checked)}
                disabled={isRunning}
                className="h-4 w-4"
              />
              <Label htmlFor="enableVolume" className="text-sm font-medium cursor-pointer">
                启用放量筛选
              </Label>
            </div>
            {enableVolume && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <Label className="text-xs">均量周期（天）</Label>
                  <Input
                    type="number"
                    value={volumePeriod}
                    onChange={e => setVolumePeriod(Number(e.target.value))}
                    disabled={isRunning}
                    className="text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">放量倍数</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={volumeRatio}
                    onChange={e => setVolumeRatio(Number(e.target.value))}
                    disabled={isRunning}
                    className="text-xs"
                  />
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {enableVolume ? `最后一天成交量 ≥ 前${volumePeriod}日均量 × ${volumeRatio}` : '不限制成交量'}
            </p>
          </div>

          {/* 位置筛选 */}
          <div className="border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="enablePosition"
                checked={enablePosition}
                onChange={e => setEnablePosition(e.target.checked)}
                disabled={isRunning}
                className="h-4 w-4"
              />
              <Label htmlFor="enablePosition" className="text-sm font-medium cursor-pointer">
                启用位置筛选
              </Label>
            </div>
            {enablePosition && (
              <>
                <div className="flex gap-2 mb-2">
                  <Button
                    size="sm"
                    variant={positionType === 'bottom' ? 'default' : 'outline'}
                    onClick={() => setPositionType('bottom')}
                    disabled={isRunning}
                    className="text-xs"
                  >
                    底部启动
                  </Button>
                  <Button
                    size="sm"
                    variant={positionType === 'early' ? 'default' : 'outline'}
                    onClick={() => setPositionType('early')}
                    disabled={isRunning}
                    className="text-xs"
                  >
                    主升浪初期
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">回看周期（天）</Label>
                    <Input
                      type="number"
                      value={lookbackDays}
                      onChange={e => setLookbackDays(Number(e.target.value))}
                      disabled={isRunning}
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">价格位置阈值（%）</Label>
                    <Input
                      type="number"
                      value={priceThreshold}
                      onChange={e => setPriceThreshold(Number(e.target.value))}
                      disabled={isRunning}
                      className="text-xs"
                    />
                  </div>
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {enablePosition ? (
                positionType === 'bottom' 
                  ? `底部启动：当前价格在近${lookbackDays}天的前${priceThreshold}%区间（刚脱离底部）`
                  : `主升浪初期：当前价格在近${lookbackDays}天的${priceThreshold}%-60%区间（避开高位）`
              ) : '不限制价格位置'}
            </p>
          </div>

          {/* 均线筛选 */}
          <div className="border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="enableMA"
                checked={enableMA}
                onChange={e => setEnableMA(e.target.checked)}
                disabled={isRunning}
                className="h-4 w-4"
              />
              <Label htmlFor="enableMA" className="text-sm font-medium cursor-pointer">
                启用均线筛选
              </Label>
            </div>
            {enableMA && (
              <>
                <div className="grid grid-cols-3 gap-3 mb-2">
                  <div>
                    <Label className="text-xs">短期均线周期</Label>
                    <Input
                      type="number"
                      value={maShort}
                      onChange={e => setMaShort(Number(e.target.value))}
                      disabled={isRunning}
                      className="text-xs"
                      min="1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">长期均线周期</Label>
                    <Input
                      type="number"
                      value={maLong}
                      onChange={e => setMaLong(Number(e.target.value))}
                      disabled={isRunning}
                      className="text-xs"
                      min="1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">位置关系</Label>
                    <div className="flex gap-1 mt-1">
                      <Button
                        size="sm"
                        variant={maRelation === 'above' ? 'default' : 'outline'}
                        onClick={() => setMaRelation('above')}
                        disabled={isRunning}
                        className="text-xs flex-1"
                      >
                        上方
                      </Button>
                      <Button
                        size="sm"
                        variant={maRelation === 'below' ? 'default' : 'outline'}
                        onClick={() => setMaRelation('below')}
                        disabled={isRunning}
                        className="text-xs flex-1"
                      >
                        下方
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {maRelation === 'above' 
                    ? `${maShort}日均线在${maLong}日均线上方（多头排列）`
                    : `${maShort}日均线在${maLong}日均线下方（空头排列）`}
                </p>
              </>
            )}
          </div>

          {/* 价格大于MA筛选 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="enablePriceAboveMA"
                checked={enablePriceAboveMA}
                onChange={e => setEnablePriceAboveMA(e.target.checked)}
                disabled={isRunning}
                className="w-4 h-4"
              />
              <Label htmlFor="enablePriceAboveMA" className="text-sm font-medium cursor-pointer">
                价格大于MA
              </Label>
            </div>
            {enablePriceAboveMA && (
              <div className="mb-2">
                <Label className="text-xs mb-2 block">选择MA周期（可多选）</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[5, 10, 20, 30, 60, 120].map(period => (
                    <div key={period} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`ma-${period}`}
                        checked={priceAboveMAPeriods.includes(period)}
                        onChange={e => {
                          if (e.target.checked) {
                            setPriceAboveMAPeriods([...priceAboveMAPeriods, period].sort((a, b) => a - b))
                          } else {
                            setPriceAboveMAPeriods(priceAboveMAPeriods.filter(p => p !== period))
                          }
                        }}
                        disabled={isRunning}
                        className="h-4 w-4"
                      />
                      <Label htmlFor={`ma-${period}`} className="text-xs cursor-pointer">
                        MA{period}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  截止日期当天的收盘价大于选中的MA周期
                  {priceAboveMAPeriods.length > 0 && ` (已选: MA${priceAboveMAPeriods.join(', MA')})`}
                </p>
              </div>
            )}
          </div>

          {/* 第一次主升段筛选 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="enableFirstRisePhase"
                checked={enableFirstRisePhase}
                onChange={e => setEnableFirstRisePhase(e.target.checked)}
                disabled={isRunning}
                className="w-4 h-4"
              />
              <Label htmlFor="enableFirstRisePhase" className="text-sm font-medium cursor-pointer">
                第一次主升段
              </Label>
            </div>
            {enableFirstRisePhase && (
              <p className="text-xs text-muted-foreground">
                只选日线MACD柱状图由绿转红后第一次红柱持续放大形成的主升段，不包含回落后再度放大的再次上涨
              </p>
            )}
          </div>

          {/* 趋势强度筛选 */}
          <div className="border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="enableTrendStrength"
                checked={enableTrendStrength}
                onChange={e => setEnableTrendStrength(e.target.checked)}
                disabled={isRunning}
                className="h-4 w-4"
              />
              <Label htmlFor="enableTrendStrength" className="text-sm font-medium cursor-pointer">
                启用趋势强度筛选
              </Label>
            </div>
            {enableTrendStrength && (
              <div className="flex gap-2 mb-2">
                <Button
                  size="sm"
                  variant={trendStrength === 'up' ? 'default' : 'outline'}
                  onClick={() => setTrendStrength('up')}
                  disabled={isRunning}
                >
                  上涨趋势
                </Button>
                <Button
                  size="sm"
                  variant={trendStrength === 'down' ? 'default' : 'outline'}
                  onClick={() => setTrendStrength('down')}
                  disabled={isRunning}
                >
                  下跌趋势
                </Button>
                <Button
                  size="sm"
                  variant={trendStrength === 'neutral' ? 'default' : 'outline'}
                  onClick={() => setTrendStrength('neutral')}
                  disabled={isRunning}
                >
                  横盘整理
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {enableTrendStrength ? `20日价格趋势为${trendStrength === 'up' ? '上涨' : trendStrength === 'down' ? '下跌' : '横盘'}` : '不限制趋势强度'}
            </p>
          </div>

          {/* 波动性筛选 */}
          <div className="border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="enableVolatility"
                checked={enableVolatility}
                onChange={e => setEnableVolatility(e.target.checked)}
                disabled={isRunning}
                className="h-4 w-4"
              />
              <Label htmlFor="enableVolatility" className="text-sm font-medium cursor-pointer">
                启用波动性筛选
              </Label>
            </div>
            {enableVolatility && (
              <div className="flex gap-2 mb-2">
                <Button
                  size="sm"
                  variant={volatility === 'low' ? 'default' : 'outline'}
                  onClick={() => setVolatility('low')}
                  disabled={isRunning}
                >
                  低波动
                </Button>
                <Button
                  size="sm"
                  variant={volatility === 'medium' ? 'default' : 'outline'}
                  onClick={() => setVolatility('medium')}
                  disabled={isRunning}
                >
                  中等波动
                </Button>
                <Button
                  size="sm"
                  variant={volatility === 'high' ? 'default' : 'outline'}
                  onClick={() => setVolatility('high')}
                  disabled={isRunning}
                >
                  高波动
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {enableVolatility ? `价格波动为${volatility === 'low' ? '低（<2%）' : volatility === 'medium' ? '中等（2%-5%）' : '高（>5%）'}` : '不限制波动性'}
            </p>
          </div>

          {/* 均线排列筛选 */}
          <div className="border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="enableMAAlignment"
                checked={enableMAAlignment}
                onChange={e => setEnableMAAlignment(e.target.checked)}
                disabled={isRunning}
                className="h-4 w-4"
              />
              <Label htmlFor="enableMAAlignment" className="text-sm font-medium cursor-pointer">
                启用均线排列筛选
              </Label>
            </div>
            {enableMAAlignment && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Button
                  size="sm"
                  variant={maAlignment === 'bullish' ? 'default' : 'outline'}
                  onClick={() => setMaAlignment('bullish')}
                  disabled={isRunning}
                >
                  多头排列
                </Button>
                <Button
                  size="sm"
                  variant={maAlignment === 'bearish' ? 'default' : 'outline'}
                  onClick={() => setMaAlignment('bearish')}
                  disabled={isRunning}
                >
                  空头排列
                </Button>
                <Button
                  size="sm"
                  variant={maAlignment === 'neutral' ? 'default' : 'outline'}
                  onClick={() => setMaAlignment('neutral')}
                  disabled={isRunning}
                >
                  均线粘合
                </Button>
                <Button
                  size="sm"
                  variant={maAlignment === 'mixed' ? 'default' : 'outline'}
                  onClick={() => setMaAlignment('mixed')}
                  disabled={isRunning}
                >
                  混合排列
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {enableMAAlignment ? `均线排列为${maAlignment === 'bullish' ? '多头（MA5>MA10>MA20>MA30）' : maAlignment === 'bearish' ? '空头（MA5<MA10<MA20<MA30）' : maAlignment === 'neutral' ? '粘合（横盘）' : '混合（趋势不明）'}` : '不限制均线排列'}
            </p>
          </div>

          {/* 方向选择 */}
          <div>
            <Label className="text-sm mb-2 block">MACD方向</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={direction === 'bull' ? 'default' : 'outline'}
                onClick={() => setDirection('bull')}
                disabled={isRunning}
                className="flex items-center gap-1"
              >
                <TrendingUp className="h-4 w-4" />
                柱子上升（动能增强）
              </Button>
              <Button
                size="sm"
                variant={direction === 'bear' ? 'default' : 'outline'}
                onClick={() => setDirection('bear')}
                disabled={isRunning}
                className="flex items-center gap-1"
              >
                <TrendingDown className="h-4 w-4" />
                柱子下降（动能减弱）
              </Button>
            </div>
          </div>

          {/* MACD值筛选 */}
          <div>
            <Label className="text-sm mb-2 block">MACD值筛选（非必选）</Label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enableDailyMacdPositive"
                  checked={enableDailyMacdPositive}
                  onChange={(e) => setEnableDailyMacdPositive(e.target.checked)}
                  disabled={isRunning}
                  className="w-4 h-4"
                />
                <Label htmlFor="enableDailyMacdPositive" className="text-sm cursor-pointer">
                  日线MACD &gt; 0
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enableWeeklyMacdPositive"
                  checked={enableWeeklyMacdPositive}
                  onChange={(e) => setEnableWeeklyMacdPositive(e.target.checked)}
                  disabled={isRunning}
                  className="w-4 h-4"
                />
                <Label htmlFor="enableWeeklyMacdPositive" className="text-sm cursor-pointer">
                  周线MACD &gt; 0
                </Label>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <Button
              onClick={runScreen}
              disabled={isRunning}
              className="bg-primary"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  筛选中...
                </>
              ) : (
                <>
                  <Filter className="h-4 w-4 mr-2" />
                  开始筛选（日线+周线）
                </>
              )}
            </Button>
          </div>
          
          {/* 进度显示 */}
          {isRunning && progress.total > 0 && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">筛选进度</span>
                <span className="text-sm text-muted-foreground">
                  {progress.processed}/{progress.total} ({Math.round((progress.processed / progress.total) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 mb-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.processed / progress.total) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>已找到 {progress.matched} 只符合条件</span>
                {progress.current && <span>当前: {progress.current}</span>}
              </div>
            </div>
          )}
          
          {/* 状态文本 */}
          {status && (
            <div className="text-sm text-muted-foreground px-2">
              {status}
            </div>
          )}

          {/* 说明 */}
          <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
            <p>• 数据源：优先使用 data/stocks/ 下的日K数据（可在首页"🚀点火 启动!"批量获取）</p>
            <p>• 共振条件：日线与周线的MACD柱状图（hist = DIF - DEA）变化方向一致</p>
            <p>• 柱子上升 = hist[-1] &gt; hist[-2]，表示动能增强；柱子下降 = hist[-1] &lt; hist[-2]，表示动能减弱</p>
            <p>• 筛选结果可直接"去回测"进一步验证策略效果</p>
          </div>
        </CardContent>
      </Card>

      {/* 筛选结果 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>筛选结果</CardTitle>
              <CardDescription>
                {results.length > 0 ? `找到 ${results.length} 只符合条件的股票` : '暂无结果'}
              </CardDescription>
            </div>
            {results.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    const resp = await fetch('/api/v1/screener/export-csv', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        results: sortedResults,  // 使用排序后的结果
                        direction,
                        fast,
                        slow,
                        signal,
                        endDate: endDate || undefined,  // 截止日期
                        volumeRatio: enableVolume ? volumeRatio : undefined,  // 放量倍数
                        maShort: enableMA ? maShort : undefined,  // 短期均线周期
                        maLong: enableMA ? maLong : undefined,  // 长期均线周期
                        priceThreshold: enablePosition ? priceThreshold : undefined  // 位置百分比阈值
                      })
                    })
                    
                    if (!resp.ok) {
                      const raw = await resp.text()
                      let data = null
                      try { data = raw ? JSON.parse(raw) : null } catch {}
                      throw new Error((data && data.detail) || `${resp.status} ${resp.statusText}`)
                    }
                    
                    const data = await resp.json()
                    alert(`✅ ${data.message || '导出成功'}\n\n文件路径: ${data.filepath || data.filename}`)
                  } catch (e) {
                    alert('❌ 导出失败：' + (e?.message || e))
                  }
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                导出CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              点击"开始筛选"查看结果
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th 
                      className="py-2 pr-4 cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('name')}
                    >
                      股票 {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="py-2 pr-4">最新价格</th>
                    <th className="py-2 pr-4">日线MACD</th>
                    <th className="py-2 pr-4">日MACD值</th>
                    <th className="py-2 pr-4">周线MACD</th>
                    <th className="py-2 pr-4">周MACD值</th>
                    {enableVolume && (
                      <th 
                        className="py-2 pr-4 cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort('volume')}
                      >
                        放量倍数 {sortBy === 'volume' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                    )}
                    {enablePosition && (
                      <th 
                        className="py-2 pr-4 cursor-pointer hover:text-foreground"
                        onClick={() => toggleSort('position')}
                      >
                        价格位置 {sortBy === 'position' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </th>
                    )}
                    {enablePriceAboveMA && (
                      <th className="py-2 pr-4">价格与MA</th>
                    )}
                    {enableMA && (
                      <th className="py-2 pr-4">均线关系</th>
                    )}
                    {enableTrendStrength && (
                      <th className="py-2 pr-4">趋势强度</th>
                    )}
                    {enableVolatility && (
                      <th className="py-2 pr-4">波动性</th>
                    )}
                    {enableMAAlignment && (
                      <th className="py-2 pr-4">均线排列</th>
                    )}
                    <th className="py-2 pr-4">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((r, idx) => {
                    const dailyDir = r.directions?.['1d'] || 'neutral'
                    const weeklyDir = r.directions?.['1w'] || 'neutral'
                    const dailyIcon = dailyDir === 'bull' ? '📈' : (dailyDir === 'bear' ? '📉' : '➖')
                    const weeklyIcon = weeklyDir === 'bull' ? '📈' : (weeklyDir === 'bear' ? '📉' : '➖')
                    
                    return (
                      <tr key={r.code || idx} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{r.name || r.code}</div>
                          <div className="text-xs text-muted-foreground">{r.code}</div>
                        </td>
                        <td className="py-2 pr-4">
                          {r.latestPrice !== null && r.latestPrice !== undefined ? (
                            <span className="font-medium">¥{r.latestPrice.toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <span className="text-lg">{dailyIcon}</span>
                          <span className="text-xs ml-1">{dailyDir}</span>
                        </td>
                        <td className="py-2 pr-4">
                          {r.dailyMacd !== null && r.dailyMacd !== undefined ? (
                            <span className={r.dailyMacd > 0 ? 'text-red-600' : 'text-green-600'}>
                              {r.dailyMacd > 0 ? '+' : ''}{r.dailyMacd.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <span className="text-lg">{weeklyIcon}</span>
                          <span className="text-xs ml-1">{weeklyDir}</span>
                        </td>
                        <td className="py-2 pr-4">
                          {r.weeklyMacd !== null && r.weeklyMacd !== undefined ? (
                            <span className={r.weeklyMacd > 0 ? 'text-red-600' : 'text-green-600'}>
                              {r.weeklyMacd > 0 ? '+' : ''}{r.weeklyMacd.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        {enableVolume && (
                          <td className="py-2 pr-4">
                            {r.volumeInfo?.ratio ? (
                              <span className={r.volumeInfo.ratio >= volumeRatio ? 'text-red-600 font-medium' : ''}>
                                {r.volumeInfo.ratio.toFixed(2)}x
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                        )}
                        {enablePosition && (
                          <td className="py-2 pr-4">
                            {r.positionInfo?.percentile != null ? (
                              <span className={
                                r.positionInfo.percentile <= 30 ? 'text-green-600 font-medium' : 
                                r.positionInfo.percentile <= 60 ? 'text-blue-600' : 
                                'text-orange-600'
                              }>
                                {r.positionInfo.percentile.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                        )}
                        {enablePriceAboveMA && (
                          <td className="py-2 pr-4">
                            {r.priceAboveMAInfo && Object.keys(r.priceAboveMAInfo).length > 0 ? (
                              <div className="text-xs space-y-1">
                                {Object.entries(r.priceAboveMAInfo).map(([maKey, maInfo]) => (
                                  <div key={maKey} className="flex items-center gap-1">
                                    <span className={maInfo.above ? 'text-green-600 font-medium' : 'text-red-600'}>
                                      {maInfo.above ? '✓' : '✗'}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {maKey}: {maInfo.value?.toFixed(2) || '-'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                        )}
                        {enableMA && (
                          <td className="py-2 pr-4">
                            {r.maInfo ? (
                              <div className="text-xs">
                                <div className={r.maInfo.relation === 'above' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                  {r.maInfo.relation === 'above' ? '✓ 上方' : '✓ 下方'}
                                </div>
                                <div className="text-muted-foreground">
                                  MA{r.maInfo.short}: {r.maInfo.maShort?.toFixed(2) || '-'} | MA{r.maInfo.long}: {r.maInfo.maLong?.toFixed(2) || '-'}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                        )}
                        {enableTrendStrength && (
                          <td className="py-2 pr-4">
                            {r.trendStrengthInfo?.value ? (
                              <span className={
                                r.trendStrengthInfo.value === 'up' ? 'text-green-600 font-medium' :
                                r.trendStrengthInfo.value === 'down' ? 'text-red-600 font-medium' :
                                'text-gray-600'
                              }>
                                {r.trendStrengthInfo.value === 'up' ? '📈 上涨' :
                                 r.trendStrengthInfo.value === 'down' ? '📉 下跌' :
                                 '➡️ 横盘'}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                        )}
                        {enableVolatility && (
                          <td className="py-2 pr-4">
                            {r.volatilityInfo?.value ? (
                              <span className={
                                r.volatilityInfo.value === 'low' ? 'text-green-600' :
                                r.volatilityInfo.value === 'medium' ? 'text-blue-600' :
                                'text-orange-600 font-medium'
                              }>
                                {r.volatilityInfo.value === 'low' ? '✅ 低' :
                                 r.volatilityInfo.value === 'medium' ? '➡️ 中' :
                                 '⚠️ 高'}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                        )}
                        {enableMAAlignment && (
                          <td className="py-2 pr-4">
                            {r.maAlignmentInfo?.value ? (
                              <span className={
                                r.maAlignmentInfo.value === 'bullish' ? 'text-green-600 font-medium' :
                                r.maAlignmentInfo.value === 'bearish' ? 'text-red-600 font-medium' :
                                r.maAlignmentInfo.value === 'neutral' ? 'text-blue-600' :
                                'text-gray-600'
                              }>
                                {r.maAlignmentInfo.value === 'bullish' ? '📈 多头' :
                                 r.maAlignmentInfo.value === 'bearish' ? '📉 空头' :
                                 r.maAlignmentInfo.value === 'neutral' ? '➡️ 粘合' :
                                 '🔄 混合'}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </td>
                        )}
                        <td className="py-2 pr-4">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                // 跳转到K线详情页，展示日线+周线MACD
                                navigate(`/screener-detail/${r.code}`, {
                                  state: {
                                    code: r.code,
                                    name: r.name,
                                    macdParams: { fast, slow, signal },
                                    directions: r.directions
                                  }
                                })
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              查看详情
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                // 跳转到股票回测页并预填代码
                                try {
                                  setSymbolPg({ symbol: r.code, symbolName: r.name, query: `${r.name}（${r.code}）` })
                                } catch {}
                                navigate('/symbol-backtest')
                              }}
                            >
                              <ArrowRight className="h-3 w-3 mr-1" />
                              去回测
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
