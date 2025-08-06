"""
Prompt templates for the RevenuePilot AI agents.

These functions construct structured prompts for use with large language models.
They include instructions that specify the expected output format and scope
according to the RevenuePilot plan.  When integrating with the OpenAI API,
call `openai.ChatCompletion.create` with the returned messages.
"""

from typing import List, Dict, Any, Optional
import json
import os
from functools import lru_cache

from .guidelines import get_guidelines
try:
    import yaml
except Exception:  # pragma: no cover - yaml is optional
    yaml = None


@lru_cache()
def _load_custom_templates() -> Dict[str, Any]:
    """Load custom prompt templates from a JSON or YAML file if present."""
    base = os.path.dirname(__file__)
    for name in ("prompt_templates.json", "prompt_templates.yaml", "prompt_templates.yml"):
        path = os.path.join(base, name)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                if name.endswith("json"):
                    return json.load(f)
                if yaml:
                    return yaml.safe_load(f)
    return {}


def _resolve_lang(entry: Any, lang: str) -> Optional[str]:
    """Return a language-specific string from ``entry``.

    ``entry`` may either be a plain string or a mapping of language codes to
    strings.  If the requested ``lang`` is not present, English is used as a
    fallback when available.  ``None`` is returned when no suitable text is
    found.
    """

    if isinstance(entry, dict):
        return entry.get(lang) or entry.get("en")
    if isinstance(entry, str):
        return entry
    return None


def _get_custom_instruction(
    category: str, lang: str, specialty: Optional[str], payer: Optional[str]
) -> str:
    """Return additional instructions based on specialty and payer.

    The function reads ``prompt_templates.json`` or ``.yaml`` once and then
    composes any matching instructions in the following order:

    1. ``default`` instructions for the category
    2. ``specialty`` overrides matching the provided ``specialty``
    3. ``payer`` overrides matching the provided ``payer``

    Each piece is appended to the base prompt so the default instructions are
    always preserved.
    """

    templates = _load_custom_templates()

    def extract(section: Dict[str, Any]) -> Optional[str]:
        entry = section.get(category, {})
        if isinstance(entry, dict) and "examples" in entry:
            entry = {k: v for k, v in entry.items() if k != "examples"}
        return _resolve_lang(entry, lang)

    parts = []
    parts.append(extract(templates.get("default", {})))
    if specialty:
        parts.append(extract(templates.get("specialty", {}).get(specialty, {})))
    if payer:
        parts.append(extract(templates.get("payer", {}).get(payer, {})))
    return " ".join(p for p in parts if p)


def _get_custom_examples(
    category: str, lang: str, specialty: Optional[str], payer: Optional[str]
) -> List[Dict[str, str]]:
    """Return example message pairs for the given category."""

    def collect(entry: Dict[str, Any]) -> List[Dict[str, str]]:
        msgs: List[Dict[str, str]] = []
        for ex in entry.get("examples", []) if isinstance(entry, dict) else []:
            user = _resolve_lang(ex.get("user"), lang)
            assistant = _resolve_lang(ex.get("assistant"), lang)
            if user and assistant:
                msgs.append({"role": "user", "content": user})
                msgs.append({"role": "assistant", "content": assistant})
        return msgs

    templates = _load_custom_templates()
    messages: List[Dict[str, str]] = []
    messages.extend(collect(templates.get("default", {}).get(category, {})))
    if specialty:
        messages.extend(
            collect(templates.get("specialty", {}).get(specialty, {}).get(category, {}))
        )
    if payer:
        messages.extend(
            collect(templates.get("payer", {}).get(payer, {}).get(category, {}))
        )
    return messages


