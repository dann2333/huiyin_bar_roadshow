"""
SecondMe API 客户端
封装 OAuth2 流程和 AI 对话能力
"""
import json
import logging
import secrets
from collections.abc import AsyncIterator

import httpx

from app.config import SecondMeConfig
from app.schema.models import TokenResponse, ChatChunk

logger = logging.getLogger(__name__)


class SecondMeClient:
    """
    SecondMe API 客户端
    提供 OAuth2 授权流程和 AI 对话引擎接口
    """

    def __init__(self) -> None:
        self.client_id = SecondMeConfig.CLIENT_ID
        self.client_secret = SecondMeConfig.CLIENT_SECRET
        self.redirect_uri = SecondMeConfig.REDIRECT_URI
        self.base_url = SecondMeConfig.BASE_URL
        self.auth_url = SecondMeConfig.AUTH_URL
        self._http = httpx.AsyncClient(timeout=60.0)

    # ============ OAuth2 流程 ============

    def get_auth_url(self, state: str | None = None) -> str:
        """
        构建 OAuth2 授权 URL
        引导用户跳转到 SecondMe 授权页面
        """
        if state is None:
            state = secrets.token_urlsafe(16)
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "state": state,
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.auth_url}?{query}"

    async def exchange_token(self, code: str) -> TokenResponse | None:
        """
        用授权码换取 Access Token
        NOTE: 必须使用 application/x-www-form-urlencoded 格式
        """
        try:
            resp = await self._http.post(
                f"{self.base_url}/api/oauth/token/code",
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": self.redirect_uri,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            data = resp.json()
            if data.get("code") != 0:
                logger.error("换取 Token 失败: %s", data)
                return None
            token_data = data.get("data", {})
            return TokenResponse(
                access_token=token_data.get("accessToken", ""),
                refresh_token=token_data.get("refreshToken", ""),
                token_type=token_data.get("tokenType", "Bearer"),
                expires_in=token_data.get("expiresIn", 7200),
                scope=token_data.get("scope", []),
            )
        except Exception:
            logger.exception("换取 Token 异常")
            return None

    async def refresh_token(self, refresh_token: str) -> TokenResponse | None:
        """刷新 Access Token（有效期 2 小时后需要刷新）"""
        try:
            resp = await self._http.post(
                f"{self.base_url}/api/oauth/token/refresh",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            data = resp.json()
            if data.get("code") != 0:
                logger.error("刷新 Token 失败: %s", data)
                return None
            token_data = data.get("data", {})
            return TokenResponse(
                access_token=token_data.get("accessToken", ""),
                refresh_token=token_data.get("refreshToken", ""),
                token_type=token_data.get("tokenType", "Bearer"),
                expires_in=token_data.get("expiresIn", 7200),
                scope=token_data.get("scope", []),
            )
        except Exception:
            logger.exception("刷新 Token 异常")
            return None

    # ============ AI 对话引擎 ============

    async def chat_stream(
        self,
        access_token: str,
        message: str,
        system_prompt: str = "",
        session_id: str | None = None,
        model: str = "anthropic/claude-sonnet-4-5",
    ) -> AsyncIterator[ChatChunk]:
        """
        流式聊天 — 核心对话引擎
        通过 SSE 逐块返回 AI 分身的回复
        """
        body: dict = {"message": message}
        if system_prompt:
            body["systemPrompt"] = system_prompt
        if session_id:
            body["sessionId"] = session_id
        if model:
            body["model"] = model

        async with self._http.stream(
            "POST",
            f"{self.base_url}/api/secondme/chat/stream",
            json=body,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        ) as resp:
            current_session_id = session_id or ""
            async for line in resp.aiter_lines():
                if not line:
                    continue
                # 处理 session 事件
                if line.startswith("event: session"):
                    continue
                if line.startswith("data: "):
                    raw = line[6:]
                    if raw == "[DONE]":
                        yield ChatChunk(
                            content="",
                            session_id=current_session_id,
                            done=True,
                        )
                        return
                    try:
                        payload = json.loads(raw)
                        # 提取 sessionId
                        if "sessionId" in payload:
                            current_session_id = payload["sessionId"]
                            continue
                        # 提取内容增量
                        choices = payload.get("choices", [])
                        if choices:
                            delta = choices[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield ChatChunk(
                                    content=content,
                                    session_id=current_session_id,
                                    done=False,
                                )
                    except json.JSONDecodeError:
                        logger.warning("无法解析 SSE 数据: %s", raw)

    async def act_stream(
        self,
        access_token: str,
        message: str,
        action_control: str,
        model: str = "anthropic/claude-sonnet-4-5",
    ) -> str:
        """
        动作判断 — 返回结构化 JSON
        用于用户意图分析、情感分类等
        """
        body: dict = {
            "message": message,
            "actionControl": action_control,
        }
        if model:
            body["model"] = model

        collected = ""
        async with self._http.stream(
            "POST",
            f"{self.base_url}/api/secondme/act/stream",
            json=body,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        ) as resp:
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                raw = line[6:]
                if raw == "[DONE]":
                    break
                try:
                    payload = json.loads(raw)
                    choices = payload.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        collected += delta.get("content", "")
                except json.JSONDecodeError:
                    pass
        return collected

    async def ingest_memory(
        self,
        access_token: str,
        action: str,
        action_label: str,
        display_text: str,
        refs: list[dict] | None = None,
        importance: float = 0.5,
    ) -> int | None:
        """
        上报 Agent Memory 事件
        将用户在酒馆的行为写入分身记忆
        """
        body: dict = {
            "channel": {"kind": "thread"},
            "action": action,
            "actionLabel": action_label,
            "displayText": display_text,
            "importance": importance,
        }
        if refs:
            body["refs"] = refs

        try:
            resp = await self._http.post(
                f"{self.base_url}/api/secondme/agent_memory/ingest",
                json=body,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
            )
            data = resp.json()
            if data.get("code") != 0:
                logger.error("上报 Memory 失败: %s", data)
                return None
            return data.get("data", {}).get("eventId")
        except Exception:
            logger.exception("上报 Memory 异常")
            return None

    async def close(self) -> None:
        """关闭 HTTP 客户端"""
        await self._http.aclose()
