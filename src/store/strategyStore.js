import { create } from 'zustand'

// 节点参数配置
const defaultNodeParams = {
  // 条件节点参数
  condition: {
    ma: {
      period: 20,
      timeframe: '1d',
      threshold: 50.0,
      operator: '>'
    },
    price_range: {
      minPrice: 100,
      maxPrice: 200,
      timeframe: '1d'
    },
    rsi: {
      period: 14,
      timeframe: '1d',
      threshold: 30.0,
      operator: '<',
      direction: 'none' // 新增：方向判断
    },
    bollinger: {
      period: 20,
      timeframe: '1d',
      stdDev: 2,
      condition: 'breakout', // 新增：突破条件
      direction: 'lower' // 新增：突破方向
    },
    macd: {
      fast: 12,
      slow: 26,
      signal: 9,
      timeframe: '1d',
      mode: 'hist_threshold',
      threshold: 0.0,
      operator: '>'
    },
    volume: {
      threshold: 1000000,
      operator: '>',
      timeframe: '1d',
      avgPeriod: 20, // 新增：平均成交量周期
      multiplier: 1.5 // 新增：比较倍数
    },
    price: {
      threshold: 100.0,
      operator: '>',
      timeframe: '1d'
    },
    // 新增指标
    trend: {
      period: 200,
      timeframe: '1d',
      condition: 'slope', // slope: 斜率, price: 价格位置
      direction: 'down' // down: 向下, up: 向上
    },
    candlestick: {
      timeframe: '1d',
      pattern: 'bullish' // bullish: 阳线, bearish: 阴线
    }
  },
  // 逻辑节点参数
  logic: {
    and: { type: 'and' },
    or: { type: 'or' },
    not: { type: 'not' }
  },
  // 动作节点参数
  action: {
    buy: {
      type: 'buy',
      quantity: 100,
      priceType: 'market'
    },
    sell: {
      type: 'sell',
      quantity: 100,
      priceType: 'market'
    },
    hold: {
      type: 'hold'
    }
  }
}

export const useStrategyStore = create((set, get) => ({
  // 节点参数状态
  nodeParams: {},
  
  // 当前选中的节点
  selectedNodeId: null,
  
  // 设置节点参数
  setNodeParams: (nodeId, nodeType, subType, params) => {
    set((state) => ({
      nodeParams: {
        ...state.nodeParams,
        [nodeId]: {
          nodeType,
          subType,
          ...params
        }
      }
    }))
  },
  
  // 获取节点参数
  getNodeParams: (nodeId) => {
    const state = get()
    return state.nodeParams[nodeId] || null
  },
  
  // 初始化节点参数
  initNodeParams: (nodeId, nodeType, subType, initial = {}) => {
    const state = get()
    if (!state.nodeParams[nodeId]) {
      const defaultParams = defaultNodeParams[nodeType]?.[subType] || {}
      // 使用画布节点自带的数据作为初始值，覆盖默认值（避免丢失如 MACD 的 mode 等）
      const seed = { ...defaultParams, ...initial }
      set((state) => ({
        nodeParams: {
          ...state.nodeParams,
          [nodeId]: {
            nodeType,
            subType,
            ...seed
          }
        }
      }))
    }
  },
  
  // 更新节点参数
  updateNodeParams: (nodeId, params) => {
    set((state) => ({
      nodeParams: {
        ...state.nodeParams,
        [nodeId]: {
          ...state.nodeParams[nodeId],
          ...params
        }
      }
    }))
  },
  
  // 设置选中的节点
  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId })
  },
  
  // 清除选中的节点
  clearSelectedNode: () => {
    set({ selectedNodeId: null })
  },
  
  // 删除节点参数
  removeNodeParams: (nodeId) => {
    set((state) => {
      const newParams = { ...state.nodeParams }
      delete newParams[nodeId]
      return {
        nodeParams: newParams,
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId
      }
    })
  },
  
  // 重置所有参数
  resetAllParams: () => {
    set({
      nodeParams: {},
      selectedNodeId: null
    })
  }
}))
