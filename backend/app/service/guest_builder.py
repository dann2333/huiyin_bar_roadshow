"""
大牛匹配与客人构建服务
从知乎搜索结果中找到合适的大牛，按时间分组，构建客人人格 Prompt
"""
import logging
import time
from collections import defaultdict
from datetime import datetime

from app.client.zhihu import ZhihuClient
from app.schema.models import GuestProfile, ZhihuSearchResult
from app.prompt.guest_past import GUEST_PAST_TEMPLATE
from app.prompt.guest_present import GUEST_PRESENT_TEMPLATE
from app.prompt.guest_parallel import GUEST_PARALLEL_TEMPLATE

logger = logging.getLogger(__name__)

# NOTE: 最少时间跨度（秒），2 年 = 63072000 秒
MIN_TIME_SPAN_SECONDS = 2 * 365 * 24 * 3600


class GuestBuilder:
    """
    从知乎内容构建酒馆客人
    流程：搜索 → 聚合同一作者 → 按时间分组（要求足够跨度）→ 构建 Prompt
    """

    def __init__(self, zhihu_client: ZhihuClient) -> None:
        self.zhihu = zhihu_client

    async def _search_with_fallback(
        self, keywords: list[str]
    ) -> list[ZhihuSearchResult]:
        """
        多级降级搜索策略：
        1. 先用完整关键词拼接搜索
        2. 失败或无结果则逐个关键词搜索并合并
        3. 最终降级用最短关键词单独搜索
        """
        # 策略 1：完整关键词
        query = " ".join(keywords)
        results = await self.zhihu.search(query, count=30)
        if results:
            return results

        # 策略 2：逐个关键词搜索并合并去重
        logger.info("完整关键词搜索失败，尝试逐个关键词搜索: %s", keywords)
        all_results: list[ZhihuSearchResult] = []
        seen_ids: set[str] = set()
        for kw in keywords:
            kw_results = await self.zhihu.search(kw, count=15)
            for r in kw_results:
                # NOTE: 以 author_token + content_text 前 50 字符做去重
                dedup_key = f"{r.author_token}:{r.content_text[:50]}"
                if dedup_key not in seen_ids:
                    seen_ids.add(dedup_key)
                    all_results.append(r)
        if all_results:
            logger.info("逐个关键词搜索合计 %d 条结果", len(all_results))
            return all_results

        # 策略 3：最短关键词（通常更泛化）
        shortest = min(keywords, key=len) if keywords else "人生选择"
        logger.info("逐个搜索也无结果，使用泛化关键词: %s", shortest)
        return await self.zhihu.search(shortest, count=30)

    async def find_and_build(
        self, keywords: list[str]
    ) -> tuple[GuestProfile, GuestProfile] | None:
        """
        根据关键词搜索知乎，找到最合适的大牛，构建一对时空客人
        返回 (客人A-当初, 客人B-如今) 或 None
        """
        # NOTE: 先用完整关键词搜索，失败则逐个关键词搜索并合并
        results = await self._search_with_fallback(keywords)

        if not results:
            logger.warning("知乎搜索无结果: %s", keywords)
            return None

        # 按 author_token 聚合同一作者的内容
        author_map: dict[str, list[ZhihuSearchResult]] = defaultdict(list)
        for item in results:
            if item.author_token:
                author_map[item.author_token].append(item)

        # 选择时间跨度最大且内容最丰富的大牛
        best_author_token = ""
        best_score = 0
        for token, items in author_map.items():
            if len(items) < 2:
                continue
            timestamps = [i.edit_time for i in items if i.edit_time > 0]
            if len(timestamps) < 2:
                continue
            time_span = max(timestamps) - min(timestamps)
            # NOTE: 评分 = 时间跨度（年） × 内容数量，优先选跨度大的
            score = (time_span / (365 * 86400)) * len(items)
            if score > best_score:
                best_score = score
                best_author_token = token

        if not best_author_token:
            # 没有跨度足够的单一作者，使用全部搜索结果拼接
            logger.info("未找到时间跨度足够的大牛，使用综合搜索结果构建客人")
            return self._build_from_mixed(results)

        author_items = author_map[best_author_token]
        author_name = author_items[0].author_name

        # 按 edit_time 排序
        sorted_items = sorted(author_items, key=lambda x: x.edit_time)
        timestamps = [i.edit_time for i in sorted_items if i.edit_time > 0]
        time_span = max(timestamps) - min(timestamps) if timestamps else 0

        if time_span < MIN_TIME_SPAN_SECONDS:
            # 时间跨度不足 2 年，使用综合搜索结果
            logger.info(
                "大牛 %s 时间跨度仅 %.1f 年，不足 2 年，改用综合搜索结果",
                author_name,
                time_span / (365 * 86400),
            )
            return self._build_from_mixed(results)

        # 分为早期（当初的想法）和近期（如今的感触）
        mid = len(sorted_items) // 2
        early_items = sorted_items[:mid] if mid > 0 else sorted_items[:1]
        recent_items = sorted_items[mid:] if mid > 0 else sorted_items[1:]

        guest_past = self._build_guest(
            author_name=author_name,
            author_token=best_author_token,
            role="guest_past",
            items=early_items,
            template=GUEST_PAST_TEMPLATE,
        )
        guest_now = self._build_guest(
            author_name=author_name,
            author_token=best_author_token,
            role="guest_now",
            items=recent_items,
            template=GUEST_PRESENT_TEMPLATE,
        )
        return guest_past, guest_now

    def build_parallel_guest(
        self,
        author_name: str,
        author_token: str,
        all_contents: list[str],
        what_if: str,
    ) -> GuestProfile:
        """构建平行宇宙客人 C（蝴蝶效应触发后使用）"""
        combined = "\n\n".join(all_contents)
        system_prompt = GUEST_PARALLEL_TEMPLATE.format(
            author_name=author_name,
            what_if=what_if,
            all_contents=combined[:3000],  # NOTE: 限制长度避免 Prompt 过长
        )
        return GuestProfile(
            author_name=f"{author_name}（平行宇宙）",
            author_token=author_token,
            role="guest_alt",
            system_prompt=system_prompt,
            source_contents=all_contents,
        )

    @staticmethod
    def _get_time_range(items: list[ZhihuSearchResult]) -> str:
        """从搜索结果的 edit_time 计算年份范围，如 '2019年' 或 '2018-2020年'"""
        timestamps = [item.edit_time for item in items if item.edit_time > 0]
        if not timestamps:
            return "几年前"
        years = sorted({datetime.fromtimestamp(ts).year for ts in timestamps})
        if len(years) == 1:
            return f"{years[0]}年"
        return f"{years[0]}-{years[-1]}年"

    @staticmethod
    def _get_years_ago(items: list[ZhihuSearchResult]) -> str:
        """计算距今多少年"""
        timestamps = [item.edit_time for item in items if item.edit_time > 0]
        if not timestamps:
            return "数年"
        earliest = min(timestamps)
        years_diff = (time.time() - earliest) / (365.25 * 86400)
        if years_diff < 1:
            return "不到一年"
        return f"约{int(years_diff)}年"

    def _build_guest(
        self,
        author_name: str,
        author_token: str,
        role: str,
        items: list[ZhihuSearchResult],
        template: str,
    ) -> GuestProfile:
        """用知乎内容 + 模板构建客人 Prompt"""
        contents = [item.content_text for item in items if item.content_text]
        combined = "\n\n---\n\n".join(contents)
        time_range = self._get_time_range(items)
        years_ago = self._get_years_ago(items)

        if role == "guest_past":
            system_prompt = template.format(
                author_name=author_name,
                early_contents=combined[:3000],
                time_range=time_range,
                years_ago=years_ago,
            )
            display_name = f"{author_name}（{time_range}）"
        else:
            system_prompt = template.format(
                author_name=author_name,
                recent_contents=combined[:3000],
                time_range=time_range,
                years_ago=years_ago,
            )
            display_name = f"{author_name}（{time_range}）"

        return GuestProfile(
            author_name=display_name,
            author_token=author_token,
            role=role,
            system_prompt=system_prompt,
            source_contents=contents,
        )

    def _build_from_mixed(
        self, results: list[ZhihuSearchResult]
    ) -> tuple[GuestProfile, GuestProfile]:
        """
        当找不到时间跨度足够的单一大牛时的降级方案：
        用最高赞回答的作者名义，将所有内容按时间分为两组
        """
        # 筛选有时间戳的内容
        with_time = [r for r in results if r.edit_time > 0]
        if len(with_time) < 2:
            with_time = results

        sorted_by_time = sorted(with_time, key=lambda x: x.edit_time)
        sorted_by_vote = sorted(results, key=lambda x: x.vote_up_count, reverse=True)
        top = sorted_by_vote[0]
        author_name = top.author_name or "一位过来人"

        # 前半和后半拆分
        mid = max(1, len(sorted_by_time) // 2)
        early = sorted_by_time[:mid]
        recent = sorted_by_time[mid:]

        guest_past = self._build_guest(
            author_name=author_name,
            author_token=top.author_token,
            role="guest_past",
            items=early,
            template=GUEST_PAST_TEMPLATE,
        )
        guest_now = self._build_guest(
            author_name=author_name,
            author_token=top.author_token,
            role="guest_now",
            items=recent if recent else early,
            template=GUEST_PRESENT_TEMPLATE,
        )
        return guest_past, guest_now
