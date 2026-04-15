let BASE_URL = import.meta.env.VITE_APP_FASTAPI_URL
  ? import.meta.env.VITE_APP_FASTAPI_URL.replace(/\/$/, "")
  : "";

if (typeof window !== "undefined") {
  // 현재 브라우저 주소가 localhost이면, 환경변수를 무시하고 무조건 localhost:6051로 통신
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    BASE_URL = window.location.protocol + "//" + window.location.hostname + ":8001";
  } else if (!BASE_URL) {
    BASE_URL = window.location.origin.replace("6050", "6051");
  }
}

function defaultOptions(options = {}) {
  return {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  };
}

async function handleResponse(r) {
  const data = await r.json();
  if (!r.ok) {
    console.error("API Error Response:", data);
    throw data;
  }
  return data;
}

export const api = {
  getMe: () => fetch(`${BASE_URL}/auth/me`, defaultOptions()).then(handleResponse),
  logout: () => fetch(`${BASE_URL}/auth/logout`, defaultOptions({ method: "POST" })).then(handleResponse),
  mockLogin: (email) =>
    fetch(`${BASE_URL}/auth/dev/mock_login?email=${encodeURIComponent(email)}`, defaultOptions({ method: "POST" })).then(handleResponse),

  listInvites: () => fetch(`${BASE_URL}/auth/admin/invites`, defaultOptions()).then(handleResponse),
  createInvite: (email, issueGroupCode, departmentId = null, metricId = null, departmentName = null) =>
    fetch(`${BASE_URL}/auth/admin/invites`, defaultOptions({
      method: "POST",
      body: JSON.stringify({
        email,
        issue_group_code: issueGroupCode,
        department_id: departmentId,
        metric_id: metricId,
        department_name: departmentName
      })
    })).then(handleResponse),
  deleteInvite: (id) =>
    fetch(`${BASE_URL}/auth/admin/invites/${id}`, defaultOptions({ method: "DELETE" })).then(handleResponse),
  listUsers: () => fetch(`${BASE_URL}/auth/admin/users`, defaultOptions()).then(handleResponse),
  revokeUser: (id) =>
    fetch(`${BASE_URL}/auth/admin/users/${id}`, defaultOptions({ method: "DELETE" })).then(handleResponse),

  createMemo: (payload) =>
    fetch(`${BASE_URL}/memos`, defaultOptions({
      method: "POST",
      body: JSON.stringify(payload) // 전체 payload를 그대로 전송
    })).then(handleResponse),
  getMemoThread: (factCandidateId) =>
    fetch(`${BASE_URL}/memos/thread/${factCandidateId}`, defaultOptions()).then(handleResponse),
  acknowledgeMemo: (memoId) =>
    fetch(`${BASE_URL}/memos/${memoId}/acknowledge`, defaultOptions({ method: "POST" })).then(handleResponse),

  seed: (companyName) =>
    fetch(`${BASE_URL}/setup/seed`, defaultOptions({
      method: "POST",
      body: JSON.stringify({ company_name: companyName }),
    })).then(handleResponse),

  uploadJson: (rows) =>
    fetch(`${BASE_URL}/input/json`, defaultOptions({
      method: "POST",
      body: JSON.stringify(rows),
    })).then(handleResponse),

  listFacts: (status = "") =>
    fetch(`${BASE_URL}/facts${status ? `?status=${status}` : ""}`, defaultOptions()).then(handleResponse),

  updateFact: (id, data) =>
    fetch(`${BASE_URL}/fact/${id}`, defaultOptions({
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

  addEvidence: (kpiFactId, evidenceKey, content) =>
    fetch(
      `${BASE_URL}/evidence/add?kpi_fact_id=${kpiFactId}&evidence_key=${evidenceKey}&content=${encodeURIComponent(content || "")}`,
      defaultOptions({ method: "POST" })
    ).then(handleResponse),
};