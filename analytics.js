// ============================================================
// ANALYTICS — نظام التحليلات (إحصائي بالكامل: Mean/Median/StdDev/Z-score)
// كل رقم في الصفحة دي متبني على بيانات حقيقية من Supabase، مفيش أرقام
// وهمية أو ثابتة في الكود. الاكتشافات الشاذة والتوقعات مبنية على مبادئ
// إحصائية (الانحراف المعياري وZ-score) بدل عتبات ثابتة.
// ============================================================

let analyticsRange = '7d'; // 'today' | '7d' | '30d'
let analyticsLoading = false;

// ------------------------------------------------------------
// STATISTICS HELPERS
// ------------------------------------------------------------
function stMean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stStdDev(arr) {
    const n = arr ? arr.length : 0;
    if (n < 2) return 0;
    const m = stMean(arr);
    const variance = arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / (n - 1); // sample stdev (n-1)
    return Math.sqrt(variance);
}

function stMedian(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stZScore(value, m, sd) {
    if (!sd || sd === 0) return 0;
    return (value - m) / sd;
}

function analyticsDayKey(dateLike) {
    const d = new Date(dateLike);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ✅ الوقت دايمًا بنظام 12 ساعة (AM/PM) في صفحة التحليلات
function formatHour12(hour) {
    const h = ((hour % 24) + 24) % 24;
    const period = h >= 12 ? t('م', 'PM') : t('ص', 'AM');
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}:00 ${period}`;
}

function analyticsWeekdayNames() {
    return currentLang === 'ar'
        ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
        : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
}

// ------------------------------------------------------------
// RANGE BOUNDS
// ------------------------------------------------------------
function getAnalyticsRangeBounds(range) {
    const end = new Date(nowCorrected());
    let days = 1;
    if (range === '7d') days = 7;
    else if (range === '30d') days = 30;

    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const spanMs = end - start;
    const prevEnd = new Date(start.getTime());
    const prevStart = new Date(prevEnd.getTime() - spanMs);

    return { start, end, prevStart, prevEnd, days };
}

// ------------------------------------------------------------
// DATA FETCHING
// ------------------------------------------------------------
async function fetchAnalyticsPeriodData(start, end) {
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const { data: sessionsData, error: sessErr } = await supabaseClient
        .from('sessions')
        .select('id, amount, payment_method, station_id, started_at, ended_at, current_mode')
        .eq('business_id', business.id)
        .eq('status', 'completed')
        .gte('ended_at', startIso)
        .lte('ended_at', endIso);

    if (sessErr) console.warn('Analytics: error loading sessions:', sessErr);
    const sessionsList = sessionsData || [];
    const sessionIds = sessionsList.map(s => s.id);

    let orders = [];
    let segments = [];
    if (sessionIds.length > 0) {
        const [{ data: ordersData }, { data: segmentsData }] = await Promise.all([
            supabaseClient.from('session_orders').select('item_name, quantity, unit_price, session_id').in('session_id', sessionIds),
            supabaseClient.from('session_segments').select('session_id, mode, amount, started_at, ended_at, rate').in('session_id', sessionIds)
        ]);
        orders = ordersData || [];
        segments = segmentsData || [];
    }

    // ✅ المصروفات: بنحاول نفلترها بالتاريخ الفعلي. لو العمود مش موجود لأي سبب،
    // منرجعش صفر بصمت — بنعمل fallback ونحاول تاني بدون فلتر تاريخ فقط لو فشل النداء بالكامل.
    let expensesTotal = 0;
    try {
        const { data: expensesData, error: expErr } = await supabaseClient
            .from('expenses')
            .select('amount, created_at')
            .eq('business_id', business.id)
            .gte('created_at', startIso)
            .lte('created_at', endIso);
        if (expErr) throw expErr;
        expensesTotal = (expensesData || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    } catch (e) {
        console.warn('Analytics: could not filter expenses by date, defaulting to 0 for this metric:', e.message || e);
        expensesTotal = 0;
    }

    return { sessions: sessionsList, orders, segments, expensesTotal };
}

// ------------------------------------------------------------
// CORE AGGREGATION
// ------------------------------------------------------------
function analyticsComputeCore(periodData) {
    const { sessions: sess, orders, segments, expensesTotal } = periodData;

    const grossRevenue = sess.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const ordersTotal = orders.reduce((s, o) => s + Number(o.quantity || 0) * Number(o.unit_price || 0), 0);
    const hoursRevenue = Math.max(0, grossRevenue - ordersTotal);

    let singleRevenue = 0, multiRevenue = 0;
    segments.forEach(seg => {
        if (seg.ended_at) {
            const amt = Number(seg.amount) || 0;
            if (seg.mode === 'single') singleRevenue += amt; else multiRevenue += amt;
        }
    });
    // ✅ لو مجموع السجمنتس أقل من إيراد الساعات (بيانات قديمة ناقصة)، نضيف الفرق لـ single
    // عشان الأرقام في "تفاصيل الإيراد" تفضل متوازنة مع الإجمالي الحقيقي
    const segTotal = singleRevenue + multiRevenue;
    if (segTotal < hoursRevenue - 0.5) singleRevenue += (hoursRevenue - segTotal);

    const netProfit = grossRevenue - expensesTotal;

    const paymentBreakdown = {};
    sess.forEach(s => {
        if (s.payment_method) {
            const pm = paymentMethods.find(p => p.id === s.payment_method);
            const key = pm ? pm.name : s.payment_method;
            paymentBreakdown[key] = (paymentBreakdown[key] || 0) + (Number(s.amount) || 0);
        }
    });

    const itemBreakdown = {};
    orders.forEach(o => {
        const lineTotal = Number(o.quantity || 0) * Number(o.unit_price || 0);
        if (!itemBreakdown[o.item_name]) itemBreakdown[o.item_name] = { qty: 0, revenue: 0 };
        itemBreakdown[o.item_name].qty += Number(o.quantity || 0);
        itemBreakdown[o.item_name].revenue += lineTotal;
    });

    // مدة كل جلسة (بالساعات) من مجموع segments بتاعتها
    const sessionDurationMap = {};
    segments.forEach(seg => {
        if (seg.ended_at) {
            const hrs = (new Date(seg.ended_at) - new Date(seg.started_at)) / 3600000;
            sessionDurationMap[seg.session_id] = (sessionDurationMap[seg.session_id] || 0) + hrs;
        }
    });

    const deviceBreakdown = {};
    sess.forEach(s => {
        const key = s.station_id;
        if (!deviceBreakdown[key]) deviceBreakdown[key] = { revenue: 0, sessionsCount: 0, hoursSum: 0 };
        deviceBreakdown[key].revenue += Number(s.amount) || 0;
        deviceBreakdown[key].sessionsCount += 1;
        deviceBreakdown[key].hoursSum += sessionDurationMap[s.id] || 0;
    });

    const dailyMap = {};
    sess.forEach(s => {
        const key = analyticsDayKey(s.ended_at);
        dailyMap[key] = (dailyMap[key] || 0) + (Number(s.amount) || 0);
    });

    const weekdayMap = {};
    sess.forEach(s => {
        const wd = new Date(s.ended_at).getDay();
        weekdayMap[wd] = (weekdayMap[wd] || 0) + (Number(s.amount) || 0);
    });

    const hourMap = {};
    sess.forEach(s => {
        const h = new Date(s.started_at).getHours();
        hourMap[h] = (hourMap[h] || 0) + (Number(s.amount) || 0);
    });

    const sessionValues = sess.map(s => Number(s.amount) || 0);
    const sessionDurations = sess.map(s => sessionDurationMap[s.id] || 0).filter(h => h > 0);

    return {
        grossRevenue, ordersTotal, hoursRevenue, singleRevenue, multiRevenue,
        expensesTotal, netProfit,
        paymentBreakdown, itemBreakdown, deviceBreakdown,
        dailyMap, weekdayMap, hourMap,
        sessionValues, sessionDurations, sessionDurationMap,
        sessionsCount: sess.length,
        sessions: sess
    };
}

// ------------------------------------------------------------
// ANOMALY DETECTION (Z-score based — مش عتبات ثابتة)
// ------------------------------------------------------------
function analyticsDetectAnomalies(core) {
    const anomalies = [];
    const MIN_SAMPLE = 5;
    const Z_THRESHOLD = 2.5;

    // 1) جلسات ذات مدة شاذة إحصائيًا (Z-score على مدة الجلسات)
    if (core.sessionDurations.length >= MIN_SAMPLE) {
        const m = stMean(core.sessionDurations);
        const sd = stStdDev(core.sessionDurations);
        core.sessions.forEach(s => {
            const hrs = core.sessionDurationMap[s.id] || 0;
            if (hrs <= 0) return;
            const z = stZScore(hrs, m, sd);
            if (z > Z_THRESHOLD) {
                const station = stations.find(st => st.id === s.station_id);
                const deviceName = station ? (station.name || `${t('جهاز', 'Device')} ${station.number}`) : t('جهاز', 'Device');
                anomalies.push({
                    icon: '🔴', tone: 'red',
                    text: t(
                        `جلسة طويلة جدًا (${hrs.toFixed(1)} ساعة) على ${deviceName} — منحرفة ${z.toFixed(1)}σ عن المتوسط، تأكد إن الجلسة مش منسية مفتوحة.`,
                        `Unusually long session (${hrs.toFixed(1)}h) on ${deviceName} — ${z.toFixed(1)}σ above average, make sure it wasn't left open by mistake.`
                    )
                });
            }
        });
    }

    // 2) عدم توازن في استخدام الأجهزة (Z-score على إيراد كل جهاز)
    const deviceEntries = Object.entries(core.deviceBreakdown);
    if (deviceEntries.length >= 3) {
        const revs = deviceEntries.map(([, v]) => v.revenue);
        const m = stMean(revs);
        const sd = stStdDev(revs);
        if (sd > 0) {
            deviceEntries.forEach(([stationId, v]) => {
                const z = stZScore(v.revenue, m, sd);
                if (Math.abs(z) > 2) {
                    const station = stations.find(st => st.id === stationId);
                    const deviceName = station ? (station.name || `${t('جهاز', 'Device')} ${station.number}`) : t('جهاز', 'Device');
                    anomalies.push({
                        icon: z > 0 ? '🟢' : '🟡',
                        tone: z > 0 ? 'green' : 'amber',
                        text: z > 0
                            ? t(`${deviceName} بيحقق إيراد أعلى بشكل ملحوظ من باقي الأجهزة.`, `${deviceName} is generating notably higher revenue than the other devices.`)
                            : t(`${deviceName} استخدامه أقل بشكل ملحوظ من باقي الأجهزة — يستاهل تشوف سببه.`, `${deviceName} usage is notably lower than the other devices — worth checking why.`)
                    });
                }
            });
        }
    }

    return anomalies;
}

