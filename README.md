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
  - **通义千问（Qwen）**：OpenAI 兼容格式，支持多轮对话（默认引擎）
  - **SecondMe**：OAuth2 + SSE 流式对话（备选引擎）
  - 运行时可通过 UI 一键切换
- **数据源**：知乎开放 API（全网搜索 + 用户内容）
- **通信**：Server-Sent Events (SSE) 实现实时流式输出
- **持久化**：Session / Token 均持久化到文件，支持热重载

## 📁 项目结构

```
huiyin_bar/
├── backend/
│   ├── app/
│   │   ├── api/                 # API 路由层
│   │   │   ├── auth.py          # OAuth2 认证（Token 持久化）
│   │   │   ├── tavern.py        # 酒馆核心：开局/插话/蝴蝶效应/箴言/引擎切换
│   │   │   └── social.py        # 知乎社交：发布箴言到圈子
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
│   │   ├── config.py            # 配置管理（SecondMe / Qwen / 知乎）
│   │   └── main.py              # FastAPI 入口
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.tsx              # 主应用组件（含引擎切换 UI）
│       ├── index.css            # 暗黑酒馆主题样式
│       ├── hooks/
│       │   └── useSSEStream.ts  # SSE 流式数据 Hook
│       └── types/
│           └── index.ts         # TypeScript 类型定义
├── .env                         # 环境变量（不入库）
└── .gitignore
```

## 🚀 快速开始

### 前置条件

- Python 3.10+
- Node.js 18+
- 知乎开放 API 密钥
- SecondMe 开发者凭证
- 通义千问 API Key（可选，推荐）

### 1. 配置环境变量

在项目根目录创建 `.env` 文件：

```env
# 知乎开放 API
ZHIHU_APP_KEY=your_app_key
ZHIHU_APP_SECRET=your_app_secret

# SecondMe OAuth2
SECONDME_CLIENT_ID=your_client_id
SECONDME_CLIENT_SECRET=your_client_secret
SECONDME_REDIRECT_URI=http://localhost:5173/auth/callback

# 通义千问（Qwen）— 可选，配置后默认使用 Qwen 引擎
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

### 3. 启动前端

```bash
cd frontend
npm install
npx vite --port 5173 --host 0.0.0.0
```

### 4. 使用

1. 打开 `http://localhost:5173`
2. 点击 **🔑 连接 SecondMe** 完成 OAuth2 授权
3. 在输入框输入你的困惑，点击 **推门进入**
4. 与时空客人对话，可随时插话
5. 点击 **▶ 自动讨论** 让两位客人自动对话
6. 触发 **🦋 蝴蝶效应** 探索平行人生
7. 点击 **📜 生成箴言** 获取今夜精华

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

- **🤖 Qwen**（蓝色指示灯）— 通义千问，OpenAI 兼容格式，多轮对话
- **🧠 SecondMe**（绿色指示灯）— SecondMe AI 分身

切换后当前对话中下一轮即生效，无需重新开局。

对应后端 API：
- `GET /api/tavern/engine` — 查询当前引擎
- `POST /api/tavern/engine` — 切换引擎（body: `{"engine": "qwen"}` 或 `{"engine": "secondme"}`）

### 大牛匹配策略

- 多级降级搜索：完整关键词 → 逐个关键词合并 → 最短泛化关键词
- 按 `author_token` 聚合同一作者的内容
- 优先选择 **时间跨度最大** 且内容最丰富的大牛
- 最少要求 **2 年时间跨度**，不足时使用综合搜索结果降级

## 📄 License

[AGPL-3.0](LICENSE)