def build_beautify_prompt(
    text: str,
    lang: str = "en",
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
) -> List[Dict[str, str]]:
    """Build a beautify prompt in the requested language.

    Custom instructions from ``prompt_templates.json`` are appended when a
    ``specialty`` or ``payer`` is supplied.
    """
    default_instructions = {
        "en": (
            "You are a highly skilled clinical documentation specialist. Your task is to "
            "take an unformatted draft note and return a polished, professional version. "
            "Never invent or infer new clinical information and remove any patient "
            "identifiers or protected health information (PHI). Arrange the content into "
            "clear 'Subjective:', 'Objective:', 'Assessment:' and 'Plan:' sections, each "
            "labelled exactly with those headings and preserving every clinical detail "
            "from the original text. If a section is missing in the source, omit the "
            "heading rather than creating new content. Correct grammar and spelling, "
            "improve clarity and readability, and return only the cleaned note with the "
            "SOAP headings and no additional commentary or markup."
        ),
        "es": (
            "Usted es un especialista altamente capacitado en documentación clínica. Su "
            "tarea es tomar una nota clínica sin formato y devolver una versión pulida y "
            "profesional. No invente ni suponga nueva información clínica y elimine "
            "cualquier identificador del paciente o PHI. Organice el contenido en secciones "
            "claras 'Subjetivo:', 'Objetivo:', 'Evaluación:' y 'Plan:', utilizando esos "
            "encabezados exactamente y preservando cada detalle clínico del texto original. "
            "Si falta alguna sección en la fuente, omita el encabezado en lugar de crear "
            "contenido nuevo. Corrija la gramática y la ortografía, mejore la claridad y la "
            "legibilidad y devuelva únicamente la nota limpia con los encabezados SOAP y sin "
            "comentarios adicionales ni marcas. La nota devuelta debe estar en español."
        ),
    }
    instructions = default_instructions.get(lang, default_instructions["en"])
    extra = _get_custom_instruction("beautify", lang, specialty, payer)
    if extra:
        instructions = f"{instructions} {extra}"
    if lang == "es":
        instructions = f"{instructions} Responde en español."
    messages: List[Dict[str, str]] = [{"role": "system", "content": instructions}]
    messages.extend(_get_custom_examples("beautify", lang, specialty, payer))
    messages.append({"role": "user", "content": text})
    return messages


def build_suggest_prompt(
    text: str,
    lang: str = "en",
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
    age: Optional[int] = None,
    sex: Optional[str] = None,
    region: Optional[str] = None,
) -> List[Dict[str, str]]:
    """Build a suggestions prompt in the requested language."""
    default_instructions = {
        "en": (
            "You are an expert medical coder, compliance officer and clinical decision support assistant. "
            "Analyse the following de‑identified clinical note and return a JSON object with four keys:\n"
            "- codes: an array of objects with fields code (string), rationale (string), upgrade_to (string, optional) and upgrade_path (string, optional). Include only the most relevant CPT and ICD‑10 codes supported by the note. When the documentation would justify a higher‑level code, set upgrade_to to that code and describe the reason in upgrade_path, e.g. '99213 → 99214 due to time or medical decision complexity'. Limit to a maximum of five entries.\n"
            "- compliance: an array of succinct strings highlighting missing documentation elements, audit risks or compliance tips (e.g., incomplete history, missing ROS, insufficient exam). Focus on areas that could cause downcoding or denials.\n"
            "- public_health: an array of objects with fields recommendation (string) and reason (string) giving a brief explanation of why the measure is suggested. Suggest generic recommendations without assuming personal details.\n"
            "- differentials: an array of objects with fields diagnosis (string) and score (number). Estimate the likelihood of each differential based on the note and provide the score as a percentage from 0 to 100. Limit to a maximum of five entries.\n"

            "Return only valid JSON without any surrounding Markdown. Do not fabricate information beyond the note. If no suggestions apply to a category, return an empty array for that key."
        ),
        "es": (
            "Usted es un experto codificador médico, responsable de cumplimiento y asistente de apoyo a la decisión clínica. "
            "Analice la siguiente nota clínica desidentificada y devuelva un objeto JSON con cuatro claves:\n"
            "- codes: una matriz de objetos con los campos code (cadena), rationale (cadena), upgrade_to (cadena, opcional) y upgrade_path (cadena, opcional). Incluya solo los códigos CPT e ICD‑10 más relevantes basados en la información proporcionada. Cuando la documentación justifique un código de mayor nivel, establezca upgrade_to con ese código y describa la razón en upgrade_path, por ejemplo '99213 → 99214 por tiempo o complejidad de la decisión médica'. Límite a un máximo de cinco entradas.\n"
            "- compliance: una matriz de cadenas breves que resalten elementos faltantes de documentación, riesgos de auditoría o consejos de cumplimiento (por ejemplo, historial incompleto, ROS faltante, examen insuficiente). Concéntrese en áreas que podrían causar reducción de códigos o denegaciones.\n"
            "- public_health: una matriz de objetos con los campos recommendation (cadena) y reason (cadena) que brinden una breve explicación de por qué se sugiere la medida. Sugiera recomendaciones genéricas sin asumir detalles personales.\n"
            "- differentials: una matriz de objetos con los campos diagnosis (cadena) y score (número). Estime la probabilidad de cada diagnóstico diferencial según la nota y exprese score como un porcentaje de 0 a 100. Limítese a un máximo de cinco entradas.\n"
            "Devuelva solo JSON válido sin ningún Markdown adicional. No fabrique información más allá de la nota. Si no hay sugerencias para una categoría, devuelva un array vacío para esa clave. Todas las cadenas devueltas deben estar en español."
        ),
    }
    instructions = default_instructions.get(lang, default_instructions["en"])
    extra = _get_custom_instruction("suggest", lang, specialty, payer)
    if extra:
        instructions = f"{instructions} {extra}"
    if lang == "es":
        instructions = f"{instructions} Responde en español."
    user_content = text
    if age is not None and sex and region:
        try:
            data = get_guidelines(age, sex, region)
            tips: List[str] = []
            if data.get("vaccinations"):
                tips.extend(data["vaccinations"])
            if data.get("screenings"):
                tips.extend(data["screenings"])
            if tips:
                user_content = f"{text}\n\nConsider: " + ", ".join(tips)
        except Exception:
            pass
    messages: List[Dict[str, str]] = [{"role": "system", "content": instructions}]
    messages.extend(_get_custom_examples("suggest", lang, specialty, payer))
    messages.append({"role": "user", "content": user_content})
    return messages


