// ============================================================
// WHATSAPP NOTIFICATIONS - نظام تنبيهات واتساب
// ============================================================

// تكوين واتساب - استخدم رقم هاتف صاحب الصالة
let whatsappConfig = {
    enabled: false,
    phoneNumber: '', // رقم الهاتف بصيغة دولية مثال: 201234567890
    apiKey: '', // مفتاح API من خدمة مثل CallMeBot أو Twilio
    provider: 'callmebot' // callmebot | twilio | custom
};

// تحميل الإعدادات من localStorage
function loadWhatsappConfig() {
    try {
        const saved = localStorage.getItem('dorak_whatsapp_config');
        if (saved) {
            whatsappConfig = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Could not load whatsapp config:', e);
    }
}

// حفظ الإعدادات في localStorage
function saveWhatsappConfig() {
    try {
        localStorage.setItem('dorak_whatsapp_config', JSON.stringify(whatsappConfig));
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
// إرسال رسالة واتساب عبر CallMeBot (مجاني)
// ============================================================
async function sendWhatsAppMessage(message) {
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
                // خدمة CallMeBot المجانية
                url = `https://api.callmebot.com/whatsapp.php?phone=${whatsappConfig.phoneNumber}&text=${encodeURIComponent(message)}&apikey=${whatsappConfig.apiKey}`;
                break;
            case 'twilio':
                // Twilio API - يحتاج إلى تكوين إضافي
                url = `https://api.twilio.com/2010-04-01/Accounts/${whatsappConfig.apiKey}/Messages.json`;
                body = new URLSearchParams({
                    To: `whatsapp:${whatsappConfig.phoneNumber}`,
                    From: 'whatsapp:+14155238886', // رقم Twilio الافتراضي
                    Body: message
                });
                headers = {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + btoa(whatsappConfig.apiKey + ':' + (whatsappConfig.apiSecret || ''))
                };
                break;
            default:
                // Custom webhook
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

        const response = await fetch(url, {
            method: whatsappConfig.provider === 'callmebot' ? 'GET' : 'POST',
            headers: headers,
            body: body
        });

        if (response.ok) {
            console.log('📱 WhatsApp message sent successfully');
            return { success: true };
        } else {
            const errorText = await response.text();
            console.error('📱 Failed to send WhatsApp message:', errorText);
            return { success: false, error: errorText };
        }
    } catch (e) {
        console.error('📱 Error sending WhatsApp message:', e);
        return { success: false, error: e.message };
    }
}

// ============================================================
// إنشاء رسائل التقارير
// ============================================================

// دالة مساعدة لتنسيق الأرقام
function formatMoneyForMessage(n) {
    return (Number(n) || 0).toLocaleString('ar-EG', { maximumFractionDigits: 0 });
}

// إنشاء رسالة إقفال الشيفت
function buildShiftClosedMessage(shift, totals) {
    const dateStr = new Date(shift.closed_at || shift.opened_at).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const timeStr = new Date(shift.closed_at || shift.opened_at).toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit'
    });
    const openedAt = new Date(shift.opened_at).toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit'
    });

    let message = `🔒 *تقرير إقفال الشيفت* 🔒\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 التاريخ: ${dateStr}\n`;
    message += `⏰ وقت الفتح: ${openedAt}\n`;
    message += `⏰ وقت الإقفال: ${timeStr}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 *الإيراد الكلي:* ${formatMoneyForMessage(totals.revenue)} ج\n`;
    message += `💸 *المصروفات:* ${formatMoneyForMessage(totals.expenses)} ج\n`;
    message += `📈 *صافي الدخل:* ${formatMoneyForMessage(totals.profit)} ج\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📊 *تفاصيل الإيراد:*\n`;
    message += `   • إيراد الساعات: ${formatMoneyForMessage(totals.hoursRevenue)} ج\n`;
    message += `   • إيراد المنيو: ${formatMoneyForMessage(totals.itemsRevenue)} ج\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `👥 *عدد الجلسات:* ${totals.sessions.length}\n`;
    message += `🕐 *متوسط قيمة الجلسة:* ${formatMoneyForMessage(totals.sessions.length > 0 ? totals.revenue / totals.sessions.length : 0)} ج\n`;

    // إضافة توزيع طرق الدفع إن وجد
    const pmBreakdown = {};
    totals.sessions.forEach(s => {
        if (s.payment_method) {
            const pm = paymentMethods.find(p => p.id === s.payment_method);
            const key = pm ? pm.name : s.payment_method;
            pmBreakdown[key] = (pmBreakdown[key] || 0) + Number(s.amount || 0);
        }
    });
    if (Object.keys(pmBreakdown).length > 0) {
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `💳 *طرق الدفع:*\n`;
        Object.entries(pmBreakdown).forEach(([name, amount]) => {
            message += `   • ${name}: ${formatMoneyForMessage(amount)} ج\n`;
        });
    }

    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `✅ تم إقفال الشيفت بواسطة: ${shift.closed_by || 'غير معروف'}\n`;
    message += `🕐 ${new Date().toLocaleString('ar-EG')}`;

    return message;
}

// إنشاء رسالة تقرير اليوم (Dashboard)
function buildDailyReportMessage() {
    const today = new Date();
    const dateStr = today.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // جلب إيرادات اليوم
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const completedSessions = Object.values(sessions || {}).filter(s => 
        s.status === 'completed' && 
        s.ended_at && 
        new Date(s.ended_at) >= todayStart
    );

    const totalRevenue = completedSessions.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const activeSessions = Object.keys(sessions || {}).filter(id => sessions[id].status === 'active').length;

    let message = `📊 *تقرير أداء اليوم* 📊\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 ${dateStr}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 *إيراد اليوم:* ${formatMoneyForMessage(totalRevenue)} ج\n`;
    message += `🎮 *أجهزة شغالة حالياً:* ${activeSessions}\n`;
    message += `📱 *أجهزة متاحة:* ${stations.length - activeSessions}\n`;
    message += `👥 *جلسات مكتملة:* ${completedSessions.length}\n`;

    // إضافة إحصائيات إضافية إن وجدت
    if (completedSessions.length > 0) {
        const avgValue = totalRevenue / completedSessions.length;
        message += `📈 *متوسط قيمة الجلسة:* ${formatMoneyForMessage(avgValue)} ج\n`;
    }

    // إضافة طلبات QR معلقة إن وجدت
    const pendingQr = totalPendingQrOrders ? totalPendingQrOrders() : 0;
    if (pendingQr > 0) {
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `🔔 *طلبات QR معلقة:* ${pendingQr}\n`;
    }

    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `🕐 ${new Date().toLocaleString('ar-EG')}`;

    return message;
}

// إنشاء رسالة توقعات الأسبوع
function buildForecastMessage() {
    const today = new Date();
    const dateStr = today.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // حساب التوقعات من آخر 28 يوم
    const forecastEnd = new Date();
    const forecastStart = new Date(forecastEnd);
    forecastStart.setDate(forecastStart.getDate() - 28);

    // استخدام بيانات من analytics إن كانت متاحة
    let avgDailyRevenue = 0;
    let avgDailyExpenses = 0;
    let totalSessions = 0;

    try {
        // محاولة جلب البيانات من التحليلات
        const { sessions: fSessions, expenses: fExpenses } = fetchAnalyticsPeriodDataSync
            ? fetchAnalyticsPeriodDataSync(forecastStart.toISOString(), forecastEnd.toISOString())
            : { sessions: [], expenses: [] };

        const fRevenue = fSessions.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const fExpTotal = fExpenses.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        avgDailyRevenue = fRevenue / 28;
        avgDailyExpenses = fExpTotal / 28;
        totalSessions = fSessions.length;
    } catch (e) {
        console.warn('Could not fetch analytics data for forecast:', e);
        // استخدام بيانات عامة إن لم تكن التحليلات متاحة
        avgDailyRevenue = 500; // قيمة افتراضية
        avgDailyExpenses = 100;
    }

    const forecastRevenue = avgDailyRevenue * 7;
    const forecastExpenses = avgDailyExpenses * 7;
    const forecastNet = forecastRevenue - forecastExpenses;

    let message = `📈 *توقعات الأسبوع القادم* 📈\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 بناءً على أداء آخر 28 يوم\n`;
    message += `📊 تاريخ التقرير: ${dateStr}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 *الإيراد المتوقع:* ${formatMoneyForMessage(forecastRevenue)} ج\n`;
    message += `💸 *المصروفات المتوقعة:* ${formatMoneyForMessage(forecastExpenses)} ج\n`;
    message += `📈 *صافي الربح المتوقع:* ${formatMoneyForMessage(forecastNet)} ج\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📊 *متوسط الإيراد اليومي:* ${formatMoneyForMessage(avgDailyRevenue)} ج\n`;
    message += `📊 *متوسط المصروفات اليومي:* ${formatMoneyForMessage(avgDailyExpenses)} ج\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `⚠️ التوقعات تقديرية وتعتمد على متوسط أداء الفترة الماضية.\n`;
    message += `🕐 ${new Date().toLocaleString('ar-EG')}`;

    return message;
}

