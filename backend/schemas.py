"""
schemas.py - Pydantic 입출력 스키마
"""

from __future__ import annotations
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field
from models import RoleCode, FactStatus, ActionType, AuditEventType


# ─────────────────────────────────────────────────────────
# Auth / User
# ─────────────────────────────────────────────────────────

class CurrentUser(BaseModel):
    """request에서 파싱된 현재 인증 사용자 컨텍스트"""
    id: UUID
    company_id: UUID
    role_code: RoleCode
    email: str

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────
# STEP 1: CSV Input
# ─────────────────────────────────────────────────────────

class CSVRow(BaseModel):
    """CSV 한 행의 구조"""
    issue_group_code: str = Field(..., description="e.g. CLIMATE, SAFETY, WORKFORCE, GOVERNANCE")
    metric_id: str        = Field(..., description="e.g. E1-15")
    value: Optional[float] = None
    value_text: Optional[str] = None
    department: str       = Field(..., description="부서명 (없으면 자동 생성)")
    assignee: str         = Field(..., description="담당자 이메일 (user_account 매핑 키)")


class CSVUploadResponse(BaseModel):
    message: str
    created_count: int
    fact_candidate_ids: List[UUID]


# ─────────────────────────────────────────────────────────
# STEP 2: Approval
# ─────────────────────────────────────────────────────────

class DeptSimple(BaseModel):
    id: UUID
    name: str
    class Config: from_attributes = True

class UserSimple(BaseModel):
    id: UUID
    email: str
    name: str
    class Config: from_attributes = True

class FactCandidateResponse(BaseModel):
    id: UUID
    company_id: UUID
    issue_group_code: str
    metric_id: str
    value: Optional[float]
    value_text: Optional[str]
    status: FactStatus
    created_at: datetime
    updated_at: datetime
    
    # Relationships & Counts
    department: Optional[DeptSimple] = None
    submitted_by_user: Optional[UserSimple] = None
    comment_count: int = 0

    class Config:
        from_attributes = True


class ApprovalActionResponse(BaseModel):
    fact_candidate_id: UUID
    new_status: FactStatus
    action: ActionType
    message: str


class RejectRequest(BaseModel):
    comment: Optional[str] = Field(None, description="반려 사유")


# ─────────────────────────────────────────────────────────
# STEP 3: Report Generation
# ─────────────────────────────────────────────────────────

class ReportGenerateRequest(BaseModel):
    issue_group_code: str = Field(..., description="보고서를 생성할 issue group (e.g. CLIMATE)")


class NarrativeReferenceResponse(BaseModel):
    id: UUID
    kpi_fact_id: Optional[UUID]
    evidence_id: Optional[UUID]

    class Config:
        from_attributes = True


class ReportSectionDraftResponse(BaseModel):
    id: UUID
    company_id: UUID
    issue_group_code: str
    generated_text: str
    status: str
    created_at: datetime
    narrative_references: List[NarrativeReferenceResponse] = []

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────
# Logs
# ─────────────────────────────────────────────────────────

class ApprovalLogResponse(BaseModel):
    id: UUID
    fact_candidate_id: UUID
    action: ActionType
    actor_user_id: UUID
    issue_group_code: str
    comment: Optional[str]
    logged_at: datetime

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    id: UUID
    company_id: UUID
    event_type: AuditEventType
    actor_id: Optional[UUID]
    target_id: Optional[UUID]
    detail: Optional[str]
    logged_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────
# Seed / Setup (테스트용)
# ─────────────────────────────────────────────────────────

class SeedRequest(BaseModel):
    company_name: str = "테스트 회사"


class SeedResponse(BaseModel):
    company_id: UUID
    users: dict
    message: str
