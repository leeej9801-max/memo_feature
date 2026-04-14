"""
memo_router.py - 멀티에이전트 Supervisor 연동 메모 라우터
"""

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
                "name": current_user.name or "Unknown",
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
        
        payload = output.get("payload", {})
        if not payload:
            raise Exception("Agent payload missing")
            
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
            results.append({
                "id": str(l.id),
                "actor_name": user.name if user else "Unknown",
                "actor_role": user.role_code.value if user else "Unknown",
                "action": l.action.value,
                "comment": l.comment,
                "meta_data": l.meta_data,
                "logged_at": l.logged_at.isoformat()
            })
            
        return {"memos": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
