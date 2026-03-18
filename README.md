# 🥂 回音酒馆 Echo Tavern

> **跨越时空的人生沙盘** — 让知乎大牛的过去和现在坐在同一张酒桌前，帮你看清人生选择。

![SecondMe](https://img.shields.io/badge/SecondMe-AI%20Twin-blueviolet)
![Qwen](https://img.shields.io/badge/Qwen-通义千问-blue)
![知乎 API](https://img.shields.io/badge/知乎-开放API-0084FF)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688)
![React](https://img.shields.io/badge/React-19+-61DAFB)

## 📖 项目简介

回音酒馆是一款基于 **Multi-Agent 编排** 的沉浸式对话应用，融合 **SecondMe / 通义千问** 双 AI 引擎与 **知乎开放 API** 数据源。

用户在深夜推开酒馆大门，向酒保刘看山倾诉困惑。酒保会从知乎上找到一位与你困境相关的大牛，召唤出 ta 的"当年"和"如今"两个版本——当初正在纠结中的自己，和经历岁月沉淀后的自己——让他们在同一张酒桌前分享各自的想法，帮你从不同时间维度获得启发。

### ✨ 核心体验

| 幕 | 名称 | 内容 |
|---|------|------|
| 第一幕 | 推门与倾诉 | 酒保刘看山接待，用户倾诉困惑 |
| 第二幕 | 时空客人落座 | 从知乎搜索匹配大牛，构建时空客人 |
| 第三幕 | 圆桌对话 | 大牛的"当初"分享心态 ↔ "如今"补充感悟 |
| 第四幕 | 蝴蝶效应 | 用户提出"如果当年..."，召唤平行宇宙版大牛 |
| 终幕 | 酒馆箴言 | 生成今夜对话精华的箴言小票 |

### 🤖 自动讨论模式

第三幕后可点击 **▶ 自动讨论**，两位时空客人将自动轮流对话（最多 5 轮），支持随时暂停。对话采用多轮 messages 格式传递上下文，每个 Agent 能真正"看到"对方说了什么。

### 🌐 多语言支持

通过左上角 ⚙️ **设置面板** 可一键切换中英文界面。语言偏好自动持久化到浏览器，刷新后保持选择。

### 🎵 背景音乐 & 音效系统

内置酒馆氛围背景音乐，支持播放/暂停与音量调节。默认自动播放，音量 25%。首次提问时自动开启背景音乐。

各个关键时刻还配有专属音效：

| 触发时机 | 音效文件 | 音量 |
|----------|----------|------|
| 用户提交困惑 | 问候.mp3 | 75% |
| 第三幕开始 | 客人.mp3 | 75% |
| 触发蝴蝶效应 | 蝴蝶效应.mp3 | 75% |
| 启动自动讨论 | 自动.mp3 | 75% |
| 分享到知乎 | 分享.mp3 | 75% |
| 生成箴言 | 告别.mp3 | 75% |

### 🚪 登录管理

- 右上角 **🍺 新的酒局** 按钮：刷新页面开始新对话
- 右上角 **🚪 退出登录** 按钮：清除 Token，重新登录 SecondMe
- 首次登录时显示 **🎧 耳机提示页**，建议用户佩戴耳机、打开音量
- 输入框左侧 **❓ 玩法指南** 按钮：点击查看详细操作流程

## 🏗️ 技术架构

```
┌─────────────────┐     SSE      ┌──────────────────────┐
│   React 前端     │◄────────────►│    FastAPI 后端        │
│   (Vite + TS)   │              │                      │
└─────────────────┘              │  ┌────────────────┐  │
                                 │  │  Orchestrator   │  │ ← Multi-Agent 编排
                                 │  └───────┬────────┘  │
                                 │          │           │
                            ┌────┴────┐ ┌───┴──┐ ┌─────┴──┐
                            │ 知乎 API │ │ Qwen │ │SecondMe│
                            │ (搜索)   │ │(对话)│ │(对话)  │
                            └─────────┘ └──────┘ └────────┘
```

### 技术栈

- **前端**：React 19 + TypeScript + Vite
- **后端**：Python 3.10+ / FastAPI / Uvicorn
- **AI 引擎**：
  - **SecondMe**：OAuth2 + SSE 流式对话（默认引擎）
  - **定制模型**：支持通义千问等 OpenAI 兼容格式模型（在设置中配置 API Key 后可启用）
  - 运行时可通过 UI 一键切换
- **数据源**：知乎开放 API（全网搜索 + 用户内容）
- **通信**：Server-Sent Events (SSE) 实现实时流式输出
- **国际化**：轻量 i18n 翻译系统（中/英双语）
- **持久化**：Session / Token / 语言偏好 均持久化，支持热重载
- **安全**：OAuth2 CSRF state 验证、Token 自动刷新、线程安全 JSON 原子写入
- **多用户隔离**：引擎切换、Token 存储、酒局会话 均按用户独立隔离

## 📁 项目结构

```
huiyin_bar/
├── backend/
│   ├── app/
│   │   ├── api/                 # API 路由层
│   │   │   ├── auth.py          # OAuth2 认证（Token 持久化）
│   │   │   ├── tavern.py        # 酒馆核心：开局/插话/蝴蝶效应/箴言/引擎切换
│   │   │   ├── social.py        # 知乎社交：发布箴言到圈子
│   │   │   └── settings.py      # 设置 API：配置读取/更新/热重载/恢复默认
│   │   ├── client/              # 外部 API 客户端
│   │   │   ├── zhihu.py         # 知乎 API（HMAC-SHA256 签名）
│   │   │   ├── secondme.py      # SecondMe API（OAuth2 + SSE）
│   │   │   └── qwen.py          # 通义千问 API（OpenAI 兼容格式）
│   │   ├── service/             # 业务逻辑层
│   │   │   ├── orchestrator.py  # Multi-Agent 编排器（四幕剧 + 自动对话）
│   │   │   └── guest_builder.py # 大牛匹配与客人构建（多级搜索降级）
│   │   ├── prompt/              # Prompt 模板
│   │   │   ├── bartender.py     # 酒保刘看山
│   │   │   ├── guest_past.py    # 当初的大牛（当下视角，非回忆）
│   │   │   ├── guest_present.py # 如今的大牛
│   │   │   └── guest_parallel.py # 平行宇宙大牛
│   │   ├── schema/              # Pydantic 数据模型
│   │   ├── utils/               # 工具模块
│   │   │   └── safe_json.py     # 线程安全 JSON 读写（per-file 锁 + 原子写入）
│   │   ├── config.py            # 配置管理（FRONTEND_URL / 运行时更新 / 脱敏）
│   │   └── main.py              # FastAPI 入口（整合前端 dist + SPA catch-all）
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   ├── audio/               # 音频素材
│   │   │   ├── 酒馆小曲.mp3      # 背景音乐
│   │   │   ├── 问候.mp3          # 推门进入音效
│   │   │   ├── 客人.mp3          # 客人落座音效
│   │   │   ├── 蝴蝶效应.mp3      # 蝴蝶效应触发音效
│   │   │   ├── 自动.mp3          # 自动讨论音效
│   │   │   ├── 分享.mp3          # 分享音效
│   │   │   └── 告别.mp3          # 箴言生成音效
│   │   ├── images/              # 刘看山 IP 形象素材
│   │   ├── product-doc.md       # 项目技术文档（弹窗展示）
│   │   └── guide.md             # 玩法指南（弹窗展示）
│   └── src/
│       ├── App.tsx              # 主应用组件（含引擎切换、设置面板）
│       ├── i18n.ts              # 多语言翻译表（中/英 70+ key）
│       ├── index.css            # 暗黑酒馆主题样式
│       ├── hooks/
│       │   ├── useSSEStream.ts  # SSE 流式数据 Hook
│       │   └── use-background-music.ts  # 背景音乐管理 Hook
│       └── types/
│           └── index.ts         # TypeScript 类型定义
├── .env                         # 环境变量（不入库）
├── .env.example                 # 环境变量模板
├── .gitignore
└── deploy.sh                    # 一键部署脚本
```

## 🚀 快速开始

### 前置条件

- Python 3.10+
- Node.js 18+
- 知乎开放 API 密钥
- SecondMe 开发者凭证
- 通义千问 API Key（可选，配置后可作为定制模型）

### 1. 配置环境变量

在项目根目录创建 `.env` 文件（参考 `.env.example`）：

```env
# 知乎开放 API
ZHIHU_APP_KEY=your_app_key
ZHIHU_APP_SECRET=your_app_secret

# SecondMe OAuth2
SECONDME_CLIENT_ID=your_client_id
SECONDME_CLIENT_SECRET=your_client_secret
SECONDME_REDIRECT_URI=http://localhost:8000/api/auth/callback

# 前端 URL（部署时改为实际域名）
FRONTEND_URL=http://localhost:8000

# 通义千问（Qwen）— 可选
QWEN_API_KEY=your_qwen_api_key
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```

### 2. 启动后端

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\pip install -r requirements.txt
.\venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# macOS / Linux
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 启动前端（开发模式）

```bash
cd frontend
npm install
npx vite --port 5173 --host 0.0.0.0
```

> 开发时前后端分开运行，前端通过 `VITE_API_BASE=http://localhost:8000` 指向后端。

### 4. 使用

1. 打开 `http://localhost:5173`
2. 点击 **🔑 连接 SecondMe** 完成 OAuth2 授权
3. 在输入框输入你的困惑，点击 **推门进入**
4. 与时空客人对话，可随时插话
5. 点击 **▶ 自动讨论** 让两位客人自动对话
6. 触发 **🦋 蝴蝶效应** 探索平行人生
7. 点击 **📜 生成箴言** 获取今夜精华
8. 点击 **📤 分享到知乎** 将箴言发布到知乎圈子

## 🌐 服务器部署

项目支持前后端整合部署，FastAPI 同时 serve 前端静态文件和 API，只需一个进程。

### 1. 构建前端

```bash
cd frontend && npm install && npm run build
```

### 2. 配置 `.env`

```env
SECONDME_REDIRECT_URI=https://www.huiyinbar.com/api/auth/callback
FRONTEND_URL=https://www.huiyinbar.com
```

### 3. 启动服务

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 4. Nginx 反代（HTTPS）

```nginx
server {
    listen 443 ssl;
    server_name www.huiyinbar.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        # SSE 流式传输需要关闭缓冲
        proxy_buffering off;
        proxy_cache off;
    }
}
```

## ⚙️ 设置面板

左上角 ⚙️ **设置** 按钮可打开配置面板：

| 分区 | 功能 |
|------|------|
| 🌐 语言 | 中文 / English 一键切换，即时生效 |
| 🤖 大模型 API | 自定义 Base URL、API Key、Model |
| 📘 知乎 API | 自定义 App Key、App Secret |

- 所有敏感字段（API Key / Secret）**不会在界面中显示**
- 留空则保持当前 `.env` 默认配置不变
- **恢复默认** 按钮可重新加载 `.env` 原始配置
- 保存后后端自动热重载客户端实例，无需重启

## 🎭 角色系统

| 角色 | 图标 | 定位 |
|------|------|------|
| 🦊 刘看山（酒保） | 北极狐 | 知乎官方 IP，接待引导，串联剧情 |
| 🔥 大牛（当初） | 火焰 | 正在经历同样困惑的同路人，当下视角 |
| 🌊 大牛（如今） | 海浪 | 经历岁月沉淀后的感悟和反思 |
| 🌀 大牛（平行宇宙） | 漩涡 | 展示"另一种选择"的人生走向 |

## 🔧 配置说明

### AI 引擎切换

页面顶部 header 区域有引擎切换按钮，支持运行时一键切换：

- **🧠 SecondMe**（绿色指示灯）— 默认引擎，SecondMe AI 分身
- **🤖 定制模型**（蓝色指示灯）— 需先在设置中配置自定义模型 API

切换仅影响当前用户，不会影响其他用户的引擎选择。切换后下一轮对话即生效。

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/auth/state` | 获取 OAuth2 CSRF state |
| `GET` | `/api/tavern/engine` | 查询当前用户引擎 |
| `POST` | `/api/tavern/engine` | 切换引擎（仅影响当前用户） |
| `GET` | `/api/settings` | 获取当前配置（敏感字段已隐藏） |
| `POST` | `/api/settings` | 更新配置 + 热重载 |
| `POST` | `/api/settings/reset` | 恢复 .env 默认配置 |
| `POST` | `/api/auth/logout` | 退出登录，清除 Token |

### 大牛匹配策略

- 多级降级搜索：完整关键词 → 逐个关键词合并 → 最短泛化关键词
- 按 `author_token` 聚合同一作者的内容
- 优先选择 **时间跨度最大** 且内容最丰富的大牛
- 最少要求 **2 年时间跨度**，不足时使用综合搜索结果降级

## 🐳 Docker 部署与发布

项目已提供 GitHub Actions 工作流：`.github/workflows/docker-build.yaml`。

根目录 `Dockerfile` 使用多阶段构建：先打包 frontend（Vite），再打包 backend（FastAPI），最终产物为单一镜像（同时包含前端静态资源与后端 API）。

- 在 **Release 发布** 时会自动构建并推送多架构镜像（`linux/amd64`、`linux/arm64`）到 GHCR：
  - `ghcr.io/<owner>/<repo>:<tag>`
  - `ghcr.io/<owner>/<repo>:latest`
- 同时会把每个架构的 Docker 镜像 tar 包上传到该 Release 的 Assets 区域：
  - `huiyin-bar-<tag>-amd64.tar`
  - `huiyin-bar-<tag>-arm64.tar`

### 1. 直接拉取多架构镜像（推荐）

```bash
docker pull ghcr.io/<owner>/<repo>:<tag>
docker run --rm -p 8000:8000 --env-file .env ghcr.io/<owner>/<repo>:<tag>
```

### 2. 本地构建单镜像

```bash
docker build -t huiyin-bar:local .
docker run --rm -p 8000:8000 --env-file .env huiyin-bar:local
```

### 3. 使用 Release Assets 中的镜像包

```bash
# 选择你的架构 tar 包下载后执行
docker load -i huiyin-bar-<tag>-amd64.tar
docker run --rm -p 8000:8000 --env-file .env huiyin-bar:<tag>-amd64
```

### 4. 手动触发构建

在 GitHub Actions 页面手动触发 **Docker Release** 工作流（`workflow_dispatch`）时，
会构建并推送多架构镜像到 GHCR，tag 形如 `manual-<sha7>`。

## 📄 License

[AGPL-3.0](LICENSE)