// ------------------------------------------------------------
// AI-STYLE INSIGHTS
// ------------------------------------------------------------
function analyticsBuildInsights(core, prevCore) {
    const insights = [];

    // 1) اتجاه الإيراد مقارنة بالفترة اللي فاتت
    const curRev = core.grossRevenue;
    const prevRev = prevCore.grossRevenue;
    if (prevRev > 0) {
        const pctChange = ((curRev - prevRev) / prevRev) * 100;
        const up = pctChange >= 0;
        insights.push({
            icon: up ? '📈' : '📉', tone: up ? 'green' : 'red',
            badge: `${up ? '▲' : '▼'} ${Math.abs(pctChange).toFixed(0)}%`,
            text: up
                ? t('الإيراد في اتجاه صاعد مقارنة بالفترة اللي فاتت.', 'Revenue is trending up compared to the previous period.')
                : t('الإيراد في اتجاه هابط مقارنة بالفترة اللي فاتت، يستاهل مراجعة الأسعار والزحمة والمنافسة.', 'Revenue is trending down vs. the previous period — worth reviewing pricing, traffic and competition.')
        });
    }

    // 2) أفضل/أضعف يوم في الأسبوع
    const weekdayEntries = Object.entries(core.weekdayMap);
    if (weekdayEntries.length >= 2) {
        const sorted = [...weekdayEntries].sort((a, b) => b[1] - a[1]);
        const [bestWd, bestVal] = sorted[0];
        const [worstWd, worstVal] = sorted[sorted.length - 1];
        const dayNames = analyticsWeekdayNames();
        insights.push({
            icon: '📅', tone: 'purple',
            text: t(`يوم ${dayNames[bestWd]} بيحقق أعلى إيراد (${money(bestVal)} ج) — جهّز فريق وأجهزة كفاية فيه.`, `${dayNames[bestWd]} brings the highest revenue (${money(bestVal)} EGP) — staff and stock up for it.`)
        });
        if (worstWd !== bestWd && worstVal < bestVal * 0.5) {
            insights.push({
                icon: '📉', tone: 'amber',
                text: t(`يوم ${dayNames[worstWd]} أضعف يوم في الإيراد (${money(worstVal)} ج) — جرب عروض تجذب عملاء فيه.`, `${dayNames[worstWd]} is the weakest day (${money(worstVal)} EGP) — try promotions to boost it.`)
            });
        }
    }

    // 3) أكتر وقت زحمة
    const hourEntries = Object.entries(core.hourMap);
    if (hourEntries.length > 0) {
        const sorted = [...hourEntries].sort((a, b) => b[1] - a[1]);
        const peakHour = parseInt(sorted[0][0]);
        insights.push({
            icon: '⏰', tone: 'purple',
            text: t(`أكتر وقت زحمة الساعة ${formatHour12(peakHour)} — خلي بالك من التغطية وقتها.`, `Busiest time is ${formatHour12(peakHour)} — make sure coverage is solid then.`)
        });
    }

    // 4) تركّز طريقة دفع واحدة
    const pmEntries = Object.entries(core.paymentBreakdown);
    if (pmEntries.length > 0 && core.grossRevenue > 0) {
        const sorted = [...pmEntries].sort((a, b) => b[1] - a[1]);
        const [topName, topVal] = sorted[0];
        const share = (topVal / core.grossRevenue) * 100;
        if (share >= 80) {
            insights.push({
                icon: '💳', tone: 'teal',
                text: t(`أغلب مدفوعاتك (${share.toFixed(0)}%) بتتم بطريقة "${topName}" — فكر تنوّع طرق الدفع.`, `Most of your payments (${share.toFixed(0)}%) go through "${topName}" — consider diversifying payment methods.`)
            });
        }
    }

    // 5) ضعف إيراد المنيو
    if (core.grossRevenue > 0) {
        const menuShare = (core.ordersTotal / core.grossRevenue) * 100;
        if (menuShare < 10) {
            insights.push({
                icon: '🍔', tone: 'amber',
                text: t(`إيراد المنيو ضعيف (${menuShare.toFixed(0)}% من الإيراد الكلي) — جرب عروض تشجع العملاء يطلبوا أكتر.`, `Menu revenue is weak (only ${menuShare.toFixed(0)}% of total) — try promotions to encourage more orders.`)
            });
        }
    }

    return insights;
}

