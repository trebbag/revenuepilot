"""
Prompt templates for the RevenuePilot AI agents.

These functions construct structured prompts for use with large language models.
They include instructions that specify the expected output format and scope
according to the RevenuePilot plan.  When integrating with the OpenAI API,
call `openai.ChatCompletion.create` with the returned messages.
"""

from typing import List, Dict, Any, Optional

from .guidelines import get_guidelines


def build_beautify_prompt(text: str) -> List[Dict[str, str]]:
    """
    Construct a prompt for reformatting a clinical note into a clean,
    professional format.  The assistant must not alter the clinical
    content or add new information; it should simply improve phrasing,
    spelling and organisation.

    Args:
        text: The draft clinical note (already de‑identified).
    Returns:
        A list of messages suitable for the OpenAI chat completion API.
    """
    return [
        {
            "role": "system",
            "content": (
                "You are a highly skilled clinical documentation specialist. Your task is to take "
                "an unformatted draft note and return a polished, professional version. Do not "
                "alter the underlying clinical facts or invent new information. Correct grammar "
                "and spelling, improve clarity and readability, and organise the content into a "
                "standard SOAP format (Subjective, Objective, Assessment, Plan) where appropriate. "
                "If the note does not contain all four sections, preserve the existing content and "
                "structure sensibly. Do not include any patient identifiers or PHI. Do not add "
                "extra commentary, headings or markup beyond the improved note itself."
            ),
        },
        {"role": "user", "content": text},
    ]


def build_suggest_prompt(
    text: str,
    age: Optional[int] = None,
    sex: Optional[str] = None,
    region: Optional[str] = None,
) -> List[Dict[str, str]]:
    """
    Construct a prompt for generating coding, compliance and differential
    suggestions.  The AI should parse the clinical note and produce a
    JSON object with the requested fields.  The assistant must base its
    suggestions on the provided note and avoid fabricating findings.

    Args:
        text: The draft clinical note (already de‑identified).
    Returns:
        A list of messages for the OpenAI chat completion API.
    """
    instructions = (
        "You are an expert medical coder, compliance officer and clinical decision support assistant. "
        "Analyse the following de‑identified clinical note and return a JSON object with four keys:\n"
        "- codes: an array of objects with two fields: code (string) and rationale (string). Include only the most relevant CPT and ICD‑10 codes based solely on the information provided. Do not guess codes that are not supported by the note. Limit to a maximum of five codes.\n"
        "- compliance: an array of succinct strings highlighting missing documentation elements, audit risks or compliance tips (e.g., incomplete history, missing ROS, insufficient exam). Focus on areas that could cause downcoding or denials.\n"
        "- public_health: an array of preventative measures, vaccinations or screenings that may apply given the patient’s context. Suggest generic recommendations (e.g., influenza vaccine, smoking cessation) without assuming personal details.\n"
        "- differentials: an array of plausible differential diagnoses suggested by the note. Limit to a maximum of five differentials and ensure they are consistent with the symptoms described.\n"
        "Return only valid JSON without any surrounding Markdown. Do not fabricate information beyond the note. If no suggestions apply to a category, return an empty array for that key."
    )
    guideline_text = ""
    try:
        if age is not None or sex is not None or region is not None:
            info = get_guidelines(age or 0, sex or "", region or "")
            parts = []
            if info.get("vaccinations"):
                parts.append(
                    "Vaccinations: " + ", ".join(info["vaccinations"])
                )
            if info.get("screenings"):
                parts.append(
                    "Screenings: " + ", ".join(info["screenings"])
                )
            if parts:
                guideline_text = (
                    "\n\nRelevant public health guidelines:\n" +
                    "\n".join(f"- {p}" for p in parts)
                )
    except Exception:
        guideline_text = ""

    user_content = text + guideline_text

    return [
        {"role": "system", "content": instructions},
        {"role": "user", "content": user_content},
    ]


def build_summary_prompt(text: str) -> List[Dict[str, str]]:
    """
    Construct a prompt for generating a patient‑friendly summary of a clinical note.
    The assistant should translate clinical jargon into plain language that a
    non‑medical reader can understand.  It should preserve the key facts (e.g.,
    diagnoses, treatments and follow‑up instructions) but avoid sensitive
    identifiers or billing codes.  The output should be concise (1–2
    paragraphs) and written at roughly an 8th grade reading level.

    Args:
        text: The de‑identified clinical note and any additional context.
    Returns:
        A list of messages suitable for the OpenAI chat completion API.
    """
    return [
        {
            "role": "system",
            "content": (
                "You are an expert clinical communicator.  Rewrite the following clinical note "
                "into a concise summary that a patient can easily understand.  Preserve all "
                "important medical facts (symptoms, diagnoses, treatments, follow‑up), but remove "
                "billing codes and technical jargon.  Write in plain language at about an 8th "
                "grade reading level.  Do not invent information that is not present in the note. "
                "Do not include any patient identifiers or PHI."
            ),
        },
        {"role": "user", "content": text},
    ]