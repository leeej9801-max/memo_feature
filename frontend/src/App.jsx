import React, { useState, useEffect } from "react";
import "./index.css";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";

import { api } from "./api";
import SetupPage    from "./pages/SetupPage";
import InputPage    from "./pages/InputPage";
import ApprovalPage from "./pages/ApprovalPage";

const NAV = [
  { id: "input",    label: "데이터 입력 보드", icon: "📥"  },
  { id: "approval", label: "승인 워크플로우", icon: "✅"  },
  { id: "setup",    label: "관리자 설정",     icon: "⚙️" },
];

export default function App() {
  const [page, setPage] = useState("input");
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  
  // Shared Collaboration State
  const [activeThreads, setActiveThreads] = useState([]);
  const [inviteToken, setInviteToken] = useState(null);

  const checkSession = async () => {
    try {
      const data = await api.getMe();
      setSession(data);
    } catch (e) {
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  const loadThreads = async () => {
    if (!session) return;
    try {
      const data = await api.listFacts();
      // 댓글이 있는 지표만 추출
      const threads = data.filter(f => f.comment_count > 0);
      setActiveThreads(threads);
    } catch (e) {
      console.warn("Sidebar thread sync failed");
    }
  };

  // 테마 적용
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // 이니셜 로드
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) setInviteToken(token);
    checkSession();
  }, []);

  // 세션 로드 후 주기적으로 스레드 갱신
  useEffect(() => {
    if (session) {
      loadThreads();
      const interval = setInterval(loadThreads, 30000);
      return () => clearInterval(interval);
    }
  }, [session]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const handleLogout = async () => {
    try {
      await api.logout();
      setSession(null);
      localStorage.clear(); // 전체 상태 초기화 위해 캐시 비움
      window.location.reload(); // 리로드로 앱 상태 완전히 초기화
    } catch (e) { toast.error("로그아웃 실패"); }
  };

  if (loading) {
    return (
      <div className="onboarding-screen">
        <div className="premium-bg" />
        <div className="spinner" />
      </div>
    );
  }

  if (!session) {
    const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
    const googleLoginUrl = inviteToken 
      ? `${BASE_URL}/auth/login/google?invite_token=${inviteToken}`
      : `${BASE_URL}/auth/login/google`;

    return (
      <div className="onboarding-screen">
        <div className="premium-bg" />
        <div className="glass-panel fade-in">
          <div className="login-logo">
            {inviteToken && <div className="invite-badge">Special Invitation</div>}
            <h1>ESG Collaborative Portal</h1>
            <p style={{ color: "var(--text-secondary)", marginBottom: 32, fontSize: 14 }}>
              {inviteToken 
                ? "초대받으신 담당자님 환영합니다. 아래 버튼을 눌러 수락해 주세요." 
                : "ESG 데이터 관리 및 협업을 위한 통합 플랫폼입니다."}
            </p>
          </div>
          <a href={googleLoginUrl} className="google-btn">
             <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/smartlock/google.svg" width="18" alt="G" />
             {inviteToken ? "초대 수락 및 Google 로그인" : "Google 계정으로 관리자 로그인"}
          </a>
          <div style={{ marginTop: 24, padding: "16px 0", borderTop: "1px solid var(--border-glass)" }}>
            <p style={{fontSize: 11, color: "var(--text-muted)", marginBottom: 12}}>빠른 서버 확인 (개발 전용)</p>
            <div style={{display: "flex", gap: 8, justifyContent: "center"}}>
              <button className="btn btn-sm btn-ghost" onClick={() => api.mockLogin("leeej9801@gmail.com").then(checkSession)}>Admin Mock</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const availableNav = NAV.filter(n => {
    if ((n.id === "approval" || n.id === "setup") && session.role_code !== "tenant_admin") return false;
    return true;
  });

  return (
    <div className="app-layout">
      <Toaster position="top-right" />

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>ESG Platform</h1>
          <p>Collaborative Workspace</p>
        </div>
        
        <nav className="sidebar-nav">
          {availableNav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sidebar Widgets: Active Thread List */}
        <div style={{ padding: "0 12px 12px", flex: 1, overflowY: "auto" }}>
            <div className="thread-list-widget">
               <div style={{fontSize: 11, fontWeight: 700, marginBottom: 10, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", alignItems: 'center'}}>
                  <span>💬 우리 스레드 목록</span>
                  <span className="badge" style={{transform:'scale(0.8)', background: 'var(--accent-purple)', color: 'white'}}>{activeThreads.length}</span>
               </div>
               {activeThreads.length === 0 ? (
                 <div style={{fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "12px 0"}}>
                    진행 중인 토론이 없습니다.
                 </div>
               ) : (
                 <div style={{display:'flex', flexDirection:'column', gap: 4}}>
                   {activeThreads.map(t => (
                     <div key={t.id} className="thread-item" onClick={() => setPage("input")}>
                        <div className="thread-item-label">[{t.metric_id}] {t.issue_group_code}</div>
                        <div className="thread-item-count">{t.comment_count}</div>
                     </div>
                   ))}
                 </div>
               )}
            </div>
        </div>

        <div style={{ padding: "16px", borderTop: "1px solid var(--border-glass)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
             <div className="user-bar-label">{session.name}</div>
             <button className="theme-toggle" onClick={toggleTheme}>
                {theme === "dark" ? "⚪" : "⚫"}
             </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.8 }}>
            <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>📧 {session.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
               <span className="badge" style={{ transform: 'scale(0.8)', originX: '0' }}>{session.role_code}</span>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 12, justifyContent: 'center' }} onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main-content fade-in" style={{ padding: page === "input" ? 0 : 32 }}>
        {page === "setup"    && <SetupPage    session={session} refreshSession={checkSession} />}
        {page === "input"    && <InputPage    session={session} onDataChange={loadThreads} />}
        {page === "approval" && <ApprovalPage session={session} />}
      </main>
    </div>
  );
}
