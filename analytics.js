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

    // ============================================================
    // AI ANALYTICS - حسابات ذكاء اصطناعي
    // ============================================================

    // 1. حساب التوقعات (Forecast)
    const sortedDates = Object.keys(dailyRevenueMap).sort();
    const last28Days = sortedDates.slice(-28);
    const dailyRevenues = last28Days.map(date => dailyRevenueMap[date] || 0);
    const avgDailyRevenue = dailyRevenues.length > 0 
        ? dailyRevenues.reduce((a, b) => a + b, 0) / dailyRevenues.length 
        : 0;
    
    // حساب ثقة التوقع (Standard Error)
    const variance = dailyRevenues.reduce((a, b) => a + Math.pow(b - avgDailyRevenue, 2), 0) / (dailyRevenues.length || 1);
    const stdDev = Math.sqrt(variance);
    const confidenceInterval = stdDev / Math.sqrt(dailyRevenues.length || 1);
    const confidence = Math.max(60, Math.min(95, 95 - (confidenceInterval / avgDailyRevenue * 100) * 2));
    
    const forecast = {
        tomorrow: Math.round(avgDailyRevenue),
        week: Math.round(avgDailyRevenue * 7),
        confidence: Math.round(confidence),
        trend: dailyRevenues.length >= 7 ? detectTrend(dailyRevenues.slice(-7)) : 'stable'
    };

    // 2. كشف الشذوذ (Anomaly Detection)
    const durations = sessions.map(s => {
        if (s.started_at && s.ended_at) {
            return (new Date(s.ended_at) - new Date(s.started_at)) / 1000;
        }
        return 0;
    }).filter(d => d > 0);
    
    const anomalies = [];
    if (durations.length > 3) {
        const meanDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        const stdDuration = Math.sqrt(durations.reduce((a, b) => a + Math.pow(b - meanDuration, 2), 0) / durations.length);
        const threshold = meanDuration + 2 * stdDuration;
        
        sessions.forEach(s => {
            if (s.started_at && s.ended_at) {
                const duration = (new Date(s.ended_at) - new Date(s.started_at)) / 1000;
                if (duration > threshold) {
                    const station = stations.find(st => st.id === s.station_id);
                    const stationName = station ? (station.name || t('جهاز', 'Device') + ' ' + station.number) : t('جهاز محذوف', 'Deleted device');
                    anomalies.push({
                        station: stationName,
                        duration: duration,
                        threshold: threshold,
                        amount: s.amount,
                        type: 'long_session'
                    });
                }
            }
        });
    }

    // 3. أفضل أيام الأسبوع (Day Ranking)
    const dayRanking = [];
    const dayNames = currentLang === 'ar' ? dayNamesAr : dayNamesEn;
    for (let i = 0; i < 7; i++) {
        if (dayRevenue[i] > 0) {
            dayRanking.push({
                day: i,
                name: dayNames[i],
                revenue: Math.round(dayRevenue[i] * 100) / 100
            });
        }
    }
    dayRanking.sort((a, b) => b.revenue - a.revenue);

    // 4. تحليل الاتجاه (Trend Detection)
    function detectTrend(data) {
        if (data.length < 3) return 'stable';
        const firstHalf = data.slice(0, Math.floor(data.length / 2));
        const secondHalf = data.slice(Math.floor(data.length / 2));
        const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const diff = ((avgSecond - avgFirst) / avgFirst) * 100;
        if (diff > 10) return 'increasing';
        if (diff < -10) return 'decreasing';
        return 'stable';
    }

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
        // AI Analytics
        ai: {
            forecast,
            anomalies,
            dayRanking,
            trend: detectTrend(dailyRevenues.slice(-7))
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
// CHART.JS HELPERS
// ============================================================
const analyticsChartInstances = {};

function chartColor(varName, fallback) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return v || fallback;
    } catch (e) {
        return fallback;
    }
}

function chartsAvailable() {
    return typeof Chart !== 'undefined';
}

function initChartDefaults() {
    if (!chartsAvailable()) return;
    if (window.__analyticsChartDefaultsSet) return;
    Chart.defaults.font.family = "'Cairo', sans-serif";
    Chart.defaults.color = chartColor('--text-dim', '#8b95a1');
    window.__analyticsChartDefaultsSet = true;
}

function renderOrUpdateChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !chartsAvailable()) return null;
    if (analyticsChartInstances[canvasId]) {
        analyticsChartInstances[canvasId].destroy();
        delete analyticsChartInstances[canvasId];
    }
    initChartDefaults();
    const ctx = canvas.getContext('2d');
    analyticsChartInstances[canvasId] = new Chart(ctx, config);
    return analyticsChartInstances[canvasId];
}

function getTrendSeries(dailyRevenueMap, days) {
    const cols = [];
    const now = new Date(nowCorrected());
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        cols.push({
            key,
            revenue: dailyRevenueMap[key] || 0,
            label: d.toLocaleDateString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'numeric' })
        });
    }
    return cols;
}

function buildRevenueTrendChart(dailyRevenueMap, days) {
    const cols = getTrendSeries(dailyRevenueMap, days);
    const amber = chartColor('--amber', '#ff8a1e');
    const textDim = chartColor('--text-dim', '#8b95a1');
    const border = chartColor('--border', '#262c33');
    renderOrUpdateChart('chartRevenueTrend', {
        type: 'line',
        data: {
            labels: cols.map(c => c.label),
            datasets: [{
                label: t('الإيراد', 'Revenue'),
                data: cols.map(c => Math.round(c.revenue * 100) / 100),
                borderColor: amber,
                backgroundColor: 'rgba(255,138,30,0.15)',
                fill: true,
                tension: 0.35,
                pointRadius: cols.length > 20 ? 0 : 3,
                pointHoverRadius: 5,
                pointBackgroundColor: amber,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => money(ctx.parsed.y) + ' ' + t('ج', 'EGP') } }
            },
            scales: {
                x: { ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
                y: { ticks: { font: { size: 10 } }, grid: { color: border }, beginAtZero: true }
            }
        }
    });
}

function buildRevenueCompositionChart(a) {
    const teal = chartColor('--teal', '#2dd4bf');
    const amber = chartColor('--amber', '#ff8a1e');
    const textDim = chartColor('--text-dim', '#8b95a1');
    renderOrUpdateChart('chartRevenueComposition', {
        type: 'doughnut',
        data: {
            labels: [t('إيراد الساعات', 'Hours Revenue'), t('إيراد المنيو', 'Menu Revenue')],
            datasets: [{
                data: [Math.round(a.hoursRevenue * 100) / 100, Math.round(a.itemsRevenue * 100) / 100],
                backgroundColor: [amber, teal],
                borderColor: chartColor('--surface', '#14181d'),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12, boxWidth: 10 } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${money(ctx.parsed)} ${t('ج', 'EGP')}` } }
            }
        }
    });
}

function buildDeviceUsageChart(deviceEntries) {
    const top = deviceEntries.slice(0, 6);
    const teal = chartColor('--teal', '#2dd4bf');
    const border = chartColor('--border', '#262c33');
    renderOrUpdateChart('chartDeviceUsage', {
        type: 'bar',
        data: {
            labels: top.map(d => d.name),
            datasets: [{
                label: t('الإيراد', 'Revenue'),
                data: top.map(d => Math.round(d.revenue * 100) / 100),
                backgroundColor: teal,
                borderRadius: 6,
                maxBarThickness: 22
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => money(ctx.parsed.x) + ' ' + t('ج', 'EGP') } }
            },
            scales: {
                x: { ticks: { font: { size: 10 } }, grid: { color: border }, beginAtZero: true },
                y: { ticks: { font: { size: 11 } }, grid: { display: false } }
            }
        }
    });
}

function buildPaymentMethodChart(pmBreakdown) {
    const palette = [
        chartColor('--amber', '#ff8a1e'),
        chartColor('--teal', '#2dd4bf'),
        chartColor('--purple', '#a855f7'),
        chartColor('--red', '#ef4444'),
        '#3b82f6', '#eab308'
    ];
    const entries = Object.entries(pmBreakdown);
    renderOrUpdateChart('chartPaymentMethods', {
        type: 'doughnut',
        data: {
            labels: entries.map(([k]) => k),
            datasets: [{
                data: entries.map(([, v]) => Math.round(v * 100) / 100),
                backgroundColor: entries.map((_, i) => palette[i % palette.length]),
                borderColor: chartColor('--surface', '#14181d'),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12, boxWidth: 10 } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${money(ctx.parsed)} ${t('ج', 'EGP')}` } }
            }
        }
    });
}

