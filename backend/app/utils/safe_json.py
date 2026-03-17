"""
线程安全的 JSON 文件读写工具
使用 threading.Lock 保证同一文件的读-改-写操作原子性
避免多用户并发请求时数据互相覆盖
"""
import json
import logging
import os
import threading
from collections.abc import Callable
from typing import TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# NOTE: 每个文件路径对应一把独立的锁，避免不同文件之间互相阻塞
_locks: dict[str, threading.Lock] = {}
_locks_lock = threading.Lock()


def _get_lock(filepath: str) -> threading.Lock:
    """获取文件专属的线程锁（懒创建）"""
    # NOTE: 用规范路径作 key，防止同一文件的不同路径写法导致多把锁
    canonical = os.path.realpath(filepath)
    if canonical not in _locks:
        with _locks_lock:
            if canonical not in _locks:
                _locks[canonical] = threading.Lock()
    return _locks[canonical]


def load_json(filepath: str) -> dict:
    """
    线程安全地读取 JSON 文件
    文件不存在或解析失败时返回空字典
    """
    lock = _get_lock(filepath)
    with lock:
        try:
            if os.path.exists(filepath):
                with open(filepath, "r", encoding="utf-8") as f:
                    return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.warning("JSON 文件读取失败 (%s): %s", filepath, e)
    return {}


def save_json(filepath: str, data: dict) -> None:
    """
    线程安全地写入 JSON 文件
    使用先写临时文件再重命名的方式，防止写入中途崩溃导致数据损坏
    """
    lock = _get_lock(filepath)
    with lock:
        try:
            # NOTE: 先写到临时文件，再原子性替换，避免写入一半时崩溃
            tmp_path = filepath + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            # NOTE: Windows 上 os.replace 是原子性的（同卷内）
            os.replace(tmp_path, filepath)
        except IOError as e:
            logger.error("JSON 文件写入失败 (%s): %s", filepath, e)


def update_json(filepath: str, updater: Callable[[dict], dict | None]) -> dict:
    """
    线程安全的读-改-写操作
    updater 接收当前数据，返回修改后的数据（返回 None 表示不修改）
    整个过程在同一把锁内完成，保证原子性
    """
    lock = _get_lock(filepath)
    with lock:
        # 读取
        data: dict = {}
        try:
            if os.path.exists(filepath):
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.warning("JSON 文件读取失败 (%s): %s", filepath, e)

        # 修改
        result = updater(data)
        if result is None:
            return data

        # 写入
        try:
            tmp_path = filepath + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False)
            os.replace(tmp_path, filepath)
        except IOError as e:
            logger.error("JSON 文件写入失败 (%s): %s", filepath, e)

        return result
