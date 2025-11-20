import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Bar,
  ComposedChart
} from 'recharts'

export function ScreenerDetailPage() {
  const { code } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  
  const stateData = location.state || {}
  const name = stateData.name || code
  const macdParams = stateData.macdParams || { fast: 12, slow: 26, signal: 9 }
  const directions = stateData.directions || {}
  
  const [dailyData, setDailyData] = useState(null)
  const [weeklyData, setWeeklyData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 加载日线和周线数据
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError('')
      try {
        // 并行加载日线和周线数据
        const [dailyResp, weeklyResp] = await Promise.all([
          fetch(`/api/v1/data/kline/${code}?timeframe=1d`),
          fetch(`/api/v1/data/kline/${code}?timeframe=1w`)
        ])
        
        if (!dailyResp.ok) throw new Error('加载日线数据失败')
        if (!weeklyResp.ok) throw new Error('加载周线数据失败')
        
        const daily = await dailyResp.json()
        const weekly = await weeklyResp.json()
        
        setDailyData(daily)
        setWeeklyData(weekly)
      } catch (e) {
        setError(e?.message || '加载数据失败')
      } finally {
        setLoading(false)
      }
    }
    
    if (code) fetchData()
  }, [code])

  // 计算MACD指标
  const calculateMACD = (data, params) => {
    if (!data || !Array.isArray(data) || data.length === 0) return []
    
    const { fast, slow, signal } = params
    const closes = data.map(d => Number(d.close) || 0)
    
    // EMA计算
    const emaFast = []
    const emaSlow = []
    let emaFastVal = closes[0]
    let emaSlowVal = closes[0]
    const alphaFast = 2 / (fast + 1)
    const alphaSlow = 2 / (slow + 1)
    
    for (let i = 0; i < closes.length; i++) {
      emaFastVal = closes[i] * alphaFast + emaFastVal * (1 - alphaFast)
      emaSlowVal = closes[i] * alphaSlow + emaSlowVal * (1 - alphaSlow)
      emaFast.push(emaFastVal)
      emaSlow.push(emaSlowVal)
    }
    
    // DIF = EMA(fast) - EMA(slow)
    const dif = emaFast.map((v, i) => v - emaSlow[i])
    
    // DEA = EMA(DIF, signal)
    const dea = []
    let deaVal = dif[0]
    const alphaSignal = 2 / (signal + 1)
    for (let i = 0; i < dif.length; i++) {
      deaVal = dif[i] * alphaSignal + deaVal * (1 - alphaSignal)
      dea.push(deaVal)
    }
    
    // HIST = DIF - DEA
    const hist = dif.map((v, i) => v - dea[i])
    
    return data.map((d, i) => ({
      ...d,
      dif: dif[i]?.toFixed(4),
      dea: dea[i]?.toFixed(4),
      hist: hist[i]?.toFixed(4),
      histRed: hist[i] > 0 ? hist[i]?.toFixed(4) : 0,  // 零线以上（红色）
      histGreen: hist[i] <= 0 ? hist[i]?.toFixed(4) : 0  // 零线以下（绿色）
    }))
  }

  const dailyWithMACD = useMemo(() => {
    if (!dailyData?.data) return []
    return calculateMACD(dailyData.data, macdParams)
  }, [dailyData, macdParams])

  const weeklyWithMACD = useMemo(() => {
    if (!weeklyData?.data) return []
    return calculateMACD(weeklyData.data, macdParams)
  }, [weeklyData, macdParams])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="text-center py-12">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardContent className="py-6">
            <div className="text-center text-red-600">{error}</div>
            <div className="text-center mt-4">
              <Button onClick={() => navigate(-1)}>返回</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{name}（{code}）</h1>
          <p className="text-sm text-muted-foreground">
            日线+周线MACD共振详情 | MACD({macdParams.fast},{macdParams.slow},{macdParams.signal})
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
      </div>

      {/* 日线图表 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            日线K线 + MACD
            {directions['1d'] && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                （柱子{directions['1d'] === 'bull' ? '上升📈' : directions['1d'] === 'bear' ? '下降📉' : '持平'}）
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyWithMACD.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">暂无日线数据</div>
          ) : (
            <>
              {/* K线图 */}
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyWithMACD.slice(-120)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => String(val).slice(0, 10)}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="close" stroke="#2563eb" name="收盘价" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
              
              {/* MACD指标图 */}
              <ResponsiveContainer width="100%" height={200} className="mt-4">
                <ComposedChart data={dailyWithMACD.slice(-120)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => String(val).slice(0, 10)}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="dif" stroke="#f59e0b" name="DIF" dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="dea" stroke="#8b5cf6" name="DEA" dot={false} strokeWidth={1.5} />
                  <Bar dataKey="histRed" fill="#ef4444" name="MACD柱(红)" stackId="macd" />
                  <Bar dataKey="histGreen" fill="#22c55e" name="MACD柱(绿)" stackId="macd" />
                </ComposedChart>
              </ResponsiveContainer>
            </>
          )}
        </CardContent>
      </Card>

      {/* 周线图表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            周线K线 + MACD
            {directions['1w'] && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                （柱子{directions['1w'] === 'bull' ? '上升📈' : directions['1w'] === 'bear' ? '下降📉' : '持平'}）
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weeklyWithMACD.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">暂无周线数据</div>
          ) : (
            <>
              {/* K线图 */}
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={weeklyWithMACD.slice(-60)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => String(val).slice(0, 10)}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="close" stroke="#2563eb" name="收盘价" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
              
              {/* MACD指标图 */}
              <ResponsiveContainer width="100%" height={200} className="mt-4">
                <ComposedChart data={weeklyWithMACD.slice(-60)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(val) => String(val).slice(0, 10)}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="dif" stroke="#f59e0b" name="DIF" dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="dea" stroke="#8b5cf6" name="DEA" dot={false} strokeWidth={1.5} />
                  <Bar dataKey="histRed" fill="#ef4444" name="MACD柱(红)" stackId="macd" />
                  <Bar dataKey="histGreen" fill="#22c55e" name="MACD柱(绿)" stackId="macd" />
                </ComposedChart>
              </ResponsiveContainer>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

