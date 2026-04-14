"""
approval_service.py - STEP 2: 승인 워크플로우

상태 전이:
  draft → submitted  (submit)
  submitted → approved (approve)
  submitted → rejected (reject)

핵심 불변 원칙:
  - 잘못된 상태 전이 금지
  - company_id 격리 필수
  - 3중 권한 검증 (dependencies.verify_approval_scope 호출)
  - approve 시 kpi_fact 자동 생성
  - 모든 액션은 approval_log + audit_log 이중 기록
"""

import uuid
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from models import (
    FactCandidate, KPIFact,
    ApprovalLog, AuditLog,
    ActionType, FactStatus, AuditEventType,
)
from schemas import CurrentUser
from dependencies import require_approval_scope


# ─────────────────────────────────────────────────────────
# 내부 헬퍼
# ─────────────────────────────────────────────────────────

def _get_candidate_or_404(
    db: Session,
    fact_id: uuid.UUID,
    company_id: uuid.UUID,
) -> FactCandidate:
    """company_id 격리를 포함한 fact_candidate 조회"""
    candidate = db.query(FactCandidate).filter(
        FactCandidate.id         == fact_id,
        FactCandidate.company_id == company_id,
    ).first()

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"FactCandidate '{fact_id}' not found.",
        )
    return candidate


def _write_approval_log(
    db: Session,
    company_id: uuid.UUID,
    fact_candidate_id: uuid.UUID,
    action: ActionType,
    actor_user_id: uuid.UUID,
    issue_group_code: str,
    comment: Optional[str] = None,
) -> None:
    log = ApprovalLog(
        company_id=company_id,
        fact_candidate_id=fact_candidate_id,
        action=action,
        actor_user_id=actor_user_id,
        issue_group_code=issue_group_code,
        comment=comment,
    )
    db.add(log)


def _write_audit_log(
    db: Session,
    company_id: uuid.UUID,
    event_type: AuditEventType,
    actor_id: uuid.UUID,
    target_id: uuid.UUID = None,
    detail: str = None,
) -> None:
    log = AuditLog(
        company_id=company_id,
        event_type=event_type,
        actor_id=actor_id,
        target_id=target_id,
        detail=detail,
    )
    db.add(log)


def _create_kpi_fact(
    db: Session,
    candidate: FactCandidate,
    approver_id: uuid.UUID,
) -> KPIFact:
    """
    승인 완료 시 KPIFact를 생성.
    원칙: Issue → Metric → KPI Fact 경로만 허용.
    """
    kpi = KPIFact(
        company_id=candidate.company_id,
        fact_candidate_id=candidate.id,
        issue_group_code=candidate.issue_group_code,
        metric_id=candidate.metric_id,
        value=candidate.value,
        value_text=candidate.value_text,
        approved_by=approver_id,
    )
    db.add(kpi)
    return kpi


# ─────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────

def submit_fact(
    db: Session,
    fact_id: uuid.UUID,
    current_user: CurrentUser,
) -> FactCandidate:
    """
    draft → submitted

    권한: submit 권한이 있는 사용자 또는 tenant_admin
    """
    candidate = _get_candidate_or_404(db, fact_id, current_user.company_id)

    # 상태 전이 검증
    if candidate.status != FactStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot submit: current status is '{candidate.status.value}'.",
        )

    # 3중 권한 검증 (3차: approval_scope)
    require_approval_scope(
        user=current_user,
        issue_group_code=candidate.issue_group_code,
        action=ActionType.submit,
        db=db,
    )

    # 상태 변경 및 배정 자동화 (ESG 담당자/제출자 본인 배정)
    candidate.status = FactStatus.submitted
    candidate.assigned_user_id = current_user.id

    # 이중 로그 기록
    _write_approval_log(
        db=db,
        company_id=current_user.company_id,
        fact_candidate_id=candidate.id,
        action=ActionType.submit,
        actor_user_id=current_user.id,
        issue_group_code=candidate.issue_group_code,
    )
    _write_audit_log(
        db=db,
        company_id=current_user.company_id,
        event_type=AuditEventType.FACT_SUBMITTED,
        actor_id=current_user.id,
        target_id=candidate.id,
        detail=f"metric_id={candidate.metric_id}",
    )

    db.commit()
    db.refresh(candidate)
    return candidate


def approve_fact(
    db: Session,
    fact_id: uuid.UUID,
    current_user: CurrentUser,
) -> FactCandidate:
    """
    submitted → approved
    → KPIFact 자동 생성

    권한: approve 권한이 있는 사용자 또는 tenant_admin
    """
    candidate = _get_candidate_or_404(db, fact_id, current_user.company_id)

    # 상태 전이 검증
    if candidate.status != FactStatus.submitted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot approve: current status is '{candidate.status.value}'.",
        )

    # 3중 권한 검증 (3차: approval_scope)
    require_approval_scope(
        user=current_user,
        issue_group_code=candidate.issue_group_code,
        action=ActionType.approve,
        db=db,
    )

    # 상태 변경
    candidate.status = FactStatus.approved

    # KPIFact 생성 (Issue → Metric → KPI Fact 경로)
    _create_kpi_fact(db=db, candidate=candidate, approver_id=current_user.id)

    # 이중 로그 기록
    _write_approval_log(
        db=db,
        company_id=current_user.company_id,
        fact_candidate_id=candidate.id,
        action=ActionType.approve,
        actor_user_id=current_user.id,
        issue_group_code=candidate.issue_group_code,
    )
    _write_audit_log(
        db=db,
        company_id=current_user.company_id,
        event_type=AuditEventType.FACT_APPROVED,
        actor_id=current_user.id,
        target_id=candidate.id,
        detail=f"metric_id={candidate.metric_id}, kpi_fact created.",
    )

    db.commit()
    db.refresh(candidate)
    return candidate


def reject_fact(
    db: Session,
    fact_id: uuid.UUID,
    current_user: CurrentUser,
    comment: Optional[str] = None,
) -> FactCandidate:
    """
    submitted → rejected

    권한: approve 권한이 있는 사용자 또는 tenant_admin (거부도 approve 권한 필요)
    """
    candidate = _get_candidate_or_404(db, fact_id, current_user.company_id)

    # 상태 전이 검증
    if candidate.status != FactStatus.submitted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot reject: current status is '{candidate.status.value}'.",
        )

    # 3중 권한 검증 (3차: approval_scope)
    require_approval_scope(
        user=current_user,
        issue_group_code=candidate.issue_group_code,
        action=ActionType.approve,   # reject도 approve 권한으로 처리
        db=db,
    )

    # 상태 변경
    candidate.status = FactStatus.rejected

    # 이중 로그 기록
    _write_approval_log(
        db=db,
        company_id=current_user.company_id,
        fact_candidate_id=candidate.id,
        action=ActionType.reject,
        actor_user_id=current_user.id,
        issue_group_code=candidate.issue_group_code,
        comment=comment,
    )
    _write_audit_log(
        db=db,
        company_id=current_user.company_id,
        event_type=AuditEventType.FACT_REJECTED,
        actor_id=current_user.id,
        target_id=candidate.id,
        detail=comment or f"metric_id={candidate.metric_id} rejected.",
    )

    db.commit()
    db.refresh(candidate)
    return candidate