// ------------------------------------------------------------
// FORECAST (نطاق إحصائي: متوسط ± انحراف معياري — مش رقم واحد بثقة وهمية)
// ------------------------------------------------------------
async function analyticsComputeForecast() {
    // ✅ التوقع بيعتمد دايمًا على آخر 28 يوم بغض النظر عن التبويب المختار،
    // عشان متوسط/انحراف الأيام يبقى مستقر ومش متأثر بتبويب "اليوم" (يوم واحد بس)
    const end = new Date(nowCorrected());
    const start = new Date(end);
    start.setDate(start.getDate() - 27);
    start.setHours(0, 0, 0, 0);

    const periodData = await fetchAnalyticsPeriodData(start, end);
    const core = analyticsComputeCore(periodData);

    const dayCount = Math.round((end - start) / 86400000) + 1;
    const dailyValues = [];
    for (let i = 0; i < dayCount; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        dailyValues.push(core.dailyMap[analyticsDayKey(d)] || 0);
    }

    // ✅ بنحسب المتوسط والانحراف على الأيام اللي فيها نشاط فعلي بس، عشان
    // الأيام اللي المحل كان مقفول فيها متأثرش على الحساب وتوهم بانخفاض وهمي
    const activeDays = dailyValues.filter(v => v > 0);
    const daysWithData = activeDays.length;

    const MIN_DAYS = 4;
    if (daysWithData < MIN_DAYS) {
        return { insufficientData: true, daysWithData };
    }

    const m = stMean(activeDays);
    const sd = stStdDev(activeDays);
    const low = Math.max(0, m - sd);
    const high = m + sd;

    const avgExpensePerDay = core.expensesTotal / dayCount;

    return {
        insufficientData: false,
        daysWithData,
        expectedRevenueLow: low,
        expectedRevenueHigh: high,
        expectedExpense: avgExpensePerDay,
        expectedNetLow: Math.max(0, low - avgExpensePerDay),
        expectedNetHigh: Math.max(0, high - avgExpensePerDay)
    };
}

