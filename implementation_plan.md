# Goal Description

Develop an MVP backend system for the ESG Report Automatic Generation Platform using FastAPI and PostgreSQL. The system implements a secure, layer-isolated architecture focusing on data input, approval workflows, and evidence-based AI report generation.

## User Review Required

- **Database credentials:** I will configure the app to connect to PostgreSQL via `postgresql://postgres:postgres@localhost:5432/esg_db`. Please let me know if an alternative connection string needs to be hardcoded or managed via `.env`.
- **User Context (Authentication):** Since we don't have a full JWT-based login mechanism yet, I will simulate user authentication via a mock `Depends` function that extracts user identity (like `X-User-ID`, `X-Company-ID`) from request headers to perform 3-layer authorization checks (`company_id`, `role_code`, `approval_scope`). Is this acceptable for the MVP testing scenarios?
- **AI Generation:** The `report_section_draft` will be mocked with dummy "generated text" using basic string concatenation for MVP purposes, since there's no actual LLM API specified yet.

## Proposed Changes

We will create a new directory named `esg_backend` containing the FastAPI application.

### [NEW] `esg_backend/database.py`
Configure SQLAlchemy engine and session management for PostgreSQL.

### [NEW] `esg_backend/models.py`
SQLAlchemy ORM definitions:
- `UserAccount`, `Department`
- `ApprovalScope`
- `FactCandidate` (status: draft, submitted, approved, rejected)
- `KPIFact`
- `EvidenceChunk`
- `ReportSectionDraft`
- `NarrativeReference`
- `ApprovalLog`, `AuditLog` (both ensuring isolation via `company_id`)

### [NEW] `esg_backend/schemas.py`
Pydantic schemas corresponding to input bodies and API responses (e.g. `CSVRow`, `FactCandidateResponse`, `ReportGenerateRequest`).

### [NEW] `esg_backend/dependencies.py`
Injectable dependencies handling:
- Database session extraction
- Mock authentication (resolving user using `UserAccount` checks)
- The fundamental `verify_approval_scope(user, issue_group, action)` logic.

### [NEW] `esg_backend/services/input_service.py`
Handles `STEP 1`:
- Logic to read and parse CSV data.
- Automatically maps/creates `Department` and `ApprovalScope`.
- Creates `FactCandidate` entries.

### [NEW] `esg_backend/services/approval_service.py`
Handles `STEP 2`:
- Implements state transitions (`submit`, `approve`, `reject`).
- Ensures valid `KPIFact` creation upon `approve`.
- Records robust `ApprovalLog` and `AuditLog` artifacts.
- Enforces strict role-based scopes (tenant_admin escape hatch).

### [NEW] `esg_backend/services/report_service.py`
Handles `STEP 3`:
- Verifies existence of dependent `KPIFact` and `EvidenceChunk` records before generation.
- Generates `ReportSectionDraft` and constructs the immutable `NarrativeReference`.

### [NEW] `esg_backend/api/routers.py`
Registers API endpoints.
- `POST /input/csv`
- `POST /fact/{id}/submit`
- `POST /fact/{id}/approve`
- `POST /fact/{id}/reject`
- `POST /report/generate`

### [NEW] `esg_backend/main.py`
Application startup and FastAPI instantiation. Initializes the DB schema dynamically if it does not exist.

## Open Questions

- We need the `alembic` migration tool setup, or should I simply rely on `Base.metadata.create_all` at startup for MVP speed?

## Verification Plan

### Automated Tests
I will create a quick python-based HTTP test script `run_scenarios.py` to assert the 4 requested scenarios:
1. Environment Team user -> CLIMATE input -> approve success.
2. Safety Team user -> CLIMATE approve attempt -> fail (403).
3. tenant_admin -> can approve all.
4. Report Gen with missing Evidence -> fails.

### Manual Verification
Reviewing server logs to verify separation of `AuditLog` and `ApprovalLog` tables.
