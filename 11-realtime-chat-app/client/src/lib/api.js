const BASE_URL = import.meta.env.VITE_SERVER_URL || "";

async function request(path, { method = "GET", body, token, isForm } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  me: (token) => request("/auth/me", { token }),

  listUsers: (token) => request("/users", { token }),

  publicRooms: (token) => request("/rooms/public", { token }),
  createOrJoinPublicRoom: (name, token) => request("/rooms/public", { method: "POST", body: { name }, token }),
  myDms: (token) => request("/rooms/dms", { token }),
  openDm: (userId, token) => request(`/rooms/dms/${userId}`, { method: "POST", token }),

  history: (roomId, token, before) => request(`/messages/${roomId}${before ? `?before=${before}` : ""}`, { token }),

  upload: async (file, token) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/upload", { method: "POST", body: formData, token, isForm: true });
  },
};

export { BASE_URL };
