import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { api } from "../api";

const STATUS_COLOR  = { draft: "badge-draft", submitted: "badge-submitted", approved: "badge-approved", rejected: "badge-rejected" };
const STATUS_LABELS = { draft: "Draft", submitted: "제출됨", approved: "승인됨", rejected: "반려됨" };

export default function ApprovalPage({ session }) {
  const [facts,      setFacts]      = useState([]);
  const [filter,     setFilter]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const [actioning,  setActioning]  = useState(null);
  const [rejectInfo, setRejectInfo] = useState(null); // { factId, comment }

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const data = await api.listFacts(session.userId, session.companyId, filter);
      setFacts(data);
    } catch (e) {
      toast.error("조회 실패");
    } finally {
      setLoading(false);
    }
  }, [session, filter]);

  useEffect(() => { load(); }, [load]);

  if (!session) {
    return <div className="empty-state"><p>⚙️ 먼저 설정 탭에서 사용자를 선택해주세요.</p></div>;
  }

  async function action(type, factId) {
    setActioning(factId + type);
    try {
      let result;
      if (type === "submit")  result = await api.submit(factId, session.userId, session.companyId);
      if (type === "approve") result = await api.approve(factId, session.userId, session.companyId);
      if (type === "reject") {
        result = await api.reject(factId, session.userId, session.companyId, rejectInfo?.comment || "");
        setRejectInfo(null);
      }
      toast.success(result.message);
      load();
    } catch (e) {
      toast.error(e?.detail || `${type} 실패`);
    } finally {
      setActioning(null);
    }
  }

  const counts = {
    all:       facts.length,
    draft:     facts.filter((f) => f.status === "draft").length,
    submitted: facts.filter((f) => f.status === "submitted").length,
    approved:  facts.filter((f) => f.status === "approved").length,
    rejected:  facts.filter((f) => f.status === "rejected").length,
  };

  return (
    <div>
      <div className="page-header">
        <h2>✅ 승인 워크플로우 — STEP 2</h2>
        <p>Fact Candidate의 상태를 관리합니다. 권한에 따라 액션이 제한됩니다.</p>
      </div>

      {/* User bar */}
      <div className="user-bar">
        <div className="user-bar-field">
          <span className="user-bar-label">현재 사용자</span>
          <span className="user-bar-value">{session.userEmail}</span>
        </div>
        <div className="user-bar-field">
          <span className="user-bar-label">역할</span>
          <span className="user-bar-value" style={{ color: "var(--accent-purple)" }}>{session.userRole}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {[
          { label: "전체",   val: counts.all,       cls: "blue" },
          { label: "Draft",  val: counts.draft,     cls: "" },
          { label: "제출됨", val: counts.submitted, cls: "yellow" },
          { label: "승인됨", val: counts.approved,  cls: "green" },
          { label: "반려됨", val: counts.rejected,  cls: "red" },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-card-label">{s.label}</div>
            <div className={`stat-card-value ${s.cls}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="pill-group" style={{ marginBottom: 16 }}>
        {["", "draft", "submitted", "approved", "rejected"].map((s) => (
          <button key={s} className={`pill ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
            {s || "전체"}
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={load}>
          🔄 새로고침
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Issue Group</th>
                <th>Metric ID</th>
                <th>값</th>
                <th>상태</th>
                <th>생성일</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}><span className="spinner" /></td></tr>
              ) : facts.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state"><p>데이터가 없습니다</p></div></td></tr>
              ) : facts.map((f) => (
                <tr key={f.id}>
                  <td><span className="mono">{f.issue_group_code}</span></td>
                  <td>{f.metric_id}</td>
                  <td>{f.value ?? f.value_text ?? "-"}</td>
                  <td>
                    <span className={`badge ${STATUS_COLOR[f.status]}`}>
                      {STATUS_LABELS[f.status]}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {new Date(f.created_at).toLocaleDateString("ko-KR")}
                  </td>
                  <td>
                    <div className="row-actions">
                      {f.status === "draft" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={!!actioning}
                          onClick={() => action("submit", f.id)}
                        >
                          {actioning === f.id + "submit" ? <span className="spinner" /> : "제출"}
                        </button>
                      )}
                      {f.status === "submitted" && (
                        <>
                          <button
                            className="btn btn-approve btn-sm"
                            disabled={!!actioning}
                            onClick={() => action("approve", f.id)}
                          >
                            {actioning === f.id + "approve" ? <span className="spinner" /> : "승인"}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={!!actioning}
                            onClick={() => {
                              setRejectInfo({ factId: f.id, comment: "" });
                            }}
                          >
                            반려
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject modal (inline) */}
      {rejectInfo && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
          }}
        >
          <div className="card fade-in" style={{ width: 400 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>반려 사유 입력</div>
            <textarea
              className="form-textarea"
              placeholder="반려 사유를 입력하세요..."
              value={rejectInfo.comment}
              onChange={(e) => setRejectInfo({ ...rejectInfo, comment: e.target.value })}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-danger" onClick={() => action("reject", rejectInfo.factId)}>
                반려 확정
              </button>
              <button className="btn btn-ghost" onClick={() => setRejectInfo(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
