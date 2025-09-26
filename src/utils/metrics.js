// 统一的交易口径计算工具：以后端 trades 的 amount 为准（已含佣金）

export function formatTradesWithFees(trades, initialCapital) {
  if (!Array.isArray(trades) || trades.length === 0) return []
  let balance = Number(initialCapital || 100000)
  let position = 0
  let avgCost = 0
  const rows = []
  for (const t of trades) {
    const ts = t.timestamp || t.date
    const price = Number(t.price)
    const qty = Number(t.quantity)
    const amt = Number(t.amount) // 后端已含佣金：买入为总成本，卖出为净收入
    let pnlDisplay = '-'
    let pnlClass = ''

    if (t.action === 'buy') {
      // 买入：扣减含佣金总额
      const newPos = position + qty
      const newAvg = position > 0 ? (avgCost * position + price * qty) / newPos : price
      balance -= amt
      position = newPos
      avgCost = newAvg
    } else if (t.action === 'sell') {
      // 卖出：增加净收入
      balance += amt
      position = Math.max(0, position - qty)
      const pnlVal = (price - avgCost) * qty
      if (pnlVal > 0) { pnlDisplay = `+¥${pnlVal.toFixed(2)}`; pnlClass = 'text-red-600' }
      else if (pnlVal < 0) { pnlDisplay = `-¥${Math.abs(pnlVal).toFixed(2)}`; pnlClass = 'text-green-600' }
      else { pnlDisplay = '¥0.00' }
    }

    const securityValue = position * price
    const totalAssets = balance + securityValue
    // 避免本地时区解析偏移：统一直接使用后端时间字符串
    const rawTs = String(t.timestamp || t.time || t.date || '')
    const normTs = rawTs.replace('T', ' ')
    const dateStr = normTs.includes(' ') ? normTs.split(' ')[0] : (normTs || '')
    rows.push({
      timestamp: normTs,
      date: dateStr,
      time: normTs,
      action: t.action,
      price: price.toFixed(2),
      quantity: qty,
      amount: amt.toFixed(2),
      pnl: pnlDisplay,
      pnlClass,
      balance: balance.toFixed(2),
      position,
      securityValue: securityValue.toFixed(2),
      totalAssets: totalAssets.toFixed(2),
      avgCost: avgCost.toFixed(2)
    })
  }
  return rows
}

export function buildEquityFromTrades(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []
  let prev = null
  return rows.map(r => {
    const curr = Number(r.totalAssets)
    const ret = prev ? ((curr - prev) / prev) : 0
    prev = curr
    return { date: r.date || r.time || '', value: curr, returns: (ret * 100).toFixed(2) }
  })
}

export function computeMetricsFromTrades(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return {
    totalReturn: 0, maxDrawdown: 0, winRate: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0
  }
  const equity = rows.map(r => Number(r.totalAssets))
  const initial = equity[0]
  const last = equity[equity.length - 1]
  const totalReturn = initial > 0 ? (last - initial) / initial : 0
  // 最大回撤
  let peak = equity[0]
  let maxDD = 0
  for (const v of equity) {
    if (v > peak) peak = v
    const dd = (peak - v) / peak
    if (dd > maxDD) maxDD = dd
  }
  // 交易胜率（按卖出笔数统计）
  let wins = 0, losses = 0
  let avgCost = 0, pos = 0
  for (const r of rows) {
    const price = Number(r.price)
    const qty = Number(r.quantity)
    if (r.action === 'buy') {
      const newPos = pos + qty
      avgCost = pos > 0 ? (avgCost * pos + price * qty) / newPos : price
      pos = newPos
    } else if (r.action === 'sell') {
      const pnl = (price - avgCost) * qty
      if (pnl > 0) wins++; else if (pnl < 0) losses++
      pos = Math.max(0, pos - qty)
    }
  }
  const totalTrades = wins + losses
  const winRate = totalTrades > 0 ? wins / totalTrades : 0
  return { totalReturn, maxDrawdown: maxDD, winRate, totalTrades, winningTrades: wins, losingTrades: losses }
}


