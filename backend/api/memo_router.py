"""
memo_router.py - 멀티에이전트 Supervisor 연동 메모 라우터
"""

import logging
from datetime import datetime
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import SessionLocal
from dependencies import get_db, get_current_user
from schemas import CurrentUser
from models import ApprovalLog, UserAccount, RoleCode, Company, FactCandidate
from services.memo_service import save_memo_entry
from agents.step2_supervisor import get_memo_graph

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/memos", tags=["Memos"])

class MemoRequest(BaseModel):
    fact_candidate_id: str
    message: str

class MemoResponse(BaseModel):
    id: str
    action: str
    actor_user_id: str
    issue_group_code: str
    comment: str
    meta_data: Optional[dict] = None
    logged_at: str

@router.post("", response_model=MemoResponse)
async def create_memo(
    body: MemoRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        fact_id = uuid.UUID(body.fact_candidate_id)
        fact = db.query(FactCandidate).filter(FactCandidate.id == fact_id).first()
        if not fact:
            raise HTTPException(status_code=404, detail="Fact not found")

        # Context for Supervisor Agent
        state = {
            "messages": [{"role": "user", "content": body.message}],
            "context": {
                "user_id": str(current_user.id),
                "name": getattr(current_user, "name", "Unknown") or "Unknown",
                "email": current_user.email,
                "role_code": current_user.role_code.value,
                "company_id": str(current_user.company_id),
                "row_id": str(fact.id),
                "metric_id": fact.metric_id,
                "issue_group_code": fact.issue_group_code,
                "department_id": str(fact.department_id) if fact.department_id else None
            }
        }

        # Run Supervisor Graph
        graph = get_memo_graph()
        output = graph.invoke(state)
        
        # Check if rejected by supervisor
        if output.get("memo_type") == "rejected":
            return MemoResponse(
                id="none",
                action="reject",
                actor_user_id=str(current_user.id),
                issue_group_code=fact.issue_group_code,
                comment="[Supervisor] 이 메시지는 지표와 관련이 없어 거절되었습니다. 관련 있는 내용을 입력해주세요.",
                meta_data={"rejected": True},
                logged_at=datetime.utcnow().isoformat()
            )

        payload = output.get("payload")
        if not payload:
            logger.error(f"Agent payload missing. Output: {output}")
            raise HTTPException(status_code=500, detail="Agent processing failed to produce a valid payload.")
            
        # Store using Service Layer
        memo = save_memo_entry(db, fact_id, current_user, payload)
        
        return MemoResponse(
            id=str(memo.id),
            action=memo.action.value,
            actor_user_id=str(memo.actor_user_id),
            issue_group_code=memo.issue_group_code,
            comment=memo.comment,
            meta_data=memo.meta_data,
            logged_at=memo.logged_at.isoformat()
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in create_memo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{memo_id}/acknowledge")
def acknowledge_memo(
    memo_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """메모 확인 처리 (알림 숫자 감소)"""
    try:
        mid = uuid.UUID(memo_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid memo_id")
    
    memo = db.query(ApprovalLog).filter(
        ApprovalLog.id == mid,
        ApprovalLog.company_id == current_user.company_id
    ).first()
    if not memo:
        raise HTTPException(status_code=404, detail="Memo not found")
    
    memo.is_acknowledged = True
    db.commit()
    return {"status": "ok", "message": "Memo acknowledged"}

@router.get("/thread/{fact_id}")
async def get_memo_thread(
    fact_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    메모 조회 로직
    client_user: 본인 작성 + tenant_admin 작성 메모
    tenant_admin: 모두 보기
    """
    try:
        fid = uuid.UUID(fact_id)
        query = db.query(ApprovalLog).join(UserAccount, ApprovalLog.actor_user_id == UserAccount.id).filter(
            ApprovalLog.fact_candidate_id == fid,
            ApprovalLog.company_id == current_user.company_id,
            ApprovalLog.action.in_(["comment", "request_changes"])
        )

        if current_user.role_code != RoleCode.tenant_admin:
            # tenant_admin의 ID 추출 (다수일 경우 모두)
            admin_ids = [u.id for u in db.query(UserAccount).filter(UserAccount.company_id == current_user.company_id, UserAccount.role_code == RoleCode.tenant_admin).all()]
            query = query.filter(ApprovalLog.actor_user_id.in_(admin_ids + [current_user.id]))
            
        logs = query.order_by(ApprovalLog.logged_at.asc()).all()
        
        results = []
        for l in logs:
            user = db.query(UserAccount).filter(UserAccount.id == l.actor_user_id).first()
            
            # 부서 정보 추론: 1차(tenant_admin 여부), 2차(초대 이력/Fact 배정)
            dept_name = "미지정 부서"
            if user.role_code == RoleCode.tenant_admin:
                dept_name = "ESG 관리자"
            else:
                # 사용자가 배정된 지표 중 하나의 부서를 가져옴 (샘플 로직)
                f_sample = db.query(FactCandidate).filter(FactCandidate.assigned_user_id == user.id).first()
                if f_sample and f_sample.department:
                    dept_name = f_sample.department.name

            results.append({
                "id": str(l.id),
                "actor_id": str(user.id),
                "actor_name": user.name if user else "Unknown",
                "actor_role": user.role_code.value if user else "Unknown",
                "actor_department": dept_name,
                "action": l.action.value,
                "comment": l.comment,
                "meta_data": l.meta_data,
                "logged_at": l.logged_at.isoformat()
            })
            
        return {"memos": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
