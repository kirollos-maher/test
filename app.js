// ============================================================
// DORAK - Main Application (Full)
// ============================================================
const SUPABASE_URL = 'https://fhjhtgbvtkuhhzitvxtx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_X0aLD3gjXGqC_no4gW78ng_TWztP5cd';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// Helpers & Globals
// ============================================================
let business = null;
let deviceRecord = null;
let stations = [];
let sessions = {};
let menuItems = [];
let employees = [];
let paymentMethods = [];
let currentShift = null;
let currentUser = null;
let realtimeChannel = null;
let tickInterval = null;
let activeStationId = null;
let activeSessionOrders = [];
let currentOrderSessionId = null;
let selectedPaymentMethod = null;
let endSessionStationId = null;
let endingSessionInProgress = false;
let currentEndSessionTotals = null;
let endSessionDiscount = 0;
let endSessionAmountPaid = null;
let endSessionPrepaidAmount = 0;
let sessionSegmentsCache = {};
let activeSegmentCache = {};
let pendingSwitch = false;
let transferSourceStationId = null;
let countdownTimers = {};
let countdownAlerts = {};
let categoryToggleState = {};
let settingsPinExpanded = false;
let currentLang = 'ar';
let shiftFilter = 'all';

// QR orders cache (only pending orders)
let qrOrders = {};

// ============================================================
// Language
// ============================================================
function t(ar, en) { return currentLang === 'ar' ? ar : en; }

function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;
    document.getElementById('langToggleLabel').textContent = currentLang === 'ar' ? 'English' : 'العربية';
    updateTexts();
}

function updateTexts() {
    document.querySelectorAll('[data-ar][data-en]').forEach(el => {
        el.textContent = currentLang === 'ar' ? el.dataset.ar : el.dataset.en;
    });
    document.querySelectorAll('select option[data-ar][data-en]').forEach(el => {
        el.textContent = currentLang === 'ar' ? el.dataset.ar : el.dataset.en;
    });
    updateMonthNames();
    renderStationsGrid();
    renderSettingsStations();
    renderSettingsPaymentMethods();
    if (document.getElementById('view-shift').classList.contains('active')) renderShiftView();
    if (document.getElementById('view-settings').classList.contains('active')) renderSettings();
}

function updateMonthNames() {
    const monthSelect = document.getElementById('monthSelect');
    if (!monthSelect) return;
    const monthNamesAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthNames = currentLang === 'ar' ? monthNamesAr : monthNamesEn;
    monthSelect.querySelectorAll('option').forEach((option, index) => {
        option.textContent = monthNames[index];
    });
}

// ============================================================
// Clock sync
// ============================================================
let serverClockOffsetMs = 0;

async function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function syncServerClock() {
    try {
        const res = await fetchWithTimeout('https://worldtimeapi.org/api/timezone/Etc/UTC', 4000);
        const data = await res.json();
        if (data && data.unixtime) {
            serverClockOffsetMs = (data.unixtime * 1000) - Date.now();
            return;
        }
    } catch (e) {}
    try {
        const res = await fetchWithTimeout('https://timeapi.io/api/Time/current/zone?timeZone=UTC', 4000);
        const data = await res.json();
        if (data && data.dateTime) {
            const serverTime = new Date(data.dateTime + 'Z').getTime();
            if (!isNaN(serverTime)) serverClockOffsetMs = serverTime - Date.now();
        }
    } catch (e) {}
}

function nowCorrected() {
    return Date.now() + serverClockOffsetMs;
}

// ============================================================
// Utility functions
// ============================================================
function getDeviceId() {
    let id = localStorage.getItem('psr_device_id');
    if (!id) { id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('psr_device_id', id); }
    return id;
}

function money(n) {
    return (Number(n) || 0).toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 0 });
}

