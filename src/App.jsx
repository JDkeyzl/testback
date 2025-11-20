import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { TopNavigation } from './components/TopNavigation'
import { WelcomePage } from './pages/WelcomePage'
import { StrategiesPage } from './pages/StrategiesPage'
import { BacktestResultPage } from './pages/BacktestResultPage'
import { SymbolBacktestPage } from './pages/SymbolBacktestPage'
import { FuturesBacktestPage } from './pages/FuturesBacktestPage'
import { BacktestHistoryPage } from './pages/BacktestHistoryPage'
import { GridStrategyPage } from './pages/GridStrategyPage'
import { StockSelectionPage } from './pages/StockSelectionPage'
import { ConditionalScannerPage } from './pages/ConditionalScannerPage'
import { ScreenerDetailPage } from './pages/ScreenerDetailPage'

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background">
        <TopNavigation />
        <Routes>
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/strategies" element={<StrategiesPage key="strategies-list" />} />
          <Route path="/strategies/:strategyId/edit" element={<StrategiesPage key="strategies-edit" />} />
          <Route path="/backtest/:strategyId" element={<BacktestResultPage />} />
          <Route path="/symbol-backtest" element={<SymbolBacktestPage />} />
          <Route path="/futures-backtest" element={<FuturesBacktestPage />} />
          <Route path="/history" element={<BacktestHistoryPage />} />
          <Route path="/grid-lab" element={<GridStrategyPage />} />
          <Route path="/stock-selection" element={<StockSelectionPage />} />
          <Route path="/conditional-screener" element={<ConditionalScannerPage />} />
          <Route path="/screener-detail/:code" element={<ScreenerDetailPage />} />
          {/** 自动修复测试路由已移除 */}
          <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
