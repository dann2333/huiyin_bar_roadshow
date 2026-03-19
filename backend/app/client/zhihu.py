"""
知乎开放 API 客户端
内置 HMAC-SHA256 签名逻辑，封装全部接口
"""
import base64
import hashlib
import hmac
import logging
import re
import time
import uuid
from typing import Any

import httpx

from app.config import ZhihuConfig
from app.schema.models import ZhihuSearchResult, ZhihuBillboardItem, RingContentItem

logger = logging.getLogger(__name__)


class ZhihuClient:
    """
    知乎开放 API 客户端
    所有请求自动附加 HMAC-SHA256 签名
    """

    def __init__(self) -> None:
        self.app_key = ZhihuConfig.APP_KEY
        self.app_secret = ZhihuConfig.APP_SECRET
        self.base_url = ZhihuConfig.BASE_URL
        self._http = httpx.AsyncClient(timeout=30.0)
        # NOTE: 简易内存缓存，生产环境应替换为 Redis
        self._cache: dict[str, Any] = {}

    def _generate_sign(self, timestamp: str, log_id: str) -> str:
        """
        生成 HMAC-SHA256 签名
        签名字符串格式：app_key:{key}|ts:{timestamp}|logid:{log_id}|extra_info:
        """
        sign_str = f"app_key:{self.app_key}|ts:{timestamp}|logid:{log_id}|extra_info:"
        h = hmac.new(
            self.app_secret.encode("utf-8"),
            sign_str.encode("utf-8"),
            hashlib.sha256,
        )
        return base64.b64encode(h.digest()).decode("utf-8")

    def _build_headers(self) -> dict[str, str]:
        """构建带签名的请求头"""
        timestamp = str(int(time.time()))
        log_id = f"log_{uuid.uuid4().hex[:16]}"
        signature = self._generate_sign(timestamp, log_id)
        return {
            "X-App-Key": self.app_key,
            "X-Timestamp": timestamp,
            "X-Log-Id": log_id,
            "X-Sign": signature,
            "X-Extra-Info": "",
        }

    async def search(self, query: str, count: int = 10) -> list[ZhihuSearchResult]:
        """
        全网搜索
        用于匹配用户困境对应的知乎大牛回答
        NOTE: 限流 1 QPS，总量 1000 次，需谨慎使用
        """
        cache_key = f"search:{query}:{count}"
        if cache_key in self._cache:
            logger.info("搜索命中缓存: %s", query)
            return self._cache[cache_key]

        resp = await self._http.get(
            f"{self.base_url}/openapi/search/global",
            params={"query": query, "count": count},
            headers=self._build_headers(),
        )
        data = resp.json()
        if data.get("status") != 0:
            logger.error("知乎搜索失败: %s", data.get("msg"))
            return []

        items = data.get("data", {}).get("items", [])
        results = [
            ZhihuSearchResult(
                title=item.get("title", ""),
                content_type=item.get("content_type", ""),
                content_id=item.get("content_id", ""),
                content_text=item.get("content_text", ""),
                url=item.get("url", ""),
                author_name=item.get("author_name", ""),
                author_token=item.get("author_token", ""),
                comment_count=item.get("comment_count", 0),
                vote_up_count=item.get("vote_up_count", 0),
                edit_time=item.get("edit_time", 0),
            )
            for item in items
        ]
        self._cache[cache_key] = results
        return results

    async def get_billboard(
        self, top_cnt: int = 50, publish_in_hours: int = 48
    ) -> list[ZhihuBillboardItem]:
        """
        获取知乎热榜
        用于推荐"今晚酒馆热聊话题"
        """
        resp = await self._http.get(
            f"{self.base_url}/openapi/billboard/list",
            params={"top_cnt": top_cnt, "publish_in_hours": publish_in_hours},
            headers=self._build_headers(),
        )
        data = resp.json()
        if data.get("status") != 0:
            logger.error("获取热榜失败: %s", data.get("msg"))
            return []

        items = data.get("data", {}).get("list", [])
        return [
            ZhihuBillboardItem(
                title=item.get("title", ""),
                body=item.get("body", ""),
                link_url=item.get("link_url", ""),
                token=item.get("token", ""),
                heat_score=item.get("heat_score", 0),
            )
            for item in items
        ]

    async def get_ring_detail(
        self, ring_id: str, page_num: int = 1, page_size: int = 20
    ) -> dict:
        """获取圈子详情和内容列表"""
        resp = await self._http.get(
            f"{self.base_url}/openapi/ring/detail",
            params={
                "ring_id": ring_id,
                "page_num": page_num,
                "page_size": page_size,
            },
            headers=self._build_headers(),
        )
        return resp.json()

    async def get_ring_hot_list(
        self, ring_id: str, page_size: int = 20
    ) -> list[RingContentItem]:
        """
        获取圈子帖子热度榜
        只保留回音酒馆发布的帖子，按互动热度排序
        NOTE: 热度公式 = like * 3 + comment * 2 + share，可根据业务调整权重
        """
        data = await self.get_ring_detail(
            ring_id=ring_id, page_num=1, page_size=page_size
        )
        contents = data.get("data", {}).get("contents", [])
        items: list[RingContentItem] = []

        for pin in contents:
            content_text: str = pin.get("content", "")
            # NOTE: 只保留包含回音酒馆标签的帖子
            if "\u56de\u97f3\u9152\u9986" not in content_text:
                continue

            # 从帖子内容中提取用户的问题
            question = self._extract_question(content_text)
            if not question:
                continue

            pin_id = pin.get("pin_id", 0)
            like_num = pin.get("like_num", 0)
            comment_num = pin.get("comment_num", 0)
            share_num = pin.get("share_num", 0)
            heat = like_num * 3 + comment_num * 2 + share_num

            items.append(RingContentItem(
                pin_id=pin_id,
                question=question,
                like_num=like_num,
                comment_num=comment_num,
                share_num=share_num,
                heat_score=heat,
                publish_time=pin.get("publish_time", 0),
                url=f"https://www.zhihu.com/pin/{pin_id}",
            ))

        # 按热度降序排列
        items.sort(key=lambda x: x.heat_score, reverse=True)
        return items

    @staticmethod
    def _extract_question(content: str) -> str:
        """
        从回音酒馆帖子内容中提取用户的问题
        帖子格式示例：「用户的问题」
        """
        # 先去除 HTML 标签
        clean = re.sub(r'<[^>]+>', '', content)
        # 匹配「」内的内容
        match = re.search(r'「(.+?)」', clean)
        if match:
            return match.group(1).strip()
        # 降级：尝试匹配"今晚的话题"后面的文本
        match = re.search(r'今晚的话题[\s\n]*(.+?)(?:\n|━|$)', clean)
        if match:
            return match.group(1).strip()
        return ""

    async def publish_pin(
        self, ring_id: str, title: str, content: str, image_urls: list[str] | None = None
    ) -> str | None:
        """
        在圈子中发布想法
        用于酒局散场后发布酒馆箴言
        """
        body: dict[str, Any] = {
            "ring_id": ring_id,
            "title": title,
            "content": content,
        }
        if image_urls:
            body["image_urls"] = image_urls

        resp = await self._http.post(
            f"{self.base_url}/openapi/publish/pin",
            json=body,
            headers={**self._build_headers(), "Content-Type": "application/json"},
        )
        data = resp.json()
        if data.get("status") != 0:
            logger.error("发布想法失败: %s", data.get("msg"))
            return None
        return data.get("data", {}).get("content_token")

    async def create_comment(
        self, content_token: str, content_type: str, content: str
    ) -> int | None:
        """
        创建评论
        content_type: 'pin'（对想法评论）或 'comment'（回复评论）
        """
        resp = await self._http.post(
            f"{self.base_url}/openapi/comment/create",
            json={
                "content_token": content_token,
                "content_type": content_type,
                "content": content,
            },
            headers={**self._build_headers(), "Content-Type": "application/json"},
        )
        data = resp.json()
        if data.get("status", data.get("code")) != 0:
            logger.error("创建评论失败: %s", data.get("msg"))
            return None
        return data.get("data", {}).get("comment_id")

    async def react(
        self, content_token: str, content_type: str, like: bool = True
    ) -> bool:
        """点赞 / 取消点赞"""
        resp = await self._http.post(
            f"{self.base_url}/openapi/reaction",
            json={
                "content_token": content_token,
                "content_type": content_type,
                "action_type": "like",
                "action_value": 1 if like else 0,
            },
            headers={**self._build_headers(), "Content-Type": "application/json"},
        )
        data = resp.json()
        return data.get("status") == 0

    async def close(self) -> None:
        """关闭 HTTP 客户端"""
        await self._http.aclose()