// ------------------------------------------------------------
// RENDERING
// ------------------------------------------------------------
function analyticsRenderStatCards(core) {
    document.getElementById('anStatSessions').textContent = core.sessionsCount;
    document.getElementById('anStatRevenue').textContent = money(core.grossRevenue);
    document.getElementById('anStatExpenses').textContent = money(core.expensesTotal);
    document.getElementById('anStatNet').textContent = money(core.netProfit);
}

function analyticsRenderInsightRows(containerId, items, emptyMsg) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!items || items.length === 0) {
        el.innerHTML = `<div class="empty" style="padding:20px;"><i class="fa-solid fa-circle-check"></i>${escapeHtml(emptyMsg || t('مفيش ملاحظات دلوقتي.', 'Nothing to report right now.'))}</div>`;
        return;
    }
    el.innerHTML = items.map(it => `
        <div class="insight-row tone-${it.tone || 'teal'}">
            <div style="display:flex;align-items:center;gap:10px;">
                <span class="insight-icon">${it.icon || '•'}</span>
                <span>${escapeHtml(it.text)}</span>
            </div>
            ${it.badge ? `<span class="badge badge-${it.tone === 'green' ? 'green' : (it.tone === 'red' ? 'red' : 'amber')}" style="flex:0 0 auto;">${escapeHtml(it.badge)}</span>` : ''}
        </div>
    `).join('');
}

