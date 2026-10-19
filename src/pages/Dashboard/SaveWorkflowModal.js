import React, { useState, useEffect } from "react";
import { UI_STRINGS } from "../../constants/uiStrings";

export default function SaveWorkflowModal({ open, onClose, onSave }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setError("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSaveClick = () => {
    if (!name.trim()) {
      setError(
        UI_STRINGS.dashboard.saveWorkflowModal.errors.elNombreNoPuedeEstar,
      );
      return;
    }
    onSave(name);
  };

  return (
    <div className="create-node-modal-backdrop">
      <div className="create-node-modal" style={{ maxWidth: "400px" }}>
        <h2>{UI_STRINGS.dashboard.saveWorkflowModal.guardarFlujoDeTrabajo}</h2>
        <p style={{ marginTop: 0, marginBottom: "15px", color: "#555" }}>
          {UI_STRINGS.dashboard.saveWorkflowModal.introduceUnNombreParaTu}
        </p>
        <label>
          {UI_STRINGS.dashboard.saveWorkflowModal.nombre}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              UI_STRINGS.dashboard.saveWorkflowModal.ejProcesoDeEnsamblajeV1
            }
            style={{ width: "100%", boxSizing: "border-box", marginTop: "5px" }}
          />
        </label>
        {error && <p style={{ color: "red", fontWeight: "bold" }}>{error}</p>}
        <div
          className="create-node-modal-buttons"
          style={{ marginTop: "20px" }}
        >
          <button onClick={onClose}>
            {UI_STRINGS.dashboard.saveWorkflowModal.cancelar}
          </button>
          <button onClick={handleSaveClick}>
            {UI_STRINGS.dashboard.saveWorkflowModal.guardar}
          </button>
        </div>
      </div>
    </div>
  );
}
