requireAuth();

let claveFile = null;
let tareasFiles = [];
let currentUser = null;

/* ── NAVEGACIÓN ENTRE VISTAS ── */
document.querySelectorAll('.side-link').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.side-link').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.dataset.view).classList.add('active');
    if(btn.dataset.view === 'historial') cargarHistorial();
    if(btn.dataset.view === 'plan') cargarPlanes();
  });
});

document.getElementById('btn-logout').addEventListener('click', ()=>{
  clearToken();
  window.location.href = BASE + '/index.html';
});

/* ── CARGAR USUARIO ── */
async function cargarUsuario(){
  try{
    currentUser = await apiGet('/auth/me');
    if(!currentUser) return;
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-plan').textContent = currentUser.plan.toUpperCase();
    document.getElementById('user-creditos').textContent = currentUser.revisiones_restantes + ' créditos';
  }catch(e){
    console.error(e);
  }
}
cargarUsuario();

/* ── SUBIDA DE CLAVE ── */
const inputClave = document.getElementById('input-clave');
const dropClave = document.getElementById('drop-clave');
dropClave.addEventListener('click', ()=>inputClave.click());
inputClave.addEventListener('change', e=>{
  claveFile = e.target.files[0] || null;
  document.getElementById('drop-clave-text').textContent = claveFile ? `✓ ${claveFile.name}` : 'Haz clic o arrastra el PDF de la clave aquí';
});
['dragover','dragleave','drop'].forEach(evt=>{
  dropClave.addEventListener(evt, e=>{
    e.preventDefault();
    dropClave.classList.toggle('drag', evt === 'dragover');
    if(evt === 'drop' && e.dataTransfer.files[0]){
      claveFile = e.dataTransfer.files[0];
      document.getElementById('drop-clave-text').textContent = `✓ ${claveFile.name}`;
    }
  });
});

/* ── SUBIDA DE TAREAS (múltiples) ── */
const inputTareas = document.getElementById('input-tareas');
const dropTareas = document.getElementById('drop-tareas');
dropTareas.addEventListener('click', ()=>inputTareas.click());
inputTareas.addEventListener('change', e=>{
  agregarTareas(Array.from(e.target.files));
});
['dragover','dragleave','drop'].forEach(evt=>{
  dropTareas.addEventListener(evt, e=>{
    e.preventDefault();
    dropTareas.classList.toggle('drag', evt === 'dragover');
    if(evt === 'drop'){
      agregarTareas(Array.from(e.dataTransfer.files));
    }
  });
});

function agregarTareas(files){
  tareasFiles = tareasFiles.concat(files.filter(f=>f.type === 'application/pdf'));
  renderTareasList();
}

function renderTareasList(){
  const list = document.getElementById('tareas-list');
  list.innerHTML = tareasFiles.map((f,i)=>`
    <div class="file-item">
      <span>${f.name}</span>
      <button data-i="${i}" class="btn-remove-tarea">✕</button>
    </div>`).join('');
  list.querySelectorAll('.btn-remove-tarea').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      tareasFiles.splice(Number(btn.dataset.i), 1);
      renderTareasList();
    });
  });
}

/* ── ENVIAR A CALIFICAR ── */
document.getElementById('btn-calificar').addEventListener('click', async ()=>{
  const alertBox = document.getElementById('calificar-alert');
  alertBox.innerHTML = '';

  if(!claveFile){
    alertBox.innerHTML = '<div class="alert alert-error">Falta subir el PDF de la clave de respuestas.</div>';
    return;
  }
  if(tareasFiles.length === 0){
    alertBox.innerHTML = '<div class="alert alert-error">Sube al menos una tarea de alumno.</div>';
    return;
  }
  if(currentUser && currentUser.plan !== 'owner' && currentUser.revisiones_restantes < tareasFiles.length){
    const restantes = currentUser.revisiones_restantes;
    alertBox.innerHTML = `<div class="alert alert-error">
      Tienes <strong>${restantes} crédito${restantes!==1?'s':''}</strong> — puedes calificar hasta ${restantes} de los ${tareasFiles.length} PDFs que subiste.
      ${restantes > 0 ? `Quita ${tareasFiles.length - restantes} archivo${tareasFiles.length-restantes!==1?'s':''} de la lista para continuar, o ve a <strong>Mi plan</strong> para comprar más créditos.` : 'Ve a <strong>Mi plan</strong> para comprar créditos.'}
    </div>`;
    return;
  }

  const btn = document.getElementById('btn-calificar');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Calificando…';

  try{
    const formData = new FormData();
    formData.append('clave', claveFile);
    tareasFiles.forEach(f => formData.append('tareas', f));
    formData.append('instrucciones', document.getElementById('input-instrucciones').value || '');

    const res = await fetch(`${API_URL}/calificar`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });

    if(res.status === 401){ clearToken(); window.location.href = '/index.html'; return; }
    if(res.status === 402){
      const data = await res.json();
      alertBox.innerHTML = `<div class="alert alert-error">${data.detail.message}</div>`;
      return;
    }
    if(!res.ok) throw new Error(`Error ${res.status}`);

    const invalidos = res.headers.get('X-Archivos-Invalidos');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Tareas_Revisadas.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();

    let msg = '¡Listo! Tus tareas calificadas se descargaron. Revisa tu carpeta de descargas.';
    msg += '<br><small style="opacity:.7">⚠️ Los PDFs revisados no se almacenan en la nube — guarda tu ZIP en un lugar seguro.</small>';
    if(invalidos){
      const nombres = decodeURIComponent(invalidos);
      msg += `<br><small style="color:#f5b060">Archivos que no pudieron procesarse (no consumieron crédito): ${nombres}</small>`;
    }
    alertBox.innerHTML = `<div class="alert alert-success">${msg}</div>`;
    claveFile = null;
    tareasFiles = [];
    document.getElementById('drop-clave-text').textContent = 'Haz clic o arrastra el PDF de la clave aquí';
    renderTareasList();
    cargarUsuario();
  }catch(e){
    alertBox.innerHTML = `<div class="alert alert-error">Algo salió mal: ${e.message}</div>`;
  }finally{
    btn.disabled = false;
    btn.innerHTML = 'Calificar y descargar ZIP';
  }
});