// إنشاء رسالة ملخص الأسبوع
function buildWeeklySummaryMessage() {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const dateStr = now.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // جلب بيانات الأسبوع
    let weeklyRevenue = 0;
    let weeklySessions = 0;
    let weeklyOrders = 0;

    try {
        const { sessions: weekSessions, orders: weekOrders } = fetchAnalyticsPeriodDataSync
            ? fetchAnalyticsPeriodDataSync(weekAgo.toISOString(), now.toISOString())
            : { sessions: [], orders: [] };

        weeklyRevenue = weekSessions.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        weeklySessions = weekSessions.length;
        weeklyOrders = weekOrders.length;
    } catch (e) {
        console.warn('Could not fetch weekly data:', e);
    }

    let message = `📊 *تقرير الأسبوع الماضي* 📊\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 ${dateStr}\n`;
    message += `📆 الأيام: ${weekAgo.toLocaleDateString('ar-EG')} → ${now.toLocaleDateString('ar-EG')}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 *إجمالي الإيراد:* ${formatMoneyForMessage(weeklyRevenue)} ج\n`;
    message += `👥 *عدد الجلسات:* ${weeklySessions}\n`;
    message += `🍽️ *طلبات المنيو:* ${weeklyOrders}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;

    if (weeklySessions > 0) {
        const avgPerSession = weeklyRevenue / weeklySessions;
        message += `📈 *متوسط قيمة الجلسة:* ${formatMoneyForMessage(avgPerSession)} ج\n`;
    }

    message += `🕐 ${new Date().toLocaleString('ar-EG')}`;

    return message;
}

// ============================================================
// دوال إرسال التنبيهات
// ============================================================

// إرسال تنبيه إقفال الشيفت
async function sendShiftClosedAlert(shift, totals) {
    if (!whatsappConfig.enabled) return;
    const message = buildShiftClosedMessage(shift, totals);
    const result = await sendWhatsAppMessage(message);
    if (result.success) {
        console.log('📱 Shift closed alert sent successfully');
        showToast(t('تم إرسال تقرير إقفال الشيفت عبر واتساب', 'Shift closure report sent via WhatsApp'), 'success');
    } else {
        console.warn('📱 Failed to send shift closed alert:', result.error);
        showToast(t('فشل إرسال تقرير الشيفت عبر واتساب', 'Failed to send shift report via WhatsApp'), 'error');
    }
    return result;
}

// إرسال تقرير اليوم
async function sendDailyReport() {
    if (!whatsappConfig.enabled) {
        showToast(t('واتساب غير مفعل', 'WhatsApp is disabled'), 'warning');
        return;
    }
    const message = buildDailyReportMessage();
    const result = await sendWhatsAppMessage(message);
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
        return;
    }
    const message = buildForecastMessage();
    const result = await sendWhatsAppMessage(message);
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
        return;
    }
    const message = buildWeeklySummaryMessage();
    const result = await sendWhatsAppMessage(message);
    if (result.success) {
        showToast(t('تم إرسال ملخص الأسبوع عبر واتساب', 'Weekly summary sent via WhatsApp'), 'success');
    } else {
        showToast(t('فشل إرسال الملخص الأسبوعي', 'Failed to send weekly summary'), 'error');
    }
    return result;
}

// إرسال تقرير التحليلات المخصص
async function sendAnalyticsReport(range = 'week') {
    if (!whatsappConfig.enabled) {
        showToast(t('واتساب غير مفعل', 'WhatsApp is disabled'), 'warning');
        return;
    }

    try {
        const { start, end } = getAnalyticsRange ? getAnalyticsRange() : { start: new Date(Date.now() - 7*86400000), end: new Date() };
        const { sessions, orders, expenses } = await fetchAnalyticsPeriodDataSync
            ? fetchAnalyticsPeriodDataSync(start.toISOString(), end.toISOString())
            : { sessions: [], orders: [], expenses: [] };

        const totalRevenue = sessions.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const totalExpenses = expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const netProfit = totalRevenue - totalExpenses;
        const itemsRevenue = orders.reduce((s, o) => s + (Number(o.quantity || 0) * Number(o.unit_price || 0)), 0);
        const hoursRevenue = Math.max(0, totalRevenue - itemsRevenue);

        const rangeLabel = range === 'today' ? 'اليوم' : range === 'week' ? 'آخر 7 أيام' : 'آخر 30 يوم';

        let message = `📊 *تقرير التحليلات (${rangeLabel})* 📊\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `📅 ${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `💰 *إجمالي الإيراد:* ${formatMoneyForMessage(totalRevenue)} ج\n`;
        message += `💸 *المصروفات:* ${formatMoneyForMessage(totalExpenses)} ج\n`;
        message += `📈 *صافي الربح:* ${formatMoneyForMessage(netProfit)} ج\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `📊 *تفاصيل الإيراد:*\n`;
        message += `   • إيراد الساعات: ${formatMoneyForMessage(hoursRevenue)} ج\n`;
        message += `   • إيراد المنيو: ${formatMoneyForMessage(itemsRevenue)} ج\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `👥 *عدد الجلسات:* ${sessions.length}\n`;

        if (sessions.length > 0) {
            const avgValue = totalRevenue / sessions.length;
            message += `📈 *متوسط قيمة الجلسة:* ${formatMoneyForMessage(avgValue)} ج\n`;
        }

        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `🕐 ${new Date().toLocaleString('ar-EG')}`;

        const result = await sendWhatsAppMessage(message);
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
                    <span style="font-size:13px; font-weight:600;">${enabled ? '✅ مفعل' : '❌ غير مفعل'}</span>
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
                    <input type="text" id="whatsappApiKey" class="mono" value="${apiKey}" placeholder="مفتاح API من الخدمة">
                </div>

                <div class="field" style="margin-bottom:10px;">
                    <label data-ar="مزود الخدمة" data-en="Service Provider">${t('مزود الخدمة', 'Service Provider')}</label>
                    <select id="whatsappProvider" onchange="updateWhatsappProviderHint()">
                        <option value="callmebot" ${provider === 'callmebot' ? 'selected' : ''}>CallMeBot (مجاني)</option>
                        <option value="twilio" ${provider === 'twilio' ? 'selected' : ''}>Twilio (مدفوع)</option>
                        <option value="custom" ${provider === 'custom' ? 'selected' : ''}>Custom Webhook</option>
                    </select>
                </div>

                <div id="whatsappProviderHint" style="font-size:11px; color:var(--text-faint); margin-bottom:12px; padding:8px; background:var(--bg-sunken); border-radius:var(--radius-sm);">
                    ${provider === 'callmebot' ? 
                        t('🔑 احصل على مفتاح API مجاني من CallMeBot: أرسل رسالة "I allow callmebot to send me messages" إلى الرقم +34 613 038 843، ثم استخدم المفتاح الذي سترسله لك.', 
                          '🔑 Get a free API key from CallMeBot: Send "I allow callmebot to send me messages" to +34 613 038 843, then use the key they send you.') :
                        provider === 'twilio' ?
                        t('💳 استخدم حساب Twilio الخاص بك. ستحتاج إلى Account SID و Auth Token.', 
                          '💳 Use your Twilio account. You will need Account SID and Auth Token.') :
                        t('🔧 استخدم Webhook مخصص. سترسل الطلب كـ JSON إلى الرابط الذي تحدده.', 
                          '🔧 Use a custom webhook. The request will be sent as JSON to your URL.')
                    }
                </div>

                <div class="field" style="margin-bottom:10px; display:${provider === 'custom' ? 'block' : 'none'};" id="customWebhookField">
                    <label data-ar="رابط Webhook" data-en="Webhook URL">${t('رابط Webhook', 'Webhook URL')}</label>
                    <input type="text" id="whatsappWebhook" class="mono" value="${whatsappConfig.webhookUrl || ''}" placeholder="https://example.com/webhook">
                </div>

                <button class="btn btn-teal btn-block" onclick="saveWhatsappSettingsFromUI()">
                    <i class="fa-solid fa-floppy-disk"></i> ${t('حفظ الإعدادات', 'Save Settings')}
                </button>

                <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-amber btn-sm" onclick="testWhatsappMessage()" style="flex:1;">
                        <i class="fa-solid fa-paper-plane"></i> ${t('اختبار الإرسال', 'Test Send')}
                    </button>
                    <button class="btn btn-amber btn-sm" onclick="sendDailyReport()" style="flex:1;">
                        <i class="fa-solid fa-calendar-day"></i> ${t('تقرير اليوم', 'Daily Report')}
                    </button>
                    <button class="btn btn-amber btn-sm" onclick="sendForecastReport()" style="flex:1;">
                        <i class="fa-solid fa-chart-line"></i> ${t('التوقعات', 'Forecast')}
                    </button>
                    <button class="btn btn-amber btn-sm" onclick="sendAnalyticsReport('week')" style="flex:1;">
                        <i class="fa-solid fa-chart-pie"></i> ${t('تحليلات', 'Analytics')}
                    </button>
                </div>
                <div style="margin-top:8px; display:flex; gap:8px;">
                    <button class="btn btn-amber btn-sm" onclick="sendWeeklySummary()" style="flex:1;">
                        <i class="fa-solid fa-calendar-week"></i> ${t('ملخص الأسبوع', 'Weekly Summary')}
                    </button>
                    <button class="btn btn-amber btn-sm" onclick="sendShiftClosedAlert(currentShift, getShiftTotals(currentShift))" style="flex:1;">
                        <i class="fa-solid fa-lock"></i> ${t('إرسال تقرير الشيفت', 'Send Shift Report')}
                    </button>
                </div>
            </div>
        </div>
    `;
}

