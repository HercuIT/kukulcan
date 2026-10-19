import { createClient } from "@supabase/supabase-js";

// Cliente único de Supabase. La URL y la clave publicable vienen de .env.local
// (o de la configuración de CI/hosting); la clave es pública porque RLS protege los datos.
export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY,
);
