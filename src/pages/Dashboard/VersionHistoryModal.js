import React from "react";
import { UI_STRINGS } from "../../constants/uiStrings";

export default function VersionHistoryModal({ open, onClose, history }) {
  if (!open) return null;

  // Helper to format the ISO timestamp from Postgres
  const formatDate = (timestamp) =>
    timestamp ? new Date(timestamp).toLocaleString() : "N/A";

  return (
    <div className="create-node-modal-backdrop">
      <div
        className="create-node-modal"
        style={{ maxWidth: "600px", width: "90%" }}
      >
        <h2>{UI_STRINGS.dashboard.versionHistoryModal.versionHistory}</h2>
        <div
          style={{
            maxHeight: "400px",
            overflowY: "auto",
            marginTop: "15px",
            border: "1px solid #ddd",
            borderRadius: "4px",
          }}
        >
          {!history || history.length === 0 ? (
            <p style={{ padding: "20px", textAlign: "center", color: "#666" }}>
              {UI_STRINGS.dashboard.versionHistoryModal.noHistoryAvailable}
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead
                style={{ background: "#f5f5f5", position: "sticky", top: 0 }}
              >
                <tr>
                  <th
                    style={{
                      padding: "10px",
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    {UI_STRINGS.dashboard.versionHistoryModal.description}
                  </th>
                  <th
                    style={{
                      padding: "10px",
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    {UI_STRINGS.dashboard.versionHistoryModal.userUid}
                  </th>
                  <th
                    style={{
                      padding: "10px",
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    {UI_STRINGS.dashboard.versionHistoryModal.timestamp}
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "10px" }}>{entry.description}</td>
                    <td
                      style={{
                        padding: "10px",
                        fontSize: "0.9em",
                        color: "#555",
                      }}
                    >
                      {entry.userId}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        fontSize: "0.9em",
                        color: "#555",
                      }}
                    >
                      {formatDate(entry.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div
          className="create-node-modal-buttons"
          style={{ marginTop: "20px", justifyContent: "flex-end" }}
        >
          <button onClick={onClose}>
            {UI_STRINGS.dashboard.versionHistoryModal.close}
          </button>
        </div>
      </div>
    </div>
  );
}
