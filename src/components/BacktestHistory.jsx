import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Button } from './ui/button'
import { useBacktestHistoryStore } from '../store/backtestHistoryStore'
import { BarChart3, Clock, TrendingUp, TrendingDown, Calendar, RefreshCw, ExternalLink, Trash2, Info } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip'
import { strategyLibrary } from '../data/strategyLibrary'

export function BacktestHistory() {
  const navigate = useNavigate()
  const { records, deleteRecord } = useBacktestHistoryStore()

  const grouped = useMemo(() => {
    const map = new Map()
    for (const r of records) {
      const key = r.strategyId || 'unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    // 每组按时间倒序
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    }
    return Array.from(map.entries())
  }, [records])

  const formatPct = (v) => `${(Number(v || 0) * 100).toFixed(2)}%`
  const colorPct = (v) => (v > 0 ? 'text-red-600' : v < 0 ? 'text-green-600' : 'text-muted-foreground')

  if (!records || records.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          暂无回测记录
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {grouped.map(([strategyId, arr]) => (
        <Card key={strategyId} className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span>{arr[0]?.strategyName || '未命名策略'}</span>
              {/* 说明 Tooltip */}
              {(() => {
                const first = arr[0] || {}
                const libItem = strategyLibrary.find(s => s.id === (first.strategyId || ''))
                const snap = first.params?.strategySnapshot || {}
                const name = first.strategyName || libItem?.name
                const description = snap.description || libItem?.description
                const scenarios = snap.scenarios || libItem?.scenarios
                const tips = snap.tips || libItem?.tips
                const hasInfo = description || scenarios || tips
                if (!hasInfo) return null
                return (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="策略说明"
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-5">
                        {name && <div className="font-medium mb-1">{name}</div>}
                        {description && <div className="mb-1">说明：{description}</div>}
                        {scenarios && <div className="mb-1">适用：{scenarios}</div>}
                        {tips && <div>建议：{tips}</div>}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              })()}
              <span className="text-xs text-muted-foreground">（{arr.length} 次）</span>
            </CardTitle>
            <CardDescription className="text-xs">按时间倒序展示最近回测</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {arr.map((r) => (
                <div key={r.id} className="rounded-md border border-border/60 p-3 hover:bg-muted/30 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {r.params?.symbolName ? `${r.params.symbolName}（${r.params?.symbol || ''}）` : (r.params?.symbol ? `（${r.params.symbol}）` : '标的未知')}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {r.params?.timeframe} · {new Date(r.createdAt).toLocaleString()}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className={`inline-flex items-center gap-1 ${colorPct(r.summary?.totalReturn)}`}>
                          <TrendingUp className="h-3 w-3" /> 收益 {formatPct(r.summary?.totalReturn)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <TrendingDown className="h-3 w-3" /> 回撤 {formatPct(r.summary?.maxDrawdown)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> 交易 {r.summary?.totalTrades ?? 0}
                        </span>
                        <span className={`inline-flex items-center gap-1 ${colorPct(r.summary?.outperform)}`}>
                          <BarChart3 className="h-3 w-3" /> {r.summary?.outperform >= 0 ? '跑赢' : '跑输'} {formatPct(Math.abs(r.summary?.outperform || 0))}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="查看详情"
                        onClick={() => navigate(r.links?.toResultRoute || `/backtest/${r.strategyId}`, { state: { backtestParams: { ...r.params, strategyId: r.strategyId, strategy: r.params?.strategySnapshot, name: r.strategyName }, useHistorySnapshot: { summary: r.summary, trades: r.trades, equityCurve: r.equityCurve, priceSeries: r.priceSeries, dataInfo: r.dataInfo }, disableHistoryLog: true } })}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600"
                        title="删除记录"
                        onClick={() => deleteRecord(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {r.params?.startDate} ~ {r.params?.endDate}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}


