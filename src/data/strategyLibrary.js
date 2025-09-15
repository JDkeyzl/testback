// 预置“策略库” - 八大经典交易系统（用现有指标近似实现）

// 清空并重建五条宽松、易触发的策略（含股票/期货通用）
export const strategyLibrary = [
  // 1) RSI + 布林带 + MACD 组合策略（宽松触发）
  {
    id: 'lib-combo-rsi-boll-macd',
    name: '组合策略：RSI + 布林带 + MACD',
    description: 'RSI超卖+价格接近布林带下轨+MACD阈值辅助，宽松触发，适合震荡偏趋势。',
    principle: '多指标共振提升胜率：超卖回归 + 波动率边界 + 趋势动量确认。',
    scenarios: '震荡中的回撤买入、温和趋势回调；在强单边中注意止损。',
    tips: '放宽阈值以增加成交；可配合分批与止损止盈。',
    recommended: '5m/15m/1h',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'rsi_oversold', type: 'condition', position: { x: 80, y: 80 }, data: { nodeType: 'condition', subType: 'rsi', type: 'rsi', period: 14, threshold: 35, operator: '<', timeframe: '5m' } },
        { id: 'boll_near_lower', type: 'condition', position: { x: 80, y: 180 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'position', direction: 'lower', timeframe: '5m' } },
        { id: 'macd_filter', type: 'condition', position: { x: 80, y: 280 }, data: { nodeType: 'condition', subType: 'macd', type: 'macd', fast: 12, slow: 26, signal: 9, threshold: -0.005, operator: '>', timeframe: '5m' } },
        { id: 'logic_any', type: 'logic', position: { x: 260, y: 160 }, data: { type: 'or' } },
        { id: 'action_buy', type: 'action', position: { x: 440, y: 160 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 500, priceType: 'market' } },
      ],
      edges: [
        { id: 'e1', source: 'rsi_oversold', target: 'logic_any' },
        { id: 'e2', source: 'boll_near_lower', target: 'logic_any' },
        { id: 'e3', source: 'macd_filter', target: 'logic_any' },
        { id: 'e4', source: 'logic_any', target: 'action_buy' },
      ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  },

  // 2) 布林带突破（更宽松）
  {
    id: 'lib-boll-break-loose',
    name: '布林带宽松突破',
    description: '上轨附近即买入、下轨附近卖出，阈值宽松提高触发频率。',
    principle: '利用波动率通道边界进行顺势/反转入场。',
    scenarios: '波段震荡、温和趋势。',
    tips: '结合止损；避免极端单边。',
    recommended: '5m/15m',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'boll_up', type: 'condition', position: { x: 80, y: 100 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'breakout', direction: 'upper', timeframe: '5m' } },
        { id: 'buy', type: 'action', position: { x: 300, y: 100 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 600, priceType: 'market' } },
        { id: 'boll_dn', type: 'condition', position: { x: 80, y: 220 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'breakout', direction: 'lower', timeframe: '5m' } },
        { id: 'sell', type: 'action', position: { x: 300, y: 220 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 600, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'boll_up', target: 'buy' }, { id: 'e2', source: 'boll_dn', target: 'sell' } ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  },

  // 3) RSI 宽松反转
  {
    id: 'lib-rsi-loose',
    name: 'RSI 宽松反转',
    description: 'RSI<40 买入，RSI>60 卖出，更易产生信号。',
    principle: '均值回归的宽容阈值。',
    scenarios: '区间震荡、箱体。',
    tips: '建议配合布林带/趋势过滤。',
    recommended: '5m/15m/1h',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'rsi_low', type: 'condition', position: { x: 80, y: 120 }, data: { nodeType: 'condition', subType: 'rsi', type: 'rsi', period: 14, threshold: 40, operator: '<', timeframe: '5m' } },
        { id: 'buy', type: 'action', position: { x: 280, y: 120 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 500, priceType: 'market' } },
        { id: 'rsi_high', type: 'condition', position: { x: 80, y: 240 }, data: { nodeType: 'condition', subType: 'rsi', type: 'rsi', period: 14, threshold: 60, operator: '>', timeframe: '5m' } },
        { id: 'sell', type: 'action', position: { x: 280, y: 240 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 500, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'rsi_low', target: 'buy' }, { id: 'e2', source: 'rsi_high', target: 'sell' } ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  },

  // 4) MACD 宽松动量
  {
    id: 'lib-macd-loose',
    name: 'MACD 宽松动量',
    description: 'MACD差值> -0.002 作为买入过滤，低门槛触发。',
    principle: '弱势动量转强的早期入场。',
    scenarios: '趋势初期/回撤末端。',
    tips: '配合量能/布林带过滤提升质量。',
    recommended: '5m/15m',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'macd_ok', type: 'condition', position: { x: 80, y: 160 }, data: { nodeType: 'condition', subType: 'macd', type: 'macd', fast: 12, slow: 26, signal: 9, threshold: -0.002, operator: '>', timeframe: '5m' } },
        { id: 'buy', type: 'action', position: { x: 300, y: 160 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 600, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'macd_ok', target: 'buy' } ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  },

  // 5) VWAP 偏离均值回归
  {
    id: 'lib-vwap-meanrevert',
    name: 'VWAP 偏离均值回归',
    description: '价格低于VWAP 1% 买入，高于1% 卖出，滚动窗口20。',
    principle: '围绕成交均价的回归/过冲。',
    scenarios: '高流动性标的的日内/分钟级。',
    tips: '配合趋势过滤与止损。',
    recommended: '1m/5m',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'vwap_low', type: 'condition', position: { x: 80, y: 120 }, data: { nodeType: 'condition', subType: 'vwap', type: 'vwap', period: 20, deviation: 0.01, operator: 'below', timeframe: '1m' } },
        { id: 'buy', type: 'action', position: { x: 300, y: 120 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 300, priceType: 'market' } },
        { id: 'vwap_high', type: 'condition', position: { x: 80, y: 240 }, data: { nodeType: 'condition', subType: 'vwap', type: 'vwap', period: 20, deviation: 0.01, operator: 'above', timeframe: '1m' } },
        { id: 'sell', type: 'action', position: { x: 300, y: 240 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 300, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'vwap_low', target: 'buy' }, { id: 'e2', source: 'vwap_high', target: 'sell' } ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  }
]


