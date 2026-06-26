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
    inicializarFiltrosHistorial();
    inicializarBuscadorHistorial(); // Inicializamos el nuevo buscador

    // Restauramos las notificaciones de conexión
    window.addEventListener('online', () => {
        mostrarFeedback("Conexión restablecida.", "wifi", "#16a34a");
    });
    window.addEventListener('offline', () => mostrarFeedback("Sin conexión. Los cambios no se guardarán.", "wifi-off", "#f59e0b"));
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
    const btnToggleEdicion = document.getElementById('btn-toggle-edicion');
    if (!btnToggleEdicion) return;

    const slideEditar = document.getElementById('slide-editar');
    const slideCancelar = document.getElementById('slide-cancelar');

    btnToggleEdicion.onclick = () => {
        if (edicionParedesHabilitada) {
            // Si está habilitado, lo desactivamos (mostramos "Editar")
            edicionParedesHabilitada = false;
            listaParedesElement.classList.add('seccion-bloqueada');
            btnToggleEdicion.classList.remove('is-alternate');
            slideEditar.style.transform = 'translateY(0)'; // Vuelve a su posición
            slideCancelar.style.transform = 'translateY(100%)'; // Se oculta abajo
        } else {
            // Si está deshabilitado, lo activamos (mostramos "Cancelar")
        edicionParedesHabilitada = true;
            listaParedesElement.classList.remove('seccion-bloqueada');
            btnToggleEdicion.classList.add('is-alternate');
            slideEditar.style.transform = 'translateY(-100%)'; // Se oculta arriba
            slideCancelar.style.transform = 'translateY(0)'; // Entra desde abajo
        }
        renderizarParedes();
        renderizarBloques();
    };
}

function inicializarMenuOrdenamiento() {
    const btnOrdenar = document.getElementById('btn-ordenar-bloques');
    const menu = document.getElementById('menu-ordenar');

    const opcionesOrden = [
        { clave: 'nombre-asc', texto: 'Nombre (A-Z)' },
        { clave: 'nombre-desc', texto: 'Nombre (Z-A)' },
        { clave: 'num-asc', texto: 'Número (menor a mayor)' },
        { clave: 'num-desc', texto: 'Número (mayor a menor)' }
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

function inicializarFiltrosHistorial() {
    const btnFiltro = document.getElementById('btn-filtro-historial');
    const menu = document.getElementById('menu-filtro-historial');
    const filtrosFecha = document.getElementById('historial-filtros-fecha');
    const fechaInicioUI = document.getElementById('fecha-inicio');
    const fechaFinUI = document.getElementById('fecha-fin');

    const opcionesFiltro = [
        { clave: 'hoy', texto: 'Hoy' },
        { clave: 'mes', texto: 'Este Mes' },
        { clave: 'personalizado', texto: 'Personalizado...' }
    ];

    menu.innerHTML = opcionesFiltro.map(opt => `<a href="#" data-filtro="${opt.clave}">${opt.texto}</a>`).join('');

    btnFiltro.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('oculto');
    });

    menu.addEventListener('click', (e) => {
        e.preventDefault();
        if (e.target.tagName !== 'A') return;

        const filtro = e.target.dataset.filtro;

        // Añadimos la lógica para resaltar la opción activa
        menu.querySelectorAll('a').forEach(a => a.classList.remove('activa'));
        e.target.classList.add('activa');

        menu.classList.add('oculto');
        filtrosFecha.style.display = 'none';

        const hoy = new Date();
        let inicio, fin;

        if (filtro === 'hoy') {
            // Creamos un rango preciso que abarca desde el final de ayer hasta el principio de mañana.
            inicio = new Date(hoy);
            inicio.setHours(0, 0, 0, 0); // Hoy a las 00:00:00

            fin = new Date(hoy);
            fin.setHours(23, 59, 59, 999); // Hoy a las 23:59:59
        } else if (filtro === 'mes') {
            inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        } else if (filtro === 'personalizado') {
            filtrosFecha.style.display = 'flex';
            return; // No cargamos historial hasta que el usuario elija fechas
        }

        fechaInicioUI.valueAsDate = inicio;
        fechaFinUI.valueAsDate = fin;
        cargarHistorial();
    });

    // Carga automática al cambiar las fechas
    fechaInicioUI.addEventListener('change', cargarHistorial);
    fechaFinUI.addEventListener('change', cargarHistorial);

    document.addEventListener('click', () => menu.classList.add('oculto'));
}

