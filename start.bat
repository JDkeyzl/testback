@echo off
REM TestBack 项目启动脚本 (Windows)

echo ======================================
echo 启动 TestBack 策略回测平台...
echo ======================================

REM 检查Node.js是否安装
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Node.js 未安装，请先安装 Node.js
    pause
    exit /b 1
)

REM 检查Python是否安装
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Python 未安装，请先安装 Python
    pause
    exit /b 1
)

REM 检查虚拟环境
if not exist ".venv\Scripts\python.exe" (
    echo [警告] 虚拟环境不存在，将使用系统 Python
    set PYTHON_CMD=python
) else (
    set PYTHON_CMD=.venv\Scripts\python.exe
)

REM 启动后端服务器
echo [信息] 启动后端服务器...
start "TestBack Backend" cmd /k "%PYTHON_CMD% run_server.py"

REM 等待后端启动
timeout /t 5 /nobreak >nul

REM 检查后端是否启动成功
curl -s http://localhost:8000/api/v1/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [成功] 后端服务器启动成功 (http://localhost:8000)
) else (
    echo [警告] 后端服务器可能未启动，请检查日志
)

REM 启动前端服务器
echo [信息] 启动前端服务器...
start "TestBack Frontend" cmd /k "npm run dev"

REM 等待前端启动
timeout /t 5 /nobreak >nul

echo.
echo ======================================
echo TestBack 平台启动完成！
echo ======================================
echo 前端界面: http://localhost:5173
echo 后端API: http://localhost:8000
echo API文档: http://localhost:8000/docs
echo.
echo 按任意键关闭此窗口（不会停止服务）
pause >nul

