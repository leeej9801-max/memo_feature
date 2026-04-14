# Antigravity 수정 지시서 v2  
**대상 저장소:** `leeej9801-max/memo_feature`  
**목적:** 기존 구현 방향을 유지하되, 현재 UI/워크플로우를 **우리 원래 의도에 맞게 수정**한다.  
**중요:** 이번 수정은 기존 내용을 전부 버리는 것이 아니라, **이미 구현된 백엔드 골격은 최대한 살리고 프론트 구조와 메모/로그/권한 흐름을 재정렬**하는 것이다.

---

## 0. 이번 수정의 핵심 요약

현재 구현은 `설정 / 입력 / 승인 / 보고서 / 로그`가 서로 분리된 데모형 구조다.  
우리가 원하는 것은 아래 구조다.

- 메인 중심 화면은 **데이터 입력/협업 화면 1개**
- 기본은 **2열**
  - 좌측: 지표 테이블
  - 중앙: 선택된 지표 상세/입력/증빙/상태
- 필요할 때만 **오른쪽 3열 drawer** 열림
  - 메모 추가
  - 메모 보기
- 메모 3열 내부는 **상단/하단 분리**
  - 상단: 메모 저장 리스트
  - 하단: 메모 작성 영역
- 메모는 평소엔 안 보임
- 지표 우클릭 또는 액션 메뉴에서 `메모 추가`, `메모 보기`를 눌렀을 때만 오른쪽 3열이 열린다
- 지표 row마다 **증빙자료 업로드 열/버튼**이 있어야 한다
- 로그는 독립 페이지가 아니라 **해당 지표 컨텍스트 내부에서 보이는 승인/메모 이력**으로 처리한다
- 보고서 생성은 이번 테스트 범위에서 제외
- 멀티 에이전트는 **Supervisor 구조**로 메모 기능에 붙인다

---

## 1. 절대 유지할 설계 원칙

다음은 수정 후에도 반드시 유지해야 한다.

1. `company_id` 격리 유지
2. 역할은 `tenant_admin`, `client_user` 2개 유지
3. 인가는 반드시 `company_id + role_code + approval_scope(issue_group, action_type)` 3중 검증
4. `approval_log` 와 `audit_log` 분리 유지
5. 메모는 자유 채팅이 아니라 **특정 지표/행/팩트에 종속된 협업 스레드**
6. KPI는 `Issue -> Metric -> KPI Fact` 경로 유지
7. Evidence 없는 보고서 생성 금지 원칙 유지
8. `step1 / step2 / step3` 수업 코드 기반으로 확장 가능해야 함

참고 기준 문서:
- 공통코드/로그인/보안/로그 설계
- 통합 ERD v3
- memo 멀티에이전트 테스트 스펙 문서

---

## 2. 로그인/권한 구조 수정

### 현재 문제
- 사용자가 환경설정 페이지에서 직접 역할을 선택하는 방식은 실제 의도와 맞지 않음
- role 선택형 테스트 UI는 개발 편의상 가능하지만, 메인 사용자 흐름에 노출되면 안 됨
- reset/logout이 없어 테스트 세션을 다시 잡기 불편함

### 수정 목표
실제 로그인은 **Google 소셜 로그인 + 초대 기반 권한 부여**로 간다.

### 기준
- `leeej9801@gmail.com` 를 최초 `tenant_admin` 으로 seed
- 이 계정은 ESG 실무 담당자
- 다른 사용자는 `tenant_admin` 이 초대해야만 가입/활성화 가능
- 사용자는 자기 role을 직접 선택하면 안 됨
- role/부서/회사 정보는 로그인 세션과 invite 정보로 결정됨

### 구현 요구
1. `SetupPage`의 공개 role 선택 UI 제거
2. Google 소셜 로그인 버튼 추가
3. 초기 `tenant_admin` seed 계정:
   - `leeej9801@gmail.com`
4. 초대 플로우:
   - tenant_admin 이 담당자 이메일 입력
   - issue_group 또는 담당 지표 범위 지정
   - invite 생성
   - 초대받은 이메일로 로그인 시 `client_user` 활성화
5. 로그아웃 / 세션 초기화 버튼 추가
6. 테스트 편의상 mock switch가 필요하다면:
   - 개발자 전용 숨김 패널로만 유지
   - 일반 UI 메뉴에서는 제거

---

## 3. 페이지별 정리: 살릴 것 / 버릴 것 / 바로 수정할 것

---

## 3-1. SetupPage

