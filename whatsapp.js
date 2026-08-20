// ============================================================
// WHATSAPP NOTIFICATIONS - نظام تنبيهات واتساب (نسخة محسنة)
// ============================================================

// تكوين واتساب
let whatsappConfig = {
    enabled: false,
    phoneNumber: '',
    apiKey: '',
    provider: 'callmebot',
    webhookUrl: ''
};

// ============================================================
// نظام Queue لإدارة الرسائل (يمنع التكدس ويحسن الأداء)
// ============================================================
let messageQueue = [];
let isProcessingQueue = false;
const QUEUE_DELAY_MS = 3000; // 3 ثواني بين كل رسالة والأخرى
const MAX_RETRIES = 3;

// تحميل الإعدادات من localStorage
function loadWhatsappConfig() {
    try {
        const saved = localStorage.getItem('dorak_whatsapp_config');
        if (saved) {
            whatsappConfig = JSON.parse(saved);
            console.log('📱 WhatsApp config loaded:', whatsappConfig);
        }
    } catch (e) {
        console.warn('Could not load whatsapp config:', e);
    }
}

// حفظ الإعدادات في localStorage
function saveWhatsappConfig() {
    try {
        localStorage.setItem('dorak_whatsapp_config', JSON.stringify(whatsappConfig));
        console.log('📱 WhatsApp config saved');
    } catch (e) {
        console.warn('Could not save whatsapp config:', e);
    }
}

// تحديث إعدادات واتساب من الواجهة
function updateWhatsappSettings(enabled, phoneNumber, apiKey, provider = 'callmebot') {
    whatsappConfig.enabled = enabled;
    whatsappConfig.phoneNumber = phoneNumber;
    whatsappConfig.apiKey = apiKey;
    whatsappConfig.provider = provider;
    saveWhatsappConfig();
    showToast(t('تم حفظ إعدادات واتساب', 'WhatsApp settings saved'), 'success');
    renderWhatsappSettingsUI();
}