function moneyDec(n) {
    return (Number(n) || 0).toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast ' + type;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 2600);
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function openSheet(id) {
    document.getElementById(id).classList.add('show');
}

function closeSheet(id) {
    if (id === 'stationOverlay') currentOrderSessionId = null;
    document.getElementById(id).classList.remove('show');
    if (id === 'stationOverlay') {
        activeStationId = null;
        sessionSegmentsCache = {};
        endingSessionInProgress = false;
    }
    if (id === 'transferOverlay') {
        transferSourceStationId = null;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ============================================================
// Permissions
// ============================================================
function hasPerm(key) {
    if (!currentUser) return false;
    if (currentUser.type === 'owner') return true;
    const perms = currentUser.permissions || {};
    return !!perms[key];
}

function applyPermissions() {
    const isOwner = currentUser.type === 'owner';
    const perms = currentUser.permissions || {};
    const navSettings = document.querySelector('.bottom-nav .nav-btn[data-view="view-settings"]');
    const navShift = document.querySelector('.bottom-nav .nav-btn[data-view="view-shift"]');
    const navStations = document.querySelector('.bottom-nav .nav-btn[data-view="view-stations"]');
    const fab = document.getElementById('fabAddExpense');
    if (navSettings) navSettings.style.display = (isOwner || perms.settings) ? 'flex' : 'none';
    if (navShift) navShift.style.display = (isOwner || perms.shift) ? 'flex' : 'none';
    if (navStations) navStations.style.display = (isOwner || perms.stations) ? 'flex' : 'none';
    if (fab) fab.style.display = (isOwner || perms.shift) ? 'flex' : 'none';
}

// ============================================================
// Navigation
// ============================================================
function navigateTo(viewId) {
    if (currentUser && currentUser.type !== 'owner') {
        const perms = currentUser.permissions || {};
        if (viewId === 'view-settings' && !perms.settings) viewId = 'view-dashboard';
        if (viewId === 'view-shift' && !perms.shift) viewId = 'view-dashboard';
        if (viewId === 'view-stations' && !perms.stations) viewId = 'view-dashboard';
    }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));
    if (viewId === 'view-dashboard') renderDashboard();
    if (viewId === 'view-shift') renderShiftView();
    if (viewId === 'view-settings') { renderSettings(); renderSettingsStations(); renderSettingsPaymentMethods(); }
}

// ============================================================
// Setup / Activation / Lock flow
// ============================================================
async function handleSetupContinue() { /* (full as provided, no change) */ }
async function handleActivateDevice() { /* (full) */ }
function proceedToLock() { /* (full) */ }
function selectLockRole(role) { /* (full) */ }
function resetLockRole() { /* (full) */ }
async function handleEmployeeUnlock() { /* (full) */ }
async function handleUnlock() { /* (full) */ }
function lockApp() { /* (full) */ }
function switchBusiness() { /* (full) */ }
async function tryAutoResume() { /* (full) */ }
async function tryAutoActivateFromURL() { /* (full) */ }

// ============================================================
// MAIN APP ENTRY
// ============================================================
async function enterMainApp() {
    document.getElementById('headerBizName').textContent = business.name;
    document.getElementById('headerBizCode').textContent = business.code;
    showScreen('mainApp');
    applyPermissions();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-dashboard').classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'view-dashboard'));
    populateYearSelect();
    syncServerClock().then(() => { renderStationsGrid(); });
    await loadAllData();
    subscribeRealtime();
    startTicker();
    updateTexts();
    await recoverActiveSession();
    setInterval(syncServerClock, 5 * 60 * 1000);

    // QR pending orders reminder every minute
    setInterval(() => {
        const pendingCount = totalPendingQrOrders();
        if (pendingCount > 0) {
            showToast(t(`⚠️ ${pendingCount} طلب عميل لم يتم تسليمه بعد`, `⚠️ ${pendingCount} customer orders not delivered yet`), 'warning');
        }
    }, 60000);
}

async function loadAllData() {
    const results = await Promise.allSettled([
        loadStations(),
        loadMenuItems(),
        loadEmployees(),
        loadPaymentMethods(),
        loadOrOpenShift(),
        loadQrOrders()
    ]);
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            const names = ['stations', 'menu_items', 'employees', 'payment_methods', 'shift', 'qr_orders'];
            console.error(`Failed to load ${names[index]}:`, result.reason);
        }
    });
    renderDashboard();
    renderStationsGrid();
    renderSettingsStations();
    renderSettingsPaymentMethods();
}

