import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { AlertCircle, CheckCircle, AlertTriangle, Info, Wrench } from 'lucide-react'
import { validateStrategy, getStrategySuggestions, autoFixStrategy } from '../utils/strategyValidator'

export function StrategyValidator({ strategy, onFixStrategy }) {
  if (!strategy || !strategy.nodes) {
    return null
  }

  const validationResult = validateStrategy(strategy)
  const suggestions = getStrategySuggestions(validationResult)

  const getStatusIcon = (isValid) => {
    if (isValid) {
      return <CheckCircle className="h-5 w-5 text-green-600" />
    } else {
      return <AlertCircle className="h-5 w-5 text-red-600" />
    }
  }

  const getStatusColor = (isValid) => {
    if (isValid) {
      return 'border-green-200 bg-green-50'
    } else {
      return 'border-red-200 bg-red-50'
    }
  }

  return (
    <Card className={`mb-4 ${getStatusColor(validationResult.isValid)}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-2">
          {getStatusIcon(validationResult.isValid)}
          <CardTitle className="text-lg">
            {validationResult.isValid ? '策略验证通过' : '策略验证失败'}
          </CardTitle>
        </div>
        <CardDescription>
          {validationResult.isValid 
            ? '策略结构完整，可以运行回测' 
            : '策略存在以下问题，请修复后继续'
          }
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* 错误信息 */}
        {validationResult.errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-red-800 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4" />
              <span>错误</span>
            </h4>
            <ul className="space-y-1">
              {validationResult.errors.map((error, index) => (
                <li key={index} className="text-sm text-red-700 flex items-start space-x-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span>{error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* 警告信息 */}
        {validationResult.warnings.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-yellow-800 flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4" />
              <span>警告</span>
            </h4>
            <ul className="space-y-1">
              {validationResult.warnings.map((warning, index) => (
                <li key={index} className="text-sm text-yellow-700 flex items-start space-x-2">
                  <span className="text-yellow-500 mt-0.5">•</span>
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* 策略统计 */}
        <div className="space-y-2">
          <h4 className="font-medium text-gray-800 flex items-center space-x-2">
            <Info className="h-4 w-4" />
            <span>策略统计</span>
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span>总节点数</span>
              <span className="font-medium">{validationResult.summary.totalNodes}</span>
            </div>
            <div className="flex justify-between">
              <span>条件节点</span>
              <span className="font-medium">{validationResult.summary.conditionNodes}</span>
            </div>
            <div className="flex justify-between">
              <span>动作节点</span>
              <span className="font-medium">{validationResult.summary.actionNodes}</span>
            </div>
            <div className="flex justify-between">
              <span>连接数</span>
              <span className="font-medium">{validationResult.summary.connections}</span>
            </div>
            <div className="flex justify-between">
              <span>买入动作</span>
              <span className="font-medium text-green-600">{validationResult.summary.buyActions}</span>
            </div>
            <div className="flex justify-between">
              <span>卖出动作</span>
              <span className="font-medium text-red-600">{validationResult.summary.sellActions}</span>
            </div>
          </div>
        </div>
        
        {/* 建议 */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-blue-800 flex items-center space-x-2">
              <Info className="h-4 w-4" />
              <span>建议</span>
            </h4>
            <ul className="space-y-1">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="text-sm text-blue-700 flex items-start space-x-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* 修复按钮 */}
        {!validationResult.isValid && onFixStrategy && (
          <div className="pt-2">
            <Button 
              onClick={() => {
                const fixedStrategy = autoFixStrategy(strategy, suggestions)
                onFixStrategy(fixedStrategy)
              }}
              className="w-full"
              variant="outline"
            >
              <Wrench className="h-4 w-4 mr-2" />
              自动修复策略
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
