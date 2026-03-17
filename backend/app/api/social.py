"""
知乎社交路由
处理发布箴言到知乎圈子、评论、点赞等社交互动
"""
import json
import logging
import os
import re

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.client.zhihu import ZhihuClient
from app.schema.models import PublishRequest
from app.config import ZhihuConfig

logger = logging.getLogger(__name__)
router = APIRouter(tags=["社交"])

_zhihu = ZhihuClient()

# NOTE: 固定分享到这个圈子
SHARE_RING_ID = "2015023739549529606"

# NOTE: 知乎圈子话题标签，使用 hash_tag HTML 格式
SHARE_HASHTAGS = (
    '<a class="hash_tag">#回音酒馆</a> '
    '<a class="hash_tag">#让过去和现在来给你支招</a>'
)

# NOTE: Session 文件路径，与 orchestrator.py 保持一致
SESSION_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "session_store.json")


def _load_guest_names(session_id: str) -> dict[str, str]:
    """
    从 session 文件中加载客人真实用户名 → 匿名标签的映射
    返回 {真实名字: 匿名标签} 字典，按名字长度降序排列
    """
    # NOTE: 角色 → 匿名标签对照
    role_labels = {
        "guest_past": "酒馆来客（当年）",
        "guest_now": "酒馆来客（如今）",
        "guest_alt": "酒馆来客（平行宇宙）",
    }
    name_map: dict[str, str] = {}
    try:
        if os.path.exists(SESSION_FILE):
            with open(SESSION_FILE, "r", encoding="utf-8") as f:
                sessions = json.load(f)
            session = sessions.get(session_id, {})
            for role, label in role_labels.items():
                guest = session.get(role)
                if guest and guest.get("author_name"):
                    full_name = guest["author_name"]
                    # 完整名字（可能带年份后缀）→ 角色标签
                    name_map[full_name] = label
                    # 基础名字（去掉括号内容）→ 角色标签
                    base_name = re.sub(r'[（(].+?[）)]', '', full_name).strip()
                    if base_name and base_name != full_name and base_name not in name_map:
                        name_map[base_name] = label
    except (json.JSONDecodeError, IOError, Exception) as e:
        logger.warning("读取 session 提取客人名字失败: %s", e)
    logger.info("匿名化映射: %s", name_map)
    return name_map


def _strip_markdown(text: str) -> str:
    """
    去除 Markdown 格式符号，保留纯文本
    知乎圈子想法不渲染 Markdown，需要剥离为纯文本
    """
    # 去除标题符号
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # 去除粗体/斜体标记
    text = re.sub(r'\*{1,3}(.+?)\*{1,3}', r'\1', text)
    # 去除列表符号，保留缩进
    text = re.sub(r'^[-*]\s+', '• ', text, flags=re.MULTILINE)
    # 去除分割线
    text = re.sub(r'^-{3,}$', '━━━━━━━━━━━━━━━━━━━━', text, flags=re.MULTILINE)
    return text.strip()


def _anonymize_names(text: str, name_map: dict[str, str]) -> str:
    """
    将箴言中的真实知乎用户名替换为带角色标签的匿名名字
    按名字长度降序替换，避免短名字破坏长名字的匹配
    """
    # NOTE: 按 key 长度降序排列，优先替换长的名字
    for name in sorted(name_map.keys(), key=len, reverse=True):
        if name:
            text = text.replace(name, name_map[name])
    return text


def _format_share_content(
    concern: str, receipt: str, name_map: dict[str, str] | None = None
) -> str:
    """
    将箴言格式化为知乎圈子想法的纯文本排版
    使用 emoji + Unicode 装饰保证美观，同时匿名化真实用户名
    """
    cleaned_receipt = _strip_markdown(receipt)
    # NOTE: 在最终排版前将真实用户名匿名化
    if name_map:
        cleaned_receipt = _anonymize_names(cleaned_receipt, name_map)

    content = (
        f"🍷 回音酒馆 · 今夜箴言\n\n"
        f"💬 今晚的话题\n"
        f"「{concern}」\n\n"
        f"━━━━━━━━━━━━━━━━━━━━\n\n"
        f"{cleaned_receipt}\n\n"
        f"━━━━━━━━━━━━━━━━━━━━\n\n"
        f"🦊 来自「回音酒馆」— 跨越时空的人生沙盘\n\n"
        f"{SHARE_HASHTAGS}"
    )
    return content


@router.post("/api/social/publish")
async def publish_to_zhihu(request: PublishRequest) -> JSONResponse:
    """将酒馆箴言发布到知乎圈子"""
    ring_id = SHARE_RING_ID

    # NOTE: 直接从 session 文件读取客人名字映射，不依赖前端传递
    name_map = _load_guest_names(request.session_id)

    # NOTE: 优先使用前端传入的 receipt 格式化内容，其次使用原始 content
    if request.receipt:
        content = _format_share_content(
            concern=request.concern or "深夜心事",
            receipt=request.receipt,
            name_map=name_map,
        )
    elif request.content:
        # 对原始 content 也做匿名化
        content = _anonymize_names(request.content, name_map)
    else:
        return JSONResponse(
            {"error": "缺少分享内容，请先生成箴言"},
            status_code=400,
        )

    # NOTE: 附带刘看山酒保图片（运行时读取，无需重启）
    share_image = ZhihuConfig.get_share_image_url()
    image_urls = [share_image] if share_image else None

    content_token = await _zhihu.publish_pin(
        ring_id=ring_id,
        title=request.title or "回音酒馆·今夜箴言",
        content=content,
        image_urls=image_urls,
    )
    if not content_token:
        return JSONResponse({"error": "发布失败"}, status_code=500)

    return JSONResponse({
        "message": "发布成功",
        "content_token": content_token,
        "url": f"https://www.zhihu.com/ring/host/{ring_id}",
    })


@router.get("/api/social/billboard")
async def get_billboard(
    top_cnt: int = Query(default=10, le=50),
) -> JSONResponse:
    """获取知乎热榜（作为今晚话题推荐）"""
    items = await _zhihu.get_billboard(top_cnt=top_cnt)
    return JSONResponse({
        "items": [item.model_dump() for item in items],
    })

