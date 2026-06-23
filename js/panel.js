requireAuth();

/* ── Cierre de sesión por inactividad (2 horas) ── */
(function(){
  const LIMITE = 2 * 60 * 60 * 1000; // 2 horas
  let timer;
  function reset(){
    clearTimeout(timer);
    timer = setTimeout(() => {
      clearToken();
      window.location.href = BASE + '/index.html?msg=Tu sesión se cerró por seguridad tras un periodo de inactividad';
    }, LIMITE);
  }
  ['mousemove','keydown','click','scroll','touchstart'].forEach(ev =>
    document.addEventListener(ev, reset, { passive: true }));
  reset();
})();

let claveFile = null;
let tareasFiles = [];
let currentUser = null;

// Interruptor: ponlo en true cuando la guía esté lista para todos los usuarios
const AYUDA_PARA_TODOS = false;

// Sonido al terminar (sin archivos, generado con Web Audio)
function reproducirSonido(tipo){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notas = tipo === 'completado' ? [523, 659, 784] : [659, 523]; // do-mi-sol / recibido
    notas.forEach((f, i)=>{
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t); o.stop(t + 0.17);
    });
  }catch(_){ /* navegador sin audio o sin interacción previa */ }
}

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
    if(btn.dataset.view === 'admin') cargarAdmin();
  });
});

/* ── PANEL ADMIN (solo dueño) ── */
const fmtMXN = n => '$' + Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtFecha = s => s ? new Date(s).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : '—';

/* ── Admin: gestión de usuario y créditos ── */
const MOTIVOS = { signup:'Registro', compra:'Compra', calificacion:'Calificación', regalo:'Regalo', ajuste:'Ajuste' };

