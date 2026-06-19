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
    if(btn.dataset.view === 'cuenta') cargarCuenta();
  });
});

/* ── MI CUENTA ── */
function cargarCuenta(){
  if(!currentUser) return;
  document.getElementById('cuenta-nombre').textContent = currentUser.name;
  document.getElementById('cuenta-email').textContent = currentUser.email;
  document.getElementById('cuenta-plan').textContent = currentUser.plan.toUpperCase();
}

document.getElementById('btn-eliminar-cuenta').addEventListener('click', async ()=>{
  const alertBox = document.getElementById('cuenta-alert');
  const confirmado = confirm(
    '¿Seguro que quieres eliminar tu cuenta?\n\n' +
    'Se borrarán tu perfil, historial y créditos de forma permanente. ' +
    'Esta acción no se puede deshacer.'
  );
  if(!confirmado) return;

  const btn = document.getElementById('btn-eliminar-cuenta');
  btn.disabled = true;
  btn.textContent = 'Eliminando…';
  try{
    await apiDelete('/auth/me');
    clearToken();
    alert('Tu cuenta ha sido eliminada. Gracias por usar Tar-IA.');
    window.location.href = BASE + '/index.html';
  }catch(e){
    alertBox.innerHTML = `<div class="alert alert-error">No se pudo eliminar la cuenta: ${e.message}</div>`;
    btn.disabled = false;
    btn.textContent = 'Eliminar mi cuenta';
  }
});

document.getElementById('btn-logout').addEventListener('click', ()=>{
  clearToken();
  window.location.href = BASE + '/index.html';
});

/* ── CONSENTIMIENTO LEGAL ── */
function mostrarModalConsent(pendingDocs){
  const modal = document.getElementById('modal-consent');
  const check = document.getElementById('consent-check');
  const btn   = document.getElementById('btn-consent');
  const docsEl = document.getElementById('consent-docs');

  // Actualizar links si los documentos tienen URL
  pendingDocs.forEach(d => {
    if(d.doc_type === 'aviso_privacidad' && d.content_url)
      document.getElementById('link-aviso').href = d.content_url;
    if(d.doc_type === 'terminos_uso' && d.content_url)
      document.getElementById('link-terminos').href = d.content_url;
  });

  const nombres = { aviso_privacidad: 'Aviso de Privacidad', terminos_uso: 'Términos de Uso' };
  docsEl.innerHTML = pendingDocs.map(d =>
    `<div style="font-size:12px;color:var(--text3);margin-bottom:4px">
      📄 ${nombres[d.doc_type] || d.doc_type} — versión ${d.version} (${d.effective_date})
    </div>`
  ).join('');

  modal.style.display = 'flex';
  check.addEventListener('change', () => {
    btn.disabled = !check.checked;
    btn.style.opacity = check.checked ? '1' : '.5';
  });

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try{
      await apiPost('/legal/consent', { doc_ids: pendingDocs.map(d => d.id) });
      modal.style.display = 'none';
    }catch(e){
      btn.disabled = false;
      btn.textContent = 'Acepto y continuar';
      alert('Error al guardar tu consentimiento. Intenta de nuevo.');
    }
  });
}