function buildTopItemsChart(topItems) {
    const amber = chartColor('--amber', '#ff8a1e');
    const border = chartColor('--border', '#262c33');
    renderOrUpdateChart('chartTopItems', {
        type: 'bar',
        data: {
            labels: topItems.map(([name]) => name),
            datasets: [{
                data: topItems.map(([, d]) => Math.round(d.revenue * 100) / 100),
                backgroundColor: amber,
                borderRadius: 6,
                maxBarThickness: 20
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => money(ctx.parsed.x) + ' ' + t('ج', 'EGP') } }
            },
            scales: {
                x: { ticks: { font: { size: 10 } }, grid: { color: border }, beginAtZero: true },
                y: { ticks: { font: { size: 11 } }, grid: { display: false } }
            }
        }
    });
}

// ============================================================
// SMART INSIGHTS (rule-based AI-style recommendations)
// ============================================================
function generateSmartInsights(a) {
    const insights = [];
    if (!a || !a.ai) return insights;
    const { forecast, anomalies, dayRanking } = a.ai;
    const trend = a.ai.trend;

    if (trend === 'increasing') {
        insights.push({ icon: '📈', type: 'positive', text: t('الإيراد في اتجاه صاعد خلال آخر فترة، استمر على نفس الوتيرة.', 'Revenue has been trending upward recently — keep up the momentum.') });
    } else if (trend === 'decreasing') {
        insights.push({ icon: '📉', type: 'warning', text: t('الإيراد في اتجاه هابط خلال آخر فترة، يستاهل تراجع الأسعار والزحمة والمنافسة.', 'Revenue has been trending downward recently — worth reviewing pricing, traffic, or competition.') });
    } else {
        insights.push({ icon: '➖', type: 'info', text: t('الإيراد مستقر نسبيًا خلال آخر فترة من غير تغيرات كبيرة.', 'Revenue has been relatively stable recently, with no major swings.') });
    }

    if (forecast) {
        if (forecast.confidence < 70) {
            insights.push({ icon: '⚠️', type: 'warning', text: t(`التوقعات مش مستقرة قوي (ثقة ${forecast.confidence}%) بسبب تفاوت الإيراد اليومي.`, `Forecasts are less stable (${forecast.confidence}% confidence) due to daily revenue variance.`) });
        } else {
            insights.push({ icon: '🎯', type: 'positive', text: t(`أداءك مستقر بشكل كويس، ثقة التوقع ${forecast.confidence}%.`, `Your performance is fairly consistent — forecast confidence is ${forecast.confidence}%.`) });
        }
    }

    if (dayRanking && dayRanking.length > 0) {
        const best = dayRanking[0];
        insights.push({ icon: '📅', type: 'info', text: t(`يوم ${best.name} بيحقق أعلى إيراد (${money(best.revenue)} ج) — جهز فريق وأجهزة كفاية فيه.`, `${best.name} brings in the highest revenue (${money(best.revenue)} EGP) — make sure you're staffed up for it.`) });
    }

    if (a.busiestHour !== null && a.busiestHour !== undefined) {
        insights.push({ icon: '⏰', type: 'info', text: t(`أكتر وقت زحمة الساعة ${String(a.busiestHour).padStart(2, '0')}:00 — خلي بالك من التغطية وقتها.`, `Busiest hour is ${String(a.busiestHour).padStart(2, '0')}:00 — make sure coverage is solid then.`) });
    }

    if (anomalies && anomalies.length > 0) {
        insights.push({ icon: '🔴', type: 'warning', text: t(`فيه ${anomalies.length} جلسة/جلسات طويلة بشكل غير طبيعي، تأكد إن مفيش جلسات اتنسيت مفتوحة.`, `${anomalies.length} unusually long session(s) detected — check nothing was left running by mistake.`) });
    }

    const deviceList = Object.values(a.deviceStats || {});
    if (deviceList.length > 1) {
        const sorted = [...deviceList].sort((x, y) => y.revenue - x.revenue);
        const top = sorted[0], bottom = sorted[sorted.length - 1];
        if (top.revenue > 0 && top.revenue > bottom.revenue * 2.5) {
            insights.push({ icon: '🎮', type: 'info', text: t('في فرق كبير في الاستخدام بين الأجهزة — بعض الأجهزة شغالة أكتر بكتير من غيرها.', 'There\'s a big usage gap between devices — some are working far more than others.') });
        }
    }

    const pmEntries = Object.entries(a.pmBreakdown || {});
    if (pmEntries.length > 0) {
        const totalPm = pmEntries.reduce((s, [, v]) => s + v, 0);
        const sortedPm = [...pmEntries].sort((x, y) => y[1] - x[1]);
        const [topPmName, topPmVal] = sortedPm[0];
        const pct = totalPm > 0 ? Math.round((topPmVal / totalPm) * 100) : 0;
        if (pct >= 80 && pmEntries.length > 1) {
            insights.push({ icon: '💳', type: 'info', text: t(`أغلب مدفوعاتك (${pct}%) بتتم بطريقة "${topPmName}" — فكر تنوّع طرق الدفع.`, `${pct}% of your payments come through "${topPmName}" — consider diversifying payment methods.`) });
        }
    }

    if (a.totalRevenue > 0) {
        const menuShare = a.itemsRevenue / a.totalRevenue;
        if (menuShare < 0.1) {
            insights.push({ icon: '🍔', type: 'warning', text: t('إيراد المنيو ضعيف نسبة للإيراد الكلي — جرب عروض تشجع العملاء يطلبوا أكتر.', 'Menu revenue is a small share of the total — try promotions to encourage more orders.') });
        } else if (menuShare > 0.4) {
            insights.push({ icon: '💪', type: 'positive', text: t('المنيو بقى مصدر دخل قوي جنب إيراد الأجهزة.', 'The menu has become a strong revenue source alongside device time.') });
        }
    }

    return insights;
}

