"""
设置管理路由
提供配置读取和热更新接口
"""
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import QwenConfig, ZhihuConfig, LanguageConfig

logger = logging.getLogger(__name__)
router = APIRouter(tags=["设置"])


@router.get("/api/settings")
async def get_settings() -> JSONResponse:
    """
    读取当前配置
    NOTE: 敏感字段（API Key / Secret）不返回任何值，只标记是否已配置
    """
    return JSONResponse({
        "language": LanguageConfig.LANGUAGE,
        "llm": {
            "base_url": "",
            "api_key": "",
            "model": "",
            "has_config": bool(QwenConfig.API_KEY),
        },
        "zhihu": {
            "app_key": "",
            "app_secret": "",
            "has_config": bool(ZhihuConfig.APP_KEY),
        },
    })


@router.post("/api/settings")
async def update_settings(request: Request) -> JSONResponse:
    """
    更新配置并热重载客户端实例
    请求体示例：
    {
        "language": "zh",
        "llm": {"base_url": "...", "api_key": "...", "model": "..."},
        "zhihu": {"app_key": "...", "app_secret": "..."}
    }
    """
    body = await request.json()

    # 更新语言设置
    if "language" in body:
        LanguageConfig.update(body["language"])
        logger.info("语言已切换为: %s", LanguageConfig.LANGUAGE)

    # 更新大模型 API 配置（空字符串不覆盖现有密钥）
    if "llm" in body:
        llm = body["llm"]
        QwenConfig.update(
            api_key=llm.get("api_key") or None,
            base_url=llm.get("base_url") or None,
            model=llm.get("model") or None,
        )
        logger.info("LLM 配置已更新: base_url=%s, model=%s", QwenConfig.BASE_URL, QwenConfig.MODEL)

        # NOTE: 热重载 Qwen 客户端实例
        _rebuild_qwen_client()

    # 更新知乎 API 配置（空字符串不覆盖现有密钥）
    if "zhihu" in body:
        zh = body["zhihu"]
        ZhihuConfig.update(
            app_key=zh.get("app_key") or None,
            app_secret=zh.get("app_secret") or None,
        )
        logger.info("知乎配置已更新: app_key=%s", ZhihuConfig.APP_KEY)

        # NOTE: 热重载知乎客户端实例
        _rebuild_zhihu_client()

    return JSONResponse({
        "status": "ok",
        "message": "配置已更新",
    })


@router.post("/api/settings/reset")
async def reset_settings() -> JSONResponse:
    """
    恢复默认配置（重新从 .env 加载）
    """
    import os
    from dotenv import load_dotenv

    load_dotenv(
        dotenv_path=os.path.join(os.path.dirname(__file__), '..', '..', '.env'),
        override=True,
    )

    QwenConfig.API_KEY = os.getenv("QWEN_API_KEY", "")
    QwenConfig.BASE_URL = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    QwenConfig.MODEL = os.getenv("QWEN_MODEL", "qwen-plus")

    ZhihuConfig.APP_KEY = os.getenv("ZHIHU_APP_KEY", "")
    ZhihuConfig.APP_SECRET = os.getenv("ZHIHU_APP_SECRET", "")

    LanguageConfig.LANGUAGE = "zh"

    _rebuild_qwen_client()
    _rebuild_zhihu_client()

    logger.info("配置已恢复为 .env 默认值")
    return JSONResponse({"status": "ok", "message": "已恢复默认配置"})


def _rebuild_qwen_client() -> None:
    """热重载 Qwen 客户端，更新 tavern 模块中的引用"""
    from app.client.qwen import QwenClient
    from app.api import tavern

    if QwenConfig.API_KEY:
        tavern._qwen = QwenClient()
        # 同步更新所有已缓存编排器
        for orch in tavern._orchestrators.values():
            orch.qwen = tavern._qwen
        logger.info("Qwen 客户端已重建 (model=%s)", QwenConfig.MODEL)
    else:
        tavern._qwen = None
        for orch in tavern._orchestrators.values():
            orch.qwen = None
        logger.info("Qwen 客户端已禁用（API Key 为空）")


def _rebuild_zhihu_client() -> None:
    """热重载知乎客户端，更新 tavern 模块中的引用"""
    from app.client.zhihu import ZhihuClient
    from app.api import tavern

    tavern._zhihu = ZhihuClient()
    for orch in tavern._orchestrators.values():
        orch.zhihu = tavern._zhihu
        orch.guest_builder = __import__(
            "app.service.guest_builder", fromlist=["GuestBuilder"]
        ).GuestBuilder(tavern._zhihu)
    logger.info("知乎客户端已重建")
