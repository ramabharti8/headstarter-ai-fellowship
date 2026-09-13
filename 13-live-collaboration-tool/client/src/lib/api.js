const BASE_URL = import.meta.env.VITE_SERVER_URL || "";

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  me: (token) => request("/auth/me", { token }),

  createDocument: (payload, token) => request("/documents", { method: "POST", body: payload, token }),
  myDocuments: (token) => request("/documents/mine", { token }),
  getDocument: (docId) => request(`/documents/${docId}`),
  renameDocument: (docId, title, token) => request(`/documents/${docId}`, { method: "PATCH", body: { title }, token }),
  documentVersions: (docId, token) => request(`/documents/${docId}/versions`, { token }),

  createWhiteboard: (payload, token) => request("/whiteboards", { method: "POST", body: payload, token }),
  myWhiteboards: (token) => request("/whiteboards/mine", { token }),
  getWhiteboard: (boardId) => request(`/whiteboards/${boardId}`),
};

export { BASE_URL };
