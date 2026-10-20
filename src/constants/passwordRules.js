// Reglas de contraseña (HTE-107), compartidas por el registro (/register) y /set-password.
// Son las mismas que aplica Supabase Auth en el servidor: minimum_password_length = 8 y
// password_requirements = "letters_digits" (supabase/config.toml y el panel del proyecto). 72 es
// el máximo que bcrypt usa de una contraseña. Las comprobaciones del formulario solo adelantan el
// error; quien manda es Supabase.
export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 72,
};

// Correo: obligatorio, formato nombre@dominio.tld y como mucho 254 caracteres (RFC 5321).
export const EMAIL_MAX_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lo que se envía a Supabase: sin espacios alrededor y en minúsculas.
export const normalizeEmail = (email) =>
  String(email ?? "")
    .trim()
    .toLowerCase();

/** @returns {"emailRequired" | "emailInvalid" | null} */
export function checkEmail(email) {
  const value = normalizeEmail(email);
  if (!value) return "emailRequired";
  if (value.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(value))
    return "emailInvalid";
  return null;
}

/**
 * Reglas que la contraseña no cumple, en el orden de la lista que ve el usuario.
 * "length": entre minLength y maxLength caracteres; "letter": al menos una letra (A-Z, como
 * Supabase); "digit": al menos un número.
 * @returns {Array<"length" | "letter" | "digit">}
 */
export function checkPassword(password) {
  const value = String(password ?? "");
  /** @type {Array<"length" | "letter" | "digit">} */
  const failed = [];
  if (
    value.length < PASSWORD_RULES.minLength ||
    value.length > PASSWORD_RULES.maxLength
  )
    failed.push("length");
  if (!/[A-Za-z]/.test(value)) failed.push("letter");
  if (!/[0-9]/.test(value)) failed.push("digit");
  return failed;
}
