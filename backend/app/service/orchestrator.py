"""
Multi-Agent 编排器 — 产品的大脑
管理四幕剧流程：酒保接待 → 客人匹配 → 辩论编排 → 箴言生成
"""
import json
import logging
import os
import uuid
from collections.abc import AsyncIterator

from app.client.secondme import SecondMeClient
from app.client.zhihu import ZhihuClient
from app.client.qwen import QwenClient
from app.prompt.bartender import (
    BARTENDER_SYSTEM_PROMPT,
    BARTENDER_ANALYSIS_CONTROL,
    BARTENDER_INVITE_PROMPT,
)
from app.schema.models import TavernSession, TavernEvent, GuestProfile
from app.service.guest_builder import GuestBuilder

logger = logging.getLogger(__name__)

# NOTE: Session 持久化到文件，解决 uvicorn --reload 重启后丢失的问题
SESSION_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "session_store.json")


def _load_sessions() -> dict[str, TavernSession]:
    """从文件加载所有酒局会话"""
    try:
        if os.path.exists(SESSION_FILE):
            with open(SESSION_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
            return {
                k: TavernSession.model_validate(v)
                for k, v in raw.items()
            }
    except (json.JSONDecodeError, IOError, Exception) as e:
        logger.warning("Session 文件读取失败: %s", e)
    return {}


def _save_sessions(sessions: dict[str, TavernSession]) -> None:
    """将酒局会话存储写入文件"""
    try:
        raw = {k: v.model_dump() for k, v in sessions.items()}
        with open(SESSION_FILE, "w", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False)
    except IOError as e:
        logger.error("Session 文件写入失败: %s", e)


class TavernOrchestrator:
    """
    酒馆 Multi-Agent 编排器
    每个角色维护独立的 SecondMe session，通过上下文拼接实现"对话"
    """

    def __init__(
        self,
        secondme: SecondMeClient,
        zhihu: ZhihuClient,
        access_token: str,
        qwen: QwenClient | None = None,
    ) -> None:
        self.secondme = secondme
        self.zhihu = zhihu
        self.access_token = access_token
        self.guest_builder = GuestBuilder(zhihu)
        # NOTE: Qwen 作为备选 AI 引擎，不需要 SecondMe OAuth
        self.qwen = qwen

    def _get_sessions(self) -> dict[str, TavernSession]:
        """获取所有会话（从文件加载）"""
        return _load_sessions()

    def _save_session(self, session: TavernSession) -> None:
        """保存单个会话到文件"""
        sessions = _load_sessions()
        sessions[session.session_id] = session
        _save_sessions(sessions)

    def get_session(self, session_id: str) -> TavernSession | None:
        """获取酒局会话"""
        return _load_sessions().get(session_id)

    async def start_session(self, user_concern: str) -> AsyncIterator[TavernEvent]:
        """
        启动一场酒局（第一幕 + 第二幕）
        1. 酒保开场白
        2. 分析用户困境提取关键词
        3. 搜索知乎匹配大牛
        4. 构建客人并邀请入座
        5. 触发第一轮辩论
        """
        session_id = f"tavern_{uuid.uuid4().hex[:12]}"
        session = TavernSession(
            session_id=session_id,
            user_concern=user_concern,
            current_stage=1,
        )
        self._save_session(session)

        # NOTE: 首先推送 session_id 给前端，后续交互需要用到
        yield TavernEvent(type="system", content="", session_id=session_id)

        # === 第一幕：酒保接待 ===
        yield TavernEvent(type="stage", stage=1, content="第一幕：推门与倾诉")

        # 酒保开场白
        bartender_reply = ""
        async for chunk in self.secondme.chat_stream(
            access_token=self.access_token,
            message=f"一个深夜的客人推门进来，坐到吧台前，看起来心事重重。",
            system_prompt=BARTENDER_SYSTEM_PROMPT,
        ):
            if chunk.done:
                # 记录酒保的 session_id
                session.secondme_session_ids["bartender"] = chunk.session_id
                break
            bartender_reply += chunk.content
            yield TavernEvent(
                type="bartender",
                speaker="刘看山",
                content=chunk.content,
            )
        yield TavernEvent(type="bartender", speaker="刘看山", done=True)

        # 用户倾诉后，酒保回应
        bartender_response = ""
        async for chunk in self.secondme.chat_stream(
            access_token=self.access_token,
            message=user_concern,
            system_prompt=BARTENDER_SYSTEM_PROMPT,
            session_id=session.secondme_session_ids.get("bartender"),
        ):
            if chunk.done:
                session.secondme_session_ids["bartender"] = chunk.session_id
                break
            bartender_response += chunk.content
            yield TavernEvent(
                type="bartender",
                speaker="刘看山",
                content=chunk.content,
            )
        yield TavernEvent(type="bartender", speaker="刘看山", done=True)

        # 分析用户意图提取关键词
        analysis_raw = await self.secondme.act_stream(
            access_token=self.access_token,
            message=user_concern,
            action_control=BARTENDER_ANALYSIS_CONTROL,
        )
        keywords = ["人生选择"]  # 默认关键词
        try:
            # NOTE: LLM 经常返回 ```json 包裹的 JSON，需要先剥离
            cleaned = analysis_raw.strip()
            if cleaned.startswith("```"):
                # 移除开头的 ```json 和结尾的 ```
                lines = cleaned.split("\n")
                lines = [l for l in lines if not l.strip().startswith("```")]
                cleaned = "\n".join(lines)
            analysis = json.loads(cleaned)
            keywords = analysis.get("keywords", keywords)
            logger.info("用户困境分析: %s", analysis)
        except json.JSONDecodeError:
            logger.warning("意图分析结果解析失败: %s", analysis_raw)

        # === 第二幕：时空客人落座 ===
        yield TavernEvent(type="stage", stage=2, content="第二幕：时空客人的落座")

        # 搜索知乎匹配大牛
        yield TavernEvent(
            type="system",
            content="*(刘看山转身走向吧台后面的时空档案柜...)*",
        )

        guest_pair = await self.guest_builder.find_and_build(keywords)
        if not guest_pair:
            yield TavernEvent(
                type="system",
                content="*(刘看山翻找了半天，遗憾地摇了摇头)* 今晚...找不到合适的客人。",
            )
            return

        session.guest_past, session.guest_now = guest_pair
        author_name = session.guest_past.author_name

        # 酒保邀请客人入座
        invite_text = BARTENDER_INVITE_PROMPT.format(author_name=author_name)
        yield TavernEvent(type="bartender", speaker="刘看山", content=invite_text, done=True)

        # 记录对话历史
        session.dialog_history.append({
            "role": "user",
            "content": user_concern,
        })

        # === 第三幕开启：圆桌对话 ===
        yield TavernEvent(type="stage", stage=3, content="第三幕：圆桌对话")
        session.current_stage = 3

        async for event in self._run_debate_round(session):
            yield event

        # NOTE: 酒局初始化完成，保存到文件
        self._save_session(session)

    async def user_speak(
        self, session_id: str, message: str
    ) -> AsyncIterator[TavernEvent]:
        """用户在辩论中插话"""
        session = _load_sessions().get(session_id)
        if not session:
            yield TavernEvent(type="system", content="酒局不存在")
            return

        session.dialog_history.append({"role": "user", "content": message})

        # 触发新一轮辩论（包含用户发言的上下文）
        async for event in self._run_debate_round(session):
            yield event

        self._save_session(session)

    async def trigger_butterfly(
        self, session_id: str, what_if: str
    ) -> AsyncIterator[TavernEvent]:
        """触发蝴蝶效应（第四幕）"""
        session = _load_sessions().get(session_id)
        if not session or not session.guest_past:
            yield TavernEvent(type="system", content="酒局不存在")
            return

        yield TavernEvent(type="stage", stage=4, content="第四幕：蝴蝶效应")
        session.current_stage = 4

        # 灯光闪烁效果
        yield TavernEvent(
            type="system",
            content="*(酒馆的灯光忽然闪烁起来，空气中弥漫着时空扭曲的微光...)*",
        )

        # 构建平行宇宙客人
        all_contents = (
            session.guest_past.source_contents
            + (session.guest_now.source_contents if session.guest_now else [])
        )
        session.guest_alt = self.guest_builder.build_parallel_guest(
            author_name=session.guest_past.author_name,
            author_token=session.guest_past.author_token,
            all_contents=all_contents,
            what_if=what_if,
        )

        # 客人 C 入场发言
        context = self._build_context(session)
        intro_message = (
            f"你刚从时空裂缝中被拉进这家酒馆。"
            f"桌上坐着当年的自己、现在的自己，还有一个迷茫的年轻人。"
            f"他们在讨论：{session.user_concern}。"
            f"而你来自一个平行宇宙，当年你做出了不同的选择：{what_if}。"
            f"\n\n之前的对话：\n{context}\n\n请做自我介绍并分享你的平行人生。"
        )

        alt_reply = ""
        async for chunk in self.secondme.chat_stream(
            access_token=self.access_token,
            message=intro_message,
            system_prompt=session.guest_alt.system_prompt,
        ):
            if chunk.done:
                session.secondme_session_ids["guest_alt"] = chunk.session_id
                break
            alt_reply += chunk.content
            yield TavernEvent(
                type="guest_alt",
                speaker=session.guest_alt.author_name,
                content=chunk.content,
            )
        yield TavernEvent(
            type="guest_alt",
            speaker=session.guest_alt.author_name,
            done=True,
        )

        session.dialog_history.append({
            "role": "guest_alt",
            "speaker": session.guest_alt.author_name,
            "content": alt_reply,
        })

        self._save_session(session)

    async def start_auto_mode(
        self, session_id: str, max_rounds: int = 5
    ) -> AsyncIterator[TavernEvent]:
        """
        启动自动对话模式
        过去和现在两个 Agent 自动轮流讨论，每轮结束检查是否被暂停
        """
        session = _load_sessions().get(session_id)
        if not session:
            logger.warning(
                "自动模式: 找不到 session_id=%s, 当前已有 sessions=%s",
                session_id, list(_load_sessions().keys()),
            )
            yield TavernEvent(type="system", content="酒局不存在")
            return
        if not session.guest_past or not session.guest_now:
            yield TavernEvent(type="system", content="客人尚未入座，无法开始自动讨论")
            return

        session.auto_mode = True
        session.auto_round_count = 0
        # NOTE: 立即保存到文件，确保循环中从文件读取时 auto_mode 为 True
        self._save_session(session)

        yield TavernEvent(
            type="auto_status",
            content="auto_started",
        )
        yield TavernEvent(
            type="bartender",
            speaker="刘看山",
            content="*(刘看山往两位的杯子里续满酒)* 你们慢慢聊，我在旁边听着。",
            done=True,
        )

        for round_num in range(1, max_rounds + 1):
            # NOTE: 每轮开始前从文件重新读取停止标志，确保能感知 stop_auto_mode 的信号
            latest = _load_sessions().get(session_id)
            if latest and not latest.auto_mode:
                break

            session.auto_round_count = round_num
            yield TavernEvent(
                type="auto_status",
                content=f"round_{round_num}",
            )

            # 执行一轮对话（过去 → 现在）
            async for event in self._run_debate_round(session):
                yield event

            # FIXME: 竞态修复——保存前先从文件同步 auto_mode 标志
            # 避免内存中的 auto_mode=True 覆盖 stop_auto_mode 写入的 False
            latest = _load_sessions().get(session_id)
            if latest:
                session.auto_mode = latest.auto_mode

            # NOTE: 轮次结束后保存对话历史
            self._save_session(session)

            # 轮次结束后检查，实现柔性停止
            if not session.auto_mode:
                break

        # 自动模式结束
        session.auto_mode = False
        yield TavernEvent(
            type="auto_status",
            content="auto_stopped",
        )

        # 酒保收场
        if session.auto_round_count >= max_rounds:
            yield TavernEvent(
                type="bartender",
                speaker="刘看山",
                content="*(刘看山轻轻敲了敲桌面)* 聊了好几轮了，要不先歇歇？有什么想法也可以说说。",
                done=True,
            )
        else:
            yield TavernEvent(
                type="bartender",
                speaker="刘看山",
                content="*(刘看山点了点头)* 好，先停一停。有什么想法尽管说。",
                done=True,
            )

        self._save_session(session)

    def stop_auto_mode(self, session_id: str) -> dict:
        """
        停止自动对话模式（柔性停止，等当前轮次结束）
        """
        session = _load_sessions().get(session_id)
        if not session:
            return {"error": "酒局不存在"}

        session.auto_mode = False
        self._save_session(session)
        logger.info("自动模式已标记为停止: session=%s, completed_rounds=%d",
                     session_id, session.auto_round_count)
        return {
            "status": "stopping",
            "completed_rounds": session.auto_round_count,
        }

    async def generate_receipt(self, session_id: str) -> dict:
        """
        生成酒馆箴言小票（最终幕）
        用酒保的视角总结今晚的精彩对话
        """
        session = _load_sessions().get(session_id)
        if not session:
            return {"error": "酒局不存在"}

        context = self._build_context(session)
        # NOTE: 注入当前日期，避免 LLM 编造错误日期
        from datetime import datetime
        today = datetime.now().strftime("%Y.%m.%d")
        receipt_prompt = (
            f"你是酒馆的酒保刘看山。今晚的酒局已经散场。\n"
            f"请严格按照以下模板格式，总结今晚的对话精华。\n\n"
            f"⚠️ 重要规则：\n"
            f"1. 不要使用任何真实用户名！说话者一律用：酒馆来客（当年）、酒馆来客（如今）、酒馆来客（平行宇宙）、客人（提问者）\n"
            f"2. 必须严格遵循下面的模板格式，不要添加多余的装饰符号\n"
            f"3. 金句提取 3-5 句最打动人的话\n\n"
            f"===== 输出模板（请严格遵循） =====\n\n"
            f"🍺 酒馆箴言 🍺\n\n"
            f"【今夜主题】\n"
            f"（一句话概括今晚的主题）\n\n"
            f"━━━━━━━━━━━━━━━━━━━━\n\n"
            f"📝 今夜金句\n\n"
            f"酒馆来客（当年）说：\n"
            f"\"（引用原话）\"\n\n"
            f"酒馆来客（如今）说：\n"
            f"\"（引用原话）\"\n\n"
            f"（重复 3-5 条金句）\n\n"
            f"━━━━━━━━━━━━━━━━━━━━\n\n"
            f"【酒保寄语】\n"
            f"（用刘看山温暖的口吻写 2-3 句收尾寄语）\n\n"
            f"—— 刘看山 敬上\n\n"
            f"🌙 {today}\n\n"
            f"===== 模板结束 =====\n\n"
            f"今晚的对话：\n{context}"
        )

        receipt_text = ""
        async for chunk in self.secondme.chat_stream(
            access_token=self.access_token,
            message=receipt_prompt,
            system_prompt="你是一个善于捕捉人生金句的酒馆记录员。",
        ):
            if chunk.done:
                break
            receipt_text += chunk.content

        return {
            "session_id": session_id,
            "receipt": receipt_text,
            "concern": session.user_concern,
            "guest_name": session.guest_past.author_name if session.guest_past else "",
        }

    # ============ 内部方法 ============

    async def _run_debate_round(
        self, session: TavernSession
    ) -> AsyncIterator[TavernEvent]:
        """
        执行一轮对话
        客人 A 分享当初想法 → 客人 B 补充如今感触 → 酒保穿插
        NOTE: 当 Qwen 可用时优先使用 Qwen，否则回退到 SecondMe
        """
        if not session.guest_past or not session.guest_now:
            return

        context = self._build_context(session)

        # 客人 A（当初的大牛）分享当时的想法
        past_message = (
            f"当前酒桌上的对话回顾：\n{context}\n\n"
            f"现在轮到你说了。说说你最近一直在纠结什么，你现在怎么想的。记住你就活在当下，不是在回忆。"
        )

        past_reply = ""
        if self.qwen:
            # NOTE: 用多轮 messages 格式传递对话历史，让 Qwen 真正“看到”对方说了什么
            past_history = self._build_chat_history(session, "guest_past")
            past_instruction = (
                "现在轮到你说了。"
                "说说你最近一直在纠结什么，你现在怎么想的。"
                "记住你就活在当下，不是在回忆。"
            )
            async for chunk in self.qwen.chat_stream(
                message=past_instruction,
                system_prompt=session.guest_past.system_prompt,
                history=past_history,
            ):
                if chunk.done:
                    break
                past_reply += chunk.content
                yield TavernEvent(
                    type="guest_past",
                    speaker=session.guest_past.author_name,
                    content=chunk.content,
                )
        else:
            # 回退到 SecondMe 引擎
            async for chunk in self.secondme.chat_stream(
                access_token=self.access_token,
                message=past_message,
                system_prompt=session.guest_past.system_prompt,
                session_id=session.secondme_session_ids.get("guest_past"),
            ):
                if chunk.done:
                    session.secondme_session_ids["guest_past"] = chunk.session_id
                    break
                past_reply += chunk.content
                yield TavernEvent(
                    type="guest_past",
                    speaker=session.guest_past.author_name,
                    content=chunk.content,
                )
        yield TavernEvent(
            type="guest_past",
            speaker=f"{session.guest_past.author_name}（当年）",
            done=True,
        )

        session.dialog_history.append({
            "role": "guest_past",
            "speaker": session.guest_past.author_name,
            "content": past_reply,
        })

        # 酒保穿插
        yield TavernEvent(
            type="bartender",
            speaker="刘看山",
            content="*(刘看山给两位添了点酒，若有所思地点了点头)*",
            done=True,
        )

        # 客人 B（如今的大牛）补充感悟
        now_context = self._build_context(session)
        now_message = (
            f"当前酒桌上的对话回顾：\n{now_context}\n\n"
            f"当初的自己刚刚分享了那时的想法。"
            f"现在轮到你发言了，请结合你这些年的经历和反思，补充你现在的感悟。"
        )

        now_reply = ""
        if self.qwen:
            now_history = self._build_chat_history(session, "guest_now")
            now_instruction = (
                "当初的自己刚刚分享了那时的想法。"
                "现在轮到你发言了，请结合你这些年的经历和反思，补充你现在的感悟。"
            )
            async for chunk in self.qwen.chat_stream(
                message=now_instruction,
                system_prompt=session.guest_now.system_prompt,
                history=now_history,
            ):
                if chunk.done:
                    break
                now_reply += chunk.content
                yield TavernEvent(
                    type="guest_now",
                    speaker=session.guest_now.author_name,
                    content=chunk.content,
                )
        else:
            async for chunk in self.secondme.chat_stream(
                access_token=self.access_token,
                message=now_message,
                system_prompt=session.guest_now.system_prompt,
                session_id=session.secondme_session_ids.get("guest_now"),
            ):
                if chunk.done:
                    session.secondme_session_ids["guest_now"] = chunk.session_id
                    break
                now_reply += chunk.content
                yield TavernEvent(
                    type="guest_now",
                    speaker=session.guest_now.author_name,
                    content=chunk.content,
                )
        yield TavernEvent(
            type="guest_now",
            speaker=f"{session.guest_now.author_name}（如今）",
            done=True,
        )

        session.dialog_history.append({
            "role": "guest_now",
            "speaker": session.guest_now.author_name,
            "content": now_reply,
        })

    def _build_context(self, session: TavernSession) -> str:
        """将对话历史拼接为上下文字符串（用于 SecondMe 引擎）"""
        lines = []
        for entry in session.dialog_history[-10:]:  # NOTE: 只保留最近 10 轮避免 Prompt 过长
            role = entry.get("role", "")
            speaker = entry.get("speaker", "")
            content = entry.get("content", "")
            if role == "user":
                lines.append(f"用户：{content}")
            else:
                lines.append(f"{speaker}：{content}")
        return "\n".join(lines)

    @staticmethod
    def _build_chat_history(
        session: TavernSession, current_role: str
    ) -> list[dict]:
        """
        将对话历史转换为 OpenAI messages 格式（用于 Qwen 引擎）
        当前角色的历史发言设为 assistant，其他角色设为 user
        这样 Qwen 能以多轮对话的方式理解上下文
        """
        messages: list[dict] = []
        for entry in session.dialog_history[-10:]:
            role = entry.get("role", "")
            speaker = entry.get("speaker", "")
            content = entry.get("content", "")
            if role == current_role:
                # 当前 Agent 的历史发言 → assistant
                messages.append({"role": "assistant", "content": content})
            else:
                # 其他角色的发言 → user（带说话者标识）
                prefix = "用户" if role == "user" else speaker
                messages.append({"role": "user", "content": f"[{prefix}]: {content}"})
        return messages
