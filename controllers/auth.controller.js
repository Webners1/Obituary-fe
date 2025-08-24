const httpStatus = require("http-status-codes").StatusCodes;
const { supabase, supabaseAdmin } = require("../config/supabase");

const authController = {
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(httpStatus.BAD_REQUEST).json({ error: 'Email and password are required' });
      }

      // Authenticate with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        return res.status(httpStatus.UNAUTHORIZED).json({ error: 'Invalid credentials' });
      }

      // Fetch or sync user profile from your profiles table by authUserId
      let { data: userProfile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('authUserId', authData.user.id)
        .maybeSingle();

      if (!userProfile) {
        const now = new Date().toISOString();
        const payload = {
          authUserId: authData.user.id,
          email,
          name: authData.user.user_metadata?.full_name || '',
          role: 'User',
          slugKey: `${email.split('@')[0]}-${Date.now()}`,
          createdTimestamp: now,
          modifiedTimestamp: now
        };
        const { data: created } = await supabaseAdmin.from('profiles').insert(payload).select('*').single();
        userProfile = created;
      }

      if (userProfile.isBlocked) {
        return res.status(httpStatus.FORBIDDEN).json({ error: 'Your account has been blocked. Please contact administrator.' });
      }

      res.status(httpStatus.OK).json({
        message: 'Login Successful!',
        user: userProfile,
        session: authData.session,
        access_token: authData.session?.access_token
      });
    } catch (e) {
      console.error('Auth login error:', e);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Login failed' });
    }
  },

  logout: async (req, res) => {
    try {
      // Client should discard tokens; server doesn’t need to do anything for JWT logout
      res.status(httpStatus.OK).json({ message: "Logged out successfully!" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ error: "Failed to log out" });
    }
  },
};

module.exports = authController;