import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { getMyRoles, onSessionChange } from "./backend/authApi";

// Tus componentes de página reales
import Home from "./pages/Home/Home.js";
import Dashboard from "./pages/Dashboard/Dashboard.js";
import Login from "./pages/Login/Login";
import SetPassword from "./pages/SetPassword/SetPassword";
import { UI_STRINGS } from "./constants/uiStrings";

export default function App() {
  const [user, setUser] = useState(null);
  const [userRoles, setUserRoles] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cada cambio de sesión invalida a los anteriores: si un getMyRoles lento termina después de
    // un cambio de cuenta, su resultado se descarta en vez de mezclar usuario y roles.
    let latestChange = 0;
    const unsubscribe = onSessionChange(async (currentUser) => {
      const change = ++latestChange;
      const isLatest = () => change === latestChange;
      try {
        if (currentUser) {
          // onSessionChange solo avisa cuando cambia el usuario: es el inicio o un cambio de cuenta.
          // La cuenta anterior se oculta ya (pantalla de carga) para que no siga usable con sus
          // permisos mientras llegan los roles de la nueva.
          setUser(null);
          setUserRoles(null);
          setLoading(true);
          const roles = await getMyRoles(currentUser.uid);
          if (!isLatest()) return;
          setUser(currentUser);
          setUserRoles(roles);
        } else {
          setUser(null);
          setUserRoles(null);
        }
      } catch (error) {
        if (!isLatest()) return;
        console.error("Error al obtener datos del usuario:", error);
        setUser(null);
        setUserRoles(null);
      } finally {
        if (isLatest()) setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading-container">{UI_STRINGS.app.loading}</div>;
  }

  return (
    <Router>
      <Routes>
        {user ? (
          <>
            <Route
              path="/"
              element={<Home user={user} userRoles={userRoles} />}
            />
            {/* Aquí pasamos el objeto 'user' como una prop al Dashboard.
              Esto es esencial para que el Dashboard sepa quién está guardando.
            */}
            {/* Destino del enlace de recuperación (send-password-resets.js) */}
            <Route path="/set-password" element={<SetPassword />} />
            <Route
              path="/dashboard"
              element={<Dashboard user={user} userRoles={userRoles} />}
            />
            <Route
              path="*"
              element={<Home user={user} userRoles={userRoles} />}
            />
          </>
        ) : (
          <Route path="*" element={<Login />} />
        )}
      </Routes>
    </Router>
  );
}
