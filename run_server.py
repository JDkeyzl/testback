#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TestBack API 服务器启动脚本
"""

import sys
import io
import uvicorn
# 使用backend目录下的应用
from backend.app.main import app

# 设置标准输出编码为UTF-8（Windows兼容）
if sys.platform.startswith('win'):
    if sys.stdout.encoding != 'utf-8':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    if sys.stderr.encoding != 'utf-8':
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

if __name__ == "__main__":
    print("启动 TestBack API 服务器...")
    print("API 文档: http://localhost:8000/docs")
    print("ReDoc 文档: http://localhost:8000/redoc")
    print("健康检查: http://localhost:8000/api/v1/health")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