### 살릴 것
- 시드 생성/초기화 개념
- 개발용 테스트 데이터 부팅 기능

### 버릴 것
- 사용자 role 직접 선택 UI
- tenant_admin / 환경팀 / 안전팀 카드 클릭으로 세션 전환하는 메인 UX

### 바로 수정할 것
- Google 로그인 버튼
- `leeej9801@gmail.com` tenant_admin seed
- logout/reset session 버튼
- 초대 관리 UI 일부를 SetupPage가 아니라 tenant_admin 메인 화면으로 이동

### 최종 방향
`SetupPage`는 일반 운영 화면이 아니라 **개발용 bootstrap / 숨김 관리용 패널** 수준으로 축소

---

## 3-2. InputPage (가장 중요)

### 현재 문제
- 사용자가 행을 직접 추가하는 구조
- metric_id만 보여서 지표 의미 파악이 어려움
- assignee 이메일을 직접 입력하는 구조가 실제 권한 흐름과 안 맞음
- CSV 업로드가 메인 기능처럼 분리되어 있음
- 증빙 업로드가 row 단위로 붙어 있지 않음
- 메모 기능과 통합되지 않음

### 우리가 원하는 방향
InputPage가 실제 메인 화면이 되어야 한다.

### 최종 구조
기본은 **2열**
- **1열(좌측)**: 지표 테이블
- **2열(중앙)**: 선택된 지표 상세

필요할 때만 **3열(우측 drawer)** 오픈
- 메모 추가
- 메모 보기

### 지표 테이블에 반드시 포함할 컬럼
- issue_group
- metric_id
- metric label 또는 checklist_question 또는 data_item_name
- 담당부서
- 담당자
- 현재 상태
- 입력값
- 증빙 업로드 버튼/상태
- 메모 존재 여부 표시

### 중요
metric_id만 단독 표시 금지.  
사람이 바로 어떤 지표인지 이해할 수 있도록 **설명성 필드**를 같이 붙일 것.

### 역할별 동작
#### tenant_admin
- issue_group 기준 담당자 지정
- 담당자 초대 이메일 입력
- 필요 시 본인도 직접 입력 가능
- 승인/반려 가능
- 전체 메모 조회 가능

#### client_user
- 본인에게 배정된 지표만 입력 가능
- 증빙자료 업로드 가능
- 제출 가능
- 해당 지표의 자기 메모 + ESG 담당자 메모만 조회 가능

### 증빙자료 업로드 UI 요구
각 지표 row마다 반드시 아래 중 하나가 있어야 한다.
- `증빙 업로드` 버튼
- 업로드 완료 상태 배지
- 업로드된 파일 미리보기 버튼(실제 파일 연결은 mock 가능)

즉 증빙은 따로 페이지가 아니라 **지표 row 단위 액션**이어야 한다.

### CSV 업로드 처리
- 메인 탭 기능처럼 크게 두지 말 것
- bulk import / seed 용 보조 기능으로 축소
- 메인 UX는 “사전 정의된 지표 표” 중심

---

## 3-3. ApprovalPage

### 현재 문제
- metric_id만으로 식별이 어려움
- 일반 사용자도 승인 페이지를 보는 흐름처럼 느껴짐
- 증빙 보기 버튼/미리보기 없음
- 메모/반려사유와 분리되어 있음

### 살릴 것
- 상태 전이 로직
- submit / approve / reject 처리
- 상태별 목록 필터 개념

### 버릴 것
- metric_id 위주의 빈약한 표
- 입력/승인/이력을 메모/증빙과 분리해 보는 흐름

### 바로 수정할 것
- tenant_admin 전용 화면으로 제한
- 표 컬럼에 아래 추가:
  - metric label
  - checklist_question 또는 설명
  - 담당자
  - 부서
  - 증빙 보기 버튼
- 반려 시 메모 스레드와 연결된 사유 표시
- 장기적으로는 ApprovalPage를 별도 페이지로 유지하기보다 InputPage 안의 tenant_admin 모드/탭으로 흡수 가능하게 설계

---

## 3-4. LogsPage

### 현재 문제
- 로그가 독립 페이지로 빠져 있음
- 지금 테스트 목표와 맞지 않음
- 지표 컨텍스트 기반 협업 흐름과 분리됨

### 결론
**LogsPage는 제거 방향**