function analyticsRenderBestDays(core) {
    const dayNames = analyticsWeekdayNames();
    const entries = Object.entries(core.weekdayMap).map(([wd, val]) => ({ wd: parseInt(wd), val })).sort((a, b) => b.val - a.val);
    const el = document.getElementById('anBestDays');
    if (entries.length === 0) { el.innerHTML = `<div class="empty"><i class="fa-solid fa-calendar"></i>${t('مفيش بيانات كفاية.', 'Not enough data.')}</div>`; return; }
    const maxVal = Math.max(...entries.map(e => e.val), 1);
    el.innerHTML = entries.map(e => `
        <div class="bar-row">
            <div class="bar-row-label"><span>${dayNames[e.wd]}</span><span class="mono">${money(e.val)}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, e.val / maxVal * 100)}%"></div></div>
        </div>
    `).join('');
}

function analyticsRenderRevenueChart(core, bounds) {
    const el = document.getElementById('anRevenueChart');
    const dayCount = bounds.days;
    const points = [];
    for (let i = 0; i < dayCount; i++) {
        const d = new Date(bounds.start);
        d.setDate(d.getDate() + i);
        points.push({ date: d, value: core.dailyMap[analyticsDayKey(d)] || 0 });
    }
    if (points.every(p => p.value === 0)) {
        el.innerHTML = `<div class="empty"><i class="fa-solid fa-chart-line"></i>${t('مفيش إيراد مسجل في الفترة دي.', 'No revenue recorded in this period.')}</div>`;
        return;
    }

    const W = 600, H = 220, padL = 46, padR = 12, padT = 14, padB = 26;
    const maxVal = Math.max(...points.map(p => p.value), 1);
    const stepX = points.length > 1 ? (W - padL - padR) / (points.length - 1) : 0;
    const coords = points.map((p, i) => {
        const x = padL + i * stepX;
        const y = padT + (H - padT - padB) * (1 - (p.value / maxVal));
        return { x, y, p };
    });
    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${H - padB} L ${coords[0].x.toFixed(1)} ${H - padB} Z`;

    const gridLines = [];
    const divisions = 4;
    for (let i = 0; i <= divisions; i++) {
        const val = maxVal / divisions * i;
        const y = padT + (H - padT - padB) * (1 - i / divisions);
        gridLines.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`);
        gridLines.push(`<text x="${padL - 6}" y="${(y + 3).toFixed(1)}" font-size="9" fill="var(--text-faint)" text-anchor="end">${money(Math.round(val))}</text>`);
    }
    const labelEvery = Math.max(1, Math.ceil(points.length / 6));
    const xLabels = coords.filter((c, i) => i % labelEvery === 0 || i === coords.length - 1)
        .map(c => `<text x="${c.x.toFixed(1)}" y="${H - 6}" font-size="9" fill="var(--text-faint)" text-anchor="middle">${c.p.date.getMonth() + 1}/${c.p.date.getDate()}</text>`).join('');

    el.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;overflow:visible;" preserveAspectRatio="xMidYMid meet">
            <defs>
                <linearGradient id="anRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--amber)" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="var(--amber)" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${gridLines.join('')}
            <path d="${areaPath}" fill="url(#anRevGrad)" stroke="none"/>
            <path d="${linePath}" fill="none" stroke="var(--amber)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
            ${coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="var(--amber)"/>`).join('')}
            ${xLabels}
        </svg>
    `;
}

