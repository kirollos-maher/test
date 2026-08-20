// ============================================================
// ANALYTICS MODULE (منفصل عن app.js)
// ============================================================

// دالة مساعدة لتحويل الثواني إلى ساعات ودقائق
function formatHoursDuration(totalSeconds) {
    const hrs = totalSeconds / 3600;
    if (hrs >= 1) {
        return `${moneyDec(hrs)} ${t('ساعة', 'hrs')}`;
    }
    const mins = Math.round(totalSeconds / 60);
    return `${mins} ${t('دقيقة', 'min')}`;
}

let analyticsFilter = 'week';

function setAnalyticsFilter(filter) {
    analyticsFilter = filter;
    document.querySelectorAll('.analytics-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
    });
    renderAnalytics();
}

function getAnalyticsRange() {
    const end = new Date(nowCorrected());
    const start = new Date(end);
    if (analyticsFilter === 'today') {
        start.setHours(0, 0, 0, 0);
    } else if (analyticsFilter === 'week') {
        start.setDate(start.getDate() - 7);
    } else {
        start.setDate(start.getDate() - 30);
    }
    return { start, end };
}

async function fetchAnalyticsPeriodData(startIso, endIso) {
    const { data: sessRows } = await supabaseClient
        .from('sessions')
        .select('id, station_id, amount, payment_method, started_at, ended_at, current_mode')
        .eq('business_id', business.id)
        .eq('status', 'completed')
        .gte('ended_at', startIso)
        .lte('ended_at', endIso);

    const sessions = sessRows || [];
    const sessionIds = sessions.map(s => s.id);

    let orders = [];
    if (sessionIds.length > 0) {
        const { data: orderRows } = await supabaseClient
            .from('session_orders')
            .select('item_name, quantity, unit_price, session_id')
            .in('session_id', sessionIds);
        orders = orderRows || [];
    }

    let expenses = [];
    try {
        const { data: expRows, error } = await supabaseClient
            .from('expenses')
            .select('description, amount, created_at')
            .eq('business_id', business.id)
            .gte('created_at', startIso)
            .lte('created_at', endIso);
        if (error) throw error;
        expenses = expRows || [];
    } catch (e) {
        try {
            const { data: allShifts } = await supabaseClient
                .from('shifts')
                .select('id, opened_at, closed_at')
                .eq('business_id', business.id)
                .order('opened_at', { ascending: false })
                .limit(200);
            const startMs = new Date(startIso).getTime();
            const endMs = new Date(endIso).getTime();
            const shiftIds = (allShifts || [])
                .filter(sh => {
                    const openMs = new Date(sh.opened_at).getTime();
                    const closeMs = sh.closed_at ? new Date(sh.closed_at).getTime() : Date.now();
                    return openMs <= endMs && closeMs >= startMs;
                })
                .map(sh => sh.id);
            if (shiftIds.length > 0) {
                const { data: expRows2 } = await supabaseClient.from('expenses').select('description, amount').in('shift_id', shiftIds);
                expenses = expRows2 || [];
            }
        } catch (e2) {
            console.warn('Could not load expenses for analytics period:', e2);
        }
    }

    return { sessions, orders, expenses };
}

