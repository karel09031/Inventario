// --- 1. CONFIGURACIÓN SUPABASE ---
const SUPABASE_URL = "https://hjpbtlkcyojxxrjvxvdb.supabase.co";
const SUPABASE_KEY = "sb_publishable_e5z1IHGIP56qwXEi9-a0vQ_iAFMsXXy";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. ESTADO DE LA APLICACIÓN ---
let estado = {
  paredes: [],
  bloques: [],
  paredActivaId: null,
  busqueda: "",
  paredIdEnEdicion: null
};

let sortableInstance = null;
let ultimoMovimiento = null; 

// Variables para el sistema de Batching (acumulación de clics)
let pendingChanges = {}; 
let changeTimers = {};   

// --- 3. ELEMENTOS DEL DOM ---
const listaParedesUI = document.getElementById('lista-paredes');
const listaBloquesUI = document.getElementById('lista-bloques');
const totalGlobalUI = document.getElementById('global-total');
const buscadorUI = document.getElementById('buscador');

const modal = document.getElementById('modal-pared');
const btnNuevaPared = document.getElementById('btn-nueva-pared');
const btnCancelar = document.getElementById('btn-cancelar');
const btnGenerarBloques = document.getElementById('btn-generar-bloques');
const btnGuardarPared = document.getElementById('btn-guardar-pared');
const contenedorBloquesDinamicos = document.getElementById('contenedor-nombres-bloques');
const modalConfirm = document.getElementById('modal-confirm');
const btnConfirmSi = document.getElementById('btn-confirm-si');
const btnConfirmNo = document.getElementById('btn-confirm-no');

// --- 4. INICIALIZACIÓN ---
async function iniciarApp() {
  await cargarParedes();
  await cargarBloques();
  renderizarParedes();
  renderizarBloques();
  calcularTotalGlobal();
}

async function cargarParedes() {
  const { data, error } = await supabaseClient.from('paredes').select('*').order('posicion', { ascending: true });
  if (!error) estado.paredes = data;
}

async function cargarBloques() {
  const { data, error } = await supabaseClient.from('bloques').select('*');
  if (!error) estado.bloques = data;
}

// --- 5. BUSCADOR ---
buscadorUI.addEventListener('input', (e) => {
  estado.busqueda = e.target.value.toLowerCase().trim();
  renderizarParedes();
  renderizarBloques();
});

// --- 6. FUNCIONES DE SELECCIÓN Y VISTAS ---
function seleccionarPared(id, nombre) {
  estado.paredActivaId = id;
  estado.busqueda = "";
  buscadorUI.value = "";
  renderizarParedes();
  renderizarBloques();
}

function toggleModo() {
    const appLayout = document.querySelector('.app-layout');
    const historialSec = document.getElementById('seccion-historial');
    const btnToggle = document.getElementById('btn-toggle-vista');
    
    // Mostrar fecha actual con el mes escrito (ej. 9 de junio de 2026)
    const panelFecha = document.getElementById('fecha-actual');
    if(panelFecha) {
        panelFecha.textContent = new Date().toLocaleDateString('es-ES', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
        });
    }
    
    if (appLayout.style.display === 'none') {
        appLayout.style.display = 'flex';
        historialSec.style.display = 'none';
        btnToggle.textContent = "Historial";
    } else {
        appLayout.style.display = 'none';
        historialSec.style.display = 'block';
        btnToggle.textContent = "Volver a Inventario";
        cargarHistorial();
    }
}

// --- 7. LÓGICA DE HISTORIAL, UNDO Y ELIMINACIÓN ---
function mostrarToast(mensaje, movimiento) {
    ultimoMovimiento = movimiento;
    const toast = document.getElementById('toast-undo');
    document.getElementById('toast-msg').textContent = mensaje;
    toast.classList.remove('oculto');
    setTimeout(() => toast.classList.add('oculto'), 5000);
}