// 基于“资产口径”的每日资产序列构建（含未平仓浮盈亏）
// trades: 后端原始 trades（含 action, price, quantity, amount, timestamp/date）
// priceSeriesDaily: [{ date: 'YYYY-MM-DD', close: number }]
export function buildDailyAssets(trades, priceSeriesDaily, initialCapital, startDate, endDate) {
  const daily = Array.isArray(priceSeriesDaily) ? [...priceSeriesDaily] : []
  if (daily.length === 0) return []

  // 规范化交易，按时间排序，生成逐笔状态（现金、持仓）
  const parseTs = (t) => {
    if (!t) return 0
    const s = typeof t === 'string' ? t : String(t)
    // 期望形如 'YYYY-MM-DD HH:MM:SS' 或 'YYYY-MM-DD'
    const d = new Date(s.replace(/-/g, '/'))
    const n = d.getTime()
    return isNaN(n) ? 0 : n
  }
  const normalizeTrade = (t) => {
    const tsStr = t.timestamp || t.date || ''
    const ts = parseTs(tsStr)
    const dateStr = String(tsStr).split(' ')[0] || ''
    return {
      ts,
      date: dateStr,
      action: t.action,
      price: Number(t.price),
      quantity: Number(t.quantity),
      amount: Number(t.amount)
    }
  }
  const tradeList = Array.isArray(trades) ? trades.map(normalizeTrade).sort((a,b) => a.ts - b.ts) : []

  // 逐笔推进现金与持仓
  let cash = Number(initialCapital || 100000)
  let position = 0
  const states = [] // { ts, date, cash, position }
  for (const tr of tradeList) {
    if (tr.action === 'buy') {
      cash -= tr.amount
      position += tr.quantity
    } else if (tr.action === 'sell') {
      cash += tr.amount
      position = Math.max(0, position - tr.quantity)
    }
    states.push({ ts: tr.ts, date: tr.date, cash, position })
  }

  // 按日生成资产：使用当日收盘价 × 持仓 + 现金（持仓/现金取当日最后一笔交易后的状态，若无交易则延用前一日）
  const result = []
  let idx = 0
  let lastCash = Number(initialCapital || 100000)
  let lastPos = 0
  for (const d of daily) {
    const dateStr = d.date || String(d.timestamps || '').split(' ')[0]
    const close = Number(d.close)
    if (!dateStr || !isFinite(close)) continue
    const dayEndTs = parseTs(dateStr + ' 23:59:59')
    while (idx < states.length && states[idx].ts <= dayEndTs) {
      lastCash = Number(states[idx].cash) || lastCash
      lastPos = Number(states[idx].position) || lastPos
      idx += 1
    }
    const totalAssets = lastCash + lastPos * close
    result.push({ date: dateStr, totalAssets, price: close, position: lastPos, cash: lastCash })
  }

  // 夹取区间（可选）
  const sDate = startDate ? String(startDate) : null
  const eDate = endDate ? String(endDate) : null
  if (sDate || eDate) {
    return result.filter(r => {
      const d = r.date
      if (sDate && d < sDate) return false
      if (eDate && d > eDate) return false
      return true
    })
  }
  return result
}

// 基于资产序列的指标（收益率、最大回撤、起止资产/价格）
export function computeMetricsFromAssets(assets) {
  if (!Array.isArray(assets) || assets.length === 0) {
    return { totalReturn: 0, maxDrawdown: 0, startAsset: 0, endAsset: 0, startPrice: 0, endPrice: 0 }
  }
  const values = assets.map(a => Number(a.totalAssets))
  const initial = values[0]
  const last = values[values.length - 1]
  const totalReturn = initial > 0 ? (last - initial) / initial : 0
  let peak = values[0]
  let maxDD = 0
  for (const v of values) {
    if (v > peak) peak = v
    const dd = peak > 0 ? (peak - v) / peak : 0
    if (dd > maxDD) maxDD = dd
  }
  const startPrice = Number(assets[0].price || 0)
  const endPrice = Number(assets[assets.length - 1].price || 0)
  return { totalReturn, maxDrawdown: maxDD, startAsset: initial, endAsset: last, startPrice, endPrice }
}


// 用“交易记录口径”的行作为唯一真源构建每日资产（与表格完全一致）
// rows: 来自 formatTradesWithFees(trades, initialCapital) 的结果
// priceSeriesDaily: [{ date: 'YYYY-MM-DD', close: number }]
export function buildDailyAssetsFromRows(rows, priceSeriesDaily, startDate, endDate, initialCapital) {
  const daily = Array.isArray(priceSeriesDaily) ? [...priceSeriesDaily] : []
  if (!Array.isArray(rows) || rows.length === 0 || daily.length === 0) return []
  daily.sort((a,b) => String(a.date).localeCompare(String(b.date)))

  // 从 rows 恢复逐日最后状态：使用行内 balance/position（与表一致）
  const lastStateByDate = new Map()
  for (const r of rows) {
    const d = normalizeToYMD(r.timestamp || r.date || r.time)
    if (!d) continue
    const cash = Number(r.balance)
    const pos = Number(r.position)
    lastStateByDate.set(d, { cash: isFinite(cash)?cash:0, position: isFinite(pos)?pos:0 })
  }

  const seedCash = Number(initialCapital || rows[0]?.balance || 0)
  let lastCash = isFinite(seedCash) ? seedCash : 0
  let lastPos = 0
  // 确定第一笔交易日期
  const rowDates = rows
    .map(r => normalizeToYMD(r.timestamp || r.date || r.time))
    .filter(Boolean)
    .sort()
  const firstTradeDate = rowDates.length ? rowDates[0] : null

  const out = []
  for (const d of daily) {
    const dateStr = d.date
    const st = lastStateByDate.get(dateStr)
    if (firstTradeDate && dateStr < firstTradeDate) {
      // 首笔交易之前：现金为初始资金，持仓为0
      lastCash = isFinite(seedCash) ? seedCash : 0
      lastPos = 0
    } else if (st) {
      lastCash = st.cash
      lastPos = st.position
    }
    const price = Number(d.close)
    const totalAssets = lastCash + lastPos * price
    out.push({ date: dateStr, cash: round2(lastCash), position: lastPos, price: round2(price), totalAssets: round2(totalAssets) })
  }

  const s = startDate ? String(startDate) : null
  const e = endDate ? String(endDate) : null
  const clipped = (s || e) ? out.filter(x => (!s || x.date >= s) && (!e || x.date <= e)) : out
  return clipped
}

function round2(n) {
  const v = Number(n)
  if (!isFinite(v)) return 0
  return Math.round(v * 100) / 100
}

function normalizeToYMD(v) {
  if (!v) return ''
  try {
    const s = String(v).trim()
    // If already YYYY-MM-DD
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (m) {
      const y = m[1]
      const mm = m[2].padStart(2, '0')
      const dd = m[3].padStart(2, '0')
      return `${y}-${mm}-${dd}`
    }
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0,10)
  } catch {}
  return ''
}

