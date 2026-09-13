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

  createRoom: (payload, token) => request("/rooms", { method: "POST", body: payload, token }),
  getRoom: (roomId) => request(`/rooms/${roomId}`),
  verifyRoom: (roomId, password) => request(`/rooms/${roomId}/verify`, { method: "POST", body: { password } }),

  roomRecordings: (roomId, token) => request(`/recordings/room/${roomId}`, { token }),
};

export { BASE_URL };
