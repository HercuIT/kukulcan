import ReactDOM from "react-dom";
import { UI_STRINGS } from "../constants/uiStrings";

export default function ModalMessage({
  title = UI_STRINGS.components.modalMessage.defaultTitle,
  message,
  onClose,
}) {
  // Render al body para evitar que estilos del contenedor lo tapen
  return ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--kk-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999, // por encima de toolbar/canvas
      }}
      // clic en fondo cierra
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--kk-surface)",
          borderRadius: 12,
          width: 420,
          maxWidth: "90vw",
          padding: "20px 24px",
          boxShadow: "var(--kk-shadow-overlay)",
          zIndex: 10000,
        }}
        // evitar que clics dentro cierren
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{ margin: 0, fontSize: 20, fontWeight: 700, marginBottom: 12 }}
        >
          {title}
        </h2>
        <p style={{ margin: 0, color: "var(--kk-ink)", marginBottom: 18 }}>
          {message}
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              background: "var(--kk-raised)",
              color: "var(--kk-ink)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {UI_STRINGS.components.modalMessage.cancel}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              background: "var(--kk-brand-mint)", // azul
              color: "var(--kk-on-brand)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {UI_STRINGS.components.modalMessage.ok}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
