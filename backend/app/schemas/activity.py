from typing import Optional

from pydantic import BaseModel


class ActivityLogCreate(BaseModel):
    section: str
    action: str
    details: Optional[str] = None