async function registrarMovimiento(bloque, cambio) {
    const pared = estado.paredes.find(p => p.id === bloque.pared_id);
    const { data, error } = await supabaseClient.from('historial').insert([{
        bloque_id: bloque.id,
        nombre_bloque: bloque.nombre,
        nombre_pared: pared ? pared.nombre : "Desconocido",
        cambio: cambio
    }]).select().single();
    
    if (!error) mostrarToast(`Cambio de ${cambio > 0 ? '+' : ''}${cambio} realizado`, data);
}

async function eliminarRegistroHistorial(id) {
    const confirmar = await solicitarConfirmacion("¿Eliminar este registro del historial?");
    if (!confirmar) return;
    await supabaseClient.from('historial').delete().eq('id', id);
    cargarHistorial();
}

async function ejecutarUndo() {
    if (!ultimoMovimiento) return;
    
    const bloque = estado.bloques.find(b => b.id === ultimoMovimiento.bloque_id);
    if (bloque) {
        bloque.cantidad -= ultimoMovimiento.cambio;
        await supabaseClient.from('bloques').update({ cantidad: bloque.cantidad }).eq('id', bloque.id);
        renderizarBloques();
        calcularTotalGlobal();
    }
    
    await supabaseClient.from('historial').delete().eq('id', ultimoMovimiento.id);
    document.getElementById('toast-undo').classList.add('oculto');
    ultimoMovimiento = null;
}

