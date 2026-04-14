"""
input_service.py - STEP 1: CSV 입력 처리

흐름:
  CSV 파싱
  → user_account 매핑 (assignee 이메일)
  → department 자동 생성 (없으면)
  → approval_scope 자동 생성 (샘플용)
  → fact_candidate 생성 (status=draft)
  → audit_log 기록 (CSV_IMPORTED)

R&R 매핑 (하드코딩):
  환경팀  → CLIMATE
  안전팀  → SAFETY
  인사팀  → WORKFORCE
  경영지원 → GOVERNANCE
"""

import uuid
from typing import List
from sqlalchemy.orm import Session

from models import (
    UserAccount, Department, ApprovalScope,
    FactCandidate, AuditLog,
    ActionType, FactStatus, AuditEventType,
)
from schemas import CSVRow, CurrentUser


# 부서명 → issue_group_code 매핑 (하드코딩 R&R)
DEPT_ISSUE_MAP = {
    "환경팀":  "CLIMATE",
    "안전팀":  "SAFETY",
    "인사팀":  "HR",
    "경영지원": "GOVERNANCE",
}


def _get_or_create_department(
    db: Session,
    company_id: uuid.UUID,
    dept_name: str,
    issue_group_code: str,
) -> Department:
    """부서가 없으면 자동 생성."""
    dept = db.query(Department).filter(
        Department.company_id == company_id,
        Department.name == dept_name,
    ).first()

    if not dept:
        dept = Department(
            company_id=company_id,
            name=dept_name,
            issue_group_code=issue_group_code,
        )
        db.add(dept)
        db.flush()

    return dept


def _ensure_approval_scope(
    db: Session,
    user_id: uuid.UUID,
    issue_group_code: str,
) -> None:
    """
    샘플용: CSV 입력 담당자에게 해당 issue_group의 submit 권한 자동 부여.
    실제 운영에서는 별도 관리 UI에서 부여.
    """
    for action in [ActionType.submit, ActionType.approve]:
        exists = db.query(ApprovalScope).filter(
            ApprovalScope.user_id     == user_id,
            ApprovalScope.scope_value == issue_group_code,
            ApprovalScope.action_type == action,
        ).first()

        if not exists:
            scope = ApprovalScope(
                user_id=user_id,
                scope_value=issue_group_code,
                action_type=action,
            )
            db.add(scope)


def _write_audit_log(
    db: Session,
    company_id: uuid.UUID,
    actor_id: uuid.UUID,
    event_type: AuditEventType,
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


def process_csv_rows(
    db: Session,
    rows: List[CSVRow],
    current_user: CurrentUser,
) -> List[uuid.UUID]:
    """
    CSV 행 목록을 파싱하여 fact_candidate 레코드를 생성.

    Args:
        db           : DB 세션
        rows         : 파싱된 CSV 행 리스트
        current_user : 요청 사용자 (company_id 격리 기준)

    Returns:
        생성된 fact_candidate UUID 목록
    """
    created_ids: List[uuid.UUID] = []

    for row in rows:
        # 1) issue_group_code 결정 (CSV 직접 or 부서명 매핑)
        issue_group_code = row.issue_group_code or DEPT_ISSUE_MAP.get(row.department)
        if not issue_group_code:
            raise ValueError(
                f"부서 '{row.department}'에 해당하는 issue_group_code를 찾을 수 없습니다."
            )

        # 2) 담당자 user_account 매핑
        assignee_user = db.query(UserAccount).filter(
            UserAccount.email      == row.assignee,
            UserAccount.company_id == current_user.company_id,
            UserAccount.is_active  == True,
        ).first()

        assignee_user_id = assignee_user.id if assignee_user else None

        # 3) department 자동 생성
        dept = None
        if row.department:
            dept = _get_or_create_department(
                db=db,
                company_id=current_user.company_id,
                dept_name=row.department,
                issue_group_code=issue_group_code,
            )

        # 4) approval_scope 자동 생성 (샘플용)
        if assignee_user_id:
            _ensure_approval_scope(
                db=db,
                user_id=assignee_user_id,
                issue_group_code=issue_group_code,
            )

        # 5) fact_candidate 생성
        candidate = FactCandidate(
            company_id=current_user.company_id,
            issue_group_code=issue_group_code,
            metric_id=row.metric_id,
            value_text=row.value_text,
            department_id=dept.id if dept else None,
            assigned_user_id=assignee_user_id,
            submitted_by=current_user.id,
            status=FactStatus.draft,
        )
        db.add(candidate)
        db.flush()   # id 확보

        created_ids.append(candidate.id)

    # 6) audit_log 기록
    _write_audit_log(
        db=db,
        company_id=current_user.company_id,
        actor_id=current_user.id,
        event_type=AuditEventType.CSV_IMPORTED,
        detail=f"CSV import: {len(created_ids)} fact_candidates created.",
    )

    db.commit()
    return created_ids
