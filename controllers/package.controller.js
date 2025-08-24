const { supabaseAdmin } = require("../config/supabase");
const { uploadToSupabase } = require("../config/upload-supabase");

const packageController = {
  addPackages: async (req, res) => {
    try {
      const { packages, companyId } = req.body;
      const userIdToUse = req.profile?.id;

      if (!Array.isArray(packages)) return res.status(400).json({ message: 'Invalid payload' });

      let finalCompanyId = companyId;

      // If no companyId provided, try to get it from user's company
      if (!finalCompanyId && userIdToUse) {
        const userIntId = userIdToUse;
        const { data: company } = await supabaseAdmin
          .from('companypages')
          .select('id')
          .eq('userId', userIntId)
          .single();

        if (company) {
          finalCompanyId = company.id;
        }
      }

      if (!finalCompanyId) {
        return res.status(400).json({ message: 'Company ID is required' });
      }

      for (let i = 0; i < packages.length; i++) {
        const { id, updated, title, price, image } = packages[i];
        const file = req.files?.find((f) => f.fieldname === `packages[${i}][image]`);

        if (id && updated) {
          await supabaseAdmin.from('packages').update({ title, price }).eq('id', id);

          if (file) {
            const keyPrefix = `company-${finalCompanyId}/packages/${id}`;
            const { publicUrl } = await uploadToSupabase(file, 'packages', keyPrefix);
            await supabaseAdmin.from('packages').update({ image: publicUrl }).eq('id', id);
          } else if (typeof image === 'string') {
            await supabaseAdmin.from('packages').update({ image }).eq('id', id);
          }
          continue;
        }

        if (id && !updated) continue;

        const { data: created, error } = await supabaseAdmin
          .from('packages')
          .insert({ companyId: finalCompanyId, title, price })
          .select()
          .single();
        if (error) return res.status(500).json({ message: 'Internal server error.' });

        const packageFolder = path.join(PACKAGE_UPLOADS, String(created.id));
        if (!fs.existsSync(packageFolder)) fs.mkdirSync(packageFolder, { recursive: true });

        if (file) {
          const keyPrefix = `company-${finalCompanyId}/packages/${created.id}`;
          const { publicUrl } = await uploadToSupabase(file, 'packages', keyPrefix);
          await supabaseAdmin.from('packages').update({ image: publicUrl }).eq('id', created.id);
        } else if (typeof image === 'string') {
          await supabaseAdmin.from('packages').update({ image }).eq('id', created.id);
        }
      }

      const { data: allPackages } = await supabaseAdmin.from('packages').select('*').eq('companyId', finalCompanyId).limit(3);
      const { data: company } = await supabaseAdmin.from('companypages').select('*').eq('id', finalCompanyId).single();

      return res.status(201).json({ message: 'Packages processed successfully.', packages: allPackages || [], company });
    } catch (error) {
      console.error("Error processing packages:", error);
      return res.status(500).json({ message: "Internal server error." });
    }
  },

  getPackages: async (req, res) => {
    try {
      const { companyId } = req.query;
      const userIdToUse = req.profile?.id;

      let finalCompanyId = companyId;

      // If no companyId provided, try to get it from user's company
      if (!finalCompanyId && userIdToUse) {
        const userIntId = userIdToUse;
        const { data: company } = await supabaseAdmin
          .from('companypages')
          .select('id')
          .eq('userId', userIntId)
          .single();

        if (company) {
          finalCompanyId = company.id;
        }
      }

      if (!finalCompanyId) {
        return res.status(400).json({ message: 'Company ID is required' });
      }

      const { data: allPackages } = await supabaseAdmin.from('packages').select('*').eq('companyId', finalCompanyId).limit(3);
      const { data: company } = await supabaseAdmin.from('companypages').select('*').eq('id', finalCompanyId).single();
      return res.status(200).json({ message: 'Packages retrieved successfully.', packages: allPackages || [], company });
    } catch (error) {
      console.error('Error processing packages:', error);
      return res.status(500).json({ message: 'Internal server error.' });
    }
  },
};

module.exports = packageController;
