# 回音酒馆 · 项目文档

## 1. 项目概述

### 1.1 产品定位

回音酒馆（Echo Tavern）是一款基于 Multi-Agent 编排的沉浸式人生对话应用，面向正在经历人生重大选择的年轻人。

产品的核心理念是：**每一个人生选择都值得被认真对待，而最好的参照不是别人的建议，是经历过同样纠结的人的真实思考。**

用户在深夜推开一家地下酒馆的门，向酒保刘看山倾诉困惑。刘看山会从知乎上找到一位与用户困境相关的大牛，召唤出 ta 的「当初」和「如今」两个时空版本，让他们在同一张酒桌前帮用户看清人生选择。

### 1.2 核心价值

**同路人共鸣**
「当初」的大牛不是在回忆过去，而是正处于和用户一样的迷茫中。他活在那个时间点，不知道未来会怎样，和用户是真正的同路人。这比任何"过来人建议"都更能引起共鸣。

**时间维度启发**
「如今」的大牛用岁月沉淀后的视角补充现实感悟。他见证了选择的后果，能从更长的时间线上给出思考。两个版本的对话，帮用户从时间维度理解选择的本质。

**沉浸式体验**
深夜酒馆场景 + 角色扮演 + 实时流式对话 + 刘看山 IP 加持。不是冷冰冰的问答，而是一场有温度的深夜对话。

### 1.3 五幕剧结构

回音酒馆的用户体验设计为五幕剧结构，每一幕都有明确的戏剧功能：

| 幕 | 名称 | 戏剧功能 | 用户动作 |
|---|------|---------|---------|
| 第一幕 | 推门与倾诉 | 建立信任、引出困惑 | 输入困惑，点击「推门进入」 |
| 第二幕 | 时空客人落座 | 制造期待、引入角色 | 等待大牛匹配（自动） |
| 第三幕 | 圆桌对话 | 核心体验、深度对话 | 插话 / 自动讨论 / 切换引擎 |
| 第四幕 | 蝴蝶效应 | 拓展视角、探索可能 | 点击🦋提出假设 |
| 终幕 | 酒馆箴言 | 沉淀收获、仪式感 | 点击📜生成箴言 |

### 1.4 角色图鉴

| 图标 | 角色 | 人格定位 | 说话风格 |
|:---:|------|---------|---------|
| 🦊 | 刘看山（酒保） | 知乎官方 IP 北极狐，暖心倾听者 | 温暖、简洁、善于引导 |
| 🔥 | 大牛·当初 | 正在经历同样困惑的同路人 | 当下口吻，真诚迷茫，禁止回忆 |
| 🌊 | 大牛·如今 | 走过这段路后的过来人 | 沉稳反思，有阅历感 |
| 🌀 | 大牛·平行宇宙 | 做了不同选择后的另一个 ta | 带着另一种人生经历的好奇 |

## 2. 技术架构

### 2.1 系统架构

整体采用前后端分离架构，通过 SSE（Server-Sent Events）实现实时流式通信：

前端（React SPA）发送 HTTP 请求到后端（FastAPI），后端中的编排器（Orchestrator）根据五幕剧流程调度 AI 引擎生成对话内容，通过 SSE 流式推送到前端实时渲染。

数据流：用户输入 → POST 请求 → 编排器接收 → 调度 AI 引擎（Qwen/SecondMe） → SSE 流式推送 TavernEvent → 前端逐字渲染。

### 2.2 技术栈详情

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 前端框架 | React + TypeScript | 19.x | SPA 单页应用 |
| 构建工具 | Vite | 6.x | 开发服务器 + HMR |
| 后端框架 | FastAPI | 0.115+ | RESTful API + SSE |
| 运行时 | Uvicorn | latest | ASGI 服务器（支持 --reload） |
| AI 引擎 1 | Qwen（通义千问） | qwen-plus | OpenAI 兼容接口，默认引擎 |
| AI 引擎 2 | SecondMe | - | OAuth2 + SSE 流式对话 |
| 数据源 | 知乎开放 API | - | HMAC-SHA256 签名认证 |
| HTTP 客户端 | httpx | latest | 异步 HTTP 请求 |
| 数据校验 | Pydantic | v2 | 请求/响应数据模型 |
| SSE 库 | sse-starlette | latest | 服务端 SSE 推送 |

### 2.3 项目目录结构

**后端（backend/app/）**

后端严格遵循分层架构：

- api/ —— 路由层，负责请求解析和响应封装
  - auth.py：OAuth2 认证，Token 持久化到 token_store.json
  - tavern.py：酒馆核心（开局/插话/蝴蝶效应/箴言/自动对话/引擎切换）
  - social.py：知乎社交（发布箴言到圈子）