### 대신 어떻게 할 것인가
- 메모/승인/반려 이력은 특정 지표를 클릭했을 때 컨텍스트 내부에서 보여준다
- 즉 로그는 페이지가 아니라 **지표 종속 이력 패널**
- 오른쪽 3열 메모 drawer 상단 리스트에서 과거 comment/request_changes/reject reason 을 함께 보여줄 수 있음

---

## 3-5. ReportPage

### 결론
이번 테스트 범위에서는 제거.

### 이유
이번 테스트 목적은:
- 지표 기반 협업 메모
- 입력/증빙/승인 흐름
- Supervisor 멀티에이전트 실험

이지, 보고서 생성 테스트가 아님.

### 처리
- 백엔드에 skeleton 이 있어도 되지만
- 프론트 메뉴에서는 제거

---

## 4. 메모 기능 UI 수정 (중요)

### 기존보다 더 정확한 목표
메모 기능은 오른쪽 3열 전체가 하나의 메모 페이지처럼 보이면 안 된다.  
**특정 지표에서만 열리는 컨텍스트 drawer**여야 한다.

### 열리는 방식
평소에는 3열이 없다.  
특정 지표 row에서 아래 중 하나를 수행할 때 열린다.

- 우클릭 → 옵션박스 → `메모 추가`
- 우클릭 → 옵션박스 → `메모 보기`
- 또는 메모 표시가 있는 셀 클릭 → `메모 보기`

### 3열 구조
오른쪽 3열은 반드시 **상단/하단 분리**

#### 상단
**메모 리스트**
- 시간순/스레드 기준 목록
- 누가 남겼는지
- memo_type
- 최근 메모 미리보기
- click 시 상세 확인 가능

#### 하단
**메모 작성 영역**
- 프롬프트 입력창
- 자동 라벨 표시
- 에이전트 보조 버튼
- 등록 버튼

### 자동 라벨
지표를 선택하면 입력창 상단에 자동으로 컨텍스트 라벨 표시

예:
- `[E1-01]`
- `[CLIMATE]`
- `[환경팀]`

사용자는 프롬프트 안에 metric_id를 다시 적지 않아도 됨

### 메모 조회 권한
#### client_user
조회 가능한 메모:
- 본인이 작성한 메모
- ESG 담당자(tenant_admin)가 작성한 메모

즉, 같은 지표라도 다른 일반 담당자의 메모는 보지 못하게 처리

#### tenant_admin
- 모든 메모 조회 가능

### 메모 저장 방식
메모는 별도 자유 채팅 테이블이 아니라 `approval_log` 확장 기반으로 저장

기본값:
- `action = 'comment'`

`meta` 예시:
```json
{
  "thread_id": "thread-row-1",
  "memo_type": "evidence_request",
  "raw_prompt": "이거 어떤 증빙 올려야 하나요?",
  "refined_message": "해당 지표에 필요한 증빙 자료 유형을 확인 부탁드립니다.",
  "row_id": "row-1",
  "metric_id": "E1-01",
  "issue_id": "CLIMATE",
  "issue_group_code": "CLIMATE",
  "agent_trace": ["supervisor", "context_agent", "intent_agent", "tone_agent", "persist_agent"]
}
```

### 세션 기반 자동 저장
사용자가 프롬프트에 따로 입력하지 않아도 아래 값은 자동 저장
- actor_user_id
- actor_role_code
- company_id
- department_id
- created_at

---

## 5. 증빙자료 업로드 기능 추가

현재 UI에서 빠져 있는 핵심 요소다.

### 반드시 추가할 것
각 지표 row마다:
- `증빙 업로드` 버튼
- 업로드 완료 여부 배지
- `증빙 보기` 또는 `미리보기` 버튼

### tenant_admin / client_user 차이
#### client_user
- 본인 배정 지표의 증빙 업로드 가능

#### tenant_admin
- 모든 지표의 증빙 조회 가능
- 필요 시 본인도 업로드 가능

### 테스트 단계 처리
실제 파일 처리까지 완성하지 못해도 괜찮다.
우선은 아래 수준까지는 구현
- 업로드 버튼 UI
- 업로드 완료 mock 상태
- 미리보기 drawer 또는 modal
- 향후 S3 presigned upload/download 붙일 수 있게 구조 분리

---

## 6. 멀티 에이전트 구조 추가 (빠지면 안 됨)

현재 저장소 구현은 백엔드 서비스 구조는 있지만, 메모 기능에 멀티 에이전트 구조가 실질적으로 붙어 있지 않다.  
이번 테스트 목표의 핵심은 **Supervisor 기반 멀티에이전트**다.