// ============================================================
// Stations
// ============================================================
async function loadStations() {
    /* (full) */
}

// ============================================================
// Menu items
// ============================================================
async function loadMenuItems() { /* (full) */ }
async function saveMenuItemToDB(item) { /* (full) */ }
async function updateMenuItemInDB(id, updates) { /* (full) */ }
async function deleteMenuItemFromDB(id) { /* (full) */ }

// ============================================================
// Employees & Payment Methods
// ============================================================
async function loadEmployees() { /* (full) */ }
async function loadPaymentMethods() { /* (full) */ }
async function loadOrOpenShift() { /* (full) */ }

// ============================================================
// QR CUSTOMER ORDERS (Enhanced)
// ============================================================
async function loadQrOrders() {
    assertBusinessContext();
    qrOrders = {};
    const { data, error } = await supabaseClient
        .from('qr_orders')
        .select('*')
        .eq('business_id', business.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
    if (error) {
        console.warn('Could not load qr_orders:', error);
        return;
    }
    (data || []).forEach(o => {
        if (!qrOrders[o.station_id]) qrOrders[o.station_id] = [];
        qrOrders[o.station_id].push(o);
    });
    updateHeaderBellBadge();
}

function totalPendingQrOrders() {
    return Object.values(qrOrders).reduce((sum, arr) => sum + arr.length, 0);
}

function updateHeaderBellBadge() {
    const badge = document.getElementById('headerBellBadge');
    const bell = document.getElementById('headerBell');
    const count = totalPendingQrOrders();
    if (badge) {
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
    if (bell) bell.classList.toggle('bell-ringing', count > 0);
}

function handleQrOrderChange(payload) {
    const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
    if (!row) return;

    // Remove existing copy
    Object.keys(qrOrders).forEach(stId => {
        qrOrders[stId] = (qrOrders[stId] || []).filter(o => o.id !== row.id);
        if (qrOrders[stId].length === 0) delete qrOrders[stId];
    });

    if (payload.eventType !== 'DELETE' && payload.new && payload.new.status === 'pending') {
        const stId = payload.new.station_id;
        if (!qrOrders[stId]) qrOrders[stId] = [];
        qrOrders[stId].push(payload.new);

        // Trigger notification
        if (payload.eventType === 'INSERT') {
            const station = stations.find(s => s.id === stId);
            const deviceName = station ? (station.name || t('جهاز', 'Device') + ' ' + station.number) : t('جهاز', 'Device');
            const itemsSummary = (payload.new.items || []).map(it => `${it.name} ×${it.qty}`).join('، ');
            if (typeof showRingNotification === 'function') {
                showRingNotification(
                    t('🛎️ طلب جديد من العميل', '🛎️ New customer order'),
                    t(`${deviceName}: ${itemsSummary}`, `${deviceName}: ${itemsSummary}`),
                    'warning'
                );
            } else if (typeof showToast === 'function') {
                showToast(t(`🛎️ طلب جديد من ${deviceName}: ${itemsSummary}`, `🛎️ New order from ${deviceName}: ${itemsSummary}`), 'warning');
            }
        }
    }

    updateHeaderBellBadge();
    renderStationsGrid();
    if (document.getElementById('qrOrdersOverlay').classList.contains('show')) renderQrOrdersBody();
}

// Mark QR orders as seen when station sheet opens
async function markStationQrOrdersSeen(stationId) {
    const pendingOrders = (qrOrders[stationId] || []).filter(o => o.status === 'pending');
    if (pendingOrders.length === 0) return;
    const ids = pendingOrders.map(o => o.id);
    try {
        await supabaseClient
            .from('qr_orders')
            .update({ status: 'seen' })
            .in('id', ids);
        // Update local cache
        qrOrders[stationId] = (qrOrders[stationId] || []).map(o =>
            ids.includes(o.id) ? { ...o, status: 'seen' } : o
        ).filter(o => o.status !== 'seen');
        updateHeaderBellBadge();
        renderStationsGrid();
    } catch (e) {
        console.warn('Error marking QR orders as seen:', e);
    }
}

// Deliver QR order (mark as done)
async function deliverQrOrder(orderId) {
    try {
        await supabaseClient
            .from('qr_orders')
            .update({ status: 'done', done_at: new Date().toISOString() })
            .eq('id', orderId);
        // Remove from cache
        Object.keys(qrOrders).forEach(stId => {
            qrOrders[stId] = (qrOrders[stId] || []).filter(o => o.id !== orderId);
            if (qrOrders[stId].length === 0) delete qrOrders[stId];
        });
        updateHeaderBellBadge();
        renderStationsGrid();
        if (activeStationId) {
            await openStationSheet(activeStationId);
        }
        showToast(t('تم تسليم الطلب', 'Order delivered'), 'success');
    } catch (e) {
        console.error('Error delivering QR order:', e);
        showToast(t('فشل التسليم', 'Delivery failed'), 'error');
    }
}

// Render QR orders overlay
function openQrOrdersSheet(stationFilter) {
    openQrOrdersSheet._filter = stationFilter || null;
    renderQrOrdersBody();
    openSheet('qrOrdersOverlay');
}

function renderQrOrdersBody() {
    const body = document.getElementById('qrOrdersBody');
    const filter = openQrOrdersSheet._filter;
    let list = [];
    Object.entries(qrOrders).forEach(([stId, orders]) => {
        if (filter && stId !== filter) return;
        orders.forEach(o => list.push(o));
    });
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (list.length === 0) {
        body.innerHTML = `<div class="empty"><i class="fa-solid fa-bell-slash"></i>${t('مفيش طلبات عملاء دلوقتي', 'No customer orders right now')}</div>`;
        return;
    }

    body.innerHTML = list.map(o => {
        const station = stations.find(s => s.id === o.station_id);
        const deviceName = station ? (station.name || t('جهاز', 'Device') + ' ' + station.number) : t('جهاز محذوف', 'Deleted device');
        const timeStr = new Date(o.created_at).toLocaleTimeString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });
        const total = (o.items || []).reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
        return `<div class="qr-order-item">
            <div class="qr-order-head">
                <span class="qr-order-station"><i class="fa-solid fa-gamepad"></i> ${escapeHtml(deviceName)}</span>
                <span class="qr-order-time">${timeStr}</span>
            </div>
            <div class="qr-order-lines">${qrOrderItemsLineHtml(o.items)}</div>
            ${o.note ? `<div class="qr-order-note"><i class="fa-solid fa-note-sticky"></i> ${escapeHtml(o.note)}</div>` : ''}
            <div class="row-value mono" style="text-align:end;margin-bottom:8px;font-weight:700;">${t('الإجمالي', 'Total')}: ${money(total)} ${t('ج', 'EGP')}</div>
            <div class="qr-order-actions">
                <button class="btn btn-amber" onclick="addQrOrderToBill('${o.id}')"><i class="fa-solid fa-plus"></i> ${t('أضف للفاتورة', 'Add to bill')}</button>
                <button class="btn btn-ghost" onclick="dismissQrOrder('${o.id}')"><i class="fa-solid fa-check"></i> ${t('تم الاستلام', 'Acknowledge')}</button>
            </div>
        </div>`;
    }).join('');
}

