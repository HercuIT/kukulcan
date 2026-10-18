import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/HomeStyle/HomeStyle.css";
import { signOut } from "firebase/auth";
import { auth } from "../../backend/firebaseConfig";
import Logo from "../../assets/Logofinal.png";

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
      alert(`Seleccionaste: ${menu} > ${option}`);
    }
  };

  const handleMenuMouseLeave = () => {
    setOpenMenu(null);
  };

  const availableMenus = Object.keys(menuOptions);

  return (
    <nav className="menu-bar">
      <img
        src={Logo}
        alt="Logo de la empresa"
        style={{
          height: "42px",
          marginRight: "16px",
        }}
      />
      {availableMenus.map((menu) => (
        <div key={menu} className="menu-item">
          <button
            className="menu-btn"
            onClick={() => setOpenMenu(openMenu === menu ? null : menu)}
          >
            {menu}
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
                  {option}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

export default function Home({ user, userRoles }) {
  const [loading, setLoading] = useState(true);
  const [serverOnline, setServerOnline] = useState(false);
  // eslint-disable-next-line
  const [ignitionOnline, setIgnitionOnline] = useState(true);

  const handleLogout = () => {
    signOut(auth).catch((error) =>
      console.error("Error al cerrar sesión:", error),
    );
  };

  // Reintenta la verificación del servidor cada 3 segundos si está caído
  useEffect(() => {
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
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div>
      {!serverOnline && (
        <div className="custom-modal">
          <div className="custom-modal-content">
            <h3>El servidor local no está disponible</h3>
            <p>
              Para continuar, debes instalar el servicio de host local.
              <br />
              <a
                href="URL_DE_DESCARGA_DEL_INSTALADOR.exe"
                download
                style={{ color: "#3498db", fontWeight: "bold" }}
              >
                Descargar servidor
              </a>
            </p>
            <p>
              Una vez instalado, el servidor se iniciará automáticamente.
              <br />
              Si no deseas instalarlo, puedes cerrar sesión.
            </p>
            <button onClick={handleLogout}>Cerrar sesión</button>
            <button
              onClick={() => setServerOnline(true)}
              style={{ marginLeft: 12 }}
            >
              Saltar este paso
            </button>
          </div>
        </div>
      )}
      {/*
      { serverOnline && !ignitionOnline && (
      <div className="custom-modal">
        <div className="custom-modal-content">
          <h3>The Node.js server is running correctly</h3>
          <p style={{ color: "red" }}>
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
              <button onClick={handleLogout}>Cerrar Sesión</button>
            </div>
          </div>
          <div style={{ padding: 32 }}>
            <h1>Bienvenido a la página principal</h1>
            <p>Esta es la nueva página de inicio.</p>
            <h3>Tus Roles:</h3>
            <pre>{JSON.stringify(userRoles, null, 2)}</pre>
          </div>
        </>
      )}
    </div>
  );
}