function computeAnalytics(sessions, orders, expenses) {
    let itemsRevenue = 0;
    const itemBreakdown = {};
    orders.forEach(o => {
        const lineTotal = Number(o.quantity || 0) * Number(o.unit_price || 0);
        itemsRevenue += lineTotal;
        if (!itemBreakdown[o.item_name]) itemBreakdown[o.item_name] = { qty: 0, revenue: 0 };
        itemBreakdown[o.item_name].qty += Number(o.quantity || 0);
        itemBreakdown[o.item_name].revenue += lineTotal;
    });

    const totalRevenue = sessions.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const hoursRevenue = Math.max(0, totalRevenue - itemsRevenue);
    const totalExpenses = expenses.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const netProfit = totalRevenue - totalExpenses;

    const deviceStats = {};
    sessions.forEach(s => {
        if (!s.station_id) return;
        if (!deviceStats[s.station_id]) deviceStats[s.station_id] = { seconds: 0, revenue: 0, count: 0 };
        const startMs = s.started_at ? new Date(s.started_at).getTime() : null;
        const endMs = s.ended_at ? new Date(s.ended_at).getTime() : null;
        if (startMs && endMs && endMs > startMs) {
            deviceStats[s.station_id].seconds += (endMs - startMs) / 1000;
        }
        deviceStats[s.station_id].revenue += Number(s.amount || 0);
        deviceStats[s.station_id].count += 1;
    });

    const pmBreakdown = {};
    sessions.forEach(s => {
        if (s.payment_method) {
            const pm = paymentMethods.find(p => p.id === s.payment_method);
            const key = pm ? pm.name : s.payment_method;
            pmBreakdown[key] = (pmBreakdown[key] || 0) + Number(s.amount || 0);
        }
    });

    let singleRevenue = 0, multiRevenue = 0;
    sessions.forEach(s => {
        if (s.current_mode === 'single') singleRevenue += Number(s.amount || 0);
        else if (s.current_mode === 'multi') multiRevenue += Number(s.amount || 0);
    });

    const hourCounts = new Array(24).fill(0);
    sessions.forEach(s => {
        if (s.started_at) hourCounts[new Date(s.started_at).getHours()] += 1;
    });
    let busiestHour = null, busiestHourCount = 0;
    hourCounts.forEach((c, h) => { if (c > busiestHourCount) { busiestHourCount = c; busiestHour = h; } });

    const dayNamesAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayNamesEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayRevenue = new Array(7).fill(0);
    const dailyRevenueMap = {};
    sessions.forEach(s => {
        if (s.ended_at) {
            const d = new Date(s.ended_at);
            dayRevenue[d.getDay()] += Number(s.amount || 0);
            const key = d.toISOString().slice(0, 10);
            dailyRevenueMap[key] = (dailyRevenueMap[key] || 0) + Number(s.amount || 0);
        }
    });
    let bestDay = null, bestDayRevenue = 0;
    dayRevenue.forEach((r, i) => { if (r > bestDayRevenue) { bestDayRevenue = r; bestDay = i; } });

    let totalDurationSeconds = 0, durationCount = 0;
    sessions.forEach(s => {
        if (s.started_at && s.ended_at) {
            const secs = (new Date(s.ended_at) - new Date(s.started_at)) / 1000;
            if (secs > 0) { totalDurationSeconds += secs; durationCount++; }
        }
    });
    const avgDurationSeconds = durationCount > 0 ? totalDurationSeconds / durationCount : 0;

    return {
        totalRevenue, hoursRevenue, itemsRevenue, totalExpenses, netProfit,
        sessionsCount: sessions.length,
        avgSessionValue: sessions.length > 0 ? totalRevenue / sessions.length : 0,
        itemBreakdown, deviceStats, pmBreakdown,
        singleRevenue, multiRevenue,
        busiestHour, busiestHourCount,
        bestDay: bestDay !== null ? { ar: dayNamesAr[bestDay], en: dayNamesEn[bestDay], revenue: bestDayRevenue } : null,
        avgDurationSeconds,
        dailyRevenueMap
    };
}

function buildDailyTrendHtml(dailyRevenueMap, days) {
    const cols = [];
    const now = new Date(nowCorrected());
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        cols.push({ key, revenue: dailyRevenueMap[key] || 0, label: d.toLocaleDateString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'numeric' }) });
    }
    const maxRevenue = Math.max(1, ...cols.map(c => c.revenue));
    let html = `<div class="mini-bars">`;
    cols.forEach(c => {
        const heightPct = Math.max(3, Math.round((c.revenue / maxRevenue) * 100));
        html += `<div class="mini-bar-col" title="${money(c.revenue)}">
            <div class="mini-bar" style="height:${heightPct}%;"></div>
            <div class="mini-bar-label">${c.label}</div>
        </div>`;
    });
    html += `</div>`;
    return html;
}

