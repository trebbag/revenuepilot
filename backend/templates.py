from typing import Optional, List
from pydantic import BaseModel


class TemplateModel(BaseModel):
    """Schema for note templates that can be filtered by specialty."""

    id: Optional[int] = None
    name: str
    content: str
    specialty: Optional[str] = None


DEFAULT_TEMPLATES: List[TemplateModel] = [
    TemplateModel(
        id=-1,
        name="Pediatric Visit",
        content="Chief Complaint:\nHistory of Present Illness:\nAssessment/Plan:\n",
        specialty="pediatrics",
    ),
    TemplateModel(
        id=-2,
        name="Geriatric Assessment",
        content="Chief Complaint:\nFunctional Status:\nAssessment/Plan:\n",
        specialty="geriatrics",
    ),
    TemplateModel(
        id=-3,
        name="Psychiatry Evaluation",
        content="Chief Complaint:\nMental Status Exam:\nAssessment/Plan:\n",
        specialty="psychiatry",
    ),
]