function buildAIInsightsHtml(a) {
    const { forecast, anomalies, dayRanking, trend } = a.ai;
    const insights = generateSmartInsights(a);

    const trendEmoji = trend === 'increasing' ? '📈' : (trend === 'decreasing' ? '📉' : '➖');
    const trendText = trend === 'increasing' ? t('صاعد', 'Upward') : (trend === 'decreasing' ? t('هابط', 'Downward') : t('مستقر', 'Stable'));

    let html = '';

    html += `<div class="section-title" style="margin-top:20px;display:flex;align-items:center;gap:6px;">🤖 ${t('تحليل ذكي وتوصيات', 'Smart Analysis & Recommendations')}<span class="badge badge-teal" style="font-size:9px;padding:2px 10px;">AI</span></div>`;
    if (insights.length > 0) {
        insights.forEach(ins => {
            html += `<div class="insight-card ${ins.type}"><span class="insight-icon">${ins.icon}</span><span>${escapeHtml(ins.text)}</span></div>`;
        });
    } else {
        html += `<div class="empty" style="padding:16px 0;"><i class="fa-solid fa-robot"></i>${t('لسه مفيش بيانات كافية لتوليد توصيات', 'Not enough data yet to generate recommendations')}</div>`;
    }

    html += `<div class="ai-analytics-grid" style="margin-top:4px;">
        <div class="stat-card accent">
            <div class="stat-label">📊 ${t('متوقع غداً', 'Tomorrow Forecast')}</div>
            <div class="stat-value mono">${money(forecast.tomorrow)} ${t('ج', 'EGP')}</div>
            <div class="ai-confidence">${t('ثقة', 'Confidence')}: ${forecast.confidence}%</div>
        </div>
        <div class="stat-card accent">
            <div class="stat-label">📅 ${t('متوقع الأسبوع', 'Week Forecast')}</div>
            <div class="stat-value mono">${money(forecast.week)} ${t('ج', 'EGP')}</div>
            <div class="ai-confidence">${t('اتجاه', 'Trend')}: ${trendEmoji} ${trendText}</div>
        </div>
    </div>`;

    if (anomalies && anomalies.length > 0) {
        html += `<div class="section-title" style="margin-top:16px;">⚠️ ${t('اكتشافات غير طبيعية', 'Anomalies Detected')}</div><div class="panel">`;
        anomalies.forEach(an => {
            html += `<div class="ai-anomaly-item">
                <div><span class="anomaly-icon">🔴</span><span class="anomaly-text">${t('جلسة طويلة جداً', 'Very long session')} (${formatHoursDuration(an.duration)}) ${t('على', 'on')} ${escapeHtml(an.station)}</span></div>
                <span class="anomaly-badge">${money(an.amount)} ${t('ج', 'EGP')}</span>
            </div>`;
        });
        html += `</div>`;
    }

    if (dayRanking && dayRanking.length > 0) {
        html += `<div class="section-title" style="margin-top:16px;">📅 ${t('أفضل أيام الأسبوع', 'Best Days of Week')}</div><div class="panel"><div class="ai-day-ranking">`;
        const maxDayRevenue = dayRanking[0]?.revenue || 1;
        dayRanking.slice(0, 5).forEach(d => {
            const pct = Math.max(5, (d.revenue / maxDayRevenue) * 100);
            html += `<div class="ai-day-item"><span class="day-name">${escapeHtml(d.name)}</span><div class="day-bar"><div class="bar-fill" style="width:${pct}%;"></div></div><span class="day-value">${money(d.revenue)} ${t('ج', 'EGP')}</span></div>`;
        });
        html += `</div></div>`;
    }

    return html;
}

