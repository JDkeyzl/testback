import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Slider } from './ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { HelpCircle, Settings } from 'lucide-react'
import { useStrategyStore } from '../store/strategyStore'

const operators = [
  { value: '>', label: '大于' },
  { value: '<', label: '小于' },
  { value: '>=', label: '大于等于' },
  { value: '<=', label: '小于等于' },
  { value: '==', label: '等于' },
  { value: '!=', label: '不等于' }
]

const priceTypes = [
  { value: 'market', label: '市价' },
  { value: 'limit', label: '限价' }
]

// 时间周期选项
const timeframes = [
  { value: '1m', label: '1分钟' },
  { value: '5m', label: '5分钟' },
  { value: '15m', label: '15分钟' },
  { value: '30m', label: '30分钟' },
  { value: '1h', label: '1小时' },
  { value: '4h', label: '4小时' },
  { value: '1d', label: '1天' },
  { value: '1w', label: '1周' },
  { value: '1M', label: '1月' }
]

// 参数说明组件
const ParameterHelp = ({ description }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs text-sm">{description}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

export function ParameterPanel() {
  const { 
    selectedNodeId, 
    getNodeParams, 
    updateNodeParams,
    clearSelectedNode 
  } = useStrategyStore()

  // 策略级别参数配置
  const renderStrategyParams = () => {
    const handleStrategyParamChange = (param, value) => {
      console.log('策略参数变更:', param, value)
      const strategyParams = JSON.parse(localStorage.getItem('strategyParams') || '{}')
      strategyParams[param] = value
      localStorage.setItem('strategyParams', JSON.stringify(strategyParams))
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">回测开始时间</label>
            <Input
              type="date"
              className="w-full"
              placeholder="选择开始日期"
              defaultValue="2024-01-01"
              onChange={(e) => handleStrategyParamChange('startDate', e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">回测结束时间</label>
            <Input
              type="date"
              className="w-full"
              placeholder="选择结束日期"
              defaultValue="2024-12-31"
              onChange={(e) => handleStrategyParamChange('endDate', e.target.value)}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">初始资金</label>
            <Input
              type="number"
              className="w-full"
              placeholder="输入初始资金金额"
              defaultValue="100000"
              onChange={(e) => handleStrategyParamChange('initialCapital', parseInt(e.target.value))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">时间周期</label>
            <Select
              defaultValue="5m"
              onValueChange={(value) => handleStrategyParamChange('timeframe', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择时间周期" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5m">5分钟</SelectItem>
                <SelectItem value="15m">15分钟</SelectItem>
                <SelectItem value="1h">1小时</SelectItem>
                <SelectItem value="1d">1天</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    )
  }

  if (!selectedNodeId) {
    return (
      <div className="p-4">
        <div className="text-center text-muted-foreground text-sm">
          点击画布中的节点来配置参数
        </div>
      </div>
    )
  }

  const nodeParams = getNodeParams(selectedNodeId)
  if (!nodeParams) {
    return (
      <div className="p-4">
        <div className="text-center text-muted-foreground text-sm">
          请重新选择节点
        </div>
      </div>
    )
  }

  const { nodeType, subType } = nodeParams

  const handleParamChange = (param, value) => {
    updateNodeParams(selectedNodeId, { [param]: value })
  }

  const renderConditionParams = () => {
    // 节点类型选择下拉框
    const conditionTypeOptions = [
      { value: 'ma', label: '移动均线' },
      { value: 'price_range', label: '价格区间' },
      { value: 'rsi', label: 'RSI' },
      { value: 'bollinger', label: '布林带' },
      { value: 'macd', label: 'MACD' },
      { value: 'volume', label: '成交量' },
      { value: 'price', label: '价格' },
      { value: 'trend', label: '趋势判断' },
      { value: 'candlestick', label: 'K线形态' }
    ]

    return (
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">指标类型</label>
          <select
            value={nodeParams.subType || 'ma'}
            onChange={(e) => {
              const newSubType = e.target.value
              // 重置参数并更新子类型
              const defaultParams = getDefaultParamsForType(newSubType)
              updateNodeParams(selectedNodeId, { 
                subType: newSubType,
                ...defaultParams
              })
            }}
            className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
          >
            {conditionTypeOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {renderConditionTypeParams()}
      </div>
    )
  }

  const getDefaultParamsForType = (type) => {
    const defaults = {
      ma: { period: 20, timeframe: '1d', threshold: 50, operator: '>' },
      price_range: { minPrice: 100, maxPrice: 200, timeframe: '1d' },
      rsi: { period: 14, timeframe: '1d', threshold: 30, operator: '<', direction: 'none' },
      bollinger: { period: 20, timeframe: '1d', stdDev: 2, condition: 'breakout', direction: 'lower' },
      macd: { fast: 12, slow: 26, signal: 9, timeframe: '1d', threshold: 0, operator: '>' },
      volume: { threshold: 1000000, operator: '>', timeframe: '1d', avgPeriod: 20, multiplier: 1.5 },
      price: { threshold: 100, operator: '>', timeframe: '1d' },
      trend: { period: 200, timeframe: '1d', condition: 'slope', direction: 'down' },
      candlestick: { timeframe: '1d', pattern: 'bullish' }
    }
    return defaults[type] || {}
  }

  const renderConditionTypeParams = () => {
    const currentSubType = nodeParams.subType || 'ma'
    
    switch (currentSubType) {
      case 'ma':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">周期</label>
                <ParameterHelp description="用于计算移动平均线的时间窗口长度。数值越大，均线越平滑，反应越慢；数值越小，均线越敏感，反应越快。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.period || 20]}
                  onValueChange={([value]) => handleParamChange('period', value)}
                  max={200}
                  min={1}
                  step={1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.period || 20}
                  onChange={(e) => handleParamChange('period', parseInt(e.target.value))}
                  min="1"
                  max="200"
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">时间周期</label>
                <ParameterHelp description="选择计算移动平均线的时间单位。不同时间周期会影响指标的敏感度和适用场景。" />
              </div>
              <Select
                value={nodeParams.timeframe || '1d'}
                onValueChange={(value) => handleParamChange('timeframe', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择时间周期" />
                </SelectTrigger>
                <SelectContent>
                  {timeframes.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">阈值</label>
                <ParameterHelp description="用于触发买入/卖出信号的数值条件。当移动均线价格与阈值满足比较条件时，将触发相应的交易信号。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.threshold || 50]}
                  onValueChange={([value]) => handleParamChange('threshold', value)}
                  max={200}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.threshold ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('threshold', null)
                    } else {
                      handleParamChange('threshold', parseFloat(value))
                    }
                  }}
                  step="0.1"
                  className="w-full"
                  placeholder="50"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">操作符</label>
                <ParameterHelp description="决定比较逻辑的运算符。例如：大于(>)表示当移动均线价格大于阈值时触发信号，小于(<)表示当价格小于阈值时触发信号。" />
              </div>
              <select
                value={nodeParams.operator || '>'}
                onChange={(e) => handleParamChange('operator', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                {operators.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
            </div>
          </div>
        )

      case 'price_range':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">最低价</label>
                <ParameterHelp description="价格区间的下限值。当股票价格低于此值时，将触发相应的交易信号。通常用于支撑位或买入信号。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.minPrice || 100]}
                  onValueChange={([value]) => handleParamChange('minPrice', value)}
                  max={1000}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.minPrice ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('minPrice', null)
                    } else {
                      handleParamChange('minPrice', parseFloat(value))
                    }
                  }}
                  min="0"
                  max="1000"
                  step="1"
                  className="w-full"
                  placeholder="100"
                />
              </div>
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">最高价</label>
                <ParameterHelp description="价格区间的上限值。当股票价格高于此值时，将触发相应的交易信号。通常用于阻力位或卖出信号。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.maxPrice || 200]}
                  onValueChange={([value]) => handleParamChange('maxPrice', value)}
                  max={1000}
                  min={0}
                  step={1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.maxPrice ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('maxPrice', null)
                    } else {
                      handleParamChange('maxPrice', parseFloat(value))
                    }
                  }}
                  min="0"
                  max="1000"
                  step="1"
                  className="w-full"
                  placeholder="200"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">时间周期</label>
                <ParameterHelp description="选择价格区间判断的时间单位。不同时间周期会影响价格区间的有效性和信号质量。" />
              </div>
              <Select
                value={nodeParams.timeframe || '1d'}
                onValueChange={(value) => handleParamChange('timeframe', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择时间周期" />
                </SelectTrigger>
                <SelectContent>
                  {timeframes.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      case 'rsi':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">周期</label>
                <ParameterHelp description="用于计算RSI指标的时间窗口长度。RSI是相对强弱指标，用于判断股票的超买超卖状态。常用周期为14。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.period || 14]}
                  onValueChange={([value]) => handleParamChange('period', value)}
                  max={100}
                  min={1}
                  step={1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.period || 14}
                  onChange={(e) => handleParamChange('period', parseInt(e.target.value))}
                  min="1"
                  max="100"
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">时间周期</label>
                <ParameterHelp description="选择计算RSI指标的时间单位。不同时间周期会影响RSI指标的敏感度和信号质量。" />
              </div>
              <Select
                value={nodeParams.timeframe || '1d'}
                onValueChange={(value) => handleParamChange('timeframe', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择时间周期" />
                </SelectTrigger>
                <SelectContent>
                  {timeframes.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">RSI阈值</label>
                <ParameterHelp description="RSI指标的触发阈值。RSI值范围0-100，通常30以下为超卖区域（买入信号），70以上为超买区域（卖出信号）。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.threshold || 30]}
                  onValueChange={([value]) => handleParamChange('threshold', value)}
                  max={100}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.threshold ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('threshold', null)
                    } else {
                      handleParamChange('threshold', parseFloat(value))
                    }
                  }}
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full"
                  placeholder="30"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">操作符</label>
                <ParameterHelp description="决定RSI比较逻辑的运算符。例如：小于(<)表示当RSI小于阈值时触发信号（超卖买入），大于(>)表示当RSI大于阈值时触发信号（超买卖出）。" />
              </div>
              <select
                value={nodeParams.operator || '<'}
                onChange={(e) => handleParamChange('operator', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                {operators.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">方向判断</label>
                <ParameterHelp description="RSI方向判断：向上表示当前RSI比前一根RSI高，向下表示当前RSI比前一根RSI低，无表示不判断方向。" />
              </div>
              <select
                value={nodeParams.direction || 'none'}
                onChange={(e) => handleParamChange('direction', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                <option value="none">无方向判断</option>
                <option value="up">向上</option>
                <option value="down">向下</option>
              </select>
            </div>
          </div>
        )

      case 'bollinger':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">周期</label>
                <ParameterHelp description="用于计算布林带中轨（移动平均线）的时间窗口长度。布林带由中轨、上轨和下轨组成，用于判断价格波动范围。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.period || 20]}
                  onValueChange={([value]) => handleParamChange('period', value)}
                  max={100}
                  min={5}
                  step={1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.period ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('period', null)
                    } else {
                      handleParamChange('period', parseInt(value))
                    }
                  }}
                  min="5"
                  max="100"
                  className="w-full"
                  placeholder="20"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">时间周期</label>
                <ParameterHelp description="选择计算布林带指标的时间单位。不同时间周期会影响布林带的宽度和信号质量。" />
              </div>
              <Select
                value={nodeParams.timeframe || '1d'}
                onValueChange={(value) => handleParamChange('timeframe', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择时间周期" />
                </SelectTrigger>
                <SelectContent>
                  {timeframes.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">标准差</label>
                <ParameterHelp description="布林带的标准差倍数，用于计算上轨和下轨。标准差越大，布林带越宽，价格波动范围越大。常用值为2倍标准差。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.stdDev || 2]}
                  onValueChange={([value]) => handleParamChange('stdDev', value)}
                  max={5}
                  min={0.5}
                  step={0.1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.stdDev ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('stdDev', null)
                    } else {
                      handleParamChange('stdDev', parseFloat(value))
                    }
                  }}
                  min="0.5"
                  max="5"
                  step="0.1"
                  className="w-full"
                  placeholder="2"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">突破条件</label>
                <ParameterHelp description="选择布林带的判断条件：突破表示价格突破布林带轨道，位置表示价格在布林带中的相对位置。" />
              </div>
              <select
                value={nodeParams.condition || 'breakout'}
                onChange={(e) => handleParamChange('condition', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                <option value="breakout">突破</option>
                <option value="position">位置</option>
              </select>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">突破方向</label>
                <ParameterHelp description="选择突破方向：下穿下轨表示价格跌破布林带下轨（超卖信号），上穿上轨表示价格突破布林带上轨（超买信号）。" />
              </div>
              <select
                value={nodeParams.direction || 'lower'}
                onChange={(e) => handleParamChange('direction', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                <option value="lower">下穿下轨</option>
                <option value="upper">上穿上轨</option>
              </select>
            </div>
          </div>
        )

      case 'macd':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">快线周期</label>
                <ParameterHelp description="MACD指标中快线（EMA）的计算周期，单位：天。MACD由快线、慢线和信号线组成，用于判断趋势变化和买卖信号。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.fast || 12]}
                  onValueChange={([value]) => handleParamChange('fast', value)}
                  max={50}
                  min={1}
                  step={1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.fast ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('fast', null)
                    } else {
                      handleParamChange('fast', parseInt(value))
                    }
                  }}
                  min="1"
                  max="50"
                  className="w-full"
                  placeholder="12"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">慢线周期</label>
                <ParameterHelp description="MACD指标中慢线（EMA）的计算周期，单位：天。慢线周期通常大于快线周期，用于平滑价格波动，常用值为26天。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.slow || 26]}
                  onValueChange={([value]) => handleParamChange('slow', value)}
                  max={100}
                  min={1}
                  step={1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.slow ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('slow', null)
                    } else {
                      handleParamChange('slow', parseInt(value))
                    }
                  }}
                  min="1"
                  max="100"
                  className="w-full"
                  placeholder="26"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">信号线周期</label>
                <ParameterHelp description="MACD指标中信号线（EMA）的计算周期。信号线是MACD线的移动平均线，用于生成买卖信号，常用值为9。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.signal || 9]}
                  onValueChange={([value]) => handleParamChange('signal', value)}
                  max={20}
                  min={1}
                  step={1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.signal ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('signal', null)
                    } else {
                      handleParamChange('signal', parseInt(value))
                    }
                  }}
                  min="1"
                  max="20"
                  className="w-full"
                  placeholder="9"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">时间周期</label>
                <ParameterHelp description="选择计算MACD指标的时间单位。不同时间周期会影响MACD指标的敏感度和信号质量。" />
              </div>
              <Select
                value={nodeParams.timeframe || '1d'}
                onValueChange={(value) => handleParamChange('timeframe', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择时间周期" />
                </SelectTrigger>
                <SelectContent>
                  {timeframes.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">阈值</label>
                <ParameterHelp description="MACD指标的触发阈值。当MACD线与信号线的差值超过此阈值时，将触发相应的交易信号。正值表示买入信号，负值表示卖出信号。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.threshold || 0]}
                  onValueChange={([value]) => handleParamChange('threshold', value)}
                  max={1}
                  min={-1}
                  step={0.001}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.threshold ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('threshold', null)
                    } else {
                      handleParamChange('threshold', parseFloat(value))
                    }
                  }}
                  step="0.001"
                  className="w-full"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">操作符</label>
                <ParameterHelp description="决定MACD比较逻辑的运算符。例如：大于(>)表示当MACD差值大于阈值时触发信号，小于(<)表示当MACD差值小于阈值时触发信号。" />
              </div>
              <select
                value={nodeParams.operator || '>'}
                onChange={(e) => handleParamChange('operator', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                {operators.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
            </div>
          </div>
        )

      case 'volume':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">平均成交量周期</label>
                <ParameterHelp description="计算平均成交量的时间窗口长度。例如：20表示计算过去20根K线的平均成交量作为基准。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.avgPeriod || 20]}
                  onValueChange={([value]) => handleParamChange('avgPeriod', value)}
                  max={100}
                  min={5}
                  step={1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.avgPeriod || 20}
                  onChange={(e) => handleParamChange('avgPeriod', parseInt(e.target.value))}
                  min="5"
                  max="100"
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">比较倍数</label>
                <ParameterHelp description="成交量放大的倍数。例如：1.5表示当前成交量需要是平均成交量的1.5倍以上才触发信号。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.multiplier || 1.5]}
                  onValueChange={([value]) => handleParamChange('multiplier', value)}
                  max={5}
                  min={0.5}
                  step={0.1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.multiplier ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('multiplier', null)
                    } else {
                      handleParamChange('multiplier', parseFloat(value))
                    }
                  }}
                  min="0.5"
                  max="5"
                  step="0.1"
                  className="w-full"
                  placeholder="1.5"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">时间周期</label>
                <ParameterHelp description="选择成交量判断的时间单位。不同时间周期会影响成交量指标的有效性和信号质量。" />
              </div>
              <Select
                value={nodeParams.timeframe || '1d'}
                onValueChange={(value) => handleParamChange('timeframe', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择时间周期" />
                </SelectTrigger>
                <SelectContent>
                  {timeframes.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      case 'price':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">阈值</label>
                <ParameterHelp description="价格的触发阈值，单位：元。当股票价格与阈值满足比较条件时，将触发相应的交易信号。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.threshold || 100]}
                  onValueChange={([value]) => handleParamChange('threshold', value)}
                  max={1000}
                  min={0}
                  step={0.1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.threshold ?? ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      handleParamChange('threshold', null)
                    } else {
                      handleParamChange('threshold', parseFloat(value))
                    }
                  }}
                  step="0.1"
                  className="w-full"
                  placeholder="100"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">操作符</label>
                <ParameterHelp description="决定价格比较逻辑的运算符。例如：大于(>)表示当价格大于阈值时触发信号，小于(<)表示当价格小于阈值时触发信号。" />
              </div>
              <select
                value={nodeParams.operator || '>'}
                onChange={(e) => handleParamChange('operator', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                {operators.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">时间周期</label>
                <ParameterHelp description="选择价格判断的时间单位。不同时间周期会影响价格指标的有效性和信号质量。" />
              </div>
              <Select
                value={nodeParams.timeframe || '1d'}
                onValueChange={(value) => handleParamChange('timeframe', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择时间周期" />
                </SelectTrigger>
                <SelectContent>
                  {timeframes.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      case 'trend':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">周期</label>
                <ParameterHelp description="用于计算趋势判断的移动平均线周期。例如：200表示使用200日均线判断长期趋势。" />
              </div>
              <div className="space-y-2">
                <Slider
                  value={[nodeParams.period || 200]}
                  onValueChange={([value]) => handleParamChange('period', value)}
                  max={500}
                  min={20}
                  step={1}
                  className="w-full"
                />
                <Input
                  type="number"
                  value={nodeParams.period || 200}
                  onChange={(e) => handleParamChange('period', parseInt(e.target.value))}
                  min="20"
                  max="500"
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">时间周期</label>
                <ParameterHelp description="选择趋势判断的时间单位。日线用于长期趋势，周线用于超长期趋势。" />
              </div>
              <Select
                value={nodeParams.timeframe || '1d'}
                onValueChange={(value) => handleParamChange('timeframe', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择时间周期" />
                </SelectTrigger>
                <SelectContent>
                  {timeframes.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">判断条件</label>
                <ParameterHelp description="选择趋势判断的方式：斜率表示均线斜率方向，价格位置表示当前价格与均线的相对位置。" />
              </div>
              <select
                value={nodeParams.condition || 'slope'}
                onChange={(e) => handleParamChange('condition', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                <option value="slope">斜率</option>
                <option value="price">价格位置</option>
              </select>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">趋势方向</label>
                <ParameterHelp description="选择趋势方向：向下表示下降趋势（均线斜率向下或价格低于均线），向上表示上升趋势（均线斜率向上或价格高于均线）。" />
              </div>
              <select
                value={nodeParams.direction || 'down'}
                onChange={(e) => handleParamChange('direction', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                <option value="down">向下</option>
                <option value="up">向上</option>
              </select>
            </div>
          </div>
        )

      case 'candlestick':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">时间周期</label>
                <ParameterHelp description="选择K线形态判断的时间单位。不同时间周期的K线形态具有不同的意义。" />
              </div>
              <Select
                value={nodeParams.timeframe || '1d'}
                onValueChange={(value) => handleParamChange('timeframe', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择时间周期" />
                </SelectTrigger>
                <SelectContent>
                  {timeframes.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium">K线形态</label>
                <ParameterHelp description="选择K线形态：阳线表示收盘价高于开盘价（上涨），阴线表示收盘价低于开盘价（下跌）。" />
              </div>
              <select
                value={nodeParams.pattern || 'bullish'}
                onChange={(e) => handleParamChange('pattern', e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                <option value="bullish">阳线</option>
                <option value="bearish">阴线</option>
              </select>
            </div>
          </div>
        )

      default:
        return <div className="text-sm text-muted-foreground">未知的条件类型</div>
    }
  }

  const renderLogicParams = () => {
    return (
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-medium">逻辑类型</label>
            <ParameterHelp description="决定多个条件之间的逻辑关系。AND(与)：所有条件都满足时才触发；OR(或)：任一条件满足时就触发；NOT(非)：条件不满足时才触发。" />
          </div>
          <select
            value={nodeParams.type || 'and'}
            onChange={(e) => handleParamChange('type', e.target.value)}
            className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
          >
            <option value="and">AND - 逻辑与</option>
            <option value="or">OR - 逻辑或</option>
            <option value="not">NOT - 逻辑非</option>
          </select>
        </div>
      </div>
    )
  }

  const renderActionParams = () => {
    if (subType === 'hold') {
      return <div className="text-sm text-muted-foreground">持有信号无需配置参数</div>
    }

    return (
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-medium">动作类型</label>
            <ParameterHelp description="选择交易动作类型。买入：执行买入操作；卖出：执行卖出操作；持有：保持当前仓位不变。" />
          </div>
          <select
            value={nodeParams.type || subType}
            onChange={(e) => handleParamChange('type', e.target.value)}
            className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
          >
            <option value="buy">买入</option>
            <option value="sell">卖出</option>
            <option value="hold">持有</option>
          </select>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-medium">数量</label>
            <ParameterHelp description="交易数量，单位：股。买入时表示买入的股票数量，卖出时表示卖出的股票数量。数量越大，交易金额越大。" />
          </div>
          <div className="space-y-2">
            <Slider
              value={[nodeParams.quantity || 100]}
              onValueChange={([value]) => handleParamChange('quantity', value)}
              max={10000}
              min={1}
              step={1}
              className="w-full"
            />
            <Input
              type="number"
              value={nodeParams.quantity ?? ''}
              onChange={(e) => {
                const value = e.target.value
                if (value === '') {
                  handleParamChange('quantity', null)
                } else {
                  handleParamChange('quantity', parseInt(value))
                }
              }}
              min="1"
              max="10000"
              className="w-full"
              placeholder="100"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-medium">价格类型</label>
            <ParameterHelp description="选择交易价格类型。市价：以当前市场价格立即成交；限价：设定特定价格，只有达到该价格时才成交。" />
          </div>
          <select
            value={nodeParams.priceType || 'market'}
            onChange={(e) => handleParamChange('priceType', e.target.value)}
            className="w-full h-10 px-3 py-2 text-sm border border-input rounded-md bg-background"
          >
            {priceTypes.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  const getNodeTitle = () => {
    const titles = {
      condition: {
        ma: '移动均线',
        price_range: '价格区间',
        rsi: 'RSI指标',
        bollinger: '布林带',
        macd: 'MACD指标',
        volume: '成交量',
        price: '价格'
      },
      logic: {
        and: '逻辑与 (AND)',
        or: '逻辑或 (OR)',
        not: '逻辑非 (NOT)'
      },
      action: {
        buy: '买入信号',
        sell: '卖出信号',
        hold: '持有信号'
      }
    }
    return titles[nodeType]?.[subType] || '未知节点'
  }

  return (
    <div className="p-4">
      <Card className="shadow-sm border border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {getNodeTitle()}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            节点ID: {selectedNodeId}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-h-96 overflow-y-auto">
          {nodeType === 'condition' && renderConditionParams()}
          {nodeType === 'logic' && renderLogicParams()}
          {nodeType === 'action' && renderActionParams()}
        </CardContent>
      </Card>
    </div>
  )
}