def build_summary_prompt(
    text: str,
    lang: str = "en",
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
) -> List[Dict[str, str]]:
    """Build a summary prompt in the requested language."""
    default_instructions = {
        "en": (
            "You are an expert clinical communicator.  Rewrite the following clinical note "
            "into a concise summary that a patient can easily understand.  Preserve all "
            "important medical facts (symptoms, diagnoses, treatments, follow‑up), but remove "
            "billing codes and technical jargon.  Write in plain language at about an 8th "
            "grade reading level.  Do not invent information that is not present in the note. "
            "Do not include any patient identifiers or PHI."
        ),
        "es": (
            "Usted es un experto comunicador clínico. Reescriba la siguiente nota clínica en un resumen conciso que un paciente pueda entender fácilmente. Preserve todos los hechos médicos importantes (síntomas, diagnósticos, tratamientos, seguimiento), pero elimine los códigos de facturación y la jerga técnica. Escriba en un lenguaje sencillo equivalente a un nivel de lectura de octavo grado. No invente información que no esté presente en la nota. No incluya identificadores del paciente ni PHI. El resumen debe estar en español."
        ),
    }
    instructions = default_instructions.get(lang, default_instructions["en"])
    extra = _get_custom_instruction("summary", lang, specialty, payer)
    if extra:
        instructions = f"{instructions} {extra}"
    if lang == "es":
        instructions = f"{instructions} Responde en español."
    messages: List[Dict[str, str]] = [{"role": "system", "content": instructions}]
    messages.extend(_get_custom_examples("summary", lang, specialty, payer))
    messages.append({"role": "user", "content": text})
    return messages


def build_template_prompt(text: str, lang: str = "en") -> List[Dict[str, str]]:
    """Build a template manager prompt in the requested language."""
    default_instructions = {
        "en": (
            "You help clinicians manage reusable documentation templates."
            " Provide concise guidance or content based on the request."
        ),
        "es": (
            "Usted ayuda a los clínicos a gestionar plantillas reutilizables de"
            " documentación. Proporcione orientación o contenido según lo solicitado."
        ),
    }
    instructions = default_instructions.get(lang, default_instructions["en"])
    if lang == "es":
        instructions = f"{instructions} Responde en español."
    return [
        {"role": "system", "content": instructions},
        {"role": "user", "content": text},
    ]


def build_export_prompt(text: str, lang: str = "en") -> List[Dict[str, str]]:
    """Build an EHR export prompt in the requested language."""
    default_instructions = {
        "en": (
            "You prepare a structured export of the clinical note for insertion"
            " into an EHR system. Summarise necessary data without PHI."
        ),
        "es": (
            "Usted prepara una exportación estructurada de la nota clínica para"
            " insertarla en un sistema EHR. Resuma los datos necesarios sin PHI."
        ),
    }
    instructions = default_instructions.get(lang, default_instructions["en"])
    if lang == "es":
        instructions = f"{instructions} Responde en español."
    return [
        {"role": "system", "content": instructions},
        {"role": "user", "content": text},
    ]
