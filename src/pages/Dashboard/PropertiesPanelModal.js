import React, { useState, useEffect } from "react";
import { UI_STRINGS } from "../../constants/uiStrings";

function PropertiesPanelModal({ open, node, onClose, onSave }) {
  // Estados locales para los campos del formulario.
  const [label, setLabel] = useState("");
  const [desc, setDesc] = useState("");
  const [abstract, setAbstract] = useState("");

  // Sincroniza el estado del formulario con el nodo seleccionado cada vez que el modal se abre.
  useEffect(() => {
    if (node) {
      setLabel(node.label || "");
      setDesc(node.desc || "");
      setAbstract(node.abstract || "");
    }
  }, [node, open]); // Se actualiza si cambia el nodo O si cambia el estado 'open'.

  // Maneja el guardado de los cambios.
  const handleSave = () => {
    onSave({ label, desc, abstract });
    onClose();
  };

  // No renderiza nada si no está abierto.
  if (!open || !node) {
    return null;
  }

  const isReadOnly =
    node.type === "start" || node.type === "end" || node.type === "connection";

  return (
    // El fondo semitransparente que cubre toda la pantalla.
    <div className="properties-modal-backdrop" onClick={onClose}>
      {/* El modal en sí, con un onClick que detiene la propagación para evitar cerrar al hacer click dentro */}
      <div className="properties-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{UI_STRINGS.dashboard.propertiesPanelModal.nodeProperties}</h2>

        <div className="prop-item">
          <label>{UI_STRINGS.dashboard.propertiesPanelModal.nodeId}</label>
          <input type="text" value={node.id} readOnly disabled />
        </div>
        <div className="prop-item">
          <label>{UI_STRINGS.dashboard.propertiesPanelModal.type}</label>
          <input type="text" value={node.type} readOnly disabled />
        </div>
        <div className="prop-item">
          <label htmlFor="prop-label">
            {UI_STRINGS.dashboard.propertiesPanelModal.label}
          </label>
          <input
            id="prop-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={isReadOnly}
          />
        </div>
        <div className="prop-item">
          <label htmlFor="prop-desc">
            {UI_STRINGS.dashboard.propertiesPanelModal.description}
          </label>
          <textarea
            id="prop-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            disabled={isReadOnly}
          />
        </div>
        <div className="prop-item">
          <label htmlFor="prop-abstract">
            {UI_STRINGS.dashboard.propertiesPanelModal.abstract}
          </label>
          <textarea
            id="prop-abstract"
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            rows={3}
            disabled={isReadOnly}
          />
        </div>

        <div className="properties-modal-buttons">
          <button onClick={onClose}>
            {UI_STRINGS.dashboard.propertiesPanelModal.cancel}
          </button>
          {!isReadOnly && (
            <button onClick={handleSave} className="save-btn">
              {UI_STRINGS.dashboard.propertiesPanelModal.save}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PropertiesPanelModal;
