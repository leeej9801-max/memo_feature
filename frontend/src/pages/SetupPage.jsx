import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../api";

export default function SetupPage({ session, refreshSession }) {
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState("");
  const [group, setGroup] = useState("CLIMATE");

  const loadInvites = async () => {
    try {
      const data = await api.listInvites();
      setInvites(data.invites);
    } catch (e) {
      console.warn("Failed to load invites", e);
    }
  };

  useEffect(() => {
    if (session?.role_code === "tenant_admin") {
      loadInvites();
    }
  }, [session]);

  const handleInvite = async () => {
    if (!email) return toast.error("이메일을 입력하세요.");
    try {
      const resp = await api.createInvite(email, group);
      toast.success("초대 링크가 생성되었습니다.");
      
      // 초대링크 클립보드 복사 시도
      if (resp.invite_url) {
        navigator.clipboard.writeText(resp.invite_url);
        toast("링크가 클립보드에 복사되었습니다.", { icon: '🔗' });
      }
      
      setEmail("");
      loadInvites();
    } catch (e) {
      toast.error(e?.detail || "초대 실패");
    }
  };

  const copyLink = (token) => {
    const url = `http://localhost:5173/?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success("링크 복사 완료");
  };

  if (session?.role_code !== "tenant_admin") {
    return <div className="empty-state">권한이 없습니다. (tenant_admin 전용)</div>;
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div className="page-header">
        <h2>⚙️ 테넌트 마스터 관리</h2>
        <p>새 담당자를 초대하고 권한 범위를 설정합니다.</p>
      </div>

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
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
           * 초대 시 생성된 고유 링크를 담당자에게 전달하면, 담당자는 구글 로그인을 통해 즉시 합류할 수 있습니다.
        </p>
      </div>

      <div className="card" style={{ marginTop: 24, padding: 0 }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-glass)" }}>
          <h3 style={{ fontSize: 16 }}>초대 및 관리 현황</h3>
        </div>
        <div className="table-wrapper" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>이메일</th>
                <th>상태</th>
                <th>배정 그룹</th>
                <th>초대 날짜</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {invites.map(i => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 500 }}>{i.email}</td>
                  <td>
                    <span className={`badge badge-${i.status === 'pending' ? 'submitted' : 'approved'}`}>
                       {i.status === 'pending' ? '대기 중' : '수락됨'}
                    </span>
                  </td>
                  <td><span className="badge" style={{background: 'rgba(255,255,255,0.05)'}}>{i.issue_group_code || '-'}</span></td>
                  <td style={{fontSize: 12, color: "var(--text-muted)"}}>{new Date(i.created_at).toLocaleDateString()}</td>
                  <td>
                     {i.status === 'pending' && (
                       <button className="btn btn-sm btn-ghost" onClick={() => copyLink(i.token)}>
                         🔗 링크 복사
                       </button>
                     )}
                     {i.status === 'accepted' && (
                       <span style={{fontSize: 11, color: "var(--accent-green)"}}>활동 중</span>
                     )}
                  </td>
                </tr>
              ))}
              {invites.length===0 && <tr><td colSpan={5} style={{textAlign: "center", padding: 40, color: "var(--text-muted)"}}>아직 초대된 사용자가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
