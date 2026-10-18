import React from "react";
import "./EquipmentDetails.css";

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
            <strong>Maximum Capacity:</strong> {details.capacity || "N/A"}
          </li>
          <li>
            <strong>Last Maintenance:</strong>{" "}
            {details.lastMaintenance || "N/A"}
          </li>
          <li>
            <strong>Manufacturer Model:</strong>{" "}
            {details.manufacturerModel || "N/A"}
          </li>
          <li>
            <strong>Connection Status:</strong> {details.status || "Unknown"}
          </li>
        </ul>
      </div>
    </div>
  );
};

export default EquipmentDetails;