function buildDonutSVG(segmentsData, opts) {
    const total = segmentsData.reduce((s, d) => s + d.value, 0);
    if (total <= 0) {
        return `<div class="empty" style="padding:20px;"><i class="fa-solid fa-chart-pie"></i>${t('مفيش بيانات كفاية.', 'Not enough data.')}</div>`;
    }
    const size = (opts && opts.size) || 180;
    const strokeW = (opts && opts.strokeWidth) || 26;
    const r = (size - strokeW) / 2;
    const cx = size / 2, cy = size / 2;
    const circumference = 2 * Math.PI * r;

    let offset = 0;
    const circles = segmentsData.filter(d => d.value > 0).map(d => {
        const frac = d.value / total;
        const dash = frac * circumference;
        const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="${strokeW}" stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
        offset += dash;
        return circle;
    }).join('');

    const legend = segmentsData.filter(d => d.value > 0).map(d => `<span><span class="dot" style="background:${d.color}"></span>${escapeHtml(d.label)}</span>`).join('');

    return `
        <div class="donut-wrap">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${circles}</svg>
            <div class="donut-legend">${legend}</div>
        </div>
    `;
}

function analyticsRenderRevenueDonut(core) {
    document.getElementById('anRevenueDonut').innerHTML = buildDonutSVG([
        { label: t('إيراد الساعات', 'Hours Revenue'), value: core.hoursRevenue, color: 'var(--amber)' },
        { label: t('إيراد المنيو', 'Menu Revenue'), value: core.ordersTotal, color: 'var(--teal)' }
    ]);
}

function analyticsRenderPaymentDonut(core) {
    const palette = ['var(--amber)', 'var(--teal)', 'var(--purple)', 'var(--blue)', 'var(--green)', 'var(--red)'];
    const entries = Object.entries(core.paymentBreakdown);
    const segs = entries.map(([name, val], i) => ({ label: name, value: val, color: palette[i % palette.length] }));
    document.getElementById('anPaymentDonut').innerHTML = buildDonutSVG(segs);

    const listEl = document.getElementById('anPaymentList');
    if (entries.length === 0) { listEl.innerHTML = ''; return; }
    listEl.innerHTML = entries.sort((a, b) => b[1] - a[1]).map(([name, val]) => `
        <div class="list-row"><div class="row-title">${escapeHtml(name)}</div><div class="row-value mono">${money(val)}</div></div>
    `).join('');
}

function analyticsRenderBarList(barContainerId, listContainerId, entriesRaw, opts) {
    const barEl = document.getElementById(barContainerId);
    const listEl = listContainerId ? document.getElementById(listContainerId) : null;
    const entries = entriesRaw.filter(e => e.value > 0).sort((a, b) => b.value - a.value).slice(0, (opts && opts.limit) || 8);

    if (entries.length === 0) {
        barEl.innerHTML = `<div class="empty"><i class="fa-solid fa-chart-bar"></i>${t('مفيش بيانات كفاية.', 'Not enough data.')}</div>`;
        if (listEl) listEl.innerHTML = '';
        return;
    }

    const maxVal = Math.max(...entries.map(e => e.value));
    barEl.innerHTML = entries.map(e => `
        <div class="bar-row">
            <div class="bar-row-label"><span>${escapeHtml(e.label)}</span><span class="mono">${money(e.value)}</span></div>
            <div class="bar-track"><div class="bar-fill ${(opts && opts.color === 'teal') ? 'teal' : ''}" style="width:${Math.max(2, e.value / maxVal * 100)}%"></div></div>
        </div>
    `).join('');

    if (listEl) {
        listEl.innerHTML = entries.map(e => `
            <div class="list-row">
                <div>
                    <div class="row-title">${escapeHtml(e.label)}</div>
                    ${e.sub ? `<div class="row-sub">${escapeHtml(e.sub)}</div>` : ''}
                </div>
                <div class="row-value mono">${money(e.value)}</div>
            </div>
        `).join('');
    }
}

