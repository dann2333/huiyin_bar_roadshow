#!/bin/bash
# ===== 回音酒馆 一键部署脚本 =====
# 用法: bash deploy.sh
# 前提: 服务器已安装 Python 3.10+, Node.js 18+
# 部署后访问: https://www.huiyinbar.com

set -e

echo "===== 1/4 构建前端 ====="
cd frontend
npm install
npm run build
cd ..

echo "===== 2/4 安装后端依赖 ====="
cd backend
python3 -m venv venv 2>/dev/null || true
source venv/bin/activate
pip install -r requirements.txt
cd ..

echo "===== 3/4 检查 .env 配置 ====="
if [ ! -f ".env" ]; then
    echo "❌ 未找到 .env 文件，请从 .env.example 复制并填入实际密钥"
    exit 1
fi

echo "===== 4/4 启动服务 ====="
echo "请确认 .env 中以下配置已更新为生产域名："
echo "  SECONDME_REDIRECT_URI=https://www.huiyinbar.com/api/auth/callback"
echo "  FRONTEND_URL=https://www.huiyinbar.com"
echo ""
echo "启动命令（生产环境建议使用 gunicorn）："
echo "  cd backend"
echo "  source venv/bin/activate"
echo "  python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo ""
echo "建议使用 systemd 或 supervisor 管理进程，搭配 Nginx 反代 HTTPS"
