import { create } from 'zustand'
import { persist } from 'zustand/middleware'
// 默认策略模板（清空）
const defaultStrategies = []

export const useStrategyListStore = create(
  persist(
    (set, get) => ({
      strategies: [], // 初始为空数组，通过initializeDefaultStrategies加载
      selectedStrategyId: null,
      
      // 添加策略
      addStrategy: (strategy) => {
        const newStrategy = {
          ...strategy,
          id: strategy.id || `strategy_${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        set(state => ({
          strategies: [...state.strategies, newStrategy]
        }))
      },
      
      // 更新策略
      updateStrategy: (id, updates) => {
        set(state => ({
          strategies: state.strategies.map(strategy =>
            strategy.id === id
              ? { ...strategy, ...updates, updatedAt: new Date().toISOString() }
              : strategy
          )
        }))
      },
      
      // 删除策略
      deleteStrategy: (id) => {
        set(state => ({
          strategies: state.strategies.filter(strategy => strategy.id !== id),
          selectedStrategyId: state.selectedStrategyId === id ? null : state.selectedStrategyId
        }))
      },
      
      // 重命名策略
      renameStrategy: (id, newName) => {
        set(state => ({
          strategies: state.strategies.map(strategy =>
            strategy.id === id
              ? { ...strategy, name: newName, updatedAt: new Date().toISOString() }
              : strategy
          )
        }))
      },
      
      // 选择策略
      selectStrategy: (id) => {
        set({ selectedStrategyId: id })
      },
      
      // 获取策略
      getStrategy: (id) => {
        const strategies = get().strategies
        return strategies.find(strategy => strategy.id === id)
      },
      
      // 初始化默认策略
      initializeDefaultStrategies: () => {
        const currentStrategies = get().strategies
        console.log('Initializing strategies, current count:', currentStrategies.length)
        if (currentStrategies.length === 0) {
          console.log('Loading default strategies...')
          set({ strategies: defaultStrategies })
          return true
        }
        console.log('Strategies already loaded')
        return false
      },
      
      // 重置为默认策略
      resetToSample: () => {
        set({ strategies: defaultStrategies, selectedStrategyId: null })
      },
      clearAll: () => {
        set({ strategies: [], selectedStrategyId: null })
      }
    }),
    {
      name: 'strategy-list-storage-v2', // 升级key以清空旧数据
      partialize: (state) => ({ strategies: state.strategies }) // 只持久化strategies
    }
  )
)