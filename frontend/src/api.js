const BASE = '/api'

function getToken() {
  return localStorage.getItem('relay_token')
}

async function req(method, path, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const t = getToken()
    if (t) headers['Authorization'] = `Bearer ${t}`
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export const api = {
  register: (username, email, password) => req('POST', '/auth/register', { username, email, password }),
  login:    (username, email, password) => req('POST', '/auth/login',    { username, email, password }),
  anonymous: () => req('POST', '/auth/anonymous', null, false),

  myRooms:  () => req('GET', '/rooms/mine'),
  joinRoom: (slug) => req('POST', `/rooms/join/${slug}`),
  leaveRoom: (slug) => req('POST', `/rooms/leave/${slug}`),
  messages: (slug, limit = 50) => req('GET', `/rooms/${slug}/messages?limit=${limit}`),

  uploadFile: async (slug, file) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${BASE}/rooms/${slug}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd,
    })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  },
}

export function wsUrl(slug) {
  const token = getToken()
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  return `${proto}://${host}/ws/${slug}?token=${token}`
}
