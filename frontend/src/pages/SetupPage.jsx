import React, { useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api";

export default function SetupPage({ session, setSession }) {
  const [companyName, setCompanyName] = useState("테스트 회사");
  const [loading, setLoading] = useState(false);
  const [seedData, setSeedData] = useState(null);
  const [activeUser, setActiveUser] = useState(null);

  async function handleSeed() {
    setLoading(true);
    try {
      const data = await api.seed(companyName);
      setSeedData(data);
      toast.success("시드 데이터 생성 완료!");
    } catch (e) {
      toast.error("시드 생성 실패: " + JSON.stringify(e));
    } finally {
      setLoading(false);
    }
  }

  function selectUser(role, info) {
    setActiveUser({ role, ...info });
    setSession({
      companyId:   seedData.company_id,
      companyName: companyName,
      userId:      info.id,
      userEmail:   info.email,
      userRole:    role,
      allUsers:    seedData.users,
    });
    toast.success(`사용자 선택: ${info.email}`);
  }

  const ROLES = [
    { key: "tenant_admin",    label: "Tenant Admin",    color: "var(--accent-purple)", desc: "모든 권한" },
    { key: "climate_manager", label: "환경팀 (CLIMATE)", color: "var(--accent-green)",  desc: "CLIMATE submit/approve" },
    { key: "safety_manager",  label: "안전팀 (SAFETY)",  color: "var(--accent-blue)",   desc: "SAFETY submit/approve" },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>⚙️ 환경 설정</h2>
        <p>테스트 시나리오용 시드 데이터 생성 및 사용자 전환</p>
      </div>

      {/* Seed card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">테스트 데이터 생성</div>
            <div className="card-desc">Company + Users + ApprovalScope를 자동으로 생성합니다</div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">회사명</label>
          <input
            className="form-input"
            style={{ maxWidth: 320 }}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>

        <button className="btn btn-primary" onClick={handleSeed} disabled={loading}>
          {loading ? <span className="spinner" /> : "🌱"} 시드 생성
        </button>
      </div>

      {/* Result */}
      {seedData && (
        <div className="card fade-in" style={{ marginTop: 16 }}>
          <div className="card-header">
            <div className="card-title">사용자 선택 (현재 세션 전환)</div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {ROLES.map((role) => {
              const info = seedData.users[role.key];
              const isActive = activeUser?.id === info?.id;
              return (
                <div
                  key={role.key}
                  onClick={() => selectUser(role.key, info)}
                  style={{
                    background: isActive ? `rgba(255,255,255,0.06)` : "var(--bg-glass)",
                    border: `1px solid ${isActive ? role.color : "var(--border-glass)"}`,
                    borderRadius: "var(--radius-md)",
                    padding: 16,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ color: role.color, fontWeight: 600, fontSize: 13 }}>{role.label}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>{role.desc}</div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 11, marginTop: 8 }}>
                    {info?.email}
                  </div>
                  <div className="uuid-text" style={{ marginTop: 4 }}>{info?.id}</div>
                  {isActive && (
                    <div style={{ marginTop: 8, color: role.color, fontSize: 11, fontWeight: 600 }}>
                      ● 현재 활성 사용자
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <hr className="divider" />
          <div>
            <div className="form-label">Company ID</div>
            <span className="mono">{seedData.company_id}</span>
          </div>
        </div>
      )}

      {/* 설계 원칙 */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>🔒 시스템 설계 원칙</div>
        {[
          ["KPI 경로", "Issue → Metric → KPI Fact (direct link 금지)"],
          ["Evidence 강제", "증빙 없으면 보고서 생성 불가"],
          ["데이터 격리", "모든 데이터는 company_id로 격리"],
          ["3중 권한", "company_id / role_code / approval_scope"],
          ["로그 분리", "audit_log (시스템) / approval_log (승인)"],
          ["레이어 분리", "Master / Dictionary / Fact / Evidence / AI"],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: "var(--accent-green)", minWidth: 80, fontWeight: 600 }}>{k}</span>
            <span style={{ color: "var(--text-secondary)" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
