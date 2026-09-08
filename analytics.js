// ============================================================
// ANALYTICS MODULE (منفصل عن app.js)
// تحليلات إحصائية حقيقية: Pearson Correlation, Exponential Trend
// (Holt's Smoothing), Z-Score Anomaly Detection
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
            // ✅ فلترة الشيفتات الفاسدة (بدون opened_at صحيح أو closed_at قبل opened_at)
            // عشان ما نستوردش نفس مشكلة سجل الشيفتات (قيم صفر/سالبة) هنا
            const shiftIds = (allShifts || [])
                .filter(sh => {
                    const openMs = new Date(sh.opened_at).getTime();
                    if (!Number.isFinite(openMs)) return false;
                    const closeMs = sh.closed_at ? new Date(sh.closed_at).getTime() : Date.now();
                    if (!Number.isFinite(closeMs) || closeMs < openMs) return false;
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

// ============================================================
// STAT CORE — دوال إحصائية عامة قابلة لإعادة الاستخدام
// ============================================================

function statMean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function statStdDev(arr, meanVal) {
    if (!arr || arr.length === 0) return 0;
    const m = (meanVal !== undefined) ? meanVal : statMean(arr);
    const variance = arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length;
    return Math.sqrt(variance);
}

// معامل ارتباط بيرسون — يقيس قوة واتجاه العلاقة الخطية بين متغيرين (-1 إلى 1)
function pearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;
    const xs = x.slice(0, n), ys = y.slice(0, n);
    const meanX = statMean(xs), meanY = statMean(ys);
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - meanX, dy = ys[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    if (den === 0) return 0;
    const r = num / den;
    return Math.max(-1, Math.min(1, r));
}

// كشف الشذوذ بمعيار Z-Score حقيقي: z = (x - mean) / stdDev
// أي نقطة بمقدار |z| أكبر من الحد (افتراضياً 2، أي خارج ~95% من التوزيع الطبيعي) تعتبر شاذة
// دالة عامة تتعامل مع أي مصفوفة قيم — مش مقصورة على متغير واحد بعينه
function detectZScoreAnomalies(items, valueFn, threshold = 2) {
    const withValues = items
        .map(item => ({ item, value: valueFn(item) }))
        .filter(x => Number.isFinite(x.value));

    // أقل من 4 نقاط، الانحراف المعياري ما يبقاش موثوق كفاية — نتجاهل الكشف
    if (withValues.length < 4) return [];

    const values = withValues.map(x => x.value);
    const mean = statMean(values);
    const std = statStdDev(values, mean);
    if (std === 0) return [];

    return withValues
        .map(x => {
            const z = (x.value - mean) / std;
            return { item: x.item, value: x.value, mean, z: Math.round(z * 100) / 100, direction: z > 0 ? 'high' : 'low' };
        })
        .filter(x => Math.abs(x.z) >= threshold)
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

// اتجاه أسّي (Exponential Trend) باستخدام Holt's Linear Exponential Smoothing
// alpha: وزن تنقية المستوى (level) — beta: وزن تنقية الاتجاه (trend)
// بيرجع مستوى + اتجاه + دالة توقع forecast(h) لأي عدد أيام قدام، وقوة الاتجاه كنسبة
function exponentialTrendForecast(series, alpha = 0.4, beta = 0.25) {
    const clean = (series || []).filter(v => Number.isFinite(v));
    if (clean.length === 0) {
        return { level: 0, trend: 0, trendPct: 0, residualStd: 0, direction: 'stable', forecast: () => 0 };
    }
    if (clean.length === 1) {
        return { level: clean[0], trend: 0, trendPct: 0, residualStd: 0, direction: 'stable', forecast: () => clean[0] };
    }

    let level = clean[0];
    let trend = clean[1] - clean[0];
    const residuals = [];

    for (let i = 1; i < clean.length; i++) {
        const value = clean[i];
        const prevLevel = level;
        const predicted = prevLevel + trend;
        level = alpha * value + (1 - alpha) * predicted;
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
        residuals.push(value - predicted);
    }

    const residualStd = statStdDev(residuals);
    const avgLevel = statMean(clean) || 1;
    // نسبة الاتجاه كنسبة من متوسط السلسلة عشان نحكم على قوته بشكل نسبي مش مطلق
    const trendPct = (trend / avgLevel) * 100;

    let direction = 'stable';
    if (trendPct > 5) direction = 'increasing';
    else if (trendPct < -5) direction = 'decreasing';

    return {
        level, trend,
        trendPct: Math.round(trendPct * 10) / 10,
        residualStd,
        direction,
        forecast: (h) => Math.max(0, level + h * trend)
    };
}

// ============================================================
// تنقية البيانات (Data Sanitization)
// ⚠️ ملحوظة مهمة: سجل الشيفتات فيه مشكلة معروفة إن بعض القيم بتيجي صفر أو سالبة
// بسبب اختلال في حساب shift totals. هنا بنتعامل مع sessions/expenses مباشرة
// وبنستبعد أي سجل فاسد قبل ما يدخل في أي معادلة إحصائية، عشان النتائج ما تتلخبطش
// وعشان المشكلة دي ما تتكررش في الكود الجديد.
// ============================================================

function sanitizeAmount(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return 0;
    return v;
}

// جلسة صالحة إحصائياً: عندها بداية ونهاية حقيقيين، ومدة موجبة
function isValidSession(s) {
    if (!s || !s.started_at || !s.ended_at) return false;
    const startMs = new Date(s.started_at).getTime();
    const endMs = new Date(s.ended_at).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
    return endMs > startMs;
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

    const totalRevenue = sessions.reduce((s, r) => s + sanitizeAmount(r.amount), 0);
    const hoursRevenue = Math.max(0, totalRevenue - itemsRevenue);
    const totalExpenses = expenses.reduce((s, r) => s + sanitizeAmount(r.amount), 0);
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
        deviceStats[s.station_id].revenue += sanitizeAmount(s.amount);
        deviceStats[s.station_id].count += 1;
    });

    const pmBreakdown = {};
    sessions.forEach(s => {
        if (s.payment_method) {
            const pm = paymentMethods.find(p => p.id === s.payment_method);
            const key = pm ? pm.name : s.payment_method;
            pmBreakdown[key] = (pmBreakdown[key] || 0) + sanitizeAmount(s.amount);
        }
    });

    let singleRevenue = 0, multiRevenue = 0;
    sessions.forEach(s => {
        if (s.current_mode === 'single') singleRevenue += sanitizeAmount(s.amount);
        else if (s.current_mode === 'multi') multiRevenue += sanitizeAmount(s.amount);
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
            const amt = sanitizeAmount(s.amount);
            dayRevenue[d.getDay()] += amt;
            const key = d.toISOString().slice(0, 10);
            dailyRevenueMap[key] = (dailyRevenueMap[key] || 0) + amt;
        }
    });
    let bestDay = null, bestDayRevenue = 0;
    dayRevenue.forEach((r, i) => { if (r > bestDayRevenue) { bestDayRevenue = r; bestDay = i; } });

    // ✅ جلسات صالحة فقط (بداية/نهاية منطقية) — الأساس لأي حساب مدة أو انحراف معياري
    const validSessions = sessions.filter(isValidSession).map(s => ({
        ...s,
        durationSeconds: (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000,
        amountClean: sanitizeAmount(s.amount)
    }));
    const invalidSessionsCount = sessions.length - validSessions.length;

    const totalDurationSeconds = validSessions.reduce((s, r) => s + r.durationSeconds, 0);
    const avgDurationSeconds = validSessions.length > 0 ? totalDurationSeconds / validSessions.length : 0;

    // ============================================================
    // AI ANALYTICS — تحليلات إحصائية حقيقية
    // ============================================================

    // 1) Exponential Trend Forecast على الإيراد اليومي (آخر 28 يوم بحد أقصى)
    const sortedDates = Object.keys(dailyRevenueMap).sort();
    const last28Days = sortedDates.slice(-28);
    const dailyRevenues = last28Days.map(date => dailyRevenueMap[date] || 0);
    const trendModel = exponentialTrendForecast(dailyRevenues);

    const avgLevel = statMean(dailyRevenues) || 1;
    // الثقة: نسبة للانحراف في باقي التوقع (residuals) بالنسبة للمستوى العام — كل ما قل الانحراف، زادت الثقة
    const confidence = Math.max(55, Math.min(95, Math.round(95 - (trendModel.residualStd / avgLevel) * 100)));

    const forecast = {
        tomorrow: Math.round(trendModel.forecast(1)),
        week: Math.round(Array.from({ length: 7 }, (_, i) => trendModel.forecast(i + 1)).reduce((a, b) => a + b, 0)),
        confidence,
        direction: trendModel.direction,
        trendPct: trendModel.trendPct
    };

    // 2) Z-Score Anomaly Detection — على مدة الجلسة والإيراد اليومي (مش على البيانات الفاسدة)
    const anomalies = [];

    const durationAnomalies = detectZScoreAnomalies(validSessions, s => s.durationSeconds, 2);
    durationAnomalies.slice(0, 5).forEach(a => {
        const station = stations.find(st => st.id === a.item.station_id);
        const stationName = station ? (station.name || t('جهاز', 'Device') + ' ' + station.number) : t('جهاز محذوف', 'Deleted device');
        anomalies.push({
            type: a.direction === 'high' ? 'long_session' : 'short_session',
            station: stationName,
            duration: a.value,
            amount: a.item.amountClean,
            z: a.z
        });
    });

    const dailyRevenueEntries = last28Days.map(date => ({ date, revenue: dailyRevenueMap[date] || 0 }));
    const revenueDayAnomalies = detectZScoreAnomalies(dailyRevenueEntries, e => e.revenue, 2);
    revenueDayAnomalies.slice(0, 3).forEach(a => {
        anomalies.push({
            type: a.direction === 'high' ? 'revenue_spike' : 'revenue_drop',
            date: a.item.date,
            revenue: a.item.revenue,
            z: a.z
        });
    });

    // 3) أفضل أيام الأسبوع
    const dayRanking = [];
    const dayNames = currentLang === 'ar' ? dayNamesAr : dayNamesEn;
    for (let i = 0; i < 7; i++) {
        if (dayRevenue[i] > 0) {
            dayRanking.push({ day: i, name: dayNames[i], revenue: Math.round(dayRevenue[i] * 100) / 100 });
        }
    }
    dayRanking.sort((a, b) => b.revenue - a.revenue);

    // 4) Pearson Correlation — العوامل المؤثرة على قيمة الجلسة (مبني على جلسات صالحة فقط)
    const concurrentCountAtStart = (s) => {
        const startMs = new Date(s.started_at).getTime();
        return validSessions.filter(o => {
            const oStart = new Date(o.started_at).getTime();
            const oEnd = new Date(o.ended_at).getTime();
            return oStart <= startMs && oEnd > startMs;
        }).length;
    };

    const target = validSessions.map(s => s.amountClean);
    const features = {
        duration: {
            values: validSessions.map(s => s.durationSeconds / 60),
            label: t('مدة الجلسة (دقايق)', 'Session Duration (min)')
        },
        hourOfDay: {
            values: validSessions.map(s => new Date(s.started_at).getHours()),
            label: t('ساعة اليوم', 'Hour of Day')
        },
        dayOfWeek: {
            values: validSessions.map(s => new Date(s.started_at).getDay()),
            label: t('اليوم من الأسبوع', 'Day of Week')
        },
        concurrentLoad: {
            values: validSessions.map(concurrentCountAtStart),
            label: t('عدد الأجهزة الشغالة وقت الجلسة', 'Active Devices at Session Start')
        }
    };

    const featureImportance = {};
    Object.keys(features).forEach(key => {
        const correlation = validSessions.length >= 5 ? pearsonCorrelation(features[key].values, target) : 0;
        let level = 'ضعيف', levelEn = 'Weak';
        const abs = Math.abs(correlation);
        if (abs >= 0.7) { level = 'مرتفع جداً'; levelEn = 'Very High'; }
        else if (abs >= 0.4) { level = 'عالٍ'; levelEn = 'High'; }
        else if (abs >= 0.2) { level = 'متوسط'; levelEn = 'Medium'; }
        featureImportance[key] = {
            correlation: Math.round(correlation * 100) / 100,
            level: t(level, levelEn),
            label: features[key].label
        };
    });

    return {
        totalRevenue, hoursRevenue, itemsRevenue, totalExpenses, netProfit,
        sessionsCount: sessions.length,
        avgSessionValue: sessions.length > 0 ? totalRevenue / sessions.length : 0,
        itemBreakdown, deviceStats, pmBreakdown,
        singleRevenue, multiRevenue,
        busiestHour, busiestHourCount,
        bestDay: bestDay !== null ? { ar: dayNamesAr[bestDay], en: dayNamesEn[bestDay], revenue: bestDayRevenue } : null,
        avgDurationSeconds,
        dailyRevenueMap,
        ai: {
            forecast,
            anomalies,
            dayRanking,
            featureImportance,
            dataQuality: { invalidSessionsCount, validSessionsCount: validSessions.length }
        }
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

// ============================================================
// عرض التحليلات الذكية (AI Analytics) — تصميم مطابق للمرجع المرسل
// ============================================================
function renderAIAnalytics(aiData) {
    const container = document.getElementById('aiAnalyticsContainer');
    if (!container) return;

    if (!aiData) {
        container.innerHTML = `<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i> ${t('جارِ تحميل التحليلات الذكية...', 'Loading AI analytics...')}</div>`;
        return;
    }

    const { forecast, anomalies, dayRanking, featureImportance, dataQuality } = aiData;

    const trendEmoji = forecast.direction === 'increasing' ? '📈' : (forecast.direction === 'decreasing' ? '📉' : '➖');
    const trendText = forecast.direction === 'increasing' ? t('صاعد', 'Upward') : (forecast.direction === 'decreasing' ? t('هابط', 'Downward') : t('مستقر', 'Stable'));

    let html = '';

    // === Header ===
    html += `
        <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;margin-top:0;">
            <span>🤖 ${t('التحليلات الذكية', 'Smart Analytics')}</span>
            <span class="badge badge-teal">BETA</span>
        </div>
    `;

    // === توقعات الأيام القادمة ===
    html += `<div class="section-title" style="margin-top:4px;">📅 ${t('توقعات الأيام القادمة', 'Upcoming Days Forecast')}</div>`;
    html += `
        <div class="stat-card accent" style="margin-bottom:10px;">
            <div class="stat-label">${t('متوقع غداً', 'Tomorrow Forecast')}</div>
            <div class="stat-value mono">${money(forecast.tomorrow)} ${t('ج', 'EGP')}</div>
            <div class="ai-confidence">${t('ثقة التوقع', 'Confidence')}: ${forecast.confidence}%</div>
        </div>
        <div class="stat-card accent">
            <div class="stat-label">${t('متوقع الأسبوع', 'Week Forecast')}</div>
            <div class="stat-value mono">${money(forecast.week)} ${t('ج', 'EGP')}</div>
            <div class="ai-confidence">${t('الاتجاه', 'Trend')}: ${trendEmoji} ${trendText} (${forecast.trendPct > 0 ? '+' : ''}${forecast.trendPct}%)</div>
        </div>
        <div style="font-size:11px;color:var(--text-faint);padding:8px 4px 4px;text-align:center;">
            ${t('التوقع مبني على نموذج Exponential Smoothing (اتجاه أسّي) لآخر 28 يوم', 'Forecast based on an Exponential Smoothing (Holt) trend model over the last 28 days')}
        </div>
    `;

    // === اكتشافات غير طبيعية (Z-Score) ===
    html += `<div class="section-title">⚠️ ${t('اكتشافات غير طبيعية', 'Anomalies Detected')}</div>`;
    if (!anomalies || anomalies.length === 0) {
        html += `<div class="panel"><div class="empty" style="padding:16px 0;"><i class="fa-solid fa-circle-check"></i>${t('مفيش شذوذ ملحوظ في البيانات دلوقتي', 'Nothing anomalous detected right now')}</div></div>`;
    } else {
        html += `<div class="panel">`;
        anomalies.forEach(a => {
            let text = '', icon = '🔴';
            if (a.type === 'long_session') {
                text = `${t('جلسة طويلة جداً', 'Very long session')} (${formatHoursDuration(a.duration)}) ${t('على', 'on')} ${escapeHtml(a.station)}`;
            } else if (a.type === 'short_session') {
                text = `${t('جلسة قصيرة بشكل غير طبيعي', 'Unusually short session')} (${formatHoursDuration(a.duration)}) ${t('على', 'on')} ${escapeHtml(a.station)}`;
                icon = '🟡';
            } else if (a.type === 'revenue_spike') {
                text = `${t('يوم بإيراد أعلى من المعتاد بشكل ملحوظ', 'Day with unusually high revenue')} — ${a.date}`;
                icon = '🟢';
            } else if (a.type === 'revenue_drop') {
                text = `${t('يوم بإيراد أقل من المعتاد بشكل ملحوظ', 'Day with unusually low revenue')} — ${a.date}`;
                icon = '🟡';
            }
            html += `
                <div class="list-row" style="border-right:3px solid var(--red);padding-right:10px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span>${icon}</span>
                        <div>
                            <div class="row-title" style="font-size:13.5px;">${text}</div>
                            <div class="row-sub">Z-Score: ${a.z}</div>
                        </div>
                    </div>
                    <span class="badge badge-red">${t('شاذ', 'Anomaly')}</span>
                </div>
            `;
        });
        html += `</div>`;
    }

    // === أفضل أيام الأسبوع ===
    html += `<div class="section-title">📅 ${t('أفضل أيام الأسبوع', 'Best Days of Week')}</div>`;
    if (!dayRanking || dayRanking.length === 0) {
        html += `<div class="panel"><div class="empty" style="padding:16px 0;"><i class="fa-solid fa-calendar"></i>${t('لا يوجد بيانات كافية', 'Not enough data')}</div></div>`;
    } else {
        html += `<div class="panel">`;
        dayRanking.slice(0, 5).forEach(d => {
            html += `<div class="list-row"><div class="row-title">${d.name}</div><div class="row-value mono">${money(d.revenue)} ${t('ج', 'EGP')}</div></div>`;
        });
        html += `</div>`;
    }

    // === العوامل المؤثرة على الإيرادات (Pearson Correlation) ===
    html += `<div class="section-title">📊 ${t('العوامل المؤثرة على الإيرادات', 'Revenue Drivers')}</div>`;
    if (!featureImportance || Object.keys(featureImportance).length === 0) {
        html += `<div class="panel"><div class="empty" style="padding:16px 0;"><i class="fa-solid fa-chart-line"></i>${t('لا يوجد بيانات كافية', 'Not enough data')}</div></div>`;
    } else {
        html += `<div class="panel">`;
        const sortedFeatures = Object.entries(featureImportance).sort((a, b) => Math.abs(b[1].correlation) - Math.abs(a[1].correlation));
        sortedFeatures.forEach(([key, value]) => {
            html += `
                <div class="list-row">
                    <div><div class="row-title" style="font-size:13.5px;">${value.label}</div><div class="row-sub">Pearson r = ${value.correlation}</div></div>
                    <div class="row-value mono">${value.level}</div>
                </div>
            `;
        });
        html += `</div>`;
    }

    // === ملاحظة جودة البيانات (شفافية بخصوص أي سجلات مستبعدة) ===
    if (dataQuality && dataQuality.invalidSessionsCount > 0) {
        html += `<div style="font-size:11px;color:var(--text-faint);padding:10px 4px 0;text-align:center;">
            ${t(`تم استثناء ${dataQuality.invalidSessionsCount} سجل غير صالح (تواريخ/مدة غير منطقية) من التحليل الإحصائي`, `${dataQuality.invalidSessionsCount} record(s) with invalid dates/duration were excluded from this analysis`)}
        </div>`;
    }

    container.innerHTML = html;
}

async function renderAnalytics() {
    const body = document.getElementById('analyticsBody');
    if (!body || !business) return;
    body.innerHTML = `<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i>${t('جارِ التحميل...', 'Loading...')}</div>`;

    const aiContainer = document.getElementById('aiAnalyticsContainer');
    if (aiContainer) renderAIAnalytics(null);

    try {
        const { start, end } = getAnalyticsRange();
        const startIso = start.toISOString();
        const endIso = end.toISOString();

        const { sessions, orders, expenses } = await fetchAnalyticsPeriodData(startIso, endIso);
        const a = computeAnalytics(sessions, orders, expenses);

        // ✅ عرض التحليلات الذكية دايماً على بيانات آخر 28 يوم (بغض النظر عن الفلتر المختار)
        // عشان نماذج الاتجاه والشذوذ تحتاج سلسلة زمنية كافية للثبات الإحصائي
        if (analyticsFilter === 'month') {
            renderAIAnalytics(a.ai);
        } else {
            const trendEnd = new Date(nowCorrected());
            const trendStart = new Date(trendEnd);
            trendStart.setDate(trendStart.getDate() - 28);
            const { sessions: tSessions, orders: tOrders, expenses: tExpenses } = await fetchAnalyticsPeriodData(trendStart.toISOString(), trendEnd.toISOString());
            const aTrend = computeAnalytics(tSessions, tOrders, tExpenses);
            renderAIAnalytics(aTrend.ai);
        }

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

        body.innerHTML = html;
    } catch (e) {
        console.error('Error rendering analytics:', e);
        body.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>${t('حصل خطأ في تحميل التحليلات', 'Error loading analytics')}</div>`;
    }
}

// تصدير الدوال
window.setAnalyticsFilter = setAnalyticsFilter;
window.renderAnalytics = renderAnalytics;
window.renderAIAnalytics = renderAIAnalytics;