/* ── HISTORIAL ── */
async function cargarHistorial(){
  const body = document.getElementById('historial-body');
  body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3)">Cargando…</td></tr>';
  try{
    const data = await apiGet('/historial');
    if(!data || data.length === 0){
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text3)">Aún no has calificado ninguna tarea.</td></tr>';
      return;
    }
    body.innerHTML = data.map(t=>`
      <tr>
        <td>${t.nombre_archivo}</td>
        <td>${t.calificacion ?? '—'}</td>
        <td style="font-family:'Space Mono',monospace;font-size:11px">${(t.modelo_usado||'').replace('claude-','')}</td>
        <td>${t.num_paginas ?? '—'}</td>
        <td><span class="badge ${t.estado === 'completado' ? 'badge-ok' : 'badge-pending'}">${t.estado}</span></td>
        <td style="font-size:12px;color:var(--text3)">${new Date(t.created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})}</td>
      </tr>`).join('');
  }catch(e){
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--error)">Error al cargar: ${e.message}</td></tr>`;
  }
}

/* ── PLANES ── */
async function cargarPlanes(){
  document.getElementById('stat-plan').textContent = currentUser ? currentUser.plan.toUpperCase() : '—';
  document.getElementById('stat-revisiones').textContent = currentUser ? currentUser.revisiones_restantes : '—';

  const grid = document.getElementById('plan-grid');
  try{
    const planes = await apiGet('/planes');
    const nombres = { gratis:'Gratis', basico:'Básico', pro:'Pro', institucional:'Institucional' };
    grid.innerHTML = Object.entries(planes).map(([key, p])=>`
      <div class="plan-card ${currentUser && currentUser.plan === key ? 'current' : ''}">
        <div class="plan-name">${nombres[key] || key}</div>
        <div class="plan-price">${p.precio_mxn === 0 ? 'Gratis' : `$${p.precio_mxn}`}${p.precio_mxn > 0 ? '<small>/mes</small>' : ''}</div>
        <div class="plan-revs">${p.revisiones} revisiones/mes</div>
        ${currentUser && currentUser.plan === key
          ? '<button class="btn-secondary" disabled style="opacity:.5;width:100%">Plan actual</button>'
          : `<button class="btn-primary btn-comprar-plan" data-plan="${key}" style="width:100%;justify-content:center">Elegir plan</button>`}
      </div>`).join('');

    grid.querySelectorAll('.btn-comprar-plan').forEach(btn=>{
      btn.addEventListener('click', ()=>iniciarCheckoutPlan(btn.dataset.plan));
    });
  }catch(e){
    grid.innerHTML = `<div style="color:var(--error);font-size:13px">Error al cargar planes: ${e.message}</div>`;
  }
}

document.getElementById('btn-extra').addEventListener('click', ()=>iniciarCheckoutExtras());

/* ── CHECKOUT MERCADOPAGO (Bricks) ── */
let mp = null;
function initMP(){
  if(mp || typeof MercadoPago === 'undefined') return;
  mp = new MercadoPago(MP_PUBLIC_KEY, { locale: 'es-MX' });
}

async function iniciarCheckoutPlan(plan){
  const box = document.getElementById('checkout-box');
  box.innerHTML = '<div class="alert alert-info">Generando enlace de pago…</div>';
  try{
    const pref = await apiPost(`/pagos/preferencia?plan=${plan}`);
    renderCheckout(pref, box);
  }catch(e){
    box.innerHTML = `<div class="alert alert-error">No se pudo iniciar el pago: ${e.message}</div>`;
  }
}

async function iniciarCheckoutExtras(){
  const box = document.getElementById('checkout-box');
  box.innerHTML = '<div class="alert alert-info">Generando enlace de pago…</div>';
  try{
    const pref = await apiPost('/pagos/creditos-extra');
    renderCheckout(pref, box);
  }catch(e){
    box.innerHTML = `<div class="alert alert-error">No se pudo iniciar el pago: ${e.message}</div>`;
  }
}

function renderCheckout(pref, box){
  initMP();
  if(!pref || !pref.preference_id){
    box.innerHTML = '<div class="alert alert-error">El servidor no devolvió una preferencia de pago válida.</div>';
    return;
  }
  if(!mp){
    box.innerHTML = '<div class="alert alert-error">No se pudo cargar MercadoPago. Verifica la Public Key en js/api.js.</div>';
    return;
  }
  box.innerHTML = '<div id="wallet-container"></div>';
  mp.bricks().create('wallet', 'wallet-container', {
    initialization: { preferenceId: pref.preference_id }
  });
}
