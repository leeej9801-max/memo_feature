import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { api } from "../api";

const STATUS_COLOR  = { draft: "badge-draft", submitted: "badge-submitted", approved: "badge-approved", rejected: "badge-rejected" };
const STATUS_LABELS = { draft: "Draft", submitted: "제출됨", approved: "승인됨", rejected: "반려됨" };

// 메타데이터 매핑용 (InputPage와 동일 방식, 이상적으로 백엔드서 받아와야함)
const METRIC_META = {
  "E1-01": { label: "온실가스 배출량", question: "직접(Scope 1) 및 간접(Scope 2) 온실가스 배출량을 입력하세요." },
  "E1-02": { label: "에너지 사용량", question: "연간 총 에너지 사용량을 유형별로 기재하세요." },
  "S1-01": { label: "산업재해율", question: "최근 1개년도 산업재해 발생 건수 및 재해율을 입력하세요." },
  "G1-01": { label: "이사회 구성", question: "이사회 내 사외이사 및 여성 임원 비율을 기재해주세요." }
};
const getMeta = (metricId) => METRIC_META[metricId] || { label: "기타 지표", question: "-" };


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
      const data = await api.listFacts(filter);
      setFacts(data);
    } catch (e) {
      toast.error("조회 실패");
    } finally {
      setLoading(false);
    }
  }, [session, filter]);

  useEffect(() => { load(); }, [load]);

  if (session?.role_code !== "tenant_admin") {
    return <div className="empty-state"><p>접근 권한이 없습니다 (tenant_admin 전용).</p></div>;
  }

  async function action(type, factId) {
    setActioning(factId + type);
    try {
      let result;
      if (type === "approve") result = await api.approve(factId);
      if (type === "reject") {
        result = await api.reject(factId, rejectInfo?.comment || "");
        
        // 반려 동작의 특징: 자동으로 reject 사유를 메모(스레드)에도 남긴다고 응용 가능.
        // 현재는 approval_log에 action="reject"로 들어가므로 memo 쿼리 시 스레드에서 잡힙니다.
        setRejectInfo(null);
      }
      toast.success("반영 성공!");
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
        <h2>승인 워크플로우</h2>
        <p>제출된 지표(Fact Candidate)의 Data Evidence를 검토하고 승인합니다.</p>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {[
          { label: "전체",   val: counts.all,       cls: "blue" },
          { label: "제출됨 (대기)", val: counts.submitted, cls: "yellow" },
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
        {["", "submitted", "approved", "rejected", "draft"].map((s) => (
          <button key={s} className={`pill ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
            {s || "전체"}
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={load}>
          새로고침
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>지표 정보</th>
                <th>담당자/부서</th>
                <th>상태</th>
                <th>제출/수정일</th>
                <th>증빙</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}><span className="spinner" /></td></tr>
              ) : facts.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state"><p>데이터가 없습니다</p></div></td></tr>
              ) : facts.map((f) => {
                const meta = getMeta(f.metric_id);
                return (
                  <tr key={f.id}>
                    <td>
                      <div className="badge" style={{marginBottom:4, display: "inline-block"}}>{f.issue_group_code}</div>
                      <div style={{fontWeight: 600}}>{f.metric_id} <span style={{fontWeight: 400, color:"var(--text-muted)"}}>— {meta.label}</span></div>
                    </td>
                    <td>
                      <div style={{fontSize: 13}}>{f.submitted_by_user?.email || "-"}</div>
                      <div style={{fontSize: 11, color: "var(--text-muted)"}}>{f.department?.name || "-"}</div>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLOR[f.status]}`}>
                        {STATUS_LABELS[f.status]}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {new Date(f.updated_at).toLocaleDateString("ko-KR")}
                    </td>
                    <td>
                       <button className="btn btn-sm btn-ghost" style={{fontSize: 11}} onClick={() => toast("증빙 뷰어 Mock 오픈!")}>
                         📎 증빙 확인
                       </button>
                    </td>
                    <td>
                      <div className="row-actions">
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
                );
              })}
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
            <div className="card-title" style={{ marginBottom: 16 }}>이견/반려 사유 입력</div>
            <div style={{fontSize: 12, color: "var(--text-muted)", marginBottom: 12}}>입력된 사유는 해당 지표의 협업 스레드(메모)에 기록됩니다.</div>
            <textarea
              className="form-textarea"
              placeholder="반려 사유(증빙 부족, 수치 오류 등)를 명확히 적어주세요..."
              value={rejectInfo.comment}
              onChange={(e) => setRejectInfo({ ...rejectInfo, comment: e.target.value })}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-danger" onClick={() => action("reject", rejectInfo.factId)}>
                반려 처리 
              </button>
              <button className="btn btn-ghost" onClick={() => setRejectInfo(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
