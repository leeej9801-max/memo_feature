"""
report_service.py - STEP 3: AI 기반 보고서 Draft 생성

핵심 규칙 (절대 위반 금지):
  1. KPI Fact가 존재해야 함
  2. Evidence (EvidenceChunk)가 존재해야 함
  3. 둘 다 없으면 생성 금지
  4. NarrativeReference에 kpi_fact_id 또는 evidence_id 반드시 포함
"""

import uuid
from typing import List
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from models import (
    KPIFact, EvidenceChunk,
    ReportSectionDraft, NarrativeReference,
    AuditLog, AuditEventType,
)
from schemas import CurrentUser


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


def _generate_text(
    issue_group_code: str,
    kpi_facts: List[KPIFact],
    evidence_chunks: List[EvidenceChunk],
) -> str:
    """
    MVP: 실제 LLM 호출 대신 구조화된 목업 텍스트 생성.
    실제 프로덕션에서는 OpenAI/Claude API 호출로 교체.
    """
    kpi_lines = []
    for kpi in kpi_facts:
        val = kpi.value if kpi.value is not None else kpi.value_text
        kpi_lines.append(f"  - [{kpi.metric_id}] 측정값: {val}")

    evidence_lines = []
    for ev in evidence_chunks:
        evidence_lines.append(f"  - 증빙키: {ev.evidence_key} (출처: {ev.source_type})")

    text = f"""[ESG 보고서 섹션 - {issue_group_code}]

▶ KPI 데이터 요약
{chr(10).join(kpi_lines) or "  (데이터 없음)"}

▶ 증빙 자료 현황
{chr(10).join(evidence_lines) or "  (증빙 없음)"}

본 섹션은 승인된 KPI Fact 및 연결된 증빙 자료를 기반으로 자동 생성되었습니다.
총 {len(kpi_facts)}개의 KPI Fact와 {len(evidence_chunks)}개의 증빙 자료가 활용되었습니다.
"""
    return text


def generate_report_section(
    db: Session,
    issue_group_code: str,
    current_user: CurrentUser,
) -> ReportSectionDraft:
    """
    STEP 3: issue_group_code에 해당하는 보고서 섹션 생성.

    필수 조건:
      - 해당 company의 approved KPIFact 존재
      - 해당 KPIFact에 연결된 EvidenceChunk 존재
      - 위 조건 중 하나라도 불충족 시 400 오류
    """
    # 1) 승인된 KPIFact 조회
    kpi_facts: List[KPIFact] = db.query(KPIFact).filter(
        KPIFact.company_id == current_user.company_id,
        KPIFact.issue_group_code == issue_group_code,
    ).all()

    if not kpi_facts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"[생성 불가] issue_group '{issue_group_code}'에 대한 "
                "승인된 KPI Fact가 존재하지 않습니다. "
                "먼저 데이터를 입력하고 승인을 완료해주세요."
            ),
        )

    # 2) Evidence 조회 (연결된 KPIFact들의 모든 증빙)
    kpi_fact_ids = [kpi.id for kpi in kpi_facts]
    evidence_chunks: List[EvidenceChunk] = db.query(EvidenceChunk).filter(
        EvidenceChunk.company_id == current_user.company_id,
        EvidenceChunk.kpi_fact_id.in_(kpi_fact_ids),
    ).all()

    if not evidence_chunks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"[생성 불가] issue_group '{issue_group_code}'에 대한 "
                "증빙 자료(Evidence)가 존재하지 않습니다. "
                "KPI Fact에 증빙을 먼저 등록해주세요."
            ),
        )

    # 3) 텍스트 생성
    generated_text = _generate_text(issue_group_code, kpi_facts, evidence_chunks)

    # 4) ReportSectionDraft 저장
    draft = ReportSectionDraft(
        company_id=current_user.company_id,
        issue_group_code=issue_group_code,
        generated_text=generated_text,
        status="draft",
    )
    db.add(draft)
    db.flush()  # id 확보

    # 5) NarrativeReference 생성 (kpi_fact_id + evidence_id 연결)
    for kpi in kpi_facts:
        ref = NarrativeReference(
            report_section_draft_id=draft.id,
            kpi_fact_id=kpi.id,
            evidence_id=None,
        )
        db.add(ref)

    for ev in evidence_chunks:
        ref = NarrativeReference(
            report_section_draft_id=draft.id,
            kpi_fact_id=None,
            evidence_id=ev.id,
        )
        db.add(ref)

    # 6) AuditLog 기록
    _write_audit_log(
        db=db,
        company_id=current_user.company_id,
        event_type=AuditEventType.REPORT_GENERATED,
        actor_id=current_user.id,
        target_id=draft.id,
        detail=(
            f"issue_group={issue_group_code}, "
            f"kpi_facts={len(kpi_facts)}, "
            f"evidences={len(evidence_chunks)}"
        ),
    )

    db.commit()
    db.refresh(draft)
    return draft
