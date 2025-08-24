const httpStatus = require("http-status-codes").StatusCodes;
const { supabaseAdmin } = require("../config/supabase");

module.exports = async (req, res, next) => {
  try {
    // Accept Supabase access token from Authorization: Bearer <token> or access-token header
    const authHeader = req.header("authorization") || req.header("Authorization");
    const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const accessToken = bearerToken || req.header("access-token");

    if (!accessToken) {
      return res.status(httpStatus.UNAUTHORIZED).json({ error: "Access denied. No token provided" });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data?.user) {
      return res.status(httpStatus.UNAUTHORIZED).json({ error: "Access denied. Invalid token" });
    }

    const authUser = data.user;

    // Prefer mapping by authUserId (uuid) if the column exists; fallback to email
    let profile = null;
    let profileErr = null;

    // Try by authUserId
    const { data: byAuthId, error: byAuthErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('authUserId', authUser.id)
      .maybeSingle();

    if (byAuthErr) profileErr = byAuthErr;
    if (byAuthId) profile = byAuthId;

    // Fallback by email if not found
    if (!profile && authUser.email) {
      const { data: byEmail, error: byEmailErr } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('email', authUser.email)
        .maybeSingle();
      if (byEmailErr) profileErr = byEmailErr;
      if (byEmail) profile = byEmail;
    }

    // Auto-sync: if still not found, create a minimal profile
    if (!profile) {
      const now = new Date().toISOString();
      const payload = {
        authUserId: authUser.id,
        email: authUser.email,
        name: authUser.user_metadata?.full_name || '',
        role: 'User',
        slugKey: `${(authUser.email || 'user').split('@')[0]}-${Date.now()}`,
        createdTimestamp: now,
        modifiedTimestamp: now,
      };
      const { data: created, error: insErr } = await supabaseAdmin
        .from('profiles')
        .insert(payload)
        .select('*')
        .single();
      if (insErr) {
        return res.status(httpStatus.UNAUTHORIZED).json({ error: "Access denied. Unable to sync profile" });
      }
      profile = created;
    } else if (!profile.authUserId) {
      // Ensure mapping is saved if row pre-existed without authUserId
      await supabaseAdmin.from('profiles').update({ authUserId: authUser.id }).eq('id', profile.id);
      profile.authUserId = authUser.id;
    }

    if (profile.isBlocked) {
      return res.status(httpStatus.FORBIDDEN).json({ error: "Your account has been blocked. Please contact administrator." });
    }

    // Backwards-compat: set both req.profile and req.user
    req.profile = profile; // contains integer id
    req.user = profile;

    return next();
  } catch (e) {
    console.error("authentication middleware error:", e);
    return res.status(httpStatus.UNAUTHORIZED).json({ error: "Access denied" });
  }
};