async function cargarHistorial() {
    const inicio = document.getElementById('fecha-inicio').value;
    const fin = document.getElementById('fecha-fin').value;
    
    let query = supabaseClient.from('historial').select('*').order('created_at', { ascending: false });
    if (inicio) query = query.gte('created_at', inicio);
    if (fin) query = query.lte('created_at', fin + 'T23:59:59');
    
    const { data } = await query;
    const lista = document.getElementById('lista-historial');
    lista.innerHTML = data.map(m => `
        <div class="historial-row">
            <div>
                <b>${m.nombre_bloque}</b> (${m.nombre_pared})<br>
                <small>${new Date(m.created_at).toLocaleString()}</small>
            </div>
            <div style="display:flex; align-items:center; gap: 10px;">
                <b>${m.cambio > 0 ? '+' : ''}${m.cambio}</b>
                <button class="btn-control btn-eliminar" onclick="eliminarRegistroHistorial('${m.id}')" style="padding: 2px 5px; width: auto; height: auto;">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

// --- 8. RENDERIZADO ---
function renderizarParedes() {
    if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
    listaParedesUI.innerHTML = '';
    const paredesFiltradas = estado.paredes.filter(p => !estado.busqueda || p.nombre.toLowerCase().includes(estado.busqueda));

    paredesFiltradas.forEach((pared, index) => {
        const li = document.createElement('li');
        li.className = `pared-item ${(!estado.busqueda && estado.paredActivaId === pared.id) ? 'activa' : ''}`;
        li.dataset.id = pared.id;
        li.innerHTML = `
            <div class="pared-numero">${index + 1}</div>
            <div class="pared-drag-handle"><i data-lucide="grip-vertical" style="width: 16px; height: 16px;"></i></div>
            <div class="pared-right-panel" onclick="seleccionarPared('${pared.id}', '${pared.nombre}')">
                <input type="text" class="pared-input-nombre" value="${pared.nombre}" readonly>
                <div class="pared-controles">
                    <button class="btn-control" onclick="event.stopPropagation(); abrirModalEditar('${pared.id}')"><i data-lucide="pencil" style="width: 16px; height: 16px;"></i></button>
                    <button class="btn-control btn-eliminar" onclick="event.stopPropagation(); eliminarPared('${pared.id}', event)"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>
                </div>
            </div>
        `;
        listaParedesUI.appendChild(li);
    });

    lucide.createIcons();
    sortableInstance = new Sortable(listaParedesUI, {
        animation: 150, handle: '.pared-drag-handle',
        onEnd: async (evt) => {
            const elementos = Array.from(listaParedesUI.children);
            elementos.forEach((li, index) => {
                const pared = estado.paredes.find(p => p.id === li.dataset.id);
                if (pared) pared.posicion = index;
            });
            estado.paredes.sort((a, b) => a.posicion - b.posicion);
            for (let i = 0; i < estado.paredes.length; i++) {
                await supabaseClient.from('paredes').update({ posicion: i }).eq('id', estado.paredes[i].id);
            }
            renderizarParedes();
        }
    });
}

function renderizarBloques() {
    listaBloquesUI.innerHTML = '';
    const tituloParedUI = document.getElementById('titulo-pared-dinamico');
    const totalContainerUI = document.getElementById('total-container');

    // --- FIX: Actualización del nombre de la pared en el título ---
    if (estado.busqueda) {
        tituloParedUI.innerHTML = `Pared: <b>Resultados de búsqueda</b>`;
    } else if (estado.paredActivaId) {
        const paredActiva = estado.paredes.find(p => p.id === estado.paredActivaId);
        tituloParedUI.innerHTML = `Pared: <b>${paredActiva ? paredActiva.nombre : 'Seleccionada'}</b>`;
    } else {
        tituloParedUI.innerHTML = `Pared: <b>Selecciona una</b>`;
    }
    // -----------------------------------------------------------

    let bloquesAMostrar = [];
    if (estado.busqueda) {
        bloquesAMostrar = estado.bloques.filter(b => {
            const pared = estado.paredes.find(p => p.id === b.pared_id);
            return b.nombre.toLowerCase().includes(estado.busqueda) || (pared && pared.nombre.toLowerCase().includes(estado.busqueda));
        });
    } else if (estado.paredActivaId) {
        bloquesAMostrar = estado.bloques.filter(b => b.pared_id === estado.paredActivaId);
    }

    if (bloquesAMostrar.length === 0 && (estado.busqueda || estado.paredActivaId)) {
        listaBloquesUI.innerHTML = '<p class="mensaje-vacio">No se encontraron resultados.</p>';
    } else {
        bloquesAMostrar.forEach(bloque => {
            const paredEncontrada = estado.paredes.find(pa => pa.id === bloque.pared_id);
            const nombrePared = paredEncontrada ? paredEncontrada.nombre : "Pared no encontrada";
            const divRow = document.createElement('div');
            divRow.className = 'bloque-row';
            divRow.innerHTML = `
                <div class="bloque-main-panel">
                    <span class="bloque-nombre">Bloque: ${bloque.nombre}</span>
                    <div class="controles-container">
                        <input type="number" class="input-cantidad" value="${bloque.cantidad}" onchange="editarCantidadDirecta('${bloque.id}', this.value)">
                        <div class="botones-fila">
                            <button class="btn-sum-res btn-minus" onclick="actualizarCantidad('${bloque.id}', -1)">-</button>
                            <button class="btn-sum-res btn-plus" onclick="actualizarCantidad('${bloque.id}', 1)">+</button>
                        </div>
                    </div>
                </div>
                <div class="bloque-side">
                    <div class="pared-meta">Pared:<br><b>${nombrePared}</b></div>
                    <button class="btn-eliminar-bloque" onclick="eliminarBloque('${bloque.id}')"><i data-lucide="trash-2" style="width: 18px; height: 18px;"></i></button>
                </div>
            `;
            listaBloquesUI.appendChild(divRow);
        });
    }
    lucide.createIcons();
    if (totalContainerUI) {
        const total = bloquesAMostrar.reduce((sum, b) => sum + b.cantidad, 0);
        totalContainerUI.innerHTML = `<div class="total-panel" style="margin-top:10px; font-weight:bold;">Total: ${total}</div>`;
    }
}

// --- 9. ACCIONES Y CRUD (CON BATCHING) ---
async function actualizarCantidad(bloqueId, cambio) {
    const b = estado.bloques.find(x => x.id === bloqueId);
    if (!b || (b.cantidad + cambio < 0)) return;

    // 1. UI Inmediata (Feedback instantáneo)
    b.cantidad += cambio;
    renderizarBloques();
    calcularTotalGlobal();

    // 2. Acumulación (Batching)
    if (!pendingChanges[bloqueId]) pendingChanges[bloqueId] = 0;
    pendingChanges[bloqueId] += cambio;

    // 3. Timer (800ms) para consolidar petición
    if (changeTimers[bloqueId]) clearTimeout(changeTimers[bloqueId]);

    changeTimers[bloqueId] = setTimeout(async () => {
        const totalAcumulado = pendingChanges[bloqueId];
        pendingChanges[bloqueId] = 0; // reset
        
        await supabaseClient.from('bloques').update({ cantidad: b.cantidad }).eq('id', bloqueId);
        await registrarMovimiento(b, totalAcumulado);
    }, 800);
}

async function editarCantidadDirecta(bloqueId, nuevoValor) {
    const cantidad = parseInt(nuevoValor);
    if (isNaN(cantidad) || cantidad < 0) return;
    const bloque = estado.bloques.find(b => b.id === bloqueId);
    if (bloque) {
        bloque.cantidad = cantidad;
        await supabaseClient.from('bloques').update({ cantidad: cantidad }).eq('id', bloqueId);
        renderizarBloques();
        calcularTotalGlobal();
    }
}

function calcularTotalGlobal() {
  const total = estado.bloques.reduce((sum, b) => sum + b.cantidad, 0);
  totalGlobalUI.textContent = total;
}

function solicitarConfirmacion(mensaje) {
  modalConfirm.classList.remove('oculto');
  document.getElementById('confirm-msg').textContent = mensaje;
  return new Promise((resolve) => {
    const cerrarModal = () => {
      modalConfirm.classList.add('oculto');
      btnConfirmSi.removeEventListener('click', onSi);
      btnConfirmNo.removeEventListener('click', onNo);
    };
    const onSi = () => { cerrarModal(); resolve(true); };
    const onNo = () => { cerrarModal(); resolve(false); };
    btnConfirmSi.addEventListener('click', onSi);
    btnConfirmNo.addEventListener('click', onNo);
  });
}

async function eliminarPared(id, event) {
  event.stopPropagation();
  const confirmar = await solicitarConfirmacion("¿Seguro que quieres eliminar la pared?");
  if (!confirmar) return;
  estado.paredes = estado.paredes.filter(p => p.id !== id);
  estado.bloques = estado.bloques.filter(b => b.pared_id !== id);
  if (estado.paredActivaId === id) { estado.paredActivaId = null; }
  renderizarParedes(); renderizarBloques(); calcularTotalGlobal();
  await supabaseClient.from('paredes').delete().eq('id', id);
}

async function eliminarBloque(id) {
  const confirmar = await solicitarConfirmacion("¿Seguro que quieres eliminar el bloque?");
  if (!confirmar) return;
  estado.bloques = estado.bloques.filter(b => b.id !== id);
  renderizarBloques(); calcularTotalGlobal();
  await supabaseClient.from('bloques').delete().eq('id', id);
}

// --- 10. MODALES ---
btnNuevaPared.onclick = () => modal.classList.remove('oculto');
btnCancelar.onclick = () => {
  modal.classList.add('oculto');
  contenedorBloquesDinamicos.innerHTML = '';
  document.getElementById('input-nombre-pared').value = '';
  document.getElementById('input-num-bloques').value = '';
  btnGuardarPared.disabled = true;
  estado.paredIdEnEdicion = null;
};

btnGenerarBloques.onclick = () => {
  const numDeseado = parseInt(document.getElementById('input-num-bloques').value);
  const container = contenedorBloquesDinamicos;
  const inputsActuales = Array.from(container.querySelectorAll('.bloque-dinamico-input'));
  const valoresPreservados = inputsActuales.map(input => ({ nombre: input.value, id: input.dataset.bloqueId || null, cantidad: input.dataset.cantidad || 0 }));
  container.innerHTML = '';
  for (let i = 0; i < numDeseado; i++) {
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'input-form bloque-dinamico-input';
    input.placeholder = `Bloque ${i + 1}`;
    if (valoresPreservados[i]) { input.value = valoresPreservados[i].nombre; input.dataset.bloqueId = valoresPreservados[i].id; input.dataset.cantidad = valoresPreservados[i].cantidad; }
    container.appendChild(input);
  }
  btnGuardarPared.disabled = false;
};

btnGuardarPared.onclick = async () => {
  const nombre = document.getElementById('input-nombre-pared').value;
  const inputs = document.querySelectorAll('.bloque-dinamico-input');
  if (!nombre) { mostrarAlerta("El nombre es obligatorio"); return; }

  if (estado.paredIdEnEdicion) {
    const bloquesOriginales = estado.bloques.filter(b => b.pared_id === estado.paredIdEnEdicion);
    const idsEnInputs = Array.from(inputs).filter(i => i.dataset.bloqueId).map(i => i.dataset.bloqueId);
    const aEliminar = bloquesOriginales.filter(b => !idsEnInputs.includes(b.id));
    const bloqueConDatos = aEliminar.find(b => parseInt(b.cantidad) > 0);
    if (bloqueConDatos) { mostrarAlerta(`No puedes eliminar el bloque "${bloqueConDatos.nombre}" porque tiene unidades.`); return; }
    for (let b of aEliminar) { await supabaseClient.from('bloques').delete().eq('id', b.id); }
  }

  btnGuardarPared.disabled = true;
  if (estado.paredIdEnEdicion) {
    await supabaseClient.from('paredes').update({ nombre }).eq('id', estado.paredIdEnEdicion);
    for (let input of inputs) {
      if (input.dataset.bloqueId) { await supabaseClient.from('bloques').update({ nombre: input.value }).eq('id', input.dataset.bloqueId); }
      else { await supabaseClient.from('bloques').insert({ pared_id: estado.paredIdEnEdicion, nombre: input.value, cantidad: 0 }); }
    }
  } else {
    const { data: p } = await supabaseClient.from('paredes').insert([{ nombre }]).select().single();
    const bloquesNuevos = Array.from(inputs).map(i => ({ pared_id: p.id, nombre: i.value, cantidad: 0 }));
    await supabaseClient.from('bloques').insert(bloquesNuevos);
  }
  await iniciarApp();
  btnCancelar.click();
};

function abrirModalEditar(id) {
  const pared = estado.paredes.find(p => p.id === id);
  const bloquesDePared = estado.bloques.filter(b => b.pared_id === id);
  if (!pared) return;
  estado.paredIdEnEdicion = id;
  document.getElementById('input-nombre-pared').value = pared.nombre;
  document.getElementById('input-num-bloques').value = bloquesDePared.length;
  contenedorBloquesDinamicos.innerHTML = '';
  bloquesDePared.forEach(b => {
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'input-form bloque-dinamico-input';
    input.value = b.nombre; input.dataset.bloqueId = b.id; input.dataset.cantidad = b.cantidad;
    contenedorBloquesDinamicos.appendChild(input);
  });
  modal.classList.remove('oculto');
  btnGuardarPared.disabled = false;
  btnGuardarPared.textContent = "Actualizar";
}

function mostrarAlerta(mensaje) {
  const modalAlerta = document.getElementById('modal-alerta');
  document.getElementById('alerta-msg').textContent = mensaje;
  modalAlerta.classList.remove('oculto');
  document.getElementById('btn-alerta-cerrar').onclick = () => modalAlerta.classList.add('oculto');
}

iniciarApp();