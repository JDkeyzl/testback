import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useStrategyListStore } from '../store/strategyListStore'
import { strategyLibrary } from '../data/strategyLibrary'
import { useBacktestHistoryStore } from '../store/backtestHistoryStore'
import { useFuturesBatchStore } from '../store/futuresBatchStore'
import { Play, Loader2 } from 'lucide-react'
import { formatTradesWithFees as fmtTradesFees, computeMetricsFromTrades as computeFromTrades, buildDailyAssetsFromRows, computeMetricsFromAssets as computeFromAssets } from '../utils/metrics'

export function FuturesBacktestPage() {
  const navigate = useNavigate()
  const { strategies } = useStrategyListStore()
  const { addRecord } = useBacktestHistoryStore()
  const batchStore = useFuturesBatchStore()

  const [sources, setSources] = useState([])
  const [contract, setContract] = useState('p2601')
  const [timeframe, setTimeframe] = useState('5m')
  const [startDate, setStartDate] = useState('2025-01-01')
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0,10))
  const [initialCapital, setInitialCapital] = useState(100000)
  const [selectedIds, setSelectedIds] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [status, setStatus] = useState('')
  const [results, setResults] = useState([])
  const [contracts, setContracts] = useState([])
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)

  // 恢复该合约最近一次批量结果
  useEffect(() => {
    try {
      if (!contract) return
      const pack = batchStore.getResultsFor(contract)
      if (pack && Array.isArray(pack.results) && pack.results.length > 0) {
        setResults(pack.results)
        const p = pack.params || {}
        if (p.timeframe) setTimeframe(p.timeframe)
        if (p.initialCapital) setInitialCapital(p.initialCapital)
      } else {
        setResults([])
      }
    } catch {}
  }, [contract])

  // 加载本地数据源（CSV）
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/v1/data/sources')
        if (r.ok) {
          const data = await r.json()
          const arr = Array.isArray(data?.sources) ? data.sources : []
          setSources(arr)
        }
      } catch {}
    })()
  }, [])

  // 加载期货合约字典（本地缓存）
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/v1/futures/contracts')
        if (r.ok) {
          const data = await r.json()
          setContracts(Array.isArray(data?.list) ? data.list : [])
        }
      } catch {}
    })()
  }, [])

  // 合约搜索过滤
  const filteredContracts = useMemo(() => {
    const q = (query || '').trim().toLowerCase()
    if (!q) return contracts
    return contracts.filter(c => (
      String(c.symbol || '').toLowerCase().includes(q) ||
      String(c.name || '').toLowerCase().includes(q)
    )).slice(0, 80)
  }, [contracts, query])

  const allStrategies = useMemo(() => {
    return [
      ...(strategies || []),
      ...(strategyLibrary || [])
    ]
  }, [strategies])

  const toggleSelect = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const selectAll = () => setSelectedIds(allStrategies.map(s => s.id))
  // 移除“全不选”按钮需求后，仍保留内部函数供一键测所有逻辑需要时使用
  const clearAll = () => setSelectedIds([])

  async function runBatch() {
    if (!contract || selectedIds.length === 0) return
    setIsRunning(true)
    setStatus('正在回测...')
    const t0 = performance.now()
    try {
      // 逐策略请求后端回测
      const rows = []
      for (const sid of selectedIds) {
        const strat = allStrategies.find(s => s.id === sid)
        if (!strat) continue
        const body = {
          symbol: contract, // 使用合约代码匹配CSV（如 p2601_futures_5m.csv）
          timeframe,
          startDate,
          endDate,
          initialCapital,
          strategy: strat.strategy || strat
        }
        const res = await fetch('/api/v1/backtest/futures', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.detail || '回测失败')

        // 期货口径：统一以“实际交易记录”为准（仅依据成交回合，不使用权益曲线）
        const trades = Array.isArray(data?.trades) ? data.trades : []
        const initial = Number(data?.initial_capital ?? initialCapital) || 0
        // 构建“按卖出日累计盈亏”的资产序列
        const dayPnL = new Map()
        for (const t of trades) {
          if (String(t?.action) !== 'sell') continue
          const d = String(t?.timestamp || t?.date || '').slice(0,10)
          const v = Number(t?.pnl || 0)
          dayPnL.set(d, (dayPnL.get(d) || 0) + v)
        }
        const series = Array.from(dayPnL.entries()).sort((a,b)=>a[0].localeCompare(b[0]))
        let acc = initial
        const assets = []
        for (const [d, pnl] of series) {
          acc += pnl
          assets.push({ date: d, totalAssets: acc })
        }
        const lastEq = assets.length ? assets[assets.length-1].totalAssets : initial
        const totalReturn = initial > 0 ? (lastEq - initial) / initial : 0
        const maxDrawdown = (() => {
          if (!assets.length) return 0
          let peak = assets[0].totalAssets
          let mdd = 0
          for (const a of assets) {
            const v = a.totalAssets
            if (v > peak) peak = v
            const dd = peak > 0 ? (peak - v) / peak : 0
            if (dd > mdd) mdd = dd
          }
          return mdd
        })()
        const sellTrades = trades.filter(t => String(t?.action) === 'sell' && t?.pnl != null)
        const wins = sellTrades.filter(t => Number(t.pnl) > 0).length
        const winRate = sellTrades.length ? (wins / sellTrades.length) : 0
        const totalTrades = sellTrades.length // 回合数=卖出笔数

        rows.push({
          strategyId: sid,
          strategyName: strat.name || strat.title || '未命名策略',
          totalReturn: totalReturn || 0,
          maxDrawdown: maxDrawdown || 0,
          winRate: winRate || 0,
          totalTrades: totalTrades || 0,
          elapsedMs: Math.round((performance.now() - t0)),
          backtestParams: { 
            symbol: contract, 
            timeframe, 
            startDate, 
            endDate, 
            initialCapital,
            strategyId: sid,
            strategy: strat.strategy || strat,
            name: strat.name || strat.title || '未命名策略'
          },
          symbol: contract,
          symbolLabel: contract,
          rawResult: data
        })
      }
      rows.sort((a,b)=> (b.totalReturn - a.totalReturn))
      setResults(rows)
      try { batchStore.setResultsFor(contract, rows, { timeframe, startDate, endDate, initialCapital }) } catch {}
    } catch (e) {
      alert('回测失败：' + (e?.message || e))
    } finally {
      setIsRunning(false)
      setStatus('')
    }
  }

  return (
    <div className="container mx-auto max-w-6xl p-4">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>期货回测</CardTitle>
          <CardDescription>支持 AkShare 拉取分钟线，保存为 CSV 后直接回测</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label className="text-xs">合约代码（可搜索）</Label>
              <Input
                ref={inputRef}
                className="text-xs mb-2"
                placeholder="输入合约或中文名搜索..."
                value={query}
                onChange={e=>{ setQuery(e.target.value); setHighlightIdx(-1) }}
                onFocus={()=>setIsFocused(true)}
                onBlur={(e)=>{
                  if (!dropdownRef.current || dropdownRef.current.contains(e.relatedTarget)) return
                  setIsFocused(false)
                }}
                onKeyDown={(e)=>{
                  if (!isFocused) return
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i=>Math.min((i<0? -1:i)+1, filteredContracts.length-1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i=>Math.max((i<=0? 0:i)-1, 0)) }
                  if (e.key === 'Enter') {
                    if (highlightIdx >= 0 && filteredContracts[highlightIdx]) {
                      const hit = filteredContracts[highlightIdx]
                      setContract(hit.symbol)
                      setQuery(`${hit.symbol}${hit.name?`（${hit.name}）`:''}`)
                      setIsFocused(false)
                    }
                  }
                  if (e.key === 'Escape') { setIsFocused(false) }
                }}
                disabled={isRunning}
              />
              {isFocused && (
                <div ref={dropdownRef} className="max-h-56 overflow-auto border rounded shadow bg-card">
                  {filteredContracts.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">未找到结果</div>
                  ) : (
                    filteredContracts.map((it, idx) => (
                      <button
                        type="button"
                        key={it.symbol}
                        onMouseDown={(e)=>{ e.preventDefault(); setContract(it.symbol); setQuery(`${it.symbol}${it.name?`（${it.name}）`:''}`); setIsFocused(false) }}
                        className={`w-full text-left px-2 py-1 text-xs hover:bg-muted flex items-center justify-between ${idx===highlightIdx?'bg-muted/60':''}`}
                        disabled={isRunning}
                      >
                        <span>{it.symbol}{it.name?`（${it.name}）`:''}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground mt-1">示例：p2601（棕榈油）</div>
            </div>
            <div>
              <Label className="text-xs">时间周期</Label>
              <select className="w-full px-3 py-2 text-xs border rounded-md" value={timeframe} onChange={e=>setTimeframe(e.target.value)} disabled={isRunning}>
                <option value="1m">1分钟</option>
                <option value="5m">5分钟</option>
                <option value="15m">15分钟</option>
                <option value="30m">30分钟</option>
                <option value="1h">60分钟</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">开始日期</Label>
              <Input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} disabled={isRunning} className="text-xs" />
            </div>
            <div>
              <Label className="text-xs">结束日期</Label>
              <Input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} disabled={isRunning} className="text-xs" />
            </div>
            <div>
              <Label className="text-xs">初始资金</Label>
              <Input type="number" value={initialCapital} onChange={e=>setInitialCapital(Number(e.target.value))} disabled={isRunning} className="text-xs" />
            </div>
          </div>

          <div className="mt-2">
            {/* 去掉期货页的一键拉取数据按钮（仅保留回测功能） */}

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
                    await runBatch()
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
            <Button onClick={runBatch} disabled={isRunning || !contract}>
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
                        <Button size="sm" variant="outline" onClick={() => navigate(`/backtest/${r.strategyId}`, { state: { useHistorySnapshot: true, rawResult: r.rawResult, backtestParams: r.backtestParams, from: '/futures-backtest' } })}>查看详情</Button>
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