function qrOrderItemsLineHtml(items) {
    return (items || []).map(it =>
        `<div><span>${escapeHtml(it.name)} × ${it.qty}</span><span class="mono">${money(Number(it.price) * Number(it.qty))}</span></div>`
    ).join('');
}

async function addQrOrderToBill(orderId) {
    let order = null;
    Object.values(qrOrders).forEach(arr => { const f = arr.find(o => o.id === orderId); if (f) order = f; });
    if (!order) return;

    const session = sessions[order.station_id];
    if (!session) {
        showToast(t('لازم تبدأ جلسة على الجهاز الأول عشان تضيف الطلب للفاتورة', 'Start a session on this device first to add the order to its bill'), 'error');
        return;
    }

    for (const it of (order.items || [])) {
        const qty = Math.max(1, parseInt(it.qty) || 1);
        for (let i = 0; i < qty; i++) {
            await addOrderItem(session.id, it.id);
        }
    }
    await dismissQrOrder(orderId, true);
    showToast(t('تمت إضافة طلب العميل للفاتورة', "Customer's order added to the bill"), 'success');
}

async function dismissQrOrder(orderId, silent) {
    try {
        await supabaseClient.from('qr_orders').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', orderId);
    } catch (e) {
        console.error('Error dismissing qr order:', e);
    }
    Object.keys(qrOrders).forEach(stId => {
        qrOrders[stId] = (qrOrders[stId] || []).filter(o => o.id !== orderId);
        if (qrOrders[stId].length === 0) delete qrOrders[stId];
    });
    updateHeaderBellBadge();
    renderStationsGrid();
    renderQrOrdersBody();
    if (!silent) showToast(t('تم استلام الطلب', 'Order acknowledged'), 'success');
}

