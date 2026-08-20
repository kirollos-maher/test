// V2 NOTE: Browser code is not a security boundary. Production authorization must be enforced by Supabase Auth + RLS.
// ============================================================
// CONFIG
// ============================================================
const SUPABASE_URL = 'https://fhjhtgbvtkuhhzitvxtx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_X0aLD3gjXGqC_no4gW78ng_TWztP5cd';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// V2 safety helpers: never report success when Supabase rejected the operation.
async function dbResult(promise, context = 'Database operation') {
    const result = await promise;
    if (result?.error) {
        console.error(context, result.error);
        throw result.error;
    }
    return result;
}
function assertBusinessContext() {
    if (!business?.id) throw new Error('Business context is missing');
}
function assertPositiveNumber(value, label) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a valid non-negative number`);
    return n;
}


// ============================================================
// LANGUAGE STATE
// ============================================================
let currentLang = 'ar';
let shiftFilter = 'all';

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

function populateYearSelect() {
    const yearSelect = document.getElementById('yearSelect');
    if (!yearSelect) return;
    
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let year = currentYear; year >= currentYear - 5; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    }
    yearSelect.value = currentYear;
}

function applyMonthlyFilter() {
    renderShiftView();
}

function setShiftFilter(filter) {
    shiftFilter = filter;
    document.querySelectorAll('.shift-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
    });
    
    const monthlyFilter = document.getElementById('monthlyFilter');
    if (monthlyFilter) {
        monthlyFilter.style.display = filter === 'monthly' ? 'flex' : 'none';
    }
    
    renderShiftView();
}

// ============================================================
// STATE
// ============================================================
let business = null;
let deviceRecord = null;
let stations = [];
let sessions = {};
let menuItems = [];
let menuCategories = [];
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
let qrOrders = {};
let qrOrderingEnabled = false;
let qrReminderInterval = null;
let qrReminderLastSent = {}; // orderId -> آخر وقت اتبعت فيه تذكير (ms)

// ============================================================
// PIN TOGGLE
// ============================================================
let settingsPinExpanded = false;

function toggleSettingsPin() {
    settingsPinExpanded = !settingsPinExpanded;
    const pinSection = document.getElementById('settingsChangePin');
    const chevron = document.getElementById('settingsPinChevron');
    if (pinSection) pinSection.style.display = settingsPinExpanded ? 'block' : 'none';
    if (chevron) chevron.style.transform = settingsPinExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
}

// ============================================================
// UTILITIES
// ============================================================
function getDeviceId() {
    let id = localStorage.getItem('psr_device_id');
    if (!id) { id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('psr_device_id', id); }
    return id;
}
function money(n) { return (Number(n) || 0).toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 0 }); }
function moneyDec(n) { return (Number(n) || 0).toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 }); }
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg; el.className = 'toast ' + type; el.style.display = 'block';
    clearTimeout(el._t); el._t = setTimeout(() => { el.style.display = 'none'; }, 2600);
}
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}
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
function openSheet(id) { document.getElementById(id).classList.add('show'); }
function closeSheet(id) {
    if (id === 'stationOverlay') currentOrderSessionId = null; 
    document.getElementById(id).classList.remove('show'); 
    if (id === 'stationOverlay') {
        activeStationId = null;
        sessionSegmentsCache = {};
        endingSessionInProgress = false;
    }
    if (id === 'transferOverlay') transferSourceStationId = null;
    if (id === 'customerCartOverlay') { /* do nothing special */ }
}
function t(ar, en) { return currentLang === 'ar' ? ar : en; }

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
// SETUP / ACTIVATION / LOCK FLOW
// ============================================================
async function handleSetupContinue() {
    const code = document.getElementById('setupBusinessCode').value.trim().toUpperCase();
    const errEl = document.getElementById('setupError');
    errEl.textContent = '';
    if (!code) { errEl.textContent = t('اكتب كود النشاط.', 'Enter the business code.'); return; }
    const btn = document.getElementById('setupContinueBtn');
    btn.disabled = true;
    try {
        const { data: biz, error } = await supabaseClient.from('businesses').select('*').eq('code', code).single();
        if (error || !biz) { errEl.textContent = t('مفيش نشاط بالكود ده.', 'No business found with this code.'); return; }
        business = biz;
        localStorage.setItem('psr_business_code', code);
        qrOrderingEnabled = !!business.qr_ordering_enabled;
        localStorage.setItem('psr_qr_ordering_enabled', JSON.stringify(qrOrderingEnabled));

        const deviceId = getDeviceId();
        let dev = null;
        const savedDevice = localStorage.getItem('psr_device_record');
        if (savedDevice) {
            try {
                dev = JSON.parse(savedDevice);
                if (dev.business_id !== biz.id || dev.device_id !== deviceId) dev = null;
            } catch (e) { dev = null; }
        }
        if (!dev) {
            const { data: devData } = await supabaseClient.from('devices').select('*').eq('business_id', biz.id).eq('device_id', deviceId).maybeSingle();
            dev = devData;
        }
        if (!dev) {
            document.getElementById('activationBizName').textContent = biz.name;
            showScreen('activationScreen');
            return;
        }
        deviceRecord = dev;
        proceedToLock();
    } catch (e) {
        console.error(e);
        errEl.textContent = t('حصل خطأ في الاتصال، حاول تاني.', 'Connection error, please try again.');
    } finally { btn.disabled = false; }
}

async function handleActivateDevice() {
    const code = document.getElementById('activationCodeInput').value.trim().toUpperCase();
    const errEl = document.getElementById('activationError');
    errEl.textContent = '';
    if (!code) { errEl.textContent = t('اكتب كود التفعيل.', 'Enter the activation code.'); return; }
    try {
        const { data: actCode, error } = await supabaseClient.from('activation_codes').select('*').eq('business_id', business.id).eq('code', code).eq('used', false).single();
        if (error || !actCode) { errEl.textContent = t('الكود غير صحيح أو مستخدم قبل كده.', 'Invalid or already used code.'); return; }

        const deviceId = getDeviceId();
        const isTrial = actCode.is_trial === true;
        const expiry = new Date(); expiry.setDate(expiry.getDate() + (isTrial ? 7 : 30));
        const { data: newDev, error: devErr } = await supabaseClient.from('devices').insert({
            business_id: business.id, device_id: deviceId,
            device_label: isTrial ? t('جهاز — تجربة مجانية', 'Device — Free trial') : t('جهاز بدون اسم', 'Unnamed device'),
            is_active: true, revoked: false, expiry_date: expiry.toISOString()
        }).select().single();
        if (devErr) { errEl.textContent = t('فشل التفعيل، حاول تاني.', 'Activation failed, try again.'); return; }

        await supabaseClient.from('activation_codes').update({ used: true, used_at: new Date().toISOString() }).eq('id', actCode.id);
        deviceRecord = newDev;
        localStorage.setItem('psr_device_record', JSON.stringify(deviceRecord));
        showToast(t('تم تفعيل الجهاز بنجاح', 'Device activated successfully'), 'success');
        proceedToLock();
    } catch (e) { console.error(e); errEl.textContent = t('حصل خطأ، حاول تاني.', 'Error, try again.'); }
}

function proceedToLock() {
    document.getElementById('lockBizCode').textContent = business.code;
    document.getElementById('lockBizName').textContent = business.name;
    const expiry = deviceRecord.expiry_date ? new Date(deviceRecord.expiry_date) : null;
    const subLine = document.getElementById('subStatusLine');
    if (deviceRecord.revoked || !deviceRecord.is_active) { subLine.textContent = t('الجهاز موقوف — تواصل مع الإدارة', 'Device suspended — contact admin'); }
    else if (expiry && expiry < new Date()) { subLine.textContent = t('الاشتراك منتهي — تواصل مع الإدارة', 'Subscription expired — contact admin'); }
    else if (expiry) { const days = Math.ceil((expiry - new Date()) / 86400000); subLine.textContent = t(`متبقي ${days} يوم على الاشتراك`, `${days} days remaining on subscription`); }
    resetLockRole();
    showScreen('lockScreen');
}

function selectLockRole(role) {
    document.getElementById('lockError').textContent = '';
    document.getElementById('lockRoleChoice').style.display = 'none';
    document.getElementById('lockOwnerForm').style.display = role === 'owner' ? 'block' : 'none';
    document.getElementById('lockEmployeeForm').style.display = role === 'employee' ? 'block' : 'none';
}

function resetLockRole() {
    document.getElementById('lockError').textContent = '';
    document.getElementById('lockPinInput').value = '';
    document.getElementById('lockEmpName').value = '';
    document.getElementById('lockEmpPin').value = '';
    document.getElementById('lockOwnerForm').style.display = 'none';
    document.getElementById('lockEmployeeForm').style.display = 'none';
    document.getElementById('lockRoleChoice').style.display = 'block';
}

async function handleEmployeeUnlock() {
    const name = document.getElementById('lockEmpName').value.trim();
    const pin = document.getElementById('lockEmpPin').value.trim();
    const errEl = document.getElementById('lockError');
    errEl.textContent = '';
    if (deviceRecord.revoked || !deviceRecord.is_active) { errEl.textContent = t('الجهاز موقوف.', 'Device suspended.'); return; }
    if (deviceRecord.expiry_date && new Date(deviceRecord.expiry_date) < new Date()) { errEl.textContent = t('الاشتراك منتهي.', 'Subscription expired.'); return; }
    if (!name || !pin) { errEl.textContent = t('اكتب الاسم والـ PIN.', 'Enter your name and PIN.'); return; }

    const { data: emps, error } = await supabaseClient.from('employees').select('*').eq('business_id', business.id).eq('active', true);
    if (error) { errEl.textContent = t('حصل خطأ، حاول تاني.', 'Error, try again.'); console.error('Error loading employees for login:', error); return; }
    const emp = (emps || []).find(e => e.name && e.name.trim().toLowerCase() === name.toLowerCase() && String(e.pin) === pin);
    if (emp) {
        currentUser = { type: 'employee', ...emp };
        document.getElementById('lockEmpName').value = '';
        document.getElementById('lockEmpPin').value = '';
        enterMainApp();
        return;
    }
    errEl.textContent = t('الاسم أو الـ PIN غير صحيح.', 'Incorrect name or PIN.');
}

async function handleUnlock() {
    const pin = document.getElementById('lockPinInput').value.trim();
    const errEl = document.getElementById('lockError');
    errEl.textContent = '';
    if (deviceRecord.revoked || !deviceRecord.is_active) { errEl.textContent = t('الجهاز موقوف.', 'Device suspended.'); return; }
    if (deviceRecord.expiry_date && new Date(deviceRecord.expiry_date) < new Date()) { errEl.textContent = t('الاشتراك منتهي.', 'Subscription expired.'); return; }
    if (!pin) { errEl.textContent = t('اكتب الـ PIN.', 'Enter the PIN.'); return; }

    if (pin === business.owner_pin) {
        currentUser = { type: 'owner', name: t('المالك', 'Owner'), permissions: { stations: true, inventory: true, shift: true, settings: true } };
        document.getElementById('lockPinInput').value = '';
        enterMainApp();
        return;
    }
    const { data: emp } = await supabaseClient.from('employees').select('*').eq('business_id', business.id).eq('pin', pin).eq('active', true).maybeSingle();
    if (emp) {
        currentUser = { type: 'employee', ...emp };
        document.getElementById('lockPinInput').value = '';
        enterMainApp();
        return;
    }
    errEl.textContent = t('PIN غير صحيح.', 'Incorrect PIN.');
}

function lockApp() {
    stopRealtimeAndTimers();
    currentUser = null;
    document.getElementById('lockPinInput').value = '';
    proceedToLock();
}

function switchBusiness() {
    stopRealtimeAndTimers();
    localStorage.removeItem('psr_business_code');
    localStorage.removeItem('psr_device_record');
    localStorage.removeItem('psr_qr_ordering_enabled');
    business = null; deviceRecord = null; currentUser = null;
    document.getElementById('setupBusinessCode').value = '';
    showScreen('setupScreen');
}

async function tryAutoResume() {
    const code = localStorage.getItem('psr_business_code');
    if (!code) return;
    try {
        const { data: biz } = await supabaseClient.from('businesses').select('*').eq('code', code).single();
        if (!biz) return;
        business = biz;
        qrOrderingEnabled = !!business.qr_ordering_enabled;
        localStorage.setItem('psr_qr_ordering_enabled', JSON.stringify(qrOrderingEnabled));
        const savedDevice = localStorage.getItem('psr_device_record');
        let dev = null;
        if (savedDevice) {
            try {
                dev = JSON.parse(savedDevice);
                if (dev.business_id !== biz.id) dev = null;
            } catch (e) { dev = null; }
        }
        if (!dev) {
            const { data: devData } = await supabaseClient.from('devices').select('*').eq('business_id', biz.id).eq('device_id', getDeviceId()).maybeSingle();
            dev = devData;
        }
        if (!dev) return;
        deviceRecord = dev;
        proceedToLock();
    } catch (e) { console.warn('auto-resume failed', e); }
}

// ============================================================
// AUTO-ACTIVATE FROM URL
// ============================================================
async function tryAutoActivateFromURL() {
    if (localStorage.getItem('psr_business_code')) return;
    const params = new URLSearchParams(window.location.search);
    const bizCode = params.get('biz');
    const actCodeParam = params.get('code');
    if (!bizCode) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    const setupInput = document.getElementById('setupBusinessCode');
    if (setupInput) setupInput.value = bizCode;
    await handleSetupContinue();
    const activationScreen = document.getElementById('activationScreen');
    if (actCodeParam && activationScreen && activationScreen.classList.contains('active')) {
        const actInput = document.getElementById('activationCodeInput');
        if (actInput) actInput.value = actCodeParam;
        await handleActivateDevice();
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    await tryAutoActivateFromURL();
    tryAutoResume();
    initCustomerPage();
});

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

    startQrOrderReminders();
}

// ============================================================
// تذكير الطلبات اللي لسه ما اتحضّرتش (كل 3 دقايق لكل طلب)
// ============================================================
function startQrOrderReminders() {
    if (qrReminderInterval) clearInterval(qrReminderInterval);
    qrReminderInterval = setInterval(checkQrOrderReminders, 20000);
}

function stopQrOrderReminders() {
    if (qrReminderInterval) { clearInterval(qrReminderInterval); qrReminderInterval = null; }
    qrReminderLastSent = {};
}

async function checkQrOrderReminders() {
    if (!business) return;
    const REMINDER_MS = 3 * 60 * 1000;
    try {
        // بنجيب من قاعدة البيانات أي طلب لسه مش "تم التحضير" (pending أو seen)
        // عشان التذكير يفضل شغال حتى لو الطلب اتفتحله شيت الجهاز وبقى seen
        const { data, error } = await supabaseClient
            .from('qr_orders')
            .select('id, station_id, created_at')
            .eq('business_id', business.id)
            .in('status', ['pending', 'seen']);
        if (error || !data) return;

        const now = Date.now();
        const activeIds = new Set();

        data.forEach(o => {
            activeIds.add(o.id);
            const createdAt = new Date(o.created_at).getTime();
            const lastSent = qrReminderLastSent[o.id] || createdAt;
            if (now - lastSent >= REMINDER_MS) {
                qrReminderLastSent[o.id] = now;
                const station = stations.find(s => s.id === o.station_id);
                const deviceName = station ? (station.name || t('جهاز', 'Device') + ' ' + station.number) : t('جهاز', 'Device');
                const msg = t(`فيه طلب على ${deviceName} لسه متحضرش`, `There's an order on ${deviceName} still not prepared`);
                if (typeof showRingNotification === 'function') {
                    showRingNotification(
                        t('⏰ تذكير: طلب لسه مش متحضر', '⏰ Reminder: order not prepared'),
                        msg,
                        'warning'
                    );
                } else if (typeof showToast === 'function') {
                    showToast('⏰ ' + msg, 'warning');
                }
            }
        });

        // تنظيف الطلبات اللي اتحضّرت من الذاكرة عشان ميفضلش تراكم
        Object.keys(qrReminderLastSent).forEach(id => {
            if (!activeIds.has(id)) delete qrReminderLastSent[id];
        });
    } catch (e) {
        console.warn('QR order reminder check failed:', e);
    }
}

async function loadAllData() {
    const results = await Promise.allSettled([
        loadStations(),
        loadMenuItems(),
        loadMenuCategories(),
        loadEmployees(),
        loadPaymentMethods(),
        loadOrOpenShift(),
        loadQrOrders()
    ]);
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            const names = ['stations', 'menu_items', 'menu_categories', 'employees', 'payment_methods', 'shift', 'qr_orders'];
            console.error(`Failed to load ${names[index]}:`, result.reason);
        }
    });
    renderDashboard();
    renderStationsGrid();
    renderSettingsStations();
    renderSettingsPaymentMethods();
}

async function loadStations() {
    assertBusinessContext();
    const { data, error } = await supabaseClient.from('stations').select('*').eq('business_id', business.id).order('number');
    if (error) {
        console.error('Error loading stations:', error);
        throw error;
    }
    if (Array.isArray(data) && data.length === 0) {
        const seed = Array.from({ length: business.total_stations || 4 }, (_, i) => ({ 
            business_id: business.id, number: i + 1, single_rate: 20, multi_rate: 30, name: `جهاز ${i + 1}`
        }));
        const createdResult = await dbResult(supabaseClient.from('stations').insert(seed).select(), 'Seeding stations');
        stations = createdResult.data || [];
    } else {
        stations = data || [];
    }
    const activeResult = await dbResult(
        supabaseClient.from('sessions').select('*').eq('business_id', business.id).eq('status', 'active'),
        'Loading active sessions'
    );
    sessions = {};
    (activeResult.data || []).forEach(s => { sessions[s.station_id] = s; });
}

// ============================================================
// MENU ITEMS & CATEGORIES
// ============================================================
async function loadMenuItems() {
    try {
        const { data, error } = await supabaseClient.from('menu_items').select('*').eq('business_id', business.id).eq('active', true).order('created_at');
        if (error) {
            console.warn('Error loading menu items from DB:', error);
            const localData = localStorage.getItem('psr_menu_items_' + business.id);
            if (localData) {
                menuItems = JSON.parse(localData);
                return;
            }
            menuItems = [];
            return;
        }
        if (data) {
            menuItems = data;
            localStorage.setItem('psr_menu_items_' + business.id, JSON.stringify(data));
        }
    } catch (e) {
        console.warn('Error loading menu items:', e);
        const localData = localStorage.getItem('psr_menu_items_' + business.id);
        if (localData) {
            menuItems = JSON.parse(localData);
        } else {
            menuItems = [];
        }
    }
}

async function loadMenuCategories() {
    try {
        const { data, error } = await supabaseClient.from('menu_categories').select('*').eq('business_id', business.id).eq('active', true).order('sort_order');
        if (error) {
            console.warn('Error loading menu categories:', error);
            menuCategories = [];
            return;
        }
        menuCategories = data || [];
    } catch (e) {
        console.warn('Error loading menu categories:', e);
        menuCategories = [];
    }
}

async function saveMenuItemToDB(item) {
    assertBusinessContext();
    const { data, error } = await supabaseClient.from('menu_items').insert(item).select().single();
    if (error) {
        console.error('Error saving menu item to DB:', error);
        throw error;
    }
    return data;
}

async function updateMenuItemInDB(id, updates) {
    const { data, error } = await supabaseClient.from('menu_items').update(updates).eq('id', id).eq('business_id', business.id).select().single();
    if (error) {
        console.error('Error updating menu item in DB:', error);
        throw error;
    }
    return data;
}

async function deleteMenuItemFromDB(id) {
    const { error } = await supabaseClient.from('menu_items').delete().eq('id', id).eq('business_id', business.id);
    if (error) {
        console.error('Error deleting menu item from DB:', error);
        throw error;
    }
    return true;
}

async function loadEmployees() {
    const { data } = await supabaseClient.from('employees').select('*').eq('business_id', business.id).order('created_at');
    employees = data || [];
}

async function loadPaymentMethods() {
    try {
        const { data, error } = await supabaseClient.from('payment_methods').select('*').eq('business_id', business.id).order('created_at');
        if (error) throw error;
        if (data && data.length > 0) {
            paymentMethods = data;
            return;
        }
    } catch (e) {
        console.warn('Error loading payment methods:', e);
    }
    
    const defaults = [
        { business_id: business.id, name: 'كاش', icon: 'fa-money-bill-wave', color: 'badge-green', active: true },
        { business_id: business.id, name: 'إنستا باي', icon: 'fa-mobile-screen-button', color: 'badge-purple', active: true },
        { business_id: business.id, name: 'محفظة إلكترونية', icon: 'fa-wallet', color: 'badge-teal', active: true },
        { business_id: business.id, name: 'بطاقة ائتمان', icon: 'fa-credit-card', color: 'badge-amber', active: true }
    ];
    
    try {
        const { data: created, error } = await supabaseClient.from('payment_methods').insert(defaults).select();
        if (!error && created) {
            paymentMethods = created;
            return;
        }
    } catch (e) {
        console.warn('Could not create default payment methods:', e);
    }
    
    paymentMethods = defaults.map((pm, i) => ({
        ...pm,
        id: 'temp_' + Date.now() + '_' + i,
        created_at: new Date().toISOString()
    }));
}

async function loadOrOpenShift() {
    assertBusinessContext();
    const { data: openShifts, error } = await supabaseClient
        .from('shifts')
        .select('*')
        .eq('business_id', business.id)
        .eq('status', 'open')
        .order('opened_at', { ascending: false });
    if (error) throw error;
    if (openShifts && openShifts.length > 0) {
        currentShift = openShifts[0];
        if (openShifts.length > 1) {
            console.warn(
                `PS Rental: ${openShifts.length} open shifts found for business ${business.id}. ` +
                'Using the newest one. Review duplicate open shifts in Supabase.'
            );
        }
        return;
    }
    const createdResult = await dbResult(
        supabaseClient
            .from('shifts')
            .insert({ business_id: business.id, opened_at: new Date().toISOString(), status: 'open' })
            .select()
            .single(),
        'Opening shift'
    );
    currentShift = createdResult.data;
}

