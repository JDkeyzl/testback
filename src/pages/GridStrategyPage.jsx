import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { ChartCanvas, Chart, CandlestickSeries, XAxis as FXAxis, YAxis as FYAxis, MouseCoordinateX, MouseCoordinateY, OHLCTooltip, ZoomButtons, discontinuousTimeScaleProvider, lastVisibleItemBasedZoomAnchor, PriceCoordinate, CrossHairCursor, CurrentCoordinate, EdgeIndicator, HoverTooltip } from 'react-financial-charts'
import { timeFormat as d3TimeFormat, timeParse as d3TimeParse } from 'd3-time-format'
import { format as d3Format } from 'd3-format'

export function GridStrategyPage() {
  const [symbol, setSymbol] = useState('002385')
  // 搜索选择框状态（复用股票页交互）
  const [stockList, setStockList] = useState([])
  const [futuresList, setFuturesList] = useState([])
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [timeframe, setTimeframe] = useState('5m')
  const [rangeStart, setRangeStart] = useState('2025-04-01')
  const [rangeEnd, setRangeEnd] = useState('2025-04-30')

  const [trainStart, setTrainStart] = useState('2025-04-01')
  const [trainEnd, setTrainEnd] = useState('2025-04-30')
  const [testStart, setTestStart] = useState('2025-05-01')
  const [testEnd, setTestEnd] = useState('2025-05-31')

  // Grid params
  const [gridBottom, setGridBottom] = useState('')
  const [gridTop, setGridTop] = useState('')
  const [numGrids, setNumGrids] = useState(10)
  const [positionMode, setPositionMode] = useState('quarter') // full/half/third/quarter
  const [lotSize, setLotSize] = useState(100)
  const [useTrend, setUseTrend] = useState(true)
  const [useVol, setUseVol] = useState(true)
  const [stopPrice, setStopPrice] = useState('')
  const [stopPct, setStopPct] = useState(5)
  const [stopDays, setStopDays] = useState(0)
  const [initialCapital, setInitialCapital] = useState(100000)

  const [rawSeries, setRawSeries] = useState([]) // [{timestamp, open, high, low, close}]
  // 是否需要因周期不兼容而提示重新拉取（由计算过程给出，不在渲染期 setState）

  // 工具：解析时间戳
  const parseTs = useCallback((ts) => {
    if (!ts) return null
    const s = String(ts)
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }, [])

  // 计算分钟差
  const minuteDiff = useCallback((a, b) => {
    return Math.abs((b.getTime() - a.getTime()) / 60000)
  }, [])

  // 识别基础粒度（返回 { kind: 'day' | 'min', step: number }）
  const detectBaseGranularity = useCallback((series) => {
    if (!series || series.length < 2) return { kind: 'day', step: 1 }
    const d1 = parseTs(series[0].timestamp)
    let i = 1
    while (i < series.length && !parseTs(series[i].timestamp)) i++
    if (i >= series.length || !d1) return { kind: 'day', step: 1 }
    const d2 = parseTs(series[i].timestamp)
    const md = minuteDiff(d1, d2)
    if (md >= 23 * 60) return { kind: 'day', step: 1 }
    // 常见步长取整
    const steps = [1, 5, 15, 30, 60]
    const step = steps.reduce((best, s) => Math.abs(md - s) < Math.abs(md - best) ? s : best, 5)
    return { kind: 'min', step }
  }, [parseTs, minuteDiff])

  // 时间桶：将时间归到目标粒度
  const floorToBucket = useCallback((date, tf) => {
    const d = new Date(date)
    if (tf === '1d' || tf === 'day') {
      d.setHours(0, 0, 0, 0)
      return d
    }
    const map = { '5m': 5, '15m': 15, '30m': 30, '1h': 60 }
    const minutes = map[tf] || 5
    const m = d.getMinutes()
    const floored = Math.floor(m / minutes) * minutes
    d.setMinutes(floored, 0, 0)
    return d
  }, [])

  // 聚合到目标周期（仅支持从分钟合并到更大分钟/日，或分钟->日；日->更小分钟不支持）
  const aggregateSeries = useCallback((series, targetTF, base) => {
    if (!series || !series.length) return []
    const tf = targetTF === '1h' ? '1h' : (targetTF === '1d' ? '1d' : targetTF)
    // 日线目标
    if (tf === '1d' || tf === 'day') {
      // 分钟->日 or 日->日
      const groups = new Map()
      for (const p of series) {
        const dt = parseTs(p.timestamp); if (!dt) continue
        const key = floorToBucket(dt, '1d').toISOString()
        const g = groups.get(key) || { open: null, high: -Infinity, low: Infinity, close: null, ts: null }
        if (g.open == null) g.open = p.open
        if (p.high > g.high) g.high = p.high
        if (p.low < g.low) g.low = p.low
        g.close = p.close
        g.ts = p.timestamp
        groups.set(key, g)
      }
      return Array.from(groups.entries()).sort((a,b)=> a[0]<b[0]? -1:1).map(([_, g]) => ({
        timestamp: g.ts, open: g.open, high: g.high, low: g.low, close: g.close
      }))
    }
    // 目标为分钟
    const targetMap = { '5m': 5, '15m': 15, '30m': 30, '1h': 60 }
    const targetStep = targetMap[tf] || 5
    if (base.kind === 'day') return null // 无法从日聚合到分钟
    if (base.kind === 'min' && base.step > targetStep) return null // 无法下采样
    // 分钟合并到更大分钟
    const groups = new Map()
    const formatLocalHM = (d) => {
      const y = d.getFullYear()
      const m = String(d.getMonth()+1).padStart(2,'0')
      const day = String(d.getDate()).padStart(2,'0')
      const hh = String(d.getHours()).padStart(2,'0')
      const mm = String(d.getMinutes()).padStart(2,'0')
      return `${y}-${m}-${day} ${hh}:${mm}`
    }
    for (const p of series) {
      const dt = parseTs(p.timestamp); if (!dt) continue
      const bucketStart = floorToBucket(dt, tf)
      const key = bucketStart.getTime()
      const g = groups.get(key) || { open: null, high: -Infinity, low: Infinity, close: null, start: bucketStart }
      if (g.open == null) g.open = p.open
      if (p.high > g.high) g.high = p.high
      if (p.low < g.low) g.low = p.low
      g.close = p.close
      // 统一将聚合后的时间标记为桶的"右端"时间（例如 13:00-13:59 聚合为 14:00）
      const bucketEnd = new Date(bucketStart.getTime() + targetStep * 60000)
      g.ts = formatLocalHM(bucketEnd)
      groups.set(key, g)
    }
    return Array.from(groups.entries()).sort((a,b)=> Number(a[0]) - Number(b[0])).map(([_, g]) => ({
      timestamp: g.ts, open: g.open, high: g.high, low: g.low, close: g.close
    }))
  }, [parseTs, floorToBucket])
  const { displaySeries, needTFRefetch } = useMemo(() => {
    if (!rawSeries || !rawSeries.length) return { displaySeries: [], needTFRefetch: false }
    const base = detectBaseGranularity(rawSeries)
    const tf = timeframe
    let agg = null
    let needRefetch = false
    if (tf === '1d' || tf === 'day') {
      agg = aggregateSeries(rawSeries, '1d', base)
    } else if (tf === '5m' || tf === '15m' || tf === '30m' || tf === '1h') {
      const out = aggregateSeries(rawSeries, tf, base)
      if (out == null) { needRefetch = true; agg = [] } else { agg = out }
    } else {
      agg = rawSeries
    }
    const s = (rangeStart || '').slice(0,10)
    const e = (rangeEnd || '').slice(0,10)
    const filtered = (agg || []).filter(p => {
      const d = String(p.timestamp || '').slice(0,10)
      const geS = !s || d >= s
      const leE = !e || d <= e
      return geS && leE
    })
    return { displaySeries: filtered, needTFRefetch: needRefetch }
  }, [rawSeries, rangeStart, rangeEnd, timeframe, detectBaseGranularity, aggregateSeries])
  const [trainSuggest, setTrainSuggest] = useState(null) // {bottom, top, numGrids}
  const [backtestTrades, setBacktestTrades] = useState([])
  const [backtestEquity, setBacktestEquity] = useState([]) // [{date, equity}]
  const [stats, setStats] = useState(null)
  const [msg, setMsg] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [dataMinDate, setDataMinDate] = useState('')
  const [dataMaxDate, setDataMaxDate] = useState('')
  const isFutures = useMemo(() => !/^\d{6}$/.test(String(symbol || '')), [symbol])
  

  // 加载本地股票与期货字典
  useEffect(() => {
    (async () => {
      try {
        // 股票列表
        try {
          const r = await fetch('/api/v1/data/stocklist')
          if (r.ok) {
            const data = await r.json()
            setStockList(Array.isArray(data?.list) ? data.list : [])
          } else {
            // 兜底静态
            const r2 = await fetch('/data/stockList/all_pure_stock.json')
            if (r2.ok) {
              const data2 = await r2.json()
              setStockList(Array.isArray(data2) ? data2 : [])
            }
          }
        } catch {}
        // 期货合约字典
        try {
          const r3 = await fetch('/api/v1/futures/contracts')
          if (r3.ok) {
            const data3 = await r3.json()
            const arr = Array.isArray(data3?.list) ? data3.list : []
            setFuturesList(arr)
          }
        } catch {}
      } catch {}
    })()
  }, [])

  const normalizedCandidates = useMemo(() => {
    const pick = (obj, keys) => { for (const k of keys) { if (obj && obj[k] != null && obj[k] !== '') return obj[k] } return '' }
    const extractStock = (obj) => {
      const nameZh = String(pick(obj, ['code_name','name','n','nameZh','name_zh','displayName','display_name','简称','nameCN','sec_name','stock_name','sname']) || '')
      const codeField = String(pick(obj, ['code','c','symbol','ticker','证券代码','code_simple']) || '')
      const codeFullField = String(pick(obj, ['code_full','cf','codeFull','full_code','ts_code','wind_code']) || '')
      const code = (codeField.match(/\d{6}/) || [])[0] || (codeFullField.match(/\d{6}/) || [])[0] || ''
      if (!nameZh || !code) return null
      return { type: 'stock', code, name: nameZh, label: `${nameZh}（${code}）` }
    }
    const extractFut = (obj) => {
      const sym = String(pick(obj, ['symbol','contract','code']) || '')
      const name = String(pick(obj, ['name','cn','zh']) || '')
      if (!sym) return null
      const label = name ? `${name}（${sym}）` : sym
      return { type: 'futures', code: sym, name: name || sym, label }
    }
    const stocks = (stockList || []).map(extractStock).filter(Boolean)
    const futures = (futuresList || []).map(extractFut).filter(Boolean)
    return [...stocks, ...futures]
  }, [stockList, futuresList])

  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => { const t = setTimeout(()=>setDebouncedQuery(query), 160); return ()=>clearTimeout(t) }, [query])

  const filteredCandidates = useMemo(() => {
    const q = (debouncedQuery || '').trim().toLowerCase()
    let arr = normalizedCandidates
    if (q) {
      const parts = q.split(/\s+/).filter(Boolean)
      arr = arr.filter(it => parts.every(p => it.name.toLowerCase().includes(p) || String(it.code).toLowerCase().includes(p)))
      // 简单排序：完整匹配代码优先
      arr.sort((a,b) => (String(b.code).toLowerCase() === q) - (String(a.code).toLowerCase() === q))
    }
    return arr.slice(0, 50)
  }, [debouncedQuery, normalizedCandidates])

  

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setMsg('正在拉取数据...')
      setIsLoading(true)
      if (isFutures) {
        const periodParam = timeframe === '1h' ? '60' : (timeframe.endsWith('m') ? timeframe.replace('m','') : '5')
        const params = new URLSearchParams({ symbol, period: periodParam, startDate: rangeStart, endDate: rangeEnd, save: 'false' })
        const r = await fetch(`/api/v1/futures/data?${params.toString()}`)
        const j = await r.json()
        const series = (j.data || []).map(d => ({ timestamp: d.timestamp, open: Number(d.open), high: Number(d.high), low: Number(d.low), close: Number(d.close) }))
        setRawSeries(series)
        if (series && series.length) {
          const dmin = series[0].timestamp.slice(0,10)
          const dmax = series[series.length-1].timestamp.slice(0,10)
          setDataMinDate(dmin)
          setDataMaxDate(dmax)
        }
      } else {
        // 使用股票回测端点获取 price_series 作为原始数据
        const dummyStrategy = { nodes: [ { id: 'x', type: 'condition', position: {x:0,y:0}, data: { nodeType:'condition', subType:'rsi', type:'rsi', period: 14, threshold: -999999, operator: '>', timeframe } } ] }
        const body = { strategy: dummyStrategy, symbol, timeframe, startDate: rangeStart, endDate: rangeEnd, initialCapital }
        const r = await fetch('/api/v1/backtest/stocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const j = await r.json()
        const series = (j.price_series || []).map(d => ({ timestamp: d.timestamp, open: Number(d.open), high: Number(d.high), low: Number(d.low), close: Number(d.close) }))
        setRawSeries(series)
        if (series && series.length) {
          const dmin = series[0].timestamp.slice(0,10)
          const dmax = series[series.length-1].timestamp.slice(0,10)
          setDataMinDate(dmin)
          setDataMaxDate(dmax)
        }
      }
      setMsg('数据已加载')
    } catch (e) {
      setMsg(`拉取失败：${e?.message || e}`)
    } finally {
      setIsLoading(false)
    }
  }, [symbol, timeframe, rangeStart, rangeEnd, isFutures, initialCapital])

  // 当开始/结束日期或周期变化时，自动刷新图表区间；若超出本地数据范围则提示
  useEffect(() => {
    let t = null
    const inside = (d) => !d || (!dataMinDate || d >= dataMinDate) && (!dataMaxDate || d <= dataMaxDate)
    if ((rangeStart && !inside(rangeStart)) || (rangeEnd && !inside(rangeEnd))) {
      if (dataMinDate && dataMaxDate) setMsg(`提示：所选区间超出本地数据范围（${dataMinDate} ~ ${dataMaxDate}）`)
    } else {
      // 清理提示但不覆盖其他消息
      if (msg && msg.startsWith('提示：所选区间超出本地数据范围')) setMsg('')
    }
    t = setTimeout(() => { fetchData() }, 350)
    return () => { if (t) clearTimeout(t) }
  }, [rangeStart, rangeEnd, timeframe, symbol])

  // 选中候选项后，若本地已有股票数据则直接读取并设置日期范围
  const loadLocalIfAny = useCallback(async (code6) => {
    try {
      if (!/^\d{6}$/.test(String(code6))) return
      const r = await fetch(`/api/v1/data/info/${code6}`)
      if (!r.ok) return
      const txt = await r.text()
      let info = null
      try { info = txt ? JSON.parse(txt) : null } catch {}
      if (!info) return
      const pickDate = (o, keys) => {
        for (const k of keys) {
          const v = o && o[k]
          if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10)
        }
        return ''
      }
      const start = pickDate(info, ['start','start_date','first','first_date','minDate'])
      const end = pickDate(info, ['end','end_date','last','last_date','maxDate'])
      if (start) setRangeStart(start)
      if (end) setRangeEnd(end)
      if (start) setTrainStart(start)
      if (end) setTrainEnd(end)
      if (start) setTestStart(start)
      if (end) setTestEnd(end)
      await fetchData()
    } catch {}
  }, [fetchData])

  // 一键拉取数据（与股票回测页一致的行为）：
  // - 股票：POST /api/v1/data/fetch 保存到 data/ 目录
  // - 期货：GET /api/v1/futures/data?save=true 保存到 data/features/
  const fetchAndSaveData = useCallback(async () => {
    try {
      setMsg('正在拉取并保存数据...')
      setIsLoading(true)
      if (isFutures) {
        const periodParam = timeframe === '1h' ? '60' : (timeframe.endsWith('m') ? timeframe.replace('m','') : '5')
        const params = new URLSearchParams({ symbol, period: periodParam, startDate: rangeStart, endDate: rangeEnd, save: 'true', name: selectedItem?.name || symbol })
        const r = await fetch(`/api/v1/futures/data?${params.toString()}`)
        const j = await r.json()
        if (!r.ok || !j.ok) throw new Error(j?.detail || '期货数据拉取失败')
        setMsg(`期货数据已保存${j.csv ? '：' + j.csv : ''}`)
      } else {
        const code = /^\d{6}$/.test(String(symbol)) ? String(symbol) : ''
        if (!code) throw new Error('请输入有效的6位股票代码')
        const codeFull = code.startsWith('6') ? `sh.${code}` : `sz.${code}`
        const body = { codeFull, name: selectedItem?.name || code, startDate: rangeStart, endDate: rangeEnd, timeframe }
        const r = await fetch('/api/v1/data/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const raw = await r.text()
        let j = null
        try { j = raw ? JSON.parse(raw) : null } catch {}
        if (!r.ok || !(j && j.ok)) throw new Error((j && (j.detail || j.error)) || `${r.status} ${r.statusText}`)
        setMsg(`拉取完成：${j.csv || ''}`)
      }
      // 保存完成后刷新展示用数据
      await fetchData()
    } catch (e) {
      setMsg(`拉取失败：${e?.message || e}`)
    } finally {
      setIsLoading(false)
    }
  }, [isFutures, symbol, timeframe, rangeStart, rangeEnd, selectedItem, fetchData])

  // Analyze training window
  const analyzeTrain = useCallback(() => {
    try {
      const s = (rawSeries || []).filter(p => {
        const d = (p.timestamp || '').slice(0,10)
        return (!trainStart || d >= trainStart) && (!trainEnd || d <= trainEnd)
      })
      if (s.length === 0) { setMsg('训练期无数据'); return }
      const closes = s.map(p => Number(p.close)).filter(v => isFinite(v))
      const minV = Math.min(...closes)
      const maxV = Math.max(...closes)
      const width = maxV - minV
      const pad = width * 0.05
      const bottom = Math.max(0, minV - pad)
      const top = maxV + pad
      setTrainSuggest({ bottom: round2(bottom), top: round2(top), numGrids: numGrids })
      // 点击“分析训练期”后，直接将推荐值写入网格上下限
      setGridBottom(String(round2(bottom)))
      setGridTop(String(round2(top)))
      setMsg('已生成推荐网格上下限')
    } catch (e) {
      setMsg(`分析失败：${e?.message || e}`)
    }
  }, [rawSeries, trainStart, trainEnd, numGrids, gridBottom, gridTop])

  // 原始数据加载完成后，若未设置网格上下限，则自动根据训练期生成推荐值
  useEffect(() => {
    if (rawSeries && rawSeries.length > 0 && (!gridBottom || !gridTop)) {
      analyzeTrain()
    }
  }, [rawSeries, gridBottom, gridTop, analyzeTrain])

  // 动态加载 HQChart CDN（避免打包依赖冲突）
  

  // Frontend grid backtest simulation (long-only)
  const runBacktest = useCallback(() => {
    try {
      const s = (rawSeries || []).filter(p => {
        const d = (p.timestamp || '').slice(0,10)
        return (!testStart || d >= testStart) && (!testEnd || d <= testEnd)
      })
      if (s.length === 0) { setMsg('回测期无数据'); setBacktestTrades([]); setBacktestEquity([]); setStats(null); return }
      const bottom = Number(gridBottom)
      const top = Number(gridTop)
      const grids = Number(numGrids)
      if (!isFinite(bottom) || !isFinite(top) || bottom <= 0 || top <= bottom || grids <= 0) {
        setMsg('网格参数无效'); return
      }
      const step = (top - bottom) / grids
      const levels = Array.from({ length: grids + 1 }, (_, i) => bottom + i * step)
      const initCap = Number(initialCapital)
      let cash = initCap
      let pos = 0
      let lastEntryTs = null
      const trades = []
      const equity = []
      // helper: MA60 & Boll width
      const closesAll = s.map(p => Number(p.close))
      const ma = (arr, i, n) => {
        if (i + 1 < n) return null
        let sum = 0
        for (let k = i - n + 1; k <= i; k++) sum += arr[k]
        return sum / n
      }
      const bb = (arr, i, n) => {
        if (i + 1 < n) return null
        const slice = arr.slice(i - n + 1, i + 1)
        const m = slice.reduce((a,b)=>a+b,0)/n
        const variance = slice.reduce((a,b)=>a + (b-m)*(b-m), 0)/n
        const sd = Math.sqrt(variance)
        return { mid: m, up: m + 2*sd, dn: m - 2*sd, widthPct: m ? (2*sd)/m : 0 }
      }
      const lot = Number(lotSize)
      const positionFraction = positionMode === 'full' ? 1 : positionMode === 'half' ? 0.5 : positionMode === 'third' ? (1/3) : 0.25
      const stopLossPct = Number(stopPct)/100
      const stopPriceNum = stopPrice ? Number(stopPrice) : null
      const holdSince = () => lastEntryTs ? Math.ceil((new Date(s[i].timestamp) - new Date(lastEntryTs)) / (24*3600*1000)) : 0

      let peakEquity = initCap
      let maxDD = 0
      let wins = 0, losses = 0
      let avgCost = 0

      for (let i = 0; i < s.length; i++) {
        const p = s[i]
        const close = Number(p.close)
        // Trend filter
        if (useTrend) {
          const ma60 = ma(closesAll, i, 60)
          if (ma60 != null && close < ma60) {
            // 不做多，若有持仓仅考虑平仓
          }
        }
        // Volatility filter
        if (useVol) {
          const band = bb(closesAll, i, 20)
          if (band && band.widthPct < 0.03) {
            // 布林过窄，降低开仓频率：仅每第3根才允许考虑
            if (i % 3 !== 0) {
              // 仅记录权益
              const eq = cash + pos * close
              equity.push({ date: p.timestamp, equity: round2(eq) })
              continue
            }
          }
        }

        // 止损：价格/资金/时间
        const currEquity = cash + pos * close
        if (stopPriceNum && close < stopPriceNum && pos > 0) {
          // 强制清仓
          const qty = pos
          const pnlVal = (close - avgCost) * qty
          cash += qty * close
          pos = 0
          trades.push({ timestamp: p.timestamp, action: 'sell', price: round2(close), quantity: qty, amount: round2(qty*close), pnl: round2(pnlVal) })
          lastEntryTs = null
        } else if (stopLossPct > 0 && (initCap - currEquity) / initCap >= stopLossPct && pos > 0) {
          const qty = pos
          const pnlVal = (close - avgCost) * qty
          cash += qty * close
          pos = 0
          trades.push({ timestamp: p.timestamp, action: 'sell', price: round2(close), quantity: qty, amount: round2(qty*close), pnl: round2(pnlVal), note: '资金止损' })
          lastEntryTs = null
        } else if (stopDays > 0 && pos > 0 && holdSince() >= Number(stopDays)) {
          const qty = pos
          const pnlVal = (close - avgCost) * qty
          cash += qty * close
          pos = 0
          trades.push({ timestamp: p.timestamp, action: 'sell', price: round2(close), quantity: qty, amount: round2(qty*close), pnl: round2(pnlVal), note: '时间止损' })
          lastEntryTs = null
        }

        // 网格触发：下破一格买，上触一格卖（long-only）
        // 找到当前价格所处格位索引
        const idx = Math.max(0, Math.min(grids, Math.floor((close - bottom) / step)))
        // 简单策略：当价格低于上一次成交价所处格位一个台阶时买入；高于一个台阶时卖出
        // 这里用 levels 与上一步持仓参考 avgCost 来判定：
        if (pos === 0) {
          // 建仓机会：价格跌至较低格位
          const budget = initCap * positionFraction
          const maxShares = Math.floor((budget / close) / lot) * lot
          const affordable = Math.floor((cash / close) / lot) * lot
          const qty = Math.max(0, Math.min(maxShares, affordable))
          if (qty >= lot && (!useTrend || (ma(closesAll, i, 60) == null || close >= ma(closesAll, i, 60)))) {
            cash -= qty * close
            avgCost = close
            pos = qty
            lastEntryTs = p.timestamp
            trades.push({ timestamp: p.timestamp, action: 'buy', price: round2(close), quantity: qty, amount: round2(qty*close) })
          }
        } else {
          // 已有仓位：
          if (close <= avgCost - step && cash >= lot * close) {
            // 下破一格，加仓
            const budget = initCap * positionFraction
            const maxShares = Math.floor((budget / close) / lot) * lot
            const affordable = Math.floor((cash / close) / lot) * lot
            const qty = Math.max(0, Math.min(maxShares, affordable))
            if (qty >= lot) {
              cash -= qty * close
              avgCost = (avgCost * pos + close * qty) / (pos + qty)
              pos += qty
              lastEntryTs = lastEntryTs || p.timestamp
              trades.push({ timestamp: p.timestamp, action: 'buy', price: round2(close), quantity: qty, amount: round2(qty*close) })
            }
          } else if (close >= avgCost + step && pos >= lot) {
            // 上触一格，减仓
            const qty = Math.max(lot, Math.floor(pos / 2 / lot) * lot)
            const pnlVal = (close - avgCost) * qty
            cash += qty * close
            pos -= qty
            trades.push({ timestamp: p.timestamp, action: 'sell', price: round2(close), quantity: qty, amount: round2(qty*close), pnl: round2(pnlVal) })
            if (pos === 0) lastEntryTs = null
          }
        }

        const eq = cash + pos * close
        if (eq > peakEquity) peakEquity = eq
        const dd = peakEquity > 0 ? (peakEquity - eq) / peakEquity : 0
        if (dd > maxDD) maxDD = dd
        equity.push({ date: p.timestamp, equity: round2(eq) })
      }
      // Close remaining
      if (pos > 0 && s.length) {
        const last = s[s.length - 1]
        const close = Number(last.close)
        const qty = pos
        const pnlVal = (close - avgCost) * qty
        cash += qty * close
        pos = 0
        trades.push({ timestamp: last.timestamp, action: 'sell', price: round2(close), quantity: qty, amount: round2(qty*close), pnl: round2(pnlVal), note: '期末平仓' })
        const eq = cash
        equity.push({ date: last.timestamp, equity: round2(eq) })
      }

      // Stats
      let w = 0, l = 0
      for (const t of trades) if (t.action === 'sell') (t.pnl >= 0 ? w++ : l++)
      const totalTrades = w + l
      const winRate = totalTrades > 0 ? w / totalTrades : 0
      const plRatio = (trades.filter(t=>t.action==='sell' && t.pnl>0).reduce((a,b)=>a+Number(b.pnl),0)) / Math.abs(trades.filter(t=>t.action==='sell' && t.pnl<0).reduce((a,b)=>a+Number(b.pnl),0) || 1)
      const totalReturn = (equity.length ? (equity[equity.length - 1].equity - initCap) / initCap : 0)
      setStats({ totalReturn, maxDrawdown: maxDD, winRate, profitLossRatio: plRatio, totalTrades })
      setBacktestTrades(trades)
      setBacktestEquity(equity)
      setMsg(totalTrades === 0 ? '未执行交易，原因：条件未触发或过滤器限制' : '回测完成')
    } catch (e) {
      setMsg(`回测失败：${e?.message || e}`)
    }
  }, [rawSeries, testStart, testEnd, gridBottom, gridTop, numGrids, positionMode, lotSize, useTrend, useVol, stopPrice, stopPct, stopDays, initialCapital])

  // 图表或参数变化时自动同步回测结果表格
  useEffect(() => {
    if (rawSeries && rawSeries.length) {
      runBacktest()
    }
  }, [displaySeries, testStart, testEnd, gridBottom, gridTop, numGrids, positionMode, lotSize, useTrend, useVol, stopPrice, stopPct, stopDays, initialCapital, runBacktest, rawSeries])

  const gridLevels = useMemo(() => {
    const b = Number(gridBottom), t = Number(gridTop)
    const n = Number(numGrids)
    if (!isFinite(b) || !isFinite(t) || t <= b || n <= 0) return []
    const step = (t - b) / n
    return Array.from({ length: n + 1 }, (_, i) => round2(b + i * step))
  }, [gridBottom, gridTop, numGrids])

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold">网格交易策略实验室</h1>
          <p className="text-sm text-muted-foreground">配置训练期生成推荐网格，回测指定区间，观察绩效</p>
        </div>
      </div>
      <div className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：数据与参数 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>数据拉取</CardTitle>
              <CardDescription>输入标的与时间范围，加载K线数据</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">标的（中文/代码可搜索）</Label>
                  <Input
                    ref={inputRef}
                    className="text-xs mb-2"
                    placeholder="输入中文名或代码搜索..."
                    value={isFocused ? query : (selectedItem ? selectedItem.label : (symbol || ''))}
                    onChange={e=>{ setQuery(e.target.value); setHighlightIdx(-1); setIsFocused(true) }}
                    onFocus={()=>setIsFocused(true)}
                    onBlur={()=>setTimeout(()=>setIsFocused(false), 100)}
                    onKeyDown={(e)=>{
                      if (!isFocused) return
                      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i=>Math.min((i<0? -1:i)+1, filteredCandidates.length-1)) }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i=>Math.max((i<=0? 0:i)-1, 0)) }
                      if (e.key === 'Enter') {
                        if (highlightIdx >= 0 && filteredCandidates[highlightIdx]) {
                          const it = filteredCandidates[highlightIdx]
                          setSymbol(it.code)
                          setSelectedItem(it)
                          setQuery(it.label)
                          setIsFocused(false)
                        }
                      }
                      if (e.key === 'Escape') setIsFocused(false)
                    }}
                  />
                  {isFocused && (
                    <div ref={dropdownRef} className="max-h-56 overflow-auto border rounded shadow bg-card">
                      {filteredCandidates.length === 0 ? (
                        <div className="px-2 py-2 text-xs text-muted-foreground">未找到结果</div>
                      ) : (
                        filteredCandidates.map((it, idx) => (
                          <button
                            type="button"
                            key={`${it.type}-${it.code}`}
                            onMouseDown={async (e)=>{ e.preventDefault(); setSymbol(it.code); setSelectedItem(it); setQuery(it.label); setIsFocused(false); if (it.type==='stock') { await loadLocalIfAny(it.code) } }}
                            className={`w-full text-left px-2 py-1 text-xs hover:bg-muted flex items-center justify-between ${idx===highlightIdx?'bg-muted/60':''}`}
                          >
                            <span>{it.label}</span>
                            <span className="text-[10px] text-muted-foreground">{it.type==='stock'?'股票':'期货'}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs">周期</Label>
                  <select className="w-full px-3 py-2 text-xs border rounded-md" value={timeframe} onChange={e=>setTimeframe(e.target.value)}>
                    <option value="5m">5分钟</option>
                    <option value="15m">15分钟</option>
                    <option value="30m">30分钟</option>
                    <option value="1h">1小时</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">开始日期</Label>
                  <Input type="date" value={rangeStart} onChange={e=>setRangeStart(e.target.value)} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">结束日期</Label>
                  <Input type="date" value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)} className="text-xs" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={fetchAndSaveData}>一键拉取数据</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>训练期分析</CardTitle>
              <CardDescription>根据训练期波动区间推荐网格上下限</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">训练期开始</Label>
                  <Input type="date" value={trainStart} onChange={e=>setTrainStart(e.target.value)} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">训练期结束</Label>
                  <Input type="date" value={trainEnd} onChange={e=>setTrainEnd(e.target.value)} className="text-xs" />
                </div>
              </div>
              <Button size="sm" onClick={analyzeTrain}>分析训练期</Button>
              {trainSuggest && (
                <div className="text-xs text-muted-foreground">推荐区间：{trainSuggest.bottom} ~ {trainSuggest.top}（{trainSuggest.numGrids}格）</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>回测期与策略参数</CardTitle>
              <CardDescription>使用推荐或自定义网格参数运行回测</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">回测开始</Label>
                  <Input type="date" value={testStart} onChange={e=>setTestStart(e.target.value)} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">回测结束</Label>
                  <Input type="date" value={testEnd} onChange={e=>setTestEnd(e.target.value)} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">网格下限</Label>
                  <Input value={gridBottom} onChange={e=>setGridBottom(e.target.value)} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">网格上限</Label>
                  <Input value={gridTop} onChange={e=>setGridTop(e.target.value)} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">网格数量</Label>
                  <Input type="number" value={numGrids} onChange={e=>setNumGrids(Number(e.target.value))} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">初始资金</Label>
                  <Input type="number" value={initialCapital} onChange={e=>setInitialCapital(Number(e.target.value))} className="text-xs" />
                </div>
                <div>
                  <Label className="text-xs">仓位管理</Label>
                  <select className="w-full px-3 py-2 text-xs border rounded-md" value={positionMode} onChange={e=>setPositionMode(e.target.value)}>
                    <option value="full">全仓</option>
                    <option value="half">半仓</option>
                    <option value="third">1/3</option>
                    <option value="quarter">1/4</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">最小交易单位（股）</Label>
                  <Input type="number" value={lotSize} onChange={e=>setLotSize(Number(e.target.value))} className="text-xs" />
                </div>
                <div className="col-span-2 grid grid-cols-3 gap-3 items-end">
                  <div>
                    <Label className="text-xs">启用趋势过滤(MA60)</Label>
                    <select className="w-full px-3 py-2 text-xs border rounded-md" value={useTrend? 'on':'off'} onChange={e=>setUseTrend(e.target.value==='on')}>
                      <option value="on">开启</option>
                      <option value="off">关闭</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">启用波动过滤(布林收窄)</Label>
                    <select className="w-full px-3 py-2 text-xs border rounded-md" value={useVol? 'on':'off'} onChange={e=>setUseVol(e.target.value==='on')}>
                      <option value="on">开启</option>
                      <option value="off">关闭</option>
                    </select>
                  </div>
                </div>
                <div className="col-span-2 grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">价格止损</Label>
                    <Input value={stopPrice} onChange={e=>setStopPrice(e.target.value)} placeholder="可留空" className="text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">资金止损（%）</Label>
                    <Input type="number" value={stopPct} onChange={e=>setStopPct(Number(e.target.value))} className="text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">时间止损（天）</Label>
                    <Input type="number" value={stopDays} onChange={e=>setStopDays(Number(e.target.value))} className="text-xs" />
                  </div>
                </div>
              </div>
              <Button size="sm" onClick={runBacktest}>运行回测</Button>
              {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
            </CardContent>
          </Card>
        </div>

        {/* 右侧：图表与结果 */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>数据与网格线</CardTitle>
              <CardDescription>训练期与回测期行情及推荐网格</CardDescription>
            </CardHeader>
            <CardContent style={{ height: 320, position: 'relative' }}>
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/40 z-10">
                  <div className="text-xs text-muted-foreground">正在加载...</div>
                </div>
              )}
              {needTFRefetch ? (
                <div className="flex items-center justify-center h-full text-[12px] text-muted-foreground">
                  当前数据粒度无法聚合为所选周期，请重新拉取该周期数据
                </div>
              ) : displaySeries.length ? (
                <MemoFinancialChart key={`tf-${timeframe}-${rangeStart}-${rangeEnd}-${displaySeries.length}`} data={displaySeries} gridLevels={gridLevels} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {dataMinDate && dataMaxDate ? `所选区间无数据（本地范围：${dataMinDate} ~ ${dataMaxDate}）` : '暂无数据'}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col flex-1 min-h-0">
            <CardHeader>
              <CardTitle>回测结果</CardTitle>
              <CardDescription>交易记录与绩效指标</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0 space-y-3">
              {stats ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">总收益</div>
                    <div className={stats.totalReturn>=0?'text-red-600':'text-green-600'}>{(stats.totalReturn*100).toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">胜率</div>
                    <div>{(stats.winRate*100).toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">盈亏比</div>
                    <div>{Number(stats.profitLossRatio||0).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">最大回撤</div>
                    <div className="text-green-600">{(stats.maxDrawdown*100).toFixed(2)}%</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">尚未运行回测</div>
              )}

              <div className="border rounded flex-1 flex flex-col min-h-0">
                <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground border-b px-2 py-1">
                  <div>时间</div>
                  <div>操作</div>
                  <div>价格</div>
                  <div>数量</div>
                  <div>盈亏</div>
                  <div>备注</div>
                </div>
                <div className="flex-1 overflow-auto">
                  {backtestTrades.length ? backtestTrades.map((t, i) => (
                    <div key={i} className="grid grid-cols-6 gap-2 text-xs px-2 py-1 border-b">
                      <div>{t.timestamp}</div>
                      <div className={t.action==='buy'?'text-green-600':(t.action==='sell'?'text-red-600':'')}>{t.action==='buy'?'买入':'卖出'}</div>
                      <div>{t.price}</div>
                      <div>{t.quantity}</div>
                      <div className={Number(t.pnl||0)>=0?'text-red-600':'text-green-600'}>{t.pnl==null?'-':(Number(t.pnl)>=0?`+¥${Number(t.pnl).toFixed(2)}`:`-¥${Math.abs(Number(t.pnl)).toFixed(2)}`)}</div>
                      <div>{t.note || '-'}</div>
                    </div>
                  )) : (
                    <div className="p-3 text-xs text-muted-foreground">未执行交易，原因：{msg || '条件未触发或过滤器限制'}</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function round2(n) { const v = Number(n); return isFinite(v) ? Math.round(v*100)/100 : 0 }

// 使用 react-financial-charts 渲染蜡烛图
function FinancialChart({ data, gridLevels }) {
  // 时间解析器：支持 'YYYY-MM-DD HH:mm' / 'YYYY-MM-DD' / ISO
  const parseHM = useMemo(() => d3TimeParse('%Y-%m-%d %H:%M'), [])
  const parseD = useMemo(() => d3TimeParse('%Y-%m-%d'), [])
  const toDate = (ts) => {
    if (!ts) return null
    if (ts.length === 16) return parseHM(ts) || new Date(ts)
    if (ts.length === 10) return parseD(ts) || new Date(ts)
    const d = new Date(ts)
    return isNaN(d.getTime()) ? null : d
  }
  // 将字符串时间戳转换为 Date，并映射到库要求的字段
  const mapped = useMemo(() => (data || []).map(d => ({
    date: toDate(String(d.timestamp)),
    open: Number(d.open),
    high: Number(d.high),
    low: Number(d.low),
    close: Number(d.close),
    volume: Number(d.volume || 0)
  })).filter(d => d.date && isFinite(d.open) && isFinite(d.high) && isFinite(d.low) && isFinite(d.close)), [data])

  useEffect(() => {}, [mapped])

  if (!mapped.length) return <div className="flex items-center justify-center h-full text-muted-foreground">暂无数据</div>

  const xProvider = discontinuousTimeScaleProvider.inputDateAccessor(d => d.date)
  const { data: series, xScale, xAccessor, displayXAccessor } = xProvider(mapped)
  const xExtents = [xAccessor(series[0]), xAccessor(series[series.length - 1])]
  

  // 自适应父容器宽度
  const wrapRef = useRef(null)
  const [wrapW, setWrapW] = useState(600)
  const isPointerDownRef = useRef(false)
  const prevWRef = useRef(600)
  useEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current
    const onDown = () => { isPointerDownRef.current = true }
    const onUp = () => { isPointerDownRef.current = false }
    el.addEventListener('pointerdown', onDown, { passive: true })
    el.addEventListener('pointerup', onUp, { passive: true })
    el.addEventListener('pointerleave', onUp, { passive: true })

    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(300, Math.floor(e.contentRect.width))
        if (isPointerDownRef.current) return
        if (Math.abs(w - prevWRef.current) < 4) return
        prevWRef.current = w
        setWrapW(w)
      }
    })
    ro.observe(wrapRef.current)
    return () => {
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onUp)
    }
  }, [])

  return (
    <div ref={wrapRef} id="grid-canvas-wrap" style={{ width: '100%', height: '100%' }}>
      <ChartCanvas
        height={300}
        ratio={window.devicePixelRatio || 1}
        width={wrapW}
        margin={{ left: 56, right: 56, top: 10, bottom: 28 }}
        seriesName="GridK"
        data={series}
        xScale={xScale}
        xAccessor={xAccessor}
        displayXAccessor={displayXAccessor}
        xExtents={xExtents}
        zoomAnchor={lastVisibleItemBasedZoomAnchor}
        panEvent={false}
        zoomEvent={false}
        mouseMoveEvent={true}
      >
      <Chart id={1} yExtents={s => [s.high, s.low]}>
        <FXAxis tickStroke="#cbd5e1" tickLabelFill="#94a3b8" axisAt="bottom" orient="bottom"/>
        <FYAxis tickStroke="#cbd5e1" tickLabelFill="#94a3b8" axisAt="right" orient="right"/>
        <MouseCoordinateX displayFormat={d => d3TimeFormat('%Y-%m-%d %H:%M')(d)} />
        <MouseCoordinateY displayFormat={n => d3Format('.2f')(n)} />
        <CandlestickSeries
          wickStroke={(d)=> d.close>=d.open?'#ef4444':'#10b981'}
          stroke={(d)=> d.close>=d.open?'#ef4444':'#10b981'}
          fill={(d)=> d.close>=d.open?'#ef4444':'#10b981'}
          candleStrokeWidth={1}
          widthRatio={0.6}
        />
        <CurrentCoordinate yAccessor={d=>d.close} fill="#2563eb" r={2} />
        <EdgeIndicator itemType="last" orient="right" edgeAt="right" yAccessor={d=>d.close} displayFormat={n=>d3Format('.2f')(n)} fill="#0ea5e9" lineStroke="#0ea5e9" textFill="#ffffff" />
        <OHLCTooltip origin={[8, 8]} textFill="#475569" labelFill="#64748b"/>
        <ZoomButtons onReset={null} />
        {Array.isArray(gridLevels) && gridLevels.map((lv, i) => (
          <PriceCoordinate key={i} price={lv} stroke="#94a3b8" textFill="#94a3b8" at="right" strokeDasharray="ShortDash"/>
        ))}
      </Chart>
      <CrossHairCursor stroke="#94a3b8" />
      </ChartCanvas>
    </div>
  )
}

const MemoFinancialChart = React.memo(FinancialChart)