async function buscarUsuarioAdmin(){
  const email = document.getElementById('admin-buscar-email').value.trim();
  const cont = document.getElementById('admin-user-result');
  if(!email){ return; }
  cont.innerHTML = '<div style="color:var(--text3);font-size:13px">Buscando…</div>';
  try{
    const d = await apiGet('/admin/usuario?email=' + encodeURIComponent(email));
    const u = d.usuario;
    const eventos = d.eventos || [];
    const filas = eventos.length ? eventos.map(e=>`
      <tr>
        <td>${MOTIVOS[e.motivo] || e.motivo}</td>
        <td style="color:${e.delta>=0?'var(--success)':'#ff8a8a'};font-family:'Space Mono',monospace">${e.delta>=0?'+':''}${e.delta}</td>
        <td style="font-size:12px;color:var(--text3)">${e.archivos ?? '—'}</td>
        <td style="font-size:12px;color:var(--text2)">${e.nota || '—'}</td>
        <td style="font-size:12px;color:var(--text3)">${fmtFecha(e.created_at)}</td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text3)">Sin movimientos.</td></tr>';

    cont.innerHTML = `
      <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
        <div><div style="font-size:12px;color:var(--text3)">Usuario</div><div style="font-weight:600">${u.name||'—'}</div><div style="font-size:12px;color:var(--text3)">${u.email}</div></div>
        <div><div style="font-size:12px;color:var(--text3)">Plan</div><div><span class="badge ${u.plan==='gratis'?'badge-pending':'badge-ok'}">${(u.plan||'').toUpperCase()}</span></div></div>
        <div><div style="font-size:12px;color:var(--text3)">Saldo</div><div style="font-family:'Space Mono',monospace;font-size:18px;color:var(--accent)">${u.revisiones_restantes}</div></div>
      </div>

      <div style="background:var(--bg3);border:0.5px solid var(--border);border-radius:9px;padding:14px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">Regalar revisiones de cortesía</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <input type="number" id="regalo-cantidad" class="login-input" placeholder="Cantidad" min="1" style="width:110px;margin:0">
          <input type="text" id="regalo-nota" class="login-input" placeholder="Motivo (ej. compensación por error)" style="flex:1;min-width:200px;margin:0">
          <button class="btn-secondary" id="regalo-btn" data-email="${u.email}" style="white-space:nowrap">Acreditar</button>
        </div>
        <div id="regalo-msg" style="margin-top:10px"></div>
      </div>

      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Movimiento</th><th>Créditos</th><th>Archivos</th><th>Nota</th><th>Fecha</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;

    document.getElementById('regalo-btn').addEventListener('click', regalarCreditos);
  }catch(e){
    cont.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

async function regalarCreditos(e){
  const email = e.target.dataset.email;
  const cantidad = parseInt(document.getElementById('regalo-cantidad').value, 10);
  const nota = document.getElementById('regalo-nota').value.trim();
  const msg = document.getElementById('regalo-msg');
  if(!cantidad || cantidad <= 0){ msg.innerHTML = '<div class="alert alert-error">Pon una cantidad válida.</div>'; return; }
  e.target.disabled = true; e.target.textContent = 'Acreditando…';
  try{
    const r = await apiPost('/admin/regalar-creditos', { email, cantidad, nota });
    msg.innerHTML = `<div class="alert alert-success">✓ Acreditadas ${cantidad} revisiones. Nuevo saldo: ${r.revisiones_restantes}. Se notificó por correo.</div>`;
    buscarUsuarioAdmin(); // refrescar historial
  }catch(err){
    msg.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    e.target.disabled = false; e.target.textContent = 'Acreditar';
  }
}

async function cargarAdmin(){
  const alert = document.getElementById('admin-alert');
  alert.innerHTML = '';
  try{
    const d = await apiGet('/admin/overview');

    document.getElementById('kpi-ingresos').textContent = fmtMXN(d.ingresos_total);
    document.getElementById('kpi-ingresos-mes').textContent = fmtMXN(d.ingresos_mes) + ' este mes';
    document.getElementById('kpi-margen').textContent = fmtMXN(d.margen_estimado);
    document.getElementById('kpi-usuarios').textContent = d.usuarios_total;
    document.getElementById('kpi-usuarios-mes').textContent = '+' + d.usuarios_nuevos_mes + ' este mes';
    document.getElementById('kpi-tareas').textContent = d.tareas_total;
    document.getElementById('kpi-tareas-mes').textContent = '+' + d.tareas_mes + ' este mes';
    document.getElementById('kpi-ventas').textContent = d.ventas_total;
    document.getElementById('kpi-costo').textContent = fmtMXN(d.costo_api_estimado);

    // Barras por plan
    const planes = d.usuarios_por_plan || {};
    const max = Math.max(1, ...Object.values(planes));
    const orden = ['gratis','basico','pro','institucional','owner'];
    const keys = Object.keys(planes).sort((a,b)=>orden.indexOf(a)-orden.indexOf(b));
    document.getElementById('admin-planes').innerHTML = keys.map(k=>`
      <div class="plan-bar-row">
        <span class="plan-bar-name">${k}</span>
        <span class="plan-bar-track"><span class="plan-bar-fill" style="width:${(planes[k]/max*100)}%"></span></span>
        <span class="plan-bar-count">${planes[k]}</span>
      </div>`).join('') || '<div style="color:var(--text3);font-size:13px">Sin datos</div>';

    // Transacciones
    const tx = d.transacciones_recientes || [];
    document.getElementById('admin-tx').innerHTML = tx.length ? tx.map(t=>`
      <tr>
        <td>${t.nombre || '—'}</td>
        <td style="font-size:12px">${t.plan_comprado || '—'}</td>
        <td style="color:var(--accent);font-family:'Space Mono',monospace">${fmtMXN(t.monto)}</td>
        <td>${t.creditos_agregados ?? '—'}</td>
        <td style="font-size:12px;color:var(--text3)">${fmtFecha(t.fecha)}</td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text3)">Aún no hay transacciones.</td></tr>';

    // Usuarios
    const us = d.usuarios_recientes || [];
    document.getElementById('admin-usuarios').innerHTML = us.length ? us.map(u=>`
      <tr>
        <td>${u.name || '—'}</td>
        <td style="font-size:12px;color:var(--text3)">${u.email || '—'}</td>
        <td><span class="badge ${u.plan==='gratis'?'badge-pending':'badge-ok'}">${(u.plan||'').toUpperCase()}</span></td>
        <td>${u.revisiones_restantes ?? '—'}</td>
        <td style="font-size:12px;color:var(--text3)">${fmtFecha(u.created_at)}</td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text3)">Sin usuarios.</td></tr>';

  }catch(e){
    alert.innerHTML = `<div class="alert alert-error">No se pudo cargar el panel: ${e.message}</div>`;
  }
}

/* ── TOUR DE BIENVENIDA (primera vez) ── */
const TOUR_STEPS = [
  {sel:null, title:'¡Bienvenido a Tar-IA! 👋', text:'Te muestro en 30 segundos cómo funciona. Puedes saltarte esto cuando quieras.'},
  {sel:'.side-link[data-view="calificar"]', title:'1 · Califica tareas', text:'Sube la clave de respuestas y los PDFs de tus alumnos. Tar-IA los revisa y te devuelve un ZIP con cada tarea anotada y un resumen del grupo.'},
  {sel:'#user-creditos', title:'2 · Tus créditos', text:'Cada tarea revisada consume un crédito. Empiezas con 3 gratis para probar el sistema.'},
  {sel:'.side-link[data-view="historial"]', title:'3 · Historial', text:'Consulta todas las tareas que has calificado, con su fecha y calificación.'},
  {sel:'.side-link[data-view="plan"]', title:'4 · Mi plan', text:'Compra más créditos o mejora tu plan cuando lo necesites.'},
  {sel:'.side-link[data-view="cuenta"]', title:'5 · Mi cuenta', text:'Tus datos, privacidad y documentos legales. Aquí también puedes dar de baja tu cuenta.'},
];

function iniciarTour(){
  if(localStorage.getItem('taria_tour_done')) return;
  let i = 0, highlighted = null;
  const ov = document.createElement('div'); ov.className = 'tour-overlay';
  const tip = document.createElement('div'); tip.className = 'tour-tip';
  document.body.appendChild(ov); document.body.appendChild(tip);

  function clearHi(){ if(highlighted){ highlighted.classList.remove('tour-highlight'); highlighted = null; } }
  function finish(){ clearHi(); ov.remove(); tip.remove(); localStorage.setItem('taria_tour_done','1'); }

  function render(){
    const step = TOUR_STEPS[i];
    clearHi();
    const target = step.sel ? document.querySelector(step.sel) : null;
    ov.style.display = target ? 'none' : 'block';
    if(target){ target.classList.add('tour-highlight'); highlighted = target; }

    tip.innerHTML = `
      <div class="tour-title">${step.title}</div>
      <div class="tour-text">${step.text}</div>
      <div class="tour-actions">
        <button class="tour-skip">Saltar</button>
        <button class="tour-next">${i === TOUR_STEPS.length-1 ? '¡Listo!' : 'Siguiente'}</button>
      </div>
      <div class="tour-progress">${i+1} / ${TOUR_STEPS.length}</div>`;
    tip.querySelector('.tour-next').onclick = ()=>{ i++; (i >= TOUR_STEPS.length) ? finish() : render(); };
    tip.querySelector('.tour-skip').onclick = finish;

    // Posicionar el tooltip
    if(!target){
      tip.style.left = '50%'; tip.style.top = '50%'; tip.style.transform = 'translate(-50%,-50%)';
    } else {
      tip.style.transform = 'none';
      const r = target.getBoundingClientRect();
      const tw = 300, th = tip.offsetHeight || 170;
      let left, top;
      if(r.top < 80){ left = Math.min(r.left, window.innerWidth - tw - 14); top = r.bottom + 14; } // topbar → abajo
      else { left = r.right + 16; top = r.top; }                                                    // sidebar → derecha
      if(left + tw > window.innerWidth - 12) left = Math.max(12, r.left - tw - 16);
      if(top + th > window.innerHeight - 12) top = Math.max(12, window.innerHeight - th - 12);
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    }
  }
  render();
}

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

/* ── Admin: buscar usuario ── */
document.getElementById('admin-buscar-btn').addEventListener('click', buscarUsuarioAdmin);
document.getElementById('admin-buscar-email').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); buscarUsuarioAdmin(); } });

