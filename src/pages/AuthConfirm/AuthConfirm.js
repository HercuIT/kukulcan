import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmEmail, resendConfirmation } from "../../backend/authApi";
import { UI_STRINGS } from "../../constants/uiStrings";
import { checkEmail, normalizeEmail } from "../../constants/passwordRules";
import { useCooldown } from "../../hooks/useCooldown";
import Logo from "../../components/Logo/Logo";
import "../../styles/LoginStyle/LoginStyle.css";
import "../../styles/RegisterStyle/RegisterStyle.css";

const S = UI_STRINGS.authConfirm;

// El enlace del correo trae ?token_hash=…&type=email (supabase/templates/confirmation.html). Un
// token_hash es un hash hexadecimal; cualquier otra cosa se trata como enlace inválido sin llamar a
// Supabase.
export function readConfirmLink(params) {
  const tokenHash = params.get("token_hash") || "";
  const type = params.get("type") || "email";
  const valid =
    /^[A-Za-z0-9_-]{8,200}$/.test(tokenHash) &&
    (type === "email" || type === "signup");
  return valid ? tokenHash : null;
}

// Sin respuesta de Supabase (sin red, servidor caído): se puede reintentar. Cualquier otro error
// (enlace caducado, ya usado, inválido) pide un enlace nuevo.
const isNetworkError = (err) =>
  err?.cause?.name === "AuthRetryableFetchError" ||
  err?.cause?.status === 0 ||
  err instanceof TypeError;

/**
 * Destino del enlace de confirmación (HTE-107). Confirma la cuenta con verifyOtp; Supabase abre la
 * sesión y App.js pasa a las rutas con sesión (Home). Con el enlace caducado o usado ofrece
 * reenviar el correo.
 */
export default function AuthConfirm() {
  const [params] = useSearchParams();
  const tokenHash = readConfirmLink(params);
  const [state, setState] = useState(tokenHash ? "confirming" : "expired");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [cooldown, startCooldown] = useCooldown();
  // El token sirve una sola vez: StrictMode (en desarrollo) monta el efecto dos veces y la segunda
  // llamada lo daría por usado.
  const attempted = useRef(null);

  const confirm = useCallback(async () => {
    setState("confirming");
    try {
      await confirmEmail(tokenHash);
      setState("success");
    } catch (err) {
      console.error("Error al confirmar el correo:", err);
      setState(isNetworkError(err) ? "network" : "expired");
    }
  }, [tokenHash]);

  useEffect(() => {
    if (!tokenHash || attempted.current === tokenHash) return;
    attempted.current = tokenHash;
    confirm();
  }, [tokenHash, confirm]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (cooldown > 0) return;
    setNotice("");
    setError("");
    if (checkEmail(email)) {
      setError(S.errors.emailInvalid);
      return;
    }
    try {
      await resendConfirmation(normalizeEmail(email));
      setNotice(S.resent);
      startCooldown();
    } catch (err) {
      console.error("Error al reenviar la confirmación:", err);
      setError(
        err.code === "rate-limited" ? S.errors.rateLimited : S.errors.generic,
      );
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <Logo size="lg" />
        {state === "confirming" && <p role="status">{S.confirming}</p>}
        {state === "success" && <p role="status">{S.success}</p>}
        {state === "network" && (
          <>
            <p className="error-message" role="alert">
              {S.errors.network}
            </p>
            <button type="button" onClick={confirm}>
              {S.retry}
            </button>
          </>
        )}
        {state === "expired" && (
          <form onSubmit={handleResend} noValidate>
            <p>{S.errors.expired}</p>
            <div className="kk-field">
              <label htmlFor="confirm-email">{S.email}</label>
              <input
                id="confirm-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" disabled={cooldown > 0}>
              {cooldown > 0 ? S.resendIn(cooldown) : S.resend}
            </button>
            {notice && (
              <p className="kk-notice" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </form>
        )}
        {state !== "confirming" && state !== "success" && (
          <p className="kk-switch">
            <Link to="/">{S.backToLogin}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
