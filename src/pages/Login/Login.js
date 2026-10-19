import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signIn, signUp } from "../../backend/authApi";
import "../../styles/LoginStyle/LoginStyle.css";
import { UI_STRINGS } from "../../constants/uiStrings";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleRegister = async () => {
    setError("");
    if (!email || !password) {
      setError(UI_STRINGS.login.errors.porFavorCompletaAmbosCampos);
      return;
    }
    try {
      // Crea el usuario en Supabase Auth; el trigger de la base crea su perfil sin roles
      await signUp(email, password);

      alert(UI_STRINGS.login.alerts.usuarioRegistradoConExitoSe);

      setEmail("");
      setPassword("");
    } catch (err) {
      if (err.code === "email-in-use") {
        setError(UI_STRINGS.login.errors.esteCorreoElectronicoYaEsta);
      } else {
        setError(UI_STRINGS.login.errors.ocurrioUnErrorAlRegistrar);
      }
      console.error("Error de registro:", err);
    }
  };

  const handleLogin = async () => {
    setError("");
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
      if (err.code === "invalid-credentials") {
        setError(UI_STRINGS.login.errors.correoOContrasenaIncorrectosPor);
      } else {
        setError(UI_STRINGS.login.errors.ocurrioUnErrorAlIntentar);
      }
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
      <div className="login-box">
        <h2>{UI_STRINGS.login.iniciarSesion}</h2>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={UI_STRINGS.login.correoElectronico}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={UI_STRINGS.login.contrasena}
        />
        <button onClick={handleLogin}>{UI_STRINGS.login.iniciarSesion}</button>
        <button onClick={handleRegister} className="register-btn">
          {UI_STRINGS.login.registrar}
        </button>
        <button
          onClick={handleDeveloperSkip}
          className="dev-skip-btn"
          style={{ backgroundColor: "#17a2b8", marginTop: "10px" }}
        >
          {UI_STRINGS.login.saltarDev}
        </button>
        {error && <p className="error-message">{error}</p>}
      </div>
    </div>
  );
}
