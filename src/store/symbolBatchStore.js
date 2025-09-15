import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 存储按“标的”分组的本次回测结果，只保留每个标的的最新一次结果
export const useSymbolBatchStore = create(persist(
  (set, get) => ({
    bySymbol: {}, // { [symbol]: { results, params, timestamp } }
    setResultsFor: (symbol, results, params) => set((state) => ({
      bySymbol: {
        ...state.bySymbol,
        [symbol]: { results, params, timestamp: Date.now() }
      }
    })),
    getResultsFor: (symbol) => {
      const s = get().bySymbol || {}
      return s[symbol] || { results: [], params: null, timestamp: 0 }
    },
    clearForSymbol: (symbol) => set((state) => {
      const next = { ...(state.bySymbol || {}) }
      delete next[symbol]
      return { bySymbol: next }
    }),
    clearAll: () => set({ bySymbol: {} })
  }),
  { name: 'symbol-batch-store-v2' }
))


