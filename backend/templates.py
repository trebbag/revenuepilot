from typing import Optional, List, Any
from pydantic import BaseModel
import sqlite3
from fastapi import HTTPException

from backend import prompts as prompt_utils


class TemplateModel(BaseModel):
    """Schema for note templates that can be filtered by specialty or payer."""

    id: Optional[int] = None
    name: str
    content: str
    specialty: Optional[str] = None
    payer: Optional[str] = None


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
    conn: sqlite3.Connection,
    username: str,
    clinic: str | None,
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
) -> List[TemplateModel]:
    """Return templates for a user/clinic including built-ins."""

    cursor = conn.cursor()
    base_query = (
        "SELECT id, name, content, specialty, payer FROM templates "
        "WHERE (user=? OR (user IS NULL AND clinic=?))"
    )
    params: List[Any] = [username, clinic]
    if specialty:
        base_query += " AND specialty=?"
        params.append(specialty)
    if payer:
        base_query += " AND payer=?"
        params.append(payer)
    rows = cursor.execute(base_query, params).fetchall()

    templates = [
        TemplateModel(
            id=row["id"],
            name=row["name"],
            content=row["content"],
            specialty=row["specialty"],
            payer=row["payer"],
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
    conn: sqlite3.Connection,
    username: str,
    clinic: str | None,
    tpl: TemplateModel,
    is_admin: bool = False,
) -> TemplateModel:
    """Insert a template for a user or clinic."""

    owner = None if is_admin else username
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO templates (user, clinic, specialty, payer, name, content) VALUES (?, ?, ?, ?, ?, ?)",
        (owner, clinic, tpl.specialty, tpl.payer, tpl.name, tpl.content),
    )
    conn.commit()
    tpl_id = cursor.lastrowid
    return TemplateModel(
        id=tpl_id,
        name=tpl.name,
        content=tpl.content,
        specialty=tpl.specialty,
        payer=tpl.payer,
    )


def update_user_template(
    conn: sqlite3.Connection,
    username: str,
    clinic: str | None,
    template_id: int,
    tpl: TemplateModel,
    is_admin: bool = False,
) -> TemplateModel:
    """Update an existing template owned by the user or clinic."""

    cursor = conn.cursor()
    if is_admin:
        cursor.execute(
            "UPDATE templates SET name=?, content=?, specialty=?, payer=? "
            "WHERE id=? AND (user=? OR (user IS NULL AND clinic=?))",
            (
                tpl.name,
                tpl.content,
                tpl.specialty,
                tpl.payer,
                template_id,
                username,
                clinic,
            ),
        )
    else:
        cursor.execute(
            "UPDATE templates SET name=?, content=?, specialty=?, payer=? WHERE id=? AND user=?",
            (
                tpl.name,
                tpl.content,
                tpl.specialty,
                tpl.payer,
                template_id,
                username,
            ),
        )
    conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateModel(
        id=template_id,
        name=tpl.name,
        content=tpl.content,
        specialty=tpl.specialty,
        payer=tpl.payer,
    )


def delete_user_template(
    conn: sqlite3.Connection,
    username: str,
    clinic: str | None,
    template_id: int,
    is_admin: bool = False,
) -> None:
    """Remove a template owned by the user or clinic."""

    cursor = conn.cursor()
    if is_admin:
        cursor.execute(
            "DELETE FROM templates WHERE id=? AND (user=? OR (user IS NULL AND clinic=?))",
            (template_id, username, clinic),
        )
    else:
        cursor.execute(
            "DELETE FROM templates WHERE id=? AND user=?",
            (template_id, username),
        )
    conn.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Template not found")