### 실험 1 목표
AI는 일단 아래 역할만 맡는다.

1. 사용자 프롬프트 의도 분류
2. 문장 정리
3. DB 저장용 payload 구조화

최종 권한 판단, 저장, 상태 변경은 일반 service layer가 담당한다.

---

## 6-1. step1 / step2 / step3 기준 유지

### step1
linear 2-agent
- intent_agent
- tone_agent

### step2
supervisor architecture
- supervisor
- context_agent
- intent_agent
- tone_agent
- persist_agent

### step3
swarm / handoff 확장 가능 구조
- summary_agent
- routing_agent
등 추가 가능하게 폴더/모듈 구조 설계

---

## 6-2. 권장 백엔드 폴더 구조

```text
backend/
  agents/
    step1_linear.py
    step2_supervisor.py
    step3_swarm.py
    nodes/
      supervisor_node.py
      context_node.py
      intent_node.py
      tone_node.py
      persist_node.py
      summary_node.py
    tools/
      fetch_row_context.py
      fetch_thread_history.py
      build_memo_payload.py
      save_memo.py
```

---

## 6-3. Supervisor 흐름

```text
메모 생성 요청
-> supervisor
-> context_agent
-> intent_agent
-> tone_agent
-> persist_agent
-> memo_service.create_memo_entry()
-> approval_log 저장
-> audit_log 저장
```

### 각 에이전트 역할
- `context_agent`
  - 현재 선택된 row / metric / issue_group / 기존 메모 / 세션 정보 수집
- `intent_agent`
  - 질문 / 증빙 요청 / 수정 요청 / 일반 코멘트 분류
- `tone_agent`
  - 자연어를 비즈니스 문체로 정리
- `persist_agent`
  - 서비스 레이어에 넘길 저장 payload 생성

---

## 6-4. AI가 하지 말아야 할 것
- 승인/반려 상태 자동 변경
- 권한 판정 대체
- 값 자동 수정
- 근거 없는 사실 생성

AI는 어디까지나:
- 작성 보조
- 구조화
- 요약 보조
역할만 수행

---

## 7. 현재 저장소 기준으로 살릴 것 / 버릴 것 / 바로 수정할 것

### 살릴 것
- FastAPI 구조
- backend service layer 분리
- approval_scope 검증 로직
- audit_log / approval_log 분리
- PostgreSQL 모델 구조
- 기본 상태 전이 로직

### 버릴 것
- role 직접 선택형 공개 Setup UI
- LogsPage
- ReportPage
- 행 추가형 데이터 입력 UI
- metric_id만 중심으로 보이는 승인표
- 메모/승인/증빙/입력이 분리된 페이지 구조

### 바로 수정할 것
1. logout / reset session
2. Google 로그인 연결
3. `leeej9801@gmail.com` tenant_admin seed
4. invite 기반 담당자 등록
5. InputPage 중심 통합 구조로 재편
6. 오른쪽 3열 memo drawer
7. 3열 상단/하단 구조 반영
8. 메모 권한별 조회 분기 반영
9. row 단위 증빙 업로드 버튼 추가
10. 메모용 멀티에이전트 supervisor 구조 추가

---

## 8. 최종 Acceptance Criteria

다음 조건이 만족되어야 이번 수정이 완료된 것으로 본다.

1. 사용자는 role을 직접 선택하지 않는다
2. `leeej9801@gmail.com` 로그인 시 tenant_admin
3. tenant_admin 이 다른 담당자를 초대할 수 있다
4. 메인 화면은 데이터 입력/협업 화면 1개 중심이다
5. 지표 row마다 증빙 업로드 버튼이 있다
6. metric_id 외에도 사람이 이해 가능한 지표 설명이 보인다
7. 메모는 평소엔 안 보이다가, 특정 지표에서만 오른쪽 3열로 열린다
8. 오른쪽 3열은 상단 메모 리스트 / 하단 작성창 구조다
9. client_user 는 자기 메모 + tenant_admin 메모만 본다
10. tenant_admin 은 모든 메모를 본다
11. 로그는 별도 페이지가 아니라 지표 컨텍스트 내부에 종속된다
12. backend 에 supervisor 기반 멀티에이전트 구조가 존재한다
13. step1 / step2 / step3 수업 코드로 이어질 수 있게 폴더/모듈 구조가 유지된다

전체적인 ui 색깔은 실제 서비스 전문성이 있는 색 (지금처럼 너무 ai 느낌 나는 색은 피한다, 파랑 흰색 회색으로 구성)