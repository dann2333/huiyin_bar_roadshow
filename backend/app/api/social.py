"""
知乎社交路由
处理发布箴言到知乎圈子、评论、点赞等社交互动
"""
import logging

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.client.zhihu import ZhihuClient
from app.schema.models import PublishRequest
from app.config import ZHIHU_RING_IDS

logger = logging.getLogger(__name__)
router = APIRouter(tags=["社交"])

_zhihu = ZhihuClient()


@router.post("/api/social/publish")
async def publish_to_zhihu(request: PublishRequest) -> JSONResponse:
    """将酒馆箴言发布到知乎圈子"""
    ring_id = request.ring_id
    if ring_id not in ZHIHU_RING_IDS:
        return JSONResponse(
            {"error": f"不支持的圈子 ID，仅支持: {ZHIHU_RING_IDS}"},
            status_code=400,
        )

    content_token = await _zhihu.publish_pin(
        ring_id=ring_id,
        title=request.title or "回音酒馆·今夜箴言",
        content=request.content,
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
