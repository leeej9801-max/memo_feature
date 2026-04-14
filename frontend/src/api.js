// API base URL
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function buildHeaders(userId, companyId) {
  return {
    "Content-Type": "application/json",
    "X-User-ID":    userId,
    "X-Company-ID": companyId,
  };
}

export const api = {
  // Setup
  seed: (companyName) =>
    fetch(`${BASE_URL}/setup/seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: companyName }),
    }).then((r) => r.json()),

  // STEP 1
  uploadJson: (rows, userId, companyId) =>
    fetch(`${BASE_URL}/input/json`, {
      method: "POST",
      headers: buildHeaders(userId, companyId),
      body: JSON.stringify(rows),
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw data;
      return data;
    }),

  uploadCsv: (file, userId, companyId) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE_URL}/input/csv`, {
      method: "POST",
      headers: { "X-User-ID": userId, "X-Company-ID": companyId },
      body: form,
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw data;
      return data;
    });
  },

  // STEP 2
  listFacts: (userId, companyId, status = "") =>
    fetch(`${BASE_URL}/facts${status ? `?status=${status}` : ""}`, {
      headers: buildHeaders(userId, companyId),
    }).then((r) => r.json()),

  submit: (factId, userId, companyId) =>
    fetch(`${BASE_URL}/fact/${factId}/submit`, {
      method: "POST",
      headers: buildHeaders(userId, companyId),
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw data;
      return data;
    }),

  approve: (factId, userId, companyId) =>
    fetch(`${BASE_URL}/fact/${factId}/approve`, {
      method: "POST",
      headers: buildHeaders(userId, companyId),
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw data;
      return data;
    }),

  reject: (factId, userId, companyId, comment = "") =>
    fetch(`${BASE_URL}/fact/${factId}/reject`, {
      method: "POST",
      headers: buildHeaders(userId, companyId),
      body: JSON.stringify({ comment }),
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw data;
      return data;
    }),

  // STEP 3
  generateReport: (issueGroupCode, userId, companyId) =>
    fetch(`${BASE_URL}/report/generate`, {
      method: "POST",
      headers: buildHeaders(userId, companyId),
      body: JSON.stringify({ issue_group_code: issueGroupCode }),
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw data;
      return data;
    }),

  // Evidence
  addEvidence: (kpiFactId, evidenceKey, content, userId, companyId) =>
    fetch(
      `${BASE_URL}/evidence/add?kpi_fact_id=${kpiFactId}&evidence_key=${evidenceKey}&content=${encodeURIComponent(content || "")}`,
      {
        method: "POST",
        headers: buildHeaders(userId, companyId),
      }
    ).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw data;
      return data;
    }),

  // Logs
  getAuditLogs: (userId, companyId) =>
    fetch(`${BASE_URL}/logs/audit`, {
      headers: buildHeaders(userId, companyId),
    }).then((r) => r.json()),

  getApprovalLogs: (userId, companyId) =>
    fetch(`${BASE_URL}/logs/approval`, {
      headers: buildHeaders(userId, companyId),
    }).then((r) => r.json()),
};
