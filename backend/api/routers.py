"""
api/routers.py - 전체 API 라우터 등록

STEP1: POST /input/csv
STEP2: POST /fact/{id}/submit
        POST /fact/{id}/approve
        POST /fact/{id}/reject
STEP3: POST /report/generate

부가:
  POST /setup/seed     - 테스트 시나리오용 초기 데이터 생성
  POST /evidence/add   - 증빙 수동 등록 (테스트용)
  GET  /fact/{id}      - fact_candidate 상태 조회
  GET  /logs/audit     - audit_log 조회
  GET  /logs/approval  - approval_log 조회
"""

import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

import logging
import csv
import io
import traceback

logger = logging.getLogger(__name__)

from database import SessionLocal
from dependencies import get_db, get_current_user
from schemas import (
    CurrentUser, CSVRow, CSVUploadResponse,
    FactCandidateResponse, ApprovalActionResponse,
    RejectRequest, ReportGenerateRequest, ReportSectionDraftResponse,
    AuditLogResponse, ApprovalLogResponse,
    SeedRequest, SeedResponse,
)
from models import (
    Company, UserAccount, Department, ApprovalScope,
    FactCandidate, KPIFact, EvidenceChunk,
    AuditLog, ApprovalLog,
    RoleCode, ActionType, FactStatus,
)
from services.input_service    import process_csv_rows
from services.approval_service import submit_fact, approve_fact, reject_fact
from services.report_service   import generate_report_section


from api.auth_router import router as auth_router
from api.memo_router import router as memo_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(memo_router)


# ─────────────────────────────────────────────────────────
# STEP 1: CSV 입력
# ─────────────────────────────────────────────────────────