- client/ —— 外部 API 客户端封装
  - secondme.py：SecondMe API（OAuth2 授权 + SSE 流式对话 + 动作判断 + Memory）
  - qwen.py：通义千问 API（OpenAI 兼容格式，多轮 messages 对话）
  - zhihu.py：知乎开放 API（HMAC-SHA256 签名，全网搜索）
- service/ —— 业务逻辑层
  - orchestrator.py：Multi-Agent 编排器（五幕剧流程 + 自动对话 + Session 持久化）
  - guest_builder.py：大牛匹配引擎（三级降级搜索 + 时间跨度评分 + 客人构建）
- prompt/ —— Prompt 模板
  - bartender.py：酒保刘看山（开场白 + 意图分析控制指令）
  - guest_past.py：当初的大牛（当下视角，严禁回忆口吻）
  - guest_present.py：如今的大牛（过来人视角）
  - guest_parallel.py：平行宇宙大牛
- schema/ —— Pydantic 数据模型
  - models.py：TavernSession、TavernEvent、GuestProfile、请求模型等
- config.py —— 配置管理（SecondMe / Qwen / 知乎，从环境变量读取）
- main.py —— FastAPI 入口（CORS 配置 + 路由挂载）

**前端（frontend/src/）**

- App.tsx：主应用组件（状态管理 + SSE 处理 + UI 渲染 + 引擎切换 + 文档弹窗）
- index.css：全局样式系统（暗黑酒馆主题 + 角色色彩 + 动画）
- hooks/useSSEStream.ts：SSE 流式数据 Hook（通用 SSE 消费逻辑）
- types/index.ts：TypeScript 类型定义（TavernEvent / DialogEntry / TavernState）

## 3. 核心模块详解

### 3.1 Multi-Agent 编排器

编排器（TavernOrchestrator）是整个系统的大脑，负责协调多个 Agent 角色在五幕剧中的对话流程。

**核心职责：**
- 管理酒局 Session 的完整生命周期（创建 → 对话 → 结束）
- 按五幕剧结构编排对话流程，控制幕间转场
- 调度 AI 引擎（Qwen 优先，SecondMe 备选）生成角色回复
- 管理自动对话模式的启停和轮次控制
- 将 Session 数据持久化到文件，确保热重载后数据不丢失

**Session 数据结构（TavernSession）：**
- session_id：酒局唯一标识
- user_concern：用户困惑原文
- guest_past / guest_now / guest_alt：三位客人的 GuestProfile
- dialog_history：完整对话历史（role + speaker + content）
- secondme_session_ids：各角色在 SecondMe 中的 session 映射
- auto_mode / auto_round_count：自动对话状态

**对话上下文传递机制：**

使用 Qwen 引擎时，对话历史会被转换为 OpenAI 标准的多轮 messages 格式：
- 当前 Agent 的历史发言 → role: assistant
- 其他角色的发言 → role: user（带说话者标识前缀）
- 当前轮指令 → 最后一条 user message

这样每个 Agent 能以原生多轮对话的方式理解上下文，而不是把历史拼成一段文字。

### 3.2 AI 引擎系统

系统支持双 AI 引擎，运行时可通过页面顶部按钮一键切换，无需重新开局。

**Qwen（通义千问）—— 默认引擎**
- 接口格式：OpenAI Chat Completions 兼容
- 端点：DashScope（dashscope.aliyuncs.com）
- 上下文方式：多轮 messages 数组
- 优势：独立于 SecondMe，无需 OAuth2，多轮对话理解更好
- 配置：通过 QWEN_API_KEY 环境变量启用

**SecondMe —— 备选引擎**
- 认证：OAuth2 授权码流程
- 端点：api.mindverse.com
- 上下文方式：服务端 session 记忆 + 文本上下文拼接
- 特色：AI 分身能力，Agent Memory 写入

**切换机制：**
- 前端通过 POST /api/tavern/engine 发送切换请求
- 后端更新全局 _qwen 变量，并同步更新所有已缓存编排器的引擎引用
- 编排器在 _run_debate_round 中通过 self.qwen 是否为 None 决定使用哪个引擎

### 3.3 大牛匹配引擎

大牛匹配（GuestBuilder）负责从知乎搜索结果中找到最合适的大牛，构建时空客人的角色 Prompt。

**搜索策略（三级降级）：**

第一级 —— 完整关键词搜索：将意图分析提取的所有关键词用空格拼接，搜索 30 条结果。大部分情况下在这一级就能拿到结果。

