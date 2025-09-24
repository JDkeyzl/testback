import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useStrategyListStore } from '../store/strategyListStore'
import { strategyLibrary } from '../data/strategyLibrary'
import { useBacktestHistoryStore } from '../store/backtestHistoryStore'
import { useSymbolBatchStore } from '../store/symbolBatchStore'
import { useSymbolPageState } from '../store/symbolPageStateStore'
import { BarChart3, Play, Loader2, RefreshCw } from 'lucide-react'
import { formatTradesWithFees as fmtTradesFees, computeMetricsFromTrades as computeFromTrades, buildDailyAssetsFromRows, computeMetricsFromAssets as computeFromAssets } from '../utils/metrics'

export function SymbolBacktestPage() {
  const navigate = useNavigate()
  const { strategies } = useStrategyListStore()
  const { addRecord } = useBacktestHistoryStore()
  const batchStore = useSymbolBatchStore()
  const { state: pg, setState: setPg } = useSymbolPageState()

  const [sources, setSources] = useState([])
  const [symbol, setSymbol] = useState('')
  const [stockList, setStockList] = useState([])
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)
  const [selectedStock, setSelectedStock] = useState(null)
  const [timeframe, setTimeframe] = useState('1d')
  const [startDate, setStartDate] = useState('2025-01-01')
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0,10))
  const [initialCapital, setInitialCapital] = useState(100000)
  const [selectedIds, setSelectedIds] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [status, setStatus] = useState('')
  const [results, setResults] = useState([])
  // 页面状态恢复（只在首次渲染时执行一次）
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      if (pg?.symbol) setSymbol(pg.symbol)
      if (pg?.symbolName && pg?.symbol) setSelectedStock({ nameZh: pg.symbolName, code: pg.symbol, codeFull: pg.symbol })
      if (pg?.query) setQuery(pg.query)
      if (pg?.timeframe) setTimeframe(pg.timeframe)
      if (pg?.startDate) setStartDate(pg.startDate)
      if (pg?.endDate) setEndDate(pg.endDate)
      if (pg?.initialCapital) setInitialCapital(pg.initialCapital)
    } catch {}
  }, [pg])

  // 恢复当前标的的最近一次批量结果
  useEffect(() => {
    try {
      if (!symbol) return
      const pack = batchStore.getResultsFor(symbol)
      if (pack && Array.isArray(pack.results) && pack.results.length > 0) {
        setResults(pack.results)
        const p = pack.params || {}
        if (p.timeframe) setTimeframe(p.timeframe)
        if (p.initialCapital) setInitialCapital(p.initialCapital)
      } else {
        setResults([])
      }
    } catch {}
  }, [symbol])

  // 加载数据源（仅初始化一次；避免因 symbol/query 等状态变化导致重复请求）
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/v1/data/sources')
        if (r.ok) {
          const data = await r.json()
          const arr = Array.isArray(data?.sources) ? data.sources : []
          setSources(arr)
          // 仅在没有已恢复的 symbol 时设置默认值，避免覆盖用户选择
          if (arr.length && !symbol && !(pg && pg.symbol)) setSymbol(arr[0].symbol)
        }
      } catch {}
    })()
  }, [])

  // 加载本地股票字典
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
          // 静态资源兜底
          const r2 = await fetch('/data/stockList/all_pure_stock.json')
          if (r2.ok) {
            const data2 = await r2.json()
            setStockList(Array.isArray(data2) ? data2 : [])
          }
        }
      } catch {}
    })()
  }, [])

  // 生成本地CSV集合用于标记
  const localCsvSet = useMemo(() => new Set((sources || []).map(s => String(s.symbol))), [sources])

  // 防抖处理查询
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 180)
    return () => clearTimeout(t)
  }, [query])

  const normalizedStocks = useMemo(() => {
    // 归一化字段（尽可能兼容不同字典格式）
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
      const hasLocalCsv = localCsvSet.has(code)
      return { nameZh, code, codeFull, hasLocalCsv }
    }).filter(it => it.nameZh && it.code)
  }, [stockList, localCsvSet])

  const filteredStocks = useMemo(() => {
    const q = (debouncedQuery || '').trim().toLowerCase()
    let arr = normalizedStocks
    if (q) {
      const parts = q.split(/\s+/).filter(Boolean)
      arr = arr.filter(it => {
        const name = it.nameZh.toLowerCase()
        const code = it.code.toLowerCase()
        return parts.every(p => name.includes(p) || code.includes(p))
      })
      // 简单排序：完整匹配>前缀匹配>包含；本地CSV优先
      arr.sort((a,b) => {
        const exactA = (a.code === q) ? 1 : 0
        const exactB = (b.code === q) ? 1 : 0
        if (exactA !== exactB) return exactB - exactA
        const prefA = a.code.startsWith(q) ? 1 : 0
        const prefB = b.code.startsWith(q) ? 1 : 0
        if (prefA !== prefB) return prefB - prefA
        if (a.hasLocalCsv !== b.hasLocalCsv) return (b.hasLocalCsv?1:0) - (a.hasLocalCsv?1:0)
        return 0
      })
    } else {
      // 无查询时，优先展示本地CSV靠前
      arr = [...arr].sort((a,b) => (b.hasLocalCsv?1:0)-(a.hasLocalCsv?1:0))
    }
    return arr.slice(0, 50)
  }, [debouncedQuery, normalizedStocks])

  // 保证显示名称、选中项与 symbol 对齐（防止 query 显示与实际 symbol 不一致）
  useEffect(() => {
    if (!symbol) return
    const hit = normalizedStocks.find(it => it.code === symbol)
    if (hit) {
      setSelectedStock(hit)
      const label = `${hit.nameZh}（${hit.code}）`
      // 仅在输入框未聚焦时，同步显示名称，避免覆盖用户正在输入的搜索词
      if (!isFocused && query !== label) setQuery(label)
      try { setPg({ symbol: hit.code, symbolName: hit.nameZh, query: isFocused ? query : label }) } catch {}
    }
  }, [symbol, normalizedStocks, isFocused])

  // 失焦延时隐藏，避免点击项时提前关闭
  const handleBlur = useCallback(() => {
    setTimeout(() => setIsFocused(false), 100)
  }, [])

  const allStrategies = useMemo(() => {
    return [
      ...(strategies || []),
      ...(strategyLibrary || [])
    ]
  }, [strategies])

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(allStrategies.map(s => s.id))
  }, [allStrategies])

  const clearAll = useCallback(() => setSelectedIds([]), [])

  const runBatch = useCallback(async () => {
    if (!symbol || !timeframe || !startDate || !endDate || initialCapital <= 0) {
      alert('请完整填写表单')
      return
    }
    const toRun = allStrategies.filter(s => selectedIds.includes(s.id))
    if (toRun.length === 0) {
      alert('请至少选择一个策略')
      return
    }
    setIsRunning(true)
    setResults([])
    try {
      let completed = 0
      for (const s of toRun) {
        setStatus(`正在回测：${s.name} (${completed+1}/${toRun.length})`)
        // 夹取 endDate 到数据末日
        let usedEnd = endDate
        try {
          const infoRes = await fetch(`/api/v1/data/info/${symbol}`)
          if (infoRes.ok) {
            const info = await infoRes.json()
            const lastDataDate = String(info?.end_date || '').split(' ')[0]
            if (lastDataDate) usedEnd = usedEnd && usedEnd > lastDataDate ? lastDataDate : usedEnd
          }
        } catch {}

        const t0 = Date.now()
        const resp = await fetch('/api/v1/backtest/stocks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strategy: s.strategy,
            symbol,
            timeframe,
            startDate,
            endDate: usedEnd,
            initialCapital,
            strategyId: s.id
          })
        })
        const elapsedMs = Date.now() - t0
        if (resp.ok) {
          const result = await resp.json()
          // 构建资产序列（资产口径）
          const priceSeries = Array.isArray(result.price_series) ? result.price_series : []
          const dailyMap = new Map()
          for (const p of priceSeries) {
            const ts = p.timestamp || p.date || ''
            const d = String(ts).split(' ')[0]
            dailyMap.set(d, Number(p.close))
          }
          const dailyPrices = []
          for (const [date, close] of dailyMap.entries()) dailyPrices.push({ date, close })
          const rows = fmtTradesFees(result.trades || [], initialCapital)
          const dailyAssets = buildDailyAssetsFromRows(rows, dailyPrices, startDate, usedEnd, initialCapital)
          const assetsMetrics = computeFromAssets(dailyAssets)
          const totalReturn = assetsMetrics.totalReturn
          const maxDrawdown = assetsMetrics.maxDrawdown
          // 胜率/交易次数继续按成交口径
          const metrics = computeFromTrades(rows)
          const winRate = metrics.winRate
          const totalTrades = metrics.totalTrades
          const finalEquity = Number((initialCapital * (1 + totalReturn)).toFixed(2))
          const symbolLabel = `${selectedStock?.nameZh || symbol}（${symbol}）`
          const row = {
            strategyId: s.id,
            strategyName: s.name,
            symbol,
            symbolLabel,
            totalReturn,
            maxDrawdown,
            winRate,
            totalTrades,
            elapsedMs,
            backtestParams: { strategyId: s.id, strategy: s.strategy, symbol, timeframe, startDate, endDate: usedEnd, initialCapital },
            rawResult: result
          }
          setResults(prev => {
            const next = [...prev, row].sort((a,b) => b.totalReturn - a.totalReturn)
            try { batchStore.setResultsFor(symbol, next, { symbol, symbolName: selectedStock?.nameZh, timeframe, startDate, endDate: usedEnd, initialCapital }) } catch {}
            return next
          })
          try {
            addRecord({
              strategyId: s.id,
              strategyName: s.name,
              params: { ...row.backtestParams, symbolName: selectedStock?.nameZh },
              summary: { totalReturn, maxDrawdown, winRate, totalTrades, finalEquity },
              links: { toResultRoute: `/backtest/${s.id}` },
              meta: { symbol, symbolName: selectedStock?.nameZh }
            })
          } catch {}
        } else {
          const err = await resp.text()
          console.error('批量回测失败', s.name, err)
        }
        completed += 1
      }
      setStatus('批量回测完成')
    } catch (e) {
      console.error(e)
      alert('批量回测失败：' + (e?.message || e))
    } finally {
      setIsRunning(false)
    }
  }, [symbol, timeframe, startDate, endDate, initialCapital, allStrategies, selectedIds, addRecord])

  return (
    <div className="container mx-auto px-4 py-6">
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />股票回测</CardTitle>
              <CardDescription>先选择数据源（标的），再批量选择策略进行回测</CardDescription>
            </div>
            <div>
              <Button size="sm" variant="outline" onClick={() => navigate('/futures-backtest')}>期货回测</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">选择股票（可搜索）</Label>
              <Input
                ref={inputRef}
                className="text-xs mb-2"
                placeholder="输入中文名或代码搜索..."
                value={query}
                onChange={e=>{ setQuery(e.target.value); setPg({ query: e.target.value }); setHighlightIdx(-1) }}
                onFocus={()=>setIsFocused(true)}
                onBlur={handleBlur}
                onKeyDown={(e)=>{
                  if (!isFocused) return
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i=>Math.min((i<0? -1:i)+1, filteredStocks.length-1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i=>Math.max((i<=0? 0:i)-1, 0)) }
                  if (e.key === 'Enter') {
                    if (highlightIdx >= 0 && filteredStocks[highlightIdx]) {
                      const hit = filteredStocks[highlightIdx]
                      setSymbol(hit.code)
                      setSelectedStock(hit)
                      setQuery(`${hit.nameZh}（${hit.code}）`)
                      setPg({ symbol: hit.code, symbolName: hit.nameZh, query: `${hit.nameZh}（${hit.code}）` })
                      setIsFocused(false)
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
                        onMouseDown={(e)=>{ e.preventDefault(); setSymbol(it.code); setSelectedStock(it); setQuery(`${it.nameZh}（${it.code}）`); setPg({ symbol: it.code, symbolName: it.nameZh, query: `${it.nameZh}（${it.code}）` }); setIsFocused(false) }}
                        className={`w-full text-left px-2 py-1 text-xs hover:bg-muted flex items-center justify-between ${idx===highlightIdx?'bg-muted/60':''}`}
                        disabled={isRunning}
                      >
                        <span>{it.nameZh}（{it.code}）</span>
                        {it.hasLocalCsv && <span className="text-[10px] text-muted-foreground">本地CSV</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground mt-1">当前选择：{symbol || '未选择'}</div>
            </div>
            <div>
              <Label className="text-xs">时间周期</Label>
              <select className="w-full px-3 py-2 text-xs border rounded-md" value={timeframe} onChange={e=>{ setTimeframe(e.target.value); setPg({ timeframe: e.target.value }) }} disabled={isRunning}>
                <option value="1m">1分钟</option>
                <option value="5m">5分钟</option>
                <option value="15m">15分钟</option>
                <option value="30m">30分钟</option>
                <option value="1h">1小时</option>
                <option value="4h">4小时</option>
                <option value="1d">1天</option>
                <option value="1w">1周</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">开始日期</Label>
              <Input type="date" value={startDate} onChange={e=>{ setStartDate(e.target.value); setPg({ startDate: e.target.value }) }} disabled={isRunning} className="text-xs" />
            </div>
            <div>
              <Label className="text-xs">结束日期</Label>
              <Input type="date" value={endDate} onChange={e=>{ setEndDate(e.target.value); setPg({ endDate: e.target.value }) }} disabled={isRunning} className="text-xs" />
            </div>
            <div>
              <Label className="text-xs">初始资金</Label>
              <Input type="number" value={initialCapital} onChange={e=>{ const v = Number(e.target.value); setInitialCapital(v); setPg({ initialCapital: v }) }} disabled={isRunning} className="text-xs" />
            </div>
          </div>

          <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] text-muted-foreground">若本地无所选股票CSV，可尝试一键拉取</div>
              <Button size="sm" variant="outline" disabled={!selectedStock || isRunning} onClick={async () => {
                try {
                  setStatus('正在拉取数据...')
                  // 统一以当前选择的 symbol 推导 codeFull，避免字典中的 codeFull 误配
                  const codeFull = (symbol && symbol.startsWith('6')) ? `sh.${symbol}` : `sz.${symbol}`
                  const res = await fetch('/api/v1/data/fetch', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ codeFull, name: selectedStock?.nameZh || symbol, startDate, endDate, timeframe })
                  })
                  const raw = await res.text()
                  let data = null
                  try { data = raw ? JSON.parse(raw) : null } catch {}
                  if (!res.ok || !(data && data.ok)) {
                    const msg = (data && (data.detail || data.error)) || `${res.status} ${res.statusText}`
                    throw new Error(msg)
                  }
                  alert('拉取完成：' + (data.csv || ''))
                  // 刷新本地数据源列表
                  try {
                    const refresh = await fetch('/api/v1/data/sources')
                    if (refresh.ok) {
                      const d = await refresh.json()
                      setSources(Array.isArray(d?.sources) ? d.sources : [])
                    }
                  } catch {}
                } catch (e) {
                  alert('拉取失败：' + (e?.message || e))
                } finally {
                  setStatus('')
                }
              }}>一键拉取数据</Button>
            </div>
            {/* 移除“拉取期货数据”按钮（股票页不提供期货入口） */}
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">选择策略（我的策略 + 策略库）</div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={selectAll} disabled={isRunning}>全选</Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    const ids = allStrategies.map(s => s.id)
                    setSelectedIds(ids)
                    // 直接开始回测（等同全选+开始）
                    await (async () => {
                      if (!symbol || !timeframe || !startDate || !endDate || initialCapital <= 0) {
                        alert('请完整填写表单')
                        return
                      }
                      const toRun = allStrategies.filter(s => ids.includes(s.id))
                      if (toRun.length === 0) { alert('请至少选择一个策略'); return }
                      setIsRunning(true)
                      setResults([])
                      try {
                        let completed = 0
                        for (const s of toRun) {
                          setStatus(`正在回测：${s.name} (${completed+1}/${toRun.length})`)
                          let usedEnd = endDate
                          try {
                            const infoRes = await fetch(`/api/v1/data/info/${symbol}`)
                            if (infoRes.ok) {
                              const info = await infoRes.json()
                              const lastDataDate = String(info?.end_date || '').split(' ')[0]
                              if (lastDataDate) usedEnd = usedEnd && usedEnd > lastDataDate ? lastDataDate : usedEnd
                            }
                          } catch {}
                          const t0 = Date.now()
                          const resp = await fetch('/api/v1/backtest/stocks', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ strategy: s.strategy, symbol, timeframe, startDate, endDate: usedEnd, initialCapital, strategyId: s.id })
                          })
                          const elapsedMs = Date.now() - t0
                          if (resp.ok) {
                            const result = await resp.json()
                            const priceSeries = Array.isArray(result.price_series) ? result.price_series : []
                            const dailyMap = new Map()
                            for (const p of priceSeries) { const ts = p.timestamp || p.date || ''; const d = String(ts).split(' ')[0]; dailyMap.set(d, Number(p.close)) }
                            const dailyPrices = []; for (const [date, close] of dailyMap.entries()) dailyPrices.push({ date, close })
                            const rows = fmtTradesFees(result.trades || [], initialCapital)
                            const dailyAssets = buildDailyAssetsFromRows(rows, dailyPrices, startDate, usedEnd, initialCapital)
                            const assetsMetrics = computeFromAssets(dailyAssets)
                            const totalReturn = assetsMetrics.totalReturn
                            const maxDrawdown = assetsMetrics.maxDrawdown
                            const metrics = computeFromTrades(rows)
                            const winRate = metrics.winRate
                            const totalTrades = metrics.totalTrades
                            const finalEquity = Number((initialCapital * (1 + totalReturn)).toFixed(2))
                            const symbolLabel = `${selectedStock?.nameZh || symbol}（${symbol}）`
                            const row = { strategyId: s.id, strategyName: s.name, symbol, symbolLabel, totalReturn, maxDrawdown, winRate, totalTrades, elapsedMs, backtestParams: { strategyId: s.id, strategy: s.strategy, symbol, timeframe, startDate, endDate: usedEnd, initialCapital }, rawResult: result }
                            setResults(prev => {
                              const next = [...prev, row].sort((a,b) => b.totalReturn - a.totalReturn)
                              try { batchStore.setResultsFor(symbol, next, { symbol, symbolName: selectedStock?.nameZh, timeframe, startDate, endDate: usedEnd, initialCapital }) } catch {}
                              return next
                            })
                            try { addRecord({ strategyId: s.id, strategyName: s.name, params: { ...row.backtestParams, symbolName: selectedStock?.nameZh }, summary: { totalReturn, maxDrawdown, winRate, totalTrades, finalEquity }, links: { toResultRoute: `/backtest/${s.id}` }, meta: { symbol, symbolName: selectedStock?.nameZh } }) } catch {}
                          } else {
                            const err = await resp.text(); console.error('批量回测失败', s.name, err)
                          }
                          completed += 1
                        }
                        setStatus('批量回测完成')
                      } catch (e) {
                        console.error(e); alert('批量回测失败：' + (e?.message || e))
                      } finally { setIsRunning(false); setStatus('') }
                    })()
                  }}
                  disabled={isRunning}
                  className="bg-primary text-primary-foreground"
                >一键测所有</Button>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {allStrategies.map(s => (
                <label key={s.id} className="flex items-center gap-2 border rounded-md p-2 hover:bg-muted/40">
                  <input type="checkbox" className="h-4 w-4" checked={selectedIds.includes(s.id)} onChange={() => toggleSelect(s.id)} disabled={isRunning} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={runBatch} disabled={isRunning || !symbol}>
              {isRunning ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />运行中...</>) : (<><Play className="h-4 w-4 mr-2" />开始批量回测</>)}
            </Button>
            {status && (<div className="text-sm text-muted-foreground">{status}</div>)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>本次回测结果</CardTitle>
          <CardDescription>默认按收益率从高到低排序</CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无结果</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-3">策略名称</th>
                    <th className="py-2 pr-3">收益率</th>
                    <th className="py-2 pr-3">最大回撤</th>
                    <th className="py-2 pr-3">胜率</th>
                    <th className="py-2 pr-3">交易次数</th>
                    <th className="py-2 pr-3">用时(ms)</th>
                    <th className="py-2 pr-3">查看</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.strategyId} className="border-b last:border-0">
                      <td className="py-2 pr-3">{r.strategyName}</td>
                      <td className={`py-2 pr-3 ${r.totalReturn>0?'text-red-600':(r.totalReturn<0?'text-green-600':'text-muted-foreground')}`}>{(r.totalReturn*100).toFixed(2)}%</td>
                      <td className="py-2 pr-3 text-green-600">{(r.maxDrawdown*100).toFixed(2)}%</td>
                      <td className="py-2 pr-3 text-blue-600">{(r.winRate*100).toFixed(2)}%</td>
                      <td className="py-2 pr-3">{r.totalTrades}</td>
                      <td className="py-2 pr-3">{r.elapsedMs}</td>
                      <td className="py-2 pr-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // 清理 state 中的函数，避免 History.pushState 克隆失败
                            const stripFns = (o) => {
                              if (Array.isArray(o)) return o.map(stripFns)
                              if (o && typeof o === 'object') {
                                const out = {}
                                for (const k in o) {
                                  const v = o[k]
                                  if (typeof v === 'function') continue
                                  out[k] = stripFns(v)
                                }
                                return out
                              }
                              return o
                            }
                            navigate(`/backtest/${r.strategyId}`, {
                              state: stripFns({ useHistorySnapshot: true, rawResult: r.rawResult, backtestParams: r.backtestParams, from: '/symbol-backtest' })
                            })
                          }}
                        >查看详情</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}


