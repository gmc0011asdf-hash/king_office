"""FastAPI dependencies for authentication and authorization."""
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core import database, security
from app.models import models

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=True)


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(database.get_db)],
) -> models.User:
    """Require valid JWT and return current user. Raises 401 if invalid."""
    user = security.get_current_user_from_token(token, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if getattr(user, "status", None) == "inactive":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    return user


def require_active_user(
    current_user: Annotated[models.User, Depends(get_current_user)],
) -> models.User:
    """
    Standard dependency for most routes. 
    Blocks users who MUST change their password (requires_password_change=True).
    """
    if getattr(current_user, "requires_password_change", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password change required",
            headers={"X-Action-Required": "force_password_change"},
        )
    return current_user


def require_admin(
    current_user: Annotated[models.User, Depends(require_active_user)],
) -> models.User:
    """Require admin role. Raises 403 if not admin."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def _parse_user_permissions_json(user: models.User) -> dict:
    raw = getattr(user, "permissions", None) or ""
    if isinstance(raw, str):
        try:
            import json

            return json.loads(raw) if raw.strip() else {}
        except Exception:
            return {}
    if isinstance(raw, dict):
        return raw
    return {}


def require_ftth_portal_access(
    current_user: Annotated[models.User, Depends(require_active_user)],
) -> models.User:
    """مدير، أو صلاحية «بوابة FTTH» في permissions.internet (لا يكفي «إضافة مشترك»)."""
    if current_user.role == "admin":
        return current_user
    perms = _parse_user_permissions_json(current_user)
    inet = perms.get("internet")
    if isinstance(inet, dict) and inet.get("ftthPortal"):
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="بوابة FTTH: يتطلب صلاحية مدير أو تفعيل «بوابة FTTH» في إعدادات المستخدم",
    )


def require_phone_directory_access(
    current_user: Annotated[models.User, Depends(require_active_user)],
) -> models.User:
    """مدير، أو صلاحية «دليل الهواتف» في قسم الإنترنت."""
    if current_user.role == "admin":
        return current_user
    perms = _parse_user_permissions_json(current_user)
    inet = perms.get("internet")
    if isinstance(inet, dict) and inet.get("phoneDirectory"):
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="دليل الهواتف: يتطلب صلاحية مدير أو «دليل الهواتف» في الإنترنت",
    )


def require_permission(*required_sections: str):
    """Factory: require user to have access to at least one of the sections."""

    def _check(
        current_user: Annotated[models.User, Depends(require_active_user)],
    ) -> models.User:
        if current_user.role == "admin":
            return current_user
        perms = getattr(current_user, "permissions", None) or "{}"
        if isinstance(perms, str):
            try:
                import json
                perms = json.loads(perms) or {}
            except Exception:
                perms = {}
        if not isinstance(perms, dict):
            perms = {}
        allowed = perms.get("sections", []) if isinstance(perms.get("sections"), list) else []
        for section in required_sections:
            if section in allowed:
                return current_user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    return _check
