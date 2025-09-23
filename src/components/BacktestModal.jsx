import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { X, Play, Loader2, Calendar, Clock, DollarSign } from 'lucide-react'

export function BacktestModal({ 
  isOpen, 
  onClose, 
  strategy, 
  onRunBacktest 
}) {
  const navigate = useNavigate()
  const [startDate, setStartDate] = useState('2025-01-01')
  // 默认结束日期为今天的前一天
  const getYesterday = () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  const [endDate, setEndDate] = useState(getYesterday())
  const [initialCapital, setInitialCapital] = useState(100000)
  const [timeframe, setTimeframe] = useState('5m')
  const recommended = strategy?.recommended || strategy?.strategy?.recommended
  const tips = strategy?.tips
  const [isRunning, setIsRunning] = useState(false)
  const [sources, setSources] = useState([])
  // 搜索选择框相关
  const [stockList, setStockList] = useState([])
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)
  const [selectedStock, setSelectedStock] = useState(null)
  const [symbol, setSymbol] = useState('')

  // 当策略变化时重置表单
  useEffect(() => {
    if (strategy) {
      setStartDate('2025-01-01')
      setEndDate(getYesterday())
      setInitialCapital(100000)
      // 默认时间周期从策略节点里读取，若不存在则保持'5m'
      const tfFromNodes = Array.isArray(strategy.strategy?.nodes)
        ? (strategy.strategy.nodes.find(n => n?.data?.timeframe)?.data?.timeframe || null)
        : null
      // 优先采用策略库的建议周期（若能匹配标准值），否则回落到节点设置，再否则'5m'
      const tf = (() => {
        if (recommended?.includes('1d')) return '1d'
        if (recommended?.includes('4h')) return '4h'
        if (recommended?.includes('1h')) return '1h'
        if (recommended?.includes('30m')) return '30m'
        if (recommended?.includes('15m')) return '15m'
        if (recommended?.includes('5m')) return '5m'
        if (recommended?.includes('1m')) return '1m'
        return tfFromNodes || '5m'
      })()
      setTimeframe(tf)
    }
  }, [strategy])

  // 加载数据源列表
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await fetch('/api/v1/data/sources')
        if (res.ok) {
          const data = await res.json()
          setSources(Array.isArray(data?.sources) ? data.sources : [])
          // 若存在常用symbol则默认选第一个
          if (!symbol && data?.sources?.length) {
            setSymbol(data.sources[0].symbol)
          }
        }
      } catch (e) {
        // 静默失败
      }
    }
    fetchSources()
  }, [])

  // 加载本地股票字典（用于搜索）
  useEffect(() => {
    (async () => {
      try {
        let ok = false
        try {
          const r = await fetch('/api/v1/data/stocklist')
          if (r.ok) {
            const data = await r.json()
            setStockList(Array.isArray(data?.list) ? data.list : [])
            ok = true
          }
        } catch {}
        if (!ok) {
          const r2 = await fetch('/data/stockList/all_pure_stock.json')
          if (r2.ok) {
            const data2 = await r2.json()
            setStockList(Array.isArray(data2) ? data2 : [])
          }
        }
      } catch {}
    })()
  }, [])

  // 归一化股票项
  const normalizedStocks = useMemo(() => {
    const pick = (obj, keys) => {
      for (const k of keys) {
        if (obj[k] != null && obj[k] !== '') return obj[k]
      }
      return ''
    }
    const extractCode = (obj) => {
      const cand = String(pick(obj, ['code','c','symbol','ticker','证券代码','code_simple']) || '')
      let candFull = String(pick(obj, ['code_full','cf','codeFull','full_code','ts_code','wind_code']) || '')
      if (!candFull && cand.includes('.')) candFull = cand
      const digits = (cand.match(/\d{6}/) || [])[0] || (candFull.match(/\d{6}/) || [])[0] || ''
      return { code: digits, codeFull: candFull }
    }
    return (stockList || []).map(it => {
      const nameZh = String(pick(it, ['code_name','name','n','nameZh','name_zh','displayName','display_name','简称','nameCN','sec_name','stock_name','sname']) || '')
      const { code, codeFull } = extractCode(it)
      return { nameZh, code, codeFull }
    }).filter(it => it.nameZh && it.code)
  }, [stockList])

  // 防抖查询
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150)
    return () => clearTimeout(t)
  }, [query])

  const filteredStocks = useMemo(() => {
    const q = (debouncedQuery || '').trim().toLowerCase()
    if (!q) return normalizedStocks.slice(0, 50)
    const parts = q.split(/\s+/).filter(Boolean)
    let arr = normalizedStocks.filter(it => parts.every(p => it.nameZh.toLowerCase().includes(p) || it.code.toLowerCase().includes(p)))
    // 简单排序：代码完全匹配>前缀匹配>包含
    arr.sort((a,b) => {
      const exactA = (a.code === q) ? 1 : 0
      const exactB = (b.code === q) ? 1 : 0
      if (exactA !== exactB) return exactB - exactA
      const prefA = a.code.startsWith(q) ? 1 : 0
      const prefB = b.code.startsWith(q) ? 1 : 0
      if (prefA !== prefB) return prefB - prefA
      return 0
    })
    return arr.slice(0, 50)
  }, [debouncedQuery, normalizedStocks])

  const handleRunBacktest = async () => {
    if (!strategy) return

    setIsRunning(true)
    try {
      const useSymbol = symbol || selectedStock?.code || '002130'
      const backtestParams = {
        strategyId: strategy.id,
        name: strategy.name,
        strategy: strategy.strategy, // 传递策略的JSON配置
        startDate,
        endDate,
        initialCapital,
        timeframe,
        symbol: useSymbol
      }
      
      // 调用父组件的回测处理函数
      if (onRunBacktest) {
        await onRunBacktest(backtestParams)
      }
      
      // 回测成功后关闭模态框
      onClose()
    } catch (error) {
      console.error('回测运行失败:', error)
      alert('回测运行失败: ' + error.message)
    } finally {
      setIsRunning(false)
    }
  }

  const handleClose = () => {
    if (!isRunning) {
      onClose()
    }
  }

  if (!isOpen || !strategy) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">回测设置</CardTitle>
              <CardDescription className="text-sm">
                配置 {strategy.name} 的回测参数
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isRunning}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* 时间范围设置 */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-sm font-medium">
              <Calendar className="h-4 w-4" />
              <span>时间范围</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-xs">开始日期</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs"
                  disabled={isRunning}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate" className="text-xs">结束日期</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs"
                  disabled={isRunning}
                />
              </div>
            </div>
          </div>

          {/* 初始资金设置 */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-sm font-medium">
              <DollarSign className="h-4 w-4" />
              <span>初始资金</span>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="initialCapital" className="text-xs">资金金额（元）</Label>
              <Input
                id="initialCapital"
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(Number(e.target.value))}
                className="text-xs"
                disabled={isRunning}
                placeholder="100000"
              />
            </div>
          </div>

          {/* 时间周期设置 */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-sm font-medium">
              <Clock className="h-4 w-4" />
              <span>时间周期</span>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="timeframe" className="text-xs">K线周期</Label>
              <select
                id="timeframe"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-input bg-background rounded-md"
                disabled={isRunning}
              >
                <option value="1m">1分钟</option>
                <option value="5m">5分钟</option>
                <option value="15m">15分钟</option>
                <option value="30m">30分钟</option>
                <option value="1h">1小时</option>
                <option value="4h">4小时</option>
                <option value="1d">1天</option>
                <option value="1w">1周</option>
                <option value="1M">1月</option>
              </select>
              {(recommended || tips) && (
                <div className="text-[11px] text-muted-foreground space-y-1">
                  {recommended && <div>建议周期：{recommended}</div>}
                  {tips && <div>操作技巧：{tips}</div>}
                </div>
              )}
            </div>
          </div>

          {/* 数据源选择（搜索选择框 + 一键拉取数据） */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm font-medium">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4" />
                <span>数据源</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={isRunning || !(selectedStock || symbol)}
                onClick={async ()=>{
                  try {
                    const code = symbol || selectedStock?.code
                    if (!code) { alert('请先选择股票'); return }
                    const codeFull = (code && code.startsWith('6')) ? `sh.${code}` : `sz.${code}`
                    const res = await fetch('/api/v1/data/fetch', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ codeFull, name: selectedStock?.nameZh || code, startDate, endDate, timeframe })
                    })
                    const raw = await res.text(); let data = null; try { data = raw ? JSON.parse(raw) : null } catch{}
                    if (!res.ok || !(data && data.ok)) { throw new Error((data && (data.detail||data.error)) || `${res.status} ${res.statusText}`) }
                    alert('拉取完成：' + (data.csv || ''))
                    // 刷新本地数据源
                    try { const r = await fetch('/api/v1/data/sources'); if (r.ok) { const d = await r.json(); setSources(Array.isArray(d?.sources)?d.sources:[]) } } catch {}
                  } catch(e) {
                    alert('拉取失败：' + (e?.message || e))
                  }
                }}
              >一键拉取数据</Button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">选择股票（可搜索）</Label>
              <Input
                ref={inputRef}
                className="text-xs mb-2"
                placeholder="输入中文名或代码搜索..."
                value={query}
                onChange={e=>{ setQuery(e.target.value); setHighlightIdx(-1) }}
                onFocus={()=>setIsFocused(true)}
                onBlur={(e)=>{ setTimeout(()=> setIsFocused(false), 100) }}
                onKeyDown={(e)=>{
                  if (!isFocused) return
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i=>Math.min((i<0? -1:i)+1, filteredStocks.length-1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i=>Math.max((i<=0? 0:i)-1, 0)) }
                  if (e.key === 'Enter') {
                    if (highlightIdx >= 0 && filteredStocks[highlightIdx]) {
                      const hit = filteredStocks[highlightIdx]
                      setSymbol(hit.code); setSelectedStock(hit); setQuery(`${hit.nameZh}（${hit.code}）`); setIsFocused(false)
                    }
                  }
                  if (e.key === 'Escape') { setIsFocused(false) }
                }}
                disabled={isRunning}
              />
              {isFocused && (
                <div ref={dropdownRef} className="max-h-56 overflow-auto border rounded shadow bg-card">
                  {filteredStocks.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">未找到结果</div>
                  ) : (
                    filteredStocks.map((it, idx) => (
                      <button
                        type="button"
                        key={it.code}
                        onMouseDown={(e)=>{ e.preventDefault(); setSymbol(it.code); setSelectedStock(it); setQuery(`${it.nameZh}（${it.code}）`); setIsFocused(false) }}
                        className={`w-full text-left px-2 py-1 text-xs hover:bg-muted flex items-center justify-between ${idx===highlightIdx?'bg-muted/60':''}`}
                        disabled={isRunning}
                      >
                        <span>{it.nameZh}（{it.code}）</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground">当前选择：{symbol || '未选择'}</div>
            </div>
          </div>

          {/* 策略信息预览 */}
          <div className="space-y-4">
            <div className="text-sm font-medium">策略信息</div>
            <div className="bg-muted p-3 rounded-md text-xs space-y-1">
              <div><span className="font-medium">策略名称:</span> {strategy.name}</div>
              <div><span className="font-medium">节点数量:</span> {strategy.strategy?.nodes?.length || 0} 个</div>
              <div><span className="font-medium">策略描述:</span> {strategy.description}</div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isRunning}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={handleRunBacktest}
              disabled={isRunning}
              className="flex-1"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  运行中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  开始回测
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
