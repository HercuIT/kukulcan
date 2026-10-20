import React from "react";
import ReactDOM from "react-dom";
import "../../styles/ModalStyle/UnsavedChangesModal.css";
import { UI_STRINGS } from "../../constants/uiStrings";

// reason: "logout" (session expired or inactivity; save or discard, then sign out) or "new"
// (File -> New; save, discard or cancel and stay on the canvas).
export default function UnsavedChangesModal({
  open,
  reason = "logout",
  onSave,
  onDiscard,
  onCancel,
  isSaving = false,
}) {
  if (!open) return null;

  const S = UI_STRINGS.dashboard.unsavedChangesModal;
  const isNew = reason === "new";

  return ReactDOM.createPortal(
    <div className="unsaved-changes-modal-backdrop">
      <div className="unsaved-changes-modal">
        <div className="modal-header">
          <h2>{isNew ? S.newWorkflowTitle : S.sessionExpiredTitle}</h2>
          <div className="warning-icon">⚠️</div>
        </div>

        <div className="modal-body">
          {isNew ? (
            <p>{S.newWorkflowMessage}</p>
          ) : (
            <>
              <p>{S.unsavedChangesMessage}</p>
              <p>{S.saveBeforeContinuing}</p>
            </>
          )}
        </div>

        <div className="modal-buttons">
          <button onClick={onSave} className="btn-primary" disabled={isSaving}>
            {isSaving ? (
              <>
                <div className="loading-spinner"></div>
                {UI_STRINGS.dashboard.unsavedChangesModal.saving}
              </>
            ) : (
              UI_STRINGS.dashboard.unsavedChangesModal.saveNow
            )}
          </button>

          <button
            onClick={onDiscard}
            className="btn-danger"
            disabled={isSaving}
          >
            {UI_STRINGS.dashboard.unsavedChangesModal.discardChanges}
          </button>

          {isNew && onCancel && (
            <button
              onClick={onCancel}
              className="btn-secondary"
              disabled={isSaving}
            >
              {S.cancel}
            </button>
          )}
        </div>

        {isSaving && (
          <div className="saving-progress">
            <p>{UI_STRINGS.dashboard.unsavedChangesModal.savingYourChanges}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
