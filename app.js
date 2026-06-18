// --- 1. CONFIGURACIÓN SUPABASE ---
const SUPABASE_URL = "https://hjpbtlkcyojxxrjvxvdb.supabase.co";
const SUPABASE_KEY = "sb_publishable_e5z1IHGIP56qwXEi9-a0vQ_iAFMsXXy";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// --- 2. ESTADO Y VARIABLES ---
let estado = { paredes: [], bloques: [], paredActivaId: null, busqueda: "", paredIdEnEdicion: null, ordenBloques: 'nombre-asc' };
let edicionParedesHabilitada = false;
let sortableInstance = null;
let toastTimer = null; 
let pendingChanges = {}; 
let changeTimers = {};
let modoSeleccionHistorial = false;
let historialSeleccionado = new Set();

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

const buscadorHistorialUI = document.getElementById('buscador-historial');
const btnEliminarSeleccionados = document.getElementById('btn-eliminar-seleccionados');
const btnCancelarSeleccion = document.getElementById('btn-cancelar-seleccion');
const contadorSeleccionUI = document.getElementById('contador-seleccion');
const barraAccionesHistorial = document.getElementById('historial-acciones-seleccion');

// --- 4. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    iniciarApp();
    inicializarControlesEdicion();
    inicializarMenuOrdenamiento();
    inicializarControlesHistorial();
    lucide.createIcons(); // Asegura que los íconos se creen en la carga inicial
    inicializarBuscadorHistorial(); // Inicializamos el nuevo buscador
});

async function iniciarApp() {
    await cargarParedes();
    await cargarBloques();
    renderizarParedes();
    renderizarBloques();
    calcularTotalGlobal();
    lucide.createIcons(); // Re-crea los íconos después de renderizar contenido dinámico
}

function inicializarControlesEdicion() {
    const listaParedesElement = document.getElementById('lista-paredes'); // Apunta directamente a la lista
    const btnActivar = document.getElementById('btn-activar-edicion');
    const btnCancelarEd = document.getElementById('btn-cancelar-edicion');
    if (!btnActivar || !btnCancelarEd) return;

    btnActivar.onclick = () => {
        edicionParedesHabilitada = true;
        listaParedesElement.classList.remove('seccion-bloqueada'); // Remueve la clase de la lista
        btnActivar.style.display = 'none';
        btnCancelarEd.style.display = 'block';
        renderizarParedes(); // Re-renderiza para habilitar Sortable y mostrar controles
    };

    btnCancelarEd.onclick = () => {
        edicionParedesHabilitada = false;
        listaParedesElement.classList.add('seccion-bloqueada'); // Añade la clase a la lista
        btnActivar.style.display = 'block';
        btnCancelarEd.style.display = 'none';
        renderizarParedes();
        renderizarBloques();
    };
}

function inicializarMenuOrdenamiento() {
    const btnOrdenar = document.getElementById('btn-ordenar-bloques');
    const menu = document.getElementById('menu-ordenar');

    const opcionesOrden = [
        { clave: 'nombre-asc', texto: 'Ordenar de A-Z' },
        { clave: 'nombre-desc', texto: 'Ordenar de Z-A' }
    ];

    menu.innerHTML = opcionesOrden.map(opt => `<a href="#" data-orden="${opt.clave}">${opt.texto}</a>`).join('');

    btnOrdenar.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('oculto');
    });

    menu.addEventListener('click', (e) => {
        e.preventDefault();
        if (e.target.tagName === 'A') {
            estado.ordenBloques = e.target.dataset.orden;
            menu.classList.add('oculto');
            renderizarBloques();
        }
    });

    // Añadimos un indicador visual para la opción activa
    menu.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            // Quita la clase 'activa' de todos los enlaces
            menu.querySelectorAll('a').forEach(a => a.classList.remove('activa'));
            // Añade la clase 'activa' al enlace clickeado
            e.target.classList.add('activa');
        }
    });

    document.addEventListener('click', () => menu.classList.add('oculto'));
}