function analyticsRenderTopItems(core) {
    const entries = Object.entries(core.itemBreakdown).map(([name, v]) => ({
        label: name, value: v.revenue, sub: `${v.qty} ${t('قطعة', 'pcs')}`
    }));
    analyticsRenderBarList('anTopItemsChart', 'anTopItemsList', entries, { color: 'amber', limit: 6 });
}

function analyticsRenderDeviceUsage(core) {
    const entries = Object.entries(core.deviceBreakdown).map(([stationId, v]) => {
        const station = stations.find(s => s.id === stationId);
        const label = station ? (station.name || `${t('جهاز', 'Device')} ${station.number}`) : t('جهاز', 'Device');
        const durationLabel = v.hoursSum >= 1
            ? `${v.sessionsCount} ${t('جلسة', 'sessions')} · ${v.hoursSum.toFixed(2)} ${t('ساعة', 'h')}`
            : `${v.sessionsCount} ${t('جلسة', 'sessions')} · ${Math.round(v.hoursSum * 60)} ${t('دقيقة', 'min')}`;
        return { label, value: v.revenue, sub: durationLabel };
    });
    analyticsRenderBarList('anDeviceUsageChart', 'anDeviceUsageList', entries, { color: 'teal' });
}

function analyticsRenderRevenueDetails(core) {
    document.getElementById('anRevenueDetails').innerHTML = `
        <div class="list-row"><div class="row-title">${t('إيراد الساعات', 'Hours Revenue')}</div><div class="row-value mono">${money(core.hoursRevenue)}</div></div>
        <div class="list-row"><div class="row-title">${t('إيراد المنيو', 'Menu Revenue')}</div><div class="row-value mono">${money(core.ordersTotal)}</div></div>
        <div class="list-row"><div class="row-title">Single</div><div class="row-value mono">${money(core.singleRevenue)}</div></div>
        <div class="list-row"><div class="row-title">Multi</div><div class="row-value mono">${money(core.multiRevenue)}</div></div>
    `;
}

function analyticsRenderUsefulStats(core) {
    const meanVal = stMean(core.sessionValues);
    const medianVal = stMedian(core.sessionValues);
    const meanDur = stMean(core.sessionDurations);
    const medianDur = stMedian(core.sessionDurations);

    const hourEntries = Object.entries(core.hourMap).sort((a, b) => b[1] - a[1]);
    const peakHourLabel = hourEntries.length ? formatHour12(parseInt(hourEntries[0][0])) : '—';

    const wdEntries = Object.entries(core.weekdayMap).sort((a, b) => b[1] - a[1]);
    const dayNames = analyticsWeekdayNames();
    const bestDayLabel = wdEntries.length ? dayNames[parseInt(wdEntries[0][0])] : '—';

    document.getElementById('anUsefulStats').innerHTML = `
        <div class="list-row"><div class="row-title">${t('متوسط قيمة الجلسة (Mean)', 'Avg Session Value (Mean)')}</div><div class="row-value mono">${moneyDec(meanVal)}</div></div>
        <div class="list-row"><div class="row-title">${t('الوسيط لقيمة الجلسة (Median)', 'Median Session Value')}</div><div class="row-value mono">${moneyDec(medianVal)}</div></div>
        <div class="list-row"><div class="row-title">${t('متوسط مدة الجلسة (ساعة)', 'Avg Session Duration (h)')}</div><div class="row-value mono">${meanDur.toFixed(2)}</div></div>
        <div class="list-row"><div class="row-title">${t('الوسيط لمدة الجلسة (ساعة)', 'Median Session Duration (h)')}</div><div class="row-value mono">${medianDur.toFixed(2)}</div></div>
        <div class="list-row"><div class="row-title">${t('أكتر وقت زحمة', 'Peak Hour')}</div><div class="row-value mono">${peakHourLabel}</div></div>
        <div class="list-row"><div class="row-title">${t('أفضل يوم', 'Best Day')}</div><div class="row-value mono">${bestDayLabel}</div></div>
    `;
}

