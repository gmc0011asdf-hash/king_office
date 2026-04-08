from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pydantic.aliases import AliasChoices

from app.schemas.base import ORMModel


class UserBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    role: Optional[str] = "user"
    recovery_email: Optional[EmailStr] = None
    status: Optional[str] = "active"
    permissions: Optional[Any] = None


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=128)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not (v or "").strip():
            raise ValueError("الاسم مطلوب")
        return v.strip()


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    password: Optional[str] = None
    recovery_email: Optional[EmailStr] = None
    status: Optional[str] = None
    permissions: Optional[Any] = None


class UserOut(UserBase, ORMModel):
    id: int
    last_login: Optional[datetime] = None
    created_at: Optional[datetime] = None
    requires_password_change: bool = False


class User(UserOut):
    pass


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    token: str
    new_password: str = Field(validation_alias=AliasChoices("newPassword", "new_password"))


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForceChangePasswordRequest(BaseModel):
    new_password: str