// ============================================================
// STATION SHEET (Session Management) — with QR orders display
// ============================================================
async function openStationSheet(stationId) {
    // ... (existing code up to building body)
    // After building the main body HTML, we add QR orders section

    // Mark QR orders as seen
    await markStationQrOrdersSeen(stationId);

    // Fetch QR orders for this station (pending & seen)
    const { data: qrOrdersForStation } = await supabaseClient
        .from('qr_orders')
        .select('*')
        .eq('station_id', stationId)
        .in('status', ['pending', 'seen'])
        .order('created_at', { ascending: true });

    // Append QR orders HTML if any
    if (qrOrdersForStation && qrOrdersForStation.length > 0) {
        let qrHtml = `<div class="section-title">${t('طلبات العملاء (QR)', 'Customer Orders (QR)')}</div>`;
        qrOrdersForStation.forEach(o => {
            const total = (o.items || []).reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
            const itemsText = (o.items || []).map(it => `${it.name} ×${it.qty}`).join('، ');
            qrHtml += `
                <div style="background:var(--bg-sunken);border-radius:var(--radius-sm);padding:8px;margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;font-size:13px;">
                        <span>${escapeHtml(itemsText)}</span>
                        <span class="mono">${money(total)} ${t('ج', 'EGP')}</span>
                    </div>
                    ${o.note ? `<div style="font-size:11px;color:var(--text-dim);">${escapeHtml(o.note)}</div>` : ''}
                    <div style="margin-top:6px;">
                        <button class="btn btn-amber btn-sm" onclick="deliverQrOrder('${o.id}')">${t('تم التسليم', 'Delivered')}</button>
                    </div>
                </div>
            `;
        });
        // Insert QR section before the "رجوع" button or wherever appropriate
        // Since we build body dynamically, we can append to the sheet body after the main content.
        // Use a container div to hold everything.
        // For simplicity, we'll modify body.innerHTML by appending.
        const container = document.getElementById('stationSheetBody');
        // We'll just append after the existing content using insertAdjacentHTML
        // The easiest: create a div at the end of the body.
        const qrContainer = document.createElement('div');
        qrContainer.innerHTML = qrHtml;
        container.appendChild(qrContainer);
    }

    // ... rest of openStationSheet (renderMenuQuickAdd, renderStationOrdersSection, openSheet)
}

// ============================================================
// OTHER FUNCTIONS (Shift, Expenses, Settings, etc.)
// ============================================================
// For brevity, the rest of the functions (renderDashboard, renderStationsGrid,
// applyBulkRate, payment methods, orders, transfer, cancel, timer selection,
// expenses, shift, settings, change PIN, create business, menu items, employees,
// session recovery, refresh, switch mode, etc.) remain as originally provided.
// They are not modified for QR features.
