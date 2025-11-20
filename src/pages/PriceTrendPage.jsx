import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Upload, FileText, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'

const STORAGE_KEY = 'price-trend-state'

export function PriceTrendPage() {
  const [symbols, setSymbols] = useState([])
  const [manualInput, setManualInput] = useState('')
  const [csvFile, setCsvFile] = useState(null)
  const [results, setResults] = useState([])
  const [errors, setErrors] = useState([])
  const [isLoading, setIsLoading] = useState(false)

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
      }
    } catch (e) {
      console.error('Failed to load saved state:', e)
    }
  }, [])

  // 保存状态到 localStorage
  useEffect(() => {
    const stateToSave = {
      symbols,
      results,
      errors,
      timestamp: Date.now()
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
    } catch (e) {
      console.error('Failed to save state:', e)
    }
  }, [symbols, results, errors])

  // 处理CSV文件上传
  const handleCsvUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      alert('请上传CSV文件')
      return
    }

    setCsvFile(file)
    
    // 读取CSV文件，提取股票代码
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target.result
        const lines = text.split('\n')
        if (lines.length < 2) {
          alert('CSV文件格式错误')
          return
        }

        // 解析CSV（简单处理，假设第一行是表头）
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
        const codeIndex = headers.findIndex(h => 
          h === '股票代码' || h === 'code' || h === 'Code' || h.toLowerCase().includes('code')
        )

        if (codeIndex === -1) {
          alert('CSV文件中未找到股票代码列')
          return
        }

        const codes = []
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          
          // 更健壮的CSV解析：处理带引号和等号的格式
          const values = line.split(',').map(v => {
            let val = v.trim()
            // 移除等号格式：="000560" -> 000560
            val = val.replace(/^="?|"?$/g, '')
            // 移除引号
            val = val.replace(/^"|"$/g, '')
            return val
          })
          
          if (values[codeIndex]) {
            const code = values[codeIndex].trim()
            // 验证是6位数字
            if (code && /^\d{6}$/.test(code) && !codes.includes(code)) {
              codes.push(code)
            }
          }
        }

        if (codes.length > 0) {
          setSymbols(codes)
          alert(`已从CSV文件中读取 ${codes.length} 个股票代码`)
        } else {
          alert('未能从CSV文件中提取股票代码')
        }
      } catch (err) {
        alert('读取CSV文件失败: ' + err.message)
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
    if (confirm(`确定要清空所有 ${symbols.length} 个股票代码吗？`)) {
      setSymbols([])
      setResults([])
      setErrors([])
    }
  }

  // 清空分析结果（保留股票代码）
  const handleClearResults = () => {
    if (results.length === 0 && errors.length === 0) {
      return
    }
    if (confirm('确定要清空分析结果吗？股票代码将保留。')) {
      setResults([])
      setErrors([])
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
      let body = { symbols }
      
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
            分析最近5天的价格走势，显示每日收盘价及与5天前的价格差
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
                  <span>
                    {result.name} ({result.symbol})
                  </span>
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

