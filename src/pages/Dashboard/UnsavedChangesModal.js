import React from "react";
import ReactDOM from "react-dom";
import "../../styles/ModalStyle/UnsavedChangesModal.css";

export default function UnsavedChangesModal({
  open,
  onSave,
  onDiscard,
  isSaving = false,
}) {
  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="unsaved-changes-modal-backdrop">
      <div className="unsaved-changes-modal">
        <div className="modal-header">
          <h2>Su sesión ha expirado</h2>
          <div className="warning-icon">⚠️</div>
        </div>

        <div className="modal-body">
          <p>Ha realizado cambios sin guardar en el lienzo.</p>
          <p>¿Desea guardarlos antes de continuar?</p>
        </div>

        <div className="modal-buttons">
          <button onClick={onSave} className="btn-primary" disabled={isSaving}>
            {isSaving ? (
              <>
                <div className="loading-spinner"></div>
                Guardando...
              </>
            ) : (
              "Guardar Ahora"
            )}
          </button>

          <button
            onClick={onDiscard}
            className="btn-danger"
            disabled={isSaving}
          >
            Descartar Cambios
          </button>
        </div>

        {isSaving && (
          <div className="saving-progress">
            <p>Guardando sus cambios...</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
