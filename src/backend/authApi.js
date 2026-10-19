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

// El trigger on_auth_user_created crea el perfil sin roles.
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw toAppError(error);
  return toAppUser(data.user);
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
