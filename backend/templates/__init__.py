from typing import Optional
from pydantic import BaseModel

class TemplateModel(BaseModel):
    """Schema for note templates that can be filtered by specialty."""
    id: Optional[int] = None
    name: str
    content: str
    specialty: Optional[str] = None
