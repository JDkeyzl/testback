import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Loader2, TrendingUp, TrendingDown, Award, BarChart3, Download } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import { CommonFeaturesAnalysis } from '../components/CommonFeaturesAnalysis'

const STORAGE_KEY = 'best-stocks-state'

export function BestStocksPage() {
  // 获取今天的日期（YYYY-MM-DD格式）
  const getToday = () => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  // 计算默认开始日期（30天前）
  const getDefaultStartDate = () => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const [startDate, setStartDate] = useState(getDefaultStartDate())
  const [endDate, setEndDate] = useState(getToday())
  const [sampleSize, setSampleSize] = useState(500)  // 选股数量
  const [topN, setTopN] = useState(20)  // 返回前N只
  const [sortMethod, setSortMethod] = useState('return')  // 排序方式：'score' | 'return'
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState([])
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState({ processed: 0, total: 0, current: '' })
  const [taskId, setTaskId] = useState(null)
  const pollIntervalIdRef = useRef(null)
  const [sortBy, setSortBy] = useState(null) // 前端表格排序字段：null表示使用后端排序，'score' | 'return' 表示前端排序
  const [sortOrder, setSortOrder] = useState('desc') // 排序方向：asc | desc
  const [startTime, setStartTime] = useState(null) // 任务开始时间

  // 从 localStorage 恢复状态
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.startDate) setStartDate(parsed.startDate)
        if (parsed.endDate) setEndDate(parsed.endDate)
        if (parsed.sampleSize) setSampleSize(parsed.sampleSize)
        if (parsed.topN) setTopN(parsed.topN)
        if (parsed.sortMethod) setSortMethod(parsed.sortMethod)
        if (parsed.results) setResults(parsed.results)
      }
    } catch (e) {
      console.error('Failed to load saved state:', e)
    }
  }, [])

  // 保存状态到 localStorage
  useEffect(() => {
    try {
      const stateToSave = {
        startDate,
        endDate,
        sampleSize,
        topN,
        sortMethod,
        results,
        timestamp: Date.now()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
    } catch (e) {
      console.error('Failed to save state:', e)
    }
  }, [startDate, endDate, sampleSize, topN, sortMethod, results])

  // 计算最佳股票（异步，带进度）
  const handleCalculate = async () => {
    if (!startDate || !endDate) {
      alert('请选择开始日期和结束日期')
      return
    }

    if (sampleSize < 1) {
      alert('选股数量必须大于0')
      return
    }

    if (topN < 1 || topN > 100) {
      alert('返回前N只必须在1-100之间')
      return
    }

    if (topN > sampleSize) {
      alert('返回前N只不能大于选股数量')
      return
    }

    // 清除旧的轮询
    if (pollIntervalIdRef.current) {
      clearInterval(pollIntervalIdRef.current)
      pollIntervalIdRef.current = null
    }

    setIsLoading(true)
    setStatus('正在启动计算任务...')
    setResults([])
    setErrors([])
    setProgress({ processed: 0, total: 0, current: '' })
    setTaskId(null)
    setStartTime(Date.now()) // 记录开始时间

    try {
      // 1. 启动异步任务
      const startResp = await fetch('/api/v1/best-stocks/score-async', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          sampleSize,
          topN,
          sortMethod,  // 排序方式：'score' | 'return'
        }),
      })

      const startData = await startResp.json().catch(() => ({}))
      
      if (!startResp.ok || !startData?.ok || !startData.taskId) {
        throw new Error(startData.detail || '启动任务失败')
      }

      const tid = startData.taskId
      setTaskId(tid)
      setStatus('任务已启动，正在计算...')

      // 2. 轮询进度
      const intervalId = setInterval(async () => {
        try {
          const statusResp = await fetch(`/api/v1/best-stocks/status/${tid}`)
          const statusData = await statusResp.json().catch(() => ({}))

          if (!statusResp.ok || !statusData?.ok || !statusData.task) {
            clearInterval(intervalId)
            pollIntervalIdRef.current = null
            setStatus('获取进度失败')
            setIsLoading(false)
            setTaskId(null)
            return
          }

          const task = statusData.task
          const prog = task.progress || {}
          setProgress(prog)
          setResults(Array.isArray(task.results) ? task.results : [])
          if (task.errors && task.errors.length > 0) {
            setErrors(task.errors)
          }

          // 更新状态文本
          if (task.status === 'running') {
            const percent = prog.total > 0 ? Math.round((prog.processed / prog.total) * 100) : 0
            setStatus(`正在计算 ${prog.processed}/${prog.total} (${percent}%)${prog.current ? ` - 当前: ${prog.current}` : ''}`)
          } else if (task.status === 'completed') {
            clearInterval(intervalId)
            pollIntervalIdRef.current = null
            setStatus(`✅ 计算完成：共计算 ${prog.total} 只股票，筛选出 ${task.results?.length || 0} 只最佳股票`)
            setIsLoading(false)
            setTaskId(null)
            setStartTime(null) // 清除开始时间
          } else if (task.status === 'error') {
            clearInterval(intervalId)
            pollIntervalIdRef.current = null
            const errMsg = (Array.isArray(task.errors) && task.errors[0]?.error) || '未知错误'
            setStatus(`❌ 计算失败：${errMsg}`)
            setIsLoading(false)
            setTaskId(null)
            setStartTime(null) // 清除开始时间
          }
        } catch (e) {
          console.error('轮询进度失败', e)
        }
      }, 500) // 每500ms轮询一次

      pollIntervalIdRef.current = intervalId
    } catch (error) {
      console.error('启动计算任务失败:', error)
      alert(`启动任务失败: ${error.message}`)
      setIsLoading(false)
      setStatus('')
      setStartTime(null) // 清除开始时间
    }
  }

  // 格式化已用时
  const formatElapsedTime = () => {
    if (!startTime) return ''
    const elapsed = Math.floor((Date.now() - startTime) / 1000) // 秒
    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60
    if (minutes > 0) {
      return `${minutes}分${seconds}秒`
    }
    return `${seconds}秒`
  }

  // 排序结果（后端已经按sortMethod排序，这里只做去重和前端表格排序）
  const sortedResults = useMemo(() => {
    if (!results || results.length === 0) return []
    
    // 创建副本并去重（基于symbol）
    const uniqueResults = []
    const seenSymbols = new Set()
    for (const item of results) {
      if (item && item.symbol && !seenSymbols.has(item.symbol)) {
        seenSymbols.add(item.symbol)
        uniqueResults.push(item)
      }
    }
    
    // 后端已经按sortMethod排序，前端表格可以按其他字段排序
    // 如果前端sortBy为null，则使用后端排序；否则按前端sortBy排序
    const sorted = [...uniqueResults]
    if (!sortBy || sortBy === sortMethod) {
      // 使用后端排序（但可以调整排序方向）
      if (sortOrder === 'asc') {
        sorted.reverse()
      }
    } else {
      // 前端需要按不同字段排序
      sorted.sort((a, b) => {
        let aVal, bVal
        if (sortBy === 'return') {
          aVal = parseFloat(a.return) || 0
          bVal = parseFloat(b.return) || 0
        } else {
          aVal = parseFloat(a.score) || 0
          bVal = parseFloat(b.score) || 0
        }
        if (sortOrder === 'asc') {
          return aVal - bVal
        } else {
          return bVal - aVal
        }
      })
    }
    
    // 后端已经限制了数量为topN，这里直接返回
    // 注意：如果后端返回的数量少于topN，说明有效结果不足
    return sorted
  }, [results, sortBy, sortOrder, sortMethod, topN])

  // 处理排序点击
  const handleSort = (field) => {
    if (sortBy === field) {
      // 同一字段，切换排序方向
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // 不同字段，设置新字段并默认降序
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  // 格式化百分比
  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-'
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  // 格式化数字
  const formatNumber = (value, decimals = 2) => {
    if (value === null || value === undefined) return '-'
    return value.toFixed(decimals)
  }

  // 指标说明定义
  const indicatorDescriptions = {
    score: '综合评分：根据区间收益(30%)、最大回撤(20%)、波动率(15%)、Sharpe比率(20%)、趋势斜率(10%)、成交量健康度(5%)加权计算得出，分数越高表示综合表现越好。',
    return: '区间收益：所选时间段内，股票从起始价格到结束价格的总收益率。正值表示上涨，负值表示下跌。',
    maxDrawdown: '最大回撤：所选时间段内，从最高点到最低点的最大跌幅。数值越小越好，表示风险控制能力越强。',
    volatility: '波动率：股票价格的波动程度，年化标准差。数值越小越好，表示价格走势越稳定。',
    sharpeRatio: 'Sharpe比率：风险调整后的收益率，计算公式为(平均收益率/波动率)×√252。数值越大越好，表示在承担相同风险时获得的收益越高。',
    trendSlope: '趋势斜率：通过线性回归计算的价格趋势斜率，反映股票的整体上涨或下跌趋势。正值表示上涨趋势，负值表示下跌趋势。',
    volumeScore: '成交量健康度：衡量成交量与价格变化的相关性。上涨时放量、下跌时缩量得分较高，表示资金流向健康。',
    startPrice: '起始价格：所选时间段开始时的收盘价。',
    endPrice: '结束价格：所选时间段结束时的收盘价。',
    days: '交易日数：所选时间段内实际交易的交易日数量。'
  }

  // 表头组件（带tooltip）
  const TableHeaderWithTooltip = ({ children, description, className = '', onClick, sortable = false, sortIndicator = null, align = 'right' }) => {
    const justifyClass = align === 'left' ? 'justify-start' : 'justify-end'
    
    const headerContent = (
      <div className={`flex items-center ${justifyClass} gap-1 w-full`}>
        <span>{children}</span>
        {sortIndicator}
      </div>
    )

    if (onClick) {
      return (
        <th className={`${className} cursor-pointer hover:bg-muted/50 select-none`} onClick={onClick}>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="w-full">
                  {headerContent}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                <p>{description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </th>
      )
    }

    return (
      <th className={`${className} cursor-help`}>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-full">
                {headerContent}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
              <p>{description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </th>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            大浪淘沙 - 最佳股票筛选
          </CardTitle>
          <CardDescription>
            根据综合评分筛选一段时间内表现最好的股票
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">开始日期</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">结束日期</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sampleSize">选股数量</Label>
              <Input
                id="sampleSize"
                type="number"
                min="1"
                placeholder="如：500"
                value={sampleSize}
                onChange={(e) => setSampleSize(parseInt(e.target.value) || 500)}
              />
              <p className="text-xs text-muted-foreground">从所有股票中随机选择</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topN">返回前N只股票</Label>
              <Input
                id="topN"
                type="number"
                min="1"
                max="100"
                value={topN}
                onChange={(e) => setTopN(parseInt(e.target.value) || 20)}
              />
              <p className="text-xs text-muted-foreground">从选股中筛选最佳</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sortMethod">排序方式</Label>
              <Select value={sortMethod} onValueChange={setSortMethod}>
                <SelectTrigger id="sortMethod">
                  <SelectValue placeholder="选择排序方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="return">按区间收益排序</SelectItem>
                  <SelectItem value="score">按综合评分排序</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {sortMethod === 'return' 
                  ? '优先显示收益率最高的股票' 
                  : '根据综合评分（收益、回撤、波动率等）排序'}
              </p>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">评分公式说明：</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• 区间收益 (权重 30%)：期间总收益率</li>
              <li>• 最大回撤 (权重 20%)：回撤越小越好</li>
              <li>• 波动率 (权重 15%)：波动越小越好</li>
              <li>• Sharpe比率 (权重 20%)：风险调整后收益</li>
              <li>• 趋势斜率 (权重 10%)：线性回归趋势</li>
              <li>• 成交量健康度 (权重 5%)：上涨放量、下跌缩量</li>
            </ul>
          </div>

          <Button
            onClick={handleCalculate}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                计算中...
              </>
            ) : (
              <>
                <BarChart3 className="h-4 w-4 mr-2" />
                开始计算
              </>
            )}
          </Button>

          {/* 进度条 */}
          {isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                {progress.total > 0 ? (
                  <>
                    <span>已处理数量/总数量: {progress.processed}/{progress.total}</span>
                    <span>
                      ({Math.round((progress.processed / progress.total) * 100)}%)
                      {startTime && ` | 已用时: ${formatElapsedTime()}`}
                    </span>
                  </>
                ) : (
                  <span>{status || '正在启动任务...'}</span>
                )}
              </div>
              {progress.total > 0 ? (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min((progress.processed / progress.total) * 100, 100)}%` }}
                  />
                </div>
              ) : (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div className="bg-blue-600 h-2.5 rounded-full animate-pulse" style={{ width: '30%' }} />
                </div>
              )}
              {progress.current && (
                <p className="text-sm text-muted-foreground">处理中：{progress.current}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(results.length > 0 || (isLoading && progress.processed > 0)) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  最佳股票排名（前{topN}只）
                  {isLoading && progress.processed > 0 && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      （实时更新中...）
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
              {isLoading ? (
                <>
                  已分析 {progress.processed}/{progress.total} 只股票，当前显示前 {sortedResults.length} 只
                  {sortedResults.length < topN && `（有效结果不足，请求${topN}只）`}
                  {sortMethod === 'return' ? '（按区间收益排序）' : '（按综合评分排序）'}
                </>
              ) : (
                <>
                  从 {sampleSize} 只股票中筛选，共找到 {sortedResults.length} 只股票
                  {sortedResults.length < topN && `（有效结果不足，请求${topN}只）`}
                  {sortMethod === 'return' ? '（按区间收益排序）' : '（按综合评分排序）'}
                </>
              )}
                </CardDescription>
              </div>
              {sortedResults.length > 0 && !isLoading && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const resp = await fetch('/api/v1/best-stocks/export-csv', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          results: sortedResults,
                          startDate: startDate || undefined,
                          topN: topN,
                          sortMethod: sortMethod
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
            <div className="overflow-x-auto">
              <div 
                className="relative"
                style={{
                  maxHeight: sortedResults.length > 30 ? '1200px' : 'none',
                  overflowY: sortedResults.length > 30 ? 'auto' : 'visible'
                }}
              >
                <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b">
                    <th className="text-left p-2">排名</th>
                    <th className="text-left p-2">代码</th>
                    <th className="text-left p-2">名称</th>
                    <TableHeaderWithTooltip 
                      className="text-right p-2"
                      description={indicatorDescriptions.score}
                    >
                      综合评分
                    </TableHeaderWithTooltip>
                    <TableHeaderWithTooltip 
                      className="text-right p-2"
                      description={indicatorDescriptions.return}
                      onClick={() => handleSort('return')}
                      sortable={true}
                      sortIndicator={sortBy === 'return' && (
                        <span className="ml-1 text-primary">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    >
                      区间收益
                    </TableHeaderWithTooltip>
                    <TableHeaderWithTooltip 
                      className="text-right p-2"
                      description={indicatorDescriptions.maxDrawdown}
                    >
                      最大回撤
                    </TableHeaderWithTooltip>
                    <TableHeaderWithTooltip 
                      className="text-right p-2"
                      description={indicatorDescriptions.volatility}
                    >
                      波动率
                    </TableHeaderWithTooltip>
                    <TableHeaderWithTooltip 
                      className="text-right p-2"
                      description={indicatorDescriptions.sharpeRatio}
                    >
                      Sharpe比率
                    </TableHeaderWithTooltip>
                    <TableHeaderWithTooltip 
                      className="text-right p-2"
                      description={indicatorDescriptions.trendSlope}
                    >
                      趋势斜率
                    </TableHeaderWithTooltip>
                    <TableHeaderWithTooltip 
                      className="text-right p-2"
                      description={indicatorDescriptions.volumeScore}
                    >
                      成交量健康度
                    </TableHeaderWithTooltip>
                    <TableHeaderWithTooltip 
                      className="text-right p-2"
                      description={indicatorDescriptions.startPrice}
                    >
                      起始价格
                    </TableHeaderWithTooltip>
                    <TableHeaderWithTooltip 
                      className="text-right p-2"
                      description={indicatorDescriptions.endPrice}
                    >
                      结束价格
                    </TableHeaderWithTooltip>
                    <TableHeaderWithTooltip 
                      className="text-right p-2"
                      description={indicatorDescriptions.days}
                    >
                      交易日数
                    </TableHeaderWithTooltip>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((stock, index) => (
                    <tr key={stock.symbol} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-semibold">{index + 1}</td>
                      <td className="p-2 font-mono text-sm">{stock.symbol}</td>
                      <td className="p-2">{stock.name}</td>
                      <td className="p-2 text-right">
                        <span className="font-semibold text-primary">
                          {formatNumber(stock.score, 4)}
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        <span className={stock.return >= 0 ? 'text-red-600' : 'text-green-600'}>
                          {formatPercent(stock.return)}
                        </span>
                      </td>
                      <td className="p-2 text-right text-red-600">
                        {formatPercent(stock.maxDrawdown)}
                      </td>
                      <td className="p-2 text-right">
                        {formatPercent(stock.volatility)}
                      </td>
                      <td className="p-2 text-right">
                        <span className={stock.sharpeRatio >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatNumber(stock.sharpeRatio, 4)}
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        <span className={stock.trendSlope >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatNumber(stock.trendSlope, 6)}
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        {formatNumber(stock.volumeScore, 4)}
                      </td>
                      <td className="p-2 text-right font-mono text-sm">
                        {formatNumber(stock.startPrice, 2)}
                      </td>
                      <td className="p-2 text-right font-mono text-sm">
                        {formatNumber(stock.endPrice, 2)}
                      </td>
                      <td className="p-2 text-right">{stock.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">错误信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {errors.slice(0, 10).map((error, index) => (
                <div key={index} className="text-sm text-muted-foreground">
                  {error.symbol}: {error.error}
                </div>
              ))}
              {errors.length > 10 && (
                <div className="text-sm text-muted-foreground">
                  还有 {errors.length - 10} 个错误未显示...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 共同特征分析 */}
      {sortedResults.length > 0 && (
        <CommonFeaturesAnalysis
          symbols={sortedResults.map(s => s.symbol)}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </div>
  )
}

