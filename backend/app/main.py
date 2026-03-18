"""
回音酒馆 FastAPI 主入口
支持前后端整合部署：FastAPI 同时 serve 前端静态文件和 API
"""
import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.auth import router as auth_router
from app.api.tavern import router as tavern_router
from app.api.social import router as social_router
from app.api.settings import router as settings_router
from app.config import FRONTEND_URL

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

# NOTE: CORS 配置 — 开发时允许 localhost，部署时允许实际域名
_allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
]
# 如果 FRONTEND_URL 不是 localhost，将其加入允许列表
if FRONTEND_URL and "localhost" not in FRONTEND_URL:
    _allowed_origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# NOTE: 挂载静态文件，让知乎 API 能下载分享图片
_images_dir = os.path.join(
    os.path.dirname(__file__), "..", "..", "frontend", "public", "images"
)
if os.path.isdir(_images_dir):
    app.mount("/static", StaticFiles(directory=_images_dir), name="static")

# 注册 API 路由（必须在前端 catch-all 之前）
app.include_router(auth_router)
app.include_router(tavern_router)
app.include_router(social_router)
app.include_router(settings_router)

# NOTE: 前端静态文件目录（vite build 产出）
_frontend_dist = os.path.join(
    os.path.dirname(__file__), "..", "..", "frontend", "dist"
)
_frontend_dist = os.path.realpath(_frontend_dist)

if os.path.isdir(_frontend_dist):
    # NOTE: 挂载前端 assets（JS/CSS/图片等带 hash 的文件）
    _assets_dir = os.path.join(_frontend_dist, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="frontend_assets")

    # NOTE: 挂载前端其他静态文件（audio、images、md 等）
    app.mount("/frontend", StaticFiles(directory=_frontend_dist), name="frontend_static")

    @app.get("/{path:path}")
    async def spa_catch_all(request: Request, path: str):
        """
        SPA catch-all 路由
        非 API 请求一律返回 index.html，由前端 React Router 处理
        """
        # 先尝试返回 dist 中的静态文件
        file_path = os.path.join(_frontend_dist, path)
        if path and os.path.isfile(file_path):
            return FileResponse(file_path)
        # 其他所有路径返回 index.html（SPA 路由）
        index_path = os.path.join(_frontend_dist, "index.html")
        return FileResponse(index_path)

else:
    # 开发模式：前端未构建，显示 API 健康检查
    @app.get("/")
    async def root():
        """健康检查"""
        return {
            "name": "回音酒馆 API",
            "status": "running",
            "version": "0.1.0",
            "frontend": "not built — run 'npm run build' in frontend/",
        }
