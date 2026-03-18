"""
配置管理模块
从环境变量加载默认配置，支持运行时通过 API 热更新
"""
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '..', '.env'))


class LanguageConfig:
    """语言设置"""
    LANGUAGE: str = "zh"

    @classmethod
    def update(cls, language: str) -> None:
        """运行时更新语言设置"""
        if language in ("zh", "en"):
            cls.LANGUAGE = language

    @classmethod
    def to_dict(cls) -> dict:
        return {"language": cls.LANGUAGE}


class ZhihuConfig:
    """知乎 API 配置"""
    APP_KEY: str = os.getenv("ZHIHU_APP_KEY", "")
    APP_SECRET: str = os.getenv("ZHIHU_APP_SECRET", "")
    BASE_URL: str = "https://openapi.zhihu.com"

    @staticmethod
    def get_share_image_url() -> str:
        """
        运行时读取分享图片 URL
        NOTE: 每次调用都重新加载 .env，确保修改后无需重启
        """
        load_dotenv(
            dotenv_path=os.path.join(os.path.dirname(__file__), '..', '..', '.env'),
            override=True,
        )
        return os.getenv("ZHIHU_SHARE_IMAGE_URL", "")

    @classmethod
    def update(cls, app_key: str | None = None, app_secret: str | None = None) -> None:
        """运行时更新知乎配置"""
        if app_key is not None:
            cls.APP_KEY = app_key
        if app_secret is not None:
            cls.APP_SECRET = app_secret

    @classmethod
    def to_dict(cls, mask: bool = True) -> dict:
        """导出配置，mask=True 时脱敏"""
        return {
            "app_key": cls.APP_KEY,
            "app_secret": _mask(cls.APP_SECRET) if mask else cls.APP_SECRET,
        }


class SecondMeConfig:
    """SecondMe OAuth2 + API 配置"""
    CLIENT_ID: str = os.getenv("SECONDME_CLIENT_ID", "")
    CLIENT_SECRET: str = os.getenv("SECONDME_CLIENT_SECRET", "")
    REDIRECT_URI: str = os.getenv("SECONDME_REDIRECT_URI", "http://localhost:5173/auth/callback")
    BASE_URL: str = os.getenv("SECONDME_BASE_URL", "https://api.mindverse.com/gate/lab")
    AUTH_URL: str = "https://go.second.me/oauth/"


# NOTE: 前端 URL 配置，部署时设为实际域名，开发时默认 localhost
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")


class QwenConfig:
    """通义千问（Qwen）API 配置"""
    API_KEY: str = os.getenv("QWEN_API_KEY", "")
    BASE_URL: str = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    MODEL: str = os.getenv("QWEN_MODEL", "qwen-plus")

    @classmethod
    def update(
        cls,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        """运行时更新 Qwen 配置"""
        if api_key is not None:
            cls.API_KEY = api_key
        if base_url is not None:
            cls.BASE_URL = base_url
        if model is not None:
            cls.MODEL = model

    @classmethod
    def to_dict(cls, mask: bool = True) -> dict:
        """导出配置，mask=True 时脱敏"""
        return {
            "base_url": cls.BASE_URL,
            "api_key": _mask(cls.API_KEY) if mask else cls.API_KEY,
            "model": cls.MODEL,
        }


def _mask(secret: str) -> str:
    """脱敏处理：只保留前 4 位和后 4 位"""
    if len(secret) <= 8:
        return "***"
    return f"{secret[:4]}***{secret[-4:]}"


# NOTE: 支持的知乎圈子白名单 ID
ZHIHU_RING_IDS = [
    "2001009660925334090",
    "2015023739549529606",
]

