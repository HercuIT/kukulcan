import React, { useState, useEffect } from "react";
import { UI_STRINGS } from "../../constants/uiStrings";

export default function CheckoutModal({ open, onClose, onCheckout }) {
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDescription("");
      setError("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleCheckoutClick = () => {
    if (!description.trim()) {
      alert(UI_STRINGS.dashboard.checkoutModal.alerts.descriptionCannotBeEmpty);
      return;
    }
    onCheckout(description);
  };

  return (
    <div className="create-node-modal-backdrop">
      <div className="create-node-modal" style={{ maxWidth: "400px" }}>
        <h2>{UI_STRINGS.dashboard.checkoutModal.checkout}</h2>
        <p style={{ marginTop: 0, marginBottom: "15px", color: "#555" }}>
          {UI_STRINGS.dashboard.checkoutModal.describeTheChangesYouMade}
        </p>
        <label>
          {UI_STRINGS.dashboard.checkoutModal.description}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              UI_STRINGS.dashboard.checkoutModal.describeYourChangesHere
            }
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: "5px",
              minHeight: "100px",
              resize: "vertical",
            }}
          />
        </label>
        {error && <p style={{ color: "red", fontWeight: "bold" }}>{error}</p>}
        <div
          className="create-node-modal-buttons"
          style={{ marginTop: "20px" }}
        >
          <button onClick={onClose}>
            {UI_STRINGS.dashboard.checkoutModal.cancel}
          </button>
          <button onClick={handleCheckoutClick}>
            {UI_STRINGS.dashboard.checkoutModal.checkout}
          </button>
        </div>
      </div>
    </div>
  );
}
