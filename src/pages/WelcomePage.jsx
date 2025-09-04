import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { BarChart3, Settings, Play, TrendingUp, Target, Zap } from 'lucide-react'

export function WelcomePage() {
  const navigate = useNavigate()

  const features = [
    {
      icon: <BarChart3 className="h-8 w-8 text-blue-600" />,
      title: '策略构建',
      description: '使用可视化节点编辑器构建复杂的交易策略'
    },
    {
      icon: <Play className="h-8 w-8 text-green-600" />,
      title: '策略回测',
      description: '基于真实历史数据验证策略效果'
    },
    {
      icon: <TrendingUp className="h-8 w-8 text-purple-600" />,
      title: '结果分析',
      description: '详细的回测报告和性能指标分析'
    },
    {
      icon: <Settings className="h-8 w-8 text-orange-600" />,
      title: '策略管理',
      description: '保存、编辑和管理您的交易策略'
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-12">
        {/* 主标题区域 */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-blue-600 p-3 rounded-2xl">
              <Target className="h-12 w-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            智能策略回测平台
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            构建、测试和优化您的交易策略，基于真实市场数据验证策略效果
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => navigate('/strategies')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg"
            >
              <Zap className="h-5 w-5 mr-2" />
              开始使用
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/strategies')}
              className="px-8 py-3 text-lg"
            >
              查看策略
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/test-autofix')}
              className="px-8 py-3 text-lg border-orange-200 text-orange-600 hover:bg-orange-50"
            >
              测试自动修复
            </Button>
          </div>
        </div>

        {/* 功能特性 */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            平台特性
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-center mb-4">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* 快速开始指南 */}
        <Card className="mb-16">
          <CardHeader>
            <CardTitle className="text-2xl text-center">快速开始</CardTitle>
            <CardDescription className="text-center">
              只需几个简单步骤，即可开始您的策略回测之旅
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-blue-600 font-bold text-lg">1</span>
                </div>
                <h3 className="font-semibold mb-2">创建策略</h3>
                <p className="text-sm text-muted-foreground">
                  使用可视化编辑器构建您的交易策略，支持多种技术指标和逻辑组合
                </p>
              </div>
              <div className="text-center">
                <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-green-600 font-bold text-lg">2</span>
                </div>
                <h3 className="font-semibold mb-2">设置参数</h3>
                <p className="text-sm text-muted-foreground">
                  选择回测时间范围、初始资金等参数，确保回测条件符合您的需求
                </p>
              </div>
              <div className="text-center">
                <div className="bg-purple-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-purple-600 font-bold text-lg">3</span>
                </div>
                <h3 className="font-semibold mb-2">查看结果</h3>
                <p className="text-sm text-muted-foreground">
                  分析回测结果，包括收益率、最大回撤、交易记录等详细数据
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 数据源信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-center">数据源</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-muted-foreground mb-4">
                基于真实股票历史数据进行回测，确保策略验证的准确性
              </p>
              <div className="flex justify-center items-center space-x-8 text-sm text-muted-foreground">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>5分钟K线数据</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>1年历史数据</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span>实时更新</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
