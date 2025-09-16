"""SQLAlchemy models for compliance data."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import Column, DateTime, String, Text
from sqlalchemy.orm import declarative_base


Base = declarative_base()


class ComplianceRule(Base):
    """ORM model representing a compliance rule definition."""

    __tablename__ = "compliance_rules"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String, nullable=True)
    severity = Column(String, nullable=True)
    rule_type = Column("type", String, nullable=False)
    metadata_json = Column("metadata", Text, nullable=True)
    references_json = Column("references", Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    def metadata_dict(self) -> Dict[str, Any]:
        """Return the decoded metadata dictionary for the rule."""

        if not self.metadata_json:
            return {}
        try:
            decoded = json.loads(self.metadata_json)
        except (json.JSONDecodeError, TypeError):
            return {}
        if isinstance(decoded, dict):
            return decoded
        return {}

    def references_list(self) -> List[Dict[str, Any]]:
        """Return the decoded references list for the rule."""

        if not self.references_json:
            return []
        try:
            decoded = json.loads(self.references_json)
        except (json.JSONDecodeError, TypeError):
            return []
        if isinstance(decoded, list):
            return [item for item in decoded if isinstance(item, dict)]
        return []

    def to_dict(self) -> Dict[str, Any]:
        """Serialise the rule to a dictionary including metadata fields."""

        data: Dict[str, Any] = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "severity": self.severity,
            "type": self.rule_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        metadata = self.metadata_dict()
        if metadata:
            data["metadata"] = metadata
            for key, value in metadata.items():
                data.setdefault(key, value)
        references = self.references_list()
        if references:
            data["references"] = references
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ComplianceRule":
        """Create an instance from an API or seed dictionary."""

        metadata_payload = {}
        incoming_metadata = data.get("metadata")
        if isinstance(incoming_metadata, dict):
            metadata_payload.update(incoming_metadata)

        core_fields = {
            "id",
            "name",
            "description",
            "category",
            "severity",
            "type",
            "metadata",
            "references",
            "created_at",
            "updated_at",
            "createdAt",
            "updatedAt",
        }
        for key, value in data.items():
            if key in core_fields:
                continue
            metadata_payload[key] = value

        references_value = data.get("references")
        references_serialized: Optional[str] = None
        if isinstance(references_value, list):
            refs_clean = [item for item in references_value if isinstance(item, dict)]
            if refs_clean:
                references_serialized = json.dumps(refs_clean)

        metadata_serialized: Optional[str] = None
        if metadata_payload:
            metadata_serialized = json.dumps(metadata_payload)

        return cls(
            id=str(data.get("id", "")),
            name=str(data.get("name", "")),
            description=str(data.get("description", "")),
            category=data.get("category"),
            severity=data.get("severity"),
            rule_type=str(data.get("type", "absence")),
            metadata_json=metadata_serialized,
            references_json=references_serialized,
        )

