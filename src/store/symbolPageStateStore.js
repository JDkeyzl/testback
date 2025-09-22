import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 持久化股票回测页面的参数（保留最近一次选择，以便从其他页面返回时恢复）
export const useSymbolPageState = create(persist(
  (set, get) => ({
    state: {
      symbol: '',
      symbolName: '',
      timeframe: '1d',
      startDate: '2025-01-01',
      endDate: new Date().toISOString().slice(0,10),
      initialCapital: 100000,
      query: ''
    },
    setState: (partial) => set((s) => ({ state: { ...s.state, ...(partial || {}) } })),
    clear: () => set({ state: {
      symbol: '', symbolName: '', timeframe: '1d', startDate: '2025-01-01', endDate: new Date().toISOString().slice(0,10), initialCapital: 100000, query: ''
    }})
  }),
  { name: 'symbol-page-state-v1' }
))


