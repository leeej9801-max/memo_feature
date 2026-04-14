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

export default function InputPage({ session, onDataChange, selectedFactId, onClearSelected }) {
  const [facts, setFacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFact, setSelectedFact] = useState(null);
  
  // Memo Drawer State
  const [showMemo, setShowMemo] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memos, setMemos] = useState([]);
  const [memoPrompt, setMemoPrompt] = useState("");

  // Modals & Menus
  const [inviteModal, setInviteModal] = useState({ open: false, fact: null });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDept, setInviteDept] = useState("");
  const [uploadModal, setUploadModal] = useState({ open: false, fact: null });
  const [contextMenu, setContextMenu] = useState(null);

  const load = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const data = await api.listFacts();
      const list = data || [];
      setFacts(list);
      
      // If external selection exists, trigger drawer
      if (selectedFactId) {
        const target = list.find(f => f.id === selectedFactId);
        if (target) {
          openMemoDrawer(target);
          if (onClearSelected) onClearSelected();
        }
      }
      
      if (onDataChange) onDataChange();
    } catch(e) {
      toast.error("데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Handle external selection while page is already open
  useEffect(() => {
    if (selectedFactId && facts.length > 0) {
      const target = facts.find(f => f.id === selectedFactId);
      if (target) {
        openMemoDrawer(target);
        if (onClearSelected) onClearSelected();
      }
    }
  }, [selectedFactId, facts]);

  const closeContextMenu = () => setContextMenu(null);
  useEffect(() => {
    document.addEventListener("click", closeContextMenu);
    return () => document.removeEventListener("click", closeContextMenu);
  }, []);

  const handleContextMenu = (e, fact) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.pageX, y: e.pageY, fact });
  };

  const openMemoDrawer = async (fact) => {
    setSelectedFact(fact);
    setShowMemo(true);
    setMemoLoading(true);
    try {
      const resp = await api.getMemoThread(fact.id);
      setMemos(resp.memos || []);
    } catch(e) {
      toast.error("스레드 로드 실패: " + (e?.detail || e.message || "Unknown error"));
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
      if (e?.detail && typeof e.detail === 'object' && e.detail.message) {
         toast.error(`[${e.detail.stage}] 에러: ${e.detail.detail}`);
      } else {
         toast.error("에이전트 호출 오류: " + (e?.detail || e?.message || "Unknown error"));
      }
    }
  };

  const submitInvite = async () => { if (!inviteEmail) return toast.error("이메일을 입력하세요."); try { const resp = await api.createInvite(inviteEmail, inviteModal.fact.issue_group_code, null, inviteModal.fact.metric_id, inviteDept || null);
      toast.success("초대장이 생성되었습니다.");
      if (resp.invite_url) {
        navigator.clipboard.writeText(resp.invite_url);
        toast("링크가 복사되었습니다.", { icon: '🔗' });
      }
      setInviteModal({ open: false, fact: null });
      setInviteEmail("");
      load();
    } catch (e) {
      if (e?.detail && typeof e.detail === 'object') {
        toast.error("초대 실패: 올바르지 않은 값입니다.");
      } else {
        toast.error(e?.detail || "초대 실패");
      }
    }
  };

  const seedMockData = async () => {
    const rows = [
      { issue_group_code: "CLIMATE", metric_id: "E1-01" },
      { issue_group_code: "CLIMATE", metric_id: "E1-02" },
      { issue_group_code: "SAFETY", metric_id: "S1-01" },
      { issue_group_code: "GOVERNANCE", metric_id: "G1-01" },
    ];
    try {
      await api.uploadJson(rows);
      toast.success("초기 데이터가 생성되었습니다.");
      load();
    } catch(e) {
      toast.error("데이터 생성 실패: " + (e?.detail || e.message));
    }
  };

  const handleSubmit = async (id) => {
    try {
      await api.submit(id);
      toast.success("제출되었습니다.");
      load();
    } catch(e) {
      toast.error("제출 실패: " + (e?.detail || e.message));
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      
      {/* ── 1/2열: 메인 데이터 보드 ── */}
      <div style={{ flex: 1, padding: 32, overflowY: "auto", background: "var(--bg-primary)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 700 }}>데이터 입력 및 협업 보드</h2>
            <p style={{ color: "var(--text-secondary)", marginTop: 6 }}>지표 데이터를 관리 대시보드</p>
          </div>
          {session?.role_code === "tenant_admin" && (
             <button className="btn btn-ghost" onClick={seedMockData} style={{fontSize: 12}}>지표 로드 (Upsert)</button>
          )}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>그룹</th>
                  <th>지표 식별</th>
                  <th>입력 요건</th>
                  <th>담당/배정</th>
                  <th>입력값</th>
                  <th>현황/조치</th>
                  <th>증빙/메모</th>
                </tr>
              </thead>
              <tbody>
                {facts.map((f) => {
                  const meta = getMeta(f.metric_id);
                  // f.department 또는 f.assigned_user 중 하나라도 있으면 배정된 것으로 간주
                  const isAssigned = !!(f.department || f.assigned_user);
                  const canInteract = isAssigned || session?.role_code === 'tenant_admin';
                  const isOwner = f.assigned_user?.id === session?.id;
                  const canEdit = isOwner || session?.role_code === 'tenant_admin';

                  return (
                    <tr 
                      key={f.id} 
                      className={selectedFact?.id === f.id ? "selected-row" : ""}
                      onContextMenu={(e) => canInteract && handleContextMenu(e, f)}
                    >
                      <td><span className="badge badge-draft">{f.issue_group_code}</span></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{f.metric_id}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{meta.label}</div>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>{meta.question}</td>
                      <td>
                         {isAssigned ? (
                           <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                             <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                               {f.department?.name || (f.assigned_user?.role_code === 'tenant_admin' ? "ESG 관리자" : "소속 없음")}
                             </div>
                             <div style={{ fontSize: 11, color: "var(--accent-blue)", fontWeight: 500 }}>
                               👤 {f.assigned_user?.name || "담당자 미지정"}
                             </div>
                           </div>
                         ) : (
                           session?.role_code === 'tenant_admin' ? (
                             <button className="btn btn-sm btn-ghost" onClick={() => setInviteModal({ open: true, fact: f })} style={{ borderStyle: 'dashed' }}>
                               ➕ 담당자 초대
                             </button>
                           ) : <span style={{color: "var(--text-muted)", fontSize: 12}}>미배정</span>
                         )}
                      </td>
                      <td style={{fontWeight: 500}}>
                        <input 
                          className="form-input"
                          style={{ 
                            width: 100, 
                            padding: "4px 10px", 
                            background: canEdit ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.1)", 
                            border: canEdit ? "1px solid var(--border-glass)" : "1px solid transparent",
                            cursor: canEdit ? "text" : "default",
                            color: "var(--text-primary)",
                            fontWeight: canEdit ? 600 : 400
                          }}
                          value={f.value || ""}
                          placeholder={canEdit ? "값 입력" : ""}
                          readOnly={!canEdit}
                          title={!canEdit ? "권한이 없습니다." : ""}
                          onChange={(e) => {
                            if (!canEdit) return;
                            const newVal = e.target.value;
                            setFacts(prev => prev.map(item => item.id === f.id ? { ...item, value: newVal } : item));
                          }}
                          onBlur={async (e) => {
                            if (!canEdit) return;
                            const val = e.target.value;
                            try {
                              await api.updateFact(f.id, { value: parseFloat(val) || 0 });
                              toast.success("저장되었습니다.");
                              load();
                            } catch (e) {
                              toast.error("저장 실패");
                            }
                          }}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {f.status === 'draft' && <span className="badge badge-draft" style={{minWidth: 55, textAlign: 'center'}}>대기</span>}
                          {f.status === 'submitted' && <span className="badge badge-submitted" style={{minWidth: 55, textAlign: 'center'}}>검토중</span>}
                          {f.status === 'approved' && <span className="badge badge-approved" style={{minWidth: 55, textAlign: 'center'}}>승인</span>}
                          {(f.status === 'rejected' || f.status === 'request_changes') && <span className="badge badge-rejected" style={{minWidth: 55, textAlign: 'center'}}>반려</span>}
                          
                          {f.status === 'draft' && canEdit && (
                            <button className="btn btn-primary" style={{fontSize: 11, padding: '4px 8px', height: 'auto'}} onClick={() => handleSubmit(f.id)}>
                              제출
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                         <div style={{display: "flex", gap: 6, alignItems: 'center'}}>
                            <button className="btn btn-sm btn-ghost" onClick={() => setUploadModal({ open: true, fact: f })}>📎</button>
                            <button 
                               className="btn btn-sm btn-ghost" 
                               onClick={() => openMemoDrawer(f)}
                               style={{ position: 'relative' }}
                            >
                               💬
                               {f.comment_count > 0 && (
                                 <span className="memo-count-badge">{f.comment_count}</span>
                               )}
                            </button>
                         </div>
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
             {memoLoading ? <div className="spinner" style={{margin: "40px auto"}} /> : memos.map(m => {
               const colors = ["var(--accent-blue)", "var(--accent-green)", "var(--accent-purple)", "var(--accent-yellow)", "#f43f5e"];
               const charCodeSum = (m.actor_id || "0").split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
               const themeColor = colors[charCodeSum % colors.length];
               const isMe = m.actor_id === session?.id;

               return (
                <div key={m.id} style={{ 
                  background: isMe ? "rgba(255,255,255,0.06)" : "var(--bg-glass)", 
                  border: isMe ? `1px solid ${themeColor}` : "1px solid var(--border-glass)", 
                  borderRadius: "var(--radius-md)", padding: 16,
                  alignSelf: isMe ? "flex-end" : "flex-start",
                  width: "90%",
                  position: 'relative'
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <strong style={{ color: themeColor, fontSize: 11 }}>
                      {m.actor_department} / {m.actor_name}
                    </strong>
                    <span style={{ color: "var(--text-muted)", fontSize: 10 }}>{new Date(m.logged_at).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-primary)" }}>{m.comment}</div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                    <div>
                      {m.action === 'request_changes' && (
                         <div style={{fontSize: 11, color: "var(--accent-yellow)", fontWeight: 600}}>⚠️ 수정 요청됨</div>
                      )}
                    </div>
                    
                    <button 
                      className="btn btn-ghost" 
                      style={{ fontSize: 10, padding: '2px 8px', height: 'auto', border: '1px solid var(--border-glass)' }}
                      onClick={async () => {
                        try {
                          await api.acknowledgeMemo(m.id);
                          toast.success("확인 처리되었습니다.");
                          loadMemos(selectedFact.id);
                          load(); // Update sidebar/table count
                        } catch (e) {
                          toast.error("처리 실패");
                        }
                      }}
                    >
                      ✓ 확인
                    </button>
                  </div>
                </div>
               );
             })}
             {memos.length === 0 && !memoLoading && (
                <div style={{textAlign: "center", color: "var(--text-muted)", marginTop: 40, fontSize: 13}}>작성된 메모가 없습니다.</div>
             )}
          </div>

          <div style={{ padding: 24, borderTop: "1px solid var(--border-glass)", background: "var(--bg-secondary)" }}>
              {/* 자동 컨텍스트 라벨 */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                 <span className="badge badge-draft" style={{fontSize: 10}}> {selectedFact.metric_id}</span>
                 <span className="badge badge-draft" style={{fontSize: 10}}> {selectedFact.issue_group_code}</span>
                 {selectedFact.department && <span className="badge badge-draft" style={{fontSize: 10}}> {selectedFact.department.name}</span>}
              </div>
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

      {/* ── Context Menu ── */}
      {contextMenu && contextMenu.visible && (
        <div style={{
          position: "absolute", top: contextMenu.y, left: contextMenu.x,
          background: "var(--bg-glass)", border: "1px solid var(--border-glass)",
          borderRadius: 8, padding: 8, zIndex: 1000, minWidth: 160,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)", backdropFilter: "blur(12px)"
        }}>
          <button className="btn btn-ghost" style={{width: '100%', justifyContent: 'flex-start', fontSize: 13, padding: "8px 12px"}}
             onClick={() => setUploadModal({open: true, fact: contextMenu.fact})}>📎 증빙 업로드</button>
          <button className="btn btn-ghost" style={{width: '100%', justifyContent: 'flex-start', fontSize: 13, padding: "8px 12px"}}
             onClick={() => openMemoDrawer(contextMenu.fact)}>💬 협업 스레드 보기</button>
        </div>
      )}

      {/* ── 초대 모달 ── */}
      {inviteModal.open && (
        <div className="modal-overlay">
          <div className="card modal-content glass-panel">
             <div className="card-title" style={{marginBottom: 8}}>👤 지표 담당자 초대</div>
             <p style={{fontSize:12, color: "var(--text-secondary)", marginBottom: 20}}>
               [{inviteModal.fact.metric_id}] 지표를 담당할 사용자의 정보(부서, 이메일)를 입력하세요.
             </p>
             <div className="form-group" style={{marginBottom: 16}}><label className="form-label">부서명</label><input className="form-input" placeholder="예: 경영지원팀, 000" value={inviteDept} onChange={e=>setInviteDept(e.target.value)} /></div><div className="form-group">
                <label className="form-label">이메일 주소</label>
                <input 
                  className="form-input" autoFocus placeholder="manager@company.com" 
                  value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} 
                />
             </div>
             <div style={{display: "flex", gap: 8, marginTop: 24}}>
                <button className="btn btn-primary" style={{flex: 1, justifyContent: "center"}} onClick={submitInvite}>초대장 발송</button>
                <button className="btn btn-ghost" onClick={() => setInviteModal({ open: false, fact: null })}>취소</button>
             </div>
          </div>
        </div>
      )}

      {/* ── 업로드 모달 (Mock) ── */}
      {uploadModal.open && (
        <div className="modal-overlay">
          <div className="card modal-content glass-panel">
             <div className="card-title" style={{marginBottom: 8}}>📎 증빙 업로드</div>
             <p style={{fontSize:12, color: "var(--text-secondary)", marginBottom: 20}}>
               [{uploadModal.fact?.metric_id}] 에 대한 증빙 파일을 업로드하세요. (테스트 환경에서는 S3가 아닌 Mock 업로드만 진행됩니다)
             </p>
             <div style={{
                border: "2px dashed var(--border-glass)", padding: 40, borderRadius: 8,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 24,
                background: "var(--bg-secondary)"
             }}>
                <div style={{fontSize: 32}}>📄</div>
                <div style={{fontSize: 13, color: "var(--text-muted)"}}>클릭하거나 파일을 이곳에 드롭하세요.</div>
             </div>
             <div style={{display: "flex", gap: 8}}>
                <button className="btn btn-primary" style={{flex: 1, justifyContent: "center"}} 
                   onClick={() => { toast.success("증빙 파일이 업로드 되었습니다."); setUploadModal({open:false, fact:null}); }}>업로드 시뮬레이션</button>
                <button className="btn btn-ghost" onClick={() => setUploadModal({ open: false, fact: null })}>닫기</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

