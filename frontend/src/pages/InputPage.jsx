import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../api";

const METRIC_META = {
  "E1-01": { label: "온실가스 배출량", question: "직접(Scope 1) 및 간접(Scope 2) 온실가스 배출량을 입력하세요." },
  "E1-02": { label: "에너지 사용량", question: "연간 총 에너지 사용량을 유형별로 기재하세요." },
  "S1-01": { label: "산업재해율", question: "최근 1개년도 산업재해 발생 건수 및 재해율을 입력하세요." },
  "G1-01": { label: "이사회 구성", question: "이사회 내 사외이사 및 여성 임원 비율을 기재해주세요." }
};
const getMeta = (metricId) => METRIC_META[metricId] || { label: "기타 지표", question: "-" };

export default function InputPage({ session, onDataChange }) {
  const [facts, setFacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFact, setSelectedFact] = useState(null);
  
  // Memo Drawer State
  const [showMemo, setShowMemo] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memos, setMemos] = useState([]);
  const [memoPrompt, setMemoPrompt] = useState("");

  // Invitation Modal State
  const [inviteModal, setInviteModal] = useState({ open: false, fact: null });
  const [inviteEmail, setInviteEmail] = useState("");

  const load = async () => {
    if (!session) return;
    setLoading(true);
    try {
      // API 호출
      const data = await api.listFacts();
      setFacts(data || []);
      // 사이드바 스레드 동기화 (콜백이 있는 경우)
      if (onDataChange) onDataChange();
    } catch(e) {
      console.error("Data load error:", e);
      toast.error("데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openMemoDrawer = async (fact) => {
    setSelectedFact(fact);
    setShowMemo(true);
    setMemoLoading(true);
    try {
      const resp = await api.getMemoThread(fact.id);
      setMemos(resp.memos || []);
    } catch(e) {
      toast.error("메모 스레드를 불러올 수 없습니다.");
    } finally {
      setMemoLoading(false);
    }
  };

  const handleSendMemo = async () => {
    if(!memoPrompt.trim()) return;
    try {
      await api.createMemo(selectedFact.id, memoPrompt);
      setMemoPrompt("");
      toast.success("메모 등록 성공");
      
      const resp = await api.getMemoThread(selectedFact.id);
      setMemos(resp.memos || []);
      load(); // refresh UI stats
    } catch(e) {
      toast.error("에이전트 호출 실패");
    }
  };

  const submitInvite = async () => {
    if (!inviteEmail) return toast.error("이메일을 입력하세요.");
    try {
      const resp = await api.createInvite(inviteEmail, inviteModal.fact.issue_group_code);
      toast.success("초대장이 생성되었습니다.");
      if (resp.invite_url) {
        navigator.clipboard.writeText(resp.invite_url);
        toast("링크가 복사되었습니다.", { icon: '🔗' });
      }
      setInviteModal({ open: false, fact: null });
      setInviteEmail("");
      load();
    } catch (e) {
      toast.error(e?.detail || "초대 실패");
    }
  };

  const seedMockData = async () => {
    const rows = [
      { issue_group_code: "CLIMATE", metric_id: "E1-01", department: "", assignee: "" },
      { issue_group_code: "CLIMATE", metric_id: "E1-02", department: "", assignee: "" },
      { issue_group_code: "SAFETY", metric_id: "S1-01", department: "", assignee: "" },
      { issue_group_code: "GOVERNANCE", metric_id: "G1-01", department: "", assignee: "" },
    ];
    try {
      await api.uploadJson(rows);
      toast.success("초기 데이터가 생성되었습니다.");
      load();
    } catch(e) {
      toast.error("데이터 생성 실패");
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      
      {/* ── 1열: 메인 데이터 보드 ── */}
      <div style={{ flex: 1, padding: 32, overflowY: "auto", background: "var(--bg-primary)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 700 }}>데이터 입력 및 협업 보드</h2>
            <p style={{ color: "var(--text-secondary)", marginTop: 6 }}>실시간으로 협업하고 지표 데이터를 관리합니다.</p>
          </div>
          {session?.role_code === "tenant_admin" && (
             <button className="btn btn-ghost" onClick={seedMockData} style={{fontSize: 12}}>🔄 초기 샘플 로드</button>
          )}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>그룹</th>
                  <th>지표 정보</th>
                  <th>질문 항목</th>
                  <th>담당부서/지정</th>
                  <th>상태</th>
                  <th>메모</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {facts.map((f) => {
                  const meta = getMeta(f.metric_id);
                  const isAssigned = !!f.department;
                  const canShowMemo = isAssigned || f.comment_count > 0 || session?.role_code === 'tenant_admin';

                  return (
                    <tr key={f.id} className={selectedFact?.id === f.id ? "selected-row" : ""}>
                      <td><span className="badge badge-draft">{f.issue_group_code}</span></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{f.metric_id}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{meta.label}</div>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{meta.question}</td>
                      <td>
                         {isAssigned ? (
                           <div style={{fontSize: 13, fontWeight: 500}}>🏢 {f.department.name}</div>
                         ) : (
                           session?.role_code === 'tenant_admin' ? (
                             <button className="btn btn-sm btn-ghost" onClick={() => setInviteModal({ open: true, fact: f })}>
                               ➕ 초대/배정
                             </button>
                           ) : <span style={{color: "var(--text-muted)"}}>-</span>
                         )}
                      </td>
                      <td>
                        <span className={`badge badge-${f.status}`}>
                          {f.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                         <div style={{position: "relative", display: "inline-block"}}>
                            <button 
                               className="btn btn-sm" 
                               disabled={!canShowMemo}
                               style={{background: canShowMemo ? "var(--accent-purple)" : "var(--bg-glass)", color: "white"}} 
                               onClick={() => openMemoDrawer(f)}
                            >
                              💬 보기
                            </button>
                            {f.comment_count > 0 && (
                              <div className="memo-count-badge">{f.comment_count}</div>
                            )}
                         </div>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-ghost" style={{fontSize: 11}} onClick={() => toast("증빙 뷰어 오픈")}>📎</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && facts.length === 0 && (
              <div style={{padding: 40, textAlign: "center", color: "var(--text-muted)"}}>표시할 지표 데이터가 없습니다.</div>
            )}
          </div>
        </div>
      </div>

      {/* ── 3열: 메모 Drawer ── */}
      {showMemo && selectedFact && (
        <div className="fade-in" style={{ 
          width: 440, borderLeft: "1px solid var(--border-glass)", 
          background: "var(--bg-secondary)", display: "flex", flexDirection: "column" 
        }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-glass)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>📋 협업 스레드</div>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowMemo(false)}>✕</button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
             {memoLoading ? <div className="spinner" style={{margin: "40px auto"}} /> : memos.map(m => (
               <div key={m.id} style={{ 
                 background: "var(--bg-glass)", border: "1px solid var(--border-glass)", 
                 borderRadius: "var(--radius-md)", padding: 16 
               }}>
                 <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                   <strong style={{ color: "var(--accent-blue)", fontSize: 12 }}>{m.actor_name || "System"}</strong>
                   <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{new Date(m.logged_at).toLocaleString()}</span>
                 </div>
                 <div style={{ fontSize: 13, lineHeight: 1.6 }}>{m.comment}</div>
               </div>
             ))}
          </div>

          <div style={{ padding: 24, borderTop: "1px solid var(--border-glass)", background: "var(--bg-secondary)" }}>
              <textarea 
                className="form-textarea" 
                placeholder="지표에 대해 논의할 내용을 입력하세요..." 
                style={{ minHeight: 100, marginBottom: 12 }}
                value={memoPrompt}
                onChange={e => setMemoPrompt(e.target.value)}
              />
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleSendMemo}>
                 전송 (Supervisor AI)
              </button>
          </div>
        </div>
      )}

      {/* ── 초대 모달 ── */}
      {inviteModal.open && (
        <div className="modal-overlay">
          <div className="card modal-content glass-panel">
             <div className="card-title" style={{marginBottom: 8}}>👤 지표 담당자 초대</div>
             <p style={{fontSize:12, color: "var(--text-secondary)", marginBottom: 20}}>
               [{inviteModal.fact.metric_id}] 지표를 담당할 사용자의 이메일을 입력하세요.
             </p>
             <div className="form-group">
                <label className="form-label">이메일 주소</label>
                <input 
                  className="form-input" 
                  autoFocus 
                  placeholder="manager@company.com" 
                  value={inviteEmail} 
                  onChange={e=>setInviteEmail(e.target.value)} 
                />
             </div>
             <div style={{display: "flex", gap: 8, marginTop: 24}}>
                <button className="btn btn-primary" style={{flex: 1, justifyContent: "center"}} onClick={submitInvite}>초대장 발송</button>
                <button className="btn btn-ghost" onClick={() => setInviteModal({ open: false, fact: null })}>취소</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
