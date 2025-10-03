import { create } from 'zustand'
import { persist } from 'zustand/middleware'

function generateId() {
  return `pool_${Date.now()}_${Math.floor(Math.random()*1e6)}`
}

export const useStockPoolStore = create(persist(
  (set, get) => ({
    pools: [], // [{ id, name, codes: ["sh.600000", ...], user_id: 'default' }]
    defaultUserId: 'default',

    addPool: (name) => set((state) => {
      const poolName = (name || '').trim() || `我的股票池${state.pools.length + 1}`
      const newPool = { id: generateId(), name: poolName, codes: [], user_id: state.defaultUserId }
      return { pools: [...state.pools, newPool] }
    }),

    renamePool: (id, name) => set((state) => ({
      pools: state.pools.map(p => p.id === id ? { ...p, name: (name || p.name) } : p)
    })),

    deletePool: (id) => set((state) => ({
      pools: state.pools.filter(p => p.id !== id)
    })),

    addStocksToPool: (id, codes) => set((state) => ({
      pools: state.pools.map(p => {
        if (p.id !== id) return p
        const codeSet = new Set(p.codes)
        ;(codes || []).forEach(c => { if (c) codeSet.add(c) })
        return { ...p, codes: Array.from(codeSet), user_id: p.user_id || state.defaultUserId }
      })
    })),

    removeStockFromPool: (id, code) => set((state) => ({
      pools: state.pools.map(p => p.id === id ? { ...p, codes: p.codes.filter(c => c !== code), user_id: p.user_id || state.defaultUserId } : p)
    })),
  }),
  {
    name: 'stock-pool-store',
    partialize: (state) => ({ pools: state.pools })
  }
))


