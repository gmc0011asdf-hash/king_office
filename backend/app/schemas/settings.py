from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.aliases import AliasChoices

from app.core.iraq_phone import normalize_iraq_mobile

from app.schemas.base import ORMModel


class SystemSettingsBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    wallet_alert_threshold: Optional[float] = Field(default=50000, validation_alias=AliasChoices("walletAlertThreshold", "wallet_alert_threshold"))
    stock_alert_threshold: Optional[int] = Field(default=5, validation_alias=AliasChoices("stockAlertThreshold", "stock_alert_threshold"))
    earthlink_threshold: Optional[float] = Field(default=50000, validation_alias=AliasChoices("earthlinkThreshold", "earthlink_threshold"))
    swig_threshold: Optional[float] = Field(default=50000, validation_alias=AliasChoices("swigThreshold", "swig_threshold"))
    qi_threshold: Optional[float] = Field(default=50000, validation_alias=AliasChoices("qiThreshold", "qi_threshold"))
    cards_threshold: Optional[int] = Field(default=5, validation_alias=AliasChoices("cardsThreshold", "cards_threshold"))
    materials_threshold: Optional[int] = Field(default=5, validation_alias=AliasChoices("materialsThreshold", "materials_threshold"))
    office_name: Optional[str] = Field(default="مكتب الملك", validation_alias=AliasChoices("officeName", "office_name"))
    office_phone: Optional[str] = Field(default=None, validation_alias=AliasChoices("officePhone", "office_phone"))
    office_address: Optional[str] = Field(default=None, validation_alias=AliasChoices("officeAddress", "office_address"))
    cards_report_name: Optional[str] = Field(default="قضاء علي الغربي SWG70", validation_alias=AliasChoices("cardsReportName", "cards_report_name"))


class SystemSettingsCreate(SystemSettingsBase):
    @field_validator("office_phone", mode="before")
    @classmethod
    def office_phone_iraq(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        return normalize_iraq_mobile(s, required=False)


class SystemSettingsUpdate(SystemSettingsBase):
    pass


class SystemSettings(SystemSettingsBase, ORMModel):
    id: int
    backup_storage_path: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("backupStoragePath", "backup_storage_path"),
    )
    backup_schedule: Optional[str] = Field(
        default="none",
        validation_alias=AliasChoices("backupSchedule", "backup_schedule"),
    )
    backup_schedule_time: Optional[str] = Field(
        default="02:00",
        validation_alias=AliasChoices("backupScheduleTime", "backup_schedule_time"),
    )
    backup_schedule_weekday: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("backupScheduleWeekday", "backup_schedule_weekday"),
    )
    backup_schedule_month_day: Optional[int] = Field(
        default=None,
        validation_alias=AliasChoices("backupScheduleMonthDay", "backup_schedule_month_day"),
    )
    backup_last_scheduled_at: Optional[datetime] = Field(
        default=None,
        validation_alias=AliasChoices("backupLastScheduledAt", "backup_last_scheduled_at"),
    )

class MessageTemplateBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    body: str = Field(..., description="محتوى القالب")


class MessageTemplateUpdate(MessageTemplateBase):
    pass


class MessageTemplate(MessageTemplateBase, ORMModel):
    id: int
    key: str
    updated_at: datetime
