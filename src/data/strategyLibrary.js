// 预置“策略库” - 八大经典交易系统（用现有指标近似实现）

export const strategyLibrary = [
  {
    id: 'lib-turtle-breakout',
    name: '海龟交易法则（布林带突破近似）',
    description: '价格突破布林带上轨买入，跌破下轨卖出，趋势跟随与风控示例。',
    principle: '以价格突破通道（上轨/下轨）定义趋势的建立与破坏，顺势持有，破位平仓。',
    scenarios: '趋势行情、波动率扩大阶段；震荡市容易产生来回打止损。',
    tips: '可调节布林带周期与倍数以适配不同波动率；搭配ATR止损与分批建仓效果更佳。',
    recommended: '建议日线（1d）',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'boll_up', type: 'condition', position: { x: 100, y: 100 }, data: { type: 'bollinger', period: 20, threshold: 0, operator: 'above', nodeType: 'condition', subType: 'bollinger', timeframe: '5m', description: '价格突破上轨' } },
        { id: 'boll_dn', type: 'condition', position: { x: 100, y: 200 }, data: { type: 'bollinger', period: 20, threshold: 0, operator: 'below', nodeType: 'condition', subType: 'bollinger', timeframe: '5m', description: '价格跌破下轨' } },
        { id: 'pos_buy', type: 'position', position: { x: 220, y: 100 }, data: { type: 'position', quantity: 1000, maxPosition: 5000, nodeType: 'position', subType: 'buy', timeframe: '5m', description: '分批买入示例' } },
        { id: 'pos_sell', type: 'position', position: { x: 220, y: 200 }, data: { type: 'position', quantity: 1000, maxPosition: 5000, nodeType: 'position', subType: 'sell', timeframe: '5m', description: '分批卖出示例' } },
        { id: 'act_buy', type: 'action', position: { x: 320, y: 100 }, data: { type: 'buy', quantity: 1000, priceType: 'market', nodeType: 'action', subType: 'buy', timeframe: '5m', description: '执行买入' } },
        { id: 'act_sell', type: 'action', position: { x: 320, y: 200 }, data: { type: 'sell', quantity: 1000, priceType: 'market', nodeType: 'action', subType: 'sell', timeframe: '5m', description: '执行卖出' } }
      ],
      edges: [
        { id: 'e1', source: 'boll_up', target: 'pos_buy' },
        { id: 'e2', source: 'pos_buy', target: 'act_buy' },
        { id: 'e3', source: 'boll_dn', target: 'pos_sell' },
        { id: 'e4', source: 'pos_sell', target: 'act_sell' }
      ],
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      initial_capital: 100000,
      commission_rate: 0.001
    }
  },
  {
    id: 'lib-dow-theory',
    name: '道氏理论（双均线趋势近似）',
    description: '短期均线上穿长期均线买入，下穿卖出，趋势跟随。',
    principle: '用均线交叉近似主要趋势的确立与反转，顺大势、弃小波。',
    scenarios: '单边趋势明显品种或阶段；区间震荡时假信号偏多。',
    tips: '放大均线周期可减少噪音；配合波动率过滤或量能确认提高胜率。',
    recommended: '建议日线（1d）',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'ma_up', type: 'condition', position: { x: 100, y: 100 }, data: { type: 'ma', period: 5, threshold: 0, operator: 'crossover', nodeType: 'condition', subType: 'ma', timeframe: '5m', description: '短期均线上穿' } },
        { id: 'ma_dn', type: 'condition', position: { x: 100, y: 200 }, data: { type: 'ma', period: 5, threshold: 0, operator: 'crossunder', nodeType: 'condition', subType: 'ma', timeframe: '5m', description: '短期均线下穿' } },
        { id: 'pos_buy', type: 'position', position: { x: 220, y: 100 }, data: { type: 'position', quantity: 1000, maxPosition: 6000, nodeType: 'position', subType: 'buy', timeframe: '5m' } },
        { id: 'pos_sell', type: 'position', position: { x: 220, y: 200 }, data: { type: 'position', quantity: 1000, maxPosition: 6000, nodeType: 'position', subType: 'sell', timeframe: '5m' } },
        { id: 'act_buy', type: 'action', position: { x: 320, y: 100 }, data: { type: 'buy', quantity: 1000, priceType: 'market', nodeType: 'action', subType: 'buy', timeframe: '5m' } },
        { id: 'act_sell', type: 'action', position: { x: 320, y: 200 }, data: { type: 'sell', quantity: 1000, priceType: 'market', nodeType: 'action', subType: 'sell', timeframe: '5m' } }
      ],
      edges: [
        { id: 'e1', source: 'ma_up', target: 'pos_buy' },
        { id: 'e2', source: 'pos_buy', target: 'act_buy' },
        { id: 'e3', source: 'ma_dn', target: 'pos_sell' },
        { id: 'e4', source: 'pos_sell', target: 'act_sell' }
      ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  },
  {
    id: 'lib-gann',
    name: '江恩系统（趋势近似）',
    description: '以均线趋势近似江恩要点：顺势而为，破位退出。',
    principle: '以价格相对均线的位置与穿越近似关键角度与趋势线的判定，强势持有，跌破离场。',
    scenarios: '中长线趋势持有；横盘或无趋势阶段易来回震荡。',
    tips: '结合更长周期（周/日）均线作为趋势过滤；多级别共振更稳健。',
    recommended: '建议日线（1d）',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'ma_trend_up', type: 'condition', position: { x: 100, y: 100 }, data: { type: 'ma', period: 20, threshold: 0, operator: 'crossover', nodeType: 'condition', subType: 'ma', timeframe: '5m', description: '价格上穿MA20' } },
        { id: 'ma_trend_dn', type: 'condition', position: { x: 100, y: 200 }, data: { type: 'ma', period: 20, threshold: 0, operator: 'crossunder', nodeType: 'condition', subType: 'ma', timeframe: '5m', description: '价格下穿MA20' } },
        { id: 'pos_buy', type: 'position', position: { x: 220, y: 100 }, data: { type: 'position', quantity: 1000, maxPosition: 6000, nodeType: 'position', subType: 'buy', timeframe: '5m' } },
        { id: 'pos_sell', type: 'position', position: { x: 220, y: 200 }, data: { type: 'position', quantity: 1000, maxPosition: 6000, nodeType: 'position', subType: 'sell', timeframe: '5m' } },
        { id: 'act_buy', type: 'action', position: { x: 320, y: 100 }, data: { type: 'buy', quantity: 1000, priceType: 'market', nodeType: 'action', subType: 'buy', timeframe: '5m' } },
        { id: 'act_sell', type: 'action', position: { x: 320, y: 200 }, data: { type: 'sell', quantity: 1000, priceType: 'market', nodeType: 'action', subType: 'sell', timeframe: '5m' } }
      ],
      edges: [
        { id: 'e1', source: 'ma_trend_up', target: 'pos_buy' },
        { id: 'e2', source: 'pos_buy', target: 'act_buy' },
        { id: 'e3', source: 'ma_trend_dn', target: 'pos_sell' },
        { id: 'e4', source: 'pos_sell', target: 'act_sell' }
      ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  },
  {
    id: 'lib-elliott',
    name: '艾略特波浪（均线趋势近似）',
    description: '以均线趋势近似波浪主升段，简化入场/出场规则。',
    principle: '用均线趋势代表主升/回撤段，突破入场、跌破离场，避免主观波浪计数。',
    scenarios: '中期趋势清晰时；主观判断较少，执行更机械化。',
    tips: '突破后分批加仓，回撤至均线减仓；结合布林带中轨或趋势线辅助。',
    recommended: '建议日线（1d）或4小时（4h）',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'ma_up', type: 'condition', position: { x: 100, y: 120 }, data: { type: 'ma', period: 20, threshold: 0, operator: 'crossover', nodeType: 'condition', subType: 'ma', timeframe: '1d', description: '短期均线上穿（10日上穿20日）' } },
        { id: 'ma_dn', type: 'condition', position: { x: 100, y: 220 }, data: { type: 'ma', period: 20, threshold: 0, operator: 'crossunder', nodeType: 'condition', subType: 'ma', timeframe: '1d', description: '短期均线下穿（10日下穿20日）' } },
        { id: 'pos_buy', type: 'position', position: { x: 220, y: 120 }, data: { type: 'position', quantity: 800, maxPosition: 4000, nodeType: 'position', subType: 'buy', timeframe: '5m' } },
        { id: 'pos_sell', type: 'position', position: { x: 220, y: 220 }, data: { type: 'position', quantity: 800, maxPosition: 4000, nodeType: 'position', subType: 'sell', timeframe: '5m' } },
        { id: 'act_buy', type: 'action', position: { x: 320, y: 120 }, data: { type: 'buy', quantity: 800, priceType: 'market', nodeType: 'action', subType: 'buy', timeframe: '5m' } },
        { id: 'act_sell', type: 'action', position: { x: 320, y: 220 }, data: { type: 'sell', quantity: 800, priceType: 'market', nodeType: 'action', subType: 'sell', timeframe: '5m' } }
      ],
      edges: [ { id: 'e1', source: 'ma_up', target: 'pos_buy' }, { id: 'e2', source: 'pos_buy', target: 'act_buy' }, { id: 'e3', source: 'ma_dn', target: 'pos_sell' }, { id: 'e4', source: 'pos_sell', target: 'act_sell' } ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  },
  {
    id: 'lib-rsi',
    name: 'RSI 相对强弱策略',
    description: 'RSI<30买入，RSI>70卖出，反转型策略。',
    principle: '以RSI超买超卖反转为核心，买弱（超卖）卖强（超买），博均值回归。',
    scenarios: '震荡市和箱体内更有效；强趋势中容易“越买越弱/越卖越强”。',
    tips: '适当抬高/降低阈值（20/80）减少震荡；结合布林带或分位数过滤极端点。',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'rsi_low', type: 'condition', position: { x: 100, y: 100 }, data: { type: 'rsi', period: 14, threshold: 30, operator: 'below', nodeType: 'condition', subType: 'rsi', timeframe: '5m' } },
        { id: 'rsi_high', type: 'condition', position: { x: 100, y: 200 }, data: { type: 'rsi', period: 14, threshold: 70, operator: 'above', nodeType: 'condition', subType: 'rsi', timeframe: '5m' } },
        { id: 'pos_buy', type: 'position', position: { x: 220, y: 100 }, data: { type: 'position', quantity: 800, maxPosition: 4000, nodeType: 'position', subType: 'buy', timeframe: '5m' } },
        { id: 'pos_sell', type: 'position', position: { x: 220, y: 200 }, data: { type: 'position', quantity: 800, maxPosition: 4000, nodeType: 'position', subType: 'sell', timeframe: '5m' } },
        { id: 'act_buy', type: 'action', position: { x: 320, y: 100 }, data: { type: 'buy', quantity: 800, priceType: 'market', nodeType: 'action', subType: 'buy', timeframe: '5m' } },
        { id: 'act_sell', type: 'action', position: { x: 320, y: 200 }, data: { type: 'sell', quantity: 800, priceType: 'market', nodeType: 'action', subType: 'sell', timeframe: '5m' } }
      ],
      edges: [ { id: 'e1', source: 'rsi_low', target: 'pos_buy' }, { id: 'e2', source: 'pos_buy', target: 'act_buy' }, { id: 'e3', source: 'rsi_high', target: 'pos_sell' }, { id: 'e4', source: 'pos_sell', target: 'act_sell' } ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  },
  {
    id: 'lib-macd-trend',
    name: 'MACD 趋势策略（均线近似）',
    description: '用均线交叉近似MACD金叉死叉，趋势跟随。',
    principle: '以快慢均线交叉近似MACD快慢线交叉，顺势跟踪中期趋势。',
    scenarios: '趋势启动与延续阶段；震荡市信号频繁。',
    tips: '结合量能或波动率过滤；应用止损止盈与移动止损提升收益回撤比。',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'ma_up', type: 'condition', position: { x: 100, y: 100 }, data: { type: 'ma', period: 12, threshold: 0, operator: 'crossover', nodeType: 'condition', subType: 'ma', timeframe: '5m' } },
        { id: 'ma_dn', type: 'condition', position: { x: 100, y: 200 }, data: { type: 'ma', period: 12, threshold: 0, operator: 'crossunder', nodeType: 'condition', subType: 'ma', timeframe: '5m' } },
        { id: 'pos_buy', type: 'position', position: { x: 220, y: 100 }, data: { type: 'position', quantity: 1000, maxPosition: 5000, nodeType: 'position', subType: 'buy', timeframe: '5m' } },
        { id: 'pos_sell', type: 'position', position: { x: 220, y: 200 }, data: { type: 'position', quantity: 1000, maxPosition: 5000, nodeType: 'position', subType: 'sell', timeframe: '5m' } },
        { id: 'act_buy', type: 'action', position: { x: 320, y: 100 }, data: { type: 'buy', quantity: 1000, priceType: 'market', nodeType: 'action', subType: 'buy', timeframe: '5m' } },
        { id: 'act_sell', type: 'action', position: { x: 320, y: 200 }, data: { type: 'sell', quantity: 1000, priceType: 'market', nodeType: 'action', subType: 'sell', timeframe: '5m' } }
      ],
      edges: [ { id: 'e1', source: 'ma_up', target: 'pos_buy' }, { id: 'e2', source: 'pos_buy', target: 'act_buy' }, { id: 'e3', source: 'ma_dn', target: 'pos_sell' }, { id: 'e4', source: 'pos_sell', target: 'act_sell' } ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  },
  {
    id: 'lib-boll-break',
    name: '布林带突破策略',
    description: '突破上轨做多，跌破下轨平仓或做空（近似）。',
    principle: '以波动率通道的突破表征趋势启动，通道内回归视为震荡。',
    scenarios: '波动率扩张、趋势形成阶段；箱体震荡阶段易反复。',
    tips: '调整周期与倍数控制灵敏度；搭配ATR止损与分批交易更稳健。',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'boll_up', type: 'condition', position: { x: 100, y: 100 }, data: { type: 'bollinger', period: 20, threshold: 0, operator: 'above', nodeType: 'condition', subType: 'bollinger', timeframe: '5m' } },
        { id: 'boll_dn', type: 'condition', position: { x: 100, y: 200 }, data: { type: 'bollinger', period: 20, threshold: 0, operator: 'below', nodeType: 'condition', subType: 'bollinger', timeframe: '5m' } },
        { id: 'pos_buy', type: 'position', position: { x: 220, y: 100 }, data: { type: 'position', quantity: 1200, maxPosition: 6000, nodeType: 'position', subType: 'buy', timeframe: '5m' } },
        { id: 'pos_sell', type: 'position', position: { x: 220, y: 200 }, data: { type: 'position', quantity: 1200, maxPosition: 6000, nodeType: 'position', subType: 'sell', timeframe: '5m' } },
        { id: 'act_buy', type: 'action', position: { x: 320, y: 100 }, data: { type: 'buy', quantity: 1200, priceType: 'market', nodeType: 'action', subType: 'buy', timeframe: '5m' } },
        { id: 'act_sell', type: 'action', position: { x: 320, y: 200 }, data: { type: 'sell', quantity: 1200, priceType: 'market', nodeType: 'action', subType: 'sell', timeframe: '5m' } }
      ],
      edges: [ { id: 'e1', source: 'boll_up', target: 'pos_buy' }, { id: 'e2', source: 'pos_buy', target: 'act_buy' }, { id: 'e3', source: 'boll_dn', target: 'pos_sell' }, { id: 'e4', source: 'pos_sell', target: 'act_sell' } ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  },
  {
    id: 'lib-ma-cross',
    name: '移动平均线交叉策略',
    description: '经典双均线交叉，顺势进出。',
    principle: '用短均线上穿/下穿长均线定义趋势状态的切换。',
    scenarios: '单边趋势较强或波段行情；盘整市中假信号偏多。',
    tips: '拉大均线周期或增加趋势过滤（如更长周期均线）减少噪音。',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        { id: 'ma_up', type: 'condition', position: { x: 100, y: 100 }, data: { type: 'ma', period: 5, threshold: 0, operator: 'crossover', nodeType: 'condition', subType: 'ma', timeframe: '5m' } },
        { id: 'ma_dn', type: 'condition', position: { x: 100, y: 200 }, data: { type: 'ma', period: 5, threshold: 0, operator: 'crossunder', nodeType: 'condition', subType: 'ma', timeframe: '5m' } },
        { id: 'pos_buy', type: 'position', position: { x: 220, y: 100 }, data: { type: 'position', quantity: 1000, maxPosition: 5000, nodeType: 'position', subType: 'buy', timeframe: '5m' } },
        { id: 'pos_sell', type: 'position', position: { x: 220, y: 200 }, data: { type: 'position', quantity: 1000, maxPosition: 5000, nodeType: 'position', subType: 'sell', timeframe: '5m' } },
        { id: 'act_buy', type: 'action', position: { x: 320, y: 100 }, data: { type: 'buy', quantity: 1000, priceType: 'market', nodeType: 'action', subType: 'buy', timeframe: '5m' } },
        { id: 'act_sell', type: 'action', position: { x: 320, y: 200 }, data: { type: 'sell', quantity: 1000, priceType: 'market', nodeType: 'action', subType: 'sell', timeframe: '5m' } }
      ],
      edges: [ { id: 'e1', source: 'ma_up', target: 'pos_buy' }, { id: 'e2', source: 'pos_buy', target: 'act_buy' }, { id: 'e3', source: 'ma_dn', target: 'pos_sell' }, { id: 'e4', source: 'pos_sell', target: 'act_sell' } ],
      start_date: '2024-01-01', end_date: '2024-12-31', initial_capital: 100000, commission_rate: 0.001
    }
  }
]