function inicializarControlesHistorial() {
    btnCancelarSeleccion.addEventListener('click', salirModoSeleccion);
    btnEliminarSeleccionados.addEventListener('click', async () => {
        if (historialSeleccionado.size === 0) return;
        const confirmar = await solicitarConfirmacion(`¿Deseas eliminar los ${historialSeleccionado.size} elementos?`);
        if (confirmar) {
            const idsParaEliminar = Array.from(historialSeleccionado);
            await supabaseClient.from('historial').delete().in('id', idsParaEliminar);
            mostrarFeedback(`${historialSeleccionado.size} registros eliminados`, "trash-2", "#ef4444");
            salirModoSeleccion();
            cargarHistorial();
        }
    });
}

function inicializarBuscadorHistorial() {
    // Añadimos el listener al buscador del historial una sola vez
    buscadorHistorialUI.addEventListener('input', cargarHistorial);
}

// --- 5. CARGA DE DATOS ---
async function cargarParedes() {
    const { data, error } = await supabaseClient.from('paredes').select('*').order('posicion', { ascending: true });
    if (!error) estado.paredes = data;
}

async function cargarBloques() {
    const { data, error } = await supabaseClient.from('bloques').select('*');
    if (!error) estado.bloques = data;
}

// --- 6. BUSCADOR ---
buscadorUI.addEventListener('input', (e) => {
    estado.busqueda = e.target.value.toLowerCase().trim();
    renderizarParedes();
    renderizarBloques();
});

// --- 7. SELECCIÓN Y VISTAS ---
function seleccionarPared(id, nombre) {
    // Esta función debe funcionar siempre para poder ver los bloques
    estado.paredActivaId = id;
    estado.busqueda = "";
    buscadorUI.value = "";
    renderizarParedes();
    renderizarBloques();
}

function toggleModo() {
    const appLayout = document.querySelector('.app-layout');
    const historialSec = document.getElementById('seccion-historial');
    const slideDefault = document.getElementById('slide-default');
    const slideAlternate = document.getElementById('slide-alternate');
    const btnToggle = document.getElementById('btn-toggle-vista');
    
    if (appLayout.style.display === 'none') {
        // Volver al inventario
        appLayout.style.display = 'flex';
        historialSec.style.display = 'none';
        btnToggle.classList.remove('is-alternate'); // Quita la clase para volver al color original
        slideDefault.style.transform = 'translateY(0)';
        slideAlternate.style.transform = 'translateY(100%)';
    } else {
        // Ir al historial
        appLayout.style.display = 'none';
        historialSec.style.display = 'block';
        btnToggle.classList.add('is-alternate'); // Añade la clase para el color mostaza
        slideDefault.style.transform = 'translateY(-100%)';
        slideAlternate.style.transform = 'translateY(0)';
        cargarHistorial();
    }
    lucide.createIcons(); // Re-renderiza los íconos para que el cambio sea visible
}

function actualizarHeaderInfo() {
    // 1. Actualizar fecha
    const fechaUI = document.getElementById('header-fecha');
    if (fechaUI) {
        const ahora = new Date();
        const dia = ahora.getDate().toString().padStart(2, '0');
        const mes = ahora.toLocaleString('es-ES', { month: 'short' }).toUpperCase().replace('.', '');
        const anio = ahora.getFullYear().toString().slice(-2);
        fechaUI.textContent = `${dia}-${mes}-${anio}`;
    }

    // 2. Asegurar que el ícono del botón de historial esté presente
    lucide.createIcons();

    // 3. Actualizar panel de fecha en la sección de historial
    const panelFechaHistorial = document.getElementById('fecha-actual');
    if (panelFechaHistorial) {
        panelFechaHistorial.textContent = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    }
}

// --- 8. HISTORIAL, UNDO Y ELIMINACIÓN ---
function mostrarToast(mensaje) {
    const toast = document.getElementById('toast-undo');
    const msgElement = document.getElementById('toast-msg');
    if (msgElement) msgElement.textContent = mensaje;
    toast.classList.remove('oculto');
    lucide.createIcons(); // Asegura que el ícono se renderice
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('oculto'), 5000);
}

async function registrarMovimiento(bloque, cambio) {
    const pared = estado.paredes.find(p => p.id === bloque.pared_id);
    const { error } = await supabaseClient.from('historial').insert([{
        bloque_id: bloque.id,
        nombre_bloque: bloque.nombre,
        nombre_pared: pared ? pared.nombre : "Desconocido",
        cambio: cambio
    }]);
    if (!error) mostrarToast(`Cambio de ${cambio > 0 ? '+' : ''}${cambio} registrado`);
}

async function cargarHistorial() {
    const inicio = document.getElementById('fecha-inicio').value;
    const fin = document.getElementById('fecha-fin').value;
    const busquedaHistorial = document.getElementById('buscador-historial').value.toLowerCase().trim();

    // Si los campos de fecha están vacíos, los rellenamos con la fecha de hoy
    if (!document.getElementById('fecha-inicio').value) {
        document.getElementById('fecha-inicio').valueAsDate = new Date();
    }
    if (!document.getElementById('fecha-fin').value) {
        document.getElementById('fecha-fin').valueAsDate = new Date();
    }

    let query = supabaseClient.from('historial').select('*').order('created_at', { ascending: false });
    if (inicio) query = query.gte('created_at', inicio);
    if (fin) query = query.lte('created_at', fin + 'T23:59:59');
    
    let { data } = await query;

    if (busquedaHistorial && data) {
        data = data.filter(m => 
            m.nombre_bloque.toLowerCase().includes(busquedaHistorial) ||
            m.nombre_pared.toLowerCase().includes(busquedaHistorial) ||
            new Date(m.created_at).toLocaleString('es-ES').includes(busquedaHistorial)
        );
    }

    const lista = document.getElementById('lista-historial');
    lista.innerHTML = data.map(m => `
        <div class="historial-row ${historialSeleccionado.has(m.id) ? 'seleccionado' : ''}" data-id="${m.id}">
            <div><b>${m.nombre_bloque}</b> (${m.nombre_pared})<br><small>${new Date(m.created_at).toLocaleString()}</small></div>
            <div style="display:flex; align-items:center; gap: 10px;">
                <b style="font-size: 1.2rem; color: ${m.cambio > 0 ? '#16a34a' : '#ef4444'};">${m.cambio > 0 ? '+' : ''}${m.cambio}</b>
                <div class="control-historial" data-id="${m.id}">
                    ${modoSeleccionHistorial 
                        ? `<i data-lucide="${historialSeleccionado.has(m.id) ? 'check-circle-2' : 'circle'}" style="width: 20px; height: 20px; color: var(--primary);"></i>`
                        : `<button class="btn-control btn-eliminar" style="padding: 4px 8px; flex: 0;"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>`
                    }
                </div>
            </div>
        </div>
    `).join('');

    // Añadir listeners para la selección
    lista.querySelectorAll('.historial-row').forEach(row => {
        let pressTimer;
        const startPress = () => {
            pressTimer = setTimeout(() => entrarModoSeleccion(row.dataset.id), 500); // 500ms para long press
        };
        const cancelPress = () => clearTimeout(pressTimer);

        row.addEventListener('mousedown', startPress);
        row.addEventListener('mouseup', cancelPress);
        row.addEventListener('mouseleave', cancelPress);
        row.addEventListener('touchstart', startPress);
        row.addEventListener('touchend', cancelPress);
        row.addEventListener('touchmove', cancelPress);
        row.addEventListener('click', () => {
            if (modoSeleccionHistorial) {
                toggleSeleccionHistorial(row.dataset.id);
            }
        });

        const control = row.querySelector('.control-historial');
        if (control && !modoSeleccionHistorial) {
            control.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                eliminarRegistroHistorial(row.dataset.id);
            });
        }
    });

    // Actualizar visibilidad de botones
    if (modoSeleccionHistorial) {
        barraAccionesHistorial.classList.remove('oculto');
        const texto = historialSeleccionado.size === 1 ? '1 seleccionado' : `${historialSeleccionado.size} seleccionados`;
        contadorSeleccionUI.textContent = texto;
    } else {
        barraAccionesHistorial.classList.add('oculto');
    }

    lucide.createIcons();
}

async function eliminarRegistroHistorial(id) {
    if (!(await solicitarConfirmacion("¿Eliminar este registro?"))) return;
    await supabaseClient.from('historial').delete().eq('id', id);
    cargarHistorial();
    mostrarFeedback("Registro de historial eliminado", "trash-2", "#ef4444");
}

function entrarModoSeleccion(idInicial) {
    if (modoSeleccionHistorial) return;
    modoSeleccionHistorial = true;
    historialSeleccionado.add(parseInt(idInicial)); // Convertimos el ID a número
    cargarHistorial(); // Re-renderizar para mostrar checkboxes
}

function toggleSeleccionHistorial(id) {
    const idNum = parseInt(id);
    if (historialSeleccionado.has(idNum)) {
        historialSeleccionado.delete(idNum);
    } else {
        historialSeleccionado.add(idNum);
    }
    cargarHistorial(); // Re-renderizar para actualizar el estado del checkbox
}

function salirModoSeleccion() {
    modoSeleccionHistorial = false;
    historialSeleccionado.clear();
    cargarHistorial();
}

// --- 9. LÓGICA DE ACTUALIZACIÓN Y UNDO ---
async function ejecutarUndo() {
    const bloqueId = Object.keys(pendingChanges).find(id => pendingChanges[id] !== 0);
    if (!bloqueId) return;
    const b = estado.bloques.find(x => x.id === bloqueId);
    if (!b) return;
    if (changeTimers[bloqueId]) { clearTimeout(changeTimers[bloqueId]); changeTimers[bloqueId] = null; }
    b.cantidad -= pendingChanges[bloqueId];
    pendingChanges[bloqueId] = 0;
    renderizarBloques();
    calcularTotalGlobal();
    document.getElementById('toast-undo').classList.add('oculto');
    mostrarToast("Acción deshecha");
}

async function actualizarCantidad(bloqueId, cambio) {
    const b = estado.bloques.find(x => x.id === bloqueId);
    if (!b || (b.cantidad + cambio < 0)) return;
    b.cantidad += cambio;
    renderizarBloques();
    calcularTotalGlobal();
    if (!pendingChanges[bloqueId]) pendingChanges[bloqueId] = 0;
    pendingChanges[bloqueId] += cambio;
    mostrarToast(`Cambio: ${pendingChanges[bloqueId] > 0 ? '+' : ''}${pendingChanges[bloqueId]}`);
    if (changeTimers[bloqueId]) clearTimeout(changeTimers[bloqueId]);
    changeTimers[bloqueId] = setTimeout(async () => {
        if (pendingChanges[bloqueId] === 0) return;
        const totalAcumulado = pendingChanges[bloqueId];
        await supabaseClient.from('bloques').update({ cantidad: b.cantidad }).eq('id', bloqueId);
        const pared = estado.paredes.find(p => p.id === b.pared_id);
        await supabaseClient.from('historial').insert([{ bloque_id: b.id, nombre_bloque: b.nombre, nombre_pared: pared?.nombre || "Desconocido", cambio: totalAcumulado }]);
        pendingChanges[bloqueId] = 0;
        document.getElementById('toast-undo').classList.add('oculto');
    }, 3000);
}

async function editarCantidadDirecta(bloqueId, nuevoValor) {
    const cantidadNueva = parseInt(nuevoValor);
    if (isNaN(cantidadNueva) || cantidadNueva < 0) return;
    const bloque = estado.bloques.find(b => b.id === bloqueId);
    if (!bloque) return;
    const cambio = cantidadNueva - bloque.cantidad;
    if (cambio !== 0) {
        bloque.cantidad = cantidadNueva;
        await supabaseClient.from('bloques').update({ cantidad: cantidadNueva }).eq('id', bloqueId);
        await registrarMovimiento(bloque, cambio);

        renderizarBloques();
        calcularTotalGlobal();
    }
}

// --- 10. RENDERIZADO ---
function renderizarParedes() {
    if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
    listaParedesUI.innerHTML = '';
    const filtradas = estado.paredes.filter(p => !estado.busqueda || p.nombre.toLowerCase().includes(estado.busqueda));
    filtradas.forEach((pared, index) => {
        const li = document.createElement('li');
        li.className = `pared-item ${(!estado.busqueda && estado.paredActivaId === pared.id) ? 'activa' : ''}`;
        li.dataset.id = pared.id;
        li.innerHTML = ` 
            <div class="pared-numero">${index + 1}</div> 
            <div class="pared-drag-handle"><i data-lucide="grip-vertical" style="width: 16px; height: 16px;"></i></div> 
            <div class="pared-content" onclick="seleccionarPared('${pared.id}', '${pared.nombre}')"> 
                <input type="text" class="pared-input-nombre" value="${pared.nombre}" readonly>
                <div class="pared-controles"> 
                    <button onclick="event.stopPropagation(); abrirModalEditar('${pared.id}')" class="btn-control"><i data-lucide="pencil" style="width: 16px;"></i></button>
                    <button onclick="event.stopPropagation(); eliminarPared('${pared.id}', event)" class="btn-control btn-eliminar"><i data-lucide="trash-2" style="width: 16px;"></i></button>
                </div>
            </div>`;
        listaParedesUI.appendChild(li);
    });
    lucide.createIcons();
    if (edicionParedesHabilitada) {
        sortableInstance = new Sortable(listaParedesUI, {
            animation: 150, handle: '.pared-drag-handle',
            onEnd: async () => {
                const elementos = Array.from(listaParedesUI.children);
                for(let i=0; i<elementos.length; i++) {
                    const pared = estado.paredes.find(p => p.id === elementos[i].dataset.id);
                    if (pared) await supabaseClient.from('paredes').update({ posicion: i }).eq('id', pared.id);
                }
                await iniciarApp();
            }
        });
    }
}