// ============================================================
// QR CUSTOMER ORDERS
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

    Object.keys(qrOrders).forEach(stId => {
        qrOrders[stId] = (qrOrders[stId] || []).filter(o => o.id !== row.id);
        if (qrOrders[stId].length === 0) delete qrOrders[stId];
    });

    if (payload.eventType !== 'DELETE' && payload.new && payload.new.status === 'pending') {
        const stId = payload.new.station_id;
        if (!qrOrders[stId]) qrOrders[stId] = [];
        qrOrders[stId].push(payload.new);

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

async function markStationQrOrdersSeen(stationId) {
    const pendingOrders = (qrOrders[stationId] || []).filter(o => o.status === 'pending');
    if (pendingOrders.length === 0) return;
    const ids = pendingOrders.map(o => o.id);
    try {
        await supabaseClient
            .from('qr_orders')
            .update({ status: 'seen' })
            .in('id', ids);
        qrOrders[stationId] = (qrOrders[stationId] || []).map(o =>
            ids.includes(o.id) ? { ...o, status: 'seen' } : o
        ).filter(o => o.status !== 'seen');
        updateHeaderBellBadge();
        renderStationsGrid();
    } catch (e) {
        console.warn('Error marking QR orders as seen:', e);
    }
}

async function deliverQrOrder(orderId) {
    try {
        await supabaseClient
            .from('qr_orders')
            .update({ status: 'done', done_at: new Date().toISOString() })
            .eq('id', orderId);
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

function qrOrderItemsLineHtml(items) {
    return (items || []).map(it =>
        `<div><span>${escapeHtml(it.name)} × ${it.qty}</span><span class="mono">${money(Number(it.price) * Number(it.qty))}</span></div>`
    ).join('');
}

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
// CLOCK SYNC
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
    } catch (e) {
        console.warn('worldtimeapi failed, trying fallback:', e);
    }
    try {
        const res = await fetchWithTimeout('https://timeapi.io/api/Time/current/zone?timeZone=UTC', 4000);
        const data = await res.json();
        if (data && data.dateTime) {
            const serverTime = new Date(data.dateTime + 'Z').getTime();
            if (!isNaN(serverTime)) serverClockOffsetMs = serverTime - Date.now();
        }
    } catch (e) {
        console.warn('Error syncing server clock (both sources failed):', e);
    }
}

function nowCorrected() {
    return Date.now() + serverClockOffsetMs;
}

// ============================================================
// SESSION SEGMENTS HELPERS
// ============================================================
async function getSessionSegments(sessionId) {
    if (sessionSegmentsCache[sessionId]) return sessionSegmentsCache[sessionId];
    try {
        const { data } = await supabaseClient
            .from('session_segments')
            .select('*')
            .eq('session_id', sessionId)
            .order('started_at', { ascending: true });
        sessionSegmentsCache[sessionId] = data || [];
        return data || [];
    } catch (e) {
        console.warn('Error loading segments:', e);
        return [];
    }
}

async function createSegment(sessionId, mode, startedAt, rate, timerType, durationSeconds) {
    const { data: existingList } = await supabaseClient
        .from('session_segments')
        .select('*')
        .eq('session_id', sessionId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1);
    const existing = (existingList && existingList[0]) || null;
    if (existing) {
        activeSegmentCache[sessionId] = existing;
        return existing;
    }

    const { data, error } = await supabaseClient.from('session_segments').insert({
        session_id: sessionId,
        business_id: business.id,
        mode: mode,
        started_at: startedAt,
        rate: assertPositiveNumber(rate, 'Rate'),
        timer_type: timerType || 'countup',
        duration_seconds: Math.max(0, Math.round(Number(durationSeconds) || 0))
    }).select().single();
    if (error) throw error;
    sessionSegmentsCache[sessionId] = null;
    activeSegmentCache[sessionId] = data;
    return data;
}

async function closeSegment(segmentId, endedAt, amount) {
    const { error } = await supabaseClient.from('session_segments')
        .update({ ended_at: endedAt, amount: amount })
        .eq('id', segmentId);
    if (error) throw error;
    sessionSegmentsCache = {};
    for (const sid in activeSegmentCache) {
        if (activeSegmentCache[sid] && activeSegmentCache[sid].id === segmentId) {
            activeSegmentCache[sid] = null;
        }
    }
}

async function getActiveSegment(sessionId) {
    try {
        const { data } = await supabaseClient
            .from('session_segments')
            .select('*')
            .eq('session_id', sessionId)
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1);
        const seg = (data && data[0]) || null;
        activeSegmentCache[sessionId] = seg;
        return seg;
    } catch (e) {
        console.warn('Error getting active segment:', e);
        return activeSegmentCache[sessionId] || null;
    }
}

function getActiveSegmentFast(sessionId) {
    return activeSegmentCache[sessionId] || null;
}

async function preloadActiveSegments(sessionIds) {
    if (!sessionIds || sessionIds.length === 0) return;
    try {
        const { data } = await supabaseClient
            .from('session_segments')
            .select('*')
            .in('session_id', sessionIds)
            .is('ended_at', null);
        (data || []).forEach(seg => { activeSegmentCache[seg.session_id] = seg; });
    } catch (e) {
        console.warn('Error preloading active segments:', e);
    }
}

function calculateSegmentAmountFromTimes(startedAt, endedAt, rate) {
    const start = new Date(startedAt);
    const end = new Date(endedAt);
    const hours = Math.max(0, (end - start) / 3600000);
    return Math.round((hours * Number(rate)) * 100) / 100;
}

async function calculateTotalAmounts(sessionId) {
    const segments = await getSessionSegments(sessionId);
    let singleTotal = 0, multiTotal = 0, singleDuration = 0, multiDuration = 0;
    
    for (const seg of segments) {
        if (seg.ended_at) {
            const hours = (new Date(seg.ended_at) - new Date(seg.started_at)) / 3600000;
            const amount = (seg.amount !== null && seg.amount !== undefined)
                ? Number(seg.amount)
                : Math.round((hours * Number(seg.rate)) * 100) / 100;
            if (seg.mode === 'single') {
                singleTotal += amount;
                singleDuration += hours;
            } else {
                multiTotal += amount;
                multiDuration += hours;
            }
        }
    }
    
    const { data: orders } = await supabaseClient
        .from('session_orders')
        .select('quantity, unit_price')
        .eq('session_id', sessionId);
    const ordersTotal = (orders || []).reduce((sum, o) => sum + (Number(o.quantity) * Number(o.unit_price)), 0);
    
    return {
        singleTotal: Math.round(singleTotal * 100) / 100,
        multiTotal: Math.round(multiTotal * 100) / 100,
        singleDuration: singleDuration,
        multiDuration: multiDuration,
        ordersTotal: ordersTotal,
        grandTotal: Math.round((singleTotal + multiTotal + ordersTotal) * 100) / 100
    };
}

async function getCurrentSegmentEstimate(sessionId) {
    const activeSeg = await getActiveSegment(sessionId);
    if (!activeSeg) return { amount: 0, hours: 0, segment: null };
    
    const start = new Date(activeSeg.started_at);
    const now = new Date(nowCorrected());
    let hours = Math.max(0, (now - start) / 3600000);
    let amount = Math.round((hours * Number(activeSeg.rate)) * 100) / 100;
    
    if (activeSeg.timer_type === 'countdown' && activeSeg.duration_seconds) {
        const elapsedSeconds = (now - start) / 1000;
        const remainingSeconds = Math.max(0, activeSeg.duration_seconds - elapsedSeconds);
        hours = remainingSeconds / 3600;
        amount = Math.round((hours * Number(activeSeg.rate)) * 100) / 100;
    }
    
    return { amount, hours, segment: activeSeg };
}

function getCurrentSegmentEstimateFast(sessionId) {
    const activeSeg = getActiveSegmentFast(sessionId);
    if (!activeSeg) return { amount: 0, hours: 0, segment: null };

    const start = new Date(activeSeg.started_at);
    const now = new Date(nowCorrected());
    let hours = Math.max(0, (now - start) / 3600000);
    let amount = Math.round((hours * Number(activeSeg.rate)) * 100) / 100;

    if (activeSeg.timer_type === 'countdown' && activeSeg.duration_seconds) {
        const elapsedSeconds = (now - start) / 1000;
        const remainingSeconds = Math.max(0, activeSeg.duration_seconds - elapsedSeconds);
        hours = remainingSeconds / 3600;
        amount = Math.round((hours * Number(activeSeg.rate)) * 100) / 100;
    }

    return { amount, hours, segment: activeSeg };
}

function getCurrentSegmentEarnedAmount(sessionId) {
    const activeSeg = getActiveSegmentFast(sessionId);
    if (!activeSeg) return 0;
    const start = new Date(activeSeg.started_at);
    const now = new Date(nowCorrected());
    const hours = Math.max(0, (now - start) / 3600000);
    return Math.round((hours * Number(activeSeg.rate)) * 100) / 100;
}

function getRemainingSeconds(segment) {
    if (!segment || segment.timer_type !== 'countdown' || !segment.duration_seconds) return 0;
    const start = new Date(segment.started_at);
    const now = new Date(nowCorrected());
    const elapsed = (now - start) / 1000;
    return Math.max(0, segment.duration_seconds - elapsed);
}

function formatCountdown(seconds) {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return (h > 0 ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ============================================================
// REALTIME
// ============================================================
function subscribeRealtime() {
    if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = supabaseClient.channel('biz-' + business.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: 'business_id=eq.' + business.id }, handleSessionChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'session_orders', filter: 'business_id=eq.' + business.id }, handleOrderChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stations', filter: 'business_id=eq.' + business.id }, handleStationChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'session_segments', filter: 'business_id=eq.' + business.id }, handleSegmentChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_orders', filter: 'business_id=eq.' + business.id }, handleQrOrderChange)
        .subscribe();
}

function stopRealtimeAndTimers() {
    if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
    Object.keys(countdownTimers).forEach(key => {
        if (countdownTimers[key]) clearInterval(countdownTimers[key]);
        delete countdownTimers[key];
    });
    stopQrOrderReminders();
}

function handleSessionChange(payload) {
    const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
    if (!row) return;
    if (payload.eventType === 'DELETE' || (payload.new && payload.new.status === 'completed')) {
        delete sessions[row.station_id];
        if (countdownTimers[row.station_id]) {
            clearInterval(countdownTimers[row.station_id]);
            delete countdownTimers[row.station_id];
        }
        renderDashboard();
        if (document.getElementById('view-shift').classList.contains('active')) {
            renderShiftView();
        }
    } else if (row.status === 'active') {
        sessions[row.station_id] = payload.new;
    }
    renderStationsGrid();
    if (document.getElementById('view-dashboard').classList.contains('active')) renderDashboard();
    if (document.getElementById('view-shift').classList.contains('active')) renderShiftView();
    if (activeStationId === row.station_id && !pendingSwitch && !endingSessionInProgress) openStationSheet(activeStationId);
}

function handleOrderChange(payload) {
    const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
    if (activeStationId && row && row.session_id === (sessions[activeStationId] || {}).id) renderStationOrdersSection();
}

function handleStationChange() {
    loadStations().then(() => {
        renderStationsGrid();
        renderSettingsStations();
    });
}

function handleSegmentChange(payload) {
    if (payload.new && payload.new.session_id) {
        const row = payload.new;
        sessionSegmentsCache[row.session_id] = null;
        activeSegmentCache[row.session_id] = row.ended_at ? null : row;
        if (activeStationId && !pendingSwitch && !endingSessionInProgress) {
            const session = sessions[activeStationId];
            if (session && session.id === row.session_id) {
                openStationSheet(activeStationId);
            }
        }
    }
}

// ============================================================
// التيكر
// ============================================================
function startTicker() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(() => {
        document.querySelectorAll('.station-timer[data-start]').forEach(el => {
            const stationId = el.dataset.stationId;
            const session = sessions[stationId];
            if (!session) return;
            const activeSeg = getActiveSegmentFast(session.id);
            if (activeSeg && activeSeg.timer_type === 'countdown' && activeSeg.duration_seconds) {
                const remaining = getRemainingSeconds(activeSeg);
                el.textContent = formatCountdown(remaining);
                if (remaining < 300) {
                    el.classList.add('countdown-warning');
                } else {
                    el.classList.remove('countdown-warning');
                }
                el.classList.add('countdown');
            } else {
                el.textContent = formatElapsed(new Date(el.dataset.start));
                el.classList.remove('countdown', 'countdown-warning');
            }
        });

        const timerEl = document.getElementById('activeSessionTimer');
        if (timerEl && timerEl.dataset.start && activeStationId) {
            const session = sessions[activeStationId];
            if (session) {
                const activeSeg = getActiveSegmentFast(session.id);
                if (activeSeg && activeSeg.timer_type === 'countdown' && activeSeg.duration_seconds) {
                    const remaining = getRemainingSeconds(activeSeg);
                    timerEl.textContent = formatCountdown(remaining);
                    if (remaining < 300) {
                        timerEl.classList.add('countdown-warning');
                    } else {
                        timerEl.classList.remove('countdown-warning');
                    }
                    timerEl.classList.add('countdown');
                } else {
                    timerEl.textContent = formatElapsed(new Date(timerEl.dataset.start));
                    timerEl.classList.remove('countdown', 'countdown-warning');
                }
            }
        }

        const currentSegTimer = document.getElementById('currentSegTimer');
        if (currentSegTimer && currentSegTimer.dataset.start && activeStationId) {
            const session = sessions[activeStationId];
            if (session) {
                const activeSeg = getActiveSegmentFast(session.id);
                if (activeSeg && activeSeg.timer_type === 'countdown' && activeSeg.duration_seconds) {
                    const remaining = getRemainingSeconds(activeSeg);
                    currentSegTimer.textContent = formatCountdown(remaining);
                } else {
                    currentSegTimer.textContent = formatElapsed(new Date(currentSegTimer.dataset.start));
                }
            }
        }

        const amountEl = document.getElementById('currentSegAmount');
        if (amountEl && activeStationId) {
            const session = sessions[activeStationId];
            if (session) {
                const { amount } = getCurrentSegmentEstimateFast(session.id);
                amountEl.textContent = moneyDec(amount);
            }
        }

        const overallTotalEl = document.getElementById('overallTotalAmount');
        if (overallTotalEl && activeStationId) {
            const session = sessions[activeStationId];
            if (session) {
                const baseTotal = Number(overallTotalEl.dataset.baseTotal || 0);
                const earnedNow = getCurrentSegmentEarnedAmount(session.id);
                overallTotalEl.textContent = moneyDec(Math.round((baseTotal + earnedNow) * 100) / 100);
            }
        }
    }, 1000);
}