/* ── CARGAR USUARIO ── */
async function cargarUsuario(){
  try{
    currentUser = await apiGet('/auth/me');
    if(!currentUser) return;
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-plan').textContent = currentUser.plan.toUpperCase();
    document.getElementById('user-creditos').textContent = currentUser.revisiones_restantes + ' créditos';
    if(currentUser.needs_consent && currentUser.pending_docs?.length > 0){
      mostrarModalConsent(currentUser.pending_docs);
    }
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

  // Barra de progreso estimada (paralelo: ~35 seg base + 8 seg por tarea)
  const progresoWrap = document.getElementById('progreso-wrap');
  const progresoBar = document.getElementById('progreso-bar');
  const progresoPct = document.getElementById('progreso-pct');
  const progresoLabel = document.getElementById('progreso-label');
  const estimadoSeg = 35 + tareasFiles.length * 8;
  progresoWrap.style.display = 'block';
  let elapsed = 0;
  const tick = setInterval(()=>{
    elapsed += 1;
    const pct = Math.min(95, Math.round((elapsed / estimadoSeg) * 100));
    progresoBar.style.width = pct + '%';
    progresoPct.textContent = pct + '%';
    const restante = Math.max(0, estimadoSeg - elapsed);
    progresoLabel.textContent = restante > 5 ? `Procesando… ~${restante} seg restantes` : 'Casi listo…';
  }, 1000);

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
    clearInterval(tick);
    progresoBar.style.width = '100%';
    setTimeout(()=>{ progresoWrap.style.display = 'none'; progresoBar.style.width = '0%'; }, 1500);
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Calificar y descargar ZIP';
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
        <td style="text-align:center;color:var(--accent);font-family:'Space Mono',monospace;font-size:12px">−1</td>
        <td style="font-family:'Space Mono',monospace;font-size:11px">${(t.modelo_usado||'').replace('claude-','')}</td>
        <td>${t.num_paginas ?? '—'}</td>
        <td><span class="badge ${t.estado === 'completado' ? 'badge-ok' : 'badge-pending'}">${t.estado}</span></td>
        <td style="font-size:12px;color:var(--text3)">${new Date(t.created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'})}</td>
      </tr>`).join('');
  }catch(e){
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--error)">Error al cargar: ${e.message}</td></tr>`;
  }
}

/* ── TIPO DE CAMBIO USD ── */
let _tcUSD = null;

async function obtenerTC(){
  if(_tcUSD) return _tcUSD;
  try{
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const d = await r.json();
    _tcUSD = d.rates?.MXN || null;
  }catch(_){ _tcUSD = null; }
  return _tcUSD;
}

function usdRef(mxn, tc){
  if(!tc || mxn === 0) return '';
  const usd = (mxn / tc).toFixed(2);
  return `<div class="plan-usd">~$${usd} USD</div>`;
}

/* ── PLANES ── */
async function cargarPlanes(){
  document.getElementById('stat-plan').textContent = currentUser ? currentUser.plan.toUpperCase() : '—';
  document.getElementById('stat-revisiones').textContent = currentUser ? currentUser.revisiones_restantes : '—';

  const [planes, tc] = await Promise.all([apiGet('/planes'), obtenerTC()]);
  const grid = document.getElementById('plan-grid');
  try{
    const nombres = { gratis:'Gratis', basico:'Básico', pro:'Pro', institucional:'Institucional' };
    grid.innerHTML = Object.entries(planes).map(([key, p])=>`
      <div class="plan-card ${currentUser && currentUser.plan === key ? 'current' : ''}">
        <div class="plan-name">${nombres[key] || key}</div>
        <div class="plan-price">${p.precio_mxn === 0 ? 'Gratis' : `$${p.precio_mxn} <small>MXN</small>`}</div>
        ${p.precio_mxn === 0 ? '' : '<div class="plan-iva">IVA incluido</div>'}
        ${usdRef(p.precio_mxn, tc)}
        <div class="plan-revs">${p.revisiones} revisiones</div>
        ${currentUser && currentUser.plan === key
          ? '<button class="btn-secondary" disabled style="opacity:.5;width:100%">Plan actual</button>'
          : `<button class="btn-primary btn-comprar-plan" data-plan="${key}" style="width:100%;justify-content:center">Elegir plan</button>`}
      </div>`).join('');

    document.getElementById('fx-disclaimer').style.display = 'block';

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
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  box.innerHTML = '<div style="font-size:13px;color:var(--text2);margin-bottom:12px">Completa tu pago con MercadoPago:</div><div id="wallet-container"></div>';
  mp.bricks().create('wallet', 'wallet-container', {
    initialization: { preferenceId: pref.preference_id }
  });
  setTimeout(()=>box.scrollIntoView({ behavior: 'smooth', block: 'center' }), 600);
}