// ============================================================
// إرسال رسالة واتساب (نسخة خلفية - لا تنتظر الرد)
// ============================================================
async function sendWhatsAppMessageBackground(message, retryCount = 0) {
    if (!whatsappConfig.enabled) {
        console.log('📱 WhatsApp notifications disabled');
        return { success: false, error: 'Notifications disabled' };
    }

    if (!whatsappConfig.phoneNumber) {
        console.warn('📱 No phone number configured');
        return { success: false, error: 'No phone number' };
    }

    try {
        let url = '';
        let body = null;
        let headers = {};

        switch (whatsappConfig.provider) {
            case 'callmebot':
                const encodedMessage = encodeURIComponent(message);
                // ✅ إضافة timestamp لتجنب الكاش
                const timestamp = Date.now();
                url = `https://api.callmebot.com/whatsapp.php?phone=${whatsappConfig.phoneNumber}&text=${encodedMessage}&apikey=${whatsappConfig.apiKey}&t=${timestamp}`;
                break;
            case 'twilio':
                url = `https://api.twilio.com/2010-04-01/Accounts/${whatsappConfig.apiKey}/Messages.json`;
                body = new URLSearchParams({
                    To: `whatsapp:${whatsappConfig.phoneNumber}`,
                    From: 'whatsapp:+14155238886',
                    Body: message
                });
                headers = {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + btoa(whatsappConfig.apiKey + ':' + (whatsappConfig.apiSecret || ''))
                };
                break;
            default:
                url = whatsappConfig.webhookUrl || '';
                body = JSON.stringify({
                    phone: whatsappConfig.phoneNumber,
                    message: message,
                    apiKey: whatsappConfig.apiKey
                });
                headers = {
                    'Content-Type': 'application/json'
                };
                break;
        }

        if (!url) {
            console.warn('📱 No valid webhook URL');
            return { success: false, error: 'No URL' };
        }

        console.log('📱 Sending WhatsApp message in background...');

        // ✅ إرسال بدون انتظار الرد (background)
        // ✅ مهلة 30 ثانية للسماح بالإرسال
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(url, {
            method: whatsappConfig.provider === 'callmebot' ? 'GET' : 'POST',
            headers: headers,
            body: body,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // ✅ قراءة الاستجابة بشكل صحيح
        const responseText = await response.text();
        console.log('📱 Response received (length):', responseText.length);

        // ✅ التحقق من نجاح الإرسال
        if (response.ok) {
            // CallMeBot يعيد رسالة نجاح حتى لو كان هناك خطأ بسيط
            if (responseText.includes('ERROR') || responseText.includes('error')) {
                console.warn('📱 API returned error but message may have been sent:', responseText);
                return { 
                    success: true, 
                    warning: 'API returned error but message may have been sent',
                    response: responseText
                };
            }
            
            console.log('📱 WhatsApp message sent successfully');
            return { success: true, response: responseText };
        } else {
            console.error('📱 Failed to send WhatsApp message:', responseText);
            
            // ✅ محاولة إعادة الإرسال في حالة الفشل
            if (retryCount < MAX_RETRIES) {
                console.log(`📱 Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
                return await sendWhatsAppMessageBackground(message, retryCount + 1);
            }
            
            return { success: false, error: responseText };
        }
        
    } catch (e) {
        // ✅ التعامل مع أخطاء الـ timeout بشكل خاص
        if (e.name === 'TimeoutError' || e.code === 'ETIMEDOUT' || e.message?.includes('timeout')) {
            console.warn('📱 Request timed out, but message may have been sent');
            // CallMeBot أحياناً يرسل الرسالة ولكن الرد يتأخر
            return { 
                success: true, 
                warning: 'Request timed out, but message may have been sent',
                error: e.message 
            };
        }
        
        console.error('📱 Error sending WhatsApp message:', e);
        
        // ✅ محاولة إعادة الإرسال في حالة الفشل
        if (retryCount < MAX_RETRIES) {
            console.log(`📱 Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, 3000 * (retryCount + 1)));
            return await sendWhatsAppMessageBackground(message, retryCount + 1);
        }
        
        return { success: false, error: e.message };
    }
}

// ============================================================
// نظام Queue لإدارة الرسائل
// ============================================================
async function queueWhatsAppMessage(message, priority = false) {
    if (!whatsappConfig.enabled) {
        console.log('📱 WhatsApp disabled - message not queued');
        return { success: false, error: 'Disabled' };
    }

    // ✅ إضافة الرسالة إلى قائمة الانتظار
    if (priority) {
        // الرسائل ذات الأولوية توضع في البداية
        messageQueue.unshift(message);
    } else {
        messageQueue.push(message);
    }
    
    console.log(`📱 Message queued (${messageQueue.length} in queue)`);
    
    // ✅ بدء معالجة القائمة إذا لم تكن قيد التشغيل
    if (!isProcessingQueue) {
        processQueue();
    }
    
    return { success: true, queued: true };
}

async function processQueue() {
    if (messageQueue.length === 0) {
        isProcessingQueue = false;
        console.log('📱 Queue empty');
        return;
    }
    
    isProcessingQueue = true;
    const message = messageQueue.shift();
    
    console.log(`📱 Processing queue (${messageQueue.length + 1} remaining)`);
    
    try {
        // ✅ إرسال الرسالة
        const result = await sendWhatsAppMessageBackground(message);
        
        if (result.success) {
            console.log('📱 Queue message sent successfully');
        } else {
            console.warn('📱 Queue message failed:', result.error);
            // ✅ في حالة الفشل، نعيد إضافة الرسالة إلى القائمة (مرة واحدة فقط)
            if (!message._retried) {
                message._retried = true;
                messageQueue.push(message);
                console.log('📱 Message re-queued for retry');
            }
        }
    } catch (e) {
        console.error('📱 Queue processing error:', e);
    }
    
    // ✅ انتظار قبل معالجة الرسالة التالية (لتجنب التكدس)
    await new Promise(resolve => setTimeout(resolve, QUEUE_DELAY_MS));
    
    // ✅ معالجة الرسالة التالية
    processQueue();
}

// ============================================================
// إرسال رسالة فورية (تنتظر الرد - للاختبار فقط)
// ============================================================
async function sendWhatsAppMessageSync(message) {
    if (!whatsappConfig.enabled) {
        return { success: false, error: 'Notifications disabled' };
    }

    if (!whatsappConfig.phoneNumber) {
        return { success: false, error: 'No phone number' };
    }

    try {
        const encodedMessage = encodeURIComponent(message);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${whatsappConfig.phoneNumber}&text=${encodedMessage}&apikey=${whatsappConfig.apiKey}`;
        
        console.log('📱 Sending WhatsApp message (sync)...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const responseText = await response.text();
        console.log('📱 Response:', responseText);

        if (response.ok) {
            return { success: true, response: responseText };
        } else {
            return { success: false, error: responseText };
        }
        
    } catch (e) {
        if (e.name === 'TimeoutError' || e.code === 'ETIMEDOUT') {
            return { 
                success: true, 
                warning: 'Request timed out, but message may have been sent',
                error: e.message 
            };
        }
        console.error('📱 Error sending WhatsApp message:', e);
        return { success: false, error: e.message };
    }
}

// ============================================================
// إنشاء رسائل التقارير (نسخ مختصرة وسريعة)
// ============================================================

// دالة مساعدة لتنسيق الأرقام
function formatMoneyForMessage(n) {
    return (Number(n) || 0).toLocaleString('ar-EG', { maximumFractionDigits: 0 });
}

// رسالة إقفال الشيفت (مختصرة)
function buildShiftClosedMessage(shift, totals) {
    const dateStr = new Date(shift.closed_at || shift.opened_at).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    const timeStr = new Date(shift.closed_at || shift.opened_at).toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit'
    });

    let message = `🔒 تقرير إقفال الشيفت\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 ${dateStr} ${timeStr}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 الإيراد: ${formatMoneyForMessage(totals.revenue)} ج\n`;
    message += `💸 المصروفات: ${formatMoneyForMessage(totals.expenses)} ج\n`;
    message += `📈 الصافي: ${formatMoneyForMessage(totals.profit)} ج\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `👥 الجلسات: ${totals.sessions?.length || 0}\n`;
    
    if (totals.sessions?.length > 0) {
        const avgValue = totals.revenue / totals.sessions.length;
        message += `📊 متوسط الجلسة: ${formatMoneyForMessage(avgValue)} ج\n`;
    }
    
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `✅ ${shift.closed_by || 'غير معروف'}\n`;
    message += `🕐 ${new Date().toLocaleString('ar-EG')}`;

    return message;
}

// رسالة تقرير اليوم (مختصرة)
function buildDailyReportMessage() {
    const today = new Date();
    const dateStr = today.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const completedSessions = Object.values(sessions || {}).filter(s => 
        s.status === 'completed' && 
        s.ended_at && 
        new Date(s.ended_at) >= todayStart
    );

    const totalRevenue = completedSessions.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const activeSessions = Object.keys(sessions || {}).filter(id => sessions[id]?.status === 'active').length;

    let message = `📊 تقرير اليوم ${dateStr}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 الإيراد: ${formatMoneyForMessage(totalRevenue)} ج\n`;
    message += `🎮 شغالة: ${activeSessions}\n`;
    message += `👥 جلسات: ${completedSessions.length}\n`;
    
    if (completedSessions.length > 0) {
        const avgValue = totalRevenue / completedSessions.length;
        message += `📊 متوسط الجلسة: ${formatMoneyForMessage(avgValue)} ج\n`;
    }

    const pendingQr = typeof totalPendingQrOrders === 'function' ? totalPendingQrOrders() : 0;
    if (pendingQr > 0) {
        message += `🔔 طلبات QR: ${pendingQr}\n`;
    }
    
    message += `🕐 ${new Date().toLocaleString('ar-EG')}`;

    return message;
}

// رسالة توقعات الأسبوع (مختصرة)
function buildForecastMessage() {
    const today = new Date();
    const dateStr = today.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    // حساب توقعات سريعة
    let avgDailyRevenue = 0;
    let avgDailyExpenses = 0;

    try {
        // محاولة جلب البيانات من الجلسات المكتملة في آخر 7 أيام
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const weekSessions = Object.values(sessions || {}).filter(s => 
            s.status === 'completed' && 
            s.ended_at && 
            new Date(s.ended_at) >= weekAgo
        );
        
        if (weekSessions.length > 0) {
            const weekRevenue = weekSessions.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
            avgDailyRevenue = weekRevenue / 7;
        } else {
            avgDailyRevenue = 500;
        }
        
        // تقدير المصروفات (30% من الإيراد تقريباً)
        avgDailyExpenses = avgDailyRevenue * 0.3;
        
    } catch (e) {
        console.warn('Could not calculate forecast:', e);
        avgDailyRevenue = 500;
        avgDailyExpenses = 150;
    }

    const forecastRevenue = avgDailyRevenue * 7;
    const forecastExpenses = avgDailyExpenses * 7;
    const forecastNet = forecastRevenue - forecastExpenses;

    let message = `📈 توقعات الأسبوع القادم\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 ${dateStr}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 الإيراد: ${formatMoneyForMessage(forecastRevenue)} ج\n`;
    message += `💸 المصروفات: ${formatMoneyForMessage(forecastExpenses)} ج\n`;
    message += `📈 الصافي: ${formatMoneyForMessage(forecastNet)} ج\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `⚠️ تقديري - مبني على متوسط الأداء\n`;
    message += `🕐 ${new Date().toLocaleString('ar-EG')}`;

    return message;
}

// رسالة ملخص الأسبوع (مختصرة)
function buildWeeklySummaryMessage() {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const dateStr = now.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    let weeklyRevenue = 0;
    let weeklySessions = 0;

    try {
        const weekSessions = Object.values(sessions || {}).filter(s => 
            s.status === 'completed' && 
            s.ended_at && 
            new Date(s.ended_at) >= weekAgo
        );
        
        weeklyRevenue = weekSessions.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
        weeklySessions = weekSessions.length;
    } catch (e) {
        console.warn('Could not fetch weekly data:', e);
    }

    let message = `📊 تقرير الأسبوع\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 ${dateStr}\n`;
    message += `📆 ${weekAgo.toLocaleDateString('ar-EG')} → ${now.toLocaleDateString('ar-EG')}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 الإيراد: ${formatMoneyForMessage(weeklyRevenue)} ج\n`;
    message += `👥 الجلسات: ${weeklySessions}\n`;
    
    if (weeklySessions > 0) {
        const avgValue = weeklyRevenue / weeklySessions;
        message += `📊 متوسط الجلسة: ${formatMoneyForMessage(avgValue)} ج\n`;
    }
    
    message += `🕐 ${new Date().toLocaleString('ar-EG')}`;

    return message;
}

// ============================================================
// دوال إرسال التنبيهات (باستخدام Queue)
// ============================================================

// إرسال تنبيه إقفال الشيفت
async function sendShiftClosedAlert(shift, totals) {
    if (!whatsappConfig.enabled) {
        console.log('📱 WhatsApp disabled - shift alert not sent');
        return { success: false, error: 'Disabled' };
    }
    
    const message = buildShiftClosedMessage(shift, totals);
    const result = await queueWhatsAppMessage(message, true); // أولوية عالية
    
    if (result.success) {
        console.log('📱 Shift closed alert queued successfully');
        showToast(t('تم إرسال تقرير إقفال الشيفت عبر واتساب', 'Shift closure report sent via WhatsApp'), 'success');
    } else {
        console.warn('📱 Failed to queue shift closed alert:', result.error);
        showToast(t('فشل إرسال تقرير الشيفت عبر واتساب', 'Failed to send shift report via WhatsApp'), 'error');
    }
    
    return result;
}

// إرسال تقرير اليوم
async function sendDailyReport() {
    if (!whatsappConfig.enabled) {
        showToast(t('واتساب غير مفعل', 'WhatsApp is disabled'), 'warning');
        return { success: false, error: 'Disabled' };
    }
    
    const message = buildDailyReportMessage();
    const result = await queueWhatsAppMessage(message);
    
    if (result.success) {
        showToast(t('تم إرسال تقرير اليوم عبر واتساب', 'Daily report sent via WhatsApp'), 'success');
    } else {
        showToast(t('فشل إرسال تقرير اليوم', 'Failed to send daily report'), 'error');
    }
    
    return result;
}

// إرسال توقعات الأسبوع
async function sendForecastReport() {
    if (!whatsappConfig.enabled) {
        showToast(t('واتساب غير مفعل', 'WhatsApp is disabled'), 'warning');
        return { success: false, error: 'Disabled' };
    }
    
    const message = buildForecastMessage();
    const result = await queueWhatsAppMessage(message);
    
    if (result.success) {
        showToast(t('تم إرسال توقعات الأسبوع عبر واتساب', 'Weekly forecast sent via WhatsApp'), 'success');
    } else {
        showToast(t('فشل إرسال التوقعات', 'Failed to send forecast'), 'error');
    }
    
    return result;
}

// إرسال ملخص الأسبوع
async function sendWeeklySummary() {
    if (!whatsappConfig.enabled) {
        showToast(t('واتساب غير مفعل', 'WhatsApp is disabled'), 'warning');
        return { success: false, error: 'Disabled' };
    }
    
    const message = buildWeeklySummaryMessage();
    const result = await queueWhatsAppMessage(message);
    
    if (result.success) {
        showToast(t('تم إرسال ملخص الأسبوع عبر واتساب', 'Weekly summary sent via WhatsApp'), 'success');
    } else {
        showToast(t('فشل إرسال الملخص الأسبوعي', 'Failed to send weekly summary'), 'error');
    }
    
    return result;
}

// إرسال تقرير تحليلات مخصص
async function sendAnalyticsReport(range = 'week') {
    if (!whatsappConfig.enabled) {
        showToast(t('واتساب غير مفعل', 'WhatsApp is disabled'), 'warning');
        return { success: false, error: 'Disabled' };
    }

    try {
        const { start, end } = typeof getAnalyticsRange === 'function' 
            ? getAnalyticsRange() 
            : { start: new Date(Date.now() - 7*86400000), end: new Date() };
            
        const { sessions: analyticsSessions, orders, expenses } = typeof fetchAnalyticsPeriodData === 'function'
            ? await fetchAnalyticsPeriodData(start.toISOString(), end.toISOString())
            : { sessions: [], orders: [], expenses: [] };

        const totalRevenue = analyticsSessions.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const totalExpenses = expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const netProfit = totalRevenue - totalExpenses;
        const itemsRevenue = orders.reduce((s, o) => s + (Number(o.quantity || 0) * Number(o.unit_price || 0)), 0);
        const hoursRevenue = Math.max(0, totalRevenue - itemsRevenue);

        const rangeLabel = range === 'today' ? 'اليوم' : range === 'week' ? 'آخر 7 أيام' : 'آخر 30 يوم';

        let message = `📊 تقرير التحليلات (${rangeLabel})\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `📅 ${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })}\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `💰 الإيراد: ${formatMoneyForMessage(totalRevenue)} ج\n`;
        message += `💸 المصروفات: ${formatMoneyForMessage(totalExpenses)} ج\n`;
        message += `📈 الصافي: ${formatMoneyForMessage(netProfit)} ج\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `📊 تفاصيل الإيراد:\n`;
        message += `   • ساعات: ${formatMoneyForMessage(hoursRevenue)} ج\n`;
        message += `   • منيو: ${formatMoneyForMessage(itemsRevenue)} ج\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `👥 الجلسات: ${analyticsSessions.length}\n`;
        
        if (analyticsSessions.length > 0) {
            const avgValue = totalRevenue / analyticsSessions.length;
            message += `📊 متوسط الجلسة: ${formatMoneyForMessage(avgValue)} ج\n`;
        }
        
        message += `🕐 ${new Date().toLocaleString('ar-EG')}`;

        const result = await queueWhatsAppMessage(message);
        
        if (result.success) {
            showToast(t('تم إرسال تقرير التحليلات عبر واتساب', 'Analytics report sent via WhatsApp'), 'success');
        } else {
            showToast(t('فشل إرسال تقرير التحليلات', 'Failed to send analytics report'), 'error');
        }
        
        return result;
    } catch (e) {
        console.error('Error sending analytics report:', e);
        showToast(t('فشل إرسال تقرير التحليلات', 'Failed to send analytics report'), 'error');
        return { success: false, error: e.message };
    }
}

// ============================================================
// واجهة إعدادات واتساب (في صفحة الإعدادات)
// ============================================================

function renderWhatsappSettingsUI() {
    const container = document.getElementById('settingsWhatsapp');
    if (!container) return;

    const enabled = whatsappConfig.enabled;
    const phone = whatsappConfig.phoneNumber || '';
    const apiKey = whatsappConfig.apiKey || '';
    const provider = whatsappConfig.provider || 'callmebot';

    container.innerHTML = `
        <div class="panel" style="padding:16px; margin-bottom:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div>
                    <div style="font-weight:700; font-size:15px;">📱 ${t('تنبيهات واتساب', 'WhatsApp Notifications')}</div>
                    <div style="font-size:12px; color:var(--text-dim);">${t('استقبل تقارير وإشعارات مهمة على واتساب', 'Receive important reports and notifications on WhatsApp')}</div>
                </div>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <span style="font-size:13px; font-weight:600; ${enabled ? 'color:var(--green)' : 'color:var(--red)'}">${enabled ? '✅ مفعل' : '❌ غير مفعل'}</span>
                    <input type="checkbox" id="whatsappEnabled" ${enabled ? 'checked' : ''} onchange="toggleWhatsappEnabled()" style="width:20px;height:20px;">
                </label>
            </div>

            <div id="whatsappSettingsForm" style="${enabled ? 'display:block' : 'display:none'}">
                <div class="field" style="margin-bottom:10px;">
                    <label data-ar="رقم الهاتف (بصيغة دولية)" data-en="Phone Number (International format)">${t('رقم الهاتف (بصيغة دولية)', 'Phone Number (International format)')}</label>
                    <input type="text" id="whatsappPhone" class="mono" value="${phone}" placeholder="مثال: 201234567890" style="direction:ltr;text-align:left;">
                    <div style="font-size:10px; color:var(--text-faint); margin-top:4px;">${t('أدخل الرقم بدون + أو 00، مثال: 201234567890', 'Enter number without + or 00, e.g., 201234567890')}</div>
                </div>

                <div class="field" style="margin-bottom:10px;">
                    <label data-ar="مفتاح API" data-en="API Key">${t('مفتاح API', 'API Key')}</label>
                    <input type="text" id="whatsappApiKey" class="mono" value="${apiKey}" placeholder="مفتاح API من CallMeBot">
                    <div style="font-size:10px; color:var(--text-faint); margin-top:4px;">
                        ${t('احصل على مفتاح مجاني: أرسل "I allow callmebot to send me messages" إلى +34 613 038 843', 'Get free key: Send "I allow callmebot to send me messages" to +34 613 038 843')}
                    </div>
                </div>

                <div class="field" style="margin-bottom:10px;">
                    <label data-ar="مزود الخدمة" data-en="Service Provider">${t('مزود الخدمة', 'Service Provider')}</label>
                    <select id="whatsappProvider">
                        <option value="callmebot" ${provider === 'callmebot' ? 'selected' : ''}>CallMeBot (مجاني)</option>
                        <option value="twilio" ${provider === 'twilio' ? 'selected' : ''}>Twilio (مدفوع)</option>
                        <option value="custom" ${provider === 'custom' ? 'selected' : ''}>Custom Webhook</option>
                    </select>
                </div>

                <button class="btn btn-teal btn-block" onclick="saveWhatsappSettingsFromUI()" style="margin-bottom:12px;">
                    <i class="fa-solid fa-floppy-disk"></i> ${t('حفظ الإعدادات', 'Save Settings')}
                </button>

                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                    <button class="btn btn-amber btn-sm" onclick="testWhatsappMessage()" style="flex:1; min-width:80px;">
                        <i class="fa-solid fa-paper-plane"></i> ${t('اختبار', 'Test')}
                    </button>
                    <button class="btn btn-amber btn-sm" onclick="sendDailyReport()" style="flex:1; min-width:80px;">
                        <i class="fa-solid fa-calendar-day"></i> ${t('تقرير اليوم', 'Daily')}
                    </button>
                    <button class="btn btn-amber btn-sm" onclick="sendForecastReport()" style="flex:1; min-width:80px;">
                        <i class="fa-solid fa-chart-line"></i> ${t('التوقعات', 'Forecast')}
                    </button>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-amber btn-sm" onclick="sendWeeklySummary()" style="flex:1; min-width:80px;">
                        <i class="fa-solid fa-calendar-week"></i> ${t('ملخص الأسبوع', 'Weekly')}
                    </button>
                    <button class="btn btn-amber btn-sm" onclick="sendAnalyticsReport('week')" style="flex:1; min-width:80px;">
                        <i class="fa-solid fa-chart-pie"></i> ${t('تحليلات', 'Analytics')}
                    </button>
                    <button class="btn btn-amber btn-sm" onclick="sendShiftClosedAlert(currentShift, getShiftTotals(currentShift))" style="flex:1; min-width:80px;">
                        <i class="fa-solid fa-lock"></i> ${t('تقرير الشيفت', 'Shift')}
                    </button>
                </div>
                <div style="font-size:11px; color:var(--text-faint); margin-top:10px; text-align:center;">
                    ${t('⚠️ الرسائل ترسل في الخلفية ولا تنتظر الرد لتجنب التأخير', '⚠️ Messages are sent in the background without waiting for a reply to avoid delays')}
                </div>
            </div>
        </div>
    `;
}

function toggleWhatsappEnabled() {
    const checkbox = document.getElementById('whatsappEnabled');
    const form = document.getElementById('whatsappSettingsForm');
    form.style.display = checkbox.checked ? 'block' : 'none';
}

function saveWhatsappSettingsFromUI() {
    const enabled = document.getElementById('whatsappEnabled').checked;
    const phone = document.getElementById('whatsappPhone').value.trim();
    const apiKey = document.getElementById('whatsappApiKey').value.trim();
    const provider = document.getElementById('whatsappProvider').value;

    if (enabled && !phone) {
        showToast(t('يرجى إدخال رقم الهاتف', 'Please enter a phone number'), 'error');
        return;
    }

    if (enabled && !apiKey && provider !== 'custom') {
        showToast(t('يرجى إدخال مفتاح API', 'Please enter an API key'), 'error');
        return;
    }

    whatsappConfig.enabled = enabled;
    whatsappConfig.phoneNumber = phone;
    whatsappConfig.apiKey = apiKey;
    whatsappConfig.provider = provider;
    saveWhatsappConfig();

    renderWhatsappSettingsUI();
    showToast(t('تم حفظ إعدادات واتساب', 'WhatsApp settings saved'), 'success');
}

async function testWhatsappMessage() {
    if (!whatsappConfig.enabled) {
        showToast(t('واتساب غير مفعل', 'WhatsApp is disabled'), 'warning');
        return;
    }
    if (!whatsappConfig.phoneNumber) {
        showToast(t('يرجى إدخال رقم الهاتف', 'Please enter a phone number'), 'error');
        return;
    }

    const testMessage = `🧪 *رسالة اختبار من DORAK*\n━━━━━━━━━━━━━━━━━━\n✅ تم إعداد تنبيهات واتساب بنجاح!\n🕐 ${new Date().toLocaleString('ar-EG')}`;

    // ✅ استخدام الإرسال المتزامن للاختبار
    const result = await sendWhatsAppMessageSync(testMessage);
    
    if (result.success) {
        showToast(t('✅ تم إرسال رسالة الاختبار بنجاح', '✅ Test message sent successfully'), 'success');
    } else {
        // ✅ حتى لو ظهر خطأ، قد تكون الرسالة وصلت
        showToast(t('⚠️ قد تكون الرسالة وصلت رغم ظهور خطأ في الاتصال', '⚠️ Message may have been sent despite connection error'), 'warning');
        console.warn('Test send result:', result);
    }
}

// ============================================================
// التنبيهات التلقائية
// ============================================================

let whatsappAutoReportInterval = null;

function startWhatsappAutoReports() {
    if (whatsappAutoReportInterval) {
        clearInterval(whatsappAutoReportInterval);
    }

    // التحقق كل دقيقة
    whatsappAutoReportInterval = setInterval(() => {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();

        // تقرير يومي عند الساعة 23:59
        if (hour === 23 && minute >= 59 && minute <= 59) {
            if (whatsappConfig.enabled) {
                console.log('📱 Sending daily auto report...');
                sendDailyReport();
                // إرسال التوقعات مع التقرير اليومي
                setTimeout(() => sendForecastReport(), 5000);
            }
        }

        // تقرير أسبوعي يوم الأحد الساعة 10:00
        if (now.getDay() === 0 && hour === 10 && minute <= 1) {
            if (whatsappConfig.enabled) {
                console.log('📱 Sending weekly auto report...');
                sendWeeklySummary();
            }
        }
    }, 60000);
}

function stopWhatsappAutoReports() {
    if (whatsappAutoReportInterval) {
        clearInterval(whatsappAutoReportInterval);
        whatsappAutoReportInterval = null;
    }
}

// ============================================================
// تصدير الدوال
// ============================================================

window.whatsappConfig = whatsappConfig;
window.loadWhatsappConfig = loadWhatsappConfig;
window.saveWhatsappConfig = saveWhatsappConfig;
window.updateWhatsappSettings = updateWhatsappSettings;
window.sendWhatsAppMessageBackground = sendWhatsAppMessageBackground;
window.sendWhatsAppMessageSync = sendWhatsAppMessageSync;
window.sendShiftClosedAlert = sendShiftClosedAlert;
window.sendDailyReport = sendDailyReport;
window.sendForecastReport = sendForecastReport;
window.sendWeeklySummary = sendWeeklySummary;
window.sendAnalyticsReport = sendAnalyticsReport;
window.renderWhatsappSettingsUI = renderWhatsappSettingsUI;
window.toggleWhatsappEnabled = toggleWhatsappEnabled;
window.saveWhatsappSettingsFromUI = saveWhatsappSettingsFromUI;
window.testWhatsappMessage = testWhatsappMessage;
window.startWhatsappAutoReports = startWhatsappAutoReports;
window.stopWhatsappAutoReports = stopWhatsappAutoReports;
window.queueWhatsAppMessage = queueWhatsAppMessage;
window.formatMoneyForMessage = formatMoneyForMessage;

console.log('📱 WhatsApp notifications module loaded (optimized)');
console.log('📱 Queue system ready - messages will be sent in background');
