/**
 * 完整的策略模板
 * 包含买点、卖点、仓位管理、风险控制
 */

export const completeStrategies = [
  {
    id: 'complete-ma-crossover',
    name: '均线突破策略（完整版）',
    description: '短期均线上穿长期均线时买入，下穿时卖出，包含仓位管理和风险控制',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        // 买入条件：短期均线上穿长期均线
        {
          id: 'ma_crossover_buy',
          type: 'condition',
          position: { x: 100, y: 100 },
          data: {
            type: 'ma',
            period: 5,
            threshold: 0,
            operator: 'crossover',
            nodeType: 'condition',
            subType: 'ma',
            timeframe: '5m',
            description: '短期均线上穿长期均线'
          }
        },
        // 卖出条件：短期均线下穿长期均线
        {
          id: 'ma_crossover_sell',
          type: 'condition',
          position: { x: 100, y: 200 },
          data: {
            type: 'ma',
            period: 5,
            threshold: 0,
            operator: 'crossunder',
            nodeType: 'condition',
            subType: 'ma',
            timeframe: '5m',
            description: '短期均线下穿长期均线'
          }
        },
        // 仓位管理：买入数量
        {
          id: 'position_buy',
          type: 'position',
          position: { x: 200, y: 100 },
          data: {
            type: 'position',
            quantity: 1000,
            maxPosition: 5000,
            nodeType: 'position',
            subType: 'buy',
            timeframe: '5m',
            description: '买入1000股，最大持仓5000股'
          }
        },
        // 仓位管理：卖出数量
        {
          id: 'position_sell',
          type: 'position',
          position: { x: 200, y: 200 },
          data: {
            type: 'position',
            quantity: 1000,
            maxPosition: 5000,
            nodeType: 'position',
            subType: 'sell',
            timeframe: '5m',
            description: '卖出1000股'
          }
        },
        // 买入动作
        {
          id: 'buy_action',
          type: 'action',
          position: { x: 300, y: 100 },
          data: {
            type: 'buy',
            quantity: 1000,
            priceType: 'market',
            nodeType: 'action',
            subType: 'buy',
            timeframe: '5m',
            description: '执行买入操作'
          }
        },
        // 卖出动作
        {
          id: 'sell_action',
          type: 'action',
          position: { x: 300, y: 200 },
          data: {
            type: 'sell',
            quantity: 1000,
            priceType: 'market',
            nodeType: 'action',
            subType: 'sell',
            timeframe: '5m',
            description: '执行卖出操作'
          }
        },
        // 风险控制：止损
        {
          id: 'stop_loss',
          type: 'condition',
          position: { x: 100, y: 300 },
          data: {
            type: 'stop_loss',
            threshold: 0.05,
            operator: 'below',
            nodeType: 'condition',
            subType: 'stop_loss',
            timeframe: '5m',
            description: '止损5%'
          }
        },
        // 风险控制：止盈
        {
          id: 'take_profit',
          type: 'condition',
          position: { x: 200, y: 300 },
          data: {
            type: 'take_profit',
            threshold: 0.10,
            operator: 'above',
            nodeType: 'condition',
            subType: 'take_profit',
            timeframe: '5m',
            description: '止盈10%'
          }
        }
      ],
      edges: [
        // 买入逻辑连接
        {
          id: 'e1',
          source: 'ma_crossover_buy',
          target: 'position_buy'
        },
        {
          id: 'e2',
          source: 'position_buy',
          target: 'buy_action'
        },
        // 卖出逻辑连接
        {
          id: 'e3',
          source: 'ma_crossover_sell',
          target: 'position_sell'
        },
        {
          id: 'e4',
          source: 'position_sell',
          target: 'sell_action'
        },
        // 风险控制连接
        {
          id: 'e5',
          source: 'stop_loss',
          target: 'sell_action'
        },
        {
          id: 'e6',
          source: 'take_profit',
          target: 'sell_action'
        }
      ],
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      initial_capital: 100000,
      commission_rate: 0.001
    }
  },
  {
    id: 'complete-rsi-strategy',
    name: 'RSI超买超卖策略（完整版）',
    description: 'RSI<30时买入，RSI>70时卖出，包含仓位管理和风险控制',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        // 买入条件：RSI超卖
        {
          id: 'rsi_oversold',
          type: 'condition',
          position: { x: 100, y: 100 },
          data: {
            type: 'rsi',
            period: 14,
            threshold: 30,
            operator: 'below',
            nodeType: 'condition',
            subType: 'rsi',
            timeframe: '5m',
            description: 'RSI低于30，超卖信号'
          }
        },
        // 卖出条件：RSI超买
        {
          id: 'rsi_overbought',
          type: 'condition',
          position: { x: 100, y: 200 },
          data: {
            type: 'rsi',
            period: 14,
            threshold: 70,
            operator: 'above',
            nodeType: 'condition',
            subType: 'rsi',
            timeframe: '5m',
            description: 'RSI高于70，超买信号'
          }
        },
        // 仓位管理：买入数量
        {
          id: 'position_buy',
          type: 'position',
          position: { x: 200, y: 100 },
          data: {
            type: 'position',
            quantity: 800,
            maxPosition: 4000,
            nodeType: 'position',
            subType: 'buy',
            timeframe: '5m',
            description: '买入800股，最大持仓4000股'
          }
        },
        // 仓位管理：卖出数量
        {
          id: 'position_sell',
          type: 'position',
          position: { x: 200, y: 200 },
          data: {
            type: 'position',
            quantity: 800,
            maxPosition: 4000,
            nodeType: 'position',
            subType: 'sell',
            timeframe: '5m',
            description: '卖出800股'
          }
        },
        // 买入动作
        {
          id: 'buy_action',
          type: 'action',
          position: { x: 300, y: 100 },
          data: {
            type: 'buy',
            quantity: 800,
            priceType: 'market',
            nodeType: 'action',
            subType: 'buy',
            timeframe: '5m',
            description: '执行买入操作'
          }
        },
        // 卖出动作
        {
          id: 'sell_action',
          type: 'action',
          position: { x: 300, y: 200 },
          data: {
            type: 'sell',
            quantity: 800,
            priceType: 'market',
            nodeType: 'action',
            subType: 'sell',
            timeframe: '5m',
            description: '执行卖出操作'
          }
        },
        // 风险控制：止损
        {
          id: 'stop_loss',
          type: 'condition',
          position: { x: 100, y: 300 },
          data: {
            type: 'stop_loss',
            threshold: 0.03,
            operator: 'below',
            nodeType: 'condition',
            subType: 'stop_loss',
            timeframe: '5m',
            description: '止损3%'
          }
        },
        // 风险控制：止盈
        {
          id: 'take_profit',
          type: 'condition',
          position: { x: 200, y: 300 },
          data: {
            type: 'take_profit',
            threshold: 0.08,
            operator: 'above',
            nodeType: 'condition',
            subType: 'take_profit',
            timeframe: '5m',
            description: '止盈8%'
          }
        }
      ],
      edges: [
        // 买入逻辑连接
        {
          id: 'e1',
          source: 'rsi_oversold',
          target: 'position_buy'
        },
        {
          id: 'e2',
          source: 'position_buy',
          target: 'buy_action'
        },
        // 卖出逻辑连接
        {
          id: 'e3',
          source: 'rsi_overbought',
          target: 'position_sell'
        },
        {
          id: 'e4',
          source: 'position_sell',
          target: 'sell_action'
        },
        // 风险控制连接
        {
          id: 'e5',
          source: 'stop_loss',
          target: 'sell_action'
        },
        {
          id: 'e6',
          source: 'take_profit',
          target: 'sell_action'
        }
      ],
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      initial_capital: 100000,
      commission_rate: 0.001
    }
  },
  {
    id: 'complete-bollinger-strategy',
    name: '布林带策略（完整版）',
    description: '价格跌破下轨时买入，触及中轨时卖出，包含仓位管理和风险控制',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    strategy: {
      nodes: [
        // 买入条件：价格跌破布林带下轨
        {
          id: 'bollinger_below',
          type: 'condition',
          position: { x: 100, y: 100 },
          data: {
            type: 'bollinger',
            period: 20,
            threshold: 0,
            operator: 'below',
            nodeType: 'condition',
            subType: 'bollinger',
            timeframe: '5m',
            description: '价格跌破布林带下轨'
          }
        },
        // 卖出条件：价格触及布林带中轨
        {
          id: 'bollinger_middle',
          type: 'condition',
          position: { x: 100, y: 200 },
          data: {
            type: 'bollinger',
            period: 20,
            threshold: 0,
            operator: 'above',
            nodeType: 'condition',
            subType: 'bollinger',
            timeframe: '5m',
            description: '价格触及布林带中轨'
          }
        },
        // 仓位管理：买入数量
        {
          id: 'position_buy',
          type: 'position',
          position: { x: 200, y: 100 },
          data: {
            type: 'position',
            quantity: 1200,
            maxPosition: 6000,
            nodeType: 'position',
            subType: 'buy',
            timeframe: '5m',
            description: '买入1200股，最大持仓6000股'
          }
        },
        // 仓位管理：卖出数量
        {
          id: 'position_sell',
          type: 'position',
          position: { x: 200, y: 200 },
          data: {
            type: 'position',
            quantity: 1200,
            maxPosition: 6000,
            nodeType: 'position',
            subType: 'sell',
            timeframe: '5m',
            description: '卖出1200股'
          }
        },
        // 买入动作
        {
          id: 'buy_action',
          type: 'action',
          position: { x: 300, y: 100 },
          data: {
            type: 'buy',
            quantity: 1200,
            priceType: 'market',
            nodeType: 'action',
            subType: 'buy',
            timeframe: '5m',
            description: '执行买入操作'
          }
        },
        // 卖出动作
        {
          id: 'sell_action',
          type: 'action',
          position: { x: 300, y: 200 },
          data: {
            type: 'sell',
            quantity: 1200,
            priceType: 'market',
            nodeType: 'action',
            subType: 'sell',
            timeframe: '5m',
            description: '执行卖出操作'
          }
        },
        // 风险控制：止损
        {
          id: 'stop_loss',
          type: 'condition',
          position: { x: 100, y: 300 },
          data: {
            type: 'stop_loss',
            threshold: 0.04,
            operator: 'below',
            nodeType: 'condition',
            subType: 'stop_loss',
            timeframe: '5m',
            description: '止损4%'
          }
        },
        // 风险控制：止盈
        {
          id: 'take_profit',
          type: 'condition',
          position: { x: 200, y: 300 },
          data: {
            type: 'take_profit',
            threshold: 0.12,
            operator: 'above',
            nodeType: 'condition',
            subType: 'take_profit',
            timeframe: '5m',
            description: '止盈12%'
          }
        }
      ],
      edges: [
        // 买入逻辑连接
        {
          id: 'e1',
          source: 'bollinger_below',
          target: 'position_buy'
        },
        {
          id: 'e2',
          source: 'position_buy',
          target: 'buy_action'
        },
        // 卖出逻辑连接
        {
          id: 'e3',
          source: 'bollinger_middle',
          target: 'position_sell'
        },
        {
          id: 'e4',
          source: 'position_sell',
          target: 'sell_action'
        },
        // 风险控制连接
        {
          id: 'e5',
          source: 'stop_loss',
          target: 'sell_action'
        },
        {
          id: 'e6',
          source: 'take_profit',
          target: 'sell_action'
        }
      ],
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      initial_capital: 100000,
      commission_rate: 0.001
    }
  }
]
