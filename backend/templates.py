from typing import Optional, List
from pydantic import BaseModel

from . import prompts as prompt_utils


class TemplateModel(BaseModel):
    """Schema for note templates that can be filtered by specialty or payer."""

    id: Optional[int] = None
    name: str
    content: str
    specialty: Optional[str] = None
    payer: Optional[str] = None


def load_builtin_templates() -> List[TemplateModel]:
    """Load note templates defined in prompt_templates.json.

    Templates are specified under the ``note_templates`` section and grouped
    by ``default``, ``specialty`` and ``payer`` keys.  Each template returned
    receives a negative id so it does not conflict with database identifiers.
    """

    data = prompt_utils._load_custom_templates().get("note_templates", {})
    templates: List[TemplateModel] = []
    next_id = -1

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

