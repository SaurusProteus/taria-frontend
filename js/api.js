// Configuración central de la API de Tar-IA
const API_URL = 'https://taria-backend-production.up.railway.app';
const BASE = window.location.pathname.startsWith('/taria-frontend') ? '/taria-frontend' : '';

// TODO: pega aquí tu Public Key de MercadoPago (Tus integraciones → Credenciales → Public Key)
const MP_PUBLIC_KEY = 'APP_USR-61d70c2c-2833-4d5f-8888-19cb04bac812';

function getToken(){ return localStorage.getItem('taria_token'); }
function setToken(t){ localStorage.setItem('taria_token', t); }
function clearToken(){ localStorage.removeItem('taria_token'); }

function authHeaders(){
  const t = getToken();
  return t ? { 'Authorization': `Bearer ${t}` } : {};
}

async function apiGet(path){
  const r = await fetch(`${API_URL}${path}`, { headers: authHeaders() });
  if(r.status === 401){ clearToken(); window.location.href = BASE + '/login.html'; return; }
  if(!r.ok) throw new Error(`Error ${r.status}`);
  return r.json();
}

async function apiPost(path, body){
  const r = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if(r.status === 401){ clearToken(); window.location.href = BASE + '/login.html'; return; }
  if(!r.ok) throw new Error(`Error ${r.status}`);
  return r.json();
}

async function apiDelete(path){
  const r = await fetch(`${API_URL}${path}`, { method: 'DELETE', headers: authHeaders() });
  if(r.status === 401){ clearToken(); window.location.href = BASE + '/login.html'; return; }
  if(!r.ok) throw new Error(`Error ${r.status}`);
  return r.json();
}

function requireAuth(){
  if(!getToken()){ window.location.href = BASE + '/login.html'; }
}
