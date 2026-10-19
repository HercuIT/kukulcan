import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signIn, signUp } from "../../backend/authApi";
import "../../styles/LoginStyle/LoginStyle.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleRegister = async () => {
    setError("");
    if (!email || !password) {
      setError("Por favor, completa ambos campos.");
      return;
    }
    try {
      // Crea el usuario en Supabase Auth; el trigger de la base crea su perfil sin roles
      await signUp(email, password);

      alert(
        "¡Usuario registrado con éxito! Se te ha asignado un rol por defecto. Por favor, inicia sesión.",
      );

      setEmail("");
      setPassword("");
    } catch (err) {
      if (err.code === "email-in-use") {
        setError("Este correo electrónico ya está en uso.");
      } else {
        setError("Ocurrió un error al registrar el usuario.");
      }
      console.error("Error de registro:", err);
    }
  };

  const handleLogin = async () => {
    setError("");
    if (!email || !password) {
      setError("Por favor, completa ambos campos.");
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
        setError(
          "Correo o contraseña incorrectos. Por favor, verifica tus datos.",
        );
      } else {
        setError("Ocurrió un error al intentar iniciar sesión.");
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
      setError(
        "La cuenta de desarrollador no está configurada o hubo un error.",
      );
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Iniciar Sesión</h2>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Correo electrónico"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
        />
        <button onClick={handleLogin}>Iniciar Sesión</button>
        <button onClick={handleRegister} className="register-btn">
          Registrar
        </button>
        <button
          onClick={handleDeveloperSkip}
          className="dev-skip-btn"
          style={{ backgroundColor: "#17a2b8", marginTop: "10px" }}
        >
          Saltar (Dev)
        </button>
        {error && <p className="error-message">{error}</p>}
      </div>
    </div>
  );
}
