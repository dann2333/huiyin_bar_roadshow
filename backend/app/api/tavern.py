"""
酒馆核心业务路由
处理酒局启动、用户发言、蝴蝶效应、箴言生成
"""
import json
import logging

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from app.client.secondme import SecondMeClient
from app.client.zhihu import ZhihuClient
from app.client.qwen import QwenClient
from app.config import QwenConfig
from app.schema.models import (
    StartRequest, SpeakRequest, ButterflyRequest, ReceiptRequest, AutoModeRequest,
)
from app.service.orchestrator import TavernOrchestrator
from app.api.auth import get_access_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["酒馆"])

_secondme = SecondMeClient()
_zhihu = ZhihuClient()
# NOTE: 当 Qwen API key 可用时自动启用 Qwen 引擎
_qwen = QwenClient() if QwenConfig.API_KEY else None
if _qwen:
    logger.info("Qwen 引擎已启用 (model=%s)", QwenConfig.MODEL)

# NOTE: 按 session_key 缓存编排器实例
_orchestrators: dict[str, TavernOrchestrator] = {}


def _get_orchestrator(session_key: str) -> TavernOrchestrator | None:
    """获取或创建编排器实例"""
    if session_key in _orchestrators:
        return _orchestrators[session_key]

    access_token = get_access_token(session_key)
    if not access_token:
        return None

    orch = TavernOrchestrator(
        secondme=_secondme,
        zhihu=_zhihu,
        access_token=access_token,
        qwen=_qwen,
    )
    _orchestrators[session_key] = orch
    return orch


@router.post("/api/tavern/start")
async def start_tavern_session(
    request: StartRequest,
    session_key: str = Query(default="default"),
) -> EventSourceResponse:
    """
    启动酒局
    返回 SSE 流：酒保开场 → 客人匹配 → 首轮辩论
    """
    orch = _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权，请先登录"}, status_code=401)

    async def event_generator():
        async for event in orch.start_session(request.concern):
            yield {"data": event.model_dump_json()}

    return EventSourceResponse(event_generator())


@router.post("/api/tavern/speak")
async def user_speak(
    request: SpeakRequest,
    session_key: str = Query(default="default"),
) -> EventSourceResponse:
    """
    用户在辩论中插话
    返回 SSE 流：新一轮辩论
    """
    orch = _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权"}, status_code=401)

    async def event_generator():
        async for event in orch.user_speak(request.session_id, request.message):
            yield {"data": event.model_dump_json()}

    return EventSourceResponse(event_generator())


@router.post("/api/tavern/butterfly")
async def trigger_butterfly(
    request: ButterflyRequest,
    session_key: str = Query(default="default"),
) -> EventSourceResponse:
    """
    触发蝴蝶效应（第四幕）
    返回 SSE 流：平行宇宙客人 C 入场
    """
    orch = _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权"}, status_code=401)

    async def event_generator():
        async for event in orch.trigger_butterfly(request.session_id, request.what_if):
            yield {"data": event.model_dump_json()}

    return EventSourceResponse(event_generator())


@router.post("/api/tavern/auto-start")
async def start_auto_mode(
    request: AutoModeRequest,
    session_key: str = Query(default="default"),
) -> EventSourceResponse:
    """
    启动自动对话模式
    返回 SSE 流：过去和现在两个 Agent 自动轮流讨论
    """
    logger.info(
        "auto-start 请求: session_key=%s, session_id=%s, 已缓存编排器=%s",
        session_key, request.session_id, list(_orchestrators.keys()),
    )
    orch = _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权"}, status_code=401)

    async def event_generator():
        async for event in orch.start_auto_mode(
            request.session_id, request.max_rounds
        ):
            yield {"data": event.model_dump_json()}

    return EventSourceResponse(event_generator())


@router.post("/api/tavern/auto-stop")
async def stop_auto_mode(
    request: AutoModeRequest,
    session_key: str = Query(default="default"),
) -> JSONResponse:
    """停止自动对话模式（柔性停止，等当前轮次结束）"""
    orch = _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权"}, status_code=401)

    result = orch.stop_auto_mode(request.session_id)
    return JSONResponse(result)


@router.post("/api/tavern/receipt")
async def generate_receipt(
    request: ReceiptRequest,
    session_key: str = Query(default="default"),
) -> JSONResponse:
    """生成酒馆箴言小票"""
    orch = _get_orchestrator(session_key)
    if not orch:
        return JSONResponse({"error": "未授权"}, status_code=401)

    result = await orch.generate_receipt(request.session_id)
    return JSONResponse(result)


@router.get("/api/tavern/engine")
async def get_engine_status() -> JSONResponse:
    """查询当前 AI 引擎状态"""
    return JSONResponse({
        "current": "qwen" if _qwen else "secondme",
        "qwen_available": bool(QwenConfig.API_KEY),
        "qwen_model": QwenConfig.MODEL if QwenConfig.API_KEY else None,
    })


@router.post("/api/tavern/engine")
async def switch_engine(
    request: Request,
    session_key: str = Query(default="default"),
) -> JSONResponse:
    """切换 AI 引擎（qwen ↔ secondme）"""
    global _qwen
    body = await request.json()
    target = body.get("engine", "")

    if target == "qwen":
        if not QwenConfig.API_KEY:
            return JSONResponse({"error": "Qwen API key 未配置"}, status_code=400)
        _qwen = QwenClient()
        logger.info("切换到 Qwen 引擎")
    elif target == "secondme":
        _qwen = None
        logger.info("切换到 SecondMe 引擎")
    else:
        return JSONResponse({"error": "无效引擎类型"}, status_code=400)

    # NOTE: 更新所有已缓存编排器的引擎引用
    for orch in _orchestrators.values():
        orch.qwen = _qwen

    return JSONResponse({
        "current": "qwen" if _qwen else "secondme",
        "message": f"已切换到 {'Qwen' if _qwen else 'SecondMe'} 引擎",
    })
