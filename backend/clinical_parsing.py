"""Clinical fact extraction utilities used by the chart context pipeline."""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional, Tuple, TYPE_CHECKING

logger = logging.getLogger(__name__)

if TYPE_CHECKING:  # pragma: no cover - import cycle guard
    from backend.context_pipeline import UploadedChartFile


_DATE_PATTERNS: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(r"(19|20)\d{2}-\d{2}-\d{2}"), "%Y-%m-%d"),
    (re.compile(r"\b\d{1,2}/\d{1,2}/(19|20)\d{2}\b"), "%m/%d/%Y"),
    (re.compile(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s*(19|20)\d{2}\b", re.IGNORECASE), "%b %d, %Y"),
]

_SECTION_HEADER = re.compile(r"(?m)^\s*(?P<title>[A-Z][A-Z0-9 \-/]{2,})\s*(?::|$)")
_WHITESPACE_RE = re.compile(r"\s+")

_PROBLEM_LEXICON: Mapping[str, Mapping[str, str]] = {
    "type 2 diabetes": {
        "code": "E11.9",
        "snomed": "44054006",
        "label": "Type 2 diabetes mellitus",
    },
    "hypertension": {
        "code": "I10",
        "snomed": "59621000",
        "label": "Primary hypertension",
    },
    "chronic kidney disease": {
        "code": "N18.9",
        "snomed": "709044004",
        "label": "Chronic kidney disease",
    },
}

_MEDICATION_LEXICON: Mapping[str, Mapping[str, str]] = {
    "metformin": {"rxnorm": "860975", "snomed": "860975", "label": "Metformin"},
    "lisinopril": {"rxnorm": "861005", "snomed": "290578008", "label": "Lisinopril"},
    "atorvastatin": {"rxnorm": "83367", "snomed": "61731009", "label": "Atorvastatin"},
}

_ALLERGY_LEXICON: Mapping[str, Mapping[str, str]] = {
    "penicillin": {"snomed": "294954003", "label": "Penicillin"},
    "latex": {"snomed": "300916003", "label": "Latex"},
}

_LAB_PATTERNS: List[Mapping[str, Any]] = [
    {
        "label": "Hemoglobin",
        "loinc": "718-7",
        "default_unit": "g/dL",
        "pattern": re.compile(r"hemoglobin[^\d]{0,10}(?P<value>\d{1,2}\.\d)(?P<unit>\s*(?:g/dl|g\\/dl))?", re.IGNORECASE),
    },
    {
        "label": "Hemoglobin A1c",
        "loinc": "4548-4",
        "default_unit": "%",
        "pattern": re.compile(r"(hemoglobin\s*A1c|HBA1C)[^\d]{0,10}(?P<value>\d{1,2}\.\d)(?P<unit>\s*%)?", re.IGNORECASE),
    },
    {
        "label": "LDL Cholesterol",
        "loinc": "13457-7",
        "default_unit": "mg/dL",
        "pattern": re.compile(r"LDL[^\d]{0,10}(?P<value>\d{2,3})(?P<unit>\s*(?:mg/dl))?", re.IGNORECASE),
    },
]

_VITAL_PATTERNS: List[Mapping[str, Any]] = [
    {
        "label": "Blood Pressure",
        "loinc": "85354-9",
        "pattern": re.compile(r"bp[^0-9]*(?P<systolic>\d{2,3})\s*[\\/-]\s*(?P<diastolic>\d{2,3})", re.IGNORECASE),
        "unit": "mm[Hg]",
    },
    {
        "label": "Heart Rate",
        "loinc": "8867-4",
        "pattern": re.compile(r"(heart rate|hr)\s*[:=]?\s*(?P<value>\d{2,3})\s*(?:bpm|/min)?", re.IGNORECASE),
        "unit": "1/min",
    },
]

_FREQUENCY_MAP = {
    "bid": "BID",
    "tid": "TID",
    "qd": "QD",
    "qam": "QAM",
    "qhs": "QHS",
    "qod": "QOD",
    "q4h": "Q4H",
    "q6h": "Q6H",
    "weekly": "Weekly",
    "daily": "QD",
    "once daily": "QD",
    "twice daily": "BID",
}

_ROUTE_MAP = {
    "po": "PO",
    "oral": "PO",
    "iv": "IV",
    "intravenous": "IV",
    "im": "IM",
    "sc": "SC",
    "subcutaneous": "SC",
    "topical": "TOP",
}

_UNIT_NORMALIZATION = {
    "mmhg": "mm[Hg]",
    "mm hg": "mm[Hg]",
    "g/dl": "g/dL",
    "g\u2215dl": "g/dL",
    "mg/dl": "mg/dL",
    "mg": "mg",
    "mcg": "mcg",
    "g": "g",
    "%": "%",
    "iu": "[iU]",
    "units": "[iU]",
    "tablet": "1",  # count based
    "tab": "1",
    "capsule": "1",
    "ml": "mL",
}


class ClinicalFactExtractor:
    """Heuristic clinical NLP pipeline with provenance and normalization."""

    def extract(
        self,
        documents: Iterable["UploadedChartFile"],
    ) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, Any]]:
        problems: MutableMapping[Tuple[str, str], Dict[str, Any]] = {}
        medications: MutableMapping[Tuple[str, str], Dict[str, Any]] = {}
        allergies: MutableMapping[str, Dict[str, Any]] = {}
        labs: MutableMapping[Tuple[str, str], Dict[str, Any]] = {}
        vitals: MutableMapping[str, Dict[str, Any]] = {}
        metrics = defaultdict(lambda: {"found": 0, "normalized": 0})

        for document in documents:
            sections = self._sectionize(document.text)
            for section in sections:
                segment = document.text[section["start"] : section["end"]]
                self._extract_problems(document, segment, section, problems, metrics)
                self._extract_medications(document, segment, section, medications, metrics)
                self._extract_allergies(document, segment, section, allergies, metrics)
                self._extract_labs(document, segment, section, labs, metrics)
                self._extract_vitals(document, segment, section, vitals, metrics)

        return (
            {
                "problems": self._finalize_collection(problems),
                "medications": self._finalize_collection(medications),
                "allergies": self._finalize_collection(allergies),
                "labs": self._finalize_collection(labs),
                "vitals": self._finalize_collection(vitals),
            },
            {key: dict(value) for key, value in metrics.items()},
        )

    # ------------------------------------------------------------------
    # Extraction helpers
    # ------------------------------------------------------------------

    def _extract_problems(
        self,
        document: "UploadedChartFile",
        segment: str,
        section: Mapping[str, Any],
        collector: MutableMapping[Tuple[str, str], Dict[str, Any]],
        metrics: MutableMapping[str, Dict[str, int]],
    ) -> None:
        for keyword, meta in _PROBLEM_LEXICON.items():
            pattern = re.compile(rf"\b{re.escape(keyword)}\b", re.IGNORECASE)
            for match in pattern.finditer(segment):
                metrics["problems"]["found"] += 1
                start = section["start"] + match.start()
                end = section["start"] + match.end()
                anchor = self._anchor(document, start, end)
                iso_date = self._resolve_date(document, start, end)
                payload = {
                    "code": meta["code"],
                    "system": "ICD-10",
                    "snomed": meta["snomed"],
                    "label": meta["label"],
                    "status": "active",
                    "value": "active",
                    "unit": None,
                }
                history_entry = {
                    "date": iso_date,
                    "section": section["label"],
                    "status": "active",
                    "evidence": [anchor],
                    "value": "active",
                    "unit": None,
                }
                self._register_fact(collector, (payload["code"], payload["label"]), payload, history_entry)
                metrics["problems"]["normalized"] += 1

    def _extract_medications(
        self,
        document: "UploadedChartFile",
        segment: str,
        section: Mapping[str, Any],
        collector: MutableMapping[Tuple[str, str], Dict[str, Any]],
        metrics: MutableMapping[str, Dict[str, int]],
    ) -> None:
        lowered = segment.lower()
        for drug, meta in _MEDICATION_LEXICON.items():
            if drug not in lowered:
                continue
            pattern = re.compile(rf"\b({re.escape(drug)})\b([^\n\.\r]{{0,120}})", re.IGNORECASE)
            for match in pattern.finditer(segment):
                metrics["medications"]["found"] += 1
                context = match.group(0)
                start = section["start"] + match.start(1)
                end = section["start"] + match.end(1)
                anchor = self._anchor(document, start, end)
                details = self._parse_medication_details(context)
                iso_date = self._resolve_date(document, start, end)
                dose_value = details.get("dose")
                dose_unit = details.get("dose_unit")
                payload = {
                    "rxnorm": meta["rxnorm"],
                    "snomed": meta["snomed"],
                    "label": meta["label"],
                    "dose": details.get("dose"),
                    "dose_unit": details.get("dose_unit"),
                    "route": details.get("route"),
                    "frequency": details.get("frequency"),
                    "value": dose_value,
                    "unit": dose_unit,
                    "dose_text": details.get("dose_text"),
                }
                history_entry = {
                    "date": iso_date,
                    "section": section["label"],
                    "value": dose_value,
                    "unit": dose_unit,
                    "dose_text": details.get("dose_text"),
                    "evidence": [anchor],
                    "context": context.strip(),
                }
                self._register_fact(collector, (payload["rxnorm"], payload["label"].lower()), payload, history_entry)
                metrics["medications"]["normalized"] += 1

    def _extract_allergies(
        self,
        document: "UploadedChartFile",
        segment: str,
        section: Mapping[str, Any],
        collector: MutableMapping[str, Dict[str, Any]],
        metrics: MutableMapping[str, Dict[str, int]],
    ) -> None:
        if "allerg" not in section["label"] and "allerg" not in segment.lower():
            return
        line_pattern = re.compile(r"allerg(?:y|ies)[\s:;-]*(?P<items>.+)", re.IGNORECASE)
        for match in line_pattern.finditer(segment):
            metrics["allergies"]["found"] += 1
            items = re.split(r"[,;]", match.group("items"))
            for raw in items:
                item = raw.strip().lower()
                if not item:
                    continue
                meta = None
                for candidate, metadata in _ALLERGY_LEXICON.items():
                    if candidate in item:
                        meta = metadata
                        break
                if not meta:
                    continue
                start = section["start"] + match.start()
                end = start + len(match.group(0))
                anchor = self._anchor(document, start, end)
                iso_date = self._resolve_date(document, start, end)
                severity_match = re.search(r"(mild|moderate|severe)", item, re.IGNORECASE)
                payload = {
                    "label": meta["label"],
                    "snomed": meta["snomed"],
                    "severity": severity_match.group(1).lower() if severity_match else None,
                    "value": severity_match.group(1).lower() if severity_match else "documented",
                    "unit": None,
                }
                history_entry = {
                    "date": iso_date,
                    "section": section["label"],
                    "evidence": [anchor],
                    "value": payload["value"],
                    "unit": None,
                }
                self._register_fact(collector, meta["label"].lower(), payload, history_entry)
                metrics["allergies"]["normalized"] += 1

    def _extract_labs(
        self,
        document: "UploadedChartFile",
        segment: str,
        section: Mapping[str, Any],
        collector: MutableMapping[Tuple[str, str], Dict[str, Any]],
        metrics: MutableMapping[str, Dict[str, int]],
    ) -> None:
        for lab in _LAB_PATTERNS:
            for match in lab["pattern"].finditer(segment):
                metrics["labs"]["found"] += 1
                start = section["start"] + match.start()
                end = section["start"] + match.end()
                anchor = self._anchor(document, start, end)
                value = match.group("value")
                unit = match.group("unit") or lab.get("default_unit")
                normalized_unit = self._normalize_unit(unit)
                iso_date = self._resolve_date(document, start, end)
                inline_date = self._find_inline_date(segment, match.end())
                if inline_date:
                    iso_date = inline_date
                numeric_value = float(value) if value else None
                payload = {
                    "label": lab["label"],
                    "loinc": lab["loinc"],
                    "unit": normalized_unit,
                    "value": numeric_value,
                }
                history_entry = {
                    "date": iso_date,
                    "value": numeric_value,
                    "unit": normalized_unit,
                    "section": section["label"],
                    "evidence": [anchor],
                }
                self._register_fact(collector, (payload["loinc"], payload["label"]), payload, history_entry)
                metrics["labs"]["normalized"] += 1
        self._extract_lab_tables(document, segment, section, collector, metrics)

    def _extract_lab_tables(
        self,
        document: "UploadedChartFile",
        segment: str,
        section: Mapping[str, Any],
        collector: MutableMapping[Tuple[str, str], Dict[str, Any]],
        metrics: MutableMapping[str, Dict[str, int]],
    ) -> None:
        if "|" not in segment:
            return
        for line in segment.splitlines():
            if "|" not in line:
                continue
            cells = [cell.strip() for cell in line.split("|") if cell.strip()]
            if len(cells) < 2:
                continue
            label = cells[0].lower()
            value = cells[1]
            unit = cells[2] if len(cells) > 2 else ""
            for lab in _LAB_PATTERNS:
                if lab["label"].lower() not in label:
                    continue
                metrics["labs"]["found"] += 1
                normalized_unit = self._normalize_unit(unit or lab.get("default_unit"))
                iso_date = None
                if len(cells) > 3:
                    iso_date = self._normalize_date_string(cells[3], None)
                if not iso_date:
                    start = document.text.find(line, section["start"], section["end"])
                else:
                    start = document.text.find(line, section["start"], section["end"])
                if start == -1:
                    continue
                end = start + len(line)
                anchor = self._anchor(document, start, end)
                iso_date = iso_date or self._resolve_date(document, start, end)
                try:
                    numeric_value = float(value)
                except ValueError:
                    continue
                payload = {
                    "label": lab["label"],
                    "loinc": lab["loinc"],
                    "unit": normalized_unit,
                    "value": numeric_value,
                }
                history_entry = {
                    "date": iso_date,
                    "value": numeric_value,
                    "unit": normalized_unit,
                    "section": section["label"],
                    "evidence": [anchor],
                }
                self._register_fact(collector, (payload["loinc"], payload["label"]), payload, history_entry)
                metrics["labs"]["normalized"] += 1

    def _extract_vitals(
        self,
        document: "UploadedChartFile",
        segment: str,
        section: Mapping[str, Any],
        collector: MutableMapping[str, Dict[str, Any]],
        metrics: MutableMapping[str, Dict[str, int]],
    ) -> None:
        lowered = segment.lower()
        for vital in _VITAL_PATTERNS:
            if vital["label"].lower().split()[0] not in lowered:
                continue
            for match in vital["pattern"].finditer(segment):
                metrics["vitals"]["found"] += 1
                start = section["start"] + match.start()
                end = section["start"] + match.end()
                anchor = self._anchor(document, start, end)
                iso_date = self._resolve_date(document, start, end)
                if "systolic" in match.groupdict():
                    value = f"{match.group('systolic')}/{match.group('diastolic')}"
                else:
                    value = match.group("value")
                payload = {
                    "label": vital["label"],
                    "loinc": vital["loinc"],
                    "unit": vital["unit"],
                    "value": value,
                }
                history_entry = {
                    "date": iso_date,
                    "value": value,
                    "unit": vital["unit"],
                    "section": section["label"],
                    "evidence": [anchor],
                }
                self._register_fact(collector, vital["label"].lower(), payload, history_entry)
                metrics["vitals"]["normalized"] += 1

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def _sectionize(self, text: str) -> List[Dict[str, Any]]:
        sections: List[Dict[str, Any]] = []
        current_start = 0
        current_label = "document"
        for match in _SECTION_HEADER.finditer(text):
            heading_start = match.start()
            if heading_start > current_start:
                sections.append({"label": current_label.lower(), "start": current_start, "end": heading_start})
            current_label = match.group("title").strip()
            current_start = match.end()
        if current_start < len(text):
            sections.append({"label": current_label.lower(), "start": current_start, "end": len(text)})
        if not sections:
            sections.append({"label": "document", "start": 0, "end": len(text)})
        return sections

    def sectionize(self, text: str) -> List[Dict[str, Any]]:
        """Public wrapper used by the indexing stage for consistent sectioning."""

        return self._sectionize(text)

    def _register_fact(
        self,
        collection: MutableMapping[Any, Dict[str, Any]],
        key: Any,
        payload: Mapping[str, Any],
        history_entry: Mapping[str, Any],
    ) -> None:
        entry = collection.get(key)
        if not entry:
            entry = dict(payload)
            entry["history"] = []
            collection[key] = entry
        history = entry.setdefault("history", [])
        signature = (
            history_entry.get("date"),
            history_entry.get("value"),
            tuple(
                (anchor.get("doc_id"), anchor.get("char_start"), anchor.get("char_end"))
                for anchor in history_entry.get("evidence", [])
            ),
        )
        if not any(
            (
                existing.get("date"),
                existing.get("value"),
                tuple(
                    (anchor.get("doc_id"), anchor.get("char_start"), anchor.get("char_end"))
                    for anchor in existing.get("evidence", [])
                ),
            )
            == signature
            for existing in history
        ):
            history.append(dict(history_entry))
        history.sort(key=lambda item: (item.get("date") or "", item.get("value") or ""), reverse=True)
        filtered_payload = {k: v for k, v in payload.items() if k not in {"unit", "value"} and v is not None}
        entry.update(filtered_payload)
        if "unit" in payload:
            entry["unit"] = payload.get("unit")
        if "value" in payload and payload.get("value") is not None:
            entry["value"] = payload.get("value")
        if history:
            latest = history[0]
            entry["last_observed"] = latest.get("date")
            entry["date"] = latest.get("date")
            entry["evidence"] = latest.get("evidence", [])
            entry["value"] = latest.get("value")
            if "unit" in latest:
                entry["unit"] = latest.get("unit")

    def _finalize_collection(self, collection: Mapping[Any, Dict[str, Any]]) -> List[Dict[str, Any]]:
        items = []
        for value in collection.values():
            history = value.get("history", [])
            history.sort(key=lambda item: item.get("date") or "", reverse=True)
            value["history"] = history
            items.append(value)
        items.sort(key=lambda item: item.get("last_observed") or "", reverse=True)
        return items

    def _anchor(self, document: "UploadedChartFile", start: int, end: int) -> Dict[str, Any]:
        page = document.text.count("\f", 0, start) + 1
        return {
            "doc_id": document.doc_id,
            "page": page,
            "char_start": max(0, start),
            "char_end": min(len(document.text), end),
        }

    def _resolve_date(self, document: "UploadedChartFile", start: int, end: int) -> str:
        window_radius = 80
        window_start = max(0, start - window_radius)
        window_end = min(len(document.text), end + window_radius)
        window = document.text[window_start:window_end]
        anchor = start
        best: Optional[Tuple[int, str]] = None
        for pattern, fmt in _DATE_PATTERNS:
            for match in pattern.finditer(window):
                normalized = self._normalize_date_string(match.group(0), fmt)
                if not normalized:
                    continue
                absolute_start = window_start + match.start()
                absolute_end = window_start + match.end()
                distance = min(abs(absolute_start - anchor), abs(absolute_end - anchor))
                if not best or distance < best[0]:
                    best = (distance, normalized)
        if best:
            return best[1]
        return document.uploaded_at.date().isoformat()

    def _normalize_date_string(self, value: str, fmt: Optional[str]) -> Optional[str]:
        text = value.strip()
        if not text:
            return None
        if fmt:
            try:
                dt = datetime.strptime(text, fmt)
            except ValueError:
                return None
            return dt.date().isoformat()
        for pattern, pattern_fmt in _DATE_PATTERNS:
            if pattern.fullmatch(text):
                try:
                    dt = datetime.strptime(text, pattern_fmt)
                except ValueError:
                    return None
                return dt.date().isoformat()
        return None

    def _find_inline_date(self, text: str, start: int) -> Optional[str]:
        window = text[start : start + 80]
        for pattern, fmt in _DATE_PATTERNS:
            match = pattern.search(window)
            if not match:
                continue
            normalized = self._normalize_date_string(match.group(0), fmt)
            if normalized:
                return normalized
        return None

    def _parse_medication_details(self, context: str) -> Dict[str, Any]:
        lowered = context.lower()
        details: Dict[str, Any] = {}
        dose_match = re.search(
            r"(\d+(?:\.\d+)?)\s*(mg|mcg|g|units|iu|tablet|tab|capsule|ml)",
            context,
            re.IGNORECASE,
        )
        if dose_match:
            amount = float(dose_match.group(1))
            raw_unit = dose_match.group(2)
            unit = self._normalize_unit(raw_unit)
            details["dose"] = amount
            details["dose_unit"] = unit
            details["dose_text"] = f"{dose_match.group(1)} {raw_unit.strip()}"
        freq_match = re.search(r"\b(bid|tid|qd|qam|qhs|qod|q4h|q6h|weekly|daily|once daily|twice daily)\b", lowered)
        if freq_match:
            details["frequency"] = _FREQUENCY_MAP.get(freq_match.group(1), freq_match.group(1).upper())
        route_match = re.search(r"\b(po|oral|iv|intravenous|im|sc|subcutaneous|topical)\b", lowered)
        if route_match:
            details["route"] = _ROUTE_MAP.get(route_match.group(1), route_match.group(1).upper())
        return details

    def _normalize_unit(self, unit: Optional[str]) -> Optional[str]:
        if unit is None:
            return None
        cleaned = _WHITESPACE_RE.sub("", unit.strip().lower())
        return _UNIT_NORMALIZATION.get(cleaned, unit.strip())


__all__ = ["ClinicalFactExtractor"]
