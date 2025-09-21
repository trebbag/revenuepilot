from typing import Optional, List

from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Column, Integer, String, Text, and_, or_, select
from sqlalchemy.orm import Session, declarative_base

from backend import prompts as prompt_utils
from backend.sanitizer import sanitize_text


Base = declarative_base()


class Template(Base):
    """SQLAlchemy ORM model mirroring the ``templates`` table."""

    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user = Column(String, nullable=True)
    clinic = Column(String, nullable=True)
    specialty = Column(String, nullable=True)
    payer = Column(String, nullable=True)
    name = Column(String, nullable=False)
    content = Column(Text, nullable=False)


class TemplateModel(BaseModel):
    """Schema for note templates that can be filtered by specialty or payer."""

    id: Optional[int] = None
    name: str = Field(..., max_length=100)
    content: str = Field(..., max_length=5000)
    specialty: Optional[str] = None
    payer: Optional[str] = None

    @field_validator("name", "content")
    @classmethod
    def sanitize_fields(cls, v: str) -> str:  # noqa: D401,N805
        return sanitize_text(v)


# Built-in templates shipped with the application.  Negative identifiers are
# used so that they do not collide with database-assigned IDs.
BUILTIN_TEMPLATES: List[TemplateModel] = [
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


def load_builtin_templates() -> List[TemplateModel]:
    """Load built-in note templates plus any custom ones from prompt_templates.json.

    Templates are grouped by ``default``, ``specialty`` and ``payer`` keys.
    Each template receives a negative id so it does not conflict with
    database identifiers.
    """

    data = prompt_utils._load_custom_templates().get("note_templates", {})
    templates: List[TemplateModel] = BUILTIN_TEMPLATES.copy()
    next_id = -len(templates) - 1

    for tpl in data.get("default", []):
        templates.append(
            TemplateModel(id=next_id, name=tpl["name"], content=tpl["content"])
        )
        next_id -= 1

    for spec, items in data.get("specialty", {}).items():
        for tpl in items:
            templates.append(
                TemplateModel(
                    id=next_id,
                    name=tpl["name"],
                    content=tpl["content"],
                    specialty=spec,
                    payer=tpl.get("payer"),
                )
            )
            next_id -= 1

    for payer, items in data.get("payer", {}).items():
        for tpl in items:
            templates.append(
                TemplateModel(
                    id=next_id,
                    name=tpl["name"],
                    content=tpl["content"],
                    payer=payer,
                    specialty=tpl.get("specialty"),
                )
            )
            next_id -= 1

    return templates



# Preload built-in templates at import time so that other modules can
# reference them without repeatedly parsing the JSON file.

DEFAULT_TEMPLATES: List[TemplateModel] = load_builtin_templates()


def list_user_templates(
    session: Session,
    username: str,
    clinic: str | None,
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
) -> List[TemplateModel]:
    """Return templates for a user/clinic including built-ins."""

    stmt = select(Template).where(
        or_(
            Template.user == username,
            and_(Template.user.is_(None), Template.clinic == clinic),
        )
    )
    if specialty:
        stmt = stmt.where(Template.specialty == specialty)
    if payer:
        stmt = stmt.where(Template.payer == payer)
    stmt = stmt.order_by(Template.id.asc())
    rows = session.execute(stmt).scalars().all()

    templates = [
        TemplateModel(
            id=row.id,
            name=row.name,
            content=row.content,
            specialty=row.specialty,
            payer=row.payer,
        )
        for row in rows
    ]

    for tpl in load_builtin_templates():
        if specialty and tpl.specialty != specialty:
            continue
        if payer and tpl.payer != payer:
            continue
        templates.append(tpl)

    return templates


def create_user_template(
    session: Session,
    username: str,
    clinic: str | None,
    tpl: TemplateModel,
    is_admin: bool = False,
) -> TemplateModel:
    """Insert a template for a user or clinic."""

    owner = None if is_admin else username
    record = Template(
        user=owner,
        clinic=clinic,
        specialty=tpl.specialty,
        payer=tpl.payer,
        name=tpl.name,
        content=tpl.content,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return TemplateModel(
        id=record.id,
        name=tpl.name,
        content=tpl.content,
        specialty=tpl.specialty,
        payer=tpl.payer,
    )


def update_user_template(
    session: Session,
    username: str,
    clinic: str | None,
    template_id: int,
    tpl: TemplateModel,
    is_admin: bool = False,
) -> TemplateModel:
    """Update an existing template owned by the user or clinic."""

    stmt = select(Template).where(Template.id == template_id)
    if is_admin:
        stmt = stmt.where(
            or_(
                Template.user == username,
                and_(Template.user.is_(None), Template.clinic == clinic),
            )
        )
    else:
        stmt = stmt.where(Template.user == username)

    record = session.execute(stmt).scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Template not found")
    record.name = tpl.name
    record.content = tpl.content
    record.specialty = tpl.specialty
    record.payer = tpl.payer
    session.commit()
    session.refresh(record)
    return TemplateModel(
        id=template_id,
        name=tpl.name,
        content=tpl.content,
        specialty=tpl.specialty,
        payer=tpl.payer,
    )


def delete_user_template(
    session: Session,
    username: str,
    clinic: str | None,
    template_id: int,
    is_admin: bool = False,
) -> None:
    """Remove a template owned by the user or clinic."""

    stmt = select(Template).where(Template.id == template_id)
    if is_admin:
        stmt = stmt.where(
            or_(
                Template.user == username,
                and_(Template.user.is_(None), Template.clinic == clinic),
            )
        )
    else:
        stmt = stmt.where(Template.user == username)

    record = session.execute(stmt).scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Template not found")
    session.delete(record)
    session.commit()

