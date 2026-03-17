"""
通义千问（Qwen）API 客户端
使用 OpenAI 兼容格式，提供流式对话能力
作为 SecondMe 的备选 AI 引擎
"""
import json
import logging
from collections.abc import AsyncIterator

import httpx

from app.config import QwenConfig
from app.schema.models import ChatChunk

logger = logging.getLogger(__name__)


class QwenClient:
    """
    通义千问 API 客户端
    使用 DashScope 的 OpenAI 兼容接口
    """

    def __init__(self) -> None:
        self.api_key = QwenConfig.API_KEY
        self.base_url = QwenConfig.BASE_URL
        self.default_model = QwenConfig.MODEL
        self._http = httpx.AsyncClient(timeout=120.0)

    async def chat_stream(
        self,
        message: str,
        system_prompt: str = "",
        model: str | None = None,
        history: list[dict] | None = None,
    ) -> AsyncIterator[ChatChunk]:
        """
        流式聊天 — 兼容 OpenAI Chat Completions 格式
        NOTE: 不走 SecondMe 通道，直接调用 Qwen API
        """
        messages: list[dict] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        # 支持传入历史对话上下文
        if history:
            messages.extend(history)
        messages.append({"role": "user", "content": message})

        body = {
            "model": model or self.default_model,
            "messages": messages,
            "stream": True,
        }

        try:
            async with self._http.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                json=body,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            ) as resp:
                if resp.status_code != 200:
                    error_body = await resp.aread()
                    logger.error("Qwen API 调用失败: status=%d, body=%s",
                                 resp.status_code, error_body.decode())
                    return

                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    raw = line[6:]
                    if raw == "[DONE]":
                        yield ChatChunk(content="", done=True)
                        return
                    try:
                        payload = json.loads(raw)
                        choices = payload.get("choices", [])
                        if choices:
                            delta = choices[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield ChatChunk(
                                    content=content,
                                    done=False,
                                )
                    except json.JSONDecodeError:
                        logger.warning("Qwen SSE 数据解析失败: %s", raw)
        except Exception:
            logger.exception("Qwen API 调用异常")

    async def close(self) -> None:
        """关闭 HTTP 客户端"""
        await self._http.aclose()
