"""
main.py - FastAPI 애플리케이션 진입점
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import os

from database import engine, Base
import models  # noqa: F401 – 모든 모델 등록 (create_all 대상)
from api.routers import router


# ─────────────────────────────────────────────────────────
# 앱 초기화
# ─────────────────────────────────────────────────────────

app = FastAPI(
    title="ESG 보고서 자동 생성 플랫폼 API",
    description="""
## ESG Report Automatic Generation Platform

### 설계 원칙
- KPI는 반드시 `Issue → Metric → KPI Fact` 경로로만 연결
- Evidence 없는 보고서 생성 금지
- 모든 데이터는 `company_id`로 격리
- 권한은 반드시 3중 검증 (company_id / role_code / approval_scope)
- 로그는 audit_log / approval_log 분리

### 워크플로우
1. **STEP1** `POST /input/csv` — CSV 데이터 입력 → fact_candidate 생성
2. **STEP2** `POST /fact/{id}/submit` → `POST /fact/{id}/approve` — 승인 흐름
3. **STEP3** `POST /report/generate` — 보고서 섹션 자동 생성
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)



# ─────────────────────────────────────────────────────────
# 미들웨어 설정 (Starlette stack: 나중에 추가된 것이 먼저 실행됨)
# ─────────────────────────────────────────────────────────

# 1. Session Middleware (same_site="lax" → OAuth redirect 후 세션 쿠키 유지)
app.add_middleware(
    SessionMiddleware, 
    secret_key=os.getenv("SESSION_SECRET_KEY", "fallback_local_secret_key_if_missing"), 
    max_age=86400,
    same_site="lax",
    https_only=False,
)

# 2. CORS Middleware (가장 바깥쪽에서 모든 응답에 헤더 추가)
_origins = [
    "http://localhost:5173", 
    "http://localhost:3000",
    "http://localhost",
    "http://aiedu.tplinkdns.com", 
    "http://aiedu.tplinkdns.com:6050",
    "http://aiedu.tplinkdns.com:6051",
    os.getenv("FRONTEND_URL", ""),
    os.getenv("REACT_URL", ""),
]
# 빈 문자열·중복 제거
_origins = list({o.strip("/") for o in _origins if o})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────
# DB 테이블 자동 생성 (MVP: alembic 없이)
# ─────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)
    print("[OK] DB Table Initialization Completed")


# ─────────────────────────────────────────────────────────
# 라우터 등록
# ─────────────────────────────────────────────────────────

app.include_router(router)


@app.get("/", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "service": "ESG Report Platform API",
        "version": "1.0.0",
    }
