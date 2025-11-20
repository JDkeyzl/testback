import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { ArrowLeft, Rocket, Eye, EyeOff } from 'lucide-react'

const SETTINGS_KEY = 'navigation-menu-settings'
const AUTH_KEY = 'ignition-auth-status'

// 默认设置
const defaultSettings = {
  showGridLab: false,
  showStockSelection: false,
  showSymbolBacktest: false,
  showHistory: false
}

const PASSWORD = '888888'

export function SettingsPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(defaultSettings)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [fetchProgress, setFetchProgress] = useState({ current: 0, total: 0, currentStock: '' })

  // 加载设置
  useEffect(() => {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setSettings({ ...defaultSettings, ...parsed })
      } catch (e) {
        console.error('Failed to parse settings:', e)
      }
    }
    
    // 检查是否已通过密码验证
    const authStatus = localStorage.getItem(AUTH_KEY)
    if (authStatus === 'true') {
      setIsAuthorized(true)
    }
  }, [])

  // 保存设置
  const saveSettings = (newSettings) => {
    setSettings(newSettings)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
    // 触发自定义事件，通知其他组件设置已更改
    window.dispatchEvent(new CustomEvent('settingsChanged'))
  }

  // 切换设置
  const toggleSetting = (key) => {
    const newSettings = { ...settings, [key]: !settings[key] }
    saveSettings(newSettings)
  }

  // 重置为默认
  const resetToDefault = () => {
    if (confirm('确定要重置为默认设置吗？')) {
      saveSettings(defaultSettings)
    }
  }

  // 验证密码
  const handlePasswordSubmit = () => {
    if (password === PASSWORD) {
      setIsAuthorized(true)
      localStorage.setItem(AUTH_KEY, 'true')
      setPassword('')
    } else {
      alert('密码错误')
      setPassword('')
    }
  }

  // 点火启动 - 批量获取股票数据
  const handleIgnition = async () => {
    if (isFetching) {
      alert('数据获取正在进行中，暂不支持中断（后端脚本执行中）')
      return
    }
    
    if (!window.confirm('将批量获取全部A股日K数据（最近一年），数据将保存至 data/stocks/。\n\n使用后端批量脚本，预计10-20分钟。确认开始？')) return
    
    setIsFetching(true)
    setFetchProgress({ current: 0, total: 100, currentStock: '正在启动批量获取脚本...' })
    
    try {
      console.log('[点火] 调用后端批量脚本...')
      
      const resp = await fetch('/api/v1/data/batch-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 365 })
      })
      
      if (!resp.ok) {
        const raw = await resp.text()
        let data = null
        try {
          data = raw ? JSON.parse(raw) : null
        } catch {}
        throw new Error((data && data.detail) || `${resp.status} ${resp.statusText}`)
      }
      
      const data = await resp.json()
      const summary = data.summary || {}
      
      console.log('[点火] 批量脚本执行完成:', summary)
      alert(`🎉 点火完成！\n成功: ${summary.ok || 0}\n失败: ${summary.fail || 0}\n总计: ${summary.total || 0}`)
    } catch (e) {
      alert('点火失败: ' + (e.message || '未知错误'))
      console.error('[点火] 错误:', e)
    } finally {
      setIsFetching(false)
      setFetchProgress({ current: 0, total: 0, currentStock: '' })
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        <h1 className="text-2xl font-bold">导航菜单设置</h1>
        <p className="text-muted-foreground mt-2">
          配置顶部导航栏中功能入口的显示/隐藏
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>菜单项显示控制</CardTitle>
          <CardDescription>
            选择要在顶部导航栏中显示的功能入口
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 网格交易 */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex-1">
              <Label className="text-base font-medium">网格交易</Label>
              <p className="text-sm text-muted-foreground mt-1">
                网格交易策略回测功能
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showGridLab}
                onChange={() => toggleSetting('showGridLab')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* 选股 */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex-1">
              <Label className="text-base font-medium">选股</Label>
              <p className="text-sm text-muted-foreground mt-1">
                股票筛选和选择功能
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showStockSelection}
                onChange={() => toggleSetting('showStockSelection')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* 股票回测 */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex-1">
              <Label className="text-base font-medium">股票回测</Label>
              <p className="text-sm text-muted-foreground mt-1">
                单股票回测功能
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showSymbolBacktest}
                onChange={() => toggleSetting('showSymbolBacktest')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* 回测记录 */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex-1">
              <Label className="text-base font-medium">回测记录</Label>
              <p className="text-sm text-muted-foreground mt-1">
                查看历史回测记录
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showHistory}
                onChange={() => toggleSetting('showHistory')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* 重置按钮 */}
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              onClick={resetToDefault}
              className="w-full"
            >
              重置为默认设置
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 点火启动功能 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>点火启动</CardTitle>
          <CardDescription>
            批量获取全部A股日K数据（需要密码验证）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isAuthorized ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>输入密码</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handlePasswordSubmit()
                        }
                      }}
                      placeholder="请输入密码"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <Button onClick={handlePasswordSubmit}>验证</Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">
                  ✓ 已通过密码验证
                </p>
              </div>
              <Button
                onClick={handleIgnition}
                disabled={isFetching}
                className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white"
                size="lg"
              >
                <Rocket className="h-5 w-5 mr-2" />
                {isFetching ? '🔥 燃烧中...' : '🚀 点火启动!'}
              </Button>
              {isFetching && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {fetchProgress.currentStock || '正在执行批量获取脚本...'}
                  </p>
                  {fetchProgress.total > 0 && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${(fetchProgress.current / fetchProgress.total) * 100}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {fetchProgress.current} / {fetchProgress.total}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// 导出获取设置的函数，供其他组件使用
export function getNavigationSettings() {
  const saved = localStorage.getItem(SETTINGS_KEY)
  if (saved) {
    try {
      return { ...defaultSettings, ...JSON.parse(saved) }
    } catch (e) {
      console.error('Failed to parse settings:', e)
    }
  }
  return defaultSettings
}

