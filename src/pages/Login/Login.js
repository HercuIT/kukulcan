import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
// Importa 'setDoc' y 'doc' de Firestore y la instancia 'db'
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../../backend/firebaseConfig.js";
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
      //Crea el usuario en Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      // Crea el documento de rol para el nuevo usuario
      const rolesRef = doc(db, "roles", user.uid);
      await setDoc(rolesRef, {
        email: user.email,
        designer: false,
        deployer: false,
        reviewer: false,
      });

      alert(
        "¡Usuario registrado con éxito! Se te ha asignado un rol por defecto. Por favor, inicia sesión.",
      );

      setEmail("");
      setPassword("");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
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
      // 1. Inicia sesión con Firebase Auth (esto no ha cambiado)
      await signInWithEmailAndPassword(auth, email, password);

      // HEMOS ELIMINADO LA LLAMADA A 'fetch("http://localhost:3001/login")'
      // Esto te permitirá iniciar sesión sin depender del backend local.
      // ADVERTENCIA: Sin el backend, los Custom Claims no se establecerán,
      // por lo que las reglas de seguridad de Firestore seguirán fallando
      // hasta que implementes la Cloud Function para asignar roles.

      // 3. Si todo es correcto, navega a la página principal
      navigate("/");
    } catch (err) {
      console.error("Error de inicio de sesión:", err);
      if (err.code === "auth/invalid-credential") {
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
      await signInWithEmailAndPassword(auth, devEmail, devPassword);
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
