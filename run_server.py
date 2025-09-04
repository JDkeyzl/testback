#!/usr/bin/env python3
"""
TestBack API 服务器启动脚本
"""

import uvicorn
from app.main import app

if __name__ == "__main__":
    print("🚀 启动 TestBack API 服务器...")
    print("📖 API 文档: http://localhost:8000/docs")
    print("🔍 ReDoc 文档: http://localhost:8000/redoc")
    print("💡 健康检查: http://localhost:8000/api/v1/health")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