function formatElapsed(start) {
    const secs = Math.max(0, Math.floor((nowCorrected() - start.getTime()) / 1000));
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return (h > 0 ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard() {
    if (!currentShift) {
        try {
            const { data: created } = await supabaseClient.from('shifts').insert({ 
                business_id: business.id,
                opened_at: new Date().toISOString(),
                status: 'open'
            }).select().single();
            if (created) {
                currentShift = created;
                showToast(t('تم فتح شيفت جديد تلقائياً', 'New shift opened automatically'), 'success');
            }
        } catch (e) {
            console.error('Error auto-opening shift:', e);
            document.getElementById('dashRevenue').textContent = '0';
            document.getElementById('dashExpenses').textContent = '0';
            document.getElementById('dashActive').textContent = Object.keys(sessions).length;
            document.getElementById('dashAvailable').textContent = stations.length - Object.keys(sessions).length;
            return;
        }
    }
    
    if (!currentShift) {
        document.getElementById('dashRevenue').textContent = '0';
        document.getElementById('dashExpenses').textContent = '0';
        document.getElementById('dashActive').textContent = Object.keys(sessions).length;
        document.getElementById('dashAvailable').textContent = stations.length - Object.keys(sessions).length;
        return;
    }
    
    try {
        const { data: completedSessions } = await supabaseClient
            .from('sessions')
            .select('id, amount')
            .eq('business_id', business.id)
            .eq('status', 'completed')
            .gte('ended_at', currentShift.opened_at)
            .lte('ended_at', currentShift.closed_at || new Date().toISOString());
        
        let totalRevenue = 0;
        const sessionIds = (completedSessions || []).map(s => s.id);
        
        if (sessionIds.length > 0) {
            const { data: segments } = await supabaseClient
                .from('session_segments')
                .select('session_id, amount')
                .in('session_id', sessionIds);
            
            const { data: orders } = await supabaseClient
                .from('session_orders')
                .select('session_id, quantity, unit_price')
                .in('session_id', sessionIds);
            
            for (const session of completedSessions) {
                let sessionRevenue = Number(session.amount) || 0;
                
                if (sessionRevenue === 0) {
                    const segAmount = (segments || [])
                        .filter(s => s.session_id === session.id)
                        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
                    
                    const orderAmount = (orders || [])
                        .filter(o => o.session_id === session.id)
                        .reduce((sum, o) => sum + (Number(o.quantity) * Number(o.unit_price)), 0);
                    
                    sessionRevenue = segAmount + orderAmount;
                }
                
                totalRevenue += sessionRevenue;
            }
        }
        
        const { data: expensesData } = await supabaseClient
            .from('expenses')
            .select('amount')
            .eq('shift_id', currentShift.id);
        const totalExpenses = (expensesData || []).reduce((sum, e) => sum + Number(e.amount), 0);
        
        document.getElementById('dashRevenue').textContent = money(Math.round(totalRevenue * 100) / 100);
        document.getElementById('dashExpenses').textContent = money(Math.round(totalExpenses * 100) / 100);
        document.getElementById('dashActive').textContent = Object.keys(sessions).length;
        document.getElementById('dashAvailable').textContent = stations.length - Object.keys(sessions).length;
    } catch (e) {
        console.error('Error rendering dashboard:', e);
        document.getElementById('dashRevenue').textContent = '0';
        document.getElementById('dashExpenses').textContent = '0';
        document.getElementById('dashActive').textContent = Object.keys(sessions).length;
        document.getElementById('dashAvailable').textContent = stations.length - Object.keys(sessions).length;
    }
}

// ============================================================
// STATIONS
// ============================================================
function renderStationsGrid() {
    const grid = document.getElementById('stationsGrid');
    grid.innerHTML = stations.map(st => {
        const s = sessions[st.id];
        const occupied = !!s;
        const statusText = occupied ? t('شغال', 'Active') : t('متاح', 'Available');
        const displayName = st.name ? st.name : t('جهاز', 'Device') + ' ' + st.number;
        let modeBadge = '';
        let timerBadge = '';
        let timerDisplay = '';
        
        if (occupied) {
            const mode = s.current_mode || 'single';
            const modeLabel = mode === 'single' ? t('Single', 'Single') : t('Multi', 'Multi');
            const badgeClass = mode === 'single' ? 'badge-mode-single' : 'badge-mode-multi';
            modeBadge = `<span class="badge ${badgeClass}" style="font-size:9px;padding:1px 8px;">${modeLabel}</span>`;
            
            const timerType = s.timer_type || 'countup';
            const timerLabel = timerType === 'countdown' ? t('تنازلي', 'Countdown') : t('تصاعدي', 'Count Up');
            const timerBadgeClass = timerType === 'countdown' ? 'badge-timer-down' : 'badge-timer-up';
            timerBadge = `<span class="badge ${timerBadgeClass}" style="font-size:8px;padding:1px 6px;">${timerLabel}</span>`;
            
            timerDisplay = `<div class="station-timer mono" data-start="${s.started_at}" data-station-id="${st.id}" data-timer-type="${timerType}">${formatElapsed(new Date(s.started_at))}</div>`;
        } else {
            timerDisplay = `<div class="station-rate">${t('Single', 'Single')} ${money(st.single_rate || 20)} / ${t('Multi', 'Multi')} ${money(st.multi_rate || 30)} ${t('ج/ساعة', 'EGP/hr')}</div>`;
        }
        
        const hasQrOrder = !!(qrOrders[st.id] && qrOrders[st.id].length);
        const qrBadge = hasQrOrder
            ? `<div class="qr-order-badge" onclick="event.stopPropagation(); openQrOrdersSheet('${st.id}')" title="${t('طلب من العميل', 'Customer order')}"><i class="fa-solid fa-exclamation"></i></div>`
            : '';

        const qrStationBtn = qrOrderingEnabled
            ? `<button class="qr-station-btn" onclick="event.stopPropagation(); openStationQrSheet('${st.id}')" title="${t('كود QR لطلب العميل', 'Customer order QR code')}"><i class="fa-solid fa-qrcode"></i></button>`
            : '';

        return `<div class="station-card ${occupied ? 'occupied' : ''} ${hasQrOrder ? 'has-qr-order' : ''}" onclick="openStationSheet('${st.id}')">
            ${qrBadge}
            ${qrStationBtn}
            <div><div class="station-num">${displayName}</div><div class="station-status">${statusText} ${modeBadge} ${timerBadge}</div></div>
            ${timerDisplay}
        </div>`;
    }).join('');
}

// ============================================================
// STATION SHEET
// ============================================================
async function openStationSheet(stationId) {
    activeStationId = stationId;
    const st = stations.find(s => s.id === stationId);
    const session = sessions[stationId];
    const displayName = st.name ? st.name : t('جهاز', 'Device') + ' ' + st.number;
    document.getElementById('stationSheetTitle').textContent = displayName;
    const body = document.getElementById('stationSheetBody');

    await markStationQrOrdersSeen(stationId);

    body.innerHTML = '';

    if (!session) {
        currentOrderSessionId = null;
        const singleRate = st.single_rate || 20;
        const multiRate = st.multi_rate || 30;
        body.innerHTML = `
            <div class="section-title">${t('اختر وضع اللعب', 'Select Gameplay Mode')}</div>
            <div class="mode-selector" id="modeSelector">
                <div class="mode-option selected-single" data-mode="single" onclick="selectStartMode('single')">
                    <span class="mode-icon">🎮</span>
                    <div class="mode-name">${t('Single', 'Single')}</div>
                    <div class="mode-rate">${money(singleRate)} ${t('ج/ساعة', 'EGP/hr')}</div>
                </div>
                <div class="mode-option" data-mode="multi" onclick="selectStartMode('multi')">
                    <span class="mode-icon">👥</span>
                    <div class="mode-name">${t('Multi', 'Multi')}</div>
                    <div class="mode-rate">${money(multiRate)} ${t('ج/ساعة', 'EGP/hr')}</div>
                </div>
            </div>
            <input type="hidden" id="selectedStartMode" value="single">
            
            <div class="section-title">${t('نوع التايمر', 'Timer Type')}</div>
            <div class="timer-selector" id="timerSelector">
                <div class="timer-option selected-up" data-timer="countup" onclick="selectTimerType('countup')">
                    <span class="timer-icon">⬆️</span>
                    <div class="timer-name">${t('تصاعدي', 'Count Up')}</div>
                    <div class="timer-desc">${t('يحسب الوقت الفعلي', 'Counts actual time')}</div>
                </div>
                <div class="timer-option" data-timer="countdown" onclick="selectTimerType('countdown')">
                    <span class="timer-icon">⬇️</span>
                    <div class="timer-name">${t('تنازلي', 'Count Down')}</div>
                    <div class="timer-desc">${t('يعد تنازلي من مدة محددة', 'Counts down from set duration')}</div>
                </div>
            </div>
            <input type="hidden" id="selectedTimerType" value="countup">
            
            <div id="durationSelector" style="display:none;">
                <div class="section-title">${t('المدة بالساعات', 'Duration in Hours')}</div>
                <div class="field">
                    <label data-ar="أدخل المدة بالساعات (مثال: 1.5 = ساعة ونص)" data-en="Enter duration in hours (e.g., 1.5 = 1 hour 30 min)">${t('المدة بالساعات', 'Duration in Hours')}</label>
                    <input type="number" id="durationInput" class="mono" step="0.25" min="0.25" value="1" placeholder="مثال: 1.5" oninput="updateDurationDisplay()">
                </div>
                <div style="font-size:12px;color:var(--text-dim);margin-top:4px;">
                    ${t('يمكنك إدخال أي رقم عشري (0.25 = 15 دقيقة، 1.5 = ساعة ونص، 2.25 = ساعتين وربع)', 'You can enter any decimal (0.25 = 15 min, 1.5 = 1.5 hours, 2.25 = 2 hours 15 min)')}
                </div>
                <div style="font-size:14px;color:var(--text);margin-top:8px;text-align:center;">
                    <span style="color:var(--text-dim);">${t('المدة المختارة:', 'Selected duration:')}</span>
                    <span id="durationDisplay" style="font-weight:700;color:var(--amber);">1 ${t('ساعة', 'hour')}</span>
                </div>
            </div>
            <input type="hidden" id="selectedDuration" value="3600">

            <div class="section-title">${t('دفع مقدماً (اختياري)', 'Advance Payment (optional)')}</div>
            <div class="field">
                <label data-ar="لو العميل دفع مبلغ مقدماً، اكتبه هنا وهيتخصم من حسابه عند إنهاء الجلسة" data-en="If the customer paid in advance, enter it here — it will be deducted from their bill when the session ends">${t('المبلغ المدفوع مقدماً (جنيه)', 'Amount Paid in Advance (EGP)')}</label>
                <input type="number" id="prepaidAmountInput" class="mono" min="0" step="0.5" value="0" placeholder="0">
            </div>

            <button class="btn btn-amber btn-block" onclick="startSessionWithMode('${stationId}')">
                <i class="fa-solid fa-play"></i> ${t('بدء الجلسة', 'Start Session')}
            </button>
            <div class="error-text" id="startSessionError"></div>
        `;
        
        setTimeout(() => {
            if (document.getElementById('durationInput')) {
                updateDurationDisplay();
            }
        }, 100);
        openSheet('stationOverlay');

        await renderQrOrdersInSheet(stationId, body);
        return;
    }

    currentOrderSessionId = session.id;

    const segments = await getSessionSegments(session.id);
    let activeSeg = segments.find(s => !s.ended_at);

    if (!activeSeg && session._pausedRemaining) {
        const st2 = stations.find(s => s.id === stationId);
        const mode = session.current_mode || 'single';
        const rate = mode === 'single' ? (st2.single_rate || 20) : (st2.multi_rate || 30);
        const timerType = 'countdown';
        const durationSeconds = session._pausedRemaining;
        delete session._pausedRemaining;
        
        await createSegment(session.id, mode, new Date().toISOString(), rate, timerType, durationSeconds);
        activeSeg = await getActiveSegment(session.id);
        activeSegmentCache[session.id] = activeSeg;
    }

    const totals = await calculateTotalAmounts(session.id);
    const currentEstimate = await getCurrentSegmentEstimate(session.id);
    
    const currentMode = activeSeg ? activeSeg.mode : (session.current_mode || 'single');
    const currentRate = activeSeg ? activeSeg.rate : (st.single_rate || 20);
    const modeLabel = currentMode === 'single' ? t('Single', 'Single') : t('Multi', 'Multi');
    const modeBadgeClass = currentMode === 'single' ? 'badge-mode-single' : 'badge-mode-multi';
    const switchLabel = currentMode === 'single' ? t('تحويل إلى Multi', 'Switch to Multi') : t('تحويل إلى Single', 'Switch to Single');
    const switchMode = currentMode === 'single' ? 'multi' : 'single';
    const switchRate = switchMode === 'single' ? (st.single_rate || 20) : (st.multi_rate || 30);
    
    const timerType = activeSeg ? (activeSeg.timer_type || 'countup') : 'countup';
    const timerLabel = timerType === 'countdown' ? t('تنازلي', 'Countdown') : t('تصاعدي', 'Count Up');
    const timerBadgeClass = timerType === 'countdown' ? 'badge-timer-down' : 'badge-timer-up';
    const isCountdown = timerType === 'countdown';

    const { data: orders } = await supabaseClient.from('session_orders').select('*').eq('session_id', session.id).order('created_at');
    activeSessionOrders = orders || [];

    const activeSegStart = activeSeg ? activeSeg.started_at : session.started_at;
    const liveEarnedNow = activeSeg ? Math.round((Math.max(0, (nowCorrected() - new Date(activeSeg.started_at)) / 3600000) * Number(activeSeg.rate)) * 100) / 100 : 0;
    const liveGrandTotal = Math.round((totals.grandTotal + liveEarnedNow) * 100) / 100;

    body.innerHTML = `
        <div style="text-align:center;margin-bottom:12px;">
            <div style="display:flex;justify-content:center;gap:8px;align-items:center;flex-wrap:wrap;">
                <span class="badge ${modeBadgeClass}" style="font-size:13px;padding:4px 14px;">${modeLabel}</span>
                <span class="badge ${timerBadgeClass}" style="font-size:11px;padding:3px 10px;">${timerLabel}</span>
                <span class="badge badge-teal" style="font-size:13px;padding:4px 14px;">${money(currentRate)} ${t('ج/ساعة', 'EGP/hr')}</span>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
            <div class="stat-card" style="padding:10px;">
                <div class="stat-label" style="font-size:10px;">${isCountdown ? t('الوقت المتبقي', 'Time Remaining') : t('إجمالي الجلسة', 'Total Session')}</div>
                <div class="station-timer mono ${isCountdown ? 'countdown' : ''}" style="font-size:22px;" id="activeSessionTimer" data-start="${session.started_at}" data-station-id="${stationId}">${isCountdown ? formatCountdown(getRemainingSeconds(activeSeg)) : formatElapsed(new Date(session.started_at))}</div>
            </div>
            <div class="stat-card" style="padding:10px;border-color:${currentMode === 'single' ? 'var(--amber-dim)' : 'var(--teal-dim)'};">
                <div class="stat-label" style="font-size:10px;">${t('الجزء الحالي', 'Current Segment')}</div>
                <div class="station-timer mono" style="font-size:22px;color:${currentMode === 'single' ? 'var(--amber)' : 'var(--teal)'};" id="currentSegTimer" data-start="${activeSegStart}">${formatElapsed(new Date(activeSegStart))}</div>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
            <div style="background:var(--bg-sunken);border-radius:var(--radius-sm);padding:8px;text-align:center;">
                <div style="font-size:10px;color:var(--text-dim);">${isCountdown ? t('قيمة الوقت المتبقي', 'Remaining Value') : t('قيمة الجزء الحالي', 'Current Segment Value')}</div>
                <div class="mono" style="font-size:18px;font-weight:700;color:${currentMode === 'single' ? 'var(--amber)' : 'var(--teal)'};" id="currentSegAmount">${moneyDec(currentEstimate.amount)}</div>
            </div>
            <div style="background:var(--bg-sunken);border-radius:var(--radius-sm);padding:8px;text-align:center;">
                <div style="font-size:10px;color:var(--text-dim);">${t('الإجمالي الكلي', 'Grand Total')}</div>
                <div class="mono" style="font-size:18px;font-weight:700;color:var(--amber);" id="overallTotalAmount" data-base-total="${totals.grandTotal}">${moneyDec(liveGrandTotal)}</div>
            </div>
        </div>

        <div class="section-title">${t('دفع مقدماً', 'Advance Payment')}</div>
        <div style="background:var(--bg-sunken);border-radius:var(--radius-sm);padding:10px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-size:12px;color:var(--text-dim);">${t('المدفوع مقدماً حالياً', 'Currently Paid in Advance')}</span>
                <span class="mono" id="currentPrepaidDisplay" style="font-weight:700;color:var(--teal);">${moneyDec(Number(session.prepaid_amount) || 0)} ${t('ج', 'EGP')}</span>
            </div>
            <div style="display:flex;gap:8px;">
                <input type="number" id="addPrepaidInput" class="mono" min="0" step="0.5" placeholder="${t('أضف مبلغ', 'Add amount')}" style="flex:1;">
                <button class="btn btn-teal" style="flex-shrink:0;" onclick="addPrepaidAmount('${stationId}')">
                    <i class="fa-solid fa-plus"></i> ${t('إضافة', 'Add')}
                </button>
            </div>
        </div>
        
        ${segments.filter(s => s.ended_at).length > 0 ? `
        <div class="segment-breakdown">
            <div style="font-size:11px;color:var(--text-dim);font-weight:600;margin-bottom:4px;">${t('تفصيل الأجزاء السابقة', 'Previous Segments')}</div>
            ${segments.filter(s => s.ended_at).map(s => {
                const start2 = new Date(s.started_at);
                const end = new Date(s.ended_at);
                const mins = Math.round((end - start2) / 60000);
                const amt = (s.amount !== null && s.amount !== undefined) ? Number(s.amount) : calculateSegmentAmountFromTimes(s.started_at, s.ended_at, s.rate);
                const modeClass = s.mode === 'single' ? 'seg-mode-single' : 'seg-mode-multi';
                const modeLabel2 = s.mode === 'single' ? t('Single', 'Single') : t('Multi', 'Multi');
                const segTimerType = s.timer_type || 'countup';
                const timerLabel2 = segTimerType === 'countdown' ? '⬇️' : '⬆️';
                return `<div class="segment-row"><span class="seg-label"><span class="${modeClass}">●</span> ${modeLabel2} ${mins}${t('د', 'min')} ${timerLabel2} @ ${money(s.rate)}</span><span class="seg-value ${modeClass}">${moneyDec(amt)}</span></div>`;
            }).join('')}
            <div class="segment-divider"></div>
            <div class="segment-row"><span class="seg-label">${t('إجمالي Single', 'Single Total')}</span><span class="seg-value seg-mode-single">${moneyDec(totals.singleTotal)}</span></div>
            <div class="segment-row"><span class="seg-label">${t('إجمالي Multi', 'Multi Total')}</span><span class="seg-value seg-mode-multi">${moneyDec(totals.multiTotal)}</span></div>
            <div class="segment-row"><span class="seg-label">${t('الطلبات', 'Orders')}</span><span class="seg-value">${moneyDec(totals.ordersTotal)}</span></div>
            <div class="segment-row segment-total"><span class="seg-label">${t('الإجمالي الكلي', 'Grand Total')}</span><span class="seg-value" style="color:var(--amber);">${moneyDec(totals.grandTotal)}</span></div>
        </div>
        ` : ''}
        
        <div class="section-title">${t('إضافة طلب', 'Add Order')}</div>
        <div id="menuQuickAdd" style="margin-bottom:12px;"></div>
        
        <div class="section-title">${t('الطلبات', 'Orders')}</div>
        <div class="panel" id="stationOrdersList"></div>
        
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;">
            <button class="btn btn-amber btn-block" onclick="handleSwitchMode('${session.id}','${switchMode}','${st.id}')" id="switchModeBtn">
                <i class="fa-solid fa-arrows-rotate"></i> ${switchLabel} (${money(switchRate)} ${t('ج/ساعة', 'EGP/hr')})
            </button>
            
            <div style="display:flex;gap:8px;">
                <button class="btn btn-transfer" style="flex:1;" onclick="openTransferSheet('${stationId}')">
                    <i class="fa-solid fa-exchange"></i> ${t('نقل الجلسة', 'Transfer Session')}
                </button>
                <button class="btn btn-cancel" style="flex:1;" onclick="confirmCancelSession('${stationId}')">
                    <i class="fa-solid fa-xmark"></i> ${t('إلغاء الجلسة', 'Cancel Session')}
                </button>
            </div>
            <button class="btn btn-ghost" onclick="closeSheet('stationOverlay')">${t('رجوع', 'Back')}</button>
            <button class="btn btn-teal btn-block" onclick="showEndSessionPayment('${stationId}')"><i class="fa-solid fa-stop"></i> ${t('إنهاء الجلسة', 'End Session')}</button>
        </div>
        <div class="error-text" id="stationSheetError"></div>
    `;
    
    renderMenuQuickAdd();
    renderStationOrdersSection();
    
    await renderQrOrdersInSheet(stationId, body);

    openSheet('stationOverlay');
}

async function renderQrOrdersInSheet(stationId, bodyElement) {
    const { data: qrOrdersForStation } = await supabaseClient
        .from('qr_orders')
        .select('*')
        .eq('station_id', stationId)
        .in('status', ['pending', 'seen'])
        .order('created_at', { ascending: true });

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
        bodyElement.insertAdjacentHTML('beforeend', qrHtml);
    }
}

// ============================================================
// STATION MANAGEMENT (Settings)
// ============================================================
let settingsStationsExpanded = false;

function toggleSettingsStations() {
    settingsStationsExpanded = !settingsStationsExpanded;
    document.getElementById('settingsStations').style.display = settingsStationsExpanded ? 'block' : 'none';
    document.getElementById('settingsStationsChevron').style.transform = settingsStationsExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
}

// ============================================================
// BULK RATE
// ============================================================
async function applyBulkRate(type) {
    const singleInput = document.getElementById('bulkSingleRateInput');
    const multiInput = document.getElementById('bulkMultiRateInput');
    
    let rate, fieldName, typeLabel;
    if (type === 'single') {
        rate = parseFloat(singleInput.value);
        fieldName = 'single_rate';
        typeLabel = 'Single';
        if (isNaN(rate) || rate < 0) {
            showToast(t('اكتب سعر Single صحيح', 'Enter a valid Single price'), 'error');
            return;
        }
    } else {
        rate = parseFloat(multiInput.value);
        fieldName = 'multi_rate';
        typeLabel = 'Multi';
        if (isNaN(rate) || rate < 0) {
            showToast(t('اكتب سعر Multi صحيح', 'Enter a valid Multi price'), 'error');
            return;
        }
    }
    
    if (!stations || stations.length === 0) {
        showToast(t('مفيش أجهزة عشان تتحدث', 'No devices to update'), 'error');
        return;
    }
    
    if (!confirm(t(`هل أنت متأكد من تثبيت سعر ${rate} ج/ساعة لـ ${typeLabel} لكل الأجهزة (${stations.length})؟`, `Set ${rate} EGP/hr for ${typeLabel} on all ${stations.length} devices?`))) return;

    try {
        const updateData = {};
        updateData[fieldName] = rate;
        
        const { data, error } = await supabaseClient
            .from('stations')
            .update(updateData)
            .eq('business_id', business.id)
            .select();

        if (error) {
            showToast(t('فشل تحديث السعر: ' + error.message, 'Failed to update price: ' + error.message), 'error');
            console.error('Error bulk-updating rates:', error);
            return;
        }
        if (!data || data.length === 0) {
            console.error('Bulk rate update affected 0 rows — check RLS UPDATE policy on "stations" table.');
            showToast(t('فشل تحديث السعر: قاعدة البيانات رفضت الحفظ (تحقق من صلاحيات RLS على جدول stations)', 'Failed to update price: database rejected the save (check RLS permissions on the stations table)'), 'error');
            return;
        }

        if (type === 'single') {
            singleInput.value = '';
        } else {
            multiInput.value = '';
        }
        
        showToast(t(`اتحدث سعر ${typeLabel} لكل الأجهزة`, `${typeLabel} price updated for all devices`), 'success');
        await loadStations();
        renderSettingsStations();
        renderStationsGrid();
    } catch (e) {
        console.error('Error applying bulk rate:', e);
        showToast(t('حصل خطأ، حاول تاني.', 'Error, try again.'), 'error');
    }
}

function renderSettingsStations() {
    const el = document.getElementById('settingsStations');
    const countEl = document.getElementById('settingsStationsCount');
    if (countEl) countEl.textContent = stations && stations.length ? `(${stations.length})` : '';
    if (!stations || stations.length === 0) {
        el.innerHTML = `<div class="empty"><i class="fa-solid fa-gamepad"></i>${t('مفيش أجهزة — ضيف أول جهاز', 'No devices — add your first device')}</div>`;
        return;
    }
    const qrEnabled = qrOrderingEnabled;
    el.innerHTML = stations.map(st => {
        const displayName = st.name ? st.name : t('جهاز', 'Device') + ' ' + st.number;
        return `<div class="list-row">
            <div><div class="row-title">${escapeHtml(displayName)}</div><div class="row-sub">${t('رقم', 'No.')} ${st.number} — ${t('Single', 'Single')} ${money(st.single_rate || 20)} / ${t('Multi', 'Multi')} ${money(st.multi_rate || 30)} ${t('ج/ساعة', 'EGP/hr')}</div></div>
            <div class="row-actions">
                ${qrEnabled ? `<button class="btn btn-teal btn-sm" onclick="openStationQrSheet('${st.id}')" title="${t('كود QR للطلب', 'Order QR code')}"><i class="fa-solid fa-qrcode"></i></button>` : ''}
                <button class="btn btn-ghost btn-sm" onclick="editStation('${st.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger-sm" onclick="deleteStationById('${st.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function openStationManagementSheet() {
    document.getElementById('stationManageId').value = '';
    document.getElementById('stationManageNumber').value = stations.length + 1;
    document.getElementById('stationManageName').value = '';
    document.getElementById('stationManageSingleRate').value = '20';
    document.getElementById('stationManageMultiRate').value = '30';
    document.getElementById('stationDeleteBtn').style.display = 'none';
    document.getElementById('stationManageError').textContent = '';
    document.getElementById('stationManagementTitle').textContent = t('إضافة جهاز', 'Add Device');
    openSheet('stationManagementOverlay');
}

function editStation(stationId) {
    const st = stations.find(s => s.id === stationId);
    if (!st) return;
    document.getElementById('stationManageId').value = st.id;
    document.getElementById('stationManageNumber').value = st.number;
    document.getElementById('stationManageName').value = st.name || '';
    document.getElementById('stationManageSingleRate').value = st.single_rate || 20;
    document.getElementById('stationManageMultiRate').value = st.multi_rate || 30;
    document.getElementById('stationDeleteBtn').style.display = 'flex';
    document.getElementById('stationManageError').textContent = '';
    document.getElementById('stationManagementTitle').textContent = t('تعديل جهاز', 'Edit Device');
    openSheet('stationManagementOverlay');
}

async function submitStationManagement() {
    const id = document.getElementById('stationManageId').value;
    const number = parseInt(document.getElementById('stationManageNumber').value);
    const name = document.getElementById('stationManageName').value.trim();
    const singleRate = parseFloat(document.getElementById('stationManageSingleRate').value);
    const multiRate = parseFloat(document.getElementById('stationManageMultiRate').value);
    const errEl = document.getElementById('stationManageError');
    errEl.textContent = '';

    if (!number || number < 1) { errEl.textContent = t('رقم الجهاز مطلوب.', 'Device number is required.'); return; }
    if (isNaN(singleRate) || singleRate < 0) { errEl.textContent = t('سعر Single مطلوب.', 'Single rate is required.'); return; }
    if (isNaN(multiRate) || multiRate < 0) { errEl.textContent = t('سعر Multi مطلوب.', 'Multi rate is required.'); return; }

    if (!id && stations.some(s => s.number === number)) {
        errEl.textContent = t('رقم الجهاز مستخدم بالفعل.', 'Device number already exists.');
        return;
    }

    try {
        if (id) {
            const { error } = await supabaseClient.from('stations').update({ number, name, single_rate: singleRate, multi_rate: multiRate }).eq('id', id).eq('business_id', business.id);
            if (error) throw error;
            showToast(t('تم تحديث الجهاز', 'Device updated'), 'success');
        } else {
            const { error } = await supabaseClient.from('stations').insert({ business_id: business.id, number, name, single_rate: singleRate, multi_rate: multiRate });
            if (error) throw error;
            showToast(t('تم إضافة الجهاز', 'Device added'), 'success');
        }
        closeSheet('stationManagementOverlay');
        await loadStations();
        renderStationsGrid();
        renderSettingsStations();
        renderDashboard();
    } catch (e) {
        errEl.textContent = t('حصل خطأ، حاول تاني.', 'Error, try again.');
        console.error(e);
    }
}

async function deleteStationById(stationId) {
    if (!confirm(t('هل أنت متأكد من حذف هذا الجهاز؟', 'Are you sure you want to delete this device?'))) return;

    if (sessions[stationId]) {
        showToast(t('لا يمكن حذف جهاز عليه جلسة شغالة.', 'Cannot delete a device with an active session.'), 'error');
        return;
    }

    try {
        const { error } = await supabaseClient.from('stations').delete().eq('id', stationId).eq('business_id', business.id);
        if (error) throw error;
        showToast(t('تم حذف الجهاز', 'Device deleted'), 'success');
        await loadStations();
        renderStationsGrid();
        renderSettingsStations();
        renderDashboard();
    } catch (e) {
        showToast(t('فشل الحذف، حاول تاني.', 'Delete failed, try again.'), 'error');
        console.error(e);
    }
}

async function deleteStation() {
    const id = document.getElementById('stationManageId').value;
    if (!id) return;
    closeSheet('stationManagementOverlay');
    await deleteStationById(id);
}

// ============================================================
// PAYMENT METHODS (Settings)
// ============================================================
function renderSettingsPaymentMethods() {
    const el = document.getElementById('settingsPaymentMethods');
    if (!paymentMethods || paymentMethods.length === 0) {
        el.innerHTML = `<div class="empty"><i class="fa-solid fa-credit-card"></i>${t('مفيش طرق دفع — ضيف أول طريقة', 'No payment methods — add your first method')}</div>`;
        return;
    }
    el.innerHTML = paymentMethods.map(pm => {
        const colorMap = {
            'badge-teal': 'var(--teal)',
            'badge-amber': 'var(--amber)',
            'badge-green': 'var(--green)',
            'badge-purple': 'var(--purple)',
            'badge-red': 'var(--red)'
        };
        const color = colorMap[pm.color] || 'var(--text)';
        return `<div class="list-row">
            <div><div class="row-title"><i class="fa-solid ${pm.icon}" style="color:${color};width:20px;"></i> ${escapeHtml(pm.name)}</div>
            <div class="row-sub">${pm.active ? t('مفعل', 'Active') : t('غير مفعل', 'Inactive')}</div></div>
            <div class="row-actions">
                <button class="btn btn-ghost btn-sm" onclick="editPaymentMethod('${pm.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger-sm" onclick="deletePaymentMethodById('${pm.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

function openPaymentMethodSheet() {
    document.getElementById('paymentMethodId').value = '';
    document.getElementById('paymentMethodName').value = '';
    document.getElementById('paymentMethodIcon').value = 'fa-money-bill-wave';
    document.getElementById('paymentMethodColor').value = 'badge-green';
    document.getElementById('paymentMethodActive').checked = true;
    document.getElementById('paymentDeleteBtn').style.display = 'none';
    document.getElementById('paymentMethodError').textContent = '';
    document.getElementById('paymentMethodTitle').textContent = t('إضافة طريقة دفع', 'Add Payment Method');
    openSheet('paymentMethodOverlay');
}

function editPaymentMethod(pmId) {
    const pm = paymentMethods.find(p => p.id === pmId);
    if (!pm) return;
    document.getElementById('paymentMethodId').value = pm.id;
    document.getElementById('paymentMethodName').value = pm.name;
    document.getElementById('paymentMethodIcon').value = pm.icon || 'fa-money-bill-wave';
    document.getElementById('paymentMethodColor').value = pm.color || 'badge-green';
    document.getElementById('paymentMethodActive').checked = pm.active !== false;
    document.getElementById('paymentDeleteBtn').style.display = 'flex';
    document.getElementById('paymentMethodError').textContent = '';
    document.getElementById('paymentMethodTitle').textContent = t('تعديل طريقة دفع', 'Edit Payment Method');
    openSheet('paymentMethodOverlay');
}

async function submitPaymentMethod() {
    const id = document.getElementById('paymentMethodId').value;
    const name = document.getElementById('paymentMethodName').value.trim();
    const icon = document.getElementById('paymentMethodIcon').value;
    const color = document.getElementById('paymentMethodColor').value;
    const active = document.getElementById('paymentMethodActive').checked;
    const errEl = document.getElementById('paymentMethodError');
    errEl.textContent = '';

    if (!name) { errEl.textContent = t('اسم طريقة الدفع مطلوب.', 'Payment method name is required.'); return; }

    try {
        if (id) {
            await supabaseClient.from('payment_methods').update({ name, icon, color, active }).eq('id', id);
            showToast(t('تم تحديث طريقة الدفع', 'Payment method updated'), 'success');
        } else {
            await supabaseClient.from('payment_methods').insert({ business_id: business.id, name, icon, color, active });
            showToast(t('تم إضافة طريقة الدفع', 'Payment method added'), 'success');
        }
        closeSheet('paymentMethodOverlay');
        await loadPaymentMethods();
        renderSettingsPaymentMethods();
    } catch (e) {
        errEl.textContent = t('حصل خطأ، حاول تاني.', 'Error, try again.');
        console.error(e);
    }
}

async function deletePaymentMethodById(pmId) {
    if (!confirm(t('هل أنت متأكد من حذف طريقة الدفع هذه؟', 'Are you sure you want to delete this payment method?'))) return;
    try {
        await supabaseClient.from('payment_methods').delete().eq('id', pmId);
        showToast(t('تم حذف طريقة الدفع', 'Payment method deleted'), 'success');
        await loadPaymentMethods();
        renderSettingsPaymentMethods();
    } catch (e) {
        showToast(t('فشل الحذف، حاول تاني.', 'Delete failed, try again.'), 'error');
        console.error(e);
    }
}

async function deletePaymentMethod() {
    const id = document.getElementById('paymentMethodId').value;
    if (!id) return;
    closeSheet('paymentMethodOverlay');
    await deletePaymentMethodById(id);
}

// ============================================================
// ORDER FUNCTIONS
// ============================================================
async function addOrderItem(sessionId, menuItemId) {
    const item = menuItems.find(m => String(m.id) === String(menuItemId));
    if (!item) {
        showToast(t('الصنف غير موجود', 'Item not found'), 'error');
        return;
    }

    sessionId = sessionId ||
        currentOrderSessionId ||
        (activeStationId && sessions[activeStationId] ? sessions[activeStationId].id : '');

    if (!sessionId) {
        console.error('No active session ID', {
            activeStationId,
            currentOrderSessionId,
            stationSession: activeStationId ? sessions[activeStationId] : null
        });
        showToast(t('الجلسة غير موجودة', 'Session not found'), 'error');
        return;
    }

    try {
        const existing = activeSessionOrders.find(
            o => String(o.menu_item_id) === String(menuItemId)
        );

        if (existing) {
            const { error } = await supabaseClient
                .from('session_orders')
                .update({ quantity: Number(existing.quantity || 0) + 1 })
                .eq('id', existing.id);

            if (error) throw error;
        } else {
            let insertPayload = {
                business_id: business.id,
                session_id: sessionId,
                menu_item_id: item.id,
                item_name: item.name,
                unit_price: Number(item.price),
                quantity: 1
            };

            let { error } = await supabaseClient
                .from('session_orders')
                .insert(insertPayload);

            if (error && (
                error.code === '42703' ||
                /business_id/i.test(error.message || '') &&
                /column/i.test(error.message || '')
            )) {
                delete insertPayload.business_id;
                ({ error } = await supabaseClient
                    .from('session_orders')
                    .insert(insertPayload));
            }

            if (error) throw error;
        }

        const { data: refreshedOrders, error: reloadError } = await supabaseClient
            .from('session_orders')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at');

        if (reloadError) {
            console.error('Order was inserted, but reload failed:', reloadError);
            showToast(
                t('تم حفظ الطلب، لكن صلاحية قراءة الطلبات تحتاج مراجعة في Supabase.', 'Order was saved, but the SELECT permission for orders needs review in Supabase.'),
                'warning'
            );
        } else {
            activeSessionOrders = refreshedOrders || [];
        }

        renderStationOrdersSection();

        const totals = await calculateTotalAmounts(sessionId);
        const totalEl = document.getElementById('overallTotalAmount');
        if (totalEl) {
            totalEl.textContent = moneyDec(totals.grandTotal);
        }

        if (!reloadError) {
            showToast(t('تم إضافة الطلب', 'Order added'), 'success');
        }

    } catch (e) {
        console.error('Error adding order:', e);
        const code = e?.code || '';
        let userMessage = t('فشل إضافة الطلب', 'Failed to add order');
        if (code === '23503') {
            userMessage = t(
                'فشل الطلب: الصنف أو الجلسة غير موجودة في قاعدة البيانات.',
                'Order failed: the item or session does not exist in the database.'
            );
        } else if (code === '42501') {
            userMessage = t(
                'فشل الطلب: صلاحيات قاعدة البيانات (RLS) تمنع إضافة الطلب.',
                'Order failed: database permissions (RLS) are blocking the insert.'
            );
        } else if (code === '23502') {
            userMessage = t(
                'فشل الطلب: يوجد عمود مطلوب في session_orders لم يتم إرساله.',
                'Order failed: a required column in session_orders was not provided.'
            );
        } else if (code === '23514') {
            userMessage = t(
                'فشل الطلب: يوجد شرط CHECK في جدول session_orders يمنع هذه القيمة.',
                'Order failed: a CHECK constraint in session_orders rejected the value.'
            );
        }
        console.error('Supabase order error details:', { code, message: e?.message, details: e?.details, hint: e?.hint });
        showToast(userMessage, 'error');
    }
}

async function removeOrderItem(orderId) {
    const order = activeSessionOrders.find(o => o.id === orderId);
    if (!order) return;
    const sessionId = order.session_id;
    if (order.quantity > 1) {
        await supabaseClient.from('session_orders').update({ quantity: order.quantity - 1 }).eq('id', orderId);
        order.quantity -= 1;
    } else {
        await supabaseClient.from('session_orders').delete().eq('id', orderId);
        activeSessionOrders = activeSessionOrders.filter(o => o.id !== orderId);
    }
    renderStationOrdersSection();

    if (sessionId) {
        const totals = await calculateTotalAmounts(sessionId);
        activeSessionBaseTotal = totals.grandTotal;
        const totalEl = document.getElementById('overallTotalAmount');
        if (totalEl) {
            const { amount } = getCurrentSegmentEstimateFast(sessionId);
            totalEl.textContent = moneyDec(Math.round((totals.grandTotal + amount) * 100) / 100);
        }
    }
}

// ============================================================
// TRANSFER SESSION FUNCTIONS
// ============================================================
function openTransferSheet(stationId) {
    transferSourceStationId = stationId;
    const session = sessions[stationId];
    if (!session) {
        showToast(t('الجلسة غير موجودة', 'Session not found'), 'error');
        return;
    }
    
    const body = document.getElementById('transferSheetBody');
    const sourceStation = stations.find(s => s.id === stationId);
    const sourceName = sourceStation ? (sourceStation.name || t('جهاز', 'Device') + ' ' + sourceStation.number) : t('جهاز', 'Device');
    
    const availableStations = stations.filter(s => s.id !== stationId && !sessions[s.id]);
    
    if (availableStations.length === 0) {
        body.innerHTML = `
            <div class="empty" style="padding:20px;">
                <i class="fa-solid fa-exchange" style="font-size:32px;"></i>
                <div style="font-size:16px;font-weight:700;margin:10px 0;">${t('لا يوجد أجهزة متاحة', 'No available devices')}</div>
                <div style="font-size:13px;color:var(--text-dim);">${t('كل الأجهزة مشغولة حالياً', 'All devices are currently occupied')}</div>
                <button class="btn btn-ghost btn-block" style="margin-top:16px;" onclick="closeSheet('transferOverlay')">${t('رجوع', 'Back')}</button>
            </div>
        `;
        openSheet('transferOverlay');
        return;
    }
    
    body.innerHTML = `
        <div style="margin-bottom:12px;text-align:center;">
            <div style="font-size:13px;color:var(--text-dim);">${t('نقل الجلسة من', 'Transfer session from')}</div>
            <div style="font-size:18px;font-weight:700;color:var(--amber);">${escapeHtml(sourceName)}</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:4px;">${t('اختر الجهاز المستهدف', 'Select target device')}</div>
        </div>
        <div class="transfer-targets" id="transferTargets">
            ${availableStations.map(st => {
                const targetName = st.name ? st.name : t('جهاز', 'Device') + ' ' + st.number;
                return `<div class="transfer-option" data-id="${st.id}" onclick="selectTransferTarget('${st.id}')">
                    <div class="target-name">${escapeHtml(targetName)}</div>
                    <div class="target-status">${t('متاح', 'Available')}</div>
                </div>`;
            }).join('')}
        </div>
        <input type="hidden" id="selectedTransferTarget" value="">
        <button class="btn btn-transfer btn-block" id="confirmTransferBtn" onclick="confirmTransfer()" disabled>
            <i class="fa-solid fa-exchange"></i> ${t('تأكيد النقل', 'Confirm Transfer')}
        </button>
        <button class="btn btn-ghost btn-block" style="margin-top:8px;" onclick="closeSheet('transferOverlay')">${t('إلغاء', 'Cancel')}</button>
        <div class="error-text" id="transferError"></div>
    `;
    openSheet('transferOverlay');
}

function selectTransferTarget(stationId) {
    document.querySelectorAll('.transfer-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === stationId);
    });
    document.getElementById('selectedTransferTarget').value = stationId;
    document.getElementById('confirmTransferBtn').disabled = false;
}

async function confirmTransfer() {
    const targetStationId = document.getElementById('selectedTransferTarget').value;
    const sourceStationId = transferSourceStationId;
    const errEl = document.getElementById('transferError');
    errEl.textContent = '';
    
    if (!targetStationId) {
        errEl.textContent = t('اختر جهازاً مستهدفاً أولاً.', 'Select a target device first.');
        return;
    }
    
    if (sessions[targetStationId]) {
        errEl.textContent = t('الجهاز المستهدف أصبح مشغولاً.', 'Target device is now occupied.');
        return;
    }
    
    const sourceSession = sessions[sourceStationId];
    if (!sourceSession) {
        errEl.textContent = t('الجلسة المصدر غير موجودة.', 'Source session not found.');
        return;
    }
    
    const sourceStation = stations.find(s => s.id === sourceStationId);
    const targetStation = stations.find(s => s.id === targetStationId);
    const sourceName = sourceStation ? (sourceStation.name || t('جهاز', 'Device') + ' ' + sourceStation.number) : t('جهاز', 'Device');
    const targetName = targetStation ? (targetStation.name || t('جهاز', 'Device') + ' ' + targetStation.number) : t('جهاز', 'Device');
    
    const confirmMsg = t(
        `هل أنت متأكد من نقل الجلسة من "${sourceName}" إلى "${targetName}"؟\n\nسيتم نقل كل البيانات (الوقت، الأجزاء، الطلبات) مع الجلسة.`,
        `Are you sure you want to transfer the session from "${sourceName}" to "${targetName}"?\n\nAll data (time, segments, orders) will be transferred with the session.`
    );
    
    if (!confirm(confirmMsg)) return;
    
    try {
        const currentMode = sourceSession.current_mode || 'single';
        const currentRate = Number(sourceSession.rate) || (currentMode === 'multi' ? Number(targetStation.multi_rate) : Number(targetStation.single_rate));
        const { error: updateError } = await supabaseClient.from('sessions')
            .update({ station_id: targetStationId, rate: currentRate })
            .eq('id', sourceSession.id)
            .eq('business_id', business.id)
            .eq('status', 'active');
        if (updateError) throw updateError;

        delete sessions[sourceStationId];
        sessions[targetStationId] = { ...sourceSession, station_id: targetStationId, rate: currentRate };
        
        closeSheet('transferOverlay');
        closeSheet('stationOverlay');
        renderStationsGrid();
        renderDashboard();
        
        showToast(t(`تم نقل الجلسة إلى ${targetName}`, `Session transferred to ${targetName}`), 'success');
        
        setTimeout(() => openStationSheet(targetStationId), 300);
    } catch (e) {
        console.error('Error transferring session:', e);
        errEl.textContent = t('فشل نقل الجلسة: ' + e.message, 'Transfer failed: ' + e.message);
        showToast(t('فشل نقل الجلسة', 'Transfer failed'), 'error');
    }
}

// ============================================================
// CANCEL SESSION
// ============================================================
function confirmCancelSession(stationId) {
    const session = sessions[stationId];
    if (!session) return;
    
    const totalTime = formatElapsed(new Date(session.started_at));
    const hasOrders = activeSessionOrders && activeSessionOrders.length > 0;
    const ordersCount = hasOrders ? activeSessionOrders.length : 0;
    
    let confirmMsg = t(
        `⚠️ هل أنت متأكد من إلغاء الجلسة؟\n\nالمدة: ${totalTime}\nالطلبات: ${ordersCount} صنف\n\nملاحظة: لن يتم تسجيل أي إيراد من هذه الجلسة.`,
        `⚠️ Are you sure you want to cancel this session?\n\nDuration: ${totalTime}\nOrders: ${ordersCount} items\n\nNote: No revenue will be recorded from this session.`
    );
    
    if (!confirm(confirmMsg)) return;
    
    const secondConfirm = t(
        'تأكيد نهائي: هل أنت متأكد أنك لا تريد تسجيل هذه الجلسة؟',
        'Final confirmation: Are you sure you don\'t want to record this session?'
    );
    if (!confirm(secondConfirm)) return;
    
    executeCancelSession(stationId);
}

async function executeCancelSession(stationId) {
    const session = sessions[stationId];
    if (!session) {
        showToast(t('الجلسة غير موجودة', 'Session not found'), 'error');
        return;
    }
    
    endingSessionInProgress = true;
    
    try {
        const activeSeg = await getActiveSegment(session.id);
        if (activeSeg && !activeSeg.ended_at) {
            const now = new Date().toISOString();
            await closeSegment(activeSeg.id, now, 0);
        }
        
        const { data: orders } = await supabaseClient
            .from('session_orders')
            .select('id')
            .eq('session_id', session.id);
        
        if (orders && orders.length > 0) {
            const orderIds = orders.map(o => o.id);
            await supabaseClient.from('session_orders').delete().in('id', orderIds);
        }
        
        await supabaseClient.from('session_segments').delete().eq('session_id', session.id);
        await supabaseClient.from('sessions').delete().eq('id', session.id);
        
        delete sessions[stationId];
        
        renderStationsGrid();
        closeSheet('stationOverlay');
        renderDashboard();
        
        showToast(t('تم إلغاء الجلسة', 'Session cancelled'), 'warning');
    } catch (e) {
        console.error('Error cancelling session:', e);
        endingSessionInProgress = false;
        showToast(t('فشل إلغاء الجلسة: ' + e.message, 'Failed to cancel session: ' + e.message), 'error');
    }
}

// ============================================================
// TIMER TYPE SELECTION
// ============================================================
function selectTimerType(type) {
    document.querySelectorAll('.timer-option').forEach(el => {
        el.classList.remove('selected-up', 'selected-down');
        if (el.dataset.timer === type) {
            el.classList.add(type === 'countup' ? 'selected-up' : 'selected-down');
        }
    });
    document.getElementById('selectedTimerType').value = type;
    
    const durationSelector = document.getElementById('durationSelector');
    if (durationSelector) {
        durationSelector.style.display = type === 'countdown' ? 'block' : 'none';
        if (type === 'countdown') {
            setTimeout(updateDurationDisplay, 50);
        }
    }
}

function updateDurationDisplay() {
    const input = document.getElementById('durationInput');
    const displayEl = document.getElementById('durationDisplay');
    
    if (!input || !displayEl) return;
    
    const hours = parseFloat(input.value) || 0;
    
    if (hours <= 0) {
        displayEl.textContent = t('غير صالح', 'Invalid');
        document.getElementById('selectedDuration').value = 0;
        return;
    }
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    let displayText = '';
    if (h > 0) displayText += `${h} ${t('ساعة', 'hour')}`;
    if (m > 0) displayText += ` ${m} ${t('دقيقة', 'min')}`;
    if (!displayText) displayText = `${totalMinutes} ${t('دقيقة', 'min')}`;
    displayEl.textContent = displayText;
    
    document.getElementById('selectedDuration').value = Math.round(hours * 3600);
}

// ============================================================
// START SESSION WITH MODE
// ============================================================
async function startSessionWithMode(stationId) {
    const mode = document.getElementById('selectedStartMode').value;
    const timerType = document.getElementById('selectedTimerType').value;
    
    const hours = parseFloat(document.getElementById('durationInput').value) || 1;
    const durationSeconds = Math.round(hours * 3600);
    
    const st = stations.find(s => s.id === stationId);
    const rate = mode === 'single' ? (st.single_rate || 20) : (st.multi_rate || 30);
    
    const errEl = document.getElementById('startSessionError');
    errEl.textContent = '';
    
    if (timerType === 'countdown' && durationSeconds < 60) {
        errEl.textContent = t('المدة يجب أن تكون دقيقة على الأقل للتايمر التنازلي.', 'Duration must be at least 1 minute for countdown timer.');
        return;
    }
    
    const now = new Date(nowCorrected()).toISOString();

    const prepaidInput = document.getElementById('prepaidAmountInput');
    const prepaidAmount = prepaidInput ? Math.max(0, parseFloat(prepaidInput.value) || 0) : 0;

    try {
        const sessionPayload = {
            business_id: business.id, 
            station_id: stationId, 
            rate: rate,
            started_at: now,
            started_by_device: getDeviceId(),
            current_mode: mode,
            timer_type: timerType
        };

        let { data: session, error } = await supabaseClient.from('sessions').insert({
            ...sessionPayload,
            prepaid_amount: prepaidAmount
        }).select().single();

        if (error && /column .* does not exist/i.test(error.message || '')) {
            console.warn('prepaid_amount column missing — starting session without it:', error.message);
            ({ data: session, error } = await supabaseClient.from('sessions').insert(sessionPayload).select().single());
            if (!error && prepaidAmount > 0) {
                session.prepaid_amount = prepaidAmount;
            }
        }
        if (error) { throw error; }
        
        await createSegment(session.id, mode, now, rate, timerType, durationSeconds);
        
        sessions[stationId] = session;
        renderStationsGrid();
        closeSheet('stationOverlay');
        const timerLabel = timerType === 'countdown' ? t('تنازلي', 'Countdown') : t('تصاعدي', 'Count Up');
        const durationDisplay = timerType === 'countdown' ? ` (${hours} ${t('ساعة', 'hour')})` : '';
        showToast(t(`اتبدأت الجلسة - ${mode === 'single' ? 'Single' : 'Multi'} (${timerLabel}${durationDisplay})`, `Session started - ${mode === 'single' ? 'Single' : 'Multi'} (${timerLabel}${durationDisplay})`), 'success');
        renderDashboard();
        setTimeout(() => openStationSheet(stationId), 300);
    } catch (e) {
        console.error('Error starting session:', e);
        errEl.textContent = t('فشل بدء الجلسة', 'Failed to start session');
    }
}

// ============================================================
// END SESSION WITH PAYMENT
// ============================================================
function showEndSessionPayment(stationId) {
    endSessionStationId = stationId;
    activeStationId = stationId;
    endingSessionInProgress = true;
    const session = sessions[stationId];
    if (!session) { endingSessionInProgress = false; return; }

    (async () => {
        const activeSeg = await getActiveSegment(session.id);
        if (activeSeg && !activeSeg.ended_at) {
            const now = new Date(nowCorrected()).toISOString();
            const start = new Date(activeSeg.started_at);
            let hours = Math.max(0, (new Date(now) - start) / 3600000);
            let amount = Math.round((hours * Number(activeSeg.rate)) * 100) / 100;
            
            if (activeSeg.timer_type === 'countdown' && activeSeg.duration_seconds) {
                const elapsedSeconds = (new Date(now) - start) / 1000;
                const usedSeconds = Math.min(elapsedSeconds, activeSeg.duration_seconds);
                hours = usedSeconds / 3600;
                amount = Math.round((hours * Number(activeSeg.rate)) * 100) / 100;
            }
            
            await closeSegment(activeSeg.id, now, amount);
        }
        
        const totals = await calculateTotalAmounts(session.id);
        
        const { data: ordersDetails } = await supabaseClient
            .from('session_orders')
            .select('*')
            .eq('session_id', session.id)
            .order('created_at');
        
        const body = document.getElementById('stationSheetBody');
        
        let ordersHtml = '';
        if (ordersDetails && ordersDetails.length > 0) {
            ordersHtml = `
                <div class="section-title" style="margin-top:8px;font-size:12px;">${t('تفاصيل الطلبات', 'Order Details')}</div>
                <div style="background:var(--bg-sunken);border-radius:var(--radius-sm);padding:8px;margin-bottom:8px;">
                    ${ordersDetails.map(o => `
                        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid var(--border);">
                            <span>${escapeHtml(o.item_name)} <span style="color:var(--text-dim);font-size:11px;">× ${o.quantity}</span></span>
                            <span style="font-weight:600;">${moneyDec(o.quantity * o.unit_price)} ${t('ج', 'EGP')}</span>
                        </div>
                    `).join('')}
                    <div style="display:flex;justify-content:space-between;padding:6px 0 2px 0;font-weight:700;border-top:1px solid var(--border);margin-top:4px;padding-top:6px;">
                        <span>${t('إجمالي الطلبات', 'Orders Total')}</span>
                        <span>${moneyDec(totals.ordersTotal)} ${t('ج', 'EGP')}</span>
                    </div>
                </div>
            `;
        }
        
        const activeMethods = paymentMethods.filter(pm => pm.active !== false);
        currentEndSessionTotals = totals;
        endSessionDiscount = 0;
        endSessionAmountPaid = null;
        endSessionPrepaidAmount = Math.max(0, Number(session.prepaid_amount) || 0);

        const prepaidHtml = endSessionPrepaidAmount > 0 ? `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;color:var(--teal);">
                <span>${t('مدفوع مقدماً', 'Paid in Advance')}</span>
                <span class="mono" style="font-weight:700;">- ${moneyDec(endSessionPrepaidAmount)} ${t('ج', 'EGP')}</span>
            </div>` : '';
        
        let paymentHtml = `
            <div style="text-align:center;margin:12px 0;">
                <div style="font-size:28px;font-weight:700;color:var(--amber);">${moneyDec(totals.grandTotal)} ${t('ج', 'EGP')}</div>
                <div style="font-size:12px;color:var(--text-dim);">${t('الإجمالي الكلي', 'Grand Total')}</div>
            </div>
            <div class="segment-breakdown" style="margin-bottom:8px;">
                <div class="segment-row"><span class="seg-label">${t('إجمالي Single', 'Single Total')}</span><span class="seg-value seg-mode-single">${moneyDec(totals.singleTotal)}</span></div>
                <div class="segment-row"><span class="seg-label">${t('إجمالي Multi', 'Multi Total')}</span><span class="seg-value seg-mode-multi">${moneyDec(totals.multiTotal)}</span></div>
                <div class="segment-row"><span class="seg-label">${t('الطلبات', 'Orders')}</span><span class="seg-value">${moneyDec(totals.ordersTotal)}</span></div>
            </div>
            ${ordersHtml}
            <div class="section-title">${t('الخصم والدفع', 'Discount & Payment')}</div>
            <div style="background:var(--bg-sunken);border-radius:var(--radius-sm);padding:10px;margin-bottom:10px;">
                <div style="margin-bottom:10px;">
                    <label style="display:block;font-size:12px;color:var(--text-dim);margin-bottom:4px;">${t('خصم (جنيه)', 'Discount (EGP)')}</label>
                    <input type="number" id="discountInput" class="mono" min="0" step="0.5" value="0" placeholder="0" oninput="updatePaymentCalculation()" style="width:100%;">
                </div>
                ${prepaidHtml}
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-weight:700;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:10px;">
                    <span>${t('المتبقي المطلوب دفعه', 'Remaining Due Now')}</span>
                    <span class="mono" id="finalTotalDisplay" style="color:var(--amber);font-size:16px;">${moneyDec(Math.max(0, totals.grandTotal - endSessionPrepaidAmount))}</span>
                </div>
                <div id="prepaidCreditRow" style="display:none;justify-content:space-between;align-items:center;padding:0 0 10px;font-weight:700;color:var(--teal);">
                    <span>${t('باقي للعميل من المقدم', 'Remaining Credit for Customer')}</span>
                    <span class="mono" id="prepaidCreditAmount" style="font-size:16px;"></span>
                </div>
                <div style="margin-bottom:8px;">
                    <label style="display:block;font-size:12px;color:var(--text-dim);margin-bottom:4px;">${t('العميل دفع كام دلوقتي', 'Amount Paid by Customer Now')}</label>
                    <input type="number" id="amountPaidInput" class="mono" min="0" step="0.5" placeholder="${moneyDec(Math.max(0, totals.grandTotal - endSessionPrepaidAmount))}" oninput="updatePaymentCalculation()" style="width:100%;">
                </div>
                <div id="changeDueRow" style="display:none;justify-content:space-between;align-items:center;padding:8px 0 2px;font-weight:700;">
                    <span id="changeDueLabel"></span>
                    <span class="mono" id="changeDueAmount" style="font-size:16px;"></span>
                </div>
            </div>
            <div class="section-title">${t('اختر طريقة الدفع', 'Select Payment Method')}</div>`;
        
        if (activeMethods.length === 0) {
            paymentHtml += `
                <div class="empty" style="padding:20px;">
                    <i class="fa-solid fa-credit-card"></i>
                    ${t('مفيش طرق دفع مفعلة — روح الإعدادات وضيف طريقة', 'No active payment methods — go to settings and add one')}
                </div>
                <button class="btn btn-ghost btn-block" onclick="cancelEndSession()">${t('رجوع', 'Back')}</button>`;
        } else {
            paymentHtml += `
                <div class="payment-options" id="paymentOptions">
                    ${activeMethods.map(pm => `
                        <div class="payment-option" data-id="${pm.id}" style="cursor:pointer;">
                            <i class="fa-solid ${pm.icon}"></i>
                            ${escapeHtml(pm.name)}
                        </div>
                    `).join('')}
                </div>
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
                    <button class="btn btn-ghost" style="flex:1;" onclick="cancelEndSession()">${t('رجوع', 'Back')}</button>
                    <button class="btn btn-amber" style="flex:1;" id="confirmEndBtn" onclick="confirmEndSessionWithPayment()" disabled>
                        <i class="fa-solid fa-check"></i> ${t('تأكيد الدفع', 'Confirm Payment')}
                    </button>
                    <button class="btn btn-teal" style="flex:1;" id="printReceiptBtn" onclick="printReceipt()" disabled>
                        <i class="fa-solid fa-print"></i> ${t('طباعة', 'Print')}
                    </button>
                </div>`;
        }
        
        paymentHtml += `<div class="error-text" id="endSessionError"></div>`;
        body.innerHTML = paymentHtml;
        
        document.querySelectorAll('.payment-option').forEach(el => {
            el.addEventListener('click', function() {
                const pmId = this.dataset.id;
                if (pmId) {
                    selectPaymentMethod(pmId);
                }
            });
        });
        
        selectedPaymentMethod = null;
    })();
}

// ============================================================
// SELECT PAYMENT METHOD
// ============================================================
function selectPaymentMethod(pmId) {
    selectedPaymentMethod = pmId;
    
    document.querySelectorAll('.payment-option').forEach(el => {
        el.classList.remove('selected');
    });
    
    document.querySelectorAll('.payment-option').forEach(el => {
        if (el.dataset.id === pmId) {
            el.classList.add('selected');
        }
    });
    
    const confirmBtn = document.getElementById('confirmEndBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
    }
    
    const printBtn = document.getElementById('printReceiptBtn');
    if (printBtn) {
        printBtn.disabled = false;
    }
}

// ============================================================
// UPDATE PAYMENT CALCULATION
// ============================================================
function updatePaymentCalculation() {
    if (!currentEndSessionTotals) return;
    const grandTotal = currentEndSessionTotals.grandTotal;

    const discountInput = document.getElementById('discountInput');
    let discount = Math.max(0, parseFloat(discountInput.value) || 0);
    if (discount > grandTotal) {
        discount = grandTotal;
        discountInput.value = discount;
    }
    const totalAfterDiscount = Math.round((grandTotal - discount) * 100) / 100;

    const prepaid = endSessionPrepaidAmount || 0;
    const dueNow = Math.round((totalAfterDiscount - prepaid) * 100) / 100;
    const finalTotal = Math.max(0, dueNow);

    const finalTotalEl = document.getElementById('finalTotalDisplay');
    if (finalTotalEl) finalTotalEl.textContent = moneyDec(finalTotal);

    const prepaidCreditRow = document.getElementById('prepaidCreditRow');
    const prepaidCreditAmount = document.getElementById('prepaidCreditAmount');
    if (dueNow < 0) {
        if (prepaidCreditRow) prepaidCreditRow.style.display = 'flex';
        if (prepaidCreditAmount) prepaidCreditAmount.textContent = moneyDec(Math.abs(dueNow)) + ' ' + t('ج', 'EGP');
    } else {
        if (prepaidCreditRow) prepaidCreditRow.style.display = 'none';
    }

    const paidInput = document.getElementById('amountPaidInput');
    const paidVal = paidInput ? paidInput.value.trim() : '';
    const changeRow = document.getElementById('changeDueRow');
    const changeLabel = document.getElementById('changeDueLabel');
    const changeAmount = document.getElementById('changeDueAmount');

    if (paidVal === '') {
        if (changeRow) changeRow.style.display = 'none';
        endSessionAmountPaid = null;
    } else {
        const paid = Math.max(0, parseFloat(paidVal) || 0);
        const diff = Math.round((paid - finalTotal) * 100) / 100;
        if (changeRow) changeRow.style.display = 'flex';
        if (diff >= 0) {
            if (changeLabel) changeLabel.textContent = t('الباقي للعميل', 'Change Due to Customer');
            if (changeAmount) { changeAmount.textContent = moneyDec(diff); changeAmount.style.color = 'var(--teal)'; }
        } else {
            if (changeLabel) changeLabel.textContent = t('باقي على العميل', 'Remaining Owed by Customer');
            if (changeAmount) { changeAmount.textContent = moneyDec(Math.abs(diff)); changeAmount.style.color = '#ff6b6b'; }
        }
        endSessionAmountPaid = paid;
    }

    endSessionDiscount = discount;
}

// ============================================================
// CANCEL END SESSION
// ============================================================
function cancelEndSession() {
    const stationId = endSessionStationId || activeStationId;
    endingSessionInProgress = false;
    if (stationId) {
        closeSheet('stationOverlay');
        setTimeout(() => {
            openStationSheet(stationId);
        }, 200);
    } else {
        closeSheet('stationOverlay');
        navigateTo('view-stations');
    }
}

// ============================================================
// CONFIRM END SESSION WITH PAYMENT
// ============================================================
async function confirmEndSessionWithPayment() {
    if (!selectedPaymentMethod) {
        document.getElementById('endSessionError').textContent = t('اختر طريقة دفع أولاً.', 'Select a payment method first.');
        return;
    }
    const stationId = endSessionStationId;
    const session = sessions[stationId];
    if (!session) return;

    try {
        const activeSeg = await getActiveSegment(session.id);
        if (activeSeg && !activeSeg.ended_at) {
            const now = new Date(nowCorrected()).toISOString();
            const start = new Date(activeSeg.started_at);
            let hours = Math.max(0, (new Date(now) - start) / 3600000);
            let amount = Math.round((hours * Number(activeSeg.rate)) * 100) / 100;
            
            if (activeSeg.timer_type === 'countdown' && activeSeg.duration_seconds) {
                const elapsedSeconds = (new Date(now) - start) / 1000;
                const usedSeconds = Math.min(elapsedSeconds, activeSeg.duration_seconds);
                hours = usedSeconds / 3600;
                amount = Math.round((hours * Number(activeSeg.rate)) * 100) / 100;
            }
            
            await closeSegment(activeSeg.id, now, amount);
        }

        const totals = await calculateTotalAmounts(session.id);
        const discountAmount = Math.min(Math.max(0, endSessionDiscount || 0), totals.grandTotal);
        const finalTotal = Math.round((totals.grandTotal - discountAmount) * 100) / 100;

        const basePayload = {
            status: 'completed',
            ended_at: new Date(nowCorrected()).toISOString(),
            amount: finalTotal,
            payment_method: selectedPaymentMethod
        };

        let { error } = await supabaseClient.from('sessions').update({
            ...basePayload,
            discount: discountAmount,
            amount_paid: endSessionAmountPaid
        }).eq('id', session.id);

        if (error && /column .* does not exist/i.test(error.message || '')) {
            console.warn('discount/amount_paid columns missing — saving without them:', error.message);
            ({ error } = await supabaseClient.from('sessions').update(basePayload).eq('id', session.id));
        }
        
        if (error) {
            console.error('Error ending session:', error);
            endingSessionInProgress = false;
            showToast(t('فشل إنهاء الجلسة: ' + error.message, 'Failed to end session: ' + error.message), 'error');
            return;
        }
        
        const savedStationId = stationId;
        endSessionDiscount = discountAmount;
        
        delete sessions[stationId];
        renderStationsGrid();
        closeSheet('stationOverlay');
        const pm = paymentMethods.find(p => p.id === selectedPaymentMethod);
        showToast(`${t('اتقفلت الجلسة —', 'Session closed —')} ${moneyDec(finalTotal)} ${t('ج', 'EGP')} (${pm ? pm.name : ''})`, 'success');
        
        await renderDashboard();
        if (document.getElementById('view-shift').classList.contains('active')) {
            await renderShiftView();
        }
        
        setTimeout(() => {
            printReceipt();
        }, 500);
    } catch (e) {
        console.error('Error in confirmEndSessionWithPayment:', e);
        endingSessionInProgress = false;
        showToast(t('حصل خطأ، حاول تاني.', 'Error, try again.'), 'error');
    }
}

// ============================================================
// PRINT RECEIPT
// ============================================================
function printReceipt() {
    if (!selectedPaymentMethod) {
        showToast(t('اختر طريقة دفع أولاً.', 'Select a payment method first.'), 'warning');
        return;
    }
    
    const stationId = endSessionStationId || activeStationId;
    const session = sessions[stationId];
    if (!session) {
        showToast(t('جاري تحضير الإيصال...', 'Preparing receipt...'), 'warning');
        return;
    }
    
    calculateTotalAmounts(session.id).then(async (totals) => {
        const { data: ordersDetails } = await supabaseClient
            .from('session_orders')
            .select('*')
            .eq('session_id', session.id)
            .order('created_at');
        
        const pm = paymentMethods.find(p => p.id === selectedPaymentMethod);
        const station = stations.find(s => s.id === session.station_id);
        const stationName = station ? (station.name || t('جهاز', 'Device') + ' ' + station.number) : t('جهاز', 'Device');
        
        let ordersReceiptHtml = '';
        if (ordersDetails && ordersDetails.length > 0) {
            ordersReceiptHtml = `
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 10px 0;">
                <div style="font-size: 13px; margin-bottom: 8px;">
                    <div style="font-weight:700;margin-bottom:4px;">${t('الطلبات', 'Orders')}</div>
                    ${ordersDetails.map(o => `
                        <div style="display:flex;justify-content:space-between;padding:2px 0;font-size:12px;">
                            <span>${escapeHtml(o.item_name)} × ${o.quantity}</span>
                            <span>${moneyDec(o.quantity * o.unit_price)} ${t('ج', 'EGP')}</span>
                        </div>
                    `).join('')}
                    <div style="display:flex;justify-content:space-between;padding:3px 0;border-top:1px solid #eee;margin-top:4px;padding-top:4px;font-weight:600;">
                        <span>${t('إجمالي الطلبات', 'Orders Total')}</span>
                        <span>${moneyDec(totals.ordersTotal)} ${t('ج', 'EGP')}</span>
                    </div>
                </div>
            `;
        }
        
        const receiptContent = `
            <div style="font-family: 'Cairo', Arial, sans-serif; padding: 20px; max-width: 300px; margin: 0 auto; direction: rtl; text-align: center; background: #fff; color: #000;">
                <div style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">${escapeHtml(business.name)}</div>
                <div style="font-size: 12px; color: #666; margin-bottom: 12px;">${escapeHtml(business.code)}</div>
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 10px 0;">
                <div style="font-size: 13px; margin-bottom: 8px;">
                    <div style="display:flex;justify-content:space-between;padding:3px 0;">
                        <span>${t('الجهاز', 'Device')}</span>
                        <span>${escapeHtml(stationName)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:3px 0;">
                        <span>${t('الوقت', 'Time')}</span>
                        <span>${new Date(session.started_at).toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US')}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:3px 0;">
                        <span>${t('المدة', 'Duration')}</span>
                        <span>${formatElapsed(new Date(session.started_at))}</span>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 10px 0;">
                <div style="font-size: 13px; margin-bottom: 8px;">
                    ${totals.singleTotal > 0 ? `
                    <div style="display:flex;justify-content:space-between;padding:2px 0;">
                        <span>${t('Single', 'Single')}</span>
                        <span>${moneyDec(totals.singleTotal)} ${t('ج', 'EGP')}</span>
                    </div>
                    ` : ''}
                    ${totals.multiTotal > 0 ? `
                    <div style="display:flex;justify-content:space-between;padding:2px 0;">
                        <span>${t('Multi', 'Multi')}</span>
                        <span>${moneyDec(totals.multiTotal)} ${t('ج', 'EGP')}</span>
                    </div>
                    ` : ''}
                </div>
                ${ordersReceiptHtml}
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 10px 0;">
                ${endSessionDiscount > 0 ? `
                <div style="font-size: 13px; margin-bottom: 4px;">
                    <div style="display:flex;justify-content:space-between;padding:2px 0;">
                        <span>${t('الإجمالي قبل الخصم', 'Total Before Discount')}</span>
                        <span>${moneyDec(totals.grandTotal)} ${t('ج', 'EGP')}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:2px 0;color:#c0392b;">
                        <span>${t('الخصم', 'Discount')}</span>
                        <span>- ${moneyDec(endSessionDiscount)} ${t('ج', 'EGP')}</span>
                    </div>
                </div>
                ` : ''}
                <div style="font-size: 18px; font-weight: 700; color: #000; margin: 8px 0;">
                    <div style="display:flex;justify-content:space-between;">
                        <span>${t('الإجمالي', 'Total')}</span>
                        <span>${moneyDec(Math.max(0, Math.round((totals.grandTotal - endSessionDiscount) * 100) / 100))} ${t('ج', 'EGP')}</span>
                    </div>
                </div>
                ${endSessionPrepaidAmount > 0 ? `
                <div style="font-size: 13px; margin-bottom: 4px;">
                    <div style="display:flex;justify-content:space-between;padding:2px 0;">
                        <span>${t('مدفوع مقدماً', 'Paid in Advance')}</span>
                        <span>- ${moneyDec(endSessionPrepaidAmount)} ${t('ج', 'EGP')}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:2px 0;font-weight:700;border-top:1px dashed #ccc;margin-top:2px;padding-top:4px;">
                        <span>${t('المتبقي المطلوب', 'Remaining Due')}</span>
                        <span>${moneyDec(Math.max(0, Math.round((totals.grandTotal - endSessionDiscount - endSessionPrepaidAmount) * 100) / 100))} ${t('ج', 'EGP')}</span>
                    </div>
                </div>
                ` : ''}
                ${(() => {
                    const dueNow = Math.max(0, Math.round((totals.grandTotal - endSessionDiscount - endSessionPrepaidAmount) * 100) / 100);
                    const creditFromPrepaid = Math.round((totals.grandTotal - endSessionDiscount - endSessionPrepaidAmount) * 100) / 100 < 0
                        ? Math.abs(Math.round((totals.grandTotal - endSessionDiscount - endSessionPrepaidAmount) * 100) / 100)
                        : 0;
                    if (creditFromPrepaid > 0) {
                        return `
                <div style="font-size: 13px; margin-bottom: 8px;">
                    <div style="display:flex;justify-content:space-between;padding:2px 0;font-weight:700;color:#1a8a6b;">
                        <span>${t('باقي للعميل من المقدم', 'Remaining Credit for Customer')}</span>
                        <span>${moneyDec(creditFromPrepaid)} ${t('ج', 'EGP')}</span>
                    </div>
                </div>`;
                    }
                    if (endSessionAmountPaid !== null && endSessionAmountPaid !== undefined) {
                        const diff = Math.round((endSessionAmountPaid - dueNow) * 100) / 100;
                        return `
                <div style="font-size: 13px; margin-bottom: 8px;">
                    <div style="display:flex;justify-content:space-between;padding:2px 0;">
                        <span>${t('دفع العميل دلوقتي', 'Amount Paid Now')}</span>
                        <span>${moneyDec(endSessionAmountPaid)} ${t('ج', 'EGP')}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:2px 0;font-weight:700;">
                        <span>${diff >= 0 ? t('الباقي للعميل', 'Change Due') : t('باقي على العميل', 'Remaining Owed')}</span>
                        <span>${moneyDec(Math.abs(diff))} ${t('ج', 'EGP')}</span>
                    </div>
                </div>`;
                    }
                    return '';
                })()}
                <div style="font-size: 13px; margin: 8px 0;">
                    <div style="display:flex;justify-content:space-between;padding:2px 0;">
                        <span>${t('طريقة الدفع', 'Payment Method')}</span>
                        <span>${pm ? escapeHtml(pm.name) : t('غير محدد', 'Not set')}</span>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px dashed #ccc; margin: 10px 0;">
                <div style="font-size: 11px; color: #999; margin-top: 8px;">
                    ${t('شكراً لزيارتكم', 'Thank you for your visit')}
                </div>
                <div style="font-size: 10px; color: #aaa; margin-top: 4px;">
                    ${new Date().toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US')}
                </div>
            </div>
        `;
        
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) {
            showToast(t('الرجاء السماح للنوافذ المنبثقة', 'Please allow popups'), 'error');
            return;
        }
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${t('إيصال', 'Receipt')}</title>
                <meta charset="UTF-8">
                <style>
                    @page { margin: 10px; size: auto; }
                    body { font-family: 'Cairo', Arial, sans-serif; margin: 0; padding: 0; background: #fff; }
                    @media print {
                        body { background: #fff; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                ${receiptContent}
                <div style="text-align:center;margin-top:12px;" class="no-print">
                    <button onclick="window.print()" style="padding:10px 30px;background:#ff8a1e;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;">
                        🖨️ ${t('طباعة', 'Print')}
                    </button>
                    <button onclick="window.close()" style="padding:10px 30px;background:#666;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin-right:8px;">
                        ✕ ${t('إغلاق', 'Close')}
                    </button>
                </div>
                <script>
                    setTimeout(() => { window.print(); }, 500);
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    });
}

// ============================================================
// EXPENSES
// ============================================================
function openExpenseSheet() { document.getElementById('expenseDesc').value = ''; document.getElementById('expenseAmount').value = ''; document.getElementById('expenseError').textContent = ''; openSheet('expenseOverlay'); }
async function submitExpense() {
    const description = document.getElementById('expenseDesc').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const errEl = document.getElementById('expenseError');
    errEl.textContent = '';
    if (!description || !Number.isFinite(amount) || amount <= 0) { errEl.textContent = t('اكتب وصف ومبلغ صحيح.', 'Enter a valid description and amount.'); return; }
    if (!currentShift?.id) { errEl.textContent = t('مفيش شيفت مفتوح.', 'No open shift.'); return; }
    try {
        const { error } = await supabaseClient.from('expenses').insert({ business_id: business.id, shift_id: currentShift.id, description, amount });
        if (error) throw error;
        closeSheet('expenseOverlay');
        showToast(t('تم تسجيل المصروف', 'Expense recorded'), 'success');
        renderDashboard();
        if (document.getElementById('view-shift').classList.contains('active')) renderShiftView();
    } catch (e) {
        console.error('Error saving expense:', e);
        errEl.textContent = t('فشل تسجيل المصروف.', 'Failed to save expense.');
    }
}

// ============================================================
// SHIFT
// ============================================================
async function getShiftTotals(shift) {
    try {
        const { data: sessRows } = await supabaseClient
            .from('sessions')
            .select('id, amount, payment_method')
            .eq('business_id', business.id)
            .eq('status', 'completed')
            .gte('ended_at', shift.opened_at)
            .lte('ended_at', shift.closed_at || new Date().toISOString());
        
        const revenue = (sessRows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);

        const sessionIds = (sessRows || []).map(r => r.id);
        let itemsRevenue = 0;
        const itemBreakdown = {};
        if (sessionIds.length > 0) {
            const { data: orderRows } = await supabaseClient
                .from('session_orders')
                .select('item_name, quantity, unit_price, session_id')
                .in('session_id', sessionIds);
            (orderRows || []).forEach(o => {
                const lineTotal = Number(o.quantity || 0) * Number(o.unit_price || 0);
                itemsRevenue += lineTotal;
                itemBreakdown[o.item_name] = (itemBreakdown[o.item_name] || 0) + lineTotal;
            });
        }
        const hoursRevenue = Math.max(0, revenue - itemsRevenue);
        
        const { data: expRows } = await supabaseClient
            .from('expenses')
            .select('description, amount')
            .eq('shift_id', shift.id);
        
        const expenses = (expRows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        
        return { 
            revenue, 
            expenses, 
            profit: revenue - expenses, 
            expenseRows: expRows || [], 
            sessions: sessRows || [],
            hoursRevenue,
            itemsRevenue,
            itemBreakdown
        };
    } catch (e) {
        console.error('Error getting shift totals:', e);
        return { revenue: 0, expenses: 0, profit: 0, expenseRows: [], sessions: [], hoursRevenue: 0, itemsRevenue: 0, itemBreakdown: {} };
    }
}

async function renderShiftView() {
    if (!currentShift) {
        document.getElementById('shiftSummary').innerHTML = `
            <div class="empty" style="padding:20px;">
                <i class="fa-solid fa-clock" style="font-size:32px;"></i>
                <div style="font-size:16px;font-weight:700;margin:10px 0;">${t('لا يوجد شيفت مفتوح', 'No open shift')}</div>
                <button class="btn btn-amber btn-block" onclick="openNewShift()"><i class="fa-solid fa-plus"></i> ${t('فتح شيفت جديد', 'Open New Shift')}</button>
            </div>
        `;
        return;
    }
    
    const totals = await getShiftTotals(currentShift);
    document.getElementById('shiftSummary').innerHTML = `
        <div class="list-row"><div class="row-title">${t('وقت الفتح', 'Opened At')}</div><div class="row-value mono">${new Date(currentShift.opened_at).toLocaleTimeString(currentLang === 'ar' ? 'ar-EG' : 'en-US')}</div></div>
        <div class="list-row"><div class="row-title">${t('الإيراد', 'Revenue')}</div><div class="row-value mono">${money(totals.revenue)}</div></div>
        <div class="list-row"><div class="row-title">${t('المصروفات', 'Expenses')}</div><div class="row-value mono">${money(totals.expenses)}</div></div>
        <div class="list-row"><div class="row-title">${t('الصافي', 'Net Income')}</div><div class="row-value mono" style="color:var(--amber);">${money(totals.profit)}</div></div>`;

    const pmBreakdown = {};
    totals.sessions.forEach(s => {
        if (s.payment_method) {
            const pm = paymentMethods.find(p => p.id === s.payment_method);
            const key = pm ? pm.name : s.payment_method;
            pmBreakdown[key] = (pmBreakdown[key] || 0) + Number(s.amount || 0);
        }
    });
    if (Object.keys(pmBreakdown).length > 0) {
        let pmHtml = `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">`;
        pmHtml += `<div style="font-size:12px;color:var(--text-dim);font-weight:600;margin-bottom:6px;">${t('توزيع الإيراد حسب طريقة الدفع', 'Revenue by Payment Method')}</div>`;
        Object.entries(pmBreakdown).forEach(([name, amount]) => {
            pmHtml += `<div class="list-row" style="padding:6px 0;"><div class="row-title" style="font-size:13px;">${escapeHtml(name)}</div><div class="row-value mono" style="font-size:14px;">${money(amount)}</div></div>`;
        });
        pmHtml += `</div>`;
        document.getElementById('shiftSummary').innerHTML += pmHtml;
    }

    let query = supabaseClient
        .from('shifts')
        .select('*')
        .eq('business_id', business.id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false });
    
    const now = new Date();
    
    if (shiftFilter === 'weekly') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte('closed_at', weekAgo.toISOString());
    } else if (shiftFilter === 'monthly') {
        const monthSelect = document.getElementById('monthSelect');
        const yearSelect = document.getElementById('yearSelect');
        const selectedMonth = parseInt(monthSelect ? monthSelect.value : now.getMonth());
        const selectedYear = parseInt(yearSelect ? yearSelect.value : now.getFullYear());
        
        const startDate = new Date(selectedYear, selectedMonth, 1);
        const endDate = new Date(selectedYear, selectedMonth + 1, 1);
        
        query = query
            .gte('closed_at', startDate.toISOString())
            .lt('closed_at', endDate.toISOString());
    }
    
    const { data: pastShifts } = await query.limit(50);
    
    const histEl = document.getElementById('shiftHistory');
    
    if (!pastShifts || pastShifts.length === 0) {
        let filterLabel = '';
        if (shiftFilter === 'all') {
            filterLabel = t('كل الشيفتات', 'All shifts');
        } else if (shiftFilter === 'weekly') {
            filterLabel = t('الآسبوع الماضي', 'Last week');
        } else if (shiftFilter === 'monthly') {
            const monthSelect = document.getElementById('monthSelect');
            const yearSelect = document.getElementById('yearSelect');
            const monthNames = currentLang === 'ar' 
                ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
                : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthName = monthNames[parseInt(monthSelect ? monthSelect.value : new Date().getMonth())];
            const year = yearSelect ? yearSelect.value : new Date().getFullYear();
            filterLabel = `${monthName} ${year}`;
        }
        histEl.innerHTML = `<div class="empty"><i class="fa-solid fa-clock-rotate-left"></i>${t('مفيش شيفتات مقفولة في ', 'No closed shifts in ')} ${filterLabel}</div>`;
        return;
    }

    let historyHtml = '';
    for (const shift of pastShifts) {
        const shiftTotals = await getShiftTotals(shift);
        const dateStr = new Date(shift.closed_at).toLocaleDateString(currentLang === 'ar' ? 'ar-EG' : 'en-US');
        const timeStr = new Date(shift.closed_at).toLocaleTimeString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });
        const revLabel = t('إيراد', 'Revenue');
        const expLabel = t('مصروفات', 'Expenses');
        const netLabel = t('صافي الدخل', 'Net Income');
        
        historyHtml += `
            <div class="list-row" style="flex-direction:column;align-items:stretch;padding:12px 4px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="viewShiftDetails('${shift.id}')">
                <div style="display:flex;justify-content:space-between;width:100%;margin-bottom:6px;">
                    <div class="row-title">${dateStr} - ${timeStr}</div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <div style="display:flex;gap:12px;font-size:12px;color:var(--text-dim);">
                            <span>${revLabel} <span class="mono" style="color:var(--text);">${money(shiftTotals.revenue)}</span></span>
                            <span>${expLabel} <span class="mono" style="color:var(--text);">${money(shiftTotals.expenses)}</span></span>
                        </div>
                        <button class="btn btn-danger-sm" onclick="event.stopPropagation(); deleteShift('${shift.id}')" title="${t('حذف الشيفت', 'Delete shift')}" style="padding:4px 8px;font-size:11px;">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>
                <div style="display:flex;justify-content:space-between;width:100%;">
                    <div style="font-size:12px;color:var(--text-faint);">${netLabel}</div>
                    <div class="mono" style="font-weight:700;color:var(--amber);">${money(shiftTotals.profit)} ${t('ج', 'EGP')}</div>
                </div>
            </div>
        `;
    }
    histEl.innerHTML = historyHtml;
}

async function openNewShift() {
    try {
        const { data: created } = await supabaseClient.from('shifts').insert({ 
            business_id: business.id,
            opened_at: new Date().toISOString(),
            status: 'open'
        }).select().single();
        currentShift = created;
        showToast(t('تم فتح شيفت جديد', 'New shift opened'), 'success');
        renderShiftView();
        renderDashboard();
    } catch (e) {
        console.error('Error opening new shift:', e);
        showToast(t('فشل فتح الشيفت', 'Failed to open shift'), 'error');
    }
}

async function deleteShift(shiftId) {
    if (!confirm(t('هل أنت متأكد من حذف هذا الشيفت؟ سيتم حذف كل الجلسات والمصروفات المرتبطة به فقط.', 'Are you sure you want to delete this shift? Only the sessions and expenses that belong to it will be deleted.'))) return;
    
    try {
        const { data: shift, error: shiftErr } = await supabaseClient.from('shifts').select('*').eq('id', shiftId).single();
        if (shiftErr || !shift) {
            showToast(t('تعذر إيجاد الشيفت', 'Could not find the shift'), 'error');
            console.error('Error loading shift to delete:', shiftErr);
            return;
        }
        const rangeEnd = shift.closed_at || new Date().toISOString();

        await supabaseClient.from('expenses').delete().eq('shift_id', shiftId);
        
        const { data: sessionsToDelete } = await supabaseClient
            .from('sessions')
            .select('id')
            .eq('business_id', business.id)
            .eq('status', 'completed')
            .gte('ended_at', shift.opened_at)
            .lte('ended_at', rangeEnd);
        
        if (sessionsToDelete && sessionsToDelete.length > 0) {
            const sessionIds = sessionsToDelete.map(s => s.id);
            await supabaseClient.from('session_orders').delete().in('session_id', sessionIds);
            await supabaseClient.from('sessions').delete().in('id', sessionIds);
        }
        
        await supabaseClient.from('shifts').delete().eq('id', shiftId);
        
        showToast(t('تم حذف الشيفت', 'Shift deleted'), 'success');
        renderShiftView();
        renderDashboard();
    } catch (e) {
        console.error('Error deleting shift:', e);
        showToast(t('فشل حذف الشيفت', 'Failed to delete shift'), 'error');
    }
}

function buildShiftBreakdownHtml(totals, extraRowsHtml) {
    const itemEntries = Object.entries(totals.itemBreakdown);
    const itemsHtml = itemEntries.length
        ? itemEntries.map(([name, amt]) =>
            `<div class="list-row"><div class="row-title">${escapeHtml(name)}</div><div class="row-value mono">${money(amt)}</div></div>`
          ).join('')
        : `<div class="empty" style="padding:10px 0;">${t('لا يوجد طلبات منيو في هذا الشيفت', 'No menu orders this shift')}</div>`;

    const expensesHtml = totals.expenseRows.length
        ? totals.expenseRows.map(e =>
            `<div class="list-row"><div class="row-title">${escapeHtml(e.description)}</div><div class="row-value mono">${money(e.amount)}</div></div>`
          ).join('')
        : `<div class="empty" style="padding:10px 0;">${t('لا يوجد مصروفات في هذا الشيفت', 'No expenses this shift')}</div>`;

    return `
        <div class="list-row"><div class="row-title">${t('إيراد الساعات', 'Hours Revenue')}</div><div class="row-value mono">${money(totals.hoursRevenue)}</div></div>
        <div class="list-row"><div class="row-title">${t('إيراد المنيو', 'Menu Revenue')}</div><div class="row-value mono">${money(totals.itemsRevenue)}</div></div>
        <div class="list-row"><div class="row-title">${t('إجمالي الإيراد', 'Total Revenue')}</div><div class="row-value mono">${money(totals.revenue)}</div></div>
        <div class="list-row"><div class="row-title">${t('المصروفات', 'Expenses')}</div><div class="row-value mono">${money(totals.expenses)}</div></div>
        <div class="list-row"><div class="row-title">${t('الصافي', 'Net Income')}</div><div class="row-value mono">${money(totals.profit)}</div></div>
        ${extraRowsHtml || ''}
        <div class="section-title" style="margin:14px 0 6px;">${t('إيراد المنيو حسب الصنف', 'Menu Revenue by Item')}</div>
        ${itemsHtml}
        <div class="section-title" style="margin:14px 0 6px;">${t('المصروفات المسجلة في الشيفت', 'Expenses Recorded This Shift')}</div>
        ${expensesHtml}`;
}

async function openCloseShiftSheet() {
    if (!currentShift) {
        showToast(t('لا يوجد شيفت مفتوح', 'No open shift'), 'warning');
        return;
    }
    const totals = await getShiftTotals(currentShift);
    const extraRow = `<div class="list-row"><div class="row-title">${t('أجهزة لسه شغالة', 'Active Devices')}</div><div class="row-value mono">${Object.keys(sessions).length}</div></div>`;
    document.getElementById('closeShiftSummary').innerHTML = buildShiftBreakdownHtml(totals, extraRow);
    openSheet('closeShiftOverlay');
}

async function viewShiftDetails(shiftId) {
    const { data: shift, error } = await supabaseClient.from('shifts').select('*').eq('id', shiftId).single();
    if (error || !shift) {
        showToast(t('تعذر تحميل تفاصيل الشيفت', 'Could not load shift details'), 'error');
        console.error('Error loading shift details:', error);
        return;
    }
    const totals = await getShiftTotals(shift);
    const openedStr = new Date(shift.opened_at).toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US');
    const closedStr = shift.closed_at ? new Date(shift.closed_at).toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US') : '—';
    const extraRows = `
        <div class="list-row"><div class="row-title">${t('وقت الفتح', 'Opened At')}</div><div class="row-value mono">${openedStr}</div></div>
        <div class="list-row"><div class="row-title">${t('وقت الإقفال', 'Closed At')}</div><div class="row-value mono">${closedStr}</div></div>`;
    document.getElementById('shiftDetailsSummary').innerHTML = buildShiftBreakdownHtml(totals, extraRows);
    openSheet('shiftDetailsOverlay');
}

async function confirmCloseShift() {
    if (!currentShift) return;
    const totals = await getShiftTotals(currentShift);
    const closedAt = new Date().toISOString();
    
    const { data, error } = await supabaseClient
        .from('shifts')
        .update({ 
            status: 'closed', 
            closed_at: closedAt, 
            total_revenue: totals.revenue, 
            total_expenses: totals.expenses, 
            total_profit: totals.profit, 
            closed_by: currentUser.name || currentUser.type 
        })
        .eq('id', currentShift.id)
        .select();
    
    if (error) {
        showToast(t('فشل إقفال الشيفت: ' + error.message, 'Failed to close shift: ' + error.message), 'error');
        console.error('Error closing shift:', error);
        return;
    }
    if (!data || data.length === 0) {
        console.error('Shift update affected 0 rows — check RLS UPDATE policy on "shifts" table.');
        showToast(t('فشل إقفال الشيفت: قاعدة البيانات رفضت الحفظ (تحقق من صلاحيات RLS على جدول shifts)', 'Failed to close shift: database rejected the save (check RLS permissions on the shifts table)'), 'error');
        return;
    }
    
    closeSheet('closeShiftOverlay');
    showToast(t('تم إقفال الشيفت', 'Shift closed'), 'success');
    await loadOrOpenShift();
    renderShiftView(); 
    renderDashboard();
}

// ============================================================
// SETTINGS
// ============================================================
function renderSettings() {
    const expiry = deviceRecord.expiry_date ? new Date(deviceRecord.expiry_date) : null;
    document.getElementById('settingsSubscription').innerHTML = `
        <div class="list-row"><div class="row-title">${t('حالة الجهاز', 'Device Status')}</div><div class="badge ${deviceRecord.revoked ? 'badge-red' : 'badge-teal'}">${deviceRecord.revoked ? t('موقوف', 'Suspended') : t('نشط', 'Active')}</div></div>
        <div class="list-row"><div class="row-title">${t('تاريخ الانتهاء', 'Expiry Date')}</div><div class="row-value mono">${expiry ? expiry.toLocaleDateString(currentLang === 'ar' ? 'ar-EG' : 'en-US') : '—'}</div></div>`;

    const pinToggleHtml = `
        <div class="list-row" style="cursor:pointer;" onclick="toggleSettingsPin()">
            <div class="row-title">${t('تغيير PIN المالك', 'Change Owner PIN')}</div>
            <i id="settingsPinChevron" class="fa-solid fa-chevron-down" style="transition:transform .2s;color:var(--text-dim);"></i>
        </div>
        <div id="settingsChangePin" style="display:${settingsPinExpanded ? 'block' : 'none'};padding:10px 4px 4px;">
            <div style="margin-bottom:10px;">
                <label style="display:block;font-size:12px;color:var(--text-dim);margin-bottom:4px;">${t('الـ PIN الحالي', 'Current PIN')}</label>
                <input type="password" id="currentPinInput" class="mono" inputmode="numeric" maxlength="6" placeholder="••••" style="width:100%;">
            </div>
            <div style="margin-bottom:10px;">
                <label style="display:block;font-size:12px;color:var(--text-dim);margin-bottom:4px;">${t('الـ PIN الجديد (4-6 أرقام)', 'New PIN (4-6 digits)')}</label>
                <input type="password" id="newPinInput" class="mono" inputmode="numeric" maxlength="6" placeholder="••••" style="width:100%;">
            </div>
            <div id="changePinError" style="color:#ff6b6b;font-size:12px;margin-bottom:10px;"></div>
            <button class="btn btn-teal btn-block" onclick="changeOwnerPin()">${t('حفظ الـ PIN الجديد', 'Save New PIN')}</button>
        </div>`;
    let pinToggleWrap = document.getElementById('settingsPinToggleWrap');
    if (!pinToggleWrap) {
        document.getElementById('settingsSubscription').insertAdjacentHTML('afterend', `<div id="settingsPinToggleWrap"></div>`);
        pinToggleWrap = document.getElementById('settingsPinToggleWrap');
    }
    pinToggleWrap.innerHTML = pinToggleHtml;

    const groupedMenu = {};
    menuItems.forEach(item => {
        const category = normalizeMenuCategory(item.category);
        if (!groupedMenu[category]) groupedMenu[category] = [];
        groupedMenu[category].push(item);
    });
    
    let menuHtml = '';
    if (menuItems.length === 0) {
        menuHtml = `<div class="empty"><i class="fa-solid fa-utensils"></i>${t('لسه مفيش أصناف', 'No items yet')}</div>`;
    } else {
        for (const [category, items] of Object.entries(groupedMenu)) {
            menuHtml += `<div class="menu-category-group">`;
            menuHtml += `<div class="menu-category-title" style="color:var(--teal);">${escapeHtml(menuCategoryLabel(category))}</div>`;
            items.forEach(m => {
                menuHtml += `<div class="list-row">
                    <div><div class="row-title">${escapeHtml(m.name)}</div><div class="row-sub">${escapeHtml(menuCategoryLabel(m.category))}</div></div>
                    <div class="row-actions">
                        <div class="row-value mono" style="margin-left:12px;">${money(m.price)}</div>
                        <button class="btn btn-ghost btn-sm" onclick="editMenuItem('${m.id}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-danger-sm" onclick="deleteMenuItemById('${m.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
            });
            menuHtml += `</div>`;
        }
    }
    document.getElementById('settingsMenu').innerHTML = menuHtml;

    document.getElementById('settingsEmployees').innerHTML = employees.length === 0
        ? `<div class="empty"><i class="fa-solid fa-user-group"></i>${t('لسه مفيش موظفين', 'No employees yet')}</div>`
        : employees.map(e => `
            <div class="list-row">
                <div class="row-title">${escapeHtml(e.name)}</div>
                <div class="row-actions">
                    <div class="badge ${e.active ? 'badge-teal' : 'badge-red'}">${e.active ? t('نشط', 'Active') : t('موقوف', 'Inactive')}</div>
                    <button class="btn btn-danger-sm" onclick="deleteEmployee('${e.id}')" title="${t('حذف الموظف', 'Delete employee')}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`).join('');
    
    const pinSection = document.getElementById('settingsChangePin');
    const chevron = document.getElementById('settingsPinChevron');
    if (pinSection && chevron) {
        pinSection.style.display = settingsPinExpanded ? 'block' : 'none';
        chevron.style.transform = settingsPinExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

// ============================================================
// CHANGE OWNER PIN
// ============================================================
async function changeOwnerPin() {
    const currentPin = document.getElementById('currentPinInput').value.trim();
    const newPin = document.getElementById('newPinInput').value.trim();
    const errEl = document.getElementById('changePinError');
    errEl.textContent = '';

    if (!business) { 
        errEl.textContent = t('❌ النشاط غير موجود.', '❌ Business not found.'); 
        return; 
    }
    
    if (currentPin !== business.owner_pin) { 
        errEl.textContent = t('❌ PIN الحالي غير صحيح.', '❌ Current PIN is incorrect.'); 
        return; 
    }
    
    if (!/^\d{4,6}$/.test(newPin)) { 
        errEl.textContent = t('❌ PIN الجديد لازم يكون 4-6 أرقام.', '❌ New PIN must be 4-6 digits.'); 
        return; 
    }

    try {
        const { error } = await supabaseClient
            .from('businesses')
            .update({ owner_pin: newPin })
            .eq('id', business.id);
        
        if (error) throw error;

        business.owner_pin = newPin;
        document.getElementById('currentPinInput').value = '';
        document.getElementById('newPinInput').value = '';
        
        showToast(t('✅ تم تغيير PIN المالك بنجاح.', '✅ Owner PIN changed successfully.'), 'success');
    } catch (e) {
        console.error('❌ Error changing PIN:', e);
        errEl.textContent = t('❌ فشل تغيير PIN: ' + e.message, '❌ Failed to change PIN: ' + e.message);
    }
}

// ============================================================
// CREATE BUSINESS FROM SETUP
// ============================================================
function openCreateBusinessSheetFromSetup() {
    ['newBizCodeSetup', 'newBizNameSetup', 'newBizPhoneSetup'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('newBizStationsSetup').value = 4;
    document.getElementById('createBizErrorSetup').textContent = '';
    openSheet('createBusinessSheetFromSetup');
}

async function submitCreateBusinessFromSetup() {
    const code = document.getElementById('newBizCodeSetup').value.trim().toUpperCase();
    const name = document.getElementById('newBizNameSetup').value.trim();
    const phone = document.getElementById('newBizPhoneSetup').value.trim();
    const total_stations = parseInt(document.getElementById('newBizStationsSetup').value) || 4;
    const owner_pin = '0000';
    const err = document.getElementById('createBizErrorSetup');

    if (!code || !name) { 
        err.textContent = t('❌ اكتب الكود والاسم.', '❌ Enter code and name.'); 
        return; 
    }

    try {
        const { error } = await supabaseClient.from('businesses').insert({ 
            code, 
            name, 
            phone: phone || null, 
            owner_pin, 
            total_stations 
        });
        
        if (error) {
            if (error.code === '23505') {
                err.textContent = t('❌ الكود ده مستخدم قبل كده.', '❌ Code already used.');
            } else {
                err.textContent = t('❌ فشل الإنشاء، حاول تاني.', '❌ Creation failed, try again.');
            }
            console.error('❌ Create business error:', error);
            return;
        }
        
        closeSheet('createBusinessSheetFromSetup');
        showToast(t('✅ تم إنشاء النشاط! استخدم الكود لتسجيل الدخول.', '✅ Business created! Use the code to login.'), 'success');
        document.getElementById('setupBusinessCode').value = code;
        handleSetupContinue();
    } catch (e) {
        console.error('❌ Error creating business:', e);
        err.textContent = t('❌ حصل خطأ، حاول تاني.', '❌ Error, try again.');
    }
}

// ============================================================
// MENU ITEMS CRUD
// ============================================================
function openMenuItemSheet() {
    document.getElementById('menuItemId').value = '';
    document.getElementById('menuItemName').value = '';
    document.getElementById('menuItemPrice').value = '';
    document.getElementById('menuItemDesc').value = '';
    document.getElementById('menuItemImageInput').value = '';
    document.getElementById('menuItemImagePreview').style.display = 'none';
    document.getElementById('menuItemImageData').value = '';
    document.getElementById('menuItemCategory').value = 'cold_drinks';
    document.getElementById('menuItemActive').checked = true;
    document.getElementById('menuDeleteBtn').style.display = 'none';
    document.getElementById('menuItemError').textContent = '';
    document.getElementById('menuItemSheetTitle').textContent = t('إضافة صنف للقائمة', 'Add Menu Item');
    openSheet('menuItemOverlay');
}

function editMenuItem(itemId) {
    const item = menuItems.find(m => m.id === itemId);
    if (!item) return;
    document.getElementById('menuItemId').value = item.id;
    document.getElementById('menuItemName').value = item.name;
    document.getElementById('menuItemPrice').value = item.price;
    document.getElementById('menuItemDesc').value = item.description || '';
    document.getElementById('menuItemImageData').value = item.image_url || '';
    if (item.image_url) {
        document.getElementById('menuItemImagePreviewImg').src = item.image_url;
        document.getElementById('menuItemImagePreview').style.display = 'block';
    } else {
        document.getElementById('menuItemImagePreview').style.display = 'none';
    }
    document.getElementById('menuItemCategory').value = normalizeMenuCategory(item.category);
    document.getElementById('menuItemActive').checked = item.active !== false;
    document.getElementById('menuDeleteBtn').style.display = 'flex';
    document.getElementById('menuItemError').textContent = '';
    document.getElementById('menuItemSheetTitle').textContent = t('تعديل صنف', 'Edit Item');
    openSheet('menuItemOverlay');
}

async function submitMenuItem() {
    const id = document.getElementById('menuItemId').value;
    const name = document.getElementById('menuItemName').value.trim();
    const price = parseFloat(document.getElementById('menuItemPrice').value);
    const description = document.getElementById('menuItemDesc').value.trim();
    const image_data = document.getElementById('menuItemImageData').value || null;
    const category = normalizeMenuCategory(document.getElementById('menuItemCategory').value);
    const active = document.getElementById('menuItemActive').checked;
    const errEl = document.getElementById('menuItemError');
    errEl.textContent = '';
    
    if (!name || isNaN(price) || price < 0) { 
        errEl.textContent = t('اكمل البيانات.', 'Complete the data.'); 
        return; 
    }
    
    try {
        const newItem = {
            business_id: business.id,
            name: name,
            price: price,
            description: description,
            image_url: image_data,
            category: category,
            active: active,
            created_at: new Date().toISOString()
        };
        
        let result;
        if (id) {
            result = await updateMenuItemInDB(id, { name, price, description, image_url: image_data, category, active });
            if (result) {
                const idx = menuItems.findIndex(item => item.id === id);
                if (idx !== -1) {
                    menuItems[idx] = { ...menuItems[idx], name, price, description, image_url: image_data, category, active };
                }
                showToast(t('تم تحديث الصنف', 'Item updated'), 'success');
            } else {
                throw new Error('Update failed');
            }
        } else {
            result = await saveMenuItemToDB(newItem);
            if (result) {
                menuItems.push(result);
                showToast(t('تمت الإضافة', 'Item added'), 'success');
            } else {
                throw new Error('Insert failed');
            }
        }
        
        closeSheet('menuItemOverlay');
        renderSettings();
        renderMenuQuickAdd();
        renderStationOrdersSection();
        // تحديث صفحة العميل (إن كانت مفتوحة)
        if (document.getElementById('customerPage').classList.contains('active')) {
            loadCustomerData();
        }
    } catch (e) {
        console.error('Error in submitMenuItem:', e);
        let errorMsg = e.message || 'Unknown error';
        if (errorMsg.includes('check constraint') || errorMsg.includes('menu_items_category_check')) {
            errorMsg = 'مشكلة في قاعدة البيانات: عمود التصنيف لا يقبل هذه القيمة. شغّل ملف SQL الخاص بـ V2 على Supabase ثم جرّب مرة أخرى.';
        }
        errEl.textContent = t('حصل خطأ: ' + errorMsg, 'Error: ' + errorMsg);
        showToast(t('فشل حفظ الصنف: ' + errorMsg, 'Failed to save item: ' + errorMsg), 'error');
    }
}

async function deleteMenuItemById(itemId) {
    if (!confirm(t('هل أنت متأكد من حذف هذا الصنف؟', 'Are you sure you want to delete this item?'))) return;
    try {
        const success = await deleteMenuItemFromDB(itemId);
        if (success) {
            menuItems = menuItems.filter(item => item.id !== itemId);
            showToast(t('تم حذف الصنف', 'Item deleted'), 'success');
            renderSettings();
            renderMenuQuickAdd();
            renderStationOrdersSection();
            if (document.getElementById('customerPage').classList.contains('active')) {
                loadCustomerData();
            }
        } else {
            throw new Error('Delete failed');
        }
    } catch (e) {
        showToast(t('فشل حذف الصنف', 'Failed to delete item'), 'error');
        console.error(e);
    }
}

async function deleteMenuItem() {
    const id = document.getElementById('menuItemId').value;
    if (!id) return;
    closeSheet('menuItemOverlay');
    await deleteMenuItemById(id);
}

// ============================================================
// EMPLOYEE CRUD
// ============================================================
function openEmployeeSheet() {
    document.getElementById('employeeName').value = '';
    document.getElementById('employeePin').value = '';
    document.getElementById('employeeError').textContent = '';
    document.getElementById('permStations').checked = true;
    document.getElementById('permShift').checked = false;
    document.getElementById('permSettings').checked = false;
    document.getElementById('permCancelSession').checked = false;
    document.getElementById('permTransferSession').checked = true;
    document.getElementById('permExpenses').checked = false;
    document.getElementById('permReports').checked = false;
    document.getElementById('permDeleteShift').checked = false;
    document.getElementById('permMenu').checked = false;
    document.getElementById('permEmployees').checked = false;
    document.getElementById('permPrices').checked = false;
    document.getElementById('employeeDeleteBtn').style.display = 'none';
    document.getElementById('employeeSheetTitle').textContent = t('إضافة موظف', 'Add Employee');
    openSheet('employeeOverlay');
}

function editEmployee(employeeId) {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return;
    const perms = emp.permissions || {};
    document.getElementById('employeeName').value = emp.name || '';
    document.getElementById('employeePin').value = emp.pin || '';
    document.getElementById('employeeError').textContent = '';
    document.getElementById('permStations').checked = !!perms.stations;
    document.getElementById('permShift').checked = !!perms.shift;
    document.getElementById('permSettings').checked = !!perms.settings;
    document.getElementById('permCancelSession').checked = !!perms.cancel_session;
    document.getElementById('permTransferSession').checked = !!perms.transfer_session;
    document.getElementById('permExpenses').checked = !!perms.expenses;
    document.getElementById('permReports').checked = !!perms.reports;
    document.getElementById('permDeleteShift').checked = !!perms.delete_shift;
    document.getElementById('permMenu').checked = !!perms.menu;
    document.getElementById('permEmployees').checked = !!perms.employees;
    document.getElementById('permPrices').checked = !!perms.prices;
    document.getElementById('employeeDeleteBtn').style.display = 'flex';
    document.getElementById('employeeSheetTitle').textContent = t('تعديل موظف', 'Edit Employee');
    openSheet('employeeOverlay');
}

async function submitEmployee() {
    const id = document.getElementById('employeeId').value;
    const name = document.getElementById('employeeName').value.trim();
    const pin = document.getElementById('employeePin').value.trim();
    if (!name || !/^\d{4,6}$/.test(pin)) { document.getElementById('employeeError').textContent = t('اكتب اسم و PIN من 4 لـ 6 أرقام.', 'Enter name and 4-6 digit PIN.'); return; }
    const permissions = {
        stations: document.getElementById('permStations').checked,
        shift: document.getElementById('permShift').checked,
        settings: document.getElementById('permSettings').checked,
        cancel_session: document.getElementById('permCancelSession').checked,
        transfer_session: document.getElementById('permTransferSession').checked,
        expenses: document.getElementById('permExpenses').checked,
        reports: document.getElementById('permReports').checked,
        delete_shift: document.getElementById('permDeleteShift').checked,
        menu: document.getElementById('permMenu').checked,
        employees: document.getElementById('permEmployees').checked,
        prices: document.getElementById('permPrices').checked
    };

    try {
        if (id) {
            const { data, error } = await supabaseClient.from('employees').update({ name, pin, permissions }).eq('id', id).eq('business_id', business.id).select();
            if (error || !data || data.length === 0) {
                document.getElementById('employeeError').textContent = t('فشل تحديث الموظف، حاول تاني.', 'Failed to update employee, try again.');
                console.error('Error updating employee:', error);
                return;
            }
            closeSheet('employeeOverlay'); showToast(t('تم تحديث الموظف', 'Employee updated'), 'success');
        } else {
            const { data, error } = await supabaseClient.from('employees').insert({ business_id: business.id, name, pin, permissions }).select();
            if (error || !data || data.length === 0) {
                document.getElementById('employeeError').textContent = t('فشل حفظ الموظف، حاول تاني.', 'Failed to save employee, try again.');
                console.error('Error adding employee:', error);
                return;
            }
            closeSheet('employeeOverlay'); showToast(t('تمت إضافة الموظف', 'Employee added'), 'success');
        }
        await loadEmployees(); renderSettings();
    } catch (e) {
        document.getElementById('employeeError').textContent = t('فشل حفظ الموظف، حاول تاني.', 'Failed to save employee, try again.');
        console.error('Error in submitEmployee:', e);
    }
}

async function deleteEmployeeFromSheet() {
    const id = document.getElementById('employeeId').value;
    if (!id) return;
    closeSheet('employeeOverlay');
    await deleteEmployee(id);
}

async function deleteEmployee(employeeId) {
    if (!confirm(t('هل أنت متأكد من حذف هذا الموظف؟', 'Are you sure you want to delete this employee?'))) return;
    try {
        const { error } = await supabaseClient.from('employees').delete().eq('id', employeeId).eq('business_id', business.id);
        if (error) throw error;
        showToast(t('تم حذف الموظف', 'Employee deleted'), 'success');
        await loadEmployees();
        renderSettings();
    } catch (e) {
        console.error('Error deleting employee:', e);
        showToast(t('فشل حذف الموظف', 'Failed to delete employee'), 'error');
    }
}

// ============================================================
// HELPERS
// ============================================================
function normalizeMenuCategory(category) {
    const value = String(category || '').trim().toLowerCase();
    const map = {
        'مشروبات باردة': 'cold_drinks',
        'cold drinks': 'cold_drinks',
        'cold_drinks': 'cold_drinks',
        'مشروبات ساخنة': 'hot_drinks',
        'hot drinks': 'hot_drinks',
        'hot_drinks': 'hot_drinks',
        'أكل': 'food',
        'اكل': 'food',
        'food': 'food',
        'أخرى': 'other',
        'اخري': 'other',
        'other': 'other'
    };
    return map[value] || 'other';
}

function menuCategoryLabel(category) {
    const key = normalizeMenuCategory(category);
    const labels = {
        cold_drinks: t('🧊 مشروبات باردة', '🧊 Cold Drinks'),
        hot_drinks: t('☕ مشروبات ساخنة', '☕ Hot Drinks'),
        food: t('🍔 أكل', '🍔 Food'),
        other: t('📦 أخرى', '📦 Other')
    };
    return labels[key];
}

function renderMenuQuickAdd() {
    const container = document.getElementById('menuQuickAdd');
    if (!container) return;
    
    if (menuItems.length === 0) {
        container.innerHTML = `<span style="color:var(--text-faint);font-size:13px;">${t('مفيش أصناف — ضيفها من الإعدادات', 'No items — add them from settings')}</span>`;
        return;
    }
    
    const grouped = {};
    menuItems.forEach(item => {
        const category = normalizeMenuCategory(item.category);
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push(item);
    });
    
    let html = '';
    const categoryNames = Object.keys(grouped);
    
    for (let i = 0; i < categoryNames.length; i++) {
        const category = categoryNames[i];
        const items = grouped[category];
        const isOpen = (i === 0);
        if (categoryToggleState[category] === undefined) {
            categoryToggleState[category] = isOpen;
        }
        const open = categoryToggleState[category];
        
        html += `<div class="menu-category-group">`;
        html += `<div class="menu-category-toggle" onclick="toggleCategory('${escapeHtml(category)}')">`;
        html += `<span class="cat-title">${escapeHtml(menuCategoryLabel(category))}</span>`;
        html += `<i class="fa-solid fa-chevron-down cat-arrow ${open ? 'open' : ''}"></i>`;
        html += `</div>`;
        html += `<div class="menu-category-items ${open ? 'open' : ''}" data-category="${escapeHtml(category)}">`;
        items.forEach(item => {
            const sessionId =
                currentOrderSessionId ||
                (activeStationId && sessions[activeStationId] ? sessions[activeStationId].id : '') ||
                (activeSessionOrders.length > 0 ? activeSessionOrders[0].session_id : '');
            html += `<button class="btn btn-ghost btn-sm" onclick="addOrderItem('${sessionId}','${item.id}')">${escapeHtml(item.name)} - ${money(item.price)}</button>`;
        });
        html += `</div></div>`;
    }
    
    container.innerHTML = html;
}

function toggleCategory(category) {
    categoryToggleState[category] = !categoryToggleState[category];
    const isOpen = categoryToggleState[category];
    
    const container = document.getElementById('menuQuickAdd');
    if (!container) return;
    const toggles = container.querySelectorAll('.menu-category-toggle');
    toggles.forEach(toggle => {
        const titleEl = toggle.querySelector('.cat-title');
        if (titleEl && titleEl.textContent.trim() === menuCategoryLabel(category)) {
            const arrow = toggle.querySelector('.cat-arrow');
            if (arrow) {
                arrow.classList.toggle('open', isOpen);
            }
        }
    });
    
    const itemsContainer = container.querySelector(`.menu-category-items[data-category="${category}"]`);
    if (itemsContainer) {
        itemsContainer.classList.toggle('open', isOpen);
    }
}

function renderStationOrdersSection() {
    const el = document.getElementById('stationOrdersList');
    if (!el) return;
    el.innerHTML = activeSessionOrders.length === 0
        ? `<div class="empty"><i class="fa-solid fa-utensils"></i>${t('مفيش طلبات على الجلسة دي', 'No orders on this session')}</div>`
        : activeSessionOrders.map(o => `<div class="list-row">
            <div><div class="row-title">${escapeHtml(o.item_name)}</div><div class="row-sub">${o.quantity} × ${money(o.unit_price)}</div></div>
            <div style="display:flex;align-items:center;gap:10px;">
                <div class="row-value">${money(o.quantity * o.unit_price)}</div>
                <button class="btn btn-ghost btn-sm" style="padding:6px 10px;" onclick="removeOrderItem('${o.id}')" title="${t('حذف/إنقاص', 'Remove/Decrease')}"><i class="fa-solid fa-minus"></i></button>
            </div>
        </div>`).join('');
}

function selectStartMode(mode) {
    document.querySelectorAll('.mode-option').forEach(el => {
        el.classList.remove('selected-single', 'selected-multi');
        if (el.dataset.mode === mode) {
            el.classList.add(mode === 'single' ? 'selected-single' : 'selected-multi');
        }
    });
    document.getElementById('selectedStartMode').value = mode;
}

// ============================================================
// ADD PREPAID AMOUNT
// ============================================================
async function addPrepaidAmount(stationId) {
    const session = sessions[stationId];
    if (!session) return;

    const input = document.getElementById('addPrepaidInput');
    const addAmount = Math.max(0, parseFloat(input && input.value) || 0);
    if (addAmount <= 0) {
        showToast(t('اكتب مبلغ أكبر من صفر', 'Enter an amount greater than zero'), 'warning');
        return;
    }

    const currentPrepaid = Number(session.prepaid_amount) || 0;
    const newPrepaid = Math.round((currentPrepaid + addAmount) * 100) / 100;

    try {
        const { error } = await supabaseClient.from('sessions').update({ prepaid_amount: newPrepaid }).eq('id', session.id);

        if (error && /column .* does not exist/i.test(error.message || '')) {
            console.warn('prepaid_amount column missing — cannot save advance payment:', error.message);
            showToast(t('عمود المبلغ المقدم غير موجود في قاعدة البيانات، ضيفه الأول', 'Advance payment column missing in database — add it first'), 'error');
            return;
        }
        if (error) { throw error; }

        session.prepaid_amount = newPrepaid;
        if (input) input.value = '';
        showToast(t(`تمت إضافة ${moneyDec(addAmount)} ج مقدماً`, `Added ${moneyDec(addAmount)} EGP in advance`), 'success');

        await refreshStationSheetContent(stationId);
    } catch (e) {
        console.error('Error adding prepaid amount:', e);
        showToast(t('فشلت إضافة المبلغ المقدم', 'Failed to add advance payment'), 'error');
    }
}

// ============================================================
// SWITCH MODE
// ============================================================
async function handleSwitchMode(sessionId, newMode, stationId) {
    if (pendingSwitch) return;
    pendingSwitch = true;
    const errEl = document.getElementById('stationSheetError');
    errEl.textContent = '';
    const btn = document.getElementById('switchModeBtn');
    if (btn) btn.disabled = true;

    try {
        let activeSeg = await getActiveSegment(sessionId);

        if (activeSeg && activeSeg.timer_type === 'countdown') {
            const remaining = getRemainingSeconds(activeSeg);
            if (remaining <= 0) {
                showToast(t('لا يمكن التحويل لأن الوقت انتهى.', 'Cannot switch because time is up.'), 'error');
                pendingSwitch = false;
                if (btn) btn.disabled = false;
                return;
            }
        }

        if (!activeSeg) {
            const session = sessions[stationId];
            const st = stations.find(s => s.id === stationId);
            const recoveryMode = (session && session.current_mode) || 'single';
            const recoveryRate = (session && session.rate) || (recoveryMode === 'single' ? (st?.single_rate || 20) : (st?.multi_rate || 30));
            const recoveryTimerType = (session && session.timer_type) || 'countup';
            try {
                activeSeg = await createSegment(sessionId, recoveryMode, new Date().toISOString(), recoveryRate, recoveryTimerType, 0);
                showToast(t('تم تصحيح حالة الجلسة، جرب التحويل تاني لو محتاج', 'Session state fixed, try switching again if needed'), 'success');
                await refreshStationSheetContent(stationId);
            } catch (e) {
                showToast(t('مقدرش أصلح حالة الجلسة، جرب تاني', "Couldn't fix session state, try again"), 'error');
            }
            pendingSwitch = false;
            if (btn) btn.disabled = false;
            return;
        }

        const now = new Date().toISOString();
        const start = new Date(activeSeg.started_at);
        let usedSeconds = (new Date(now) - start) / 1000;
        let hours = usedSeconds / 3600;
        let amount = Math.round((hours * Number(activeSeg.rate)) * 100) / 100;

        if (activeSeg.timer_type === 'countdown' && activeSeg.duration_seconds) {
            usedSeconds = Math.min(usedSeconds, activeSeg.duration_seconds);
            hours = usedSeconds / 3600;
            amount = Math.round((hours * Number(activeSeg.rate)) * 100) / 100;
        }

        const st = stations.find(s => s.id === stationId);
        const newRate = newMode === 'single' ? (st.single_rate || 20) : (st.multi_rate || 30);
        const timerType = activeSeg.timer_type || 'countup';
        const durationSeconds = timerType === 'countdown'
            ? Math.max(0, Math.round((activeSeg.duration_seconds || 0) - usedSeconds))
            : Math.round(activeSeg.duration_seconds || 0);

        await closeSegment(activeSeg.id, now, amount);
        await createSegment(sessionId, newMode, now, newRate, timerType, durationSeconds);

        await supabaseClient.from('sessions')
            .update({ current_mode: newMode, rate: newRate })
            .eq('id', sessionId);

        if (sessions[stationId]) {
            sessions[stationId].current_mode = newMode;
            sessions[stationId].rate = newRate;
        }

        showToast(t('تم التحويل إلى ' + (newMode === 'single' ? 'Single' : 'Multi'), 'Switched to ' + (newMode === 'single' ? 'Single' : 'Multi')), 'success');
        
        await refreshStationSheetContent(stationId);
        
    } catch (e) {
        console.error('Error switching mode:', e);
        errEl.textContent = t('فشل التحويل، حاول تاني.', 'Switch failed, try again.');
        showToast(t('فشل التحويل: ' + e.message, 'Switch failed: ' + e.message), 'error');
    } finally {
        pendingSwitch = false;
        if (btn) btn.disabled = false;
    }
}

// ============================================================
// SESSION RECOVERY & REFRESH
// ============================================================
async function recoverActiveSession() {
    if (!business) return;
    const { data: activeSessions } = await supabaseClient
        .from('sessions')
        .select('*')
        .eq('business_id', business.id)
        .eq('status', 'active');

    if (activeSessions && activeSessions.length > 0) {
        activeSessions.forEach(s => { sessions[s.station_id] = s; });
        await preloadActiveSegments(activeSessions.map(s => s.id));
        const missing = activeSessions.filter(s => !getActiveSegmentFast(s.id));
        if (missing.length > 0) {
            await Promise.all(missing.map(s => {
                const st = stations.find(st => st.id === s.station_id);
                const mode = s.current_mode || 'single';
                const rate = mode === 'single' ? (st?.single_rate || 20) : (st?.multi_rate || 30);
                return createSegment(s.id, mode, s.started_at, rate, s.timer_type || 'countup', 0);
            }));
        }
        renderStationsGrid();
        renderDashboard();
    }
}

async function refreshStationSheetContent(stationId) {
    // هذه الدالة تُستخدم لتحديث محتوى ورق الجلسة بدون إعادة فتحها
    if (activeStationId === stationId) {
        await openStationSheet(stationId);
    }
}

// ============================================================
// CUSTOMER PAGE FUNCTIONS - شاشة العميل (مدمجة من نظام الكافيه)
// ============================================================

// متغيرات شاشة العميل
let customerCart = [];
let customerBusiness = null;
let customerMenuItems = [];
let customerCategories = [];
let currentCustomerFilter = 'all';
let customerBusinessId = null;
let customerStations = [];

// تهيئة صفحة العميل عند تحميل الصفحة مع ?customer=true
function initCustomerPage() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('customer') === 'true') {
        // إخفاء الشاشات الأخرى وإظهار صفحة العميل
        document.getElementById('setupScreen').classList.remove('active');
        document.getElementById('mainApp').classList.remove('active');
        document.getElementById('customerPage').classList.add('active');
        loadCustomerData();
    }
}

// تحميل بيانات العميل (النشاط، المنيو، الأجهزة)
async function loadCustomerData() {
    // لازم نقرأ رقم النشاط من رابط الـ QR نفسه أولاً، مش من أي بيانات قديمة متخزنة
    // على المتصفح (لو الجهاز اتستخدم قبل كده لفتح نشاط تاني، كانت هتفضل تجيب الغلط)
    const urlBizId = new URLSearchParams(window.location.search).get('biz');
    const bizId = urlBizId || localStorage.getItem('platepro_business_id');
    
    if (!bizId) {
        document.getElementById('customerBizName').textContent = '❌ رابط غير صحيح';
        document.getElementById('customerMenuItems').innerHTML = `
            <div class="empty" style="padding:40px 16px;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:40px;color:var(--danger);"></i>
                <div style="font-size:16px; font-weight:700; margin-top:8px;">رابط غير صحيح</div>
                <div style="font-size:13px; color:var(--text-muted);">تأكد من الرابط المستخدم</div>
            </div>
        `;
        return;
    }
    
    customerBusinessId = bizId;
    
    if (!supabaseClient) {
        document.getElementById('customerBizName').textContent = '⚠️ خطأ في الاتصال';
        document.getElementById('customerMenuItems').innerHTML = `
            <div class="empty" style="padding:40px 16px;">
                <i class="fa-solid fa-wifi" style="font-size:40px;color:var(--warning);"></i>
                <div style="font-size:16px; font-weight:700; margin-top:8px;">خطأ في الاتصال</div>
                <div style="font-size:13px; color:var(--text-muted);">تأكد من اتصال الإنترنت</div>
            </div>
        `;
        return;
    }
    
    try {
        const { data: biz, error: bizError } = await supabaseClient
            .from('businesses')
            .select('*')
            .eq('id', bizId)
            .maybeSingle();
        
        if (bizError || !biz) {
            document.getElementById('customerBizName').textContent = '❌ نشاط غير موجود';
            document.getElementById('customerMenuItems').innerHTML = `
                <div class="empty" style="padding:40px 16px;">
                    <i class="fa-solid fa-store-slash" style="font-size:40px;color:var(--danger);"></i>
                    <div style="font-size:16px; font-weight:700; margin-top:8px;">النشاط غير موجود</div>
                    <div style="font-size:13px; color:var(--text-muted);">تأكد من الكود المستخدم</div>
                </div>
            `;
            return;
        }
        
        customerBusiness = biz;
        localStorage.setItem('platepro_business_id', biz.id);
        document.getElementById('customerBizName').textContent = biz.name;
        document.title = biz.name + ' - Menu';
        
        // تحميل الشعار إن وجد
        const savedLogo = localStorage.getItem('platepro_logo');
        if (savedLogo) {
            const logoContainer = document.getElementById('customerLogoContainer');
            logoContainer.innerHTML = `<img src="${savedLogo}" class="logo-img" alt="Logo">`;
        }
        
        // تحميل الأجهزة (stations) الخاصة بهذا النشاط
        const { data: stationsData } = await supabaseClient
            .from('stations')
            .select('*')
            .eq('business_id', bizId)
            .order('number');
        customerStations = stationsData || [];
        
        // تحميل المنيو والتصنيفات
        const [itemsRes, catsRes] = await Promise.all([
            supabaseClient.from('menu_items')
                .select('*')
                .eq('business_id', bizId)
                .eq('active', true)
                .order('created_at'),
            supabaseClient.from('menu_categories')
                .select('*')
                .eq('business_id', bizId)
                .eq('active', true)
                .order('sort_order')
        ]);
        
        customerMenuItems = itemsRes.data || [];
        customerCategories = catsRes.data || [];
        
        // عرض الأجهزة في القائمة المنسدلة
        renderCustomerStations();
        
        // عرض التصنيفات والمنيو
        renderCustomerCategories();
        renderCustomerItems();
        
        console.log('✅ Customer data loaded successfully');
        
    } catch (e) {
        console.error('Error loading customer data:', e);
        document.getElementById('customerBizName').textContent = '⚠️ خطأ في التحميل';
        document.getElementById('customerMenuItems').innerHTML = `
            <div class="empty" style="padding:40px 16px;">
                <i class="fa-solid fa-circle-exclamation" style="font-size:40px;color:var(--danger);"></i>
                <div style="font-size:16px; font-weight:700; margin-top:8px;">⚠️ حدث خطأ</div>
                <div style="font-size:13px; color:var(--text-muted);">حاول تحديث الصفحة</div>
            </div>
        `;
    }
}

// عرض الأجهزة في قائمة الاختيار
function renderCustomerStations() {
    const select = document.getElementById('customerStationSelect');
    if (!select) return;
    
    // جلب الجهاز من الرابط إن وجد (لتحديده تلقائياً)
    const params = new URLSearchParams(window.location.search);
    const stationIdFromUrl = params.get('station');
    
    if (customerStations.length === 0) {
        select.innerHTML = `<option value="">⚠️ مفيش أجهزة متاحة حالياً</option>`;
        return;
    }
    
    // عرض الأجهزة المتاحة فقط (اللي مش شغالة) أو كلها حسب رغبتك
    // هنا نعرض كل الأجهزة عشان العميل يختار
    let options = `<option value="">-- اختر جهاز --</option>`;
    customerStations.forEach(st => {
        // التحقق من أن الجهاز متاح (ليس مشغولاً) - يمكنك تعديل الشرط حسب رغبتك
        const isAvailable = !sessions[st.id];
        const disabled = isAvailable ? '' : 'disabled style="opacity:0.5;"';
        const selected = (stationIdFromUrl && st.id === stationIdFromUrl) ? 'selected' : '';
        const label = st.name ? st.name : `جهاز ${st.number}`;
        const statusText = isAvailable ? '' : ' (مشغول)';
        options += `<option value="${st.id}" ${selected} ${disabled}>${label}${statusText}</option>`;
    });
    select.innerHTML = options;
}

// عرض تصنيفات المنيو
function renderCustomerCategories() {
    const container = document.getElementById('customerCategories');
    if (!container) return;
    
    let html = `<button class="btn active" onclick="filterCustomerItems('all')">🍽️ الكل</button>`;
    customerCategories.forEach(cat => {
        html += `<button class="btn" onclick="filterCustomerItems('${cat.id}')">
            <i class="fa-solid ${cat.icon || 'fa-utensils'}"></i> ${escapeHtml(cat.name)}
        </button>`;
    });
    container.innerHTML = html;
}

// تصفية الأصناف حسب التصنيف
function filterCustomerItems(categoryId) {
    currentCustomerFilter = categoryId;
    document.querySelectorAll('#customerCategories .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    // تحديد الزر النشط
    const btns = document.querySelectorAll('#customerCategories .btn');
    const idx = categoryId === 'all' ? 0 : customerCategories.findIndex(c => c.id === categoryId) + 1;
    if (btns[idx]) btns[idx].classList.add('active');
    renderCustomerItems(categoryId);
}

// عرض الأصناف حسب التصنيف
function renderCustomerItems(categoryId) {
    const container = document.getElementById('customerMenuItems');
    if (!container) return;
    
    let items = customerMenuItems;
    if (categoryId && categoryId !== 'all') {
        items = items.filter(item => item.category_id === categoryId);
    }
    
    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="empty" style="padding:40px 16px;">
                <i class="fa-solid fa-utensils" style="font-size:40px;"></i>
                <div style="font-size:16px; font-weight:700; margin-top:8px;">مفيش أصناف</div>
                <div style="font-size:13px; color:var(--text-muted);">جاري تحديث المنيو</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = items.map(item => {
        let imageHtml = '🍽️';
        if (item.image_url) {
            imageHtml = `<img src="${item.image_url}" alt="${escapeHtml(item.name)}" onerror="this.style.display='none';this.parentElement.innerHTML='🍽️'">`;
        }
        
        return `
            <div class="customer-menu-card">
                <div class="item-image">${imageHtml}</div>
                <div class="item-info">
                    <div class="item-name">${escapeHtml(item.name)}</div>
                    ${item.description ? `<div class="item-desc">${escapeHtml(item.description)}</div>` : ''}
                    <div class="item-price">${money(item.price)} ج.م</div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-amber btn-xs" onclick="addToCustomerCart('${item.id}')">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// 🛒 CUSTOMER CART (سلة العميل)
// ============================================================

function addToCustomerCart(itemId) {
    const item = customerMenuItems.find(i => i.id === itemId);
    if (!item) return;
    
    const existing = customerCart.find(i => i.id === itemId);
    if (existing) {
        existing.quantity += 1;
    } else {
        customerCart.push({ ...item, quantity: 1 });
    }
    
    updateCustomerCartUI();
    showCustomerToast('✅ تم إضافة ' + item.name);
}

function removeFromCustomerCart(index) {
    customerCart.splice(index, 1);
    updateCustomerCartUI();
    showCustomerCart(); // لتحديث الـ Sheet
}

function updateCustomerCartUI() {
    const cart = document.getElementById('customerCart');
    const count = customerCart.reduce((sum, i) => sum + i.quantity, 0);
    const total = customerCart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    
    document.getElementById('cartCount').textContent = count;
    document.getElementById('cartTotal').textContent = money(total);
    
    if (cart) cart.style.display = count > 0 ? 'block' : 'none';
}

function showCustomerCart() {
    const container = document.getElementById('customerCartItems');
    if (customerCart.length === 0) {
        container.innerHTML = `<div class="empty">السلة فارغة</div>`;
        document.getElementById('customerCartTotal').textContent = '0';
        openSheet('customerCartOverlay');
        return;
    }
    
    container.innerHTML = customerCart.map((item, index) => `
        <div class="order-item">
            <div>
                <div class="item-name">${escapeHtml(item.name)}</div>
                <div class="item-details">
                    ${item.quantity} × ${money(item.price)}
                    <button class="btn btn-xs" style="background:var(--danger);color:#fff;border:none;border-radius:4px;cursor:pointer;margin-right:8px;" onclick="removeFromCustomerCart(${index})">
                        <i class="fa-solid fa-minus"></i>
                    </button>
                </div>
            </div>
            <div class="item-price">${money(item.price * item.quantity)}</div>
        </div>
    `).join('');
    
    const subtotal = customerCart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    document.getElementById('cartSubtotal').textContent = money(subtotal);
    document.getElementById('customerCartTotal').textContent = money(subtotal);
    
    openSheet('customerCartOverlay');
}

function showCustomerToast(msg) {
    const el = document.getElementById('customerToast');
    el.textContent = msg;
    el.className = 'toast success';
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 2000);
}

// ============================================================
// 📤 إرسال طلب العميل
// ============================================================

async function submitCustomerOrder() {
    if (customerCart.length === 0) {
        document.getElementById('customerCartError').textContent = 'أضف صنف واحد على الأقل';
        return;
    }
    
    const stationSelect = document.getElementById('customerStationSelect');
    const stationId = stationSelect.value;
    
    if (!stationId) {
        document.getElementById('customerCartError').textContent = '⚠️ اختر رقم الجهاز أولاً';
        return;
    }
    
    if (!customerBusiness) {
        document.getElementById('customerCartError').textContent = '⚠️ بيانات النشاط غير متوفرة';
        return;
    }
    
    try {
        // جلب بيانات الجهاز للتأكد من أنه متاح
        const { data: stationData } = await supabaseClient
            .from('stations')
            .select('*')
            .eq('id', stationId)
            .single();
        
        if (!stationData) {
            document.getElementById('customerCartError').textContent = '⚠️ الجهاز غير موجود';
            return;
        }
        
        // التحقق من أن الجهاز متاح (ليس مشغولاً)
        if (sessions[stationId]) {
            document.getElementById('customerCartError').textContent = '⚠️ هذا الجهاز مشغول حالياً، اختر جهاز آخر';
            return;
        }
        
        const subtotal = customerCart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        
        // حفظ الطلب في جدول qr_orders
        const { data: order, error } = await supabaseClient.from('qr_orders').insert({
            business_id: customerBusiness.id,
            station_id: stationId,
            items: customerCart.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                qty: item.quantity
            })),
            note: '📱 طلب من العميل عبر QR',
            status: 'pending'
        }).select().single();
        
        if (error) throw error;
        
        // 🔔 تشغيل رنة الطلب الجديد
        const stationName = stationData.name || ('جهاز ' + stationData.number);
        showRingNotification(
            '🔔 طلب جديد من العميل!',
            `جهاز ${stationName} - ${customerCart.length} أصناف`,
            'warning'
        );
        
        // تفريغ السلة وإغلاق الشيت
        customerCart = [];
        updateCustomerCartUI();
        closeSheet('customerCartOverlay');
        
        showCustomerToast('✅ تم إرسال الطلب بنجاح!');
        document.getElementById('customerCartError').textContent = '';
        
        // تحديث واجهة العميل (إخفاء السلة)
        document.getElementById('customerCart').style.display = 'none';
        
        // إشعار في Console
        console.log('✅ Order created successfully!');
        
        // تحديث قائمة الطلبات في لوحة الأدمن
        await loadQrOrders();
        renderStationsGrid();
        updateHeaderBellBadge();
        
    } catch (e) {
        console.error('Error submitting order:', e);
        document.getElementById('customerCartError').textContent = '⚠️ فشل إرسال الطلب، حاول تاني';
    }
}

// ============================================================
// 📱 QR CODE GENERATION (لكل جهاز)
// ============================================================

// توليد رابط صفحة العميل لجهاز معين
function getOrderPageUrl(station) {
    const baseUrl = window.location.origin + window.location.pathname;
    const bizId = business ? business.id : localStorage.getItem('platepro_business_id');
    return baseUrl + '?customer=true&biz=' + encodeURIComponent(bizId) + '&station=' + encodeURIComponent(station.id);
}

// فتح شيت QR لجهاز معين (المستخدمة في زر QR جنب كل جهاز في الإعدادات)
function openStationQrSheet(stationId) {
    const st = stations.find(s => s.id === stationId);
    if (!st) return;
    
    const displayName = st.name ? st.name : t('جهاز', 'Device') + ' ' + st.number;
    document.getElementById('stationQrTitle').textContent = displayName;
    
    const url = getOrderPageUrl(st);
    const qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=' + encodeURIComponent(url);
    
    document.getElementById('stationQrBody').innerHTML = `
        ${!qrOrderingEnabled ? `<div class="empty" style="margin-bottom:10px;color:var(--red);"><i class="fa-solid fa-triangle-exclamation"></i>${t('خدمة الطلب عبر QR متوقفة حاليًا — فعّلها من الإعدادات.', 'QR ordering is currently disabled — enable it from Settings.')}</div>` : ''}
        <div class="qr-code-box"><img src="${qrImg}" alt="QR"></div>
        <div class="qr-link-box">${escapeHtml(url)}</div>
        <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-ghost btn-block" onclick="navigator.clipboard.writeText('${url}').then(()=>showToast(t('تم نسخ الرابط','Link copied'),'success'))">
                <i class="fa-solid fa-copy"></i> ${t('نسخ الرابط', 'Copy link')}
            </button>
            <button class="btn btn-teal btn-block" onclick="window.open('${url}','_blank')">
                <i class="fa-solid fa-up-right-from-square"></i> ${t('فتح الصفحة', 'Open page')}
            </button>
        </div>
        <button class="btn btn-amber btn-block" style="margin-top:8px;" onclick="printStationQr('${st.id}')">
            <i class="fa-solid fa-print"></i> ${t('طباعة وحطها على الترابيزة', 'Print for the table')}
        </button>
    `;
    openSheet('stationQrOverlay');
}

// طباعة QR الجهاز كورقة جاهزة تتحط على الترابيزة
function printStationQr(stationId) {
    const st = stations.find(s => s.id === stationId);
    if (!st) return;
    const displayName = st.name ? st.name : t('جهاز', 'Device') + ' ' + st.number;
    const url = getOrderPageUrl(st);
    const qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data=' + encodeURIComponent(url);
    const bizName = business ? business.name : '';

    const printWindow = window.open('', '_blank', 'width=420,height=620');
    if (!printWindow) {
        showToast(t('الرجاء السماح للنوافذ المنبثقة', 'Please allow popups'), 'error');
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>QR - ${escapeHtml(displayName)}</title>
            <meta charset="UTF-8">
            <style>
                @page { margin: 12px; size: auto; }
                body { font-family: 'Cairo', Arial, sans-serif; margin: 0; padding: 0; background: #fff; text-align: center; }
                .wrap { padding: 24px 16px; max-width: 340px; margin: 0 auto; }
                .biz { font-size: 14px; color: #888; margin-bottom: 4px; }
                .station { font-size: 26px; font-weight: 800; color: #000; margin-bottom: 16px; }
                .qr { border: 2px solid #000; border-radius: 16px; padding: 16px; display: inline-block; }
                .qr img { display: block; width: 260px; height: 260px; }
                .caption { font-size: 15px; font-weight: 700; margin-top: 16px; color: #000; }
                @media print { .no-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="wrap">
                ${bizName ? `<div class="biz">${escapeHtml(bizName)}</div>` : ''}
                <div class="station">${escapeHtml(displayName)}</div>
                <div class="qr"><img src="${qrImg}" alt="QR"></div>
                <div class="caption">${t('امسح الكود واطلب من هنا 📱', 'Scan to order 📱')}</div>
                <div class="no-print" style="margin-top:20px;">
                    <button onclick="window.print()" style="padding:10px 30px;background:#ff8a1e;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;">
                        🖨️ ${t('طباعة', 'Print')}
                    </button>
                    <button onclick="window.close()" style="padding:10px 30px;background:#666;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;margin-right:8px;">
                        ✕ ${t('إغلاق', 'Close')}
                    </button>
                </div>
            </div>
            <script>
                setTimeout(() => { window.print(); }, 400);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// ============================================================
// ✅ تفعيل / تعطيل QR Ordering (من الإعدادات)
// ============================================================

async function toggleQrOrdering(enabled) {
    try {
        const { error } = await supabaseClient.from('businesses').update({ qr_ordering_enabled: enabled }).eq('id', business.id);
        if (error) throw error;
        business.qr_ordering_enabled = enabled;
        qrOrderingEnabled = enabled;
        localStorage.setItem('psr_qr_ordering_enabled', JSON.stringify(enabled));
        showToast(enabled ? '✅ تم تفعيل الطلب عبر QR' : '❌ تم تعطيل الطلب عبر QR', 'success');
        renderSettingsStations(); // تحديث زر QR في الإعدادات
        renderStationsGrid(); // تحديث زرار QR فوق كل جهاز في صفحة الأجهزة
        // تحديث الـ toggle في الواجهة
        const toggle = document.getElementById('qrOrderingToggle');
        if (toggle) toggle.checked = enabled;
    } catch (e) {
        console.error('Error toggling qr ordering:', e);
        document.getElementById('qrOrderingToggle').checked = !enabled;
        showToast('⚠️ فشل تغيير الإعداد', 'error');
    }
}

// ============================================================
// ESCAPE HTML HELPER
// ============================================================
function escapeHtml(str) { 
    if (!str) return '';
    const d = document.createElement('div'); 
    d.textContent = str; 
    return d.innerHTML; 
}

// ============================================================
// EXPORT FUNCTIONS (للـ onclick في الـ HTML)
// ============================================================
window.handleSetupContinue = handleSetupContinue;
window.handleActivateDevice = handleActivateDevice;
window.selectLockRole = selectLockRole;
window.handleUnlock = handleUnlock;
window.handleEmployeeUnlock = handleEmployeeUnlock;
window.resetLockRole = resetLockRole;
window.lockApp = lockApp;
window.switchBusiness = switchBusiness;
window.showScreen = showScreen;
window.toggleLanguage = toggleLanguage;
window.navigateTo = navigateTo;
window.openSheet = openSheet;
window.closeSheet = closeSheet;
window.openStationSheet = openStationSheet;
window.openTransferSheet = openTransferSheet;
window.confirmTransfer = confirmTransfer;
window.selectTransferTarget = selectTransferTarget;
window.confirmCancelSession = confirmCancelSession;
window.selectStartMode = selectStartMode;
window.startSessionWithMode = startSessionWithMode;
window.selectTimerType = selectTimerType;
window.addOrderItem = addOrderItem;
window.removeOrderItem = removeOrderItem;
window.showEndSessionPayment = showEndSessionPayment;
window.cancelEndSession = cancelEndSession;
window.confirmEndSessionWithPayment = confirmEndSessionWithPayment;
window.selectPaymentMethod = selectPaymentMethod;
window.printReceipt = printReceipt;
window.updatePaymentCalculation = updatePaymentCalculation;
window.openExpenseSheet = openExpenseSheet;
window.submitExpense = submitExpense;
window.openCloseShiftSheet = openCloseShiftSheet;
window.confirmCloseShift = confirmCloseShift;
window.viewShiftDetails = viewShiftDetails;
window.openNewShift = openNewShift;
window.deleteShift = deleteShift;
window.setShiftFilter = setShiftFilter;
window.applyMonthlyFilter = applyMonthlyFilter;
window.toggleSettingsStations = toggleSettingsStations;
window.applyBulkRate = applyBulkRate;
window.openStationManagementSheet = openStationManagementSheet;
window.editStation = editStation;
window.submitStationManagement = submitStationManagement;
window.deleteStation = deleteStation;
window.openPaymentMethodSheet = openPaymentMethodSheet;
window.editPaymentMethod = editPaymentMethod;
window.submitPaymentMethod = submitPaymentMethod;
window.deletePaymentMethod = deletePaymentMethod;
window.openMenuItemSheet = openMenuItemSheet;
window.editMenuItem = editMenuItem;
window.submitMenuItem = submitMenuItem;
window.deleteMenuItem = deleteMenuItem;
window.openEmployeeSheet = openEmployeeSheet;
window.submitEmployee = submitEmployee;
window.deleteEmployee = deleteEmployee;
window.toggleSettingsPin = toggleSettingsPin;
window.changeOwnerPin = changeOwnerPin;
window.openCreateBusinessSheetFromSetup = openCreateBusinessSheetFromSetup;
window.submitCreateBusinessFromSetup = submitCreateBusinessFromSetup;
window.openQrOrdersSheet = openQrOrdersSheet;
window.addQrOrderToBill = addQrOrderToBill;
window.dismissQrOrder = dismissQrOrder;
window.deliverQrOrder = deliverQrOrder;
window.openStationQrSheet = openStationQrSheet;
window.printStationQr = printStationQr;
window.toggleQrOrdering = toggleQrOrdering;
window.renderStationsGrid = renderStationsGrid;
window.renderSettings = renderSettings;
window.renderDashboard = renderDashboard;
window.renderShiftView = renderShiftView;
window.updateTexts = updateTexts;
window.getDeviceId = getDeviceId;
window.money = money;
window.moneyDec = moneyDec;
window.showToast = showToast;
window.t = t;
window.escapeHtml = escapeHtml;
window.formatElapsed = formatElapsed;
window.nowCorrected = nowCorrected;
window.addToCustomerCart = addToCustomerCart;
window.removeFromCustomerCart = removeFromCustomerCart;
window.showCustomerCart = showCustomerCart;
window.submitCustomerOrder = submitCustomerOrder;
window.filterCustomerItems = filterCustomerItems;
window.initCustomerPage = initCustomerPage;
window.loadCustomerData = loadCustomerData;

console.log('✅ DORAK App loaded successfully!');
console.log('📱 QR ordering per station enabled');
console.log('🔔 Ring notifications active');
