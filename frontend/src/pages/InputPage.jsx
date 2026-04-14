import React, { useState, useRef } from "react";
import toast from "react-hot-toast";
import { api } from "../api";

const ISSUE_GROUPS = ["CLIMATE", "SAFETY", "WORKFORCE", "GOVERNANCE"];
const DEPARTMENTS  = ["환경팀", "안전팀", "인사팀", "경영지원"];

const DEPT_ISSUE_MAP = {
  "환경팀": "CLIMATE",
  "안전팀": "SAFETY",
  "인사팀": "WORKFORCE",
  "경영지원": "GOVERNANCE",
};

const SAMPLE_CSV_ROWS = [
  { issue_group_code: "CLIMATE",  metric_id: "E1-15", value: 1234.5, department: "환경팀",  assignee: "climate@esg.com" },
  { issue_group_code: "CLIMATE",  metric_id: "E1-16", value: 0.56,   department: "환경팀",  assignee: "climate@esg.com" },
  { issue_group_code: "SAFETY",   metric_id: "S2-05", value: 2.1,    department: "안전팀",  assignee: "safety@esg.com"  },
];

export default function InputPage({ session }) {
  const [mode, setMode]         = useState("json"); // "json" | "csv"
  const [rows, setRows]         = useState(SAMPLE_CSV_ROWS);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const fileRef = useRef();

  if (!session) {
    return (
      <div className="empty-state">
        <p>⚙️ 먼저 설정 탭에서 시드 데이터를 생성하고 사용자를 선택해주세요.</p>
      </div>
    );
  }

  async function handleJsonSubmit() {
    setLoading(true);
    try {
      const data = await api.uploadJson(rows, session.userId, session.companyId);
      setResult(data);
      toast.success(data.message);
    } catch (e) {
      toast.error(e?.detail || "입력 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handleCsvUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const data = await api.uploadCsv(file, session.userId, session.companyId);
      setResult(data);
      toast.success(data.message);
    } catch (e) {
      toast.error(e?.detail || "CSV 업로드 실패");
    } finally {
      setLoading(false);
    }
  }

  function addRow() {
    setRows([...rows, { issue_group_code: "CLIMATE", metric_id: "", value: null, department: "환경팀", assignee: session.userEmail }]);
  }

  function updateRow(i, field, val) {
    const next = [...rows];
    next[i] = { ...next[i], [field]: val };
    if (field === "department") next[i].issue_group_code = DEPT_ISSUE_MAP[val] || "";
    setRows(next);
  }

  function removeRow(i) {
    setRows(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="page-header">
        <h2>📥 데이터 입력 — STEP 1</h2>
        <p>CSV / JSON 기반 ESG 데이터 입력 → fact_candidate 생성</p>
      </div>

      {/* User bar */}
      <div className="user-bar">
        <div className="user-bar-field">
          <span className="user-bar-label">현재 사용자</span>
          <span className="user-bar-value">{session.userEmail}</span>
        </div>
        <div className="user-bar-field">
          <span className="user-bar-label">역할</span>
          <span className="user-bar-value" style={{ color: "var(--accent-green)" }}>{session.userRole}</span>
        </div>
        <div className="user-bar-field">
          <span className="user-bar-label">Company</span>
          <span className="user-bar-value">{session.companyName}</span>
        </div>
      </div>

      {/* Mode switch */}
      <div className="pill-group" style={{ marginBottom: 20 }}>
        <button className={`pill ${mode === "json" ? "active" : ""}`} onClick={() => setMode("json")}>
          JSON 직접 입력
        </button>
        <button className={`pill ${mode === "csv" ? "active" : ""}`} onClick={() => setMode("csv")}>
          CSV 파일 업로드
        </button>
      </div>

      {mode === "json" && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">ESG 데이터 행 입력</div>
              <div className="card-desc">데이터를 직접 편집하고 제출합니다</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={addRow}>+ 행 추가</button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Issue Group</th>
                  <th>Metric ID</th>
                  <th>Value</th>
                  <th>부서</th>
                  <th>담당자</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <select
                        className="form-select"
                        value={row.issue_group_code}
                        onChange={(e) => updateRow(i, "issue_group_code", e.target.value)}
                      >
                        {ISSUE_GROUPS.map((g) => <option key={g}>{g}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        className="form-input"
                        value={row.metric_id}
                        onChange={(e) => updateRow(i, "metric_id", e.target.value)}
                        placeholder="E1-15"
                      />
                    </td>
                    <td>
                      <input
                        className="form-input"
                        type="number"
                        value={row.value ?? ""}
                        onChange={(e) => updateRow(i, "value", e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    </td>
                    <td>
                      <select
                        className="form-select"
                        value={row.department}
                        onChange={(e) => updateRow(i, "department", e.target.value)}
                      >
                        {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        className="form-input"
                        value={row.assignee}
                        onChange={(e) => updateRow(i, "assignee", e.target.value)}
                        placeholder="user@email.com"
                      />
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => removeRow(i)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleJsonSubmit} disabled={loading || rows.length === 0}>
              {loading ? <span className="spinner" /> : "📥"} 데이터 제출
            </button>
          </div>
        </div>
      )}

      {mode === "csv" && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>CSV 파일 업로드</div>
          <div
            className="drop-zone"
            onClick={() => fileRef.current?.click()}
          >
            <div style={{ fontSize: 32 }}>📁</div>
            <p>CSV 파일을 클릭하여 선택하세요</p>
            <p style={{ fontSize: 11, marginTop: 4 }}>
              필수 컬럼: issue_group_code, metric_id, value, department, assignee
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCsvUpload} />
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card fade-in alert-success" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>✅ 입력 완료</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>{result.message}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {result.fact_candidate_ids?.map((id) => (
              <span key={id} className="mono" style={{ fontSize: 11 }}>{id}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
