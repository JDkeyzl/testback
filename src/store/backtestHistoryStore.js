import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Backtest history record interface (extensible)
// id, strategyId, strategyName, createdAt, params, summary, links, meta

export const useBacktestHistoryStore = create(
  persist(
    (set, get) => ({
      records: [],

      addRecord: (record) => {
        // 去重：短时间内（<=10s）相同策略 + 相同参数 + 相同概要，不重复写入
        try {
          const now = Date.now()
          const recent = get().records.slice(0, 10)
          const isDup = recent.some((r) => {
            const timeDiff = Math.abs(now - new Date(r.createdAt).getTime())
            const sameStrategy = (r.strategyId || '') === (record.strategyId || '')
            const sameParams = JSON.stringify(r.params || {}) === JSON.stringify(record.params || {})
            const sameSummary = JSON.stringify(r.summary || {}) === JSON.stringify(record.summary || {})
            return timeDiff <= 10000 && sameStrategy && sameParams && sameSummary
          })
          if (isDup) {
            return recent.find((r) => {
              const timeDiff = Math.abs(now - new Date(r.createdAt).getTime())
              return timeDiff <= 10000 && JSON.stringify(r.params || {}) === JSON.stringify(record.params || {})
            })?.id
          }
        } catch (e) {
          // ignore dedup errors
        }

        const newRecord = {
          id: record.id || `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
          ...record
        }
        set((state) => ({ records: [newRecord, ...state.records] }))
        return newRecord.id
      },

      deleteRecord: (id) => set((state) => ({ records: state.records.filter(r => r.id !== id) })),

      clearAll: () => set({ records: [] }),

      listAll: () => get().records,

      listByStrategy: (strategyId) => get().records.filter(r => r.strategyId === strategyId),

      getById: (id) => get().records.find(r => r.id === id),

      replaceAll: (records) => set({ records }),
    }),
    {
      name: 'backtest-history-storage',
      partialize: (state) => ({ records: state.records })
    }
  )
)
