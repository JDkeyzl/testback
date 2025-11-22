# TestBack 项目启动脚本 (Windows PowerShell)

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "启动 TestBack 策略回测平台..." -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# 检查Node.js是否安装
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] Node.js 未安装，请先安装 Node.js" -ForegroundColor Red
    exit 1
}

# 检查Python是否安装
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] Python 未安装，请先安装 Python" -ForegroundColor Red
    exit 1
}

# 检查虚拟环境
$pythonCmd = "python"
if (Test-Path ".venv\Scripts\python.exe") {
    $pythonCmd = ".venv\Scripts\python.exe"
    Write-Host "[信息] 使用虚拟环境中的 Python" -ForegroundColor Green
}
else {
    Write-Host "[警告] 虚拟环境不存在，将使用系统 Python" -ForegroundColor Yellow
}

# 启动后端服务器
Write-Host "[信息] 启动后端服务器..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; $pythonCmd run_server.py" -WindowStyle Normal

# 等待后端启动
Start-Sleep -Seconds 5

# 检查后端是否启动成功
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/health" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "[成功] 后端服务器启动成功 (http://localhost:8000)" -ForegroundColor Green
}
catch {
    Write-Host "[警告] 后端服务器可能未启动，请检查日志" -ForegroundColor Yellow
}

# 启动前端服务器
Write-Host "[信息] 启动前端服务器..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev" -WindowStyle Normal

# 等待前端启动
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "TestBack 平台启动完成！" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "前端界面: http://localhost:5173" -ForegroundColor White
Write-Host "后端API: http://localhost:8000" -ForegroundColor White
Write-Host "API文档: http://localhost:8000/docs" -ForegroundColor White
Write-Host ""
Write-Host "服务已在独立窗口中运行" -ForegroundColor Yellow
Write-Host "关闭此窗口不会停止服务" -ForegroundColor Yellow
Write-Host ""


