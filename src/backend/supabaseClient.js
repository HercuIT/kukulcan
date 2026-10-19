import { createClient } from "@supabase/supabase-js";

// Cliente único de Supabase. La URL y la clave publicable vienen de .env.local
// (o de la configuración de CI/hosting); la clave es pública porque RLS protege los datos.
const url = process.env.REACT_APP_SUPABASE_URL;
const publishableKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY;

// Sin estas variables createClient falla con un error genérico; este dice qué falta y dónde.
if (!url || !publishableKey) {
  throw new Error(
    "Faltan REACT_APP_SUPABASE_URL o REACT_APP_SUPABASE_PUBLISHABLE_KEY: copia .env.example a " +
      ".env.local (o defínelas en el build de CI/hosting) y reinicia npm start.",
  );
}

export const supabase = createClient(url, publishableKey);