/* ── Modal de fotos sin nombre ── */
document.getElementById('fotos-continuar').addEventListener('click', ()=>{
  document.getElementById('modal-fotos').style.display = 'none';
});
document.getElementById('fotos-quitar').addEventListener('click', ()=>{
  tareasFiles = tareasFiles.filter(f=>!(f.type !== 'application/pdf' && esNombreGenerico(f.name)));
  renderTareasList();
  document.getElementById('modal-fotos').style.display = 'none';
});

/* ── Disclaimer de IA cerrable (recuerda el cierre) ── */
(function(){
  const disc = document.getElementById('ai-disclaimer');
  if(!disc) return;
  if(localStorage.getItem('taria_aidisc_cerrado')) disc.style.display = 'none';
  document.getElementById('ai-disclaimer-close').addEventListener('click', ()=>{
    disc.style.display = 'none';
    localStorage.setItem('taria_aidisc_cerrado', '1');
  });
})();

document.getElementById('howto-ir-calificar').addEventListener('click', (e)=>{
  e.preventDefault();
  document.querySelector('.side-link[data-view="calificar"]').click();
});

document.getElementById('btn-reenviar-verif').addEventListener('click', async (e)=>{
  const btn = e.target;
  btn.disabled = true; btn.textContent = 'Enviando…';
  try{
    await apiPost('/auth/resend-verification');
    btn.textContent = '✓ Enviado, revisa tu correo';
  }catch(err){
    btn.disabled = false; btn.textContent = 'Reenviar correo';
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
      iniciarTour();
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
    if(currentUser.plan === 'owner'){
      document.getElementById('side-admin').style.display = 'flex';
    }
    // "Cómo usar": por ahora solo el dueño la ve (cambia AYUDA_PARA_TODOS a true para liberarla)
    if(currentUser.plan === 'owner' || AYUDA_PARA_TODOS){
      document.getElementById('side-ayuda').style.display = 'flex';
    }
    if(currentUser.email_verified === false && currentUser.plan !== 'owner'){
      document.getElementById('verify-banner').style.display = 'flex';
    }
    actualizarCreditosAviso();
    if(currentUser.needs_consent && currentUser.pending_docs?.length > 0){
      mostrarModalConsent(currentUser.pending_docs);
    } else {
      iniciarTour();
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

/* ── MODO DE CLAVE: tengo / generar ── */
let claveModo = 'tengo';
let problemasFile = null;

document.querySelectorAll('.clave-modo-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    claveModo = btn.dataset.modo;
    document.querySelectorAll('.clave-modo-btn').forEach(b=>b.classList.toggle('active', b===btn));
    document.getElementById('modo-tengo').style.display = claveModo==='tengo' ? 'block' : 'none';
    document.getElementById('modo-generar').style.display = claveModo==='generar' ? 'block' : 'none';
  });
});

// Subida del PDF de problemas
const inputProblemas = document.getElementById('input-problemas');
const dropProblemas = document.getElementById('drop-problemas');
dropProblemas.addEventListener('click', ()=>inputProblemas.click());
inputProblemas.addEventListener('change', e=>{
  problemasFile = e.target.files[0] || null;
  document.getElementById('drop-problemas-text').textContent = problemasFile ? `✓ ${problemasFile.name}` : 'Haz clic o arrastra el PDF/foto de los problemas aquí';
});
['dragover','dragleave','drop'].forEach(evt=>{
  dropProblemas.addEventListener(evt, e=>{
    e.preventDefault();
    dropProblemas.classList.toggle('drag', evt === 'dragover');
    if(evt === 'drop' && e.dataTransfer.files[0]){
      problemasFile = e.dataTransfer.files[0];
      document.getElementById('drop-problemas-text').textContent = `✓ ${problemasFile.name}`;
    }
  });
});

// Generar la clave con Tar-IA
document.getElementById('btn-generar-clave').addEventListener('click', async (e)=>{
  if(!problemasFile){
    document.getElementById('calificar-alert').innerHTML = '<div class="alert alert-error">Primero sube el PDF o foto de los problemas.</div>';
    return;
  }
  const btn = e.target;
  btn.disabled = true; btn.textContent = '✨ Resolviendo problemas…';
  document.getElementById('calificar-alert').innerHTML = '';
  try{
    const fd = new FormData();
    fd.append('problemas', problemasFile);
    fd.append('instrucciones', document.getElementById('input-instrucciones').value || '');
    const r = await fetch(`${API_URL}/clave/generar`, { method:'POST', headers: authHeaders(), body: fd });
    if(r.status === 401){ clearToken(); window.location.href = BASE + '/index.html'; return; }
    const data = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error((data.detail && data.detail.message) ? data.detail.message : (data.detail || 'No se pudo generar la clave'));
    renderClaveEditable(data.items || []);
    document.getElementById('clave-generada-wrap').style.display = 'block';
  }catch(err){
    document.getElementById('calificar-alert').innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }finally{
    btn.disabled = false; btn.textContent = '✨ Generar clave con Tar-IA';
  }
});

function filaClaveHTML(it){
  return `<tr>
    <td><input class="cl-prob" value="${(it.problema||'').replace(/"/g,'&quot;')}" placeholder="1a"></td>
    <td><input class="cl-res" value="${(it.resultado||'').replace(/"/g,'&quot;')}" placeholder="resultado"></td>
    <td class="col-puntos"><input class="cl-pts" type="number" step="0.5" min="0" value="${it.puntos ?? 1}"></td>
    <td><button type="button" class="btn-del-fila">✕</button></td>
  </tr>`;
}
function renderClaveEditable(items){
  const body = document.getElementById('clave-body');
  body.innerHTML = items.map(filaClaveHTML).join('') || filaClaveHTML({});
  body.querySelectorAll('.btn-del-fila').forEach(b=>b.addEventListener('click', ()=>b.closest('tr').remove()));
}
document.getElementById('btn-add-fila').addEventListener('click', ()=>{
  const body = document.getElementById('clave-body');
  body.insertAdjacentHTML('beforeend', filaClaveHTML({}));
  body.querySelectorAll('.btn-del-fila').forEach(b=>{ b.onclick = ()=>b.closest('tr').remove(); });
});

function leerClaveEditada(){
  const filas = document.querySelectorAll('#clave-body tr');
  const items = [];
  filas.forEach(tr=>{
    const prob = tr.querySelector('.cl-prob').value.trim();
    const res = tr.querySelector('.cl-res').value.trim();
    const pts = parseFloat(tr.querySelector('.cl-pts').value) || 0;
    if(prob || res) items.push({ problema: prob, resultado: res, puntos: pts });
  });
  return items;
}

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

function esNombreGenerico(filename){
  const base = filename.replace(/\.[^.]+$/,'').trim();
  // Nombres típicos de cámara/galería o solo números/símbolos = sin nombre de alumno
  return /^(img|dsc|pxl|photo|foto|imagen|image|screenshot|captura|whatsapp|wa|fb_img|received|scan|doc)[\s_\-]*\d*$/i.test(base)
      || /^[\d\s_\-.]+$/.test(base);
}

function agregarTareas(files){
  const permitidos = ['application/pdf','image/jpeg','image/png'];
  const nuevos = files.filter(f=>permitidos.includes(f.type));
  tareasFiles = tareasFiles.concat(nuevos);
  renderTareasList();

  // Avisar si hay imágenes con nombre genérico (cada una costaría 1 crédito)
  const genericas = tareasFiles.filter(f=>f.type !== 'application/pdf' && esNombreGenerico(f.name));
  if(genericas.length > 0){
    document.getElementById('fotos-count').textContent = genericas.length;
    document.getElementById('modal-fotos').style.display = 'flex';
  }
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
  actualizarCreditosAviso();
}

function contarTareas(files){
  // PDFs = 1 c/u; imágenes se agrupan por nombre base (mismo alumno) = 1 tarea
  let pdfs = 0; const bases = new Set();
  files.forEach(f=>{
    if(f.type === 'application/pdf') pdfs++;
    else {
      const base = f.name.replace(/\.[^.]+$/,'').replace(/[\s_\-]*\d+$/,'').trim();
      bases.add(base || f.name);
    }
  });
  return pdfs + bases.size;
}

function actualizarCreditosAviso(){
  const el = document.getElementById('creditos-aviso');
  const n = contarTareas(tareasFiles);
  if(n === 0 || (currentUser && currentUser.plan === 'owner')){ el.style.display = 'none'; return; }
  const disponibles = currentUser ? currentUser.revisiones_restantes : 0;
  const alcanza = disponibles >= n;
  el.style.display = 'block';
  el.innerHTML = `
    <span class="cred-num">${n}</span> crédito${n!==1?'s':''} se consumirán en esta revisión
    <span class="cred-sub">(1 por tarea · te quedan ${disponibles})</span>
    ${alcanza ? '' : `<div class="cred-warn">No te alcanza: faltan ${n - disponibles}. Quita archivos o compra más en "Mi plan".</div>`}`;
}

/* ── ENVIAR A CALIFICAR ── */
document.getElementById('btn-calificar').addEventListener('click', async ()=>{
  const alertBox = document.getElementById('calificar-alert');
  alertBox.innerHTML = '';

  let claveItems = null;
  if(claveModo === 'generar'){
    claveItems = leerClaveEditada();
    if(!claveItems.length){
      alertBox.innerHTML = '<div class="alert alert-error">Genera la clave con Tar-IA y revísala antes de calificar.</div>';
      return;
    }
  } else if(!claveFile){
    alertBox.innerHTML = '<div class="alert alert-error">Falta subir el PDF de la clave de respuestas.</div>';
    return;
  }
  if(tareasFiles.length === 0){
    alertBox.innerHTML = '<div class="alert alert-error">Sube al menos una tarea de alumno.</div>';
    return;
  }
  const nTareas = contarTareas(tareasFiles);
  if(nTareas > 60){
    alertBox.innerHTML = `<div class="alert alert-error">Máximo <strong>60 tareas por envío</strong> (tienes ${nTareas}). Divídelas en varios envíos.</div>`;
    document.getElementById('calificar-alert').scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }
  if(currentUser && currentUser.plan !== 'owner' && currentUser.revisiones_restantes < nTareas){
    const restantes = currentUser.revisiones_restantes;
    alertBox.innerHTML = `<div class="alert alert-error">
      Tienes <strong>${restantes} crédito${restantes!==1?'s':''}</strong> — pero esta entrega son ${nTareas} tareas.
      ${restantes > 0 ? `Quita archivos para dejar ${restantes}, o ve a <strong>Mi plan</strong> para comprar más créditos.` : 'Ve a <strong>Mi plan</strong> para comprar créditos.'}
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
    if(claveModo === 'generar'){
      formData.append('clave_generada', JSON.stringify(claveItems));
    } else {
      formData.append('clave', claveFile);
    }
    tareasFiles.forEach(f => formData.append('tareas', f));
    formData.append('instrucciones', document.getElementById('input-instrucciones').value || '');

    const res = await fetch(`${API_URL}/calificar`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });

    if(res.status === 401){ clearToken(); window.location.href = BASE + '/index.html'; return; }
    if(res.status === 402 || res.status === 403 || res.status === 400){
      const data = await res.json().catch(() => ({}));
      const m = (data.detail && data.detail.message) ? data.detail.message : (data.detail || 'No se pudo procesar la solicitud');
      alertBox.innerHTML = `<div class="alert alert-error">${m}</div>`;
      return;
    }
    // Lote grande → se procesa en segundo plano y llega por correo
    if(res.status === 202){
      const data = await res.json().catch(() => ({}));
      reproducirSonido('recibido');
      alertBox.innerHTML = `<div class="alert alert-success"><button class="alert-close" onclick="this.parentElement.remove()">✕</button>
        📨 <strong>La cantidad de archivos es considerable.</strong> Tar-IA está calificando tu grupo (${data.total||''} tareas) y te enviará el ZIP al correo registrado en unos minutos.
        <br><small style="opacity:.8">Revisa también la carpeta de <strong>spam</strong>. Puedes cerrar la página 🤖</small></div>`;
      claveFile = null; tareasFiles = [];
      document.getElementById('drop-clave-text').textContent = 'Haz clic o arrastra el PDF de la clave aquí';
      renderTareasList();
      cargarUsuario();
      return;
    }

    if(!res.ok) throw new Error(`Error ${res.status}`);

    const invalidos = res.headers.get('X-Archivos-Invalidos');
    const fallidas = res.headers.get('X-Tareas-Fallidas');
    const evaluadas = res.headers.get('X-Evaluadas');
    const totalArch = res.headers.get('X-Total-Archivos');
    const creditos = res.headers.get('X-Creditos-Consumidos');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Tareas_Revisadas.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();

    let resumen = '¡Listo! Tu ZIP se descargó.';
    if(evaluadas){
      resumen = `¡Listo! Se evaluaron <strong>${evaluadas} tarea${evaluadas!=='1'?'s':''}</strong>`;
      if(totalArch) resumen += ` (de ${totalArch} archivo${totalArch!=='1'?'s':''} subidos)`;
      resumen += '. Tu ZIP se descargó.';
    }
    let msg = resumen;
    if(creditos) msg += `<br><small>Créditos consumidos: <strong>${creditos}</strong></small>`;
    msg += '<br><small style="opacity:.7">⚠️ Los PDFs revisados no se almacenan en la nube — guarda tu ZIP en un lugar seguro.</small>';
    if(invalidos){
      const nombres = decodeURIComponent(invalidos);
      msg += `<br><small style="color:#f5b060">Archivos no reconocidos (no consumieron crédito): ${nombres}</small>`;
    }
    if(fallidas){
      const nombres = decodeURIComponent(fallidas);
      msg += `<br><small style="color:#ff8a8a">⚠️ Estas tareas NO se calificaron (no consumieron crédito), probablemente por ser muy pesadas. Reintenta cada una por separado o reduce las fotos: ${nombres}</small>`;
    }
    alertBox.innerHTML = `<div class="alert alert-success"><button class="alert-close" onclick="this.parentElement.remove()">✕</button>${msg}</div>`;
    reproducirSonido('completado');
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
