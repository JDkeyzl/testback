/**
 * 共同特征分析组件
 * 独立组件，与BestStocksPage解耦
 */

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Loader2, BarChart3, TrendingUp, CheckCircle2, Info, ArrowUp, ArrowDown, Minus, ChevronDown, ChevronUp, Eye, Award } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

export function CommonFeaturesAnalysis({ 
  symbols = [], 
  startDate: propStartDate = null,
  endDate: propEndDate = null,
  onAnalysisComplete = null 
}) {
  // 计算默认基准日（筛选页面开始日期的前一天）
  const calculateDefaultBaseDate = (startDate) => {
    if (!startDate) return ''
    const date = new Date(startDate)
    date.setDate(date.getDate() - 1)
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const [baseDate, setBaseDate] = useState(calculateDefaultBaseDate(propStartDate))
  const [lookbackDays, setLookbackDays] = useState(60)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [error, setError] = useState(null)
  const [expandedDistributions, setExpandedDistributions] = useState({}) // 记录展开的分布项

  // 当props变化时更新state
  useEffect(() => {
    if (propStartDate) {
      const defaultBaseDate = calculateDefaultBaseDate(propStartDate)
      // 如果当前baseDate为空，则使用默认值
      setBaseDate(prev => prev || defaultBaseDate)
    }
  }, [propStartDate])

  // 执行分析
  const handleAnalyze = async () => {
    if (!symbols || symbols.length === 0) {
      setError('请先选择股票')
      return
    }

    // 如果没有提供基准日，使用默认值（筛选页面开始日期的前一天）
    let finalBaseDate = baseDate
    if (!finalBaseDate && propStartDate) {
      finalBaseDate = calculateDefaultBaseDate(propStartDate)
    }

    if (!propStartDate || !propEndDate) {
      setError('需要筛选页面的开始日期和结束日期来计算收益率')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setAnalysisResult(null)

    try {
      const response = await fetch('/api/v1/common-features/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbols: symbols,
          baseDate: finalBaseDate || undefined, // 可选，如果未提供则后端从startDate计算
          startDate: propStartDate, // 用于计算收益率
          endDate: propEndDate, // 用于计算收益率
          lookbackDays: lookbackDays,
          macdFast: 12,
          macdSlow: 26,
          macdSignal: 9
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: '分析失败' }))
        throw new Error(errorData.detail || `HTTP ${response.status}`)
      }

      const data = await response.json()
      
      if (!data.ok) {
        throw new Error(data.error || '分析失败')
      }

      setAnalysisResult(data)
      
      // 通知父组件分析完成
      if (onAnalysisComplete) {
        onAnalysisComplete(data)
      }
    } catch (err) {
      console.error('分析失败:', err)
      setError(err.message || '分析失败，请稍后重试')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // 格式化百分比
  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-'
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  // 格式化数字
  const formatNumber = (value, decimals = 2) => {
    if (value === null || value === undefined) return '-'
    return value.toFixed(decimals)
  }

  // 渲染统计值（简化版，只显示平均值）
  const renderStats = (stats, unit = '') => {
    if (!stats || Object.keys(stats).length === 0) return '-'
    return (
      <div className="text-sm">
        {stats.avg !== undefined && (
          <div className="font-semibold text-lg">
            {formatNumber(stats.avg)}{unit}
          </div>
        )}
        {stats.min !== undefined && stats.max !== undefined && (
          <div className="text-xs text-muted-foreground mt-1">
            范围: {formatNumber(stats.min)}{unit} ~ {formatNumber(stats.max)}{unit}
          </div>
        )}
      </div>
    )
  }

  // 切换分布项展开状态
  const toggleDistribution = (distributionKey, itemKey) => {
    const key = `${distributionKey}-${itemKey}`
    setExpandedDistributions(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  // 渲染分布（可视化版，支持显示股票列表）
  const renderDistribution = (dist, labels = {}, distributionKey = '', distWithSymbols = null) => {
    if (!dist || Object.keys(dist).length === 0) return '-'
    const total = analysisResult?.totalStocks || 1
    return (
      <div className="space-y-2">
        {Object.entries(dist)
          .sort((a, b) => {
            // 如果 dist 的值是对象（包含 count），按 count 排序；否则按值排序
            const valA = typeof a[1] === 'object' && a[1]?.count !== undefined ? a[1].count : a[1]
            const valB = typeof b[1] === 'object' && b[1]?.count !== undefined ? b[1].count : b[1]
            return valB - valA
          })
          .map(([key, value]) => {
            const count = typeof value === 'object' && value?.count !== undefined ? value.count : value
            const percentage = (count / total) * 100
            const label = labels[key] || key
            const expandKey = `${distributionKey}-${key}`
            const isExpanded = expandedDistributions[expandKey]
            const symbols = distWithSymbols?.[key]?.symbols || []
            const hasSymbols = symbols.length > 0

            return (
              <div key={key} className="space-y-1 border-b border-border/40 pb-2 last:border-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex-1">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{count}只 ({formatPercent(percentage)})</span>
                    {hasSymbols && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => toggleDistribution(distributionKey, key)}
                        title={isExpanded ? '收起股票列表' : '查看股票列表'}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                {/* 展开的股票列表 */}
                {isExpanded && hasSymbols && (
                  <div className="mt-2 p-2 bg-muted/50 rounded-md max-h-48 overflow-y-auto">
                    <div className="text-xs text-muted-foreground mb-1">包含的股票 ({symbols.length}只):</div>
                    <div className="flex flex-wrap gap-1">
                      {symbols.map((symbol, idx) => (
                        <span
                          key={idx}
                          className="inline-block px-2 py-0.5 bg-background border border-border rounded text-xs"
                        >
                          {symbol}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
      </div>
    )
  }

  // 渲染关键指标卡片（支持显示股票列表）
  const renderKeyMetric = (title, value, description, icon = null, color = 'blue', symbols = null, metricKey = '') => {
    const colorClasses = {
      red: 'text-red-600',
      green: 'text-green-600',
      blue: 'text-blue-600',
      orange: 'text-orange-600'
    }
    const expandKey = `metric-${metricKey}`
    const isExpanded = expandedDistributions[expandKey]
    const hasSymbols = symbols && symbols.length > 0

    return (
      <div className="p-4 border rounded-lg bg-card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
          </div>
          <div className="flex items-center gap-1">
            {hasSymbols && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => toggleDistribution('metric', metricKey)}
                title={isExpanded ? '收起股票列表' : '查看股票列表'}
              >
                <Eye className="h-3 w-3 mr-1" />
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">{description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className={`text-2xl font-bold ${colorClasses[color] || colorClasses.blue}`}>
          {value}
        </div>
        {/* 展开的股票列表 */}
        {isExpanded && hasSymbols && (
          <div className="mt-2 p-2 bg-muted/50 rounded-md max-h-48 overflow-y-auto">
            <div className="text-xs text-muted-foreground mb-1">包含的股票 ({symbols.length}只):</div>
            <div className="flex flex-wrap gap-1">
              {symbols.map((symbol, idx) => (
                <span
                  key={idx}
                  className="inline-block px-2 py-0.5 bg-background border border-border rounded text-xs"
                >
                  {symbol}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          共同特征分析
        </CardTitle>
        <CardDescription>
          分析前N名股票的共同特征，基于基准日的数据（默认：筛选页面开始日期的前一天）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 参数配置 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cf-baseDate">基准日（可选）</Label>
            <Input
              id="cf-baseDate"
              type="date"
              value={baseDate}
              onChange={(e) => setBaseDate(e.target.value)}
              disabled={isAnalyzing}
              placeholder={propStartDate ? calculateDefaultBaseDate(propStartDate) : ''}
            />
            <p className="text-xs text-muted-foreground">
              {propStartDate 
                ? `默认值：${calculateDefaultBaseDate(propStartDate)}（筛选页面开始日期的前一天）`
                : '需要筛选页面的开始日期'}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-lookbackDays">价格位置回看天数</Label>
            <Input
              id="cf-lookbackDays"
              type="number"
              min="1"
              max="250"
              value={lookbackDays}
              onChange={(e) => setLookbackDays(parseInt(e.target.value) || 60)}
              disabled={isAnalyzing}
            />
          </div>
        </div>

        {/* 股票数量提示 */}
        {symbols && symbols.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm">
            将分析 <strong>{symbols.length}</strong> 只股票的共同特征
          </div>
        )}

        {/* 分析按钮 */}
        <Button
          onClick={handleAnalyze}
          disabled={isAnalyzing || !symbols || symbols.length === 0 || !propStartDate || !propEndDate}
          className="w-full"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              分析中...
            </>
          ) : (
            <>
              <BarChart3 className="h-4 w-4 mr-2" />
              开始分析
            </>
          )}
        </Button>

        {/* 错误信息 */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* 分析结果 */}
        {analysisResult && (
          <div className="space-y-4 mt-4">
            {/* 股票排名 - 符合维度最多的股票 */}
            {/* 维度统计 */}
            {analysisResult.dimensionStatistics && analysisResult.dimensionStatistics.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BarChart3 className="h-5 w-5 text-blue-600" />
                    维度出现次数统计
                  </CardTitle>
                  <CardDescription>
                    统计所有股票中各个维度出现的次数，按次数从高到低排序
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysisResult.dimensionStatistics.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm flex-1">{item.dimension}</span>
                        <span className="text-sm font-semibold text-primary ml-2">
                          {item.count} 只股票
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 股票排名 - 按收益率排序 */}
            {analysisResult.stockRankings && analysisResult.stockRankings.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    股票排名 - 按区间收益率排序
                  </CardTitle>
                  <CardDescription>
                    按区间收益率从高到低排序，显示每只股票符合的所有维度
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysisResult.stockRankings.map((stock, index) => (
                      <div
                        key={stock.symbol}
                        className="p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                              index === 0 ? 'bg-yellow-500 text-white' :
                              index === 1 ? 'bg-gray-400 text-white' :
                              index === 2 ? 'bg-orange-600 text-white' :
                              'bg-muted text-foreground'
                            }`}>
                              {index + 1}
                            </div>
                            <div>
                              <div className="font-semibold text-lg">
                                {stock.name} {stock.symbol}
                                {stock.return !== null && stock.return !== undefined && (
                                  <span className={`ml-2 text-sm font-normal ${
                                    stock.return >= 0 ? 'text-red-600' : 'text-green-600'
                                  }`}>
                                    ({formatPercent(stock.return)})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        {stock.matchedDimensions && stock.matchedDimensions.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border">
                            <div className="text-xs text-muted-foreground mb-1">符合的维度 ({stock.matchedDimensions.length}个):</div>
                            <div className="flex flex-wrap gap-1">
                              {stock.matchedDimensions.map((dimension, idx) => (
                                <span
                                  key={idx}
                                  className="inline-block px-2 py-0.5 bg-primary/10 text-primary rounded text-xs border border-primary/20"
                                >
                                  {dimension}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 共同特征总结 */}
            {analysisResult.summary && analysisResult.summary.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    共同特征总结（占比≥60%）
                  </CardTitle>
                  <CardDescription>
                    基准日: {analysisResult.baseDate} | 分析股票数: {analysisResult.totalStocks}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {analysisResult.summary.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <TrendingUp className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* MACD共振分析 */}
            {analysisResult.analysis?.macdResonance && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">📈 MACD趋势分析</CardTitle>
                  <CardDescription>MACD是判断股票趋势的重要指标，红柱表示上涨动能，绿柱表示下跌动能</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* 日线MACD - 简化显示 */}
                  {analysisResult.analysis.macdResonance.daily && (
                    <div>
                      <h4 className="font-semibold mb-4 flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        日线MACD（短期趋势）
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-2 text-muted-foreground">柱状图颜色</div>
                          {renderDistribution(
                            analysisResult.analysis.macdResonance.daily.histColor,
                            { red: '🔴 红柱（上涨动能）', green: '🟢 绿柱（下跌动能）' },
                            'macd-daily-histColor',
                            analysisResult.analysis.macdResonance.daily.histColorWithSymbols
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2 text-muted-foreground">柱状图趋势</div>
                          {renderDistribution(
                            analysisResult.analysis.macdResonance.daily.histTrend,
                            { up: '📈 上升', down: '📉 下降', neutral: '➡️ 持平' },
                            'macd-daily-histTrend',
                            analysisResult.analysis.macdResonance.daily.histTrendWithSymbols
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2 text-muted-foreground">零轴位置</div>
                          {renderDistribution(
                            analysisResult.analysis.macdResonance.daily.zeroAxis,
                            { above: '⬆️ 零轴上方（强势）', below: '⬇️ 零轴下方（弱势）', near: '➡️ 零轴附近' },
                            'macd-daily-zeroAxis',
                            analysisResult.analysis.macdResonance.daily.zeroAxisWithSymbols
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 周线MACD */}
                  {analysisResult.analysis.macdResonance.weekly && Object.keys(analysisResult.analysis.macdResonance.weekly).length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-4 flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        周线MACD（长期趋势）
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-2 text-muted-foreground">柱状图颜色</div>
                          {renderDistribution(
                            analysisResult.analysis.macdResonance.weekly.histColor,
                            { red: '🔴 红柱（上涨动能）', green: '🟢 绿柱（下跌动能）' },
                            'macd-weekly-histColor',
                            analysisResult.analysis.macdResonance.weekly.histColorWithSymbols
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2 text-muted-foreground">柱状图趋势</div>
                          {renderDistribution(
                            analysisResult.analysis.macdResonance.weekly.histTrend,
                            { up: '📈 上升', down: '📉 下降', neutral: '➡️ 持平' },
                            'macd-weekly-histTrend',
                            analysisResult.analysis.macdResonance.weekly.histTrendWithSymbols
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 共振统计 - 重点突出 */}
                  {analysisResult.analysis.macdResonance.resonance && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                      <h4 className="font-semibold mb-4 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                        日线周线共振（重要信号）
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {renderKeyMetric(
                          '日周都红柱',
                          `${analysisResult.analysis.macdResonance.resonance.bothRed || 0}只`,
                          '日线和周线MACD都是红柱，表示短期和长期都有上涨动能，这是非常强的看涨信号',
                          <TrendingUp className="h-4 w-4 text-red-600" />,
                          'red',
                          analysisResult.analysis.macdResonance.resonance.bothRedSymbols,
                          'bothRed'
                        )}
                        {renderKeyMetric(
                          '日周都上升',
                          `${analysisResult.analysis.macdResonance.resonance.bothUp || 0}只`,
                          '日线和周线MACD柱状图都在上升，表示上涨动能正在增强',
                          <ArrowUp className="h-4 w-4 text-green-600" />,
                          'green',
                          analysisResult.analysis.macdResonance.resonance.bothUpSymbols,
                          'bothUp'
                        )}
                        {renderKeyMetric(
                          '趋势同向',
                          `${analysisResult.analysis.macdResonance.resonance.sameDirection || 0}只`,
                          '日线和周线MACD趋势方向一致，表示短期和长期趋势共振',
                          <Minus className="h-4 w-4 text-blue-600" />,
                          'blue',
                          analysisResult.analysis.macdResonance.resonance.sameDirectionSymbols,
                          'sameDirection'
                        )}
                        {renderKeyMetric(
                          '持续上升',
                          `${analysisResult.analysis.macdResonance.resonance.bothRising || 0}只`,
                          '日线和周线MACD都在持续上升，表示上涨动能持续增强',
                          <TrendingUp className="h-4 w-4 text-orange-600" />,
                          'orange',
                          analysisResult.analysis.macdResonance.resonance.bothRisingSymbols,
                          'bothRising'
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 价格与MA关系 */}
            {analysisResult.analysis?.priceMARelation && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">💰 价格与均线关系</CardTitle>
                  <CardDescription>均线（MA）反映平均成本，价格在均线上方表示强势，下方表示弱势</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-4">价格高于各均线的股票占比</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      {Object.entries(analysisResult.analysis.priceMARelation.priceAboveMA || {})
                        .map(([ma, count]) => {
                          const percentage = (count / analysisResult.totalStocks) * 100
                          const maNames = {
                            'MA5': '5日均线（短期）',
                            'MA10': '10日均线',
                            'MA20': '20日均线（中期）',
                            'MA30': '30日均线',
                            'MA60': '60日均线（长期）',
                            'MA120': '120日均线（超长期）'
                          }
                          const symbols = analysisResult.analysis.priceMARelation.priceAboveMAWithSymbols?.[ma] || []
                          const expandKey = `priceAboveMA-${ma}`
                          const isExpanded = expandedDistributions[expandKey]
                          const hasSymbols = symbols.length > 0
                          return (
                            <div key={ma} className="p-3 border rounded-lg bg-card">
                              <div className="flex items-center justify-between mb-1">
                                <div className="text-xs text-muted-foreground">{maNames[ma] || ma}</div>
                                {hasSymbols && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-xs"
                                    onClick={() => toggleDistribution('priceAboveMA', ma)}
                                    title={isExpanded ? '收起股票列表' : '查看股票列表'}
                                  >
                                    <Eye className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                              <div className="text-2xl font-bold text-green-600">{count}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {formatPercent(percentage)}
                              </div>
                              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                                <div
                                  className="bg-green-600 h-1.5 rounded-full"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              {/* 展开的股票列表 */}
                              {isExpanded && hasSymbols && (
                                <div className="mt-2 p-2 bg-muted/50 rounded-md max-h-32 overflow-y-auto">
                                  <div className="text-xs text-muted-foreground mb-1">包含的股票 ({symbols.length}只):</div>
                                  <div className="flex flex-wrap gap-1">
                                    {symbols.map((symbol, idx) => (
                                      <span
                                        key={idx}
                                        className="inline-block px-2 py-0.5 bg-background border border-border rounded text-xs"
                                      >
                                        {symbol}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-4">均线排列形态</h4>
                    {renderDistribution(
                      analysisResult.analysis.priceMARelation.maAlignment,
                      {
                        bullish: '📈 多头排列（短期>中期>长期，强势上涨）',
                        bearish: '📉 空头排列（短期<中期<长期，弱势下跌）',
                        neutral: '➡️ 均线粘合（横盘整理）',
                        mixed: '🔄 混合排列（趋势不明）',
                        unknown: '❓ 未知'
                      },
                      'priceMA-maAlignment',
                      analysisResult.analysis.priceMARelation.maAlignmentWithSymbols
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 价格位置 */}
            {analysisResult.analysis?.pricePosition && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">📍 价格位置分析</CardTitle>
                  <CardDescription>价格在60日区间内的位置，反映股票处于底部、中部还是顶部</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-4">价格位置分布</h4>
                    {renderDistribution(
                      analysisResult.analysis.pricePosition.positionDistribution,
                      {
                        '<20': '🔻 底部区域（0-20%，可能超跌反弹）',
                        '20-40': '⬇️ 中下部（20-40%，相对低位）',
                        '40-60': '➡️ 中部区域（40-60%，正常区间）',
                        '60-80': '⬆️ 中上部（60-80%，相对高位）',
                        '>80': '🔺 顶部区域（80-100%，可能见顶）'
                      },
                      'pricePosition',
                      analysisResult.analysis.pricePosition.positionDistributionWithSymbols
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 border rounded-lg bg-card">
                      <div className="text-sm text-muted-foreground mb-2">平均价格位置</div>
                      <div className="text-2xl font-bold">
                        {analysisResult.analysis.pricePosition.positionRange?.avg 
                          ? formatPercent(analysisResult.analysis.pricePosition.positionRange.avg)
                          : '-'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {analysisResult.analysis.pricePosition.positionRange?.avg 
                          ? (analysisResult.analysis.pricePosition.positionRange.avg < 40 
                              ? '📍 多数股票处于相对低位' 
                              : analysisResult.analysis.pricePosition.positionRange.avg > 60
                              ? '📍 多数股票处于相对高位'
                              : '📍 多数股票处于正常区间')
                          : ''}
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg bg-card">
                      <div className="text-sm text-muted-foreground mb-2">60日波动幅度</div>
                      <div className="text-2xl font-bold">
                        {analysisResult.analysis.pricePosition.priceRange?.volatility?.avg
                          ? formatPercent(analysisResult.analysis.pricePosition.priceRange.volatility.avg)
                          : '-'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        反映价格波动剧烈程度
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 放量关系 */}
            {analysisResult.analysis?.volumeRelation && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">📊 成交量分析</CardTitle>
                  <CardDescription>成交量反映资金活跃程度，放量上涨是健康信号，缩量下跌也是正常现象</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-4">成交量倍数分布</h4>
                    {renderDistribution(
                      analysisResult.analysis.volumeRelation.volumeDistribution,
                      {
                        '<1': '📉 缩量（小于平均量，资金不活跃）',
                        '1-1.5': '➡️ 正常（1-1.5倍，正常交易）',
                        '1.5-2': '📈 温和放量（1.5-2倍，资金开始关注）',
                        '2-3': '🔥 明显放量（2-3倍，资金活跃）',
                        '>3': '💥 巨量（3倍以上，资金大量涌入）'
                      },
                      'volume-distribution',
                      analysisResult.analysis.volumeRelation.volumeDistributionWithSymbols
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold mb-4">量价关系</h4>
                    {renderDistribution(
                      analysisResult.analysis.volumeRelation.priceVolumeRelation,
                      {
                        priceUpVolumeUp: '✅ 价涨量增（最健康，上涨有资金支撑）',
                        priceDownVolumeDown: '✅ 价跌量缩（正常，下跌动能减弱）',
                        priceUpVolumeDown: '⚠️ 价涨量缩（上涨乏力，可能见顶）',
                        priceDownVolumeUp: '⚠️ 价跌量增（下跌有资金出逃，需警惕）',
                        neutral: '➡️ 量价平衡'
                      },
                      'volume-priceVolumeRelation',
                      analysisResult.analysis.volumeRelation.priceVolumeRelationWithSymbols
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold mb-4">成交量趋势</h4>
                    {renderDistribution(
                      analysisResult.analysis.volumeRelation.volumeTrend,
                      {
                        up: '📈 成交量上升（资金流入增加）',
                        down: '📉 成交量下降（资金流入减少）',
                        neutral: '➡️ 成交量持平'
                      },
                      'volume-trend',
                      analysisResult.analysis.volumeRelation.volumeTrendWithSymbols
                    )}
                  </div>
                  {analysisResult.analysis.volumeRelation.volumeHealth?.volumeRatio && (
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                      <h4 className="font-semibold mb-2">成交量健康度</h4>
                      <div className="text-sm text-muted-foreground mb-2">
                        上涨日平均成交量 / 下跌日平均成交量
                      </div>
                      <div className="text-2xl font-bold text-green-600">
                        {analysisResult.analysis.volumeRelation.volumeHealth.volumeRatio?.avg
                          ? formatNumber(analysisResult.analysis.volumeRelation.volumeHealth.volumeRatio.avg, 2)
                          : '-'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {analysisResult.analysis.volumeRelation.volumeHealth.volumeRatio?.avg
                          ? (analysisResult.analysis.volumeRelation.volumeHealth.volumeRatio.avg > 1.2
                              ? '✅ 健康：上涨时放量，下跌时缩量'
                              : '⚠️ 需注意：上涨时成交量不足')
                          : ''}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 其他指标 */}
            {analysisResult.analysis?.otherIndicators && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">🔧 其他技术指标</CardTitle>
                  <CardDescription>RSI、动量、波动性等辅助指标，帮助判断股票状态</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* RSI */}
                  {analysisResult.analysis.otherIndicators.rsi && (
                    <div>
                      <h4 className="font-semibold mb-4 flex items-center gap-2">
                        <Info className="h-5 w-5" />
                        RSI相对强弱指标
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">RSI反映股票的超买超卖状态，0-100之间，70以上可能超买，30以下可能超卖</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 border rounded-lg bg-card">
                          <div className="text-sm text-muted-foreground mb-2">平均RSI值</div>
                          <div className="text-2xl font-bold">
                            {analysisResult.analysis.otherIndicators.rsi.value?.avg
                              ? formatNumber(analysisResult.analysis.otherIndicators.rsi.value.avg, 1)
                              : '-'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            {analysisResult.analysis.otherIndicators.rsi.value?.avg
                              ? (analysisResult.analysis.otherIndicators.rsi.value.avg > 70
                                  ? '⚠️ 可能超买'
                                  : analysisResult.analysis.otherIndicators.rsi.value.avg < 30
                                  ? '✅ 可能超卖（机会）'
                                  : '✅ 正常区间')
                              : ''}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2">RSI区间分布</div>
                          {renderDistribution(
                            analysisResult.analysis.otherIndicators.rsi.distribution,
                            {
                              '<30': '✅ 超卖区（可能反弹）',
                              '30-50': '➡️ 弱势区',
                              '50-70': '📈 强势区',
                              '>70': '⚠️ 超买区（可能回调）'
                            },
                            'rsi',
                            analysisResult.analysis.otherIndicators.rsi.distributionWithSymbols
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 价格动量 */}
                  {analysisResult.analysis.otherIndicators.priceMomentum && (
                    <div>
                      <h4 className="font-semibold mb-4">📈 价格涨跌幅度</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { key: 'change5d', label: '5日涨跌', desc: '近5个交易日的涨跌幅' },
                          { key: 'change10d', label: '10日涨跌', desc: '近10个交易日的涨跌幅' },
                          { key: 'change20d', label: '20日涨跌', desc: '近20个交易日的涨跌幅' }
                        ].map(({ key, label, desc }) => (
                          <div key={key} className="p-4 border rounded-lg bg-card">
                            <div className="text-sm text-muted-foreground mb-2">{label}</div>
                            <div className={`text-2xl font-bold ${
                              analysisResult.analysis.otherIndicators.priceMomentum[key]?.avg > 0
                                ? 'text-red-600'
                                : 'text-green-600'
                            }`}>
                              {analysisResult.analysis.otherIndicators.priceMomentum[key]?.avg
                                ? formatPercent(analysisResult.analysis.otherIndicators.priceMomentum[key].avg)
                                : '-'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-2">{desc}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 成交量动量 - 简化显示 */}
                  {analysisResult.analysis.otherIndicators.volumeMomentum && (
                    <div>
                      <h4 className="font-semibold mb-4">📊 成交量变化</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { key: 'change5d', label: '5日成交量变化', desc: '近5日成交量相对变化' },
                          { key: 'change10d', label: '10日成交量变化', desc: '近10日成交量相对变化' },
                          { key: 'volumeRatio', label: '当前成交量比率', desc: '当前成交量/平均成交量' }
                        ].map(({ key, label, desc }) => (
                          <div key={key} className="p-4 border rounded-lg bg-card">
                            <div className="text-sm text-muted-foreground mb-2">{label}</div>
                            <div className="text-2xl font-bold">
                              {analysisResult.analysis.otherIndicators.volumeMomentum[key]?.avg
                                ? (key === 'volumeRatio' 
                                    ? formatNumber(analysisResult.analysis.otherIndicators.volumeMomentum[key].avg, 2) + '倍'
                                    : formatPercent(analysisResult.analysis.otherIndicators.volumeMomentum[key].avg))
                                : '-'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-2">{desc}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* K线形态 - 简化显示 */}
                  {analysisResult.analysis.otherIndicators.klinePattern && (
                    <div>
                      <h4 className="font-semibold mb-4">📊 K线形态</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 border rounded-lg bg-card">
                          <div className="text-sm text-muted-foreground mb-2">阳线数量</div>
                          <div className="text-2xl font-bold text-red-600">
                            {analysisResult.analysis.otherIndicators.klinePattern.yang || 0}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">收盘价高于开盘价（上涨）</div>
                        </div>
                        <div className="p-4 border rounded-lg bg-card">
                          <div className="text-sm text-muted-foreground mb-2">阴线数量</div>
                          <div className="text-2xl font-bold text-green-600">
                            {analysisResult.analysis.otherIndicators.klinePattern.yin || 0}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">收盘价低于开盘价（下跌）</div>
                        </div>
                        <div className="p-4 border rounded-lg bg-card">
                          <div className="text-sm text-muted-foreground mb-2">平均实体大小</div>
                          <div className="text-2xl font-bold">
                            {analysisResult.analysis.otherIndicators.klinePattern.bodySize?.avg
                              ? formatPercent(analysisResult.analysis.otherIndicators.klinePattern.bodySize.avg)
                              : '-'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">K线实体占价格的比例</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 波动性 */}
                  {analysisResult.analysis.otherIndicators.volatility && (
                    <div>
                      <h4 className="font-semibold mb-4">📊 价格波动性</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 border rounded-lg bg-card">
                          <div className="text-sm text-muted-foreground mb-2">平均波动率</div>
                          <div className="text-2xl font-bold">
                            {analysisResult.analysis.otherIndicators.volatility.volatility?.avg
                              ? formatPercent(analysisResult.analysis.otherIndicators.volatility.volatility.avg)
                              : '-'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            反映价格波动剧烈程度，波动率越高风险越大
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2">波动率分布</div>
                          {renderDistribution(
                            analysisResult.analysis.otherIndicators.volatility.distribution,
                            {
                              low: '✅ 低波动（价格稳定）',
                              medium: '➡️ 中等波动（正常）',
                              high: '⚠️ 高波动（价格剧烈）'
                            },
                            'volatility',
                            analysisResult.analysis.otherIndicators.volatility.distributionWithSymbols
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 成交量比率（原换手率） */}
                  {analysisResult.analysis.otherIndicators.turnover && (
                    <div>
                      <h4 className="font-semibold mb-4">📈 成交量比率</h4>
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg mb-4 text-xs text-muted-foreground">
                        ⚠️ 注意：这是成交量比率（当前量/平均量），不是真正的换手率（需要流通股本数据）
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 border rounded-lg bg-card">
                          <div className="text-sm text-muted-foreground mb-2">平均成交量比率</div>
                          <div className="text-2xl font-bold">
                            {analysisResult.analysis.otherIndicators.turnover.rate?.avg
                              ? formatNumber(analysisResult.analysis.otherIndicators.turnover.rate.avg, 2) + '倍'
                              : '-'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            {analysisResult.analysis.otherIndicators.turnover.rate?.avg
                              ? (analysisResult.analysis.otherIndicators.turnover.rate.avg > 2
                                  ? '🔥 明显放量'
                                  : analysisResult.analysis.otherIndicators.turnover.rate.avg > 1.5
                                  ? '📈 温和放量'
                                  : '➡️ 正常成交量')
                              : ''}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2">成交量比率分布</div>
                          {renderDistribution(
                            analysisResult.analysis.otherIndicators.turnover.distribution,
                            {
                              '<0.5': '📉 极低（<0.5倍）',
                              '0.5-0.8': '📉 低（0.5-0.8倍）',
                              '0.8-1': '➡️ 偏低（0.8-1倍）',
                              '1-1.2': '➡️ 正常（1-1.2倍）',
                              '1.2-2': '📈 放量（1.2-2倍）',
                              '>2': '🔥 巨量（>2倍）'
                            },
                            'turnover',
                            analysisResult.analysis.otherIndicators.turnover.distributionWithSymbols
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 趋势强度 */}
                  {analysisResult.analysis.otherIndicators.trendStrength && (
                    <div>
                      <h4 className="font-semibold mb-4">📈 趋势强度</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 border rounded-lg bg-card">
                          <div className="text-sm text-muted-foreground mb-2">20日价格趋势斜率</div>
                          <div className={`text-2xl font-bold ${
                            analysisResult.analysis.otherIndicators.trendStrength.slope20d?.avg > 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}>
                            {analysisResult.analysis.otherIndicators.trendStrength.slope20d?.avg
                              ? formatPercent(analysisResult.analysis.otherIndicators.trendStrength.slope20d.avg)
                              : '-'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            正值表示上涨趋势，负值表示下跌趋势
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2">趋势方向分布</div>
                          {renderDistribution(
                            analysisResult.analysis.otherIndicators.trendStrength.direction,
                            {
                              up: '📈 上涨趋势',
                              down: '📉 下跌趋势',
                              neutral: '➡️ 横盘整理'
                            },
                            'trendStrength',
                            analysisResult.analysis.otherIndicators.trendStrength.directionWithSymbols
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 错误信息（如果有） */}
            {analysisResult.errors && analysisResult.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-red-600 text-lg">分析错误</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {analysisResult.errors.slice(0, 10).map((err, index) => (
                      <div key={index}>
                        {err.symbol}: {err.error}
                      </div>
                    ))}
                    {analysisResult.errors.length > 10 && (
                      <div>还有 {analysisResult.errors.length - 10} 个错误未显示...</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}


