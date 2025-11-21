import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Upload, FileText, TrendingUp, TrendingDown, Loader2, Eye } from 'lucide-react'

const STORAGE_KEY = 'price-trend-state'

export function PriceTrendPage() {
  const navigate = useNavigate()
  
  // 获取今天的日期（YYYY-MM-DD格式）
  const getToday = () => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const [symbols, setSymbols] = useState([])
  const [manualInput, setManualInput] = useState('')
  const [csvFile, setCsvFile] = useState(null)
  const [results, setResults] = useState([])
  const [errors, setErrors] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const scrollContainerRef = useRef(null)
  const scrollRestoredRef = useRef(false)

  // 从 localStorage 恢复状态
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.symbols) {
          setSymbols(parsed.symbols)
        }
        if (parsed.results) {
          setResults(parsed.results)
        }
        if (parsed.errors) {
          setErrors(parsed.errors)
        }
        if (parsed.summary) {
          setSummary(parsed.summary)
        }
      }
    } catch (e) {
      console.error('Failed to load saved state:', e)
    }
  }, [])

  // 恢复滚动位置
  useEffect(() => {
    if (scrollRestoredRef.current) return
    
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.scrollPosition && typeof parsed.scrollPosition === 'number') {
          // 延迟恢复滚动位置，确保页面内容已渲染
          setTimeout(() => {
            window.scrollTo(0, parsed.scrollPosition)
            scrollRestoredRef.current = true
          }, 100)
        }
      }
    } catch (e) {
      console.error('Failed to restore scroll position:', e)
    }
  }, [results]) // 当结果加载后恢复滚动位置

  // 保存滚动位置
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY || window.pageYOffset || document.documentElement.scrollTop
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        const state = saved ? JSON.parse(saved) : {}
        state.scrollPosition = scrollPosition
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch (e) {
        console.error('Failed to save scroll position:', e)
      }
    }

    // 使用节流来减少保存频率
    let scrollTimeout = null
    const throttledScroll = () => {
      if (scrollTimeout) return
      scrollTimeout = setTimeout(() => {
        handleScroll()
        scrollTimeout = null
      }, 200) // 每200ms保存一次
    }

    window.addEventListener('scroll', throttledScroll, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', throttledScroll)
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }
    }
  }, [])

  // 保存状态到 localStorage（不包含滚动位置，滚动位置由滚动事件单独保存）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      const existingState = saved ? JSON.parse(saved) : {}
      const stateToSave = {
        ...existingState,
        symbols,
        results,
        errors,
        summary,
        timestamp: Date.now()
        // scrollPosition 由滚动事件单独保存，不在这里覆盖
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
    } catch (e) {
      console.error('Failed to save state:', e)
    }
  }, [symbols, results, errors, summary])

  // 处理CSV文件上传
  const handleCsvUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      return
    }

    setCsvFile(file)
    
    // 读取CSV文件，提取股票代码
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target.result
        const lines = text.split(/\r?\n/).filter(line => line.trim()) // 处理不同换行符
        if (lines.length < 2) {
          return
        }

        // 更健壮的CSV解析函数
        const parseCSVLine = (line) => {
          const result = []
          let current = ''
          let inQuotes = false
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i]
            
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === ',' && !inQuotes) {
              result.push(current.trim())
              current = ''
            } else {
              current += char
            }
          }
          result.push(current.trim()) // 最后一个字段
          return result
        }

        // 解析表头
        const headers = parseCSVLine(lines[0]).map(h => {
          // 移除引号和等号
          h = h.replace(/^="?|"?$/g, '')
          h = h.replace(/^"|"$/g, '')
          return h.trim()
        })
        
        // 查找股票代码列（支持更多变体）
        const codeIndex = headers.findIndex(h => {
          const lower = h.toLowerCase()
          return h === '股票代码' || 
                 h === 'code' || 
                 h === 'Code' || 
                 h === 'CODE' ||
                 lower === '股票代码' ||
                 lower.includes('code') ||
                 lower.includes('代码') ||
                 h === 'symbol' ||
                 lower === 'symbol'
        })

        if (codeIndex === -1) {
          const headerList = headers.join(', ')
          console.log(`CSV文件中未找到股票代码列。找到的列名：${headerList}`)
          return
        }

        const codes = []
        const invalidCodes = []
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          
          // 使用改进的CSV解析
          const values = parseCSVLine(line).map(v => {
            // 移除等号格式：="000560" -> 000560
            v = v.replace(/^="?|"?$/g, '')
            // 移除引号
            v = v.replace(/^"|"$/g, '')
            return v.trim()
          })
          
          if (values[codeIndex] !== undefined) {
            let code = values[codeIndex]
            
            // 处理各种格式的股票代码
            // 移除等号和引号
            code = code.replace(/^="?|"?$/g, '')
            code = code.replace(/^"|"$/g, '')
            code = code.trim()
            
            // 如果包含点号，取最后部分（如 sh.600000 -> 600000）
            if (code.includes('.')) {
              code = code.split('.').pop()
            }
            
            // 提取纯数字部分（如果包含其他字符）
            const digits = code.match(/\d{6}/)
            if (digits) {
              code = digits[0]
            }
            
            // 验证是6位数字
            if (code && /^\d{6}$/.test(code)) {
              if (!codes.includes(code)) {
                codes.push(code)
              }
            } else if (code) {
              invalidCodes.push(code)
            }
          }
        }

        if (codes.length > 0) {
          setSymbols(codes)
          if (invalidCodes.length > 0) {
            console.log(`已从CSV文件中读取 ${codes.length} 个股票代码，跳过了 ${invalidCodes.length} 个无效代码：${invalidCodes.slice(0, 5).join(', ')}${invalidCodes.length > 5 ? '...' : ''}`)
          }
        } else {
          if (invalidCodes.length > 0) {
            console.log(`未能从CSV文件中提取股票代码。找到的代码（格式不正确）：${invalidCodes.slice(0, 10).join(', ')}${invalidCodes.length > 10 ? '...' : ''}`)
            console.log('提示：股票代码应为6位数字（如：000560）')
          }
          console.log('无效代码示例:', invalidCodes.slice(0, 10))
          console.log('CSV第一行数据:', lines[1])
        }
      } catch (err) {
        console.error('读取CSV文件失败:', err.message)
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  // 处理输入验证：只允许数字、空格、逗号
  const handleInputChange = (e) => {
    const value = e.target.value
    // 只允许数字、空格、逗号
    if (/^[\d\s,]*$/.test(value)) {
      setManualInput(value)
    }
  }

  // 批量添加股票代码
  const handleAddSymbols = () => {
    const input = manualInput.trim()
    if (!input) {
      alert('请输入股票代码')
      return
    }

    // 按空格或逗号分割
    const codes = input
      .split(/[\s,]+/)
      .map(code => code.trim())
      .filter(code => code.length > 0)

    if (codes.length === 0) {
      alert('未找到有效的股票代码')
      return
    }

    // 验证每个股票代码格式（6位数字）
    const invalidCodes = codes.filter(code => !/^\d{6}$/.test(code))
    if (invalidCodes.length > 0) {
      alert(`以下股票代码格式不正确（应为6位数字）：${invalidCodes.join(', ')}`)
      return
    }

    // 去重并过滤已存在的代码
    const newCodes = [...new Set(codes)].filter(code => !symbols.includes(code))
    
    if (newCodes.length === 0) {
      alert('所有股票代码已存在')
      return
    }

    // 添加新代码
    setSymbols([...symbols, ...newCodes])
    setManualInput('')
    
    if (newCodes.length < codes.length) {
      alert(`已添加 ${newCodes.length} 个股票代码，${codes.length - newCodes.length} 个已存在`)
    } else {
      alert(`已添加 ${newCodes.length} 个股票代码`)
    }
  }

  // 删除股票代码
  const handleRemoveSymbol = (code) => {
    setSymbols(symbols.filter(s => s !== code))
  }

  // 清空所有股票代码
  const handleClearAll = () => {
    if (symbols.length === 0) {
      return
    }
    setSymbols([])
    setResults([])
    setErrors([])
    setSummary(null)
  }

  // 清空分析结果（保留股票代码）
  const handleClearResults = () => {
    if (results.length === 0 && errors.length === 0) {
      return
    }
    if (confirm('确定要清空分析结果吗？股票代码将保留。')) {
      setResults([])
      setErrors([])
      setSummary(null)
    }
  }

  // 分析价格走势
  const handleAnalyze = async () => {
    if (symbols.length === 0) {
      alert('请先添加股票代码或上传CSV文件')
      return
    }

    setIsLoading(true)
    setResults([])
    setErrors([])

    try {
      // 如果有CSV文件，尝试使用文件路径
      let body = { 
        symbols
      }
      
      // 如果上传了CSV文件，可以尝试使用文件路径（需要先上传到服务器）
      // 这里简化处理，直接使用symbols列表
      
      const response = await fetch('/api/v1/price-trend/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.detail || '分析失败')
      }

      setResults(data.results || [])
      setErrors(data.errors || [])
      setSummary(data.summary || null)
    } catch (err) {
      alert('分析失败: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>股票价格走势分析</CardTitle>
          <CardDescription>
            分析最近5天的价格走势，显示每日收盘价及与第0天（基准日）的价格差。第一天到第五天是最近5天的数据，最新的数据是第五天
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* CSV文件上传 */}
          <div className="space-y-2">
            <Label>上传筛选结果CSV文件</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-muted">
                <Upload className="h-4 w-4" />
                <span>选择CSV文件</span>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="hidden"
                />
              </label>
              {csvFile && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{csvFile.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* 批量输入 */}
          <div className="space-y-2">
            <Label>批量输入股票代码（空格或逗号分隔）</Label>
            <div className="flex gap-2">
              <Input
                placeholder="输入股票代码，如：000560 300896,002369 或 000560,300896,002369"
                value={manualInput}
                onChange={handleInputChange}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddSymbols()
                  }
                }}
              />
              <Button onClick={handleAddSymbols}>添加</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              提示：支持空格或逗号分隔，每个代码应为6位数字
            </p>
          </div>

          {/* 股票代码列表 */}
          {symbols.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>已添加的股票代码 ({symbols.length})</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAll}
                  className="text-destructive hover:text-destructive"
                >
                  清空全部
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {symbols.map((code) => (
                  <div
                    key={code}
                    className="flex items-center gap-2 px-3 py-1 bg-muted rounded-lg"
                  >
                    <span>{code}</span>
                    <button
                      onClick={() => handleRemoveSymbol(code)}
                      className="text-muted-foreground hover:text-foreground"
                      title="删除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 分析按钮 */}
          <Button
            onClick={handleAnalyze}
            disabled={isLoading || symbols.length === 0}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                分析中...
              </>
            ) : (
              '开始分析'
            )}
          </Button>

          {/* 错误信息 */}
          {errors.length > 0 && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-destructive">
                  部分股票分析失败 ({errors.length})
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearResults}
                  className="h-6 text-xs"
                >
                  清空结果
                </Button>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                {errors.map((err, idx) => (
                  <div key={idx}>
                    {err.symbol}: {err.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 状态提示 */}
          {results.length > 0 && (
            <div className="p-3 bg-muted/50 border rounded-lg text-xs text-muted-foreground">
              <span>已保存 {results.length} 个分析结果，刷新页面后仍可查看</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 汇总分析 */}
      {summary && results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>汇总分析</CardTitle>
            <CardDescription>
              所有股票的平均涨跌幅统计
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4">天数</th>
                    <th className="text-right py-2 px-4">上涨比例</th>
                    <th className="text-right py-2 px-4">最大涨幅</th>
                    <th className="text-right py-2 px-4">最大跌幅</th>
                    <th className="text-right py-2 px-4">中位数</th>
                    <th className="text-right py-2 px-4">下跌数量</th>
                    <th className="text-right py-2 px-4">上涨数量</th>
                    <th className="text-right py-2 px-4">平均涨跌幅</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5].map(day => {
                    const stats = summary.dayStats?.[`day${day}`] || {}
                    const avgReturn = stats.avg || 0
                    const isRise = avgReturn > 0
                    const riseCount = stats.riseCount || 0
                    const fallCount = stats.fallCount || 0
                    const riseRatio = stats.riseRatio || 0
                    const maxReturn = stats.max || 0
                    const minReturn = stats.min || 0
                    const medianReturn = stats.median || 0
                    
                    return (
                      <tr key={day} className="border-b">
                        <td className="py-2 px-4 font-medium">第{day}天</td>
                        <td className="py-2 px-4 text-right">{riseRatio.toFixed(1)}%</td>
                        <td className={`py-2 px-4 text-right ${maxReturn > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {maxReturn > 0 ? '+' : ''}{maxReturn.toFixed(2)}%
                        </td>
                        <td className={`py-2 px-4 text-right ${minReturn > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {minReturn < 0 ? '' : ''}{minReturn.toFixed(2)}%
                        </td>
                        <td className={`py-2 px-4 text-right ${medianReturn > 0 ? 'text-red-600' : medianReturn < 0 ? 'text-green-600' : ''}`}>
                          {medianReturn > 0 ? '+' : ''}{medianReturn.toFixed(2)}%
                        </td>
                        <td className="py-2 px-4 text-right text-green-600">{fallCount}</td>
                        <td className="py-2 px-4 text-right text-red-600">{riseCount}</td>
                        <td className={`py-2 px-4 text-right font-medium ${isRise ? 'text-red-600' : 'text-green-600'}`}>
                          {isRise ? (
                            <TrendingUp className="inline h-4 w-4 mr-1" />
                          ) : (
                            <TrendingDown className="inline h-4 w-4 mr-1" />
                          )}
                          {isRise ? '+' : ''}{avgReturn.toFixed(2)}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 pt-4 border-t space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">第一天涨的股票数量：</span>
                <span className="font-medium">{summary.day1RiseCount} / {summary.totalStocks}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">前两天都涨的股票数量：</span>
                <span className="font-medium">{summary.day2RiseCount} / {summary.totalStocks}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 结果展示 */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">分析结果 ({results.length})</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearResults}
            >
              清空结果
            </Button>
          </div>
          {results.map((result) => (
            <Card key={result.symbol}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>
                      {result.name} ({result.symbol})
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // 跳转到K线详情页，展示日线+周线MACD
                        navigate(`/screener-detail/${result.symbol}`, {
                          state: {
                            code: result.symbol,
                            name: result.name,
                            macdParams: { fast: 12, slow: 26, signal: 9 },
                            directions: {}
                          }
                        })
                      }}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      查看详情
                    </Button>
                  </div>
                  <span className="text-sm font-normal text-muted-foreground">
                    基准价格: ¥{result.basePrice}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-4">天数</th>
                        <th className="text-left py-2 px-4">日期</th>
                        <th className="text-right py-2 px-4">收盘价</th>
                        <th className="text-right py-2 px-4">价格差</th>
                        <th className="text-right py-2 px-4">当天涨跌</th>
                        <th className="text-right py-2 px-4">总体涨跌</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.days.map((day, idx) => {
                        // 统一颜色：涨=红色，跌=绿色
                        const isRiseOverall = day.change > 0  // 总体涨跌
                        const isRiseDaily = day.dailyChange !== null && day.dailyChange !== undefined && day.dailyChange > 0  // 当天涨跌
                        const isFallDaily = day.dailyChange !== null && day.dailyChange !== undefined && day.dailyChange < 0
                        
                        return (
                          <tr key={idx} className="border-b">
                            <td className="py-2 px-4 font-medium">第{day.day}天</td>
                            <td className="py-2 px-4 text-muted-foreground">{day.date}</td>
                            <td className="py-2 px-4 text-right font-medium">¥{day.close}</td>
                            {/* 价格差：当天收盘价与前一天收盘价相比，涨=红色，跌=绿色 */}
                            <td className={`py-2 px-4 text-right ${isRiseDaily ? 'text-red-600' : isFallDaily ? 'text-green-600' : ''}`}>
                              {day.dailyChange !== null && day.dailyChange !== undefined ? (
                                <>
                                  {isRiseDaily ? '+' : ''}{day.dailyChange}
                                </>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            {/* 当天涨跌：涨=红色，跌=绿色 */}
                            <td className={`py-2 px-4 text-right ${isRiseDaily ? 'text-red-600' : isFallDaily ? 'text-green-600' : ''}`}>
                              {day.dailyChange !== null && day.dailyChange !== undefined ? (
                                <>
                                  {isRiseDaily ? (
                                    <TrendingUp className="inline h-4 w-4 mr-1" />
                                  ) : isFallDaily ? (
                                    <TrendingDown className="inline h-4 w-4 mr-1" />
                                  ) : null}
                                  {isRiseDaily ? '+' : ''}{day.dailyChangePercent !== null && day.dailyChangePercent !== undefined ? day.dailyChangePercent.toFixed(2) : '0.00'}%
                                </>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            {/* 总体涨跌：涨=红色，跌=绿色 */}
                            <td className={`py-2 px-4 text-right font-medium ${isRiseOverall ? 'text-red-600' : 'text-green-600'}`}>
                              {isRiseOverall ? (
                                <TrendingUp className="inline h-4 w-4 mr-1" />
                              ) : (
                                <TrendingDown className="inline h-4 w-4 mr-1" />
                              )}
                              {isRiseOverall ? '+' : ''}{day.changePercent}%
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

