import React from 'react'
import { useNavigate } from 'react-router-dom'
import { StrategyBuilder } from '../components/StrategyBuilder'
import { ParameterPanel } from '../components/ParameterPanel'
import { Button } from '../components/ui/button'
import { ArrowLeft } from 'lucide-react'

export function StrategyPage() {
  const navigate = useNavigate()

  const handleBackToHome = () => {
    navigate('/')
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToHome}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>返回首页</span>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">策略构建器</h1>
            <p className="text-sm text-muted-foreground">构建和配置您的交易策略</p>
          </div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：策略构建区域 */}
        <div className="flex-1 flex flex-col">
          <StrategyBuilder />
        </div>

        {/* 右侧：参数面板 */}
        <div className="w-80 border-l border-border bg-card">
          <ParameterPanel />
        </div>
      </div>
    </div>
  )
}
