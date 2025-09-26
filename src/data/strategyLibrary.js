// 日线 10 策略（节点近似表达，避免未来函数），按用户设计原则
export const strategyLibrary = [
  // 1) 双均线金叉死叉策略（用 MACD(5,20,5) 金叉/死叉近似 MA5/MA20 交叉）
  {
    id: 'lib-d-ma5-ma20-cross',
    name: '日线双均线金叉死叉',
    description: '5日上穿20日买入，下穿20日卖出（用MACD(5,20,5)金叉/死叉近似实现）。',
    principle: '短均线与长均线交叉作为趋势拐点。',
    scenarios: '日线趋势行情。',
    tips: '可配合止损止盈与仓位分配。',
    recommended: '1d',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'ma_cross_gc', type: 'condition', position: { x: 80, y: 120 }, data: { nodeType: 'condition', subType: 'macd', type: 'macd', fast: 5, slow: 20, signal: 5, mode: 'golden_cross', timeframe: '1d' } },
        { id: 'buy', type: 'action', position: { x: 320, y: 120 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 500, priceType: 'market' } },
        { id: 'ma_cross_dc', type: 'condition', position: { x: 80, y: 220 }, data: { nodeType: 'condition', subType: 'macd', type: 'macd', fast: 5, slow: 20, signal: 5, mode: 'death_cross', timeframe: '1d' } },
        { id: 'sell', type: 'action', position: { x: 320, y: 220 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 500, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'ma_cross_gc', target: 'buy' }, { id: 'e2', source: 'ma_cross_dc', target: 'sell' } ],
      start_date: '2025-01-01', end_date: '2025-12-31', initial_capital: 100000
    }
  },

  // 2) 布林带反弹策略（近似）：下轨附近反弹买，上轨突破卖
  {
    id: 'lib-d-boll-rebound',
    name: '日线布林带反弹',
    description: '收盘价接近下轨买，上轨突破卖（近似表达反弹确认）。',
    principle: '波动率通道边界的均值回归与过冲。',
    scenarios: '震荡区间。',
    tips: '强单边行情下易造成亏损，配合风控。',
    recommended: '1d',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'near_lower', type: 'condition', position: { x: 80, y: 140 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'position', direction: 'lower', timeframe: '1d' } },
        { id: 'buy', type: 'action', position: { x: 320, y: 140 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 400, priceType: 'market' } },
        { id: 'break_upper', type: 'condition', position: { x: 80, y: 240 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'breakout', direction: 'upper', timeframe: '1d' } },
        { id: 'sell', type: 'action', position: { x: 320, y: 240 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 400, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'near_lower', target: 'buy' }, { id: 'e2', source: 'break_upper', target: 'sell' } ],
      start_date: '2025-01-01', end_date: '2025-12-31', initial_capital: 100000
    }
  },

  // 3) RSI 超卖反弹策略
  {
    id: 'lib-d-rsi-oversold',
    name: '日线RSI超卖反弹',
    description: 'RSI<30 买入，RSI>70 卖出。',
    principle: '超买超卖的均值回归。',
    scenarios: '日线震荡。',
    tips: '与趋势过滤组合更稳健。',
    recommended: '1d',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'rsi_buy', type: 'condition', position: { x: 80, y: 140 }, data: { nodeType: 'condition', subType: 'rsi', type: 'rsi', period: 14, threshold: 30, operator: '<', timeframe: '1d' } },
        { id: 'buy', type: 'action', position: { x: 300, y: 140 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 400, priceType: 'market' } },
        { id: 'rsi_sell', type: 'condition', position: { x: 80, y: 240 }, data: { nodeType: 'condition', subType: 'rsi', type: 'rsi', period: 14, threshold: 70, operator: '>', timeframe: '1d' } },
        { id: 'sell', type: 'action', position: { x: 300, y: 240 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 400, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'rsi_buy', target: 'buy' }, { id: 'e2', source: 'rsi_sell', target: 'sell' } ],
      start_date: '2025-01-01', end_date: '2025-12-31', initial_capital: 100000
    }
  },

  // 4) MACD 金叉死叉策略
  {
    id: 'lib-d-macd-cross',
    name: '日线MACD金叉死叉',
    description: 'MACD金叉买入、死叉卖出。',
    principle: '动量拐点。',
    scenarios: '波段趋势。',
    tips: '配合量能更稳健。',
    recommended: '1d',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'macd_gc', type: 'condition', position: { x: 80, y: 140 }, data: { nodeType: 'condition', subType: 'macd', type: 'macd', fast: 12, slow: 26, signal: 9, mode: 'golden_cross', timeframe: '1d' } },
        { id: 'buy', type: 'action', position: { x: 320, y: 140 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 400, priceType: 'market' } },
        { id: 'macd_dc', type: 'condition', position: { x: 80, y: 240 }, data: { nodeType: 'condition', subType: 'macd', type: 'macd', fast: 12, slow: 26, signal: 9, mode: 'death_cross', timeframe: '1d' } },
        { id: 'sell', type: 'action', position: { x: 320, y: 240 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 400, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'macd_gc', target: 'buy' }, { id: 'e2', source: 'macd_dc', target: 'sell' } ],
      start_date: '2025-01-01', end_date: '2025-12-31', initial_capital: 100000
    }
  },

  // 5) 量能突破策略：价破20日高 + 量>均量（近似）
  {
    id: 'lib-d-volume-breakout',
    name: '日线量能突破',
    description: '价格突破20日高且量能放大（近似波带上轨突破+量能>均量）。',
    principle: '价量齐升确认突破。',
    scenarios: '放量突破。',
    tips: '缩量回落退出。',
    recommended: '1d',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'break_upper', type: 'condition', position: { x: 80, y: 140 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'breakout', direction: 'upper', timeframe: '1d' } },
        { id: 'vol_gt_ma', type: 'condition', position: { x: 80, y: 220 }, data: { nodeType: 'condition', subType: 'volume', type: 'volume', avgPeriod: 20, multiplier: 1.2, operator: '>', timeframe: '1d' } },
        { id: 'and', type: 'logic', position: { x: 260, y: 180 }, data: { type: 'and' } },
        { id: 'buy', type: 'action', position: { x: 420, y: 180 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 400, priceType: 'market' } },
        { id: 'lower_exit', type: 'condition', position: { x: 80, y: 300 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'position', direction: 'lower', timeframe: '1d' } },
        { id: 'sell', type: 'action', position: { x: 420, y: 300 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 400, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'break_upper', target: 'and' }, { id: 'e2', source: 'vol_gt_ma', target: 'and' }, { id: 'e3', source: 'and', target: 'buy' }, { id: 'e4', source: 'lower_exit', target: 'sell' } ],
      start_date: '2025-01-01', end_date: '2025-12-31', initial_capital: 100000
    }
  },

  // 6) 放量长阳策略（近似）：量>2×均量 + 上轨突破；卖出：跌破MA5
  {
    id: 'lib-d-strong-up',
    name: '日线放量长阳',
    description: '量能2×均量配合上轨突破；跌破MA5退出（近似）。',
    principle: '强势阳线常伴随放量与通道突破。',
    scenarios: '强势拉升阶段。',
    tips: '谨防追高风险，设置止损。',
    recommended: '1d',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'vol2x', type: 'condition', position: { x: 80, y: 140 }, data: { nodeType: 'condition', subType: 'volume', type: 'volume', avgPeriod: 20, multiplier: 2.0, operator: '>', timeframe: '1d' } },
        { id: 'break_upper', type: 'condition', position: { x: 80, y: 220 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'breakout', direction: 'upper', timeframe: '1d' } },
        { id: 'and', type: 'logic', position: { x: 260, y: 180 }, data: { type: 'and' } },
        { id: 'buy', type: 'action', position: { x: 420, y: 180 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 400, priceType: 'market' } },
        { id: 'ma5_exit', type: 'condition', position: { x: 80, y: 300 }, data: { nodeType: 'condition', subType: 'ma', type: 'ma', period: 5, threshold: 0, operator: '<', timeframe: '1d' } },
        { id: 'sell', type: 'action', position: { x: 420, y: 300 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 400, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'vol2x', target: 'and' }, { id: 'e2', source: 'break_upper', target: 'and' }, { id: 'e3', source: 'and', target: 'buy' }, { id: 'e4', source: 'ma5_exit', target: 'sell' } ],
      start_date: '2025-01-01', end_date: '2025-12-31', initial_capital: 100000
    }
  },

  // 7) 突破回踩策略（近似）：上轨突破买，跌回MA20卖
  {
    id: 'lib-d-break-pullback',
    name: '日线突破回踩',
    description: '通道突破入场，失守MA20退出（近似回踩确认）。',
    principle: '突破后回撤的支撑确认。',
    scenarios: '趋势推进。',
    tips: '加止损与仓位管理。',
    recommended: '1d',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'break_upper', type: 'condition', position: { x: 80, y: 140 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'breakout', direction: 'upper', timeframe: '1d' } },
        { id: 'buy', type: 'action', position: { x: 320, y: 140 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 300, priceType: 'market' } },
        { id: 'ma20_exit', type: 'condition', position: { x: 80, y: 240 }, data: { nodeType: 'condition', subType: 'ma', type: 'ma', period: 20, threshold: 0, operator: '<', timeframe: '1d' } },
        { id: 'sell', type: 'action', position: { x: 320, y: 240 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 300, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'break_upper', target: 'buy' }, { id: 'e2', source: 'ma20_exit', target: 'sell' } ],
      start_date: '2025-01-01', end_date: '2025-12-31', initial_capital: 100000
    }
  },

  // 8) OBV 趋势确认策略（近似：长期趋势上行 + 站上MA10；趋势转弱卖）
  {
    id: 'lib-d-obv-confirm',
    name: '日线OBV趋势确认（近似）',
    description: '长期趋势上行 + 短期均线上方近似OBV走强。',
    principle: '趋势与量价共振。',
    scenarios: '趋势型个股。',
    tips: '真OBV需专用指标，本策略近似。',
    recommended: '1d',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'ma200_up', type: 'condition', position: { x: 80, y: 140 }, data: { nodeType: 'condition', subType: 'ma', type: 'ma', period: 200, threshold: 0, operator: '>', timeframe: '1d' } },
        { id: 'ma10_up', type: 'condition', position: { x: 80, y: 220 }, data: { nodeType: 'condition', subType: 'ma', type: 'ma', period: 10, threshold: 0, operator: '>', timeframe: '1d' } },
        { id: 'and', type: 'logic', position: { x: 260, y: 180 }, data: { type: 'and' } },
        { id: 'buy', type: 'action', position: { x: 420, y: 180 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 300, priceType: 'market' } },
        { id: 'ma200_down', type: 'condition', position: { x: 80, y: 300 }, data: { nodeType: 'condition', subType: 'ma', type: 'ma', period: 200, threshold: 0, operator: '<', timeframe: '1d' } },
        { id: 'sell', type: 'action', position: { x: 420, y: 300 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 300, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'ma200_up', target: 'and' }, { id: 'e2', source: 'ma10_up', target: 'and' }, { id: 'e3', source: 'and', target: 'buy' }, { id: 'e4', source: 'ma200_down', target: 'sell' } ],
      start_date: '2025-01-01', end_date: '2025-12-31', initial_capital: 100000
    }
  },

  // 9) ATR 波动率突破策略（近似：上轨突破 + 量能扩张；下轨卖出）
  {
    id: 'lib-d-atr-break',
    name: '日线ATR波动突破（近似）',
    description: '通道突破 + 量能扩张近似ATR放大条件。',
    principle: '波动扩张常伴随突破。',
    scenarios: '趋势开启阶段。',
    tips: '配合止损。',
    recommended: '1d',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'break_upper', type: 'condition', position: { x: 80, y: 160 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'breakout', direction: 'upper', timeframe: '1d' } },
        { id: 'vol_exp', type: 'condition', position: { x: 80, y: 260 }, data: { nodeType: 'condition', subType: 'volume', type: 'volume', avgPeriod: 20, multiplier: 1.5, operator: '>', timeframe: '1d' } },
        { id: 'and', type: 'logic', position: { x: 260, y: 210 }, data: { type: 'and' } },
        { id: 'buy', type: 'action', position: { x: 420, y: 210 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 300, priceType: 'market' } },
        { id: 'lower_exit', type: 'condition', position: { x: 80, y: 340 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'position', direction: 'lower', timeframe: '1d' } },
        { id: 'sell', type: 'action', position: { x: 420, y: 340 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 300, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'break_upper', target: 'and' }, { id: 'e2', source: 'vol_exp', target: 'and' }, { id: 'e3', source: 'and', target: 'buy' }, { id: 'e4', source: 'lower_exit', target: 'sell' } ],
      start_date: '2025-01-01', end_date: '2025-12-31', initial_capital: 100000
    }
  },

  // 10) 成交额强势股筛选（近似：量能强 + MA10 上方；量能萎缩 + 跌破MA10卖）
  {
    id: 'lib-d-amount-strong',
    name: '日线成交额强势股（近似）',
    description: '量能强势且站上MA10；量能萎缩并跌破MA10退出。',
    principle: '强势个股常伴随成交放大与短期强势。',
    scenarios: '强势股筛选。',
    tips: 'Universe 排名需后端支持，这里用量能近似。',
    recommended: '1d',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'vol_ok', type: 'condition', position: { x: 80, y: 140 }, data: { nodeType: 'condition', subType: 'volume', type: 'volume', avgPeriod: 20, multiplier: 1.5, operator: '>', timeframe: '1d' } },
        { id: 'ma10_up', type: 'condition', position: { x: 80, y: 220 }, data: { nodeType: 'condition', subType: 'ma', type: 'ma', period: 10, threshold: 0, operator: '>', timeframe: '1d' } },
        { id: 'and', type: 'logic', position: { x: 260, y: 180 }, data: { type: 'and' } },
        { id: 'buy', type: 'action', position: { x: 420, y: 180 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 300, priceType: 'market' } },
        { id: 'ma10_exit', type: 'condition', position: { x: 80, y: 300 }, data: { nodeType: 'condition', subType: 'ma', type: 'ma', period: 10, threshold: 0, operator: '<', timeframe: '1d' } },
        { id: 'sell', type: 'action', position: { x: 420, y: 300 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 300, priceType: 'market' } },
      ],
      edges: [ { id: 'e1', source: 'vol_ok', target: 'and' }, { id: 'e2', source: 'ma10_up', target: 'and' }, { id: 'e3', source: 'and', target: 'buy' }, { id: 'e4', source: 'ma10_exit', target: 'sell' } ],
      start_date: '2025-01-01', end_date: '2025-12-31', initial_capital: 100000
    }
  },
  
  // 11) 网格交易策略（参数以 meta 形式提供，滤波用现有节点近似表达）
  {
    id: 'lib-grid-trading',
    name: '网格交易策略',
    description: '价格区间划分网格，跌破买入、上触卖出；含趋势/波动过滤与止损。',
    principle: '在震荡区间内通过低买高卖获取价差；趋势/波动过滤用于避免单边与假突破。',
    scenarios: '震荡市、高波动但非单边行情。',
    tips: '避免在强单边趋势中使用；建议配合风险控制。',
    recommended: '5m~1h',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      // 网格核心参数（前端可用于展示/编辑；当前引擎暂不执行该元参数）
      meta: {
        grid: {
          upDownPct: 0.10,        // 上下幅度 ±10%
          numGrids: 10,           // 网格数量
          positionMode: 'quarter',// 全仓/half/third/quarter
          lotSize: 100,           // 最小单位100股
          useTrendFilter: true,   // 启用MA60过滤
          useVolFilter: true,     // 启用布林带收窄过滤
          stopLossPct: 0.05       // 累计浮亏止损 5%
        }
      },
      // 用节点近似表达过滤器：价格在MA60之上与布林收窄（以布林节点占位）
      nodes: [
        { id: 'ma60_up', type: 'condition', position: { x: 80, y: 120 }, data: { nodeType: 'condition', subType: 'ma', type: 'ma', period: 60, threshold: 0, operator: '>', timeframe: '5m' } },
        { id: 'boll_narrow', type: 'condition', position: { x: 80, y: 200 }, data: { nodeType: 'condition', subType: 'bollinger', type: 'bollinger', period: 20, stdDev: 2, condition: 'narrow', widthThresholdPct: 0.03, timeframe: '5m' } },
        { id: 'and', type: 'logic', position: { x: 250, y: 160 }, data: { type: 'and' } },
        // 占位买卖动作：实际网格买卖由 meta 参数定义（当前引擎不执行，仅占位）
        { id: 'buy', type: 'action', position: { x: 400, y: 140 }, data: { nodeType: 'action', subType: 'buy', type: 'buy', quantity: 100, priceType: 'market' } },
        { id: 'sell', type: 'action', position: { x: 400, y: 220 }, data: { nodeType: 'action', subType: 'sell', type: 'sell', quantity: 100, priceType: 'market' } },
      ],
      edges: [
        { id: 'e1', source: 'ma60_up', target: 'and' },
        { id: 'e2', source: 'boll_narrow', target: 'and' },
        { id: 'e3', source: 'and', target: 'buy' },
        { id: 'e4', source: 'and', target: 'sell' },
      ],
      start_date: '2025-01-01', end_date: '2025-12-31', initial_capital: 100000
    }
  },
]
// 预置“策略库” - 八大经典交易系统（用现有指标近似实现）



// 清空并重建五条宽松、易触发的策略（含股票/期货通用）
export const strategyLibrary2 = [
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
