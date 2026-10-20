import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { resendConfirmation, signIn } from "../../backend/authApi";
import "../../styles/LoginStyle/LoginStyle.css";
import "../../styles/RegisterStyle/RegisterStyle.css";
import { UI_STRINGS } from "../../constants/uiStrings";
import { normalizeEmail } from "../../constants/passwordRules";
import { useCooldown } from "../../hooks/useCooldown";
import Logo from "../../components/Logo/Logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // La cuenta existe pero no confirmó su correo (HTE-107): se ofrece reenviar el enlace.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [cooldown, startCooldown] = useCooldown();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e?.preventDefault();
    setError("");
    setNotice("");
    setUnconfirmed(false);
    if (!email || !password) {
      setError(UI_STRINGS.login.errors.porFavorCompletaAmbosCampos);
      return;
    }
    try {
      // Inicia sesión con Supabase Auth; los roles se leen de profiles en App.js
      await signIn(email, password);

      // Si todo es correcto, navega a la página principal
      navigate("/");
    } catch (err) {
      console.error("Error de inicio de sesión:", err);
      if (err.code === "email-not-confirmed") {
        setError(UI_STRINGS.login.errors.emailNotConfirmed);
        setUnconfirmed(true);
      } else if (err.code === "invalid-credentials") {
        setError(UI_STRINGS.login.errors.correoOContrasenaIncorrectosPor);
      } else {
        setError(UI_STRINGS.login.errors.ocurrioUnErrorAlIntentar);
      }
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setNotice("");
    try {
      await resendConfirmation(normalizeEmail(email));
      setNotice(UI_STRINGS.login.messages.resent);
      startCooldown();
    } catch (err) {
      console.error("Error al reenviar la confirmación:", err);
      setError(
        err.code === "rate-limited"
          ? UI_STRINGS.login.errors.rateLimited
          : UI_STRINGS.login.errors.ocurrioUnErrorAlIntentar,
      );
    }
  };

  // También hemos eliminado el fetch del login de desarrollador
  const handleDeveloperSkip = async () => {
    setError("");
    const devEmail = "dev@test.com";
    const devPassword = "password123";
    try {
      await signIn(devEmail, devPassword);
      navigate("/");
    } catch (err) {
      console.error("Error en login de desarrollador:", err);
      setError(UI_STRINGS.login.errors.laCuentaDeDesarrolladorNo);
    }
  };

  return (
    <div className="login-container">
      {/* Un form para que Enter envíe desde cualquiera de los campos */}
      <form className="login-box" onSubmit={handleLogin} noValidate>
        <Logo size="lg" />
        <h2>{UI_STRINGS.login.iniciarSesion}</h2>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={UI_STRINGS.login.correoElectronico}
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={UI_STRINGS.login.contrasena}
        />
        <button type="submit">{UI_STRINGS.login.iniciarSesion}</button>
        <p className="kk-switch">
          {UI_STRINGS.login.noAccount}{" "}
          <Link to="/register">{UI_STRINGS.login.createAccount}</Link>
        </p>
        <button
          type="button"
          onClick={handleDeveloperSkip}
          className="dev-skip-btn"
          style={{ backgroundColor: "var(--kk-brand-cyan)", marginTop: "10px" }}
        >
          {UI_STRINGS.login.saltarDev}
        </button>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {unconfirmed && (
          <button
            type="button"
            className="register-btn"
            onClick={handleResend}
            disabled={cooldown > 0}
          >
            {cooldown > 0
              ? UI_STRINGS.login.resendIn(cooldown)
              : UI_STRINGS.login.resend}
          </button>
        )}
        {notice && (
          <p className="kk-notice" role="status">
            {notice}
          </p>
        )}
      </form>
    </div>
  );
}