@router.post("/input/csv", response_model=CSVUploadResponse, tags=["STEP1 - Input"])
async def upload_csv(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    CSV 파일을 업로드하여 fact_candidate를 일괄 생성합니다.

    CSV 필수 컬럼: issue_group_code, metric_id, value, department, assignee
    """
    content = await file.read()
    decoded = content.decode("utf-8-sig")  # BOM 제거
    reader  = csv.DictReader(io.StringIO(decoded))

    rows: List[CSVRow] = []
    for line in reader:
        row = CSVRow(
            issue_group_code=line.get("issue_group_code", "").strip(),
            metric_id=line.get("metric_id", "").strip(),
            value=float(line["value"]) if line.get("value", "").strip() else None,
            value_text=line.get("value_text", "").strip() or None,
            department=line.get("department", "").strip(),
            assignee=line.get("assignee", "").strip(),
        )
        rows.append(row)

    if not rows:
        raise HTTPException(status_code=400, detail="CSV에 유효한 행이 없습니다.")

    created_ids = process_csv_rows(db=db, rows=rows, current_user=current_user)

    return CSVUploadResponse(
        message=f"{len(created_ids)}개의 fact_candidate가 생성되었습니다.",
        created_count=len(created_ids),
        fact_candidate_ids=created_ids,
    )


@router.post("/input/json", response_model=CSVUploadResponse, tags=["STEP1 - Input"])
def upload_json(
    rows: List[CSVRow],
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    JSON 형식으로 ESG 데이터를 직접 입력합니다. (프론트엔드 / 테스트용)
    """
    try:
        # 데모 편의상: 새로 로드할 때 테넌트의 모든 비즈니스 데이터를 초기화
        # 0) Enum 깨짐 방지: 잘못된 client_user를 data_entry로 강제 업데이트 (Raw SQL)
        from sqlalchemy import text
        db.execute(text("UPDATE user_account SET role_code = 'data_entry' WHERE role_code = 'client_user'"))
        
        db.query(ApprovalLog).filter(ApprovalLog.company_id == current_user.company_id).delete()
        db.query(KPIFact).filter(KPIFact.company_id == current_user.company_id).delete()
        db.query(FactCandidate).filter(FactCandidate.company_id == current_user.company_id).delete()
        db.query(AuditLog).filter(AuditLog.company_id == current_user.company_id).delete()
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Reset failed: {e}")

    created_ids = process_csv_rows(db=db, rows=rows, current_user=current_user)
    return CSVUploadResponse(
        message=f"{len(created_ids)}개의 fact_candidate가 생성되었습니다.",
        created_count=len(created_ids),
        fact_candidate_ids=created_ids,
    )


# ─────────────────────────────────────────────────────────
# STEP 2: 승인 워크플로우
# ─────────────────────────────────────────────────────────

@router.get("/fact/{fact_id}", response_model=FactCandidateResponse, tags=["STEP2 - Approval"])
def get_fact(
    fact_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """fact_candidate 상태 조회"""
    candidate = db.query(FactCandidate).filter(
        FactCandidate.id == fact_id,
        FactCandidate.company_id == current_user.company_id,
    ).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="FactCandidate not found.")
    return candidate


@router.patch("/fact/{fact_id}", response_model=FactCandidateResponse, tags=["STEP2 - Approval"])
def update_fact(
    fact_id: uuid.UUID,
    body: dict,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """fact_candidate 값 수정"""
    candidate = db.query(FactCandidate).filter(
        FactCandidate.id == fact_id,
        FactCandidate.company_id == current_user.company_id,
    ).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="FactCandidate not found.")
    
    if "value" in body:
        candidate.value = body["value"]
    if "value_text" in body:
        candidate.value_text = body["value_text"]
    if "assigned_user_id" in body:
        candidate.assigned_user_id = body["assigned_user_id"]
        
    db.commit()
    db.refresh(candidate)
    return candidate


@router.get("/facts", response_model=List[FactCandidateResponse], tags=["STEP2 - Approval"])
def list_facts(
    status: Optional[str] = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    company의 전체 fact_candidate 목록 조회. 
    각 지표별 comment_count를 포함하여 반환합니다.
    """
    try:
        # Subquery for comment counts
        comment_counts = db.query(
            ApprovalLog.fact_candidate_id,
            func.count(ApprovalLog.id).label("cnt")
        ).filter(
            ApprovalLog.action.in_([ActionType.comment, ActionType.request_changes]),
            ApprovalLog.is_acknowledged == False
        ).group_by(ApprovalLog.fact_candidate_id).subquery()

        query = db.query(
            FactCandidate,
            func.coalesce(comment_counts.c.cnt, 0).label("comment_count")
        ).outerjoin(
            comment_counts, FactCandidate.id == comment_counts.c.fact_candidate_id
        ).options(
            joinedload(FactCandidate.department),
            joinedload(FactCandidate.submitted_by_user),
            joinedload(FactCandidate.assigned_user)
        ).filter(
            FactCandidate.company_id == current_user.company_id
        ).order_by(FactCandidate.metric_id.asc(), FactCandidate.id.asc())

        if status:
            query = query.filter(FactCandidate.status == status)
        
        results = query.all()
        
        outputs = []
        for fact, count in results:
            fact.comment_count = count
            outputs.append(fact)
            
        return outputs
    except Exception as e:
        print(f"[ERROR] in list_facts: {e}")
        raise HTTPException(status_code=500, detail="Internal server error occurred while fetching facts.")


@router.post("/fact/{fact_id}/submit", response_model=ApprovalActionResponse, tags=["STEP2 - Approval"])
def submit(
    fact_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    [STEP2] draft → submitted 상태 전이.
    submit 권한이 있는 사용자만 가능.
    # 상태 변경 및 배정 자동화 (ESG 담당자/제출자 본인 배정)
    candidate.status = FactStatus.submitted
    candidate.assigned_user_id = current_user.id
    """
    candidate = submit_fact(db=db, fact_id=fact_id, current_user=current_user)
    return ApprovalActionResponse(
        fact_candidate_id=candidate.id,
        new_status=candidate.status,
        action=ActionType.submit,
        message="성공적으로 제출되었습니다.",
    )

@router.post("/memo/{memo_id}/acknowledge", tags=["STEP2 - Approval"])
def acknowledge_memo(
    memo_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """메모 확인 처리 (알림 숫자 감소)"""
    memo = db.query(ApprovalLog).filter(
        ApprovalLog.id == memo_id,
        ApprovalLog.company_id == current_user.company_id
    ).first()
    if not memo:
        raise HTTPException(status_code=404, detail="Memo not found")
        
    memo.is_acknowledged = True
    db.commit()
    return {"status": "ok", "message": "Memo acknowledged"}


@router.post("/fact/{fact_id}/approve", response_model=ApprovalActionResponse, tags=["STEP2 - Approval"])
def approve(
    fact_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    [STEP2] submitted → approved 상태 전이.
    approve 권한이 있는 사용자 또는 tenant_admin만 가능.
    승인 시 KPIFact 자동 생성.
    """
    candidate = approve_fact(db=db, fact_id=fact_id, current_user=current_user)
    return ApprovalActionResponse(
        fact_candidate_id=candidate.id,
        new_status=candidate.status,
        action=ActionType.approve,
        message="승인 완료. KPI Fact가 생성되었습니다.",
    )


@router.post("/fact/{fact_id}/reject", response_model=ApprovalActionResponse, tags=["STEP2 - Approval"])
def reject(
    fact_id: uuid.UUID,
    body: RejectRequest = RejectRequest(),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    [STEP2] submitted → rejected 상태 전이.
    approve 권한이 있는 사용자 또는 tenant_admin만 가능.
    """
    candidate = reject_fact(
        db=db,
        fact_id=fact_id,
        current_user=current_user,
        comment=body.comment,
    )
    return ApprovalActionResponse(
        fact_candidate_id=candidate.id,
        new_status=candidate.status,
        action=ActionType.reject,
        message="반려 처리되었습니다.",
    )


# ─────────────────────────────────────────────────────────
# STEP 3: 보고서 생성
# ─────────────────────────────────────────────────────────

@router.post("/report/generate", response_model=ReportSectionDraftResponse, tags=["STEP3 - Report"])
def generate_report(
    body: ReportGenerateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    [STEP3] 승인된 KPI Fact + Evidence 기반으로 보고서 섹션을 생성합니다.
    KPIFact 또는 Evidence 중 하나라도 없으면 생성 불가.
    """
    draft = generate_report_section(
        db=db,
        issue_group_code=body.issue_group_code,
        current_user=current_user,
    )
    return draft


# ─────────────────────────────────────────────────────────
# Evidence 등록 (테스트용)
# ─────────────────────────────────────────────────────────

@router.post("/evidence/add", tags=["Evidence"])
def add_evidence(
    kpi_fact_id: uuid.UUID,
    evidence_key: str,
    content: Optional[str] = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    KPIFact에 증빙 자료를 수동 등록합니다. (테스트 / MVP용)
    """
    kpi = db.query(KPIFact).filter(
        KPIFact.id == kpi_fact_id,
        KPIFact.company_id == current_user.company_id,
    ).first()
    if not kpi:
        raise HTTPException(status_code=404, detail="KPIFact not found.")

    evidence = EvidenceChunk(
        company_id=current_user.company_id,
        kpi_fact_id=kpi_fact_id,
        evidence_key=evidence_key,
        source_type="MANUAL",
        content=content,
    )
    db.add(evidence)
    db.commit()
    db.refresh(evidence)
    return {"id": str(evidence.id), "evidence_key": evidence.evidence_key}


# ─────────────────────────────────────────────────────────
# 로그 조회
# ─────────────────────────────────────────────────────────

@router.get("/logs/audit", response_model=List[AuditLogResponse], tags=["Logs"])
def get_audit_logs(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """시스템 이벤트 audit_log 조회 (company 격리)"""
    return db.query(AuditLog).filter(
        AuditLog.company_id == current_user.company_id
    ).order_by(AuditLog.logged_at.desc()).limit(100).all()


@router.get("/logs/approval", response_model=List[ApprovalLogResponse], tags=["Logs"])
def get_approval_logs(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """승인 흐름 approval_log 조회 (company 격리)"""
    return db.query(ApprovalLog).filter(
        ApprovalLog.company_id == current_user.company_id
    ).order_by(ApprovalLog.logged_at.desc()).limit(100).all()


# ─────────────────────────────────────────────────────────
# 테스트 시나리오용 Seed API
# ─────────────────────────────────────────────────────────

@router.post("/setup/seed", response_model=SeedResponse, tags=["Setup"])
def seed_test_data(body: SeedRequest, db: Session = Depends(get_db)):
    """
    테스트 시나리오용 초기 데이터를 생성합니다.

    생성 데이터:
      - Company 1개
      - Users: tenant_admin, climate_manager (환경팀), safety_manager (안전팀)
      - ApprovalScope: climate_manager → CLIMATE (submit/approve)
                       safety_manager  → SAFETY  (submit/approve)
    """
    # Company 생성
    company = Company(name=body.company_name)
    db.add(company)
    db.flush()

    # Users 생성
    admin = UserAccount(
        company_id=company.id,
        email="admin@esg.com",
        name="테넌트 관리자",
        role_code=RoleCode.tenant_admin,
    )
    climate_mgr = UserAccount(
        company_id=company.id,
        email="climate@esg.com",
        name="환경팀 담당자",
        role_code=RoleCode.dept_manager,
    )
    safety_mgr = UserAccount(
        company_id=company.id,
        email="safety@esg.com",
        name="안전팀 담당자",
        role_code=RoleCode.dept_manager,
    )
    db.add_all([admin, climate_mgr, safety_mgr])
    db.flush()

    # ApprovalScope 생성
    for action in [ActionType.submit, ActionType.approve]:
        db.add(ApprovalScope(
            user_id=climate_mgr.id,
            scope_value="CLIMATE",
            action_type=action,
        ))
        db.add(ApprovalScope(
            user_id=safety_mgr.id,
            scope_value="SAFETY",
            action_type=action,
        ))

    db.commit()

    return SeedResponse(
        company_id=company.id,
        users={
            "tenant_admin":    {"id": str(admin.id),       "email": admin.email},
            "climate_manager": {"id": str(climate_mgr.id), "email": climate_mgr.email},
            "safety_manager":  {"id": str(safety_mgr.id),  "email": safety_mgr.email},
        },
        message="테스트 시드 데이터가 생성되었습니다.",
    )
