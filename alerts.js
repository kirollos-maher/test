// ============================================================
// COUNTDOWN ALERTS - نظام التنبيهات المتقدم (نسخة Plate Pro)
// ============================================================

// تخزين حالة التنبيهات لكل جهاز
const countdownAlertState = {};

// الحد الأدنى للتنبيه (بالثواني) - 300 ثانية = 5 دقائق
const ALERT_THRESHOLD = 300;

// متغير للمؤقت
let countdownAlertInterval = null;

// متغيرات الصوت
let audioContext = null;
let ringTimeout = null;

// ========================
// تهيئة الصوت
// ========================
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('🎵 Audio initialized for alerts');
    } catch (e) {
        console.warn('⚠️ Audio not supported');
    }
}

// ========================
// تشغيل صوت التنبيه (نغمة) + نطق "New Order"
// ========================
function playRingSound(type = 'warning') {
    try {
        if (!audioContext) {
            initAudio();
        }
        if (!audioContext) return;
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        const now = audioContext.currentTime;

        if (type === 'warning') {
            const frequencies = [800, 1000];
            const durations = [0.2, 0.2];
            let time = now;
            frequencies.forEach((freq, i) => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.frequency.setValueAtTime(freq, time);
                gain.gain.setValueAtTime(0.25, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + durations[i]);
                osc.start(time);
                osc.stop(time + durations[i]);
                time += durations[i] + 0.1;
            });
        } else if (type === 'ended') {
            const frequencies = [800, 600, 800];
            const durations = [0.25, 0.25, 0.3];
            let time = now;
            frequencies.forEach((freq, i) => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.frequency.setValueAtTime(freq, time);
                gain.gain.setValueAtTime(0.35, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + durations[i]);
                osc.start(time);
                osc.stop(time + durations[i]);
                time += durations[i] + 0.08;
            });
        }

        // اهتزاز للجوال
        if (navigator.vibrate) {
            navigator.vibrate(type === 'ended' ? [300, 100, 300, 100, 300] : [200, 100, 200]);
        }

    } catch (e) {
        console.warn('⚠️ Could not play sound:', e);
    }
}

// ========================
// نطق "New Order" (أو تنبيه) باستخدام Speech Synthesis
// ========================
function speakNewOrder() {
    try {
        if (!window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance('New Order');
        utterance.lang = 'en-US';
        utterance.rate = 1.2;
        utterance.pitch = 1.2;
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn('Speech synthesis failed:', e);
    }
}

// ========================
// عرض إشعار مرئي + صوت + نطق
// ========================
function showRingNotification(title, message, type = 'warning') {
    // تشغيل الصوت والنطق
    playRingSound(type);
    if (type === 'warning' && title.includes('طلب جديد')) {
        speakNewOrder();
    }

    // البحث عن عنصر الإشعار
    const el = document.getElementById('ringNotification');
    if (!el) {
        if (typeof showToast === 'function') {
            showToast(`🔔 ${title}: ${message}`, type === 'ended' ? 'error' : 'warning');
        }
        return;
    }

    // تحديث المحتوى
    document.getElementById('ringTitle').textContent = title;
    document.getElementById('ringSub').textContent = message;

    // إظهار الإشعار
    el.classList.add('show');

    // إخفاء الإشعار بعد 5 ثواني
    clearTimeout(ringTimeout);
    ringTimeout = setTimeout(() => {
        el.classList.remove('show');
    }, 5000);

    // النقر على الإشعار لإخفائه
    el.onclick = function() {
        el.classList.remove('show');
        clearTimeout(ringTimeout);
    };
}

// ========================
// وظيفة المراقبة الأساسية
// ========================
function checkCountdownAlerts() {
    // التأكد من وجود البيانات الأساسية
    if (typeof business === 'undefined' || !business ||
        typeof stations === 'undefined' || !stations ||
        typeof sessions === 'undefined') {
        return;
    }

    if (Object.keys(sessions).length === 0) {
        for (const key in countdownAlertState) {
            delete countdownAlertState[key];
        }
        return;
    }

    if (typeof getActiveSegmentFast !== 'function' || typeof getRemainingSeconds !== 'function') {
        console.warn('⚠️ Alert functions not available yet');
        return;
    }

    Object.keys(sessions).forEach(stationId => {
        const session = sessions[stationId];
        if (!session) return;

        const activeSeg = getActiveSegmentFast(session.id);
        if (!activeSeg || activeSeg.timer_type !== 'countdown') return;

        const remaining = getRemainingSeconds(activeSeg);
        const station = stations.find(s => s.id === stationId);
        const deviceName = station ? (station.name || t('جهاز', 'Device') + ' ' + station.number) : t('جهاز', 'Device');

        if (remaining <= 0) {
            if (countdownAlertState[stationId] !== 'ended') {
                countdownAlertState[stationId] = 'ended';
                const msg = t(`⏰ انتهى وقت جهاز ${deviceName}`, `⏰ Time's up for device ${deviceName}`);
                showRingNotification(
                    t('⏰ انتهى الوقت!', '⏰ Time\'s up!'),
                    msg,
                    'ended'
                );
                if (typeof showToast === 'function') {
                    showToast(msg, 'error');
                }
            }
        } else if (remaining <= ALERT_THRESHOLD) {
            if (countdownAlertState[stationId] !== 'warning') {
                countdownAlertState[stationId] = 'warning';
                const minutes = Math.floor(remaining / 60);
                const seconds = Math.round(remaining % 60);
                let timeStr = '';
                if (minutes > 0) {
                    timeStr = `${minutes} ${t('دقيقة', 'minute')}`;
                    if (seconds > 0) timeStr += ` ${seconds} ${t('ثانية', 'second')}`;
                } else {
                    timeStr = `${seconds} ${t('ثانية', 'second')}`;
                }
                const msg = t(`⚠️ جهاز ${deviceName}: متبقي ${timeStr}`, `⚠️ Device ${deviceName}: ${timeStr} remaining`);
                showRingNotification(
                    t('⏳ وقت شبه خلص', '⏳ Time almost up'),
                    msg,
                    'warning'
                );
                if (typeof showToast === 'function') {
                    showToast(msg, 'warning');
                }
            }
        } else {
            if (countdownAlertState[stationId]) {
                delete countdownAlertState[stationId];
            }
        }
    });
}

// ========================
// تشغيل / إيقاف المراقبة
// ========================
function startCountdownAlerts() {
    if (countdownAlertInterval) {
        clearInterval(countdownAlertInterval);
        countdownAlertInterval = null;
    }
    countdownAlertInterval = setInterval(checkCountdownAlerts, 1000);
    console.log('🔔 Countdown alerts started (Ring system)');
}

function stopCountdownAlerts() {
    if (countdownAlertInterval) {
        clearInterval(countdownAlertInterval);
        countdownAlertInterval = null;
        console.log('🔕 Countdown alerts stopped');
    }
}

// ========================
// التهيئة التلقائية عند تحميل الصفحة
// ========================
function initAlerts() {
    if (typeof business !== 'undefined' && business &&
        typeof stations !== 'undefined' && stations && stations.length > 0) {
        startCountdownAlerts();
    } else {
        setTimeout(initAlerts, 500);
    }
}

window.addEventListener('load', initAlerts);
window.addEventListener('beforeunload', function() {
    stopCountdownAlerts();
});

window.startCountdownAlerts = startCountdownAlerts;
window.stopCountdownAlerts = stopCountdownAlerts;
