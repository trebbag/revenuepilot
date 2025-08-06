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
    parts = []
    parts.append(_resolve_lang(templates.get("default", {}).get(category), lang))
    if specialty:
        spec = templates.get("specialty", {}).get(specialty, {}).get(category)
        parts.append(_resolve_lang(spec, lang))
    if payer:
        pay = templates.get("payer", {}).get(payer, {}).get(category)
        parts.append(_resolve_lang(pay, lang))
    return " ".join(p for p in parts if p)


def build_beautify_prompt(
    text: str,
    lang: str = "en",
    specialty: Optional[str] = None,
    payer: Optional[str] = None,
) -> List[Dict[str, str]]:
    """Build a beautify prompt in the requested language."""
    default_instructions = {
        "en": (
            "You are a highly skilled clinical documentation specialist. Your task is to take "
            "an unformatted draft note and return a polished, professional version. Do not "
            "alter the underlying clinical facts or invent new information. Correct grammar "
            "and spelling, improve clarity and readability, and organise the content into a "
            "standard SOAP format (Subjective, Objective, Assessment, Plan) where appropriate. "
            "If the note does not contain all four sections, preserve the existing content and "
            "structure sensibly. Do not include any patient identifiers or PHI. Do not add "
            "extra commentary, headings or markup beyond the improved note itself."
        ),
        "es": (
            "Usted es un especialista altamente capacitado en documentación clínica. Su tarea es tomar una nota clínica sin "
            "formato y devolver una versión pulida y profesional. No debe alterar los hechos clínicos subyacentes ni inventar "
            "nueva información. Corrija la gramática y la ortografía, mejore la claridad y la legibilidad y organice el contenido "
            "en un formato estándar SOAP (Subjetivo, Objetivo, Evaluación, Plan) cuando corresponda. Si la nota no contiene las "
            "cuatro secciones, preserve el contenido existente y organícelo de manera sensata. No incluya identificadores del "
            "paciente ni PHI. No agregue comentarios adicionales, encabezados ni marcas más allá de la nota mejorada."
        ),
    }
    instructions = default_instructions.get(lang, default_instructions["en"])
    extra = _get_custom_instruction("beautify", lang, specialty, payer)
    if extra:
        instructions = f"{instructions} {extra}"
    return [
        {"role": "system", "content": instructions},
        {"role": "user", "content": text},
    ]


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
            "- codes: an array of objects with two fields: code (string) and rationale (string). Include only the most relevant CPT and ICD‑10 codes based solely on the information provided. Do not guess codes that are not supported by the note. Limit to a maximum of five codes.\n"
            "- compliance: an array of succinct strings highlighting missing documentation elements, audit risks or compliance tips (e.g., incomplete history, missing ROS, insufficient exam). Focus on areas that could cause downcoding or denials.\n"
            "- public_health: an array of preventative measures, vaccinations or screenings that may apply given the patient’s context. Suggest generic recommendations (e.g., influenza vaccine, smoking cessation) without assuming personal details.\n"
            "- differentials: an array of plausible differential diagnoses suggested by the note. Limit to a maximum of five differentials and ensure they are consistent with the symptoms described.\n"
            "Return only valid JSON without any surrounding Markdown. Do not fabricate information beyond the note. If no suggestions apply to a category, return an empty array for that key."
        ),
        "es": (
            "Usted es un experto codificador médico, responsable de cumplimiento y asistente de apoyo a la decisión clínica. "
            "Analice la siguiente nota clínica desidentificada y devuelva un objeto JSON con cuatro claves:\n"
            "- codes: una matriz de objetos con dos campos: code (cadena) y rationale (cadena). Incluya solo los códigos CPT e ICD‑10 más relevantes basados únicamente en la información proporcionada. No suponga códigos que no estén respaldados por la nota. Limítese a un máximo de cinco códigos.\n"
            "- compliance: una matriz de cadenas breves que resalten elementos faltantes de documentación, riesgos de auditoría o consejos de cumplimiento (por ejemplo, historial incompleto, ROS faltante, examen insuficiente). Concéntrese en áreas que podrían causar reducción de códigos o denegaciones.\n"
            "- public_health: una matriz de medidas preventivas, vacunaciones o cribados que puedan aplicar según el contexto del paciente. Sugiera recomendaciones genéricas (por ejemplo, vacuna contra la gripe, dejar de fumar) sin asumir detalles personales.\n"
            "- differentials: una matriz de diagnósticos diferenciales plausibles sugeridos por la nota. Limítese a un máximo de cinco diferenciales y asegúrese de que sean coherentes con los síntomas descritos.\n"
            "Devuelva solo JSON válido sin ningún Markdown adicional. No fabrique información más allá de la nota. Si no hay sugerencias para una categoría, devuelva un array vacío para esa clave."
        ),
    }
    instructions = default_instructions.get(lang, default_instructions["en"])
    extra = _get_custom_instruction("suggest", lang, specialty, payer)
    if extra:
        instructions = f"{instructions} {extra}"
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
    return [
        {"role": "system", "content": instructions},
        {"role": "user", "content": user_content},
    ]


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
            "Usted es un experto comunicador clínico. Reescriba la siguiente nota clínica en un resumen conciso que un paciente pueda entender fácilmente. Preserve todos los hechos médicos importantes (síntomas, diagnósticos, tratamientos, seguimiento), pero elimine los códigos de facturación y la jerga técnica. Escriba en un lenguaje sencillo equivalente a un nivel de lectura de octavo grado. No invente información que no esté presente en la nota. No incluya identificadores del paciente ni PHI."
        ),
    }
    instructions = default_instructions.get(lang, default_instructions["en"])
    extra = _get_custom_instruction("summary", lang, specialty, payer)
    if extra:
        instructions = f"{instructions} {extra}"
    return [
        {"role": "system", "content": instructions},
        {"role": "user", "content": text},
    ]
