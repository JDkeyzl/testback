import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 存储按“期货合约”分组的本次回测结果，只保留每个合约的最新一次结果
export const useFuturesBatchStore = create(persist(
  (set, get) => ({
    byContract: {}, // { [contract]: { results, params, timestamp } }
    setResultsFor: (contract, results, params) => set((state) => ({
      byContract: {
        ...(state.byContract || {}),
        [contract]: { results, params, timestamp: Date.now() }
      }
    })),
    getResultsFor: (contract) => {
      const s = get().byContract || {}
      return s[contract] || { results: [], params: null, timestamp: 0 }
    },
    clearForContract: (contract) => set((state) => {
      const next = { ...(state.byContract || {}) }
      delete next[contract]
      return { byContract: next }
    }),
    clearAll: () => set({ byContract: {} })
  }),
  { name: 'futures-batch-store-v1' }
))


