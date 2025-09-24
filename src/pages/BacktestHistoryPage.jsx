import React from 'react'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { useBacktestHistoryStore } from '../store/backtestHistoryStore'
import { BacktestHistory } from '../components/BacktestHistory'

export function BacktestHistoryPage() {
  const { clearAll, records } = useBacktestHistoryStore()
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">回测记录</h2>
          <p className="text-sm text-muted-foreground">按策略分组，展示最近的回测概览，点击可查看详情</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!records || records.length === 0}
          onClick={() => {
            if (!records || records.length === 0) return
            if (window.confirm('确认清空所有回测记录吗？此操作不可恢复。')) {
              clearAll()
            }
          }}
        >清空记录</Button>
      </div>
      <BacktestHistory />
    </div>
  )
}


