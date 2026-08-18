<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no">

<title>DORAK - Gaming Lounge Management</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">

<link rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

<!-- Supabase -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- Main Styles -->
<link rel="stylesheet" href="style.css">

<!-- Application -->
<script src="app.js" defer></script>
<script src="alerts.js" defer></script>

<style>
    /* =========================================================
       DORAK BRAND
       ========================================================= */

    .dorak-brand {
        font-family: 'JetBrains Mono', monospace;
        font-weight: 800;
        font-size: 18px;
        color: var(--amber);
        letter-spacing: 0.08em;
        margin-left: 12px;
        text-shadow: 0 0 20px rgba(255, 138, 30, 0.3);
        user-select: none;
        white-space: nowrap;
    }

    .dorak-brand .star {
        color: var(--amber);
        opacity: 0.7;
    }

    .app-header .dorak-brand {
        color: var(--amber);
    }

    [data-theme="light"] .dorak-brand {
        color: var(--amber-dark);
        text-shadow: 0 0 20px rgba(255, 138, 30, 0.15);
    }

    /* =========================================================
       HEADER NOTIFICATION BELL
       ========================================================= */

    #headerBell {
        font-size: 20px;
        color: var(--text-muted);
        transition: all 0.3s ease;
        cursor: default;
    }

    #headerBell.bell-ringing {
        color: var(--amber);
        animation:
            bellBlink 0.6s infinite alternate,
            bellShake 0.3s infinite;
    }

    @keyframes bellBlink {
        0% {
            opacity: 0.4;
            transform: scale(0.9);
        }

        100% {
            opacity: 1;
            transform: scale(1.1);
        }
    }

    @keyframes bellShake {
        0% {
            transform: rotate(-15deg);
        }

        100% {
            transform: rotate(15deg);
        }
    }

    /* =========================================================
       AUTH / SETUP HELP
       ========================================================= */

    .auth-helper-text {
        margin-top: 6px;
        font-size: 11px;
        color: var(--text-faint);
        text-align: center;
        line-height: 1.6;
    }

    /* =========================================================
       CREATE BUSINESS
       ========================================================= */

    .create-business-note {
        font-size: 11px;
        color: var(--text-faint);
        line-height: 1.7;
        margin: 0 0 12px;
        text-align: center;
    }
</style>

</head>

<body>

<!-- =========================================================
     RING NOTIFICATION
     ========================================================= -->

<div class="ring-notification" id="ringNotification">
    <div style="display:flex;align-items:center;gap:12px;">
        <div class="ring-icon">🔔</div>

        <div>
            <div class="ring-title" id="ringTitle">تنبيه</div>
            <div class="ring-sub" id="ringSub">تفاصيل التنبيه</div>
        </div>
    </div>
</div>


<!-- =========================================================
     V2 SECURITY BANNER
     ========================================================= -->

<div
    id="v2SecurityBanner"
    style="
        display:none;
        position:fixed;
        top:0;
        left:0;
        right:0;
        z-index:1000;
        background:#3b1f00;
        color:#ffd8a8;
        padding:8px 12px;
        text-align:center;
        font:600 12px Cairo,sans-serif;
    "
>
    V2: تأكد من تطبيق ملف SQL على Supabase قبل استخدام النظام في الإنتاج.
</div>


<!-- =========================================================
     SETUP SCREEN
     ========================================================= -->

<div id="setupScreen" class="screen active">

    <div class="centered-screen">

        <div class="brand-mark">✦ DORAK ✦</div>

        <div
            class="brand-title"
            data-ar="تسجيل الدخول للنشاط"
            data-en="Business Login"
        >
            تسجيل الدخول للنشاط
        </div>

        <div class="card">

            <div class="field">

                <label
                    for="setupBusinessCode"
                    data-ar="كود النشاط التجاري"
                    data-en="Business Code"
                >
                    كود النشاط التجاري
                </label>

                <input
                    type="text"
                    id="setupBusinessCode"
                    class="mono"
                    placeholder="مثال: CAFE01"
                    autocomplete="organization"
                    autocapitalize="characters"
                    spellcheck="false"
                    style="text-transform:uppercase"
                >

            </div>

            <button
                class="btn btn-amber btn-block"
                id="setupContinueBtn"
                onclick="handleSetupContinue()"
            >
                <i class="fa-solid fa-arrow-left"></i>

                <span
                    data-ar="متابعة"
                    data-en="Continue"
                >
                    متابعة
                </span>
            </button>

            <!-- إنشاء نشاط جديد -->
            <button
                class="btn btn-ghost btn-block"
                style="margin-top:8px;"
                onclick="openCreateBusinessSheetFromSetup()"
            >
                <i class="fa-solid fa-plus"></i>

                <span
                    data-ar="إنشاء نشاط جديد"
                    data-en="Create New Business"
                >
                    إنشاء نشاط جديد
                </span>
            </button>

            <div class="error-text" id="setupError"></div>

        </div>

    </div>

</div>


<!-- ملحوظة: شاشة تفعيل الجهاز (activationScreen) اتشالت — الدخول
     بقى بالكامل عن طريق Supabase Auth تحت. -->


<!-- =========================================================
     SUPABASE AUTH SCREEN
     ========================================================= -->