function renderizarBloques() {
    listaBloquesUI.innerHTML = '';
    const tituloParedUI = document.getElementById('titulo-pared-dinamico');
    const totalParedUI = document.getElementById('total-pared-panel');
    
    if (estado.busqueda) {
        tituloParedUI.innerHTML = `<span class="panel-label">Mostrando resultados para:</span><b class="panel-value">Búsqueda</b>`;
    } else if (estado.paredActivaId) {
        const p = estado.paredes.find(x => x.id === estado.paredActivaId);
        tituloParedUI.innerHTML = `<span class="panel-label">Pared:</span><b class="panel-value">${p ? p.nombre : 'Seleccionada'}</b>`;
        const bloquesDePared = estado.bloques.filter(b => b.pared_id === estado.paredActivaId);
        const totalPared = bloquesDePared.reduce((sum, b) => sum + b.cantidad, 0);
        totalParedUI.innerHTML = `<span class="panel-label">Total Pared:</span><b class="panel-value">${totalPared}</b>`;
    } else {
        tituloParedUI.innerHTML = `<span class="panel-label">Pared:</span><b class="panel-value">Selecciona una</b>`;
        totalParedUI.innerHTML = `<span class="panel-label">Total Pared:</span><b class="panel-value">0</b>`;
    }

    let mostrar = estado.busqueda ? 
        estado.bloques.filter(b => b.nombre.toLowerCase().includes(estado.busqueda)) : 
        estado.bloques.filter(b => b.pared_id === estado.paredActivaId);

    // Aplicar ordenamiento
    mostrar.sort((a, b) => {
        switch (estado.ordenBloques) {
            case 'nombre-asc':
                return a.nombre.localeCompare(b.nombre);
            case 'nombre-desc':
                return b.nombre.localeCompare(a.nombre);
            default:
                return 0;
        }
    });

    mostrar.forEach(bloque => {
        const pared = estado.paredes.find(pa => pa.id === bloque.pared_id);
        const div = document.createElement('div');
        div.className = 'bloque-row';
        div.innerHTML = `
            <div class="bloque-main-panel">
                <span class="bloque-nombre"><span class="label">Bloque:</span> <span class="value">${bloque.nombre}</span></span>
                <div class="controles-container">
                    <input type="number" class="input-cantidad" value="${bloque.cantidad}" onchange="editarCantidadDirecta('${bloque.id}', this.value)">
                    <div class="botones-fila">
                        <button onclick="actualizarCantidad('${bloque.id}', -1)" class="btn-sum-res btn-minus"><i data-lucide="minus" style="width: 18px;"></i></button>
                        <button onclick="actualizarCantidad('${bloque.id}', 1)" class="btn-sum-res btn-plus"><i data-lucide="plus" style="width: 18px;"></i></button>
                    </div>
                </div>
            </div>
            <div class="bloque-side">
                <div class="pared-meta">Pared:<br><b>${pared?.nombre || "N/A"}</b></div>
                <button onclick="eliminarBloque('${bloque.id}')" class="btn-control btn-eliminar" style="flex: 0; padding: 8px;"><i data-lucide="trash-2" style="width: 18px;"></i></button>
            </div>`;
        listaBloquesUI.appendChild(div);
    });
    lucide.createIcons();
}

function calcularTotalGlobal() {
    totalGlobalUI.textContent = estado.bloques.reduce((sum, b) => sum + b.cantidad, 0);
}

// --- 11. MODALES Y GESTIÓN DE ELEMENTOS ---
async function eliminarPared(id, event) {
    event.stopPropagation();
    const confirmar = await solicitarConfirmacion("¿Seguro que quieres eliminar la pared?");
    if (!confirmar) return;

    // Lógica funcional restaurada:
    // 1. Actualizar la UI inmediatamente
    estado.paredes = estado.paredes.filter(p => p.id !== id);
    estado.bloques = estado.bloques.filter(b => b.pared_id !== id);
    if (estado.paredActivaId === id) { estado.paredActivaId = null; }
    renderizarParedes(); renderizarBloques(); calcularTotalGlobal();

    // 2. Enviar las órdenes de eliminación a la base de datos
    await supabaseClient.from('bloques').delete().eq('pared_id', id);
    await supabaseClient.from('paredes').delete().eq('id', id);

    mostrarFeedback("Pared eliminada correctamente", "trash-2", "#ef4444");
}

async function eliminarBloque(id) {
    const confirmar = await solicitarConfirmacion("¿Seguro que quieres eliminar el bloque?");
    if (!confirmar) return;

    // Lógica funcional restaurada:
    estado.bloques = estado.bloques.filter(b => b.id !== id);
    renderizarBloques(); calcularTotalGlobal();
    await supabaseClient.from('bloques').delete().eq('id', id);

    mostrarFeedback("Bloque eliminado correctamente", "trash-2", "#ef4444");
}

async function solicitarConfirmacion(mensaje) {
    modalConfirm.classList.remove('oculto');
    document.getElementById('confirm-msg').textContent = mensaje;
    return new Promise((resolve) => {
        const cerrar = () => { modalConfirm.classList.add('oculto'); btnConfirmSi.removeEventListener('click', onSi); btnConfirmNo.removeEventListener('click', onNo); };
        const onSi = () => { cerrar(); resolve(true); };
        const onNo = () => { cerrar(); resolve(false); };
        btnConfirmSi.addEventListener('click', onSi);
        btnConfirmNo.addEventListener('click', onNo);
    });
}

