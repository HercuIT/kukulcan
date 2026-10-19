import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { updatePassword } from "../../backend/authApi";
import { UI_STRINGS } from "../../constants/uiStrings";
import "../../styles/LoginStyle/LoginStyle.css";

// Mínimo por defecto de Supabase Auth (Authentication → Providers → Email).
export const MIN_PASSWORD_LENGTH = 6;

const S = UI_STRINGS.setPassword;

// Página a la que lleva el enlace de recuperación: el usuario ya tiene sesión y elige su contraseña.
export default function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  const handleSave = async () => {
    setError("");
    if (!password || !confirm) {
      setError(S.errors.missingFields);
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(S.errors.tooShort(MIN_PASSWORD_LENGTH));
      return;
    }
    if (password !== confirm) {
      setError(S.errors.mismatch);
      return;
    }
    setIsSaving(true);
    try {
      await updatePassword(password);
      alert(S.alerts.success);
      navigate("/");
    } catch (err) {
      console.error("Error al guardar la contraseña:", err);
      if (err.code === "weak-password") setError(S.errors.weakPassword);
      else if (err.code === "same-password") setError(S.errors.samePassword);
      else setError(S.errors.generic);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>{S.title}</h2>
        <p>{S.description}</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={S.newPassword}
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={S.confirmPassword}
        />
        <button onClick={handleSave} disabled={isSaving}>
          {isSaving ? S.saving : S.save}
        </button>
        {error && <p className="error-message">{error}</p>}
      </div>
    </div>
  );
}
