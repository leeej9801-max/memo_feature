// API base URL
const BASE_URL = (import.meta.env.VITE_APP_FASTAPI_URL || "http://localhost:8000").replace(/\/$/, "");

function defaultOptions(options = {}) {
  return {
    ...options,
    credentials: "include", // Starlette Session 쿠키를 전송하기 위해 필수
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  };
}

// 헬퍼: 응답 처리 표준화
async function handleResponse(r) {
  const data = await r.json();
  if (!r.ok) {
    console.error("API Error Response:", data);
    throw data;
  }
  return data;
}

export const api = {
  // Auth
  getMe: () => fetch(`${BASE_URL}/auth/me`, defaultOptions()).then(handleResponse),
  logout: () => fetch(`${BASE_URL}/auth/logout`, defaultOptions({ method: "POST" })).then(handleResponse),
  mockLogin: (email) => fetch(`${BASE_URL}/auth/dev/mock_login?email=${encodeURIComponent(email)}`, defaultOptions({ method: "POST" })).then(handleResponse),

  // Admin
  listInvites: () => fetch(`${BASE_URL}/auth/admin/invites`, defaultOptions()).then(handleResponse),
  createInvite: (email, issueGroupCode, departmentId = null, metricId = null, departmentName = null) => fetch(`${BASE_URL}/auth/admin/invites`, defaultOptions({
    method: "POST",
    body: JSON.stringify({ email, issue_group_code: issueGroupCode, department_id: departmentId, metric_id: metricId, department_name: departmentName })
  })).then(handleResponse),
  deleteInvite: (id) => fetch(`${BASE_URL}/auth/admin/invites/${id}`, defaultOptions({ method: "DELETE" })).then(handleResponse),
  listUsers: () => fetch(`${BASE_URL}/auth/admin/users`, defaultOptions()).then(handleResponse),
  revokeUser: (id) => fetch(`${BASE_URL}/auth/admin/users/${id}`, defaultOptions({ method: "DELETE" })).then(handleResponse),

  // Memos (Agent)

  createMemo: (factCandidateId, message) => fetch(`${BASE_URL}/memos`, defaultOptions({
    method: "POST",
    body: JSON.stringify({ fact_candidate_id: factCandidateId, message })
  })).then(handleResponse),
  getMemoThread: (factCandidateId) => fetch(`${BASE_URL}/memos/thread/${factCandidateId}`, defaultOptions()).then(handleResponse),
  acknowledgeMemo: (memoId) => fetch(`${BASE_URL}/memos/${memoId}/acknowledge`, defaultOptions({ method: "POST" })).then(handleResponse),

  // Setup
  seed: (companyName) =>
    fetch(`${BASE_URL}/setup/seed`, defaultOptions({
      method: "POST",
      body: JSON.stringify({ company_name: companyName }),
    })).then(handleResponse),

  // STEP 1
  uploadJson: (rows) =>
    fetch(`${BASE_URL}/input/json`, defaultOptions({
      method: "POST",
      body: JSON.stringify(rows),
    })).then(handleResponse),

  // STEP 2
  listFacts: (status = "") =>
    fetch(`${BASE_URL}/facts${status ? `?status=${status}` : ""}`, defaultOptions()).then(handleResponse),

  updateFact: (id, data) => fetch(`${BASE_URL}/fact/${id}`, defaultOptions({
    method: "PATCH",
    body: JSON.stringify(data)
  })).then(handleResponse),

  submit: (factId) =>
    fetch(`${BASE_URL}/fact/${factId}/submit`, defaultOptions({
      method: "POST",
    })).then(handleResponse),

  approve: (factId) =>
    fetch(`${BASE_URL}/fact/${factId}/approve`, defaultOptions({
      method: "POST",
    })).then(handleResponse),

  reject: (factId, comment = "") =>
    fetch(`${BASE_URL}/fact/${factId}/reject`, defaultOptions({
      method: "POST",
      body: JSON.stringify({ comment }),
    })).then(handleResponse),

  // Evidence
  addEvidence: (kpiFactId, evidenceKey, content) =>
    fetch(
      `${BASE_URL}/evidence/add?kpi_fact_id=${kpiFactId}&evidence_key=${evidenceKey}&content=${encodeURIComponent(content || "")}`,
      defaultOptions({ method: "POST" })
    ).then(handleResponse),
};