<div id="authScreen" class="screen">

    <div class="centered-screen">

        <div class="brand-mark">✦ DORAK ✦</div>

        <div
            class="brand-title"
            id="authBizName"
            style="font-size:22px;"
        >
            —
        </div>

        <div
            class="brand-mark"
            id="authBizCode"
            style="font-size:14px;color:var(--text-dim);"
        >
            —
        </div>

        <div class="card">

            <!-- LOGIN -->

            <div id="authLoginForm">

                <div
                    class="section-title"
                    style="text-align:center;margin-bottom:14px;"
                >
                    تسجيل الدخول
                </div>

                <div class="field">

                    <label for="authEmail">
                        البريد الإلكتروني
                    </label>

                    <input
                        type="email"
                        id="authEmail"
                        autocomplete="email"
                        placeholder="name@example.com"
                    >

                </div>

                <div class="field">

                    <label for="authPassword">
                        كلمة المرور
                    </label>

                    <input
                        type="password"
                        id="authPassword"
                        autocomplete="current-password"
                        placeholder="••••••••"
                    >

                </div>

                <div class="field">

                    <label for="authLoginOwnerPin">
                        PIN المالك (لأول ربط فقط)
                    </label>

                    <input
                        type="password"
                        inputmode="numeric"
                        id="authLoginOwnerPin"
                        class="mono"
                        autocomplete="off"
                        placeholder="اختياري"
                    >

                </div>

                <button
                    class="btn btn-amber btn-block"
                    id="authLoginBtn"
                    onclick="handleAuthLogin()"
                >
                    <i class="fa-solid fa-right-to-bracket"></i>
                    دخول
                </button>

                <button
                    class="btn btn-ghost btn-block"
                    style="margin-top:8px;"
                    onclick="showAuthScreen('signup')"
                >
                    إنشاء حساب مالك لأول مرة
                </button>

                <button
                    class="btn btn-ghost btn-block"
                    style="margin-top:8px;"
                    onclick="showScreen('setupScreen')"
                >
                    تغيير النشاط
                </button>

            </div>


            <!-- SIGNUP -->

            <div
                id="authSignupForm"
                style="display:none;"
            >

                <div
                    class="section-title"
                    style="text-align:center;margin-bottom:14px;"
                >
                    إنشاء حساب المالك
                </div>

                <div class="field">

                    <label for="authOwnerName">
                        اسم المالك
                    </label>

                    <input
                        type="text"
                        id="authOwnerName"
                        autocomplete="name"
                        placeholder="اسمك"
                    >

                </div>

                <div class="field">

                    <label for="authSignupEmail">
                        البريد الإلكتروني
                    </label>

                    <input
                        type="email"
                        id="authSignupEmail"
                        autocomplete="email"
                        placeholder="name@example.com"
                    >

                </div>

                <div class="field">

                    <label for="authSignupPassword">
                        كلمة المرور
                    </label>

                    <input
                        type="password"
                        id="authSignupPassword"
                        autocomplete="new-password"
                        placeholder="6 أحرف على الأقل"
                    >

                </div>

                <div class="field">

                    <label for="authSignupPasswordConfirm">
                        تأكيد كلمة المرور
                    </label>

                    <input
                        type="password"
                        id="authSignupPasswordConfirm"
                        autocomplete="new-password"
                        placeholder="أعد كتابة كلمة المرور"
                    >

                </div>

                <div class="field">

                    <label for="authOwnerPin">
                        PIN المالك الحالي
                    </label>

                    <input
                        type="password"
                        inputmode="numeric"
                        id="authOwnerPin"
                        class="mono"
                        autocomplete="off"
                        placeholder="PIN الحالي"
                    >

                    <div class="auth-helper-text">
                        يُستخدم مرة واحدة لربط حساب Auth بالنشاط الحالي.
                    </div>

                </div>

                <button
                    class="btn btn-amber btn-block"
                    id="authSignupBtn"
                    onclick="handleAuthSignup()"
                >
                    <i class="fa-solid fa-user-plus"></i>
                    إنشاء وربط الحساب
                </button>

                <button
                    class="btn btn-ghost btn-block"
                    style="margin-top:8px;"
                    onclick="showAuthScreen('login')"
                >
                    رجوع لتسجيل الدخول
                </button>

            </div>

            <div
                class="error-text"
                id="authError"
            ></div>

        </div>

        <div
            style="
                margin-top:14px;
                font-size:12px;
                color:var(--text-faint);
                text-align:center;
            "
            class="mono"
        >
            Supabase Auth • Secure Account Access
        </div>

    </div>

</div>


<!-- =========================================================
     MAIN APP
     ========================================================= -->

