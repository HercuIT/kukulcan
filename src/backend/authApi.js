import { supabase } from "./supabaseClient";
import { toAppError, toAppUser } from "./mappers";

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw toAppError(error);
  return toAppUser(data.user);
}

// Página a la que lleva el enlace del correo de confirmación (HTE-107). Sale del origen actual, así
// que sirve en local, en producción y en las vistas previas sin variables de entorno nuevas (cada
// origen debe estar en las Redirect URLs de Supabase).
export const confirmRedirectUrl = () =>
  `${window.location.origin}/auth/confirm`;

/**
 * Registra la cuenta sin confirmar: Supabase manda el correo con el enlace y no crea sesión. El
 * perfil (sin roles) lo crea el trigger on_auth_user_confirmed cuando se abre el enlace. Con la
 * confirmación activa, un correo ya registrado no da error (Supabase no revela quién tiene cuenta).
 */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: confirmRedirectUrl() },
  });
  if (error) throw toAppError(error);
  return toAppUser(data.user);
}

// Vuelve a mandar el correo de confirmación (Supabase lo permite cada 60 s por correo).
export async function resendConfirmation(email) {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: confirmRedirectUrl() },
  });
  if (error) throw toAppError(error);
}

// Confirma la cuenta con el token_hash del enlace; si sale bien Supabase abre la sesión.
export async function confirmEmail(tokenHash) {
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (error) throw toAppError(error);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw toAppError(error);
}

/**
 * Llama a callback(user | null) con la sesión inicial y en cada cambio de usuario.
 * Ignora eventos que no cambian de usuario (p. ej. TOKEN_REFRESHED) y difiere el callback
 * con setTimeout: Supabase recomienda no llamar a otras APIs dentro de onAuthStateChange.
 * Devuelve la función para cancelar la suscripción.
 */
export function onSessionChange(callback) {
  let lastUserId;
  let active = true;
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    const user = toAppUser(session?.user);
    const userId = user?.uid ?? null;
    if (userId === lastUserId) return;
    lastUserId = userId;
    setTimeout(() => active && callback(user), 0);
  });
  return () => {
    active = false;
    subscription.unsubscribe();
  };
}

// Cambia la contraseña del usuario con sesión (p. ej. tras abrir el enlace de recuperación).
export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw toAppError(error);
}

// Roles del usuario con la misma forma que el antiguo documento roles/{uid}.
export async function getMyRoles(uid) {
  const { data, error } = await supabase
    .from("profiles")
    .select("email, designer, reviewer, deployer")
    .eq("id", uid)
    .maybeSingle();
  if (error) throw toAppError(error);
  return data ?? {};
}
