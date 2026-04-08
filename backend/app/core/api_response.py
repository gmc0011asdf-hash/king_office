from typing import Any, Optional


def success_response(data: Any = None, message: str = "تم حفظ البيانات بنجاح في قاعدة البيانات", action: str = "save") -> dict:
    return {
        "ok": True,
        "source": "database",
        "action": action,
        "message": message,
        "data": data,
    }


def local_response(data: Any = None, message: str = "تم الحفظ محليًا", reason: Optional[str] = None, action: str = "local_save") -> dict:
    return {
        "ok": True,
        "source": "local",
        "action": action,
        "message": message,
        "reason": reason,
        "data": data,
    }
