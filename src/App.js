import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { getMyRoles, onSessionChange } from "./backend/authApi";

// Tus componentes de página reales
import Home from "./pages/Home/Home.js";
import Dashboard from "./pages/Dashboard/Dashboard.js";
import Login from "./pages/Login/Login";

export default function App() {
  const [user, setUser] = useState(null);
  const [userRoles, setUserRoles] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSessionChange(async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          setUserRoles(await getMyRoles(currentUser.uid));
        } else {
          setUser(null);
          setUserRoles(null);
        }
      } catch (error) {
        console.error("Error al obtener datos del usuario:", error);
        setUser(null);
        setUserRoles(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading-container">Cargando...</div>;
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
