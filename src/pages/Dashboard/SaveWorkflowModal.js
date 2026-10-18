import React, { useState, useEffect } from "react";

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
      setError("El nombre no puede estar vacío.");
      return;
    }
    onSave(name);
  };

  return (
    <div className="create-node-modal-backdrop">
      <div className="create-node-modal" style={{ maxWidth: "400px" }}>
        <h2>Guardar Flujo de Trabajo</h2>
        <p style={{ marginTop: 0, marginBottom: "15px", color: "#555" }}>
          Introduce un nombre para tu flujo de trabajo.
        </p>
        <label>
          Nombre:
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Proceso de Ensamblaje v1"
            style={{ width: "100%", boxSizing: "border-box", marginTop: "5px" }}
          />
        </label>
        {error && <p style={{ color: "red", fontWeight: "bold" }}>{error}</p>}
        <div
          className="create-node-modal-buttons"
          style={{ marginTop: "20px" }}
        >
          <button onClick={onClose}>Cancelar</button>
          <button onClick={handleSaveClick}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
