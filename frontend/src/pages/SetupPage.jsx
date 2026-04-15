import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { api } from "../api";

export default function SetupPage({ session, refreshSession }) {
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);

  // 초대 모달 상태
  const [modal, setModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDept, setInviteDept] = useState("");
  const [inviting, setInviting] = useState(false);

  const loadData = async () => {
    try {
      const [iData, uData] = await Promise.all([api.listInvites(), api.listUsers()]);
      setInvites(iData.invites);
      setUsers(uData.users);
    } catch (e) {
      console.warn("Failed to load setup data", e);
    }
  };

  useEffect(() => {
    if (session?.role_code === "tenant_admin") loadData();
  }, [session]);

  const openModal = () => {
    setInviteEmail("");
    setInviteDept("");
    setModal(true);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return toast.error("이메일을 입력하세요.");
    if (!inviteDept.trim()) return toast.error("부서명을 입력하세요. (예: ESG전략팀)");
    setInviting(true);
    try {
      const resp = await api.createInvite(inviteEmail.trim(), null, null, null, inviteDept.trim());
      
      if (resp.email_sent === false) {
        toast.error("이메일 발송 실패: " + (resp.detail || "설정 오류"));
      } else {
        toast.success("초대 링크가 이메일로 발송되었습니다.");
      }

      if (resp.invite_url) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(resp.invite_url)
            .then(() => toast("링크가 클립보드에 복사되었습니다.", { icon: "🔗" }))
            .catch(err => {
              console.error("Clipboard copy failed:", err);
              toast.error("링크 복사에 실패했습니다. 수동으로 복사해주세요.");
            });
        } else {
          toast("초대 링크가 생성되었습니다. (수동 복사 필요)", { icon: '🔗' });
        }
      }
      setModal(false);
      loadData();
    } catch (e) {
      if (e?.detail && typeof e.detail === 'object') {
        toast.error("초대 실패 상세: " + JSON.stringify(e.detail));
      } else {
        toast.error("초대 실패: " + (e?.detail || e?.message || "알 수 없는 오류"));
      }
    } finally {
      setInviting(false);
    }
  };

  const copyLink = (token) => {
    const frontendUrl = window.location.origin;
    navigator.clipboard.writeText(`${frontendUrl}/?token=${token}`);
    toast.success("링크 복사 완료");
  };

  const handleDeleteInvite = async (id) => {
    if (!window.confirm("초대를 취소하시겠습니까?")) return;
    try {
      await api.deleteInvite(id);
      toast.success("초대가 취소되었습니다.");
      loadData();
    } catch { toast.error("삭제 실패"); }
  };

  const handleRevokeUser = async (id, userEmail) => {
    if (userEmail === session?.email) return toast.error("본인 계정은 삭제할 수 없습니다.");
    if (!window.confirm(`[${userEmail}] 사용자의 권한을 취소하시겠습니까?`)) return;
    try {
      await api.revokeUser(id);
      toast.success("권한이 취소되었습니다.");
      loadData();
    } catch { toast.error("취소 실패"); }
  };

  if (session?.role_code !== "tenant_admin") {
    return <div className="empty-state">권한이 없습니다. (tenant_admin 전용)</div>;
  }

  const pendingInvites = invites.filter(i => i.status === "pending");

  const CARD_MIN_HEIGHT = 320;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div className="page-header">
        <h2>⚙️관리자 계정 관리</h2>
        <p>전체 담당자 초대 현황 및 활동 중인 계정을 관리합니다.</p>
      </div>

      {/* ── 두 카드 그리드 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 8 }}>

        {/* ── 초대 대기 카드 ── */}
        <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: CARD_MIN_HEIGHT }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-glass)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 15, margin: 0 }}>초대 대기 중</h3>
            <button className="btn btn-primary" style={{ fontSize: 12, padding: "6px 14px", height: 32 }} onClick={openModal}>
              + 담당자 초대
            </button>
          </div>
          <div className="table-wrapper" style={{ border: "none", flex: 1 }}>
            <table>
              <thead>
                <tr>
                  <th>이메일</th>
                  <th>날짜</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{i.email}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {new Date(i.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => copyLink(i.token)} title="링크 복사">🔗</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteInvite(i.id)} title="초대 취소">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pendingInvites.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontSize: 13 }}>대기 중인 초대가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 활동 중인 담당자 카드 ── */}
        <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: CARD_MIN_HEIGHT }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-glass)" }}>
            <h3 style={{ fontSize: 15, margin: 0 }}>활동 중인 담당자</h3>
          </div>
          <div className="table-wrapper" style={{ border: "none", flex: 1 }}>
            <table>
              <thead>
                <tr>
                  <th>사용자</th>
                  <th>소속</th>
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
                    <td><div style={{ fontSize: 12, fontWeight: 500 }}>🏢 {u.department || "–"}</div></td>
                    <td>
                      <span className={`badge ${u.role_code === "tenant_admin" ? "badge-approved" : "badge-draft"}`} style={{ fontSize: 10 }}>
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
                {users.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontSize: 13 }}>활동 중인 계정이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── 초대 모달 ── */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="card modal-content glass-panel" style={{ maxWidth: 400, width: "100%" }}>
            <div className="card-title" style={{ marginBottom: 6 }}>➕ 신규 담당자 초대</div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 20 }}>
              담당자 부서명과 이메일을 입력하면 초대 링크가 생성됩니다.
            </p>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">부서명</label>
              <input
                className="form-input"
                placeholder="예: ESG전략팀, 000"
                autoFocus
                value={inviteDept}
                onChange={e => setInviteDept(e.target.value)}
                onKeyDown={e => e.key === "Enter" && document.getElementById("invite-email-input")?.focus()}
              />
            </div>

            <div className="form-group">
              <label className="form-label">이메일 주소</label>
              <input
                id="invite-email-input"
                className="form-input"
                placeholder="manager@company.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleInvite()}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={handleInvite}
                disabled={inviting}
              >
                {inviting ? "발송 중..." : "초대장 발송"}
              </button>
              <button className="btn btn-ghost" onClick={() => setModal(false)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
