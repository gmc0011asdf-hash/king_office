from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


def _nullish_to_none(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip()
        if not s or s.lower() in ("null", "none", "undefined"):
            return None
    return v


class TelegramLinkBody(BaseModel):
    """Body كما يرسله n8n (phone / user_code قد تكون null)."""

    telegram_chat_id: int = Field(..., ge=1, description="معرّف المحادثة من Telegram")
    phone: Optional[str] = None
    user_code: Optional[str] = None

    @field_validator("user_code", "phone", mode="before")
    @classmethod
    def _trim_and_nullish(cls, v: Any) -> Any:
        v = _nullish_to_none(v)
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    @model_validator(mode="after")
    def _need_identifier(self) -> TelegramLinkBody:
        if not self.user_code and not self.phone:
            raise ValueError("Provide user_code or phone")
        return self


class TelegramUnlinkBody(BaseModel):
    subscriber_id: Optional[int] = Field(default=None, ge=1)
    telegram_chat_id: Optional[int] = Field(default=None, ge=1)

    @field_validator("subscriber_id", "telegram_chat_id", mode="before")
    @classmethod
    def _nullish(cls, v: Any) -> Any:
        return _nullish_to_none(v)

    @model_validator(mode="after")
    def _one_key(self) -> TelegramUnlinkBody:
        if (self.subscriber_id is None) == (self.telegram_chat_id is None):
            raise ValueError("Provide exactly one of subscriber_id or telegram_chat_id")
        return self


class TelegramSubscriberOut(BaseModel):
    id: int
    real_name: Optional[str] = None
    phone: Optional[str] = None
    user_code: Optional[str] = None
    telegram_chat_id: Optional[int] = None


class TelegramLinkSuccess(BaseModel):
    success: bool = True
    message: str
    subscriber: TelegramSubscriberOut


class TelegramLinkFailure(BaseModel):
    success: bool = False
    message: str


class TelegramStatusOut(BaseModel):
    success: bool = True
    subscriber_id: int
    linked: bool
    telegram_chat_id: Optional[int] = None


class TelegramUnlinkSuccess(BaseModel):
    success: bool = True
    message: str


class TelegramUnlinkFailure(BaseModel):
    success: bool = False
    message: str
