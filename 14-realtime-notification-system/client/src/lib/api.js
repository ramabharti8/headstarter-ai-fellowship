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

  listUsers: (token) => request("/users", { token }),
  updateTopics: (topics, token) => request("/users/me/topics", { method: "PATCH", body: { topics }, token }),
  updatePreferences: (prefs, token) => request("/users/me/preferences", { method: "PATCH", body: prefs, token }),

  topics: (token) => request("/notifications/topics", { token }),
  myNotifications: (token, limit) => request(`/notifications/mine${limit ? `?limit=${limit}` : ""}`, { token }),
  unreadCount: (token) => request("/notifications/unread-count", { token }),
  markRead: (id, token) => request(`/notifications/${id}/read`, { method: "POST", token }),
  markAllRead: (token) => request("/notifications/read-all", { method: "POST", token }),
  send: (payload, token) => request("/notifications/send", { method: "POST", body: payload, token }),
  delivery: (notificationId, token) => request(`/notifications/delivery/${notificationId}`, { token }),
};

export { BASE_URL };