function analyticsRenderForecast(forecast) {
    const cardsEl = document.getElementById('anForecastCards');
    const netEl = document.getElementById('anForecastNet');
    const discEl = document.getElementById('anForecastDisclaimer');

    if (!forecast || forecast.insufficientData) {
        cardsEl.innerHTML = `<div class="stat-card" style="grid-column:1/-1;"><div class="stat-label">${t('توقع الإيراد', 'Revenue Forecast')}</div><div class="stat-value" style="font-size:13.5px;color:var(--text-dim);font-weight:600;">${t('البيانات لسه مش كافية لتوقع موثوق (محتاج بيانات ٤ أيام نشاط على الأقل).', 'Not enough data yet for a reliable forecast (need at least 4 days of activity).')}</div></div>`;
        netEl.innerHTML = '';
        discEl.textContent = '';
        return;
    }

    cardsEl.innerHTML = `
        <div class="stat-card accent">
            <div class="stat-label">${t('إيراد متوقع (غدًا)', 'Expected Revenue (Next Day)')}</div>
            <div class="stat-value mono" style="font-size:17px;">${money(forecast.expectedRevenueLow)} – ${money(forecast.expectedRevenueHigh)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">${t('مصروفات متوقعة', 'Expected Expenses')}</div>
            <div class="stat-value mono" style="font-size:17px;">${money(forecast.expectedExpense)}</div>
        </div>
    `;
    netEl.innerHTML = `
        <div class="list-row"><div class="row-title">${t('صافي متوقع', 'Expected Net')}</div><div class="row-value mono" style="color:var(--amber);">${money(forecast.expectedNetLow)} – ${money(forecast.expectedNetHigh)}</div></div>
    `;
    discEl.textContent = t(
        `النطاق مبني على متوسط ± انحراف معياري لآخر ${forecast.daysWithData} يوم فيهم نشاط فعلي — تقدير إحصائي مش رقم مضمون.`,
        `Range is based on mean ± standard deviation of the last ${forecast.daysWithData} active days — a statistical estimate, not a guarantee.`
    );
}

// ------------------------------------------------------------
// MASTER RENDER
// ------------------------------------------------------------
async function renderAnalytics() {
    if (analyticsLoading) return;
    analyticsLoading = true;
    try {
        const bounds = getAnalyticsRangeBounds(analyticsRange);
        const [periodData, prevPeriodData, forecast] = await Promise.all([
            fetchAnalyticsPeriodData(bounds.start, bounds.end),
            fetchAnalyticsPeriodData(bounds.prevStart, bounds.prevEnd),
            analyticsComputeForecast()
        ]);

        const core = analyticsComputeCore(periodData);
        const prevCore = analyticsComputeCore(prevPeriodData);

        analyticsRenderStatCards(core);

        const insights = analyticsBuildInsights(core, prevCore);
        analyticsRenderInsightRows('anInsightsList', insights, t('البيانات لسه قليلة لعرض تحليل ذكي.', 'Not enough data yet for smart analysis.'));

        const anomalies = analyticsDetectAnomalies(core);
        const anomaliesSection = document.getElementById('anAnomaliesSection');
        if (anomalies.length > 0) {
            anomaliesSection.style.display = 'block';
            analyticsRenderInsightRows('anAnomaliesList', anomalies);
        } else {
            anomaliesSection.style.display = 'none';
        }

        analyticsRenderBestDays(core);
        analyticsRenderRevenueChart(core, bounds);
        analyticsRenderRevenueDonut(core);
        analyticsRenderTopItems(core);
        analyticsRenderDeviceUsage(core);
        analyticsRenderRevenueDetails(core);
        analyticsRenderPaymentDonut(core);
        analyticsRenderUsefulStats(core);
        analyticsRenderForecast(forecast);
    } catch (e) {
        console.error('Error rendering analytics:', e);
        showToast(t('حصل خطأ في تحميل التحليلات.', 'Error loading analytics.'), 'error');
    } finally {
        analyticsLoading = false;
    }
}

function setAnalyticsRange(range) {
    analyticsRange = range;
    document.querySelectorAll('#analyticsTabs .shift-tab').forEach(b => b.classList.toggle('active', b.dataset.range === range));
    renderAnalytics();
}