// ============================================================
// DASHBOARD — SIMPLE AI SUMMARY
// ============================================================
async function refreshDashboardSummary() {
    const container = document.getElementById('aiAnalyticsContainer');
    if (!container || !business) return;
    try {
        const end = new Date(nowCorrected());
        const start = new Date(end);
        start.setDate(start.getDate() - 28);
        const { sessions, orders, expenses } = await fetchAnalyticsPeriodData(start.toISOString(), end.toISOString());
        const a = computeAnalytics(sessions, orders, expenses);

        const now = new Date(nowCorrected());
        let curWeek = 0, prevWeek = 0;
        for (let i = 0; i < 7; i++) {
            const d = new Date(now); d.setDate(d.getDate() - i);
            curWeek += a.dailyRevenueMap[d.toISOString().slice(0, 10)] || 0;
        }
        for (let i = 7; i < 14; i++) {
            const d = new Date(now); d.setDate(d.getDate() - i);
            prevWeek += a.dailyRevenueMap[d.toISOString().slice(0, 10)] || 0;
        }
        const growthPct = prevWeek > 0 ? Math.round(((curWeek - prevWeek) / prevWeek) * 100) : (curWeek > 0 ? 100 : 0);

        renderDashboardAISummary(a, curWeek, growthPct);
    } catch (e) {
        console.warn('Dashboard AI summary failed:', e);
        if (container) {
            container.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>${t('تعذر تحميل الملخص الذكي', 'Could not load smart summary')}</div>`;
        }
    }
}

function renderDashboardAISummary(a, curWeek, growthPct) {
    const container = document.getElementById('aiAnalyticsContainer');
    if (!container) return;
    if (!a || !a.ai) {
        container.innerHTML = `<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i> ${t('جارِ تحميل الملخص الذكي...', 'Loading smart summary...')}</div>`;
        return;
    }

    const { forecast } = a.ai;
    const trendClass = growthPct > 3 ? 'up' : (growthPct < -3 ? 'down' : 'stable');
    const trendIcon = trendClass === 'up' ? '▲' : (trendClass === 'down' ? '▼' : '■');
    const trendLabelText = trendClass === 'up'
        ? t('أعلى من الأسبوع اللي فات', 'higher than last week')
        : (trendClass === 'down' ? t('أقل من الأسبوع اللي فات', 'lower than last week') : t('زي الأسبوع اللي فات تقريبًا', 'similar to last week'));

    const insights = generateSmartInsights(a);
    const headline = insights.length > 0 ? insights[0].text : t('لسه مفيش بيانات كافية لعرض ملخص ذكي.', 'Not enough data yet for a smart summary.');

    container.innerHTML = `
        <div class="ai-summary-card">
            <div class="ai-summary-top">
                <span class="ai-summary-badge">🤖 AI</span>
                <span class="trend-pill ${trendClass}">${trendIcon} ${Math.abs(growthPct)}% ${trendLabelText}</span>
            </div>
            <div class="ai-summary-headline">${escapeHtml(headline)}</div>
            <div class="ai-summary-row">
                <div class="ai-summary-metric">
                    <div class="lbl">${t('إيراد آخر 7 أيام', 'Last 7 Days')}</div>
                    <div class="val mono">${money(curWeek)} ${t('ج', 'EGP')}</div>
                </div>
                <div class="ai-summary-metric" style="text-align:end;">
                    <div class="lbl">${t('متوقع غداً', 'Tomorrow Forecast')}</div>
                    <div class="val mono">${money(forecast.tomorrow)} ${t('ج', 'EGP')}</div>
                </div>
            </div>
            <div class="ai-summary-link" onclick="navigateTo('view-analytics')">
                <i class="fa-solid fa-chart-pie"></i> ${t('عرض التحليلات الكاملة', 'View Full Analytics')}
            </div>
        </div>
    `;
}

// ============================================================
// دالة تحديث الملخص الذكي بشكل دوري (Dashboard)
// ============================================================
let aiAnalyticsInterval = null;

function startAIAnalyticsUpdater() {
    if (aiAnalyticsInterval) clearInterval(aiAnalyticsInterval);
    refreshDashboardSummary();
    aiAnalyticsInterval = setInterval(() => {
        const dashEl = document.getElementById('view-dashboard');
        if (business && dashEl && dashEl.classList.contains('active')) {
            refreshDashboardSummary();
        }
    }, 60000); // تحديث كل دقيقة
}

// ============================================================
// صفحة التحليلات الكاملة
// ============================================================
async function renderAnalytics() {
    const body = document.getElementById('analyticsBody');
    if (!body || !business) return;
    body.innerHTML = `<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i>${t('جارِ التحميل...', 'Loading...')}</div>`;

    try {
        const { start, end } = getAnalyticsRange();
        const startIso = start.toISOString();
        const endIso = end.toISOString();
        const trendDays = analyticsFilter === 'today' ? 1 : (analyticsFilter === 'month' ? 30 : 7);

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

        const useCharts = chartsAvailable();
        let html = '';

        // ---- KPIs ----
        html += `<div class="stat-grid">
            <div class="stat-card accent"><div class="stat-label">${t('إجمالي الإيراد', 'Total Revenue')}</div><div class="stat-value mono">${money(a.totalRevenue)}</div></div>
            <div class="stat-card"><div class="stat-label">${t('المصروفات', 'Expenses')}</div><div class="stat-value mono">${money(a.totalExpenses)}</div></div>
            <div class="stat-card"><div class="stat-label">${t('صافي الربح', 'Net Profit')}</div><div class="stat-value mono" style="color:var(--amber);">${money(a.netProfit)}</div></div>
            <div class="stat-card"><div class="stat-label">${t('عدد الجلسات', 'Sessions')}</div><div class="stat-value mono">${a.sessionsCount}</div></div>
        </div>`;

        // ---- Smart AI insights ----
        html += buildAIInsightsHtml(a);

        // ---- Revenue trend chart ----
        html += `<div class="section-title" style="margin-top:20px;">${t('نمو الإيراد', 'Revenue Growth')}</div>`;
        if (useCharts) {
            html += `<div class="chart-card"><div class="chart-canvas-wrap"><canvas id="chartRevenueTrend"></canvas></div></div>`;
        } else {
            html += `<div class="panel">${buildDailyTrendHtml(a.dailyRevenueMap, trendDays)}</div>`;
        }

        // ---- Revenue composition ----
        if (useCharts && a.totalRevenue > 0) {
            html += `<div class="section-title" style="margin-top:20px;">${t('توزيع الإيراد', 'Revenue Split')}</div>`;
            html += `<div class="chart-card"><div class="chart-canvas-wrap sm"><canvas id="chartRevenueComposition"></canvas></div></div>`;
        }

        // ---- Top selling items ----
        const topItems = Object.entries(a.itemBreakdown).sort((x, y) => y[1].qty - x[1].qty).slice(0, 8);
        html += `<div class="section-title" style="margin-top:20px;">${t('الأكتر طلبًا', 'Top Selling Items')}</div>`;
        if (topItems.length === 0) {
            html += `<div class="panel"><div class="empty" style="padding:16px 0;"><i class="fa-solid fa-utensils"></i>${t('لا يوجد طلبات منيو في الفترة دي', 'No menu orders in this period')}</div></div>`;
        } else {
            if (useCharts) {
                html += `<div class="chart-card"><div class="chart-canvas-wrap"><canvas id="chartTopItems"></canvas></div></div>`;
            }
            html += `<div class="panel" style="margin-top:8px;">`;
            topItems.forEach(([name, d], idx) => {
                html += `<div class="list-row">
                    <div style="display:flex;align-items:center;"><span class="rank-badge">${idx + 1}</span><div><div class="row-title">${escapeHtml(name)}</div><div class="row-sub">${moneyDec(d.qty)} ${t('قطعة', 'sold')}</div></div></div>
                    <div class="row-value mono">${money(d.revenue)}</div>
                </div>`;
            });
            html += `</div>`;
        }

        // ---- Device usage ----
        const deviceEntries = Object.entries(a.deviceStats).map(([stId, d]) => {
            const st = stations.find(s => s.id === stId);
            const name = st ? (st.name || (t('جهاز ', 'Device ') + st.number)) : t('جهاز محذوف', 'Deleted device');
            return { name, ...d };
        }).sort((x, y) => y.seconds - x.seconds);

        html += `<div class="section-title" style="margin-top:20px;">${t('استخدام الأجهزة', 'Device Usage')}</div>`;
        if (deviceEntries.length === 0) {
            html += `<div class="panel"><div class="empty" style="padding:16px 0;"><i class="fa-solid fa-gamepad"></i>${t('لا يوجد بيانات في الفترة دي', 'No data in this period')}</div></div>`;
        } else {
            if (useCharts) {
                html += `<div class="chart-card"><div class="chart-canvas-wrap"><canvas id="chartDeviceUsage"></canvas></div></div>`;
            }
            html += `<div class="panel" style="margin-top:8px;">`;
            deviceEntries.forEach((d, idx) => {
                html += `<div class="list-row">
                    <div style="display:flex;align-items:center;"><span class="rank-badge">${idx + 1}</span><div><div class="row-title">${escapeHtml(d.name)}</div><div class="row-sub">${d.count} ${t('جلسة', 'sessions')} · ${formatHoursDuration(d.seconds)}</div></div></div>
                    <div class="row-value mono">${money(d.revenue)}</div>
                </div>`;
            });
            html += `</div>`;
        }

        // ---- Revenue breakdown ----
        html += `<div class="section-title" style="margin-top:20px;">${t('تفاصيل الإيراد', 'Revenue Breakdown')}</div>`;
        html += `<div class="panel">
            <div class="list-row"><div class="row-title">${t('إيراد الساعات', 'Hours Revenue')}</div><div class="row-value mono">${money(a.hoursRevenue)}</div></div>
            <div class="list-row"><div class="row-title">${t('إيراد المنيو', 'Menu Revenue')}</div><div class="row-value mono">${money(a.itemsRevenue)}</div></div>
            <div class="list-row"><div class="row-title">${t('إيراد Single', 'Single Revenue')}</div><div class="row-value mono">${money(a.singleRevenue)}</div></div>
            <div class="list-row"><div class="row-title">${t('إيراد Multi', 'Multi Revenue')}</div><div class="row-value mono">${money(a.multiRevenue)}</div></div>
        </div>`;

        // ---- Payment methods ----
        if (Object.keys(a.pmBreakdown).length > 0) {
            html += `<div class="section-title" style="margin-top:20px;">${t('حسب طريقة الدفع', 'By Payment Method')}</div>`;
            if (useCharts && Object.keys(a.pmBreakdown).length > 1) {
                html += `<div class="chart-card"><div class="chart-canvas-wrap sm"><canvas id="chartPaymentMethods"></canvas></div></div>`;
            }
            html += `<div class="panel" style="margin-top:8px;">`;
            Object.entries(a.pmBreakdown).forEach(([name, amt]) => {
                html += `<div class="list-row" style="padding:8px 4px;"><div class="row-title" style="font-size:13px;">${escapeHtml(name)}</div><div class="row-value mono" style="font-size:13px;">${money(amt)}</div></div>`;
            });
            html += `</div>`;
        }

        // ---- Useful insights ----
        html += `<div class="section-title" style="margin-top:20px;">${t('ملاحظات مفيدة', 'Insights')}</div>`;
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

        // ---- Forecast ----
        html += `<div class="section-title" style="margin-top:20px;">${t('توقعات الأسبوع الجاي', 'Next Week Forecast')}</div>`;
        html += `<div class="stat-grid">
            <div class="stat-card accent"><div class="stat-label">${t('إيراد متوقع', 'Expected Revenue')}</div><div class="stat-value mono">${money(forecastRevenue)}</div></div>
            <div class="stat-card"><div class="stat-label">${t('مصروفات متوقعة', 'Expected Expenses')}</div><div class="stat-value mono">${money(forecastExpenses)}</div></div>
            <div class="stat-card" style="grid-column:1 / -1;"><div class="stat-label">${t('صافي متوقع', 'Expected Net Profit')}</div><div class="stat-value mono" style="color:var(--amber);">${money(forecastNet)}</div></div>
        </div>
        <div style="font-size:11.5px;color:var(--text-faint);padding:8px 4px 16px;">${t('التوقع تقديري ومبني على متوسط أداء آخر 4 أسابيع، مش رقم مضمون.', 'This is an estimate based on your average performance over the last 4 weeks — not a guaranteed figure.')}</div>`;

        body.innerHTML = html;

        // ---- Draw charts now that the canvases exist in the DOM ----
        if (useCharts) {
            buildRevenueTrendChart(a.dailyRevenueMap, trendDays);
            if (a.totalRevenue > 0) buildRevenueCompositionChart(a);
            if (topItems.length > 0) buildTopItemsChart(topItems);
            if (deviceEntries.length > 0) buildDeviceUsageChart(deviceEntries);
            if (Object.keys(a.pmBreakdown).length > 1) buildPaymentMethodChart(a.pmBreakdown);
        }
    } catch (e) {
        console.error('Error rendering analytics:', e);
        body.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>${t('حصل خطأ في تحميل التحليلات', 'Error loading analytics')}</div>`;
    }
}

// ============================================================
// تصدير الدوال
// ============================================================
window.setAnalyticsFilter = setAnalyticsFilter;
window.renderAnalytics = renderAnalytics;
window.startAIAnalyticsUpdater = startAIAnalyticsUpdater;
window.refreshDashboardSummary = refreshDashboardSummary;
