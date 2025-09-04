import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { X, Play, Loader2, Calendar, Clock, DollarSign } from 'lucide-react'

export function BacktestModal({ 
  isOpen, 
  onClose, 
  strategy, 
  onRunBacktest 
}) {
  const navigate = useNavigate()
  const [startDate, setStartDate] = useState('2024-01-01')
  const [endDate, setEndDate] = useState('2024-12-31')
  const [initialCapital, setInitialCapital] = useState(100000)
  const [timeframe, setTimeframe] = useState('5m')
  const [isRunning, setIsRunning] = useState(false)

  // 当策略变化时重置表单
  useEffect(() => {
    if (strategy) {
      setStartDate('2024-01-01')
      setEndDate('2024-12-31')
      setInitialCapital(100000)
      setTimeframe('5m')
    }
  }, [strategy])

  const handleRunBacktest = async () => {
    if (!strategy) return

    setIsRunning(true)
    try {
      const backtestParams = {
        strategyId: strategy.id,
        strategy: strategy.strategy, // 传递策略的JSON配置
        startDate,
        endDate,
        initialCapital,
        timeframe
      }
      
      // 调用父组件的回测处理函数
      if (onRunBacktest) {
        await onRunBacktest(backtestParams)
      }
      
      // 回测成功后关闭模态框
      onClose()
    } catch (error) {
      console.error('回测运行失败:', error)
      alert('回测运行失败: ' + error.message)
    } finally {
      setIsRunning(false)
    }
  }

  const handleClose = () => {
    if (!isRunning) {
      onClose()
    }
  }

  if (!isOpen || !strategy) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">回测设置</CardTitle>
              <CardDescription className="text-sm">
                配置 {strategy.name} 的回测参数
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isRunning}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* 时间范围设置 */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-sm font-medium">
              <Calendar className="h-4 w-4" />
              <span>时间范围</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-xs">开始日期</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs"
                  disabled={isRunning}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate" className="text-xs">结束日期</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs"
                  disabled={isRunning}
                />
              </div>
            </div>
          </div>

          {/* 初始资金设置 */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-sm font-medium">
              <DollarSign className="h-4 w-4" />
              <span>初始资金</span>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="initialCapital" className="text-xs">资金金额（元）</Label>
              <Input
                id="initialCapital"
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(Number(e.target.value))}
                className="text-xs"
                disabled={isRunning}
                placeholder="100000"
              />
            </div>
          </div>

          {/* 时间周期设置 */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-sm font-medium">
              <Clock className="h-4 w-4" />
              <span>时间周期</span>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="timeframe" className="text-xs">K线周期</Label>
              <select
                id="timeframe"
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-input bg-background rounded-md"
                disabled={isRunning}
              >
                <option value="1m">1分钟</option>
                <option value="5m">5分钟</option>
                <option value="15m">15分钟</option>
                <option value="30m">30分钟</option>
                <option value="1h">1小时</option>
                <option value="4h">4小时</option>
                <option value="1d">1天</option>
                <option value="1w">1周</option>
                <option value="1M">1月</option>
              </select>
            </div>
          </div>

          {/* 策略信息预览 */}
          <div className="space-y-4">
            <div className="text-sm font-medium">策略信息</div>
            <div className="bg-muted p-3 rounded-md text-xs space-y-1">
              <div><span className="font-medium">策略名称:</span> {strategy.name}</div>
              <div><span className="font-medium">节点数量:</span> {strategy.strategy?.nodes?.length || 0} 个</div>
              <div><span className="font-medium">策略描述:</span> {strategy.description}</div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isRunning}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={handleRunBacktest}
              disabled={isRunning}
              className="flex-1"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  运行中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  开始回测
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
