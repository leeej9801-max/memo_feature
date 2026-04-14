import React, { useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api";

const ISSUE_GROUPS = ["CLIMATE", "SAFETY", "WORKFORCE", "GOVERNANCE", "ENERGY", "WATER"];

export default function ReportPage({ session }) {
  const [issueGroup,   setIssueGroup]   = useState("CLIMATE");
  const [loading,      setLoading]      = useState(false);
  const [report,       setReport]       = useState(null);
  const [error,        setError]        = useState(null);

  // Evidence 추가 state
  const [kpiFactId,    setKpiFactId]    = useState("");
  const [evidenceKey,  setEvidenceKey]  = useState("");
  const [evidContent,  setEvidContent]  = useState("");
  const [evidLoading,  setEvidLoading]  = useState(false);

  if (!session) {
    return <div className="empty-state"><p>⚙️ 먼저 설정 탭에서 사용자를 선택해주세요.</p></div>;
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const data = await api.generateReport(issueGroup, session.userId, session.companyId);
      setReport(data);
      toast.success("보고서 섹션이 생성되었습니다!");
    } catch (e) {
      const msg = e?.detail || JSON.stringify(e);
      setError(msg);
      toast.error("생성 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEvidence() {
    if (!kpiFactId || !evidenceKey) {
      toast.error("KPI Fact ID와 증빙 키를 입력해주세요.");
      return;
    }
    setEvidLoading(true);
    try {
      await api.addEvidence(kpiFactId, evidenceKey, evidContent, session.userId, session.companyId);
      toast.success("증빙이 등록되었습니다.");
      setKpiFactId(""); setEvidenceKey(""); setEvidContent("");
    } catch (e) {
      toast.error(e?.detail || "증빙 등록 실패");
    } finally {
      setEvidLoading(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>📄 보고서 생성 — STEP 3</h2>
        <p>승인된 KPI Fact + Evidence 기반으로 보고서 섹션을 자동 생성합니다.</p>
      </div>

      <div className="user-bar">
        <div className="user-bar-field">
          <span className="user-bar-label">현재 사용자</span>
          <span className="user-bar-value">{session.userEmail}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Generate card */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>보고서 섹션 생성</div>

          <div className="form-group">
            <label className="form-label">Issue Group</label>
            <select
              className="form-select"
              value={issueGroup}
              onChange={(e) => setIssueGroup(e.target.value)}
            >
              {ISSUE_GROUPS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>

          <div className="alert alert-info" style={{ fontSize: 12 }}>
            <strong>생성 조건:</strong> 해당 group의 승인된 KPI Fact + 연결된 Evidence 모두 필수
          </div>

          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? <span className="spinner" /> : "🤖"} 보고서 생성
          </button>

          {error && (
            <div className="alert alert-error fade-in" style={{ marginTop: 16 }}>
              <strong>❌ 생성 불가</strong>
              <p style={{ marginTop: 4 }}>{error}</p>
            </div>
          )}
        </div>

        {/* Evidence 등록 */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>📎 증빙 자료 등록</div>
          <div className="card-desc" style={{ marginBottom: 16 }}>
            승인된 KPIFact에 증빙을 연결합니다. KPI Fact ID는 승인 완료 후 조회 가능합니다.
          </div>

          <div className="form-group">
            <label className="form-label">KPI Fact ID</label>
            <input
              className="form-input"
              placeholder="UUID 형식"
              value={kpiFactId}
              onChange={(e) => setKpiFactId(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">증빙 키 (evidence_key)</label>
            <input
              className="form-input"
              placeholder="e.g. EVID_E1_15"
              value={evidenceKey}
              onChange={(e) => setEvidenceKey(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">내용 (선택)</label>
            <textarea
              className="form-textarea"
              placeholder="증빙 내용 또는 파일 경로..."
              value={evidContent}
              onChange={(e) => setEvidContent(e.target.value)}
            />
          </div>

          <button className="btn btn-blue" onClick={handleAddEvidence} disabled={evidLoading}>
            {evidLoading ? <span className="spinner" /> : "+"} 증빙 등록
          </button>
        </div>
      </div>

      {/* Report result */}
      {report && (
        <div className="card fade-in" style={{ marginTop: 16 }}>
          <div className="card-header">
            <div>
              <div className="card-title">📄 생성된 보고서 섹션</div>
              <div className="card-desc">
                Issue Group: <span className="mono">{report.issue_group_code}</span>
                &nbsp;|&nbsp; 상태: <span className="badge badge-draft">{report.status}</span>
                &nbsp;|&nbsp; 생성: {new Date(report.created_at).toLocaleString("ko-KR")}
              </div>
            </div>
          </div>

          <div className="report-text">{report.generated_text}</div>

          {report.narrative_references?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>📎 Narrative References</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {report.narrative_references.map((ref) => (
                  <div key={ref.id} style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 12 }}>
                    {ref.kpi_fact_id && <span>KPI: <span className="uuid-text" style={{ display: "inline" }}>{ref.kpi_fact_id}</span></span>}
                    {ref.evidence_id && <span>Evidence: <span className="uuid-text" style={{ display: "inline" }}>{ref.evidence_id}</span></span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