第二级 —— 逐个关键词搜索：当第一级失败（如关键词组合太长导致知乎 API 报错）时，逐个关键词分别搜索 15 条，合并去重（按 author_token + content 前 50 字符去重）。

第三级 —— 泛化关键词兜底：当前两级都无结果时，取最短的关键词单独搜索 30 条。最短关键词通常是最泛化的概念。

**匹配算法：**
1. 按 author_token 聚合搜索结果，将同一作者的内容分组
2. 对每个作者计算评分：score = 时间跨度（年） × 内容数量
3. 选择 score 最高的作者作为目标大牛
4. 要求时间跨度 ≥ 2 年（MIN_TIME_SPAN_SECONDS = 63072000）
5. 跨度不足时降级：用最高赞作者的名义，将所有结果按时间对半分组

**客人构建：**
选定大牛后，其内容按 edit_time 排序，前半为「当初」、后半为「如今」。分别填入对应的 Prompt 模板（guest_past / guest_present），生成 GuestProfile（含 system_prompt + source_contents）。

### 3.4 Prompt 设计哲学

**酒保·刘看山**
- 开场白 prompt 设定她为知乎 IP 北极狐，暖心但不啰嗦
- 意图分析使用 act_stream 返回结构化 JSON（关键词 + 情感 + 主题）
- LLM 返回 markdown 代码块包裹的 JSON 会自动剥离

**大牛·当初（核心设计难点）**
- 最关键的 prompt 设计决策：这个 Agent 活在过去的时间点
- 他的素材被描述为「你脑子里反复出现的想法」而非「你写下的文字」
- 明确列出禁用词：「当时」「那时候」「回想起来」「后来我才明白」
- 给出正确口吻示例：「我最近一直在想」「我昨天还在纠结」
- 对「未来的自己」可以好奇、质疑、不信

**大牛·如今**
- 以过来人视角说话，可以用「回头看」「经历过之后」等时间词汇
- 不说教，用分享的口吻，重点是「这些年我想通了什么」

**大牛·平行宇宙**
- 基于用户的「如果当年...」假设构建
- 展示另一种选择的人生走向，可以是好的也可以是遗憾的

### 3.5 Session 持久化

为解决 uvicorn --reload 导致内存数据丢失的问题，所有关键数据均持久化到 JSON 文件：

**token_store.json**
- 存储 OAuth2 Access Token
- 按 session_key 索引
- 在 auth.py 中管理

**session_store.json**
- 存储酒局 Session 数据（对话历史、客人信息、状态）
- 按 session_id 索引
- 关键操作后自动保存：创建 session、每轮对话结束、自动模式启停

**持久化时机：**
- start_session 完成后保存
- _run_debate_round 每轮结束后保存
- start_auto_mode 启动时保存（auto_mode=True 状态标记）
- stop_auto_mode 调用时保存（auto_mode=False 信号）

### 3.6 自动对话模式

自动讨论模式让两位时空客人自动轮流对话，用户可在旁观看或随时暂停。

**启动流程：**
1. 前端调用 POST /api/tavern/auto-start（SSE 端点）
2. 设置 session.auto_mode = True 并保存到文件
3. 进入 for 循环，最多执行 max_rounds（默认 5）轮
4. 每轮调用 _run_debate_round 生成一轮对话
5. 每轮开始和结束时从文件重新读取 auto_mode 标志

**停止机制（柔性停止）：**
1. 前端调用 POST /api/tavern/auto-stop
2. 后端设置 session.auto_mode = False 并保存到文件
3. 正在运行的循环在当前轮次结束后检测到文件中的标志变化
4. 跳出循环，推送 auto_stopped 事件

这个设计的关键是：stop 信号通过文件传递，而非内存变量。因为 start 和 stop 可能在不同的请求上下文中执行。

## 4. API 参考

### 4.1 酒局生命周期

**POST /api/tavern/start**
- 类型：SSE 流式端点
- 参数：session_key（query）、StartRequest body（user_concern）
- 说明：开启新酒局，推送五幕剧事件流
- 返回事件：stage / bartender / guest_past / guest_now / system

**POST /api/tavern/speak**
- 类型：SSE 流式端点
- 参数：session_key（query）、SpeakRequest body（session_id, message）
- 说明：用户在对话中插话，触发一轮 Agent 回应

**POST /api/tavern/butterfly**
- 类型：SSE 流式端点
- 参数：session_key（query）、ButterflyRequest body（session_id, what_if）
- 说明：触发蝴蝶效应，召唤平行宇宙客人

**POST /api/tavern/receipt**
- 类型：JSON 端点
- 参数：session_key（query）、ReceiptRequest body（session_id）
- 说明：生成酒馆箴言小票

