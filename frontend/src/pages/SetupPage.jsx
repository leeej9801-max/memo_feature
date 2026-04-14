import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../api";

export default function SetupPage({ session, refreshSession }) {
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState("");
  const [group, setGroup] = useState("CLIMATE");

  const loadData = async () => {
    try {
      const iData = await api.listInvites();
      setInvites(iData.invites);
      const uData = await api.listUsers();
      setUsers(uData.users);
    } catch (e) {
      console.warn("Failed to load setup data", e);
    }
  };

  useEffect(() => {
    if (session?.role_code === "tenant_admin") {
      loadData();
    }
  }, [session]);

  const handleInvite = async () => {
    if (!email) return toast.error("이메일을 입력하세요.");
    try {
      const resp = await api.createInvite(email, group);
      toast.success("초대 링크가 생성되었습니다.");
      if (resp.invite_url) {
        navigator.clipboard.writeText(resp.invite_url);
        toast("링크가 클립보드에 복사되었습니다.", { icon: '🔗' });
      }
      setEmail("");
      loadData();
    } catch (e) {
      toast.error("초대 실패: " + (e?.detail || e?.message || "알 수 없는 오류"));
    }
  };

  const copyLink = (token) => {
    const url = `http://localhost:5173/?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success("링크 복사 완료");
  };

  const handleDeleteInvite = async (id) => {
    if (!window.confirm("초대를 취소하시겠습니까?")) return;
    try {
      await api.deleteInvite(id);
      toast.success("초대가 취소되었습니다.");
      loadData();
    } catch (e) {
      toast.error("삭제 실패");
    }
  };

  const handleRevokeUser = async (id, userEmail) => {
    if (userEmail === session?.email) return toast.error("본인 계정은 관리 도구에서 삭제할 수 없습니다.");
    if (!window.confirm(`[${userEmail}] 사용자의 권한을 취소하시겠습니까? 즉시 로그아웃 처리됩니다.`)) return;
    try {
      await api.revokeUser(id);
      toast.success("권한이 성공적으로 취소되었습니다.");
      loadData();
    } catch (e) {
      toast.error("취소 실패");
    }
  };

  if (session?.role_code !== "tenant_admin") {
    return <div className="empty-state">권한이 없습니다. (tenant_admin 전용)</div>;
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div className="page-header">
        <h2>⚙️ 테넌트 마스터 관리</h2>
        <p>전체 담당자 초대 현황 및 활동 중인 계정을 관리합니다.</p>
      </div>

      {/* 초대장 생성 카드 */}
      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: 16 }}>신규 담당자 초대</h3>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="form-label">이메일 주소</label>
            <input className="form-input" placeholder="example@company.com" value={email} onChange={e=>setEmail(e.target.value)} />
          </div>
          <div style={{ width: 240 }}>
            <label className="form-label">담당 분야 (Issue Group)</label>
            <select className="form-select" value={group} onChange={e=>setGroup(e.target.value)}>
              <option value="CLIMATE">CLIMATE (기후변화)</option>
              <option value="SAFETY">SAFETY (안전보건)</option>
              <option value="HR">HR (인적자원)</option>
              <option value="GOVERNANCE">GOVERNANCE (지배구조)</option>
            </select>
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <button className="btn btn-primary" onClick={handleInvite} style={{ height: 40 }}>초대장 생성</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        {/* 초대 대기 카드 */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-glass)" }}>
            <h3 style={{ fontSize: 15 }}>초대 대기 중</h3>
          </div>
          <div className="table-wrapper" style={{ border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>이메일</th>
                  <th>날짜</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {invites.filter(i => i.status === 'pending').map(i => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{i.email}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{new Date(i.created_at).toLocaleDateString()}</td>
                    <td>
                       <div style={{ display: 'flex', gap: 4 }}>
                         <button className="btn btn-sm btn-ghost" onClick={() => copyLink(i.token)} title="재발송 링크 복사">🔗</button>
                         <button className="btn btn-sm btn-danger" onClick={() => handleDeleteInvite(i.id)} title="초대 취소">🗑️</button>
                       </div>
                    </td>
                  </tr>
                ))}
                {invites.filter(i => i.status === 'pending').length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>대기 중인 초대가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 활동 회원 카드 */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-glass)" }}>
            <h3 style={{ fontSize: 15 }}>활동 중인 담당자</h3>
          </div>
          <div className="table-wrapper" style={{ border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>사용자</th>
                  <th>권한</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{u.email}</div>
                    </td>
                    <td>
                       <span className={`badge ${u.role_code === 'tenant_admin' ? 'badge-approved' : 'badge-draft'}`} style={{fontSize: 10}}>
                         {u.role_code}
                       </span>
                    </td>
                    <td>
                       {u.email !== session?.email && (
                         <button className="btn btn-sm btn-danger" onClick={() => handleRevokeUser(u.id, u.email)} title="권한 취소">
                           취소
                         </button>
                       )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