async function renderAnalytics() {
    const body = document.getElementById('analyticsBody');
    if (!body || !business) return;
    body.innerHTML = `<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i>${t('جارِ التحميل...', 'Loading...')}</div>`;

    const { start, end } = getAnalyticsRange();
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    try {
        const { sessions, orders, expenses } = await fetchAnalyticsPeriodData(startIso, endIso);
        const a = computeAnalytics(sessions, orders, expenses);

        const forecastEnd = new Date(nowCorrected());
        const forecastStart = new Date(forecastEnd);
        forecastStart.setDate(forecastStart.getDate() - 28);
        const { sessions: fSessions, expenses: fExpenses } = (analyticsFilter === 'month')
            ? { sessions, expenses }
            : await fetchAnalyticsPeriodData(forecastStart.toISOString(), forecastEnd.toISOString());
        const fRevenue = fSessions.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const fExpTotal = fExpenses.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const avgDailyRevenue = fRevenue / 28;
        const avgDailyExpenses = fExpTotal / 28;
        const forecastRevenue = avgDailyRevenue * 7;
        const forecastExpenses = avgDailyExpenses * 7;
        const forecastNet = forecastRevenue - forecastExpenses;

        let html = '';

        html += `<div class="stat-grid">
            <div class="stat-card accent"><div class="stat-label">${t('إجمالي الإيراد', 'Total Revenue')}</div><div class="stat-value mono">${money(a.totalRevenue)}</div></div>
            <div class="stat-card"><div class="stat-label">${t('المصروفات', 'Expenses')}</div><div class="stat-value mono">${money(a.totalExpenses)}</div></div>
            <div class="stat-card"><div class="stat-label">${t('صافي الربح', 'Net Profit')}</div><div class="stat-value mono" style="color:var(--amber);">${money(a.netProfit)}</div></div>
            <div class="stat-card"><div class="stat-label">${t('عدد الجلسات', 'Sessions')}</div><div class="stat-value mono">${a.sessionsCount}</div></div>
        </div>`;

        html += `<div class="section-title">${t('الإيراد اليومي', 'Daily Revenue')}</div>`;
        html += `<div class="panel">${buildDailyTrendHtml(a.dailyRevenueMap, analyticsFilter === 'today' ? 1 : (analyticsFilter === 'month' ? 30 : 7))}</div>`;

        const topItems = Object.entries(a.itemBreakdown).sort((x, y) => y[1].qty - x[1].qty).slice(0, 8);
        html += `<div class="section-title">${t('الأكتر طلبًا', 'Top Selling Items')}</div>`;
        html += `<div class="panel">`;
        if (topItems.length === 0) {
            html += `<div class="empty" style="padding:16px 0;"><i class="fa-solid fa-utensils"></i>${t('لا يوجد طلبات منيو في الفترة دي', 'No menu orders in this period')}</div>`;
        } else {
            topItems.forEach(([name, d], idx) => {
                html += `<div class="list-row">
                    <div style="display:flex;align-items:center;"><span class="rank-badge">${idx + 1}</span><div><div class="row-title">${escapeHtml(name)}</div><div class="row-sub">${moneyDec(d.qty)} ${t('قطعة', 'sold')}</div></div></div>
                    <div class="row-value mono">${money(d.revenue)}</div>
                </div>`;
            });
        }
        html += `</div>`;

        const deviceEntries = Object.entries(a.deviceStats).map(([stId, d]) => {
            const st = stations.find(s => s.id === stId);
            const name = st ? (st.name || (t('جهاز ', 'Device ') + st.number)) : t('جهاز محذوف', 'Deleted device');
            return { name, ...d };
        }).sort((x, y) => y.seconds - x.seconds);

        html += `<div class="section-title">${t('استخدام الأجهزة', 'Device Usage')}</div>`;
        html += `<div class="panel">`;
        if (deviceEntries.length === 0) {
            html += `<div class="empty" style="padding:16px 0;"><i class="fa-solid fa-gamepad"></i>${t('لا يوجد بيانات في الفترة دي', 'No data in this period')}</div>`;
        } else {
            deviceEntries.forEach((d, idx) => {
                html += `<div class="list-row">
                    <div style="display:flex;align-items:center;"><span class="rank-badge">${idx + 1}</span><div><div class="row-title">${escapeHtml(d.name)}</div><div class="row-sub">${d.count} ${t('جلسة', 'sessions')} · ${formatHoursDuration(d.seconds)}</div></div></div>
                    <div class="row-value mono">${money(d.revenue)}</div>
                </div>`;
            });
        }
        html += `</div>`;

        html += `<div class="section-title">${t('تفاصيل الإيراد', 'Revenue Breakdown')}</div>`;
        html += `<div class="panel">
            <div class="list-row"><div class="row-title">${t('إيراد الساعات', 'Hours Revenue')}</div><div class="row-value mono">${money(a.hoursRevenue)}</div></div>
            <div class="list-row"><div class="row-title">${t('إيراد المنيو', 'Menu Revenue')}</div><div class="row-value mono">${money(a.itemsRevenue)}</div></div>
            <div class="list-row"><div class="row-title">${t('إيراد Single', 'Single Revenue')}</div><div class="row-value mono">${money(a.singleRevenue)}</div></div>
            <div class="list-row"><div class="row-title">${t('إيراد Multi', 'Multi Revenue')}</div><div class="row-value mono">${money(a.multiRevenue)}</div></div>
        </div>`;

        if (Object.keys(a.pmBreakdown).length > 0) {
            html += `<div class="panel" style="margin-top:8px;">`;
            html += `<div style="font-size:12px;color:var(--text-dim);font-weight:600;padding:8px 4px 2px;">${t('حسب طريقة الدفع', 'By Payment Method')}</div>`;
            Object.entries(a.pmBreakdown).forEach(([name, amt]) => {
                html += `<div class="list-row" style="padding:8px 4px;"><div class="row-title" style="font-size:13px;">${escapeHtml(name)}</div><div class="row-value mono" style="font-size:13px;">${money(amt)}</div></div>`;
            });
            html += `</div>`;
        }

        html += `<div class="section-title">${t('ملاحظات مفيدة', 'Insights')}</div>`;
        html += `<div class="panel">`;
        html += `<div class="list-row"><div class="row-title">${t('متوسط قيمة الجلسة', 'Avg Session Value')}</div><div class="row-value mono">${money(a.avgSessionValue)}</div></div>`;
        html += `<div class="list-row"><div class="row-title">${t('متوسط مدة الجلسة', 'Avg Session Duration')}</div><div class="row-value mono">${formatHoursDuration(a.avgDurationSeconds)}</div></div>`;
        if (a.busiestHour !== null) {
            html += `<div class="list-row"><div class="row-title">${t('أكتر وقت زحمة', 'Busiest Hour')}</div><div class="row-value mono">${String(a.busiestHour).padStart(2, '0')}:00</div></div>`;
        }
        if (a.bestDay) {
            html += `<div class="list-row"><div class="row-title">${t('أفضل يوم', 'Best Day')}</div><div class="row-value mono">${t(a.bestDay.ar, a.bestDay.en)}</div></div>`;
        }
        html += `</div>`;

        html += `<div class="section-title">${t('توقعات الأسبوع الجاي', 'Next Week Forecast')}</div>`;
        html += `<div class="stat-grid">
            <div class="stat-card accent"><div class="stat-label">${t('إيراد متوقع', 'Expected Revenue')}</div><div class="stat-value mono">${money(forecastRevenue)}</div></div>
            <div class="stat-card"><div class="stat-label">${t('مصروفات متوقعة', 'Expected Expenses')}</div><div class="stat-value mono">${money(forecastExpenses)}</div></div>
            <div class="stat-card" style="grid-column:1 / -1;"><div class="stat-label">${t('صافي متوقع', 'Expected Net Profit')}</div><div class="stat-value mono" style="color:var(--amber);">${money(forecastNet)}</div></div>
        </div>
        <div style="font-size:11.5px;color:var(--text-faint);padding:8px 4px 16px;">${t('التوقع تقديري ومبني على متوسط أداء آخر 4 أسابيع، مش رقم مضمون.', 'This is an estimate based on your average performance over the last 4 weeks — not a guaranteed figure.')}</div>`;

        body.innerHTML = html;
    } catch (e) {
        console.error('Error rendering analytics:', e);
        body.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>${t('حصل خطأ في تحميل التحليلات', 'Error loading analytics')}</div>`;
    }
}

// تصدير الدوال
window.setAnalyticsFilter = setAnalyticsFilter;
window.renderAnalytics = renderAnalytics;
