import { useCallback, useEffect, useState } from "react";

// Espera entre reenvíos del correo de confirmación (HTE-107). Supabase admite un correo cada 60 s
// por dirección (max_frequency en supabase/config.toml); el botón espera lo mismo.
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Cuenta atrás en segundos. Devuelve [segundosRestantes, start]; start() la reinicia desde
 * `seconds`. Mientras quedan segundos el botón de reenviar está deshabilitado.
 * @returns {[number, () => void]}
 */
export function useCooldown(seconds = RESEND_COOLDOWN_SECONDS) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const start = useCallback(() => setRemaining(seconds), [seconds]);
  return [remaining, start];
}
