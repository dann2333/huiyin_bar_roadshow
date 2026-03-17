"""
回音酒馆 FastAPI 主入口
"""
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.auth import router as auth_router
from app.api.tavern import router as tavern_router
from app.api.social import router as social_router
from app.api.settings import router as settings_router

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = FastAPI(
    title="回音酒馆 API",
    description="Echo Tavern — 跨越时空的人生沙盘与情感体验空间",
    version="0.1.0",
)

# CORS 配置，允许前端开发服务器访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# NOTE: 挂载静态文件，让知乎 API 能下载分享图片
_static_dir = os.path.join(
    os.path.dirname(__file__), "..", "..", "frontend", "public", "images"
)
if os.path.isdir(_static_dir):
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")

# 注册路由
app.include_router(auth_router)
app.include_router(tavern_router)
app.include_router(social_router)
app.include_router(settings_router)


@app.get("/")
async def root():
    """健康检查"""
    return {
        "name": "回音酒馆 API",
        "status": "running",
        "version": "0.1.0",
    }

