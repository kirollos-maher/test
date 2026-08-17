/* DORAK AUTH LAYER v1
   Requires the existing Supabase v2 client as `supabaseClient`.
*/

let dorakAuthUser = null;
let dorakMembership = null;

async function dorakAuthGetSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data?.session || null;
}

async function dorakAuthSignIn(email, password) {
    email = String(email || '').trim().toLowerCase();
    if (!email || !password) throw new Error('EMAIL_PASSWORD_REQUIRED');

    const { data, error } =
        await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) throw error;
    dorakAuthUser = data.user;
    return data;
}

async function dorakAuthSignOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    dorakAuthUser = null;
    dorakMembership = null;
}

async function dorakAuthLoadMemberships() {
    const { data, error } =
        await supabaseClient.rpc('my_business_memberships');
    if (error) throw error;
    return data || [];
}

async function dorakAuthClaimOwner(businessCode, ownerPin, displayName) {
    const { data, error } = await supabaseClient.rpc(
        'claim_business_as_owner',
        {
            p_business_code: String(businessCode || '').trim().toUpperCase(),
            p_owner_pin: String(ownerPin || '').trim(),
            p_display_name: String(displayName || '').trim() || null
        }
    );
    if (error) throw error;
    dorakMembership = data;
    return data;
}

async function dorakAuthBootstrap() {
    const session = await dorakAuthGetSession();
    if (!session?.user) {
        dorakAuthUser = null;
        dorakMembership = null;
        return { session: null, user: null, memberships: [] };
    }

    dorakAuthUser = session.user;
    const memberships = await dorakAuthLoadMemberships();
    return { session, user: dorakAuthUser, memberships };
}

function dorakAuthFriendlyError(error) {
    const msg = String(error?.message || error || '');
    if (/invalid login credentials/i.test(msg))
        return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    if (/email not confirmed/i.test(msg))
        return 'أكد البريد الإلكتروني أولاً.';
    if (/too many requests|rate limit/i.test(msg))
        return 'محاولات كثيرة. حاول بعد قليل.';
    if (msg.includes('BUSINESS_ALREADY_CLAIMED'))
        return 'النشاط مربوط بحساب مالك آخر بالفعل.';
    if (msg.includes('INVALID_OWNER_CREDENTIAL'))
        return 'بيانات مالك النشاط غير صحيحة.';
    if (msg.includes('BUSINESS_NOT_FOUND'))
        return 'النشاط غير موجود.';
    return 'حصل خطأ في تسجيل الدخول. حاول مرة أخرى.';
}

window.DorakAuth = {
    getSession: dorakAuthGetSession,
    signIn: dorakAuthSignIn,
    signOut: dorakAuthSignOut,
    loadMemberships: dorakAuthLoadMemberships,
    claimOwner: dorakAuthClaimOwner,
    bootstrap: dorakAuthBootstrap,
    friendlyError: dorakAuthFriendlyError
};
