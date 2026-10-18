import React from "react";

export default function VersionHistoryModal({ open, onClose, history }) {
  if (!open) return null;

  // Helper to format timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    // Handle Firestore Timestamp
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleString();
    }
    // Handle JS Date or string
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="create-node-modal-backdrop">
      <div
        className="create-node-modal"
        style={{ maxWidth: "600px", width: "90%" }}
      >
        <h2>Version History</h2>
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
              No history available.
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
                    Description
                  </th>
                  <th
                    style={{
                      padding: "10px",
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    User (UID)
                  </th>
                  <th
                    style={{
                      padding: "10px",
                      textAlign: "left",
                      borderBottom: "1px solid #ddd",
                    }}
                  >
                    Timestamp
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
                      {formatDate(entry.timestamp)}
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
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