function inicializarControlesHistorial() {
    btnCancelarSeleccion.addEventListener('click', salirModoSeleccion);
    btnEliminarSeleccionados.addEventListener('click', async () => {
        if (historialSeleccionado.size === 0) return;
        const confirmar = await solicitarConfirmacion(`¿Deseas eliminar los ${historialSeleccionado.size} elementos?`, 'btn-eliminar-seleccionados');
        if (confirmar) {
            mostrarSpinnerEnBoton('btn-eliminar-seleccionados', true);
            const idsParaEliminar = Array.from(historialSeleccionado);
            const { error } = await supabaseClient.from('historial').delete().in('id', idsParaEliminar);
            mostrarSpinnerEnBoton('btn-eliminar-seleccionados', false);
            if (error) {
                mostrarFeedback("Error al eliminar los registros.", "x-circle", "#ef4444");
            } else {
                mostrarFeedback(`${historialSeleccionado.size} registros eliminados`, "trash-2", "#ef4444");
                salirModoSeleccion();
                cargarHistorial();
            }
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

    let query = supabaseClient.from('historial').select('*').order('created_at', { ascending: false });
    
    if (inicio) {
        // Se establece el inicio del día en la zona horaria local del navegador
        const [y, m, d] = inicio.split('-').map(Number);
        const fechaInicio = new Date(y, m - 1, d, 0, 0, 0, 0);
        query = query.gte('created_at', fechaInicio.toISOString());
    }
    if (fin) {
        // Se establece el final del día creando la fecha del día siguiente a las 00:00:00
        // Esto evita problemas con el final del día (23:59:59) y zonas horarias.
        const [y, m, d] = fin.split('-').map(Number);
        const fechaFin = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
        query = query.lte('created_at', fechaFin.toISOString());
    }
    
    let { data, error } = await query;

    if (error) {
        mostrarFeedback("Error al cargar el historial.", "x-circle", "#ef4444");
        return;
    }

    // Calcular y mostrar movimientos de hoy
    const hoyUTC = new Date();
    const inicioHoyUTC = new Date(Date.UTC(hoyUTC.getUTCFullYear(), hoyUTC.getUTCMonth(), hoyUTC.getUTCDate(), 0, 0, 0, 0));
    const finHoyUTC = new Date(Date.UTC(hoyUTC.getUTCFullYear(), hoyUTC.getUTCMonth(), hoyUTC.getUTCDate(), 23, 59, 59, 999));

    const { count: movimientosHoy } = await supabaseClient
        .from('historial')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', inicioHoyUTC.toISOString())
        .lte('created_at', finHoyUTC.toISOString());
    
    document.getElementById('contador-movimientos-hoy').textContent = movimientosHoy || 0;

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
            if (modoSeleccionHistorial) toggleSeleccionHistorial(row.dataset.id, row);
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
    const boton = document.querySelector(`.control-historial[data-id="${id}"] button`);
    if (!(await solicitarConfirmacion("¿Eliminar este registro?", boton))) return;
    
    mostrarSpinnerEnBoton(boton, true);
    const { error } = await supabaseClient.from('historial').delete().eq('id', id);
    
    if (error) {
        mostrarSpinnerEnBoton(boton, false);
        mostrarFeedback("Error al eliminar el registro.", "x-circle", "#ef4444");
    } else {
        cargarHistorial();
        mostrarFeedback("Registro de historial eliminado", "trash-2", "#ef4444");
    }
}

function entrarModoSeleccion(idInicial) {
    if (modoSeleccionHistorial) return;
    modoSeleccionHistorial = true;
    historialSeleccionado.add(parseInt(idInicial)); // Convertimos el ID a número
    cargarHistorial(); // Re-renderizar para mostrar checkboxes
}

function toggleSeleccionHistorial(id, rowElement) {
    const idNum = parseInt(id);
    const isSelected = historialSeleccionado.has(idNum);
    const controlContainer = rowElement.querySelector('.control-historial');

    if (isSelected) {
        historialSeleccionado.delete(idNum);
        rowElement.classList.remove('seleccionado');
        // Reemplazamos el ícono de check por el de círculo
        if (controlContainer) controlContainer.innerHTML = `<i data-lucide="circle" style="width: 20px; height: 20px; color: var(--primary);"></i>`;
    } else {
        historialSeleccionado.add(idNum);
        rowElement.classList.add('seleccionado');
        // Reemplazamos el ícono de círculo por el de check
        if (controlContainer) controlContainer.innerHTML = `<i data-lucide="check-circle-2" style="width: 20px; height: 20px; color: var(--primary);"></i>`;
    }

    // Actualizamos el contador de forma instantánea
    const texto = historialSeleccionado.size === 1 ? '1 seleccionado' : `${historialSeleccionado.size} seleccionados`;
    contadorSeleccionUI.textContent = texto;

    // Si no quedan elementos seleccionados, salimos del modo selección
    if (historialSeleccionado.size === 0) salirModoSeleccion();

    lucide.createIcons(); // Volvemos a renderizar solo el ícono que cambió
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
        try {
            await supabaseClient.from('bloques').update({ cantidad: b.cantidad }).eq('id', bloqueId);
            const pared = estado.paredes.find(p => p.id === b.pared_id);
            await supabaseClient.from('historial').insert([{ bloque_id: b.id, nombre_bloque: b.nombre, nombre_pared: pared?.nombre || "Desconocido", cambio: totalAcumulado }]);
        } catch (error) {
            mostrarFeedback("Error de conexión al guardar cantidad.", "x-circle", "#ef4444");
            // Opcional: revertir el cambio en la UI si falla
        }
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
        try {
            await supabaseClient.from('bloques').update({ cantidad: cantidadNueva }).eq('id', bloqueId);
            await registrarMovimiento(bloque, cambio);
        } catch (error) {
            mostrarFeedback("Error de conexión al editar cantidad.", "x-circle", "#ef4444");
        }

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
                    try {
                        const pared = estado.paredes.find(p => p.id === elementos[i].dataset.id);
                        if (pared) await supabaseClient.from('paredes').update({ posicion: i }).eq('id', pared.id);
                    } catch (error) {
                        mostrarFeedback("Error al guardar el nuevo orden.", "x-circle", "#ef4444");
                    }
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
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    mostrar.sort((a, b) => {
        switch (estado.ordenBloques) {
            case 'nombre-asc':
                return collator.compare(a.nombre, b.nombre);
            case 'nombre-desc':
                return collator.compare(b.nombre, a.nombre);
            case 'num-asc':
                // Extrae los números de los nombres para una comparación numérica correcta
                const numA_asc = parseInt(a.nombre.match(/\d+/g)?.[0] || 0);
                const numB_asc = parseInt(b.nombre.match(/\d+/g)?.[0] || 0);
                return numA_asc - numB_asc;
            case 'num-desc':
                const numA_desc = parseInt(a.nombre.match(/\d+/g)?.[0] || 0);
                const numB_desc = parseInt(b.nombre.match(/\d+/g)?.[0] || 0);
                return numB_desc - numA_desc;
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
    const boton = event.currentTarget;
    const confirmar = await solicitarConfirmacion("¿Seguro que quieres eliminar la pared?", boton);
    if (!confirmar) return;
    try {
        mostrarSpinnerEnBoton(boton, true);
        // Primero se eliminan los bloques para no violar la restricción de la BD.
        const { error: errorBloques } = await supabaseClient.from('bloques').delete().eq('pared_id', id);
        if (errorBloques) throw new Error("Error al eliminar los bloques de la pared.");

        // Luego, se elimina la pared.
        const { error: errorPared } = await supabaseClient.from('paredes').delete().eq('id', id);
        if (errorPared) throw new Error("Error al eliminar la pared.");

        mostrarFeedback("Pared eliminada correctamente", "trash-2", "#ef4444");
        await iniciarApp(); // Recargar la UI para reflejar los cambios.
    } catch (error) {
        mostrarSpinnerEnBoton(boton, false);
        mostrarFeedback(error.message, "x-circle", "#ef4444");
    }
}

async function eliminarBloque(id) {
    // Encontrar el botón correcto para mostrar el spinner
    const boton = document.querySelector(`button[onclick="eliminarBloque('${id}')"]`);
    const confirmar = await solicitarConfirmacion("¿Seguro que quieres eliminar el bloque?", boton);
    if (!confirmar) return;

    mostrarSpinnerEnBoton(boton, true);
    const { error } = await supabaseClient.from('bloques').delete().eq('id', id);

    if (error) {
        mostrarSpinnerEnBoton(boton, false);
        mostrarFeedback("Error al eliminar el bloque.", "x-circle", "#ef4444");
    } else {
        mostrarFeedback("Bloque eliminado correctamente", "trash-2", "#ef4444");
        await iniciarApp(); // Recargar la UI para reflejar los cambios.
    }
}

async function solicitarConfirmacion(mensaje, botonOrigen = null) {
    modalConfirm.classList.remove('oculto');
    document.getElementById('confirm-msg').textContent = mensaje;

    // Guardamos el contenido original del botón de confirmación "Sí"
    const contenidoOriginalSi = btnConfirmSi.innerHTML;

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
    btnGuardarPared.innerHTML = '<i data-lucide="save"></i> Guardar'; // Actualiza el contenido del botón plano
    modal.querySelector('h3').textContent = "Agregar Nueva Pared"; // Título del modal
    modal.classList.remove('oculto');
    agregarListenersValidacion();
    lucide.createIcons();
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
    agregarListenersValidacion(); // Re-aplicamos listeners a los nuevos inputs
};

btnGuardarPared.onclick = async () => {
    if (btnGuardarPared.disabled) return; // Si está deshabilitado, no hace nada
    const nombre = document.getElementById('input-nombre-pared').value.trim();
    const inputs = document.querySelectorAll('.bloque-dinamico-input');
    mostrarSpinnerEnBoton('btn-guardar-pared', true);

    try {
        if (estado.paredIdEnEdicion) {
            // --- LÓGICA DE ACTUALIZACIÓN ---
            // Eliminar bloques que ya no están en el modal
            const bloquesOriginales = estado.bloques.filter(b => b.pared_id === estado.paredIdEnEdicion);
            const idsEnInputs = Array.from(inputs).filter(i => i.dataset.bloqueId).map(i => i.dataset.bloqueId);
            const aEliminar = bloquesOriginales.filter(b => !idsEnInputs.includes(b.id.toString()));
            for (let b of aEliminar) {
                const { error } = await supabaseClient.from('bloques').delete().eq('id', b.id);
                if (error) throw new Error(`Error al eliminar el bloque ${b.nombre}.`);
            }

            // Actualizar o crear los demás bloques
            await supabaseClient.from('paredes').update({ nombre }).eq('id', estado.paredIdEnEdicion);
            for (let input of inputs) {
                if (input.dataset.bloqueId) { await supabaseClient.from('bloques').update({ nombre: input.value }).eq('id', input.dataset.bloqueId); }
                else { await supabaseClient.from('bloques').insert({ pared_id: estado.paredIdEnEdicion, nombre: input.value, cantidad: 0 }); }
            }
            mostrarFeedback("Pared actualizada correctamente", "pencil", "var(--primary)");
        } else {
            // --- LÓGICA DE CREACIÓN ---
            const { data: p, error } = await supabaseClient.from('paredes').insert([{ nombre }]).select().single();
            if (error) throw new Error("Error al crear la pared.");
            const bloquesNuevos = Array.from(inputs).map(i => ({ pared_id: p.id, nombre: i.value, cantidad: 0 }));
            await supabaseClient.from('bloques').insert(bloquesNuevos);
            mostrarFeedback("Pared agregada correctamente", "check-circle", "#16a34a");
        }
        await iniciarApp();
        cerrarYLimpiarModal();
    } catch (error) {
        mostrarFeedback(error.message, "x-circle", "#ef4444");
    } finally {
        mostrarSpinnerEnBoton('btn-guardar-pared', false); // Oculta el spinner al finalizar
    }
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
    modal.querySelector('h3').textContent = "Editar Pared";
    btnGuardarPared.innerHTML = '<i data-lucide="save"></i> Actualizar'; // Actualiza el contenido del botón plano
    agregarListenersValidacion();
    lucide.createIcons();
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

function cerrarYLimpiarModal() {
    modal.classList.add('oculto');
    estado.paredIdEnEdicion = null;
    // Limpiamos los listeners para evitar acumulaciones
    const inputs = modal.querySelectorAll('#input-nombre-pared, #input-num-bloques, .bloque-dinamico-input');
    inputs.forEach(input => input.removeEventListener('input', validarModalPared));
}

function agregarListenersValidacion() {
    const inputs = modal.querySelectorAll('#input-nombre-pared, #input-num-bloques, .bloque-dinamico-input');
    inputs.forEach(input => {
        input.removeEventListener('input', validarModalPared); // Limpiamos listeners antiguos
        input.addEventListener('input', validarModalPared);
    });
    validarModalPared(); // Validamos el estado inicial
}

function validarModalPared() {
    const nombrePared = document.getElementById('input-nombre-pared').value.trim();
    const numBloques = document.getElementById('input-num-bloques').value.trim();
    const inputsBloques = Array.from(document.querySelectorAll('.bloque-dinamico-input'));
    
    const todosBloquesLlenos = inputsBloques.length > 0 && inputsBloques.every(input => input.value.trim() !== '');

    if (nombrePared && numBloques && todosBloquesLlenos) {
        btnGuardarPared.disabled = false;
    } else {
        btnGuardarPared.disabled = true;
    }
}

function mostrarTooltipValidacion(inputElement, mensaje) {
    document.querySelectorAll('.validation-tooltip').forEach(t => t.remove());

    const tooltip = document.createElement('div');
    tooltip.className = 'validation-tooltip';
    tooltip.textContent = mensaje;
    document.body.appendChild(tooltip);

    const rect = inputElement.getBoundingClientRect();
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;

    requestAnimationFrame(() => tooltip.classList.add('show'));

    setTimeout(() => {
        tooltip.classList.remove('show');
        setTimeout(() => tooltip.remove(), 200);
    }, 2000);
}

document.querySelector('.modal-botones').addEventListener('click', (e) => {
    if (e.target.closest('#btn-guardar-pared') && btnGuardarPared.disabled) {
        const nombrePared = document.getElementById('input-nombre-pared');
        const numBloques = document.getElementById('input-num-bloques');
        const primerBloqueVacio = Array.from(document.querySelectorAll('.bloque-dinamico-input')).find(i => i.value.trim() === '');

        if (nombrePared.value.trim() === '') mostrarTooltipValidacion(nombrePared, 'Falta el nombre de la pared');
        else if (numBloques.value.trim() === '') mostrarTooltipValidacion(numBloques, 'Indica el número de bloques');
        else if (document.querySelectorAll('.bloque-dinamico-input').length === 0) mostrarTooltipValidacion(numBloques, 'Debes generar los bloques');
        else if (primerBloqueVacio) mostrarTooltipValidacion(primerBloqueVacio, 'Falta el nombre de este bloque');
    }
});

function mostrarSpinnerEnBoton(botonOId, mostrar) {
    const boton = typeof botonOId === 'string' ? document.getElementById(botonOId) : botonOId;
    if (!boton) return;

    const spinnerHTML = '<div class="spinner"></div>';

    if (mostrar) {
        // Guardar el contenido original del botón antes de reemplazarlo
        if (!boton.dataset.originalContent) {
            boton.dataset.originalContent = boton.innerHTML;
        }
        boton.classList.add('is-loading');
        boton.disabled = true;
        boton.innerHTML = spinnerHTML;
    } else {
        // Restaurar el contenido original
        if (boton.dataset.originalContent) {
            boton.innerHTML = boton.dataset.originalContent;
            delete boton.dataset.originalContent; // Limpiar el atributo
        }
        boton.classList.remove('is-loading');
        boton.disabled = false;
        lucide.createIcons(); // Re-renderizar los íconos de Lucide que puedan haber sido restaurados
    }
}

// INICIALIZACIÓN FINAL
actualizarHeaderInfo(); // Llama a la nueva función para establecer la fecha al inicio
iniciarApp();
