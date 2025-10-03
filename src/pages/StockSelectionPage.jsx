import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { useStockPoolStore } from '../store/stockPoolStore'
import { useStrategyListStore } from '../store/strategyListStore'
import { strategyLibrary } from '../data/strategyLibrary'
import { useNavigate } from 'react-router-dom'
import { formatTradesWithFees as fmtTradesFees, buildDailyAssetsFromRows, computeMetricsFromAssets as computeFromAssets, computeMetricsFromTrades as computeFromTrades } from '../utils/metrics'

export function StockSelectionPage() {
  const navigate = useNavigate()
  const { pools, addPool, renamePool, deletePool, addStocksToPool, removeStockFromPool } = useStockPoolStore()
  const [stockList, setStockList] = useState([])
  const [selectedPoolId, setSelectedPoolId] = useState('')
  const [checked, setChecked] = useState({})
  const [keyword, setKeyword] = useState('')
  const [newPoolName, setNewPoolName] = useState('')
  const [selectAll, setSelectAll] = useState(false)
  const { strategies } = useStrategyListStore()
  const allStrategies = useMemo(() => {
    return [ ...(strategies || []), ...(strategyLibrary || []) ]
  }, [strategies])
  const [selectedStrategyId, setSelectedStrategyId] = useState('')
  const [timeframe, setTimeframe] = useState('1d')
  const [startDate, setStartDate] = useState('2025-01-01')
  const getToday = () => {
    const d = new Date(); const yyyy = d.getFullYear(); const mm = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`
  }
  const [endDate, setEndDate] = useState(getToday())
  const [initialCapital, setInitialCapital] = useState(100000)
  const [isRunning, setIsRunning] = useState(false)
  const [status, setStatus] = useState('')
  const [results, setResults] = useState([])
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [dataProgress, setDataProgress] = useState({ current: 0, total: 0 })
  const [showStockList, setShowStockList] = useState(true)
  const [stockListPage, setStockListPage] = useState(1)
  const [stockListPageSize] = useState(50)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailParams, setDetailParams] = useState(null)
  const [selectedStrategyIds, setSelectedStrategyIds] = useState([])
  const [tabMode, setTabMode] = useState('stock')
  const [activeTabKey, setActiveTabKey] = useState('')
  const [viewMode, setViewMode] = useState('manage') // 'manage' | 'backtest'

  // 本页状态持久化 key
  const PERSIST_KEY = 'stock-selection-page-state'

  const savePageState = () => {
    try {
      const state = {
        selectedPoolId,
        keyword,
        showStockList,
        stockListPage,
        selectedStrategyIds,
        timeframe,
        startDate,
        endDate,
        initialCapital,
        results,
        tabMode,
        activeTabKey,
        viewMode,
      }
      localStorage.setItem(PERSIST_KEY, JSON.stringify(state))
    } catch {}
  }

  const loadPageState = () => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY)
      if (!raw) return
      const s = JSON.parse(raw)
      if (s && typeof s === 'object') {
        if (typeof s.selectedPoolId === 'string') setSelectedPoolId(s.selectedPoolId)
        if (typeof s.keyword === 'string') setKeyword(s.keyword)
        if (typeof s.showStockList === 'boolean') setShowStockList(s.showStockList)
        if (typeof s.stockListPage === 'number') setStockListPage(s.stockListPage)
        if (Array.isArray(s.selectedStrategyIds)) setSelectedStrategyIds(s.selectedStrategyIds)
        if (typeof s.timeframe === 'string') setTimeframe(s.timeframe)
        if (typeof s.startDate === 'string') setStartDate(s.startDate)
        if (typeof s.endDate === 'string') setEndDate(s.endDate)
        if (typeof s.initialCapital !== 'undefined') setInitialCapital(Number(s.initialCapital) || 100000)
        if (Array.isArray(s.results)) setResults(s.results)
        if (typeof s.tabMode === 'string') setTabMode(s.tabMode)
        if (typeof s.activeTabKey === 'string') setActiveTabKey(s.activeTabKey)
        if (typeof s.viewMode === 'string') setViewMode(s.viewMode)
      }
    } catch {}
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // 优先后端接口，其次本地 JSON（带行业）
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 4000)
        const r = await fetch('/api/v1/data/stocklist', { signal: controller.signal })
        clearTimeout(timeoutId)
        if (r.ok) {
          const data = await r.json()
          if (!cancelled) setStockList(Array.isArray(data?.list) ? data.list : [])
          return
        }
      } catch (err) {
        // 后端不可用/网络错误时，走本地静态文件兜底
        console.warn('stocklist api failed, fallback to static json', err)
      }
      try {
        const r2 = await fetch('/data/stockList/all_stock_with_industry.json')
        if (r2.ok) {
          const data2 = await r2.json()
          if (!cancelled) setStockList(Array.isArray(data2) ? data2 : [])
        }
      } catch {}
    }
    load()
    // 加载本页上次状态
    loadPageState()
    return () => { cancelled = true }
  }, [])

  const displayList = useMemo(() => {
    const kw = keyword.trim()
    let filtered = stockList
    if (kw) {
      filtered = stockList.filter(it => {
        const code = (it.code || '').toLowerCase()
        const name = (it.code_name || '').toLowerCase()
        const ind = (it.industry || '').toLowerCase()
        return code.includes(kw.toLowerCase()) || name.includes(kw.toLowerCase()) || ind.includes(kw.toLowerCase())
      })
    }
    // 分页显示
    const start = (stockListPage - 1) * stockListPageSize
    const end = start + stockListPageSize
    return filtered.slice(start, end)
  }, [stockList, keyword, stockListPage, stockListPageSize])

  const totalFilteredCount = useMemo(() => {
    const kw = keyword.trim()
    if (!kw) return stockList.length
    return stockList.filter(it => {
      const code = (it.code || '').toLowerCase()
      const name = (it.code_name || '').toLowerCase()
      const ind = (it.industry || '').toLowerCase()
      return code.includes(kw.toLowerCase()) || name.includes(kw.toLowerCase()) || ind.includes(kw.toLowerCase())
    }).length
  }, [stockList, keyword])

  const totalPages = Math.ceil(totalFilteredCount / stockListPageSize)

  // 搜索时重置页码
  useEffect(() => {
    setStockListPage(1)
  }, [keyword])

  // 离开本页时保存状态
  useEffect(() => {
    return () => {
      savePageState()
    }
  }, [selectedPoolId, keyword, showStockList, stockListPage, selectedStrategyIds, timeframe, startDate, endDate, initialCapital, results, tabMode, activeTabKey, viewMode])

  // 批量回测结果变更时更新保存状态
  useEffect(() => {
    savePageState()
  }, [results])

  // 同步全选状态
  useEffect(() => {
    if (displayList.length === 0) {
      setSelectAll(false)
      return
    }
    const allChecked = displayList.every(stock => checked[stock.code])
    setSelectAll(allChecked)
  }, [displayList, checked])

  const toggleCheck = (code) => {
    setChecked(prev => ({ ...prev, [code]: !prev[code] }))
  }

  const toggleSelectAll = () => {
    if (selectAll) {
      // 取消全选
      setChecked({})
      setSelectAll(false)
    } else {
      // 全选当前筛选结果（所有页面，不仅仅是当前页）
      const kw = keyword.trim()
      let filtered = stockList
      if (kw) {
        filtered = stockList.filter(it => {
          const code = (it.code || '').toLowerCase()
          const name = (it.code_name || '').toLowerCase()
          const ind = (it.industry || '').toLowerCase()
          return code.includes(kw.toLowerCase()) || name.includes(kw.toLowerCase()) || ind.includes(kw.toLowerCase())
        })
      }
      const newChecked = {}
      filtered.forEach(stock => {
        newChecked[stock.code] = true
      })
      setChecked(newChecked)
      setSelectAll(true)
    }
  }

  const handleRowClick = (code) => {
    toggleCheck(code)
  }

  const addCheckedToPool = () => {
    const codes = Object.entries(checked).filter(([, v]) => v).map(([c]) => c)
    if (!selectedPoolId || codes.length === 0) return
    // 查询当前池已有数量，提示并截断
    const pool = pools.find(p => p.id === selectedPoolId)
    const currentCount = pool ? (pool.codes?.length || 0) : 0
    if (currentCount >= 50) {
      alert('单个股票池最多 50 支股票')
      return
    }
    const remaining = Math.max(0, 50 - currentCount)
    const toAdd = codes.slice(0, remaining)
    if (toAdd.length < codes.length) {
      alert(`已达上限，最多还能加入 ${remaining} 支`)
    }
    if (toAdd.length === 0) return
    addStocksToPool(selectedPoolId, toAdd)
    setChecked({})
  }

  const extractPureCode = (code) => {
    if (!code) return ''
    const m = String(code).match(/(\d{6})$/)
    return m ? m[1] : String(code)
  }

  const codeToFull = (pure) => {
    const c = String(pure || '')
    if (!c) return ''
    // 上交所：60x/68x/605/603/601/600 等；其余默认深交所
    if (/^(60|68)/.test(c)) return `sh.${c}`
    return `sz.${c}`
  }

  const runBatchForPool = async () => {
    if (!selectedPoolId) { alert('请先选择股票池'); return }
    const strategiesToRun = (Array.isArray(selectedStrategyIds) ? selectedStrategyIds : [])
      .map(id => (strategies || []).find(s => s.id === id) || (strategyLibrary || []).find(s => s.id === id))
      .filter(Boolean)
    if (!strategiesToRun.length) { alert('请选择至少一个策略'); return }
    const pool = pools.find(p => p.id === selectedPoolId)
    const codes = (pool?.codes || []).slice()
    if (codes.length === 0) { alert('所选股票池为空'); return }

    setIsRunning(true)
    setIsLoadingData(true)
    setResults([])
    setDataProgress({ current: 0, total: codes.length * strategiesToRun.length })
    
    try {
      // 第一阶段：检查数据并下载缺失数据
      setStatus('正在检查股票数据...')
      const processedResults = []
      
      let progressCount = 0
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i]
        const symbol = extractPureCode(code)
        for (let j = 0; j < strategiesToRun.length; j++) {
          const strat = strategiesToRun[j]
          progressCount += 1
          setStatus(`正在处理：${symbol} / ${strat.name} (${progressCount}/${codes.length * strategiesToRun.length})`)
          setDataProgress({ current: progressCount, total: codes.length * strategiesToRun.length })
        
        try {
          // 先尝试回测，如果失败则尝试拉取数据后重试
          let resp = await fetch('/api/v1/backtest/stocks', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              strategy: strat.strategy,
              symbol,
              timeframe,
              startDate,
              endDate,
              initialCapital,
              strategyId: strat.id
            })
          })
          
          // 如果回测失败，尝试下载数据后重试
          if (!resp.ok) {
            let errorText = ''
            try { errorText = await resp.text() } catch {}
            const mayMissing = (errorText || '').includes('未找到股票') || (errorText || '').includes('数据文件')

            if (mayMissing) {
              // 第一次按用户区间尝试拉取
              const full = codeToFull(symbol)
              setStatus(`正在下载 ${symbol} 的数据...`)
              const dl1 = await fetch('/api/v1/data/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  codeFull: full,
                  name: symbol,
                  startDate: startDate,
                  endDate: endDate,
                  timeframe: timeframe
                })
              })
              if (!dl1.ok) {
                // 第二次扩大区间重试（更长历史，开放 endDate）
                const dl2 = await fetch('/api/v1/data/fetch', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    codeFull: full,
                    name: symbol,
                    startDate: '2018-01-01',
                    endDate: '',
                    timeframe: timeframe
                  })
                })
                if (!dl2.ok) {
                  const err2 = await dl2.text()
                  console.error('数据下载失败', symbol, err2)
                  processedResults.push({
                    symbol,
                    strategyId: strat.id,
                    strategy: strat.strategy,
                    strategyName: strat.name,
                    totalReturn: 0,
                    maxDrawdown: 0,
                    winRate: 0,
                    totalTrades: 0,
                    elapsedMs: 0,
                    error: '数据下载失败'
                  })
                  setResults([...processedResults].sort((a,b)=> b.totalReturn - a.totalReturn))
                  continue
                }
              }
              // 拉取成功后重试回测
              setStatus(`数据下载完成，重新回测 ${symbol}...`)
              resp = await fetch('/api/v1/backtest/stocks', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  strategy: strat.strategy,
                  symbol,
                  timeframe,
                  startDate,
                  endDate,
                  initialCapital,
                  strategyId: strat.id
                })
              })
            }

            if (!resp.ok) {
              const errText = errorText || (await resp.text()).slice(0, 500)
              console.error('回测失败', symbol, errText)
              processedResults.push({
                symbol,
                strategyId: strat.id,
                strategy: strat.strategy,
                strategyName: strat.name,
                totalReturn: 0,
                maxDrawdown: 0,
                winRate: 0,
                totalTrades: 0,
                elapsedMs: 0,
                error: errText || '回测失败'
              })
              setResults([...processedResults].sort((a,b)=> b.totalReturn - a.totalReturn))
              continue
            }
          }
          
          // 处理回测结果
          try {
            const result = await resp.json()
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
            const dailyAssets = buildDailyAssetsFromRows(rows, dailyPrices, startDate, endDate, initialCapital)
            const assetsMetrics = computeFromAssets(dailyAssets)
            const totalReturn = assetsMetrics.totalReturn
            const maxDrawdown = assetsMetrics.maxDrawdown
            const metrics = computeFromTrades(rows)
            const winRate = metrics.winRate
            const totalTrades = metrics.totalTrades
            
            processedResults.push({
              symbol,
              strategyId: strat.id,
              strategy: strat.strategy,
              strategyName: strat.name,
              totalReturn,
              maxDrawdown,
              winRate,
              totalTrades,
              elapsedMs: 0
            })
          } catch (parseError) {
            console.error('解析回测结果失败', symbol, parseError)
            processedResults.push({
              symbol,
              strategyId: strat.id,
              strategy: strat.strategy,
              strategyName: strat.name,
              totalReturn: 0,
              maxDrawdown: 0,
              winRate: 0,
              totalTrades: 0,
              elapsedMs: 0,
              error: '解析失败'
            })
          }
          
          // 实时更新结果
          setResults([...processedResults].sort((a,b)=> b.totalReturn - a.totalReturn))
          
        } catch (error) {
          console.error('处理股票失败', symbol, error)
          processedResults.push({
            symbol,
            strategyId: strat.id,
            strategy: strat.strategy,
            strategyName: strat.name,
            totalReturn: 0,
            maxDrawdown: 0,
            winRate: 0,
            totalTrades: 0,
            elapsedMs: 0,
            error: error?.message || '处理失败'
          })
          setResults([...processedResults].sort((a,b)=> b.totalReturn - a.totalReturn))
        }
        }
      }
      
      setIsLoadingData(false)
      setStatus('批量回测完成')
    } catch (e) {
      console.error(e)
      alert('批量回测失败：' + (e?.message || e))
    } finally {
      setIsRunning(false)
      setIsLoadingData(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* 左：股票池管理 */}
      <div className={`w-1/3 border-r border-border p-4 overflow-auto`}> 
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">股票池管理</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={viewMode==='manage'?'default':'outline'} onClick={()=>setViewMode('manage')}>股票池管理</Button>
            <Button size="sm" variant={viewMode==='backtest'?'default':'outline'} onClick={()=>setViewMode('backtest')}>批量回测</Button>
          </div>
        </div>
        {/* 股票池新增 / 股票列表筛选与加入（管理域） */}
        <div className="flex items-center gap-2 mb-3">
          <input
            className="h-8 px-3 py-1 w-full border border-input rounded-md bg-background text-sm"
            placeholder="输入股票池名称（如：银行龙头/自选股）"
            value={newPoolName}
            onChange={(e)=>setNewPoolName(e.target.value)}
          />
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => {
              const name = (newPoolName || '').trim()
              if (!name) return
              addPool(name)
              setNewPoolName('')
              // 自动选中新建的股票池
              setTimeout(() => {
                const last = useStockPoolStore.getState().pools.slice(-1)[0]
                if (last) setSelectedPoolId(last.id)
              }, 0)
            }}
            disabled={!newPoolName.trim()}
          >新建股票池</Button>
        </div>
        
        <div className="space-y-2">
          {pools.length === 0 && (
            <div className="text-xs text-muted-foreground">暂无股票池，点击“新建股票池”创建</div>
          )}
          {pools.map(pool => (
            <Card key={pool.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <input
                    className="w-full text-sm bg-transparent outline-none"
                    value={pool.name}
                    onChange={(e)=>renamePool(pool.id, e.target.value)}
                  />
                  <div className="text-xs text-muted-foreground mt-1">{pool.codes.length} 支股票</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant={selectedPoolId === pool.id ? 'default' : 'outline'} onClick={()=>setSelectedPoolId(pool.id)}>选择</Button>
                  <Button size="sm" variant="outline" onClick={()=>deletePool(pool.id)}>删除</Button>
                </div>
              </div>
              {pool.id === selectedPoolId && (
                <div className="mt-2 text-xs">
                  <div className="font-medium mb-1">已包含股票</div>
                  <div className="max-h-64 overflow-auto space-y-1">
                    {pool.codes.length === 0 && <div className="text-muted-foreground">暂无</div>}
                    {pool.codes.map(c => {
                      const stock = stockList.find(s => s.code === c)
                      const cleanCode = c.replace(/^(sh\.|sz\.)/, '')
                      const displayName = stock ? `${stock.code_name}(${cleanCode})` : cleanCode
                      return (
                        <div key={c} className="flex items-center justify-between">
                          <span className="text-sm">{displayName}</span>
                          <Button size="sm" variant="ghost" onClick={()=>removeStockFromPool(pool.id, c)}>移除</Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* 右：管理模式下的股票库表和搜索操作区 */}
      {viewMode==='manage' && (
        <div className="flex-1 p-4 overflow-auto">
          <div className="flex items-center gap-2 mb-3">
            <input
              className="h-9 px-3 py-1 w-80 border border-input rounded-md bg-background text-sm"
              placeholder="搜索 代码/名称/行业"
              value={keyword}
              onChange={(e)=>setKeyword(e.target.value)}
            />
            <Button size="sm" variant="outline" onClick={toggleSelectAll}>
              {selectAll ? '取消全选' : '全选'}
            </Button>
            <Button size="sm" variant="default" disabled={!selectedPoolId} onClick={addCheckedToPool}>加入股票池</Button>
          </div>

          <div className="border border-border rounded-md overflow-hidden">
            <div className="bg-muted/50 px-3 py-2 text-sm font-medium">
              股票列表 ({totalFilteredCount} 支股票) - 第 {stockListPage} 页，共 {totalPages} 页
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-3 py-2 w-10">
                    <input 
                      type="checkbox" 
                      checked={selectAll && totalFilteredCount > 0} 
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left px-3 py-2">代码</th>
                  <th className="text-left px-3 py-2">名称</th>
                  <th className="text-left px-3 py-2">行业</th>
                </tr>
              </thead>
              <tbody>
                {displayList.map((it) => (
                  <tr 
                    key={it.code} 
                    className="border-t border-border hover:bg-muted/30 cursor-pointer"
                    onClick={() => handleRowClick(it.code)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={!!checked[it.code]} 
                        onChange={()=>toggleCheck(it.code)} 
                      />
                    </td>
                    <td className="px-3 py-2">{it.code}</td>
                    <td className="px-3 py-2">{it.code_name}</td>
                    <td className="px-3 py-2">{it.industry || '-'}</td>
                  </tr>
                ))}
                {displayList.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>无数据</td>
                  </tr>
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
                <div className="text-xs text-muted-foreground">
                  显示 {((stockListPage - 1) * stockListPageSize) + 1} - {Math.min(stockListPage * stockListPageSize, totalFilteredCount)} 条，共 {totalFilteredCount} 条
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    disabled={stockListPage <= 1}
                    onClick={() => setStockListPage(1)}
                  >
                    首页
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    disabled={stockListPage <= 1}
                    onClick={() => setStockListPage(stockListPage - 1)}
                  >
                    上一页
                  </Button>
                  <span className="text-xs px-2">
                    {stockListPage} / {totalPages}
                  </span>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    disabled={stockListPage >= totalPages}
                    onClick={() => setStockListPage(stockListPage + 1)}
                  >
                    下一页
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    disabled={stockListPage >= totalPages}
                    onClick={() => setStockListPage(totalPages)}
                  >
                    末页
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 右：回测区（仅 backtest 模式显示） */}
      <div className={`${viewMode==='backtest' ? 'flex-1' : 'hidden'} p-4 overflow-auto`}>
        {/* 批量回测参数区 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* 策略多选平铺 */}
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-muted-foreground">选择策略（可多选）</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={()=>setSelectedStrategyIds(allStrategies.map(s=>s.id))} disabled={isRunning || allStrategies.length===0}>全选</Button>
              <Button size="sm" variant="outline" onClick={()=>setSelectedStrategyIds([])} disabled={isRunning}>清空</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full">
            {allStrategies.map((s) => {
              const active = selectedStrategyIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`px-2 py-1 text-xs rounded border ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                  onClick={() => {
                    setSelectedStrategyIds(prev => active ? prev.filter(id=>id!==s.id) : [...prev, s.id])
                  }}
                  disabled={isRunning}
                  title={s.name}
                >{s.name}</button>
              )
            })}
            {allStrategies.length===0 && (
              <div className="text-xs text-muted-foreground">暂无策略</div>
            )}
          </div>
          <select className="h-9 px-2 text-xs border rounded" value={timeframe} onChange={(e)=>setTimeframe(e.target.value)} disabled={isRunning}>
            <option value="1d">1天</option>
            <option value="1h">1小时</option>
            <option value="4h">4小时</option>
            <option value="30m">30分钟</option>
            <option value="15m">15分钟</option>
            <option value="5m">5分钟</option>
          </select>
          <input type="date" className="h-9 px-2 text-xs border rounded" value={startDate} onChange={(e)=>setStartDate(e.target.value)} disabled={isRunning} />
          <input type="date" className="h-9 px-2 text-xs border rounded" value={endDate} onChange={(e)=>setEndDate(e.target.value)} disabled={isRunning} />
          <input type="number" className="h-9 px-2 text-xs border rounded w-28" value={initialCapital} onChange={(e)=>setInitialCapital(Number(e.target.value))} disabled={isRunning} placeholder="初始资金" />
          <Button size="sm" onClick={runBatchForPool} disabled={isRunning || !selectedPoolId || !(selectedStrategyIds && selectedStrategyIds.length)}>
            {isRunning ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                回测中...
              </div>
            ) : '批量回测'}
          </Button>
          {status && (
            <div className="text-xs text-muted-foreground">
              {status}
              {isLoadingData && dataProgress.total > 0 && (
                <span className="ml-2">
                  ({dataProgress.current}/{dataProgress.total})
                </span>
              )}
            </div>
          )}
          {isLoadingData && dataProgress.total > 0 && (
            <div className="w-64 bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${(dataProgress.current / dataProgress.total) * 100}%` }}
              ></div>
            </div>
          )}
        </div>
        {/* 回测结果 Tabs 控件 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant={tabMode==='stock'?'default':'outline'} onClick={()=>{ setTabMode('stock'); setActiveTabKey('') }}>按股票</Button>
            <Button size="sm" variant={tabMode==='strategy'?'default':'outline'} onClick={()=>{ setTabMode('strategy'); setActiveTabKey('') }}>按策略</Button>
          </div>
        </div>
        {(() => {
          const tabs = new Map()
          if (tabMode === 'stock') {
            for (const r of results) {
              if (!tabs.has(r.symbol)) {
                const stock = stockList.find(s => String(s.code || '').endsWith(r.symbol))
                const label = stock ? `${stock.code_name}（${r.symbol}）` : r.symbol
                tabs.set(r.symbol, label)
              }
            }
          } else {
            for (const r of results) {
              if (!tabs.has(r.strategyId)) {
                tabs.set(r.strategyId, r.strategyName || r.strategyId)
              }
            }
          }
          const tabEntries = Array.from(tabs.entries())
          const currentKey = activeTabKey || (tabEntries[0]?.[0] || '')
          if (currentKey !== activeTabKey && tabEntries.length > 0) setActiveTabKey(currentKey)
          return (
            <div className="border-b border-border overflow-x-auto">
              <div className="flex gap-2 p-2 min-h-[40px]">
                {tabEntries.map(([key,label]) => (
                  <button
                    key={key}
                    className={`px-3 py-1 rounded-md text-xs border ${key===currentKey?'bg-primary text-primary-foreground border-primary':'border-border hover:bg-muted'}`}
                    onClick={()=>setActiveTabKey(key)}
                  >{label}</button>
                ))}
                {tabEntries.length===0 && <div className="text-xs text-muted-foreground">暂无结果</div>}
              </div>
            </div>
          )
        })()}

        {/* 回测结果表（受 Tabs 过滤） */}
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2">股票</th>
                <th className="text-left px-3 py-2">策略</th>
                <th className="text-left px-3 py-2">收益率</th>
                <th className="text-left px-3 py-2">最大回撤</th>
                <th className="text-left px-3 py-2">胜率</th>
                <th className="text-left px-3 py-2">交易次数</th>
                <th className="text-left px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {results.filter(r => (
                tabMode==='stock' ? (!activeTabKey || r.symbol===activeTabKey) : (!activeTabKey || r.strategyId===activeTabKey)
              )).map(r => {
                const stock = stockList.find(s => String(s.code || '').endsWith(r.symbol))
                const display = stock ? `${stock.code_name}（${r.symbol}）` : r.symbol
                return (
                  <tr key={`${r.symbol}-${r.strategyName}`} className="border-t border-border">
                    <td className="px-3 py-2">{display}</td>
                    <td className="px-3 py-2">{r.strategyName}</td>
                    <td className={`px-3 py-2 ${r.totalReturn>0?'text-red-600':(r.totalReturn<0?'text-green-600':'text-muted-foreground')}`}>{(r.totalReturn*100).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-green-600">{(r.maxDrawdown*100).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-blue-600">{(r.winRate*100).toFixed(2)}%</td>
                    <td className="px-3 py-2">{r.totalTrades}</td>
                    <td className="px-3 py-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          navigate(`/backtest/${r.strategyId || 'temp'}`, {
                            state: {
                              backtestParams: {
                                symbol: r.symbol,
                                timeframe,
                                startDate,
                                endDate,
                                initialCapital,
                                strategyId: r.strategyId,
                                strategy: r.strategy,
                              },
                              from: '/stock-selection'
                            }
                          })
                        }}
                      >查看详情</Button>
                    </td>
                  </tr>
                )
              })}
              {results.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={7}>暂无结果</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 详情页改为新路由打开，此处不再内嵌 */}
      </div>
    </div>
  )
}