function abrirModalNuevaPared() {
    estado.paredIdEnEdicion = null;
    document.getElementById('input-nombre-pared').value = '';
    document.getElementById('input-num-bloques').value = '';
    contenedorBloquesDinamicos.innerHTML = '';
    btnGuardarPared.disabled = true;
    btnGuardarPared.querySelector('.btn-pushable-front').textContent = "Guardar"; // Actualiza el texto del span frontal
    modal.querySelector('h3').textContent = "Agregar Nueva Pared"; // Título del modal
    modal.classList.remove('oculto');
}

function cerrarYLimpiarModal() {
    modal.classList.add('oculto');
    estado.paredIdEnEdicion = null;
}

btnCancelar.onclick = cerrarYLimpiarModal;

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
    
    // Lógica de eliminación de bloques del modal (de la versión que funcionaba)
    if (estado.paredIdEnEdicion) {
        const bloquesOriginales = estado.bloques.filter(b => b.pared_id === estado.paredIdEnEdicion);
        const idsEnInputs = Array.from(inputs).filter(i => i.dataset.bloqueId).map(i => i.dataset.bloqueId);
        const aEliminar = bloquesOriginales.filter(b => !idsEnInputs.includes(b.id.toString()));
        for (let b of aEliminar) { await supabaseClient.from('bloques').delete().eq('id', b.id); }
    }

    btnGuardarPared.disabled = true;

    if (estado.paredIdEnEdicion) {
        await supabaseClient.from('paredes').update({ nombre }).eq('id', estado.paredIdEnEdicion);
        for (let input of inputs) {
            if (input.dataset.bloqueId) { await supabaseClient.from('bloques').update({ nombre: input.value }).eq('id', input.dataset.bloqueId); }
            else { await supabaseClient.from('bloques').insert({ pared_id: estado.paredIdEnEdicion, nombre: input.value, cantidad: 0 }); }
        }
        mostrarFeedback("Pared actualizada correctamente", "pencil", "var(--primary)");
    } else {
        const { data: p } = await supabaseClient.from('paredes').insert([{ nombre }]).select().single();
        const bloquesNuevos = Array.from(inputs).map(i => ({ pared_id: p.id, nombre: i.value, cantidad: 0 }));
        await supabaseClient.from('bloques').insert(bloquesNuevos);
        mostrarFeedback("Pared agregada correctamente", "check-circle", "#16a34a");
    }
    await iniciarApp();
    cerrarYLimpiarModal();
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
    modal.querySelector('h3').textContent = "Editar Pared"; // Título del modal
    btnGuardarPared.querySelector('.btn-pushable-front').textContent = "Actualizar"; // Actualiza el texto del span frontal
}

function mostrarAlerta(mensaje) {
    const modalAlerta = document.getElementById('modal-alerta');
    document.getElementById('alerta-msg').textContent = mensaje;
    modalAlerta.classList.remove('oculto');
    document.getElementById('btn-alerta-cerrar').onclick = () => modalAlerta.classList.add('oculto');
}

let feedbackTimer = null;
function mostrarFeedback(mensaje, icono, color = '#333') {
    const toast = document.getElementById('feedback-toast');
    if (!toast) return;

    toast.innerHTML = `
        <i data-lucide="${icono}" style="width: 20px; height: 20px; color: ${color}; flex-shrink: 0;"></i>
        <span style="font-weight: 500;">${mensaje}</span>
    `;
    lucide.createIcons();
    toast.classList.remove('oculto');
    toast.classList.add('show');

    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { toast.classList.remove('show'); }, 2000);
}

// INICIALIZACIÓN FINAL
actualizarHeaderInfo(); // Llama a la nueva función para establecer la fecha al inicio
iniciarApp();
