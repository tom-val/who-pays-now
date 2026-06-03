// API client. Base URL is injected at build time via VITE_API_BASE
// (set by CI from the Terraform `api_base_url` output). Defaults to the
// local backend so `npm run dev` works against `dotnet run`.
const BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:5080').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { /* non-json */ } }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  createGroup: (name) => req('POST', '/groups', { name }),
  getGroup: (id) => req('GET', `/groups/${encodeURIComponent(id)}`),
  addMember: (id, name, color) => req('POST', `/groups/${encodeURIComponent(id)}/members`, { name, color }),
  removeMember: (id, memberId) => req('DELETE', `/groups/${encodeURIComponent(id)}/members/${memberId}`),
  addCategory: (id, name, emoji) => req('POST', `/groups/${encodeURIComponent(id)}/categories`, { name, emoji }),
  updateCategory: (id, catId, name, emoji) => req('PUT', `/groups/${encodeURIComponent(id)}/categories/${catId}`, { name, emoji }),
  removeCategory: (id, catId) => req('DELETE', `/groups/${encodeURIComponent(id)}/categories/${catId}`),
  pay: (id, catId, expectedPayerId) => req('POST', `/groups/${encodeURIComponent(id)}/categories/${catId}/pay`, { expectedPayerId }),
};