### 4.2 自动对话模式

**POST /api/tavern/auto-start**
- 类型：SSE 流式端点
- 参数：session_key（query）、AutoModeRequest body（session_id, max_rounds?）
- 说明：启动自动对话模式
- 返回事件：auto_status（auto_started / round_N / auto_stopped） + 对话事件

**POST /api/tavern/auto-stop**
- 类型：JSON 端点
- 参数：session_key（query）、AutoModeRequest body（session_id）
- 说明：柔性停止自动对话（等当前轮次结束）

### 4.3 引擎管理

**GET /api/tavern/engine**
- 返回：{ current: "qwen"|"secondme", qwen_available: bool, qwen_model: string }

**POST /api/tavern/engine**
- Body：{ engine: "qwen"|"secondme" }
- 返回：{ current: string, message: string }
- 说明：切换 AI 引擎，立即生效

### 4.4 认证

**GET /api/auth/login**
- 说明：重定向到 SecondMe OAuth2 授权页面

**POST /api/auth/exchange**
- Body：{ code: string }
- 返回：{ session_key: string }
- 说明：用 OAuth2 授权码换取 Access Token

## 5. 前端架构

### 5.1 状态管理

主应用组件（App.tsx）使用 React useState 管理以下状态：

- TavernState：sessionId / stage / isLoading / dialogs / sessionKey / autoMode
- engine：当前 AI 引擎（'qwen' | 'secondme'）
- docOpen / docContent：项目文档弹窗

sessionKey 持久化到 localStorage，页面刷新后自动恢复。

### 5.2 SSE 通信

useSSEStream Hook 封装了通用的 SSE 消费逻辑：
- 建立 EventSource 连接
- 解析 TavernEvent 事件
- 回调 handleEvent 更新状态
- 自动重连和错误处理

### 5.3 Markdown 渲染

自研轻量 renderMarkdown 函数，支持：标题（h1-h4）、粗体、斜体、列表、数字列表、表格、分割线、引用块。不依赖第三方 Markdown 库，减少打包体积。

### 5.4 样式系统

使用 CSS 变量定义设计令牌：
- 主色系：深夜酒馆暗色调（#0a0a0f 系列）
- 点缀色：琥珀色（酒液色）
- 霓虹微光：紫色/蓝色/粉色（时空错位感）
- 角色色彩：每个角色有独立颜色标识

## 6. 配置说明

### 6.1 环境变量

所有外部服务凭证通过项目根目录 .env 文件管理，参考 .env.example：

**知乎开放 API（必须）：**
- ZHIHU_APP_KEY：应用 Key
- ZHIHU_APP_SECRET：应用 Secret

**SecondMe OAuth2（必须）：**
- SECONDME_CLIENT_ID：客户端 ID
- SECONDME_CLIENT_SECRET：客户端密钥
- SECONDME_REDIRECT_URI：回调地址（默认 http://localhost:5173/auth/callback）
- SECONDME_BASE_URL：API 地址（默认 https://api.mindverse.com/gate/lab）

**通义千问（可选，推荐）：**
- QWEN_API_KEY：API Key（配置后自动启用 Qwen 引擎）
- QWEN_BASE_URL：API 地址（默认 DashScope 兼容端点）
- QWEN_MODEL：模型名（默认 qwen-plus）

### 6.2 可调参数

| 参数 | 位置 | 默认值 | 说明 |
|------|------|--------|------|
| MIN_TIME_SPAN_SECONDS | guest_builder.py | 63072000（2年） | 大牛最少时间跨度 |
| 搜索数量 | guest_builder.py | 30 / 15 | 完整搜索 / 逐个搜索 |
| 对话历史窗口 | orchestrator.py | 10 | 传给 AI 的最近 N 轮对话 |
| max_rounds | orchestrator.py | 5 | 自动对话最大轮次 |
| 内容截断 | guest_builder.py | 3000 字符 | Prompt 中的知乎内容上限 |

## 7. 部署与运维

### 7.1 本地开发

后端：cd backend && python -m venv venv && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000

前端：cd frontend && npm install && npx vite --port 5173

### 7.2 注意事项

- uvicorn --reload 会因文件变动重启进程，Session 和 Token 已持久化到文件不会丢失
- 两个 uvicorn 实例同时运行可能导致端口冲突，确保只启动一个
- Qwen API Key 配置后会自动启用，如需切换回 SecondMe 可通过页面按钮操作

## 8. 开源协议

本项目采用 AGPL-3.0 开源协议，详见 LICENSE 文件。
