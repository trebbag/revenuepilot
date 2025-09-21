"""Compatibility wrapper exposing ORM models for compliance data."""

from backend.db.models import Base, ComplianceRule

__all__ = ["Base", "ComplianceRule"]
