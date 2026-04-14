import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../api";

const EVENT_COLORS = {
  FACT_SUBMITTED:   "var(--accent-yellow)",
  FACT_APPROVED:    "var(--accent-green)",
  FACT_REJECTED:    "var(--accent-red)",
  CSV_IMPORTED:     "var(--accent-blue)",
  REPORT_GENERATED: "var(--accent-purple)",
};

const ACTION_COLORS = {
  submit:  "var(--accent-yellow)",
  approve: "var(--accent-green)",
  reject:  "var(--accent-red)",
};

export default function LogsPage({ session }) {
  const [tab,      setTab]      = useState("audit");
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(false);

  if (!session) {
    return <div className="empty-state"><p>⚙️ 먼저 설정 탭에서 사용자를 선택해주세요.</p></div>;
  }

  async function load() {
    setLoading(true);
    try {
      const data = tab === "audit"
        ? await api.getAuditLogs(session.userId, session.companyId)
        : await api.getApprovalLogs(session.userId, session.companyId);
      setLogs(data);
    } catch (e) {
      toast.error("로그 조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tab, session]);

  return (
    <div>
      <div className="page-header">
        <h2>🔍 로그 조회</h2>
        <p>audit_log (시스템 이벤트)와 approval_log (승인 흐름)는 완전히 분리됩니다.</p>
      </div>

      <div className="user-bar">
        <div className="user-bar-field">
          <span className="user-bar-label">현재 사용자</span>
          <span className="user-bar-value">{session.userEmail}</span>
        </div>
        <div className="user-bar-field">
          <span className="user-bar-label">Company ID</span>
          <span className="uuid-text">{session.companyId}</span>
        </div>
      </div>

      {/* tab */}
      <div className="pill-group" style={{ marginBottom: 16 }}>
        <button className={`pill ${tab === "audit" ? "active" : ""}`} onClick={() => setTab("audit")}>
          🗂 Audit Log (시스템 이벤트)
        </button>
        <button className={`pill ${tab === "approval" ? "active" : ""}`} onClick={() => setTab("approval")}>
          ✅ Approval Log (승인 흐름)
        </button>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={load}>
          🔄 새로고침
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          {tab === "audit" ? (
            <table>
              <thead>
                <tr>
                  <th>이벤트 유형</th>
                  <th>Actor ID</th>
                  <th>Target ID</th>
                  <th>상세</th>
                  <th>시각</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 32 }}><span className="spinner" /></td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={5}><div className="empty-state"><p>로그가 없습니다</p></div></td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span style={{
                        color: EVENT_COLORS[l.event_type] || "var(--text-secondary)",
                        fontWeight: 600, fontSize: 12,
                      }}>
                        {l.event_type}
                      </span>
                    </td>
                    <td><span className="uuid-text">{l.actor_id}</span></td>
                    <td><span className="uuid-text">{l.target_id}</span></td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {l.detail}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {new Date(l.logged_at).toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>액션</th>
                  <th>Issue Group</th>
                  <th>Fact ID</th>
                  <th>Actor</th>
                  <th>코멘트</th>
                  <th>시각</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}><span className="spinner" /></td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><p>로그가 없습니다</p></div></td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <span style={{
                        color: ACTION_COLORS[l.action] || "var(--text-secondary)",
                        fontWeight: 600, fontSize: 12, textTransform: "uppercase",
                      }}>
                        {l.action}
                      </span>
                    </td>
                    <td><span className="mono">{l.issue_group_code}</span></td>
                    <td><span className="uuid-text">{l.fact_candidate_id}</span></td>
                    <td><span className="uuid-text">{l.actor_user_id}</span></td>
                    <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{l.comment || "-"}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {new Date(l.logged_at).toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