function toggleWhatsappEnabled() {
    const checkbox = document.getElementById('whatsappEnabled');
    const form = document.getElementById('whatsappSettingsForm');
    form.style.display = checkbox.checked ? 'block' : 'none';
    // لا نحفظ تلقائياً، ننتظر الضغط على حفظ
}

function updateWhatsappProviderHint() {
    const provider = document.getElementById('whatsappProvider').value;
    const hint = document.getElementById('whatsappProviderHint');
    const customField = document.getElementById('customWebhookField');

    customField.style.display = provider === 'custom' ? 'block' : 'none';

    const hints = {
        'callmebot': t('🔑 احصل على مفتاح API مجاني من CallMeBot: أرسل رسالة "I allow callmebot to send me messages" إلى الرقم +34 613 038 843، ثم استخدم المفتاح الذي سترسله لك.', 
                       '🔑 Get a free API key from CallMeBot: Send "I allow callmebot to send me messages" to +34 613 038 843, then use the key they send you.'),
        'twilio': t('💳 استخدم حساب Twilio الخاص بك. ستحتاج إلى Account SID و Auth Token.', 
                   '💳 Use your Twilio account. You will need Account SID and Auth Token.'),
        'custom': t('🔧 استخدم Webhook مخصص. سترسل الطلب كـ JSON إلى الرابط الذي تحدده.', 
                   '🔧 Use a custom webhook. The request will be sent as JSON to your URL.')
    };
    hint.textContent = hints[provider] || hints.callmebot;
}

