import uuid
from sqlalchemy.orm import Session
from models import ApprovalLog, ActionType, AuditLog, AuditEventType
from schemas import CurrentUser

def save_memo_entry(db: Session, target_id: uuid.UUID, user: CurrentUser, payload: dict) -> ApprovalLog:
    """
    Supervisor Multi-Agent 로 나온 payload 구조를 기반으로 DB에 저장
    """
    memo_type = payload.get("memo_type", "comment")
    # request_changes 의도면 action을 request_changes로, 아니면 comment로 저장
    action = ActionType.request_changes if memo_type == "correction_request" else ActionType.comment
    
    # ApprovalLog 저장
    memo = ApprovalLog(
        company_id=user.company_id,
        fact_candidate_id=target_id,
        action=action,
        actor_user_id=user.id,
        issue_group_code=payload.get("issue_group_code", "UNKNOWN"),
        comment=payload.get("refined_message", ""),
        meta_data=payload
    )
    db.add(memo)
    
    # AuditLog 저장 (MEMO_CREATED)
    audit = AuditLog(
        company_id=user.company_id,
        event_type=AuditEventType.MEMO_CREATED,
        actor_id=user.id,
        target_id=target_id,
        detail=f"Memo ({memo_type}) added to fact {target_id}"
    )
    db.add(audit)
    
    db.commit()
    db.refresh(memo)
    return memo
