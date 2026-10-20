import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/HomeStyle/HomeStyle.css";
import { signOut } from "../../backend/authApi";
import Logo from "../../components/Logo/Logo";
import { UI_STRINGS } from "../../constants/uiStrings";

const menuOptions = {
  TMApp: ["Home", "Settings", "Profile"],
  File: ["New", "Open", "Save", "Exit"],
  Edit: ["Undo", "Redo", "Cut", "Copy", "Paste"],
  View: ["Zoom In", "Zoom Out", "Full Screen"],
  Help: ["Documentation", "About", "Contact"],
};

function MenuBar() {
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  const handleOptionClick = (menu, option) => {
    setOpenMenu(null);
    if (menu === "File" && option === "New") {
      navigate("dashboard");
    } else {
      alert(UI_STRINGS.home.menuBar.alerts.seleccionaste(menu, option));
    }
  };

  const handleMenuMouseLeave = () => {
    setOpenMenu(null);
  };

  const availableMenus = Object.keys(menuOptions);

  return (
    <nav className="menu-bar">
      <Logo size="sm" to="/" />
      {availableMenus.map((menu) => (
        <div key={menu} className="menu-item">
          <button
            className="menu-btn"
            onClick={() => setOpenMenu(openMenu === menu ? null : menu)}
          >
            {UI_STRINGS.home.menuBar.menuLabels[menu] ?? menu}
          </button>
          {openMenu === menu && (
            <div
              ref={menuRef}
              className="dropdown"
              onMouseLeave={handleMenuMouseLeave}
            >
              {menuOptions[menu].map((option) => (
                <div
                  key={option}
                  className="dropdown-option"
                  onClick={() => handleOptionClick(menu, option)}
                >
                  {UI_STRINGS.home.menuBar.menuLabels[option] ?? option}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

// La verificación del servidor local (localhost:3001) está desactivada salvo que el build defina
// REACT_APP_LOCAL_SERVER_CHECK=true: en el sitio desplegado no hay servidor local y la consulta
// fallaba cada 3 segundos.
export const isLocalServerCheckEnabled = () =>
  process.env.REACT_APP_LOCAL_SERVER_CHECK === "true";

export default function Home({ user, userRoles }) {
  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(false);
  // eslint-disable-next-line
  const [ignitionOnline, setIgnitionOnline] = useState(true);

  const handleLogout = () => {
    signOut().catch((error) => console.error("Error al cerrar sesión:", error));
  };

  // Reintenta la verificación del servidor cada 3 segundos si está caído
  useEffect(() => {
    if (!isLocalServerCheckEnabled()) {
      setServerOnline(true);
      setLoading(!userRoles);
      return undefined;
    }

    let interval;

    const checkServer = async () => {
      // Si userRoles aún no está cargado, no hagas nada y espera a la siguiente ejecución.
      if (!userRoles) {
        console.log("Esperando a que los roles del usuario se carguen...");
        setLoading(true);
        return;
      }

      try {
        // Verifica Node.js
        const res = await fetch("http://localhost:3001/api/health");
        const data = await res.json();

        if (data.status && data.status === "OK") {
          setServerOnline(true);

          // La lógica de roles ahora es segura de usar
          if (userRoles.deployer === true || userRoles.reviewer === true) {
            const ignitionRes = await fetch(
              "http://localhost:3001/api/ignition-health",
            );
            const ignitionData = await ignitionRes.json();
            if (ignitionData.status && ignitionData.status === "OK") {
              console.log("El Ignition SDK se ha cargado correctamente...");
              setIgnitionOnline(true);
              setLoading(false);
              if (interval) clearInterval(interval);
            } else {
              setIgnitionOnline(false);
              setLoading(false);
            }
          } else {
            // Si el usuario no necesita Ignition, lo marcamos como OK y continuamos
            setIgnitionOnline(true);
            setLoading(false);
            if (interval) clearInterval(interval);
          }
        } else {
          setServerOnline(false);
          setLoading(false);
        }
      } catch (error) {
        // Es buena práctica registrar el error para depurar
        console.error("Fallo al verificar el servidor:", error);
        setServerOnline(false);
        setLoading(false);
      }
    };

    checkServer();
    interval = setInterval(checkServer, 3000);

    return () => clearInterval(interval);

    // ✅ PASO 2: AÑADIR userRoles AL ARREGLO DE DEPENDENCIAS
  }, [userRoles]); // <-- El efecto se re-ejecutará cuando userRoles cambie

  if (loading) {
    return (
      <div className="loader-overlay">
        <div className="loader"></div>
        <p>{UI_STRINGS.home.page.loading}</p>
      </div>
    );
  }

  return (
    <div>
      {!serverOnline && (
        <div className="custom-modal">
          <div className="custom-modal-content">
            <h3>{UI_STRINGS.home.page.elServidorLocalNoEsta}</h3>
            <p>
              {UI_STRINGS.home.page.paraContinuarDebesInstalarEl}
              <br />
              <a
                href="URL_DE_DESCARGA_DEL_INSTALADOR.exe"
                download
                style={{ color: "var(--kk-mint-text)", fontWeight: "bold" }}
              >
                {UI_STRINGS.home.page.descargarServidor}
              </a>
            </p>
            <p>
              {UI_STRINGS.home.page.unaVezInstaladoElServidor}
              <br />
              {UI_STRINGS.home.page.siNoDeseasInstalarloPuedes}
            </p>
            <button onClick={handleLogout}>
              {UI_STRINGS.home.page.cerrarSesion}
            </button>
            <button
              onClick={() => setServerOnline(true)}
              style={{ marginLeft: 12 }}
            >
              {UI_STRINGS.home.page.saltarEstePaso}
            </button>
          </div>
        </div>
      )}
      {/*
      { serverOnline && !ignitionOnline && (
      <div className="custom-modal">
        <div className="custom-modal-content">
          <h3>The Node.js server is running correctly</h3>
          <p style={{ color: "var(--kk-status-changes-fg)" }}>
            But the Ignition server is unavailable.
            <br />
            Please check your Ignition settings or status.
          </p>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </div>
    )}
  */}
      {serverOnline && (
        /*ignitionOnline &&*/ <>
          <div className="menu-bar">
            <MenuBar />
            <div className="user-info">
              <span>{user.email}</span>
              <button onClick={handleLogout}>
                {UI_STRINGS.home.page.cerrarSesionMenu}
              </button>
            </div>
          </div>
          <div style={{ padding: 32 }}>
            <Logo size="lg" />
            <h1>{UI_STRINGS.home.page.bienvenidoALaPaginaPrincipal}</h1>
            <p>{UI_STRINGS.home.page.estaEsLaNuevaPagina}</p>
            <h3>{UI_STRINGS.home.page.tusRoles}</h3>
            <pre>{JSON.stringify(userRoles, null, 2)}</pre>
          </div>
        </>
      )}
    </div>
  );
}