<div id="mainApp" class="screen">

    <!-- HEADER -->

    <div class="app-header">

        <div
            style="
                display:flex;
                align-items:center;
                gap:8px;
            "
        >

            <i
                class="fa-solid fa-bell"
                id="headerBell"
                aria-hidden="true"
            ></i>

            <div>

                <div
                    class="biz-name"
                    id="headerBizName"
                >
                    —
                </div>

                <div
                    class="biz-sub mono"
                    id="headerBizCode"
                >
                    —
                </div>

            </div>

        </div>


        <div class="header-actions">

            <span class="dorak-brand">
                ✦ DORAK ✦
            </span>

            <button
                class="lang-toggle"
                onclick="toggleLanguage()"
                type="button"
            >
                <i class="fa-solid fa-language"></i>
                <span id="langToggleLabel">English</span>
            </button>

            <div
                class="icon-btn"
                title="متصل لحظيًا"
                aria-label="Live connection"
            >
                <span class="live-dot"></span>
            </div>

            <button
                class="icon-btn"
                onclick="lockApp()"
                type="button"
                aria-label="Lock"
            >
                <i class="fa-solid fa-lock"></i>
            </button>

        </div>

    </div>


    <!-- =====================================================
         DASHBOARD
         ===================================================== -->

    <div
        class="view active"
        id="view-dashboard"
    >

        <div
            class="section-title"
            data-ar="أداء اليوم"
            data-en="Today's Performance"
        >
            أداء اليوم
        </div>

        <div class="stat-grid">

            <div class="stat-card accent">

                <div
                    class="stat-label"
                    data-ar="إيراد اليوم"
                    data-en="Today's Revenue"
                >
                    إيراد اليوم
                </div>

                <div
                    class="stat-value mono"
                    id="dashRevenue"
                >
                    0
                </div>

            </div>

            <div class="stat-card">

                <div
                    class="stat-label"
                    data-ar="مصروفات اليوم"
                    data-en="Today's Expenses"
                >
                    مصروفات اليوم
                </div>

                <div
                    class="stat-value mono"
                    id="dashExpenses"
                >
                    0
                </div>

            </div>

            <div class="stat-card">

                <div
                    class="stat-label"
                    data-ar="أجهزة شغالة"
                    data-en="Active Devices"
                >
                    أجهزة شغالة
                </div>

                <div
                    class="stat-value mono"
                    id="dashActive"
                >
                    0
                </div>

            </div>

            <div class="stat-card">

                <div
                    class="stat-label"
                    data-ar="أجهزة متاحة"
                    data-en="Available Devices"
                >
                    أجهزة متاحة
                </div>

                <div
                    class="stat-value mono"
                    id="dashAvailable"
                >
                    0
                </div>

            </div>

        </div>

    </div>


    <!-- =====================================================
         STATIONS
         ===================================================== -->

    <div
        class="view"
        id="view-stations"
    >

        <div
            class="section-title"
            data-ar="الأجهزة"
            data-en="Devices"
        >
            الأجهزة
        </div>

        <div
            class="station-grid"
            id="stationsGrid"
        ></div>

    </div>


    <!-- =====================================================
         SHIFT
         ===================================================== -->

    <div
        class="view"
        id="view-shift"
    >

        <div
            class="section-title"
            data-ar="الشيفت الحالي"
            data-en="Current Shift"
        >
            الشيفت الحالي
        </div>

        <div
            class="panel"
            id="shiftSummary"
        ></div>

        <button
            class="btn btn-red btn-block"
            style="margin-top:14px;"
            onclick="openCloseShiftSheet()"
        >
            <i class="fa-solid fa-lock"></i>

            <span
                data-ar="إقفال الشيفت"
                data-en="Close Shift"
            >
                إقفال الشيفت
            </span>
        </button>


        <div
            class="section-title"
            data-ar="سجل الشيفتات"
            data-en="Shift History"
        >
            سجل الشيفتات
        </div>


        <div class="shift-tabs">

            <button
                class="shift-tab active"
                data-filter="all"
                onclick="setShiftFilter('all')"
            >
                كل الشيفتات
            </button>

            <button
                class="shift-tab"
                data-filter="weekly"
                onclick="setShiftFilter('weekly')"
            >
                أسبوعي
            </button>

            <button
                class="shift-tab"
                data-filter="monthly"
                onclick="setShiftFilter('monthly')"
            >
                شهري
            </button>

        </div>


        <!-- FIXED: display is now controlled by JS -->
        <div
            id="monthlyFilter"
            style="
                display:none;
                margin-bottom:12px;
                gap:8px;
                flex-wrap:wrap;
                align-items:center;
                padding:8px 0;
            "
        >

            <select
                id="monthSelect"
                style="
                    flex:1;
                    padding:10px;
                    background:var(--bg-sunken);
                    border:1px solid var(--border);
                    border-radius:var(--radius-sm);
                    color:var(--text);
                    font-size:14px;
                "
            >
                <option value="0">يناير</option>
                <option value="1">فبراير</option>
                <option value="2">مارس</option>
                <option value="3">أبريل</option>
                <option value="4">مايو</option>
                <option value="5">يونيو</option>
                <option value="6">يوليو</option>
                <option value="7">أغسطس</option>
                <option value="8">سبتمبر</option>
                <option value="9">أكتوبر</option>
                <option value="10">نوفمبر</option>
                <option value="11">ديسمبر</option>
            </select>

            <select
                id="yearSelect"
                style="
                    flex:1;
                    padding:10px;
                    background:var(--bg-sunken);
                    border:1px solid var(--border);
                    border-radius:var(--radius-sm);
                    color:var(--text);
                    font-size:14px;
                "
            ></select>

            <button
                class="btn btn-amber"
                onclick="applyMonthlyFilter()"
                style="padding:10px 16px;flex:0 0 auto;"
            >
                <i class="fa-solid fa-filter"></i>

                <span
                    data-ar="عرض"
                    data-en="Apply"
                >
                    عرض
                </span>
            </button>

        </div>


        <div
            class="panel"
            id="shiftHistory"
        ></div>

    </div>


    <!-- =====================================================
         SETTINGS
         ===================================================== -->

    <div
        class="view"
        id="view-settings"
    >

        <!-- DEVICES -->

        <div id="settingsSectionDevices">

            <div
                class="section-title"
                style="
                    cursor:pointer;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                "
                onclick="toggleSettingsStations()"
            >

                <span>

                    <span
                        data-ar="الأجهزة"
                        data-en="Devices"
                    >
                        الأجهزة
                    </span>

                    <span
                        id="settingsStationsCount"
                        class="mono"
                        style="
                            color:var(--text-dim);
                            font-weight:400;
                            font-size:12px;
                        "
                    ></span>

                </span>

                <i
                    class="fa-solid fa-chevron-down"
                    id="settingsStationsChevron"
                    style="transition:transform .2s;"
                ></i>

            </div>


            <div
                class="panel"
                id="settingsStations"
                style="display:none;"
            ></div>


            <div
                class="panel"
                style="margin-top:8px;"
            >

                <div
                    style="
                        display:grid;
                        grid-template-columns:1fr 1fr;
                        gap:8px;
                        margin-bottom:8px;
                    "
                >

                    <input
                        type="number"
                        id="bulkSingleRateInput"
                        class="mono"
                        placeholder="سعر Single (ج/ساعة)"
                        min="0"
                        step="0.5"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            background:var(--bg);
                            border:1px solid var(--border);
                            color:var(--text);
                            border-radius:8px;
                            padding:10px;
                        "
                    >

                    <input
                        type="number"
                        id="bulkMultiRateInput"
                        class="mono"
                        placeholder="سعر Multi (ج/ساعة)"
                        min="0"
                        step="0.5"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            background:var(--bg);
                            border:1px solid var(--border);
                            color:var(--text);
                            border-radius:8px;
                            padding:10px;
                        "
                    >

                </div>


                <div
                    style="
                        display:grid;
                        grid-template-columns:1fr 1fr;
                        gap:8px;
                    "
                >

                    <button
                        class="btn btn-amber btn-block"
                        onclick="applyBulkRate('single')"
                    >
                        <i class="fa-solid fa-check-double"></i>

                        <span
                            data-ar="تثبيت Single"
                            data-en="Apply Single"
                        >
                            تثبيت Single
                        </span>

                    </button>

                    <button
                        class="btn btn-teal btn-block"
                        onclick="applyBulkRate('multi')"
                    >
                        <i class="fa-solid fa-check-double"></i>

                        <span
                            data-ar="تثبيت Multi"
                            data-en="Apply Multi"
                        >
                            تثبيت Multi
                        </span>

                    </button>

                </div>

            </div>


            <button
                class="btn btn-ghost btn-block"
                style="margin-top:8px;"
                onclick="openStationManagementSheet()"
            >
                <i class="fa-solid fa-plus"></i>

                <span
                    data-ar="إضافة جهاز"
                    data-en="Add Device"
                >
                    إضافة جهاز
                </span>
            </button>

        </div>


        <!-- PAYMENT METHODS -->

        <div id="settingsSectionPayments">

            <div
                class="section-title"
                data-ar="طرق الدفع"
                data-en="Payment Methods"
            >
                طرق الدفع
            </div>

            <div
                class="panel"
                id="settingsPaymentMethods"
            ></div>

            <button
                class="btn btn-ghost btn-block"
                style="margin-top:8px;"
                onclick="openPaymentMethodSheet()"
            >
                <i class="fa-solid fa-plus"></i>

                <span
                    data-ar="إضافة طريقة دفع"
                    data-en="Add Payment Method"
                >
                    إضافة طريقة دفع
                </span>
            </button>

        </div>


        <!-- SUBSCRIPTION -->

        <div id="settingsSectionSubscription">

            <div
                class="section-title"
                data-ar="الاشتراك"
                data-en="Subscription"
            >
                الاشتراك
            </div>

            <div
                class="panel"
                id="settingsSubscription"
            ></div>

        </div>


        <!-- MENU -->

        <div id="settingsSectionMenu">

            <div
                class="section-title"
                data-ar="قائمة الأكل والمشروبات"
                data-en="Food & Drinks Menu"
            >
                قائمة الأكل والمشروبات
            </div>

            <div
                class="panel"
                id="settingsMenu"
            ></div>

            <button
                class="btn btn-ghost btn-block"
                style="margin-top:8px;"
                onclick="openMenuItemSheet()"
            >
                <i class="fa-solid fa-plus"></i>

                <span
                    data-ar="إضافة صنف"
                    data-en="Add Item"
                >
                    إضافة صنف
                </span>

            </button>

        </div>


        <!-- EMPLOYEES -->

        <div id="settingsSectionEmployees">

            <div
                class="section-title"
                data-ar="الموظفين"
                data-en="Employees"
            >
                الموظفين
            </div>

            <div
                class="panel"
                id="settingsEmployees"
            ></div>

            <button
                class="btn btn-ghost btn-block"
                style="margin-top:8px;"
                onclick="openEmployeeSheet()"
            >
                <i class="fa-solid fa-plus"></i>

                <span
                    data-ar="إضافة موظف"
                    data-en="Add Employee"
                >
                    إضافة موظف
                </span>

            </button>

        </div>


        <!-- BUSINESS -->

        <div id="settingsSectionBusiness">

            <div
                class="section-title"
                data-ar="النشاط"
                data-en="Business"
            >
                النشاط
            </div>

            <button
                class="btn btn-ghost btn-block"
                onclick="switchBusiness()"
            >
                <i class="fa-solid fa-right-left"></i>

                <span
                    data-ar="تبديل النشاط"
                    data-en="Switch Business"
                >
                    تبديل النشاط
                </span>
            </button>

        </div>

    </div>


    <!-- =====================================================
         FAB
         ===================================================== -->

    <button
        class="fab"
        id="fabAddExpense"
        onclick="openExpenseSheet()"
        title="إضافة مصروف"
        type="button"
    >
        <i class="fa-solid fa-wallet"></i>
    </button>


    <!-- =====================================================
         STATION SHEET
         ===================================================== -->

    <div
        class="overlay"
        id="stationOverlay"
    >

        <div class="sheet">

            <div class="sheet-handle"></div>

            <div class="sheet-title">

                <span id="stationSheetTitle">
                    جهاز
                </span>

                <button
                    class="close-x"
                    onclick="closeSheet('stationOverlay')"
                    type="button"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>

            <div id="stationSheetBody"></div>

        </div>

    </div>


    <!-- =====================================================
         TRANSFER SHEET
         ===================================================== -->

    <div
        class="overlay"
        id="transferOverlay"
    >

        <div class="sheet">

            <div class="sheet-handle"></div>

            <div class="sheet-title">

                <span
                    data-ar="نقل الجلسة إلى جهاز آخر"
                    data-en="Transfer Session to Another Device"
                >
                    نقل الجلسة إلى جهاز آخر
                </span>

                <button
                    class="close-x"
                    onclick="closeSheet('transferOverlay')"
                    type="button"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>

            <div id="transferSheetBody"></div>

        </div>

    </div>


    <!-- =====================================================
         STATION MANAGEMENT SHEET
         ===================================================== -->

    <div
        class="overlay"
        id="stationManagementOverlay"
    >

        <div class="sheet">

            <div class="sheet-handle"></div>

            <div class="sheet-title">

                <span
                    id="stationManagementTitle"
                    data-ar="إدارة الجهاز"
                    data-en="Manage Device"
                >
                    إدارة الجهاز
                </span>

                <button
                    class="close-x"
                    onclick="closeSheet('stationManagementOverlay')"
                    type="button"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>

            <input
                type="hidden"
                id="stationManageId"
            >

            <div class="field">

                <label
                    for="stationManageNumber"
                    data-ar="رقم الجهاز"
                    data-en="Device Number"
                >
                    رقم الجهاز
                </label>

                <input
                    type="number"
                    id="stationManageNumber"
                    class="mono"
                    min="1"
                >

            </div>

            <div class="field">

                <label
                    for="stationManageName"
                    data-ar="الاسم (اختياري)"
                    data-en="Name (optional)"
                >
                    الاسم (اختياري)
                </label>

                <input
                    type="text"
                    id="stationManageName"
                    placeholder="مثال: بلايستيشن 5"
                >

            </div>

            <div class="field">

                <label
                    for="stationManageSingleRate"
                    data-ar="سعر Single (ج/ساعة)"
                    data-en="Single Rate (EGP/hr)"
                >
                    سعر Single (ج/ساعة)
                </label>

                <input
                    type="number"
                    id="stationManageSingleRate"
                    class="mono"
                    step="0.5"
                    min="0"
                >

            </div>

            <div class="field">

                <label
                    for="stationManageMultiRate"
                    data-ar="سعر Multi (ج/ساعة)"
                    data-en="Multi Rate (EGP/hr)"
                >
                    سعر Multi (ج/ساعة)
                </label>

                <input
                    type="number"
                    id="stationManageMultiRate"
                    class="mono"
                    step="0.5"
                    min="0"
                >

            </div>

            <button
                class="btn btn-amber btn-block"
                onclick="submitStationManagement()"
            >
                <span
                    data-ar="حفظ"
                    data-en="Save"
                >
                    حفظ
                </span>
            </button>

            <button
                class="btn btn-red btn-block"
                style="margin-top:8px;display:none;"
                id="stationDeleteBtn"
                onclick="deleteStation()"
            >
                <i class="fa-solid fa-trash"></i>

                <span
                    data-ar="حذف الجهاز"
                    data-en="Delete Device"
                >
                    حذف الجهاز
                </span>
            </button>

            <div
                class="error-text"
                id="stationManageError"
            ></div>

        </div>

    </div>


    <!-- =====================================================
         PAYMENT METHOD SHEET
         ===================================================== -->

    <div
        class="overlay"
        id="paymentMethodOverlay"
    >

        <div class="sheet">

            <div class="sheet-handle"></div>

            <div class="sheet-title">

                <span
                    id="paymentMethodTitle"
                    data-ar="إضافة طريقة دفع"
                    data-en="Add Payment Method"
                >
                    إضافة طريقة دفع
                </span>

                <button
                    class="close-x"
                    onclick="closeSheet('paymentMethodOverlay')"
                    type="button"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>

            <input
                type="hidden"
                id="paymentMethodId"
            >

            <div class="field">

                <label
                    for="paymentMethodName"
                    data-ar="اسم طريقة الدفع"
                    data-en="Payment Method Name"
                >
                    اسم طريقة الدفع
                </label>

                <input
                    type="text"
                    id="paymentMethodName"
                    placeholder="مثال: إنستا باي"
                >

            </div>

            <div class="field">

                <label
                    for="paymentMethodIcon"
                    data-ar="الأيقونة"
                    data-en="Icon"
                >
                    الأيقونة
                </label>

                <select id="paymentMethodIcon">

                    <option value="fa-money-bill-wave">💰 كاش</option>
                    <option value="fa-mobile-screen-button">📱 محفظة إلكترونية</option>
                    <option value="fa-credit-card">💳 بطاقة ائتمان</option>
                    <option value="fa-building-columns">🏦 تحويل بنكي</option>
                    <option value="fa-wallet">👛 محفظة رقمية</option>
                    <option value="fa-qrcode">📱 QR Code</option>
                    <option value="fa-apple-pay">🍎 Apple Pay</option>
                    <option value="fa-google-pay">🤖 Google Pay</option>
                    <option value="fa-circle-dollar">🟡 عملة رقمية</option>

                </select>

            </div>

            <div class="field">

                <label
                    for="paymentMethodColor"
                    data-ar="اللون"
                    data-en="Color"
                >
                    اللون
                </label>

                <select id="paymentMethodColor">

                    <option value="badge-teal">أزرق/تركواز</option>
                    <option value="badge-amber">برتقالي</option>
                    <option value="badge-green">أخضر</option>
                    <option value="badge-purple">بنفسجي</option>
                    <option value="badge-red">أحمر</option>

                </select>

            </div>

            <div
                class="field"
                style="
                    display:flex;
                    align-items:center;
                    gap:12px;
                "
            >

                <label style="margin-bottom:0;">

                    <span
                        data-ar="مفعل"
                        data-en="Active"
                    >
                        مفعل
                    </span>

                </label>

                <input
                    type="checkbox"
                    id="paymentMethodActive"
                    checked
                    style="width:auto;"
                >

            </div>

            <button
                class="btn btn-amber btn-block"
                onclick="submitPaymentMethod()"
            >
                <span
                    data-ar="حفظ"
                    data-en="Save"
                >
                    حفظ
                </span>
            </button>

            <button
                class="btn btn-red btn-block"
                style="margin-top:8px;display:none;"
                id="paymentDeleteBtn"
                onclick="deletePaymentMethod()"
            >
                <i class="fa-solid fa-trash"></i>

                <span
                    data-ar="حذف طريقة الدفع"
                    data-en="Delete Payment Method"
                >
                    حذف طريقة الدفع
                </span>
            </button>

            <div
                class="error-text"
                id="paymentMethodError"
            ></div>

        </div>

    </div>


    <!-- =====================================================
         EXPENSE SHEET
         ===================================================== -->

    <div
        class="overlay"
        id="expenseOverlay"
    >

        <div class="sheet">

            <div class="sheet-handle"></div>

            <div class="sheet-title">

                <span
                    data-ar="إضافة مصروف"
                    data-en="Add Expense"
                >
                    إضافة مصروف
                </span>

                <button
                    class="close-x"
                    onclick="closeSheet('expenseOverlay')"
                    type="button"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>

            <div class="field">

                <label
                    for="expenseDesc"
                    data-ar="الوصف"
                    data-en="Description"
                >
                    الوصف
                </label>

                <input
                    type="text"
                    id="expenseDesc"
                    placeholder="مثال: فاتورة كهرباء"
                >

            </div>

            <div class="field">

                <label
                    for="expenseAmount"
                    data-ar="المبلغ"
                    data-en="Amount"
                >
                    المبلغ
                </label>

                <input
                    type="number"
                    id="expenseAmount"
                    class="mono"
                    placeholder="0"
                    min="0"
                    step="0.01"
                >

            </div>

            <button
                class="btn btn-amber btn-block"
                onclick="submitExpense()"
            >
                <span
                    data-ar="حفظ"
                    data-en="Save"
                >
                    حفظ
                </span>
            </button>

            <div
                class="error-text"
                id="expenseError"
            ></div>

        </div>

    </div>


    <!-- =====================================================
         MENU ITEM SHEET
         ===================================================== -->

    <div
        class="overlay"
        id="menuItemOverlay"
    >

        <div class="sheet">

            <div class="sheet-handle"></div>

            <div class="sheet-title">

                <span
                    id="menuItemSheetTitle"
                    data-ar="إضافة صنف للقائمة"
                    data-en="Add Menu Item"
                >
                    إضافة صنف للقائمة
                </span>

                <button
                    class="close-x"
                    onclick="closeSheet('menuItemOverlay')"
                    type="button"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>

            <input
                type="hidden"
                id="menuItemId"
            >

            <div class="field">

                <label
                    for="menuItemName"
                    data-ar="اسم الصنف"
                    data-en="Item Name"
                >
                    اسم الصنف
                </label>

                <input
                    type="text"
                    id="menuItemName"
                >

            </div>

            <div class="field">

                <label
                    for="menuItemPrice"
                    data-ar="السعر"
                    data-en="Price"
                >
                    السعر
                </label>

                <input
                    type="number"
                    id="menuItemPrice"
                    class="mono"
                    min="0"
                    step="0.01"
                >

            </div>

            <div class="field">

                <label
                    for="menuItemCategory"
                    data-ar="التصنيف"
                    data-en="Category"
                >
                    التصنيف
                </label>

                <select id="menuItemCategory">

                    <option value="cold_drinks">🧊 مشروبات باردة</option>
                    <option value="hot_drinks">☕ مشروبات ساخنة</option>
                    <option value="food">🍔 أكل</option>
                    <option value="other">📦 أخرى</option>

                </select>

            </div>

            <button
                class="btn btn-amber btn-block"
                onclick="submitMenuItem()"
            >
                <span
                    data-ar="حفظ"
                    data-en="Save"
                >
                    حفظ
                </span>
            </button>

            <button
                class="btn btn-red btn-block"
                style="margin-top:8px;display:none;"
                id="menuDeleteBtn"
                onclick="deleteMenuItem()"
            >
                <i class="fa-solid fa-trash"></i>

                <span
                    data-ar="حذف الصنف"
                    data-en="Delete Item"
                >
                    حذف الصنف
                </span>
            </button>

            <div
                class="error-text"
                id="menuItemError"
            ></div>

        </div>

    </div>


    <!-- =====================================================
         EMPLOYEE SHEET
         ===================================================== -->

    <div
        class="overlay"
        id="employeeOverlay"
    >

        <div class="sheet">

            <div class="sheet-handle"></div>

            <div class="sheet-title">

                <span
                    id="employeeSheetTitle"
                    data-ar="إضافة موظف"
                    data-en="Add Employee"
                >
                    إضافة موظف
                </span>

                <button
                    class="close-x"
                    onclick="closeSheet('employeeOverlay')"
                    type="button"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>

            <input
                type="hidden"
                id="employeeId"
                value=""
            >

            <div class="field">

                <label
                    for="employeeName"
                    data-ar="الاسم"
                    data-en="Name"
                >
                    الاسم
                </label>

                <input
                    type="text"
                    id="employeeName"
                    autocomplete="name"
                >

            </div>

            <div class="field">

                <label
                    for="employeePin"
                    data-ar="PIN (4-6 أرقام)"
                    data-en="PIN (4-6 digits)"
                >
                    PIN (4-6 أرقام)
                </label>

                <input
                    type="password"
                    inputmode="numeric"
                    maxlength="6"
                    id="employeePin"
                    class="mono"
                    autocomplete="off"
                >

            </div>

            <div class="field">

                <label
                    data-ar="الصلاحيات"
                    data-en="Permissions"
                >
                    الصلاحيات
                </label>

                <label
                    style="
                        display:flex;
                        align-items:center;
                        gap:8px;
                        font-weight:500;
                        color:var(--text);
                        margin-bottom:6px;
                    "
                >
                    <input
                        type="checkbox"
                        id="permStations"
                        checked
                    >

                    <span
                        data-ar="إدارة الأجهزة والجلسات"
                        data-en="Manage devices & sessions"
                    >
                        إدارة الأجهزة والجلسات
                    </span>

                </label>


                <label
                    style="
                        display:flex;
                        align-items:center;
                        gap:8px;
                        font-weight:500;
                        color:var(--text);
                        margin-bottom:6px;
                    "
                >
                    <input
                        type="checkbox"
                        id="permShift"
                    >

                    <span
                        data-ar="إقفال الشيفت"
                        data-en="Close shift"
                    >
                        إقفال الشيفت
                    </span>

                </label>


                <label
                    style="
                        display:flex;
                        align-items:center;
                        gap:8px;
                        font-weight:500;
                        color:var(--text);
                        margin-bottom:6px;
                    "
                >
                    <input
                        type="checkbox"
                        id="permPrices"
                    >

                    <span
                        data-ar="تعديل أسعار وأجهزة (إضافة/تعديل/حذف)"
                        data-en="Edit devices & prices (add/edit/delete)"
                    >
                        تعديل أسعار وأجهزة (إضافة/تعديل/حذف)
                    </span>

                </label>


                <label
                    style="
                        display:flex;
                        align-items:center;
                        gap:8px;
                        font-weight:500;
                        color:var(--text);
                        margin-bottom:6px;
                    "
                >
                    <input
                        type="checkbox"
                        id="permMenu"
                    >

                    <span
                        data-ar="التحكم في الأصناف والمشروبات"
                        data-en="Manage menu items & drinks"
                    >
                        التحكم في الأصناف والمشروبات
                    </span>

                </label>


                <label
                    style="
                        display:flex;
                        align-items:center;
                        gap:8px;
                        font-weight:500;
                        color:var(--text);
                        margin-bottom:6px;
                    "
                >
                    <input
                        type="checkbox"
                        id="permSettings"
                    >

                    <span
                        data-ar="الدخول لطرق الدفع والاشتراك وبيانات النشاط"
                        data-en="Access payment methods, subscription & business info"
                    >
                        الدخول لطرق الدفع والاشتراك وبيانات النشاط
                    </span>

                </label>


                <label
                    style="
                        display:flex;
                        align-items:center;
                        gap:8px;
                        font-weight:500;
                        color:var(--text);
                    "
                >
                    <input
                        type="checkbox"
                        id="permEmployees"
                    >

                    <span
                        data-ar="إدارة الموظفين وصلاحياتهم"
                        data-en="Manage employees & their permissions"
                    >
                        إدارة الموظفين وصلاحياتهم
                    </span>

                </label>

            </div>


            <p
                style="
                    font-size:11.5px;
                    color:var(--text-faint);
                    margin-bottom:12px;
                "
                data-ar="ملاحظة أمان: حسابات المالك تعتمد على Supabase Auth. بيانات الموظفين وصلاحياتهم تظل مرتبطة بالنشاط داخل قاعدة البيانات."
                data-en="Security note: Owner accounts use Supabase Auth. Employee data and permissions remain associated with the business in the database."
            >
                ملاحظة أمان: حسابات المالك تعتمد على Supabase Auth. بيانات الموظفين وصلاحياتهم تظل مرتبطة بالنشاط داخل قاعدة البيانات.
            </p>


            <button
                class="btn btn-amber btn-block"
                onclick="submitEmployee()"
            >
                <span
                    data-ar="حفظ"
                    data-en="Save"
                >
                    حفظ
                </span>
            </button>


            <button
                class="btn btn-danger-sm btn-block"
                id="employeeDeleteBtn"
                style="display:none;margin-top:8px;"
                onclick="deleteEmployeeFromSheet()"
            >
                <i class="fa-solid fa-trash"></i>

                <span
                    data-ar="حذف الموظف"
                    data-en="Delete Employee"
                >
                    حذف الموظف
                </span>
            </button>

            <div
                class="error-text"
                id="employeeError"
            ></div>

        </div>

    </div>


    <!-- =====================================================
         CLOSE SHIFT SHEET
         ===================================================== -->

    <div
        class="overlay"
        id="closeShiftOverlay"
    >

        <div class="sheet">

            <div class="sheet-handle"></div>

            <div class="sheet-title">

                <span
                    data-ar="تأكيد إقفال الشيفت"
                    data-en="Confirm Close Shift"
                >
                    تأكيد إقفال الشيفت
                </span>

                <button
                    class="close-x"
                    onclick="closeSheet('closeShiftOverlay')"
                    type="button"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>

            <div
                class="panel"
                id="closeShiftSummary"
                style="margin-bottom:14px;"
            ></div>

            <button
                class="btn btn-amber btn-block"
                onclick="confirmCloseShift()"
            >
                <i class="fa-solid fa-lock"></i>

                <span
                    data-ar="تأكيد الإقفال"
                    data-en="Confirm Close"
                >
                    تأكيد الإقفال
                </span>

            </button>

        </div>

    </div>


    <!-- =====================================================
         SHIFT DETAILS
         ===================================================== -->

    <div
        class="overlay"
        id="shiftDetailsOverlay"
    >

        <div class="sheet">

            <div class="sheet-handle"></div>

            <div class="sheet-title">

                <span
                    data-ar="تفاصيل الشيفت"
                    data-en="Shift Details"
                >
                    تفاصيل الشيفت
                </span>

                <button
                    class="close-x"
                    onclick="closeSheet('shiftDetailsOverlay')"
                    type="button"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>

            <div
                class="panel"
                id="shiftDetailsSummary"
                style="margin-bottom:14px;"
            ></div>

        </div>

    </div>


    <!-- =====================================================
         CREATE BUSINESS FROM SETUP
         ===================================================== -->

    <div
        class="overlay"
        id="createBusinessSheetFromSetup"
    >

        <div class="sheet">

            <div class="sheet-handle"></div>

            <div class="sheet-title">

                <span
                    data-ar="إنشاء نشاط جديد"
                    data-en="Create New Business"
                >
                    إنشاء نشاط جديد
                </span>

                <button
                    class="close-x"
                    onclick="closeSheet('createBusinessSheetFromSetup')"
                    type="button"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>


            <p class="create-business-note">
                أنشئ نشاطك الجديد ثم استخدم كود النشاط لتسجيل الدخول.
            </p>


            <div class="field">

                <label
                    for="newBizCodeSetup"
                    data-ar="كود النشاط"
                    data-en="Business Code"
                >
                    كود النشاط
                </label>

                <input
                    type="text"
                    id="newBizCodeSetup"
                    class="mono"
                    placeholder="CAFE01"
                    maxlength="30"
                    autocomplete="off"
                    autocapitalize="characters"
                    spellcheck="false"
                    style="text-transform:uppercase"
                >

            </div>


            <div class="field">

                <label
                    for="newBizNameSetup"
                    data-ar="اسم النشاط"
                    data-en="Business Name"
                >
                    اسم النشاط
                </label>

                <input
                    type="text"
                    id="newBizNameSetup"
                    placeholder="مثال: DORAK Gaming"
                    autocomplete="organization"
                >

            </div>


            <div class="field">

                <label
                    for="newBizPhoneSetup"
                    data-ar="رقم الهاتف (اختياري)"
                    data-en="Phone (optional)"
                >
                    رقم الهاتف (اختياري)
                </label>

                <input
                    type="tel"
                    id="newBizPhoneSetup"
                    placeholder="01xxxxxxxxx"
                    autocomplete="tel"
                    inputmode="tel"
                >

            </div>


            <div class="field">

                <label
                    for="newBizStationsSetup"
                    data-ar="عدد الأجهزة"
                    data-en="Number of Devices"
                >
                    عدد الأجهزة
                </label>

                <input
                    type="number"
                    id="newBizStationsSetup"
                    class="mono"
                    min="1"
                    max="100"
                    value="4"
                    inputmode="numeric"
                >

            </div>


            <div
                style="
                    background:var(--bg-sunken);
                    border-radius:var(--radius-sm);
                    padding:10px;
                    margin-bottom:12px;
                    font-size:11px;
                    color:var(--text-faint);
                    line-height:1.7;
                "
            >
                PIN المالك الافتراضي عند الإنشاء هو
                <strong class="mono">0000</strong>
                وسيُستخدم لأول ربط لحساب المالك.
            </div>


            <button
                class="btn btn-amber btn-block"
                onclick="submitCreateBusinessFromSetup()"
            >
                <i class="fa-solid fa-building-circle-check"></i>

                <span
                    data-ar="إنشاء النشاط"
                    data-en="Create Business"
                >
                    إنشاء النشاط
                </span>

            </button>


            <div
                class="error-text"
                id="createBizErrorSetup"
            ></div>

        </div>

    </div>


    <!-- =====================================================
         TOAST / PRINT
         ===================================================== -->

    <div
        class="toast"
        id="toast"
    ></div>

    <div
        id="printArea"
        style="display:none;"
    ></div>


    <!-- =====================================================
         BOTTOM NAV
         ===================================================== -->

    <div class="bottom-nav">

        <button
            class="nav-btn active"
            data-view="view-dashboard"
            onclick="navigateTo('view-dashboard')"
            type="button"
        >
            <i class="fa-solid fa-chart-simple"></i>

            <span
                data-ar="الرئيسية"
                data-en="Home"
            >
                الرئيسية
            </span>

        </button>


        <button
            class="nav-btn"
            data-view="view-stations"
            onclick="navigateTo('view-stations')"
            type="button"
        >
            <i class="fa-solid fa-gamepad"></i>

            <span
                data-ar="الأجهزة"
                data-en="Devices"
            >
                الأجهزة
            </span>

        </button>


        <button
            class="nav-btn"
            data-view="view-shift"
            onclick="navigateTo('view-shift')"
            type="button"
        >
            <i class="fa-solid fa-clock"></i>

            <span
                data-ar="الشيفت"
                data-en="Shift"
            >
                الشيفت
            </span>

        </button>


        <button
            class="nav-btn"
            data-view="view-settings"
            onclick="navigateTo('view-settings')"
            type="button"
        >
            <i class="fa-solid fa-gear"></i>

            <span
                data-ar="الإعدادات"
                data-en="Settings"
            >
                الإعدادات
            </span>

        </button>

    </div>

</div>

</body>
</html>
