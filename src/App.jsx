import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { TopNavigation } from './components/TopNavigation'
import { WelcomePage } from './pages/WelcomePage'
import { StrategiesPage } from './pages/StrategiesPage'
import { BacktestResultPage } from './pages/BacktestResultPage'
import { TestAutoFix } from './pages/TestAutoFix'

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
          <Route path="/test-autofix" element={<TestAutoFix />} />
          <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
