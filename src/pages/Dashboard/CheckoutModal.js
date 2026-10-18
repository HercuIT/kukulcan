import React, { useState, useEffect } from "react";

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
      alert("Description cannot be empty.");
      return;
    }
    onCheckout(description);
  };

  return (
    <div className="create-node-modal-backdrop">
      <div className="create-node-modal" style={{ maxWidth: "400px" }}>
        <h2>Checkout</h2>
        <p style={{ marginTop: 0, marginBottom: "15px", color: "#555" }}>
          Describe the changes you made.
        </p>
        <label>
          Description:
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your changes here..."
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
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleCheckoutClick}>Checkout</button>
        </div>
      </div>
    </div>
  );
}
