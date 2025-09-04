#!/bin/bash

# TestBack 项目启动脚本

echo "🚀 启动 TestBack 策略回测平台..."
echo "======================================"

# 检查Node.js和Python是否安装
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装，请先安装 Python3"
    exit 1
fi

# 启动后端服务器
echo "🔧 启动后端服务器..."
cd backend
python3 -m uvicorn app.working_main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 检查后端是否启动成功
if curl -s http://localhost:8000/api/v1/health > /dev/null; then
    echo "✅ 后端服务器启动成功 (http://localhost:8000)"
else
    echo "❌ 后端服务器启动失败"
    kill $BACKEND_PID
    exit 1
fi

# 启动前端服务器
echo "🎨 启动前端服务器..."
npm run dev &
FRONTEND_PID=$!

# 等待前端启动
sleep 5

# 检查前端是否启动成功
if curl -s http://localhost:5173 > /dev/null; then
    echo "✅ 前端服务器启动成功 (http://localhost:5173)"
else
    echo "❌ 前端服务器启动失败"
    kill $BACKEND_PID $FRONTEND_PID
    exit 1
fi

echo ""
echo "🎉 TestBack 平台启动完成！"
echo "======================================"
echo "📖 前端界面: http://localhost:5173"
echo "🔧 后端API: http://localhost:8000"
echo "📚 API文档: http://localhost:8000/docs"
echo ""
echo "按 Ctrl+C 停止所有服务"
echo ""

# 等待用户中断
trap 'echo ""; echo "🛑 正在停止服务..."; kill $BACKEND_PID $FRONTEND_PID; exit 0' INT

# 保持脚本运行
wait
