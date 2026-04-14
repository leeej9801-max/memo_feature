"""
models.py - SQLAlchemy ORM Models

레이어 원칙 (절대 혼합 금지):
  Master     : company, user_account, department
  Dictionary : approval_scope
  Fact       : fact_candidate, kpi_fact
  Evidence   : evidence_chunk
  AI         : report_section_draft, narrative_reference
  Log        : audit_log, approval_log
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Float, DateTime, ForeignKey,
    Enum as SAEnum, Boolean, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


# ─────────────────────────────────────────────────────────
# Enum Types
# ─────────────────────────────────────────────────────────

class RoleCode(str, enum.Enum):
    tenant_admin = "tenant_admin"
    dept_manager = "dept_manager"
    data_entry    = "data_entry"
    viewer        = "viewer"


class FactStatus(str, enum.Enum):
    draft     = "draft"
    submitted = "submitted"
    approved  = "approved"
    rejected  = "rejected"


class ActionType(str, enum.Enum):
    submit  = "submit"
    approve = "approve"
    reject  = "reject"


class AuditEventType(str, enum.Enum):
    FACT_SUBMITTED   = "FACT_SUBMITTED"
    FACT_APPROVED    = "FACT_APPROVED"
    FACT_REJECTED    = "FACT_REJECTED"
    CSV_IMPORTED     = "CSV_IMPORTED"
    REPORT_GENERATED = "REPORT_GENERATED"


# ─────────────────────────────────────────────────────────
# MASTER LAYER
# ─────────────────────────────────────────────────────────

class Company(Base):
    __tablename__ = "company"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name       = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    users       = relationship("UserAccount", back_populates="company")
    departments = relationship("Department", back_populates="company")


class UserAccount(Base):
    __tablename__ = "user_account"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("company.id"), nullable=False)
    email      = Column(String(255), nullable=False, unique=True)
    name       = Column(String(100), nullable=False)
    role_code  = Column(SAEnum(RoleCode), nullable=False, default=RoleCode.data_entry)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    company         = relationship("Company", back_populates="users")
    approval_scopes = relationship("ApprovalScope", back_populates="user")
    fact_candidates = relationship("FactCandidate", back_populates="submitted_by_user")


class Department(Base):
    __tablename__ = "department"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id       = Column(UUID(as_uuid=True), ForeignKey("company.id"), nullable=False)
    name             = Column(String(100), nullable=False)
    issue_group_code = Column(String(50), nullable=False)
    created_at       = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_dept_company_name"),
    )

    company = relationship("Company", back_populates="departments")


# ─────────────────────────────────────────────────────────
# DICTIONARY LAYER
# ─────────────────────────────────────────────────────────

class ApprovalScope(Base):
    __tablename__ = "approval_scope"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id     = Column(UUID(as_uuid=True), ForeignKey("user_account.id"), nullable=False)
    scope_value = Column(String(50), nullable=False)
    action_type = Column(SAEnum(ActionType), nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "scope_value", "action_type",
                         name="uq_scope_user_value_action"),
    )

    user = relationship("UserAccount", back_populates="approval_scopes")


# ─────────────────────────────────────────────────────────
# FACT LAYER
# ─────────────────────────────────────────────────────────

class FactCandidate(Base):
    __tablename__ = "fact_candidate"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id       = Column(UUID(as_uuid=True), ForeignKey("company.id"), nullable=False)
    issue_group_code = Column(String(50), nullable=False)
    metric_id        = Column(String(50), nullable=False)
    value            = Column(Float, nullable=True)
    value_text       = Column(Text, nullable=True)
    department_id    = Column(UUID(as_uuid=True), ForeignKey("department.id"), nullable=True)
    submitted_by     = Column(UUID(as_uuid=True), ForeignKey("user_account.id"), nullable=False)
    status           = Column(SAEnum(FactStatus), nullable=False, default=FactStatus.draft)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    submitted_by_user = relationship("UserAccount", back_populates="fact_candidates")
    kpi_fact          = relationship("KPIFact", back_populates="fact_candidate", uselist=False)


class KPIFact(Base):
    __tablename__ = "kpi_fact"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id        = Column(UUID(as_uuid=True), ForeignKey("company.id"), nullable=False)
    fact_candidate_id = Column(UUID(as_uuid=True), ForeignKey("fact_candidate.id"),
                               nullable=False, unique=True)
    issue_group_code  = Column(String(50), nullable=False)
    metric_id         = Column(String(50), nullable=False)
    value             = Column(Float, nullable=True)
    value_text        = Column(Text, nullable=True)
    approved_at       = Column(DateTime, default=datetime.utcnow)
    approved_by       = Column(UUID(as_uuid=True), ForeignKey("user_account.id"), nullable=False)

    fact_candidate  = relationship("FactCandidate", back_populates="kpi_fact")
    evidence_chunks = relationship("EvidenceChunk", back_populates="kpi_fact")


# ─────────────────────────────────────────────────────────
# EVIDENCE LAYER
# ─────────────────────────────────────────────────────────

class EvidenceChunk(Base):
    __tablename__ = "evidence_chunk"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id   = Column(UUID(as_uuid=True), ForeignKey("company.id"), nullable=False)
    kpi_fact_id  = Column(UUID(as_uuid=True), ForeignKey("kpi_fact.id"), nullable=False)
    evidence_key = Column(String(100), nullable=False)
    source_type  = Column(String(50), nullable=False, default="CSV")
    content      = Column(Text, nullable=True)
    uploaded_at  = Column(DateTime, default=datetime.utcnow)

    kpi_fact = relationship("KPIFact", back_populates="evidence_chunks")


# ─────────────────────────────────────────────────────────
# AI LAYER
# ─────────────────────────────────────────────────────────

class ReportSectionDraft(Base):
    __tablename__ = "report_section_draft"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id       = Column(UUID(as_uuid=True), ForeignKey("company.id"), nullable=False)
    issue_group_code = Column(String(50), nullable=False)
    generated_text   = Column(Text, nullable=False)
    status           = Column(String(20), nullable=False, default="draft")
    created_at       = Column(DateTime, default=datetime.utcnow)

    narrative_references = relationship("NarrativeReference", back_populates="report_section")


class NarrativeReference(Base):
    __tablename__ = "narrative_reference"

    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_section_draft_id = Column(UUID(as_uuid=True),
                                     ForeignKey("report_section_draft.id"), nullable=False)
    kpi_fact_id             = Column(UUID(as_uuid=True), ForeignKey("kpi_fact.id"), nullable=True)
    evidence_id             = Column(UUID(as_uuid=True), ForeignKey("evidence_chunk.id"), nullable=True)
    created_at              = Column(DateTime, default=datetime.utcnow)

    report_section = relationship("ReportSectionDraft", back_populates="narrative_references")


# ─────────────────────────────────────────────────────────
# LOG LAYER (분리 필수)
# ─────────────────────────────────────────────────────────

class ApprovalLog(Base):
    __tablename__ = "approval_log"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id        = Column(UUID(as_uuid=True), nullable=False)
    fact_candidate_id = Column(UUID(as_uuid=True), ForeignKey("fact_candidate.id"), nullable=False)
    action            = Column(SAEnum(ActionType), nullable=False)
    actor_user_id     = Column(UUID(as_uuid=True), ForeignKey("user_account.id"), nullable=False)
    issue_group_code  = Column(String(50), nullable=False)
    comment           = Column(Text, nullable=True)
    logged_at         = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    event_type = Column(SAEnum(AuditEventType), nullable=False)
    actor_id   = Column(UUID(as_uuid=True), nullable=True)
    target_id  = Column(UUID(as_uuid=True), nullable=True)
    detail     = Column(Text, nullable=True)
    logged_at  = Column(DateTime, default=datetime.utcnow)
