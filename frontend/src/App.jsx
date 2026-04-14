import React, { useState } from "react";
import "./index.css";
import { Toaster } from "react-hot-toast";
import SetupPage    from "./pages/SetupPage";
import InputPage    from "./pages/InputPage";
import ApprovalPage from "./pages/ApprovalPage";
import ReportPage   from "./pages/ReportPage";
import LogsPage     from "./pages/LogsPage";

const NAV = [
  { id: "setup",    label: "환경 설정",     icon: "⚙️"  },
  { id: "input",    label: "데이터 입력",   icon: "📥"  },
  { id: "approval", label: "승인 워크플로우", icon: "✅" },
  { id: "report",   label: "보고서 생성",   icon: "📄"  },
  { id: "logs",     label: "로그 조회",     icon: "🔍"  },
];

export default function App() {
  const [page, setPage] = useState("setup");
  const [session, setSession] = useState(null); // { companyId, users }

  return (
    <div className="app-layout">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#1e293b",
            color: "#f1f5f9",
            border: "1px solid rgba(255,255,255,0.1)",
            fontSize: "13px",
          },
        }}
      />

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>ESG Platform</h1>
          <p>보고서 자동 생성 시스템</p>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
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

        {session && (
          <div style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="user-bar-label" style={{ marginBottom: 6 }}>현재 세션</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.8 }}>
              <div>🏢 {session.companyName}</div>
              <div style={{ color: "var(--accent-green)", marginTop: 4 }}>● 연결됨</div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <main className="main-content fade-in">
        {page === "setup"    && <SetupPage    session={session} setSession={setSession} />}
        {page === "input"    && <InputPage    session={session} />}
        {page === "approval" && <ApprovalPage session={session} />}
        {page === "report"   && <ReportPage   session={session} />}
        {page === "logs"     && <LogsPage     session={session} />}
      </main>
    </div>
  );
}
