import React from "react";
import "./EquipmentDetails.css";
import { UI_STRINGS } from "../../constants/uiStrings";

const EquipmentDetails = ({ equipment, onClose }) => {
  // Si no hay equipo seleccionado, no mostramos nada
  if (!equipment) return null;

  // Extraemos los datos y defendemos contra props faltantes
  const { label } = equipment;
  const details = equipment.details || {};

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {/* Usamos e.stopPropagation() para evitar que el clic en el panel cierre el modal */}
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>
          ×
        </button>

        <h3>{label}</h3>
        <ul>
          <li>
            <strong>
              {UI_STRINGS.components.equipmentDetails.maximumCapacity}
            </strong>{" "}
            {details.capacity ||
              UI_STRINGS.components.equipmentDetails.notAvailable}
          </li>
          <li>
            <strong>
              {UI_STRINGS.components.equipmentDetails.lastMaintenance}
            </strong>{" "}
            {details.lastMaintenance ||
              UI_STRINGS.components.equipmentDetails.notAvailable}
          </li>
          <li>
            <strong>
              {UI_STRINGS.components.equipmentDetails.manufacturerModel}
            </strong>{" "}
            {details.manufacturerModel ||
              UI_STRINGS.components.equipmentDetails.notAvailable}
          </li>
          <li>
            <strong>
              {UI_STRINGS.components.equipmentDetails.connectionStatus}
            </strong>{" "}
            {details.status || UI_STRINGS.components.equipmentDetails.unknown}
          </li>
        </ul>
      </div>
    </div>
  );
};

export default EquipmentDetails;
