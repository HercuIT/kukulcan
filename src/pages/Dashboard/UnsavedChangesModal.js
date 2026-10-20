import React from "react";
import ReactDOM from "react-dom";
import "../../styles/ModalStyle/UnsavedChangesModal.css";
import { UI_STRINGS } from "../../constants/uiStrings";

export default function UnsavedChangesModal({
  open,
  title,
  message,
  onSave,
  onDiscard,
  onCancel,
  isSaving = false,
}) {
  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="unsaved-changes-modal-backdrop">
      <div className="unsaved-changes-modal">
        <div className="modal-header">
          <h2>
            {title ||
              UI_STRINGS.dashboard.unsavedChangesModal.suSesionHaExpirado}
          </h2>
          <div className="warning-icon">⚠️</div>
        </div>

        <div className="modal-body">
          {message ? (
            <p>{message}</p>
          ) : (
            <>
              <p>
                {
                  UI_STRINGS.dashboard.unsavedChangesModal
                    .haRealizadoCambiosSinGuardar
                }
              </p>
              <p>
                {
                  UI_STRINGS.dashboard.unsavedChangesModal
                    .deseaGuardarlosAntesDeContinuar
                }
              </p>
            </>
          )}
        </div>

        <div className="modal-buttons">
          <button onClick={onSave} className="btn-primary" disabled={isSaving}>
            {isSaving ? (
              <>
                <div className="loading-spinner"></div>
                {UI_STRINGS.dashboard.unsavedChangesModal.guardando}
              </>
            ) : (
              UI_STRINGS.dashboard.unsavedChangesModal.guardarAhora
            )}
          </button>

          <button
            onClick={onDiscard}
            className="btn-danger"
            disabled={isSaving}
          >
            {UI_STRINGS.dashboard.unsavedChangesModal.descartarCambios}
          </button>

          {onCancel && (
            <button
              onClick={onCancel}
              className="btn-secondary"
              disabled={isSaving}
            >
              {UI_STRINGS.dashboard.unsavedChangesModal.cancelar}
            </button>
          )}
        </div>

        {isSaving && (
          <div className="saving-progress">
            <p>
              {UI_STRINGS.dashboard.unsavedChangesModal.guardandoSusCambios}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