function saveWhatsappSettingsFromUI() {
    const enabled = document.getElementById('whatsappEnabled').checked;
    const phone = document.getElementById('whatsappPhone').value.trim();
    const apiKey = document.getElementById('whatsappApiKey').value.trim();
    const provider = document.getElementById('whatsappProvider').value;
    const webhookUrl = document.getElementById('whatsappWebhook') ? document.getElementById('whatsappWebhook').value.trim() : '';

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
    whatsappConfig.webhookUrl = webhookUrl;
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

    const result = await sendWhatsAppMessage(testMessage);
    if (result.success) {
        showToast(t('✅ تم إرسال رسالة الاختبار بنجاح', '✅ Test message sent successfully'), 'success');
    } else {
        showToast(t('❌ فشل إرسال رسالة الاختبار: ' + (result.error || 'خطأ غير معروف'), '❌ Failed to send test message: ' + (result.error || 'Unknown error')), 'error');
    }
}

// ============================================================
// ربط التنبيهات مع إقفال الشيفت
// ============================================================

// تعديل دالة confirmCloseShift لإضافة تنبيه واتساب
// يجب إضافة هذا السطر داخل confirmCloseShift بعد نجاح الإقفال:
// await sendShiftClosedAlert(currentShift, totals);

// ============================================================
// تهيئة التنبيهات التلقائية (كل ساعة)
// ============================================================

