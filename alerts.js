-- ============================================================
-- إصلاح trial_ips وإنشاء publication
-- ============================================================

-- 1) حذف السياسات القديمة
DROP POLICY IF EXISTS "Allow admins to manage trial_ips" ON trial_ips;
DROP POLICY IF EXISTS "Prevent regular users from modifying trial_ips" ON trial_ips;
DROP POLICY IF EXISTS "Admins can manage trial_ips" ON trial_ips;
DROP POLICY IF EXISTS "No one else can access trial_ips" ON trial_ips;

-- 2) إنشاء الجدول (إذا لم يكن موجوداً)
CREATE TABLE IF NOT EXISTS trial_ips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3) إضافة UNIQUE constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'trial_ips_business_id_ip_address_key'
    ) THEN
        ALTER TABLE trial_ips ADD CONSTRAINT trial_ips_business_id_ip_address_key 
        UNIQUE (business_id, ip_address);
    END IF;
END $$;

-- 4) تفعيل RLS
ALTER TABLE trial_ips ENABLE ROW LEVEL SECURITY;

-- 5) السياسة الوحيدة المطلوبة (تسمح للأجهزة النشطة)
CREATE POLICY "Allow active devices to access trial_ips" ON trial_ips
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM devices d
            WHERE d.business_id = trial_ips.business_id
            AND d.is_active = true
            AND d.revoked = false
        )
    );

-- 6) إنشاء publication للتحديثات اللحظية
CREATE PUBLICATION IF NOT EXISTS dorak_realtime FOR TABLE 
    sessions,
    session_orders,
    stations,
    session_segments,
    businesses,
    devices,
    shifts,
    activation_codes,
    trial_ips
WITH (publish = 'insert, update, delete');
