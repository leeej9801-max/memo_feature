"""
dependencies.py - FastAPI Depends 인증 & 권한 검증

3중 권한 검증:
  1. company_id   → 테넌트 격리
  2. role_code    → 역할 기반 접근
  3. approval_scope → issue_group 기반 세밀 권한
"""

from typing import Generator
from uuid import UUID
from fastapi import Request, HTTPException, Depends, status
from sqlalchemy.orm import Session

from database import SessionLocal
from models import UserAccount, ApprovalScope, ActionType, RoleCode
from schemas import CurrentUser


# ─────────────────────────────────────────────────────────
# DB Session
# ─────────────────────────────────────────────────────────

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> CurrentUser:
    """
    1차 검증: Session 기반 사용자 인가
    """
    user_id_str = request.session.get("user_id")
    company_id_str = request.session.get("company_id")

    if not user_id_str or not company_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session not found. Please login via Google OAuth.",
        )

    try:
        user_uuid    = UUID(user_id_str)
        company_uuid = UUID(company_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid UUID format in session.",
        )

    # 1차: DB에서 사용자 조회
    user = db.query(UserAccount).filter(
        UserAccount.id == user_uuid,
        UserAccount.is_active == True,
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )

    # 2차: company_id 일치 확인 (테넌트 격리)
    if user.company_id != company_uuid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company ID mismatch. Access denied.",
        )

    return CurrentUser(
        id=user.id,
        company_id=user.company_id,
        role_code=user.role_code,
        email=user.email,
        name=user.name
    )


# ─────────────────────────────────────────────────────────
# 3차 권한: approval_scope 검증
#
# 설계 원칙 (코드보다 우선):
#   tenant_admin → 모든 액션 허용 (scope 불필요)
#   그 외        → approval_scope 테이블에 해당 (user, issue_group, action) 존재해야 함
# ─────────────────────────────────────────────────────────

def verify_approval_scope(
    user: CurrentUser,
    issue_group_code: str,
    action: ActionType,
    db: Session,
) -> bool:
    """
    3중 권한 체계의 최종 검증 함수.

    Returns:
        True  → 권한 있음
        False → 권한 없음 (호출처에서 403 반환)
    """
    # tenant_admin은 모든 scope 통과
    if user.role_code == RoleCode.tenant_admin:
        return True

    # approval_scope 테이블 검증
    scope_exists = db.query(ApprovalScope).filter(
        ApprovalScope.user_id     == user.id,
        ApprovalScope.scope_value == issue_group_code,
        ApprovalScope.action_type == action,
    ).first()

    return scope_exists is not None


def require_approval_scope(
    user: CurrentUser,
    issue_group_code: str,
    action: ActionType,
    db: Session,
) -> None:
    """verify_approval_scope을 호출하고, 실패 시 403 예외 발생."""
    if not verify_approval_scope(user, issue_group_code, action, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"User '{user.email}' does not have '{action.value}' permission "
                f"for issue group '{issue_group_code}'."
            ),
        )