let whatsappAutoReportInterval = null;

function startWhatsappAutoReports() {
    if (whatsappAutoReportInterval) {
        clearInterval(whatsappAutoReportInterval);
    }

    // إرسال تقرير يومي عند الساعة 11:59 مساءً (يتم التحقق كل ساعة)
    whatsappAutoReportInterval = setInterval(() => {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();

        // التحقق في الساعة 23:59
        if (hour === 23 && minute >= 59) {
            if (whatsappConfig.enabled) {
                sendDailyReport();
                // إرسال توقعات الأسبوع مع التقرير اليومي
                setTimeout(() => sendForecastReport(), 2000);
            }
        }

        // إرسال ملخص أسبوعي يوم الأحد الساعة 10:00
        if (now.getDay() === 0 && hour === 10 && minute <= 1) {
            if (whatsappConfig.enabled) {
                sendWeeklySummary();
            }
        }
    }, 60000); // كل دقيقة للتحقق
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
window.sendWhatsAppMessage = sendWhatsAppMessage;
window.sendShiftClosedAlert = sendShiftClosedAlert;
window.sendDailyReport = sendDailyReport;
window.sendForecastReport = sendForecastReport;
window.sendWeeklySummary = sendWeeklySummary;
window.sendAnalyticsReport = sendAnalyticsReport;
window.renderWhatsappSettingsUI = renderWhatsappSettingsUI;
window.toggleWhatsappEnabled = toggleWhatsappEnabled;
window.updateWhatsappProviderHint = updateWhatsappProviderHint;
window.saveWhatsappSettingsFromUI = saveWhatsappSettingsFromUI;
window.testWhatsappMessage = testWhatsappMessage;
window.startWhatsappAutoReports = startWhatsappAutoReports;
window.stopWhatsappAutoReports = stopWhatsappAutoReports;

console.log('📱 WhatsApp notifications module loaded');