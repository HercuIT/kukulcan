import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import {
  addDesigner,
  approveWorkflow,
  assignReviewer,
  removeDesigner,
  requestChanges,
} from "../../backend/workflowsApi";
import "../../styles/ModalStyle/ShareWorkflowModal.css";

const getUsernameFromEmail = (email) => {
  if (!email || typeof email !== "string") {
    return "Unknown User";
  }
  return email.split("@")[0];
};

export default function ShareWorkflowModal({
  open,
  onClose,
  workflow,
  allUsers = [],
  potentialReviewers = [],
  user,
  userRoles,
}) {
  const [newUserEmail, setNewUserEmail] = useState("");
  const [selectedReviewer, setSelectedReviewer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeSection, setActiveSection] = useState("share"); // "share" or "review"

  // Determinar si el usuario actual es el revisor asignado
  const isAssignedReviewer =
    user && workflow?.metadata?.assignedReviewerId === user.uid;
  const isPendingReview = workflow?.metadata?.status === "pending_review";
  const showReviewActions = isAssignedReviewer && isPendingReview;
  const isDesigner = userRoles?.designer === true;

  useEffect(() => {
    if (open && workflow) {
      setSelectedReviewer(workflow.metadata.assignedReviewerId || "");
      setError("");
      setSuccessMessage("");
      setNewUserEmail("");

      // Determinar qué sección mostrar por defecto
      if (showReviewActions) {
        setActiveSection("review");
      } else {
        setActiveSection("share");
      }
    }
  }, [open, workflow, showReviewActions]);

  if (!open || !workflow) return null;

  const userMap = new Map(allUsers.map((user) => [user.uid, user.email]));

  const isSignedIn = Boolean(user);

  // Ejecuta una RPC de workflowsApi y muestra su error, si lo hay.
  const handleRpcCall = async (action, successMessage) => {
    setIsLoading(true);
    setError("");

    if (!isSignedIn) {
      setError("You must be logged in to perform this action");
      setIsLoading(false);
      return false;
    }

    try {
      await action();

      if (successMessage) {
        // setSuccessMessage(successMessage);
      }
      return true;
    } catch (err) {
      console.error("Error in workflow action:", err);

      const errorMessage = err.message || "An unexpected error occurred";
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDesigner = async () => {
    if (!newUserEmail.trim()) {
      setError("Please enter an email address");
      return;
    }

    const success = await handleRpcCall(
      () => addDesigner(workflow.id, newUserEmail.trim()),
      "Designer added successfully!",
    );

    if (success) {
      setNewUserEmail("");
    }
  };

  const handleRemoveDesigner = async (designerIdToRemove) => {
    if (workflow.metadata.designerIds.length <= 1) {
      setError("Cannot remove the last designer from the workflow");
      return;
    }

    await handleRpcCall(
      () => removeDesigner(workflow.id, designerIdToRemove),
      "Designer removed successfully!",
    );
  };

  const handleAssignReviewer = async (reviewerId) => {
    const success = await handleRpcCall(
      () => assignReviewer(workflow.id, reviewerId),
      reviewerId
        ? "Reviewer assigned successfully!"
        : "Reviewer unassigned successfully!",
    );

    if (success) {
      setSelectedReviewer(reviewerId);
    }
  };

  const handleApprove = async () => {
    const success = await handleRpcCall(
      () => approveWorkflow(workflow.id),
      "Workflow approved successfully!",
    );

    if (success) {
      onClose();
    }
  };

  const handleRequestChanges = async () => {
    const success = await handleRpcCall(
      () => requestChanges(workflow.id),
      "Changes requested successfully!",
    );

    if (success) {
      onClose();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && newUserEmail.trim()) {
      handleAddDesigner();
    }
  };

  return ReactDOM.createPortal(
    <div className="modal-backdrop">
      <div className="modal-content share-modal">
        <div className="modal-header">
          <h2>Workflow Actions - &quot;{workflow.name}&quot;</h2>
          <button
            className="close-button"
            onClick={onClose}
            disabled={isLoading}
          >
            ×
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="workflow-actions-tabs">
          {isDesigner && (
            <button
              className={`tab-button ${activeSection === "share" ? "active" : ""}`}
              onClick={() => setActiveSection("share")}
            >
              Share & Assign
            </button>
          )}
          {showReviewActions && (
            <button
              className={`tab-button ${activeSection === "review" ? "active" : ""}`}
              onClick={() => setActiveSection("review")}
            >
              Review Actions
            </button>
          )}
        </div>

        {!isSignedIn && (
          <div className="error-message">
            ⚠️ You must be logged in to use this function
          </div>
        )}

        {/* Share & Assign Section */}
        {activeSection === "share" && isDesigner && (
          <>
            <div className="share-section">
              <h4>Design Team</h4>
              <p className="section-description">
                These people can edit the workflow.
              </p>

              <div className="user-list">
                {workflow.metadata.designerIds.map((id) => (
                  <span key={id} className="user-pill">
                    <span className="user-avatar">
                      {getUsernameFromEmail(userMap.get(id))
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                    {getUsernameFromEmail(userMap.get(id))}
                    {workflow.metadata.designerIds.length > 1 && (
                      <button
                        className="remove-user-btn"
                        onClick={() => handleRemoveDesigner(id)}
                        disabled={isLoading || !isSignedIn}
                        title="Remove designer"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>

              <div className="add-user-form">
                <input
                  type="email"
                  placeholder="Enter designer's email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading || !isSignedIn}
                  className="email-input"
                />
                <button
                  onClick={handleAddDesigner}
                  disabled={
                    isLoading || !newUserEmail.trim() || !isSignedIn
                  }
                  className="add-button"
                >
                  {isLoading ? "Adding..." : "Add Designer"}
                </button>
              </div>
            </div>

            <div className="share-section">
              <h4>Assign Reviewer</h4>
              <p className="section-description">
                Select the person who should approve this workflow.
              </p>

              <select
                value={selectedReviewer}
                onChange={(e) => handleAssignReviewer(e.target.value)}
                disabled={isLoading || !isSignedIn}
                className="reviewer-select"
              >
                <option value="">-- Unassigned --</option>
                {potentialReviewers.map((reviewer) => (
                  <option key={reviewer.uid} value={reviewer.uid}>
                    {getUsernameFromEmail(reviewer.email)} ({reviewer.email})
                  </option>
                ))}
              </select>

              {selectedReviewer && (
                <div className="current-reviewer">
                  Currently assigned to:{" "}
                  <strong>
                    {getUsernameFromEmail(userMap.get(selectedReviewer))}
                  </strong>
                </div>
              )}
            </div>
          </>
        )}

        {/* Review Actions Section */}
        {activeSection === "review" && showReviewActions && (
          <div className="review-section">
            <h4>Review Workflow</h4>
            <p className="section-description">
              You are the assigned reviewer for this workflow. Please choose an
              action:
            </p>

            <div className="review-actions">
              <div className="action-card">
                <h5>Approve Workflow</h5>
                <p>Approve this workflow if it meets all requirements.</p>
                <button
                  onClick={handleApprove}
                  disabled={isLoading}
                  className="approve-action-btn"
                >
                  {isLoading ? "Processing..." : "Approve Workflow"}
                </button>
              </div>

              <div className="action-card">
                <h5>Request Changes</h5>
                <p>Request changes if modifications are needed.</p>
                <button
                  onClick={handleRequestChanges}
                  disabled={isLoading}
                  className="request-changes-action-btn"
                >
                  {isLoading ? "Processing..." : "Request Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status Information */}
        <div className="workflow-status-info">
          <p>
            <strong>Current Status:</strong>{" "}
            {workflow.metadata?.status || "unknown"}
          </p>
          {workflow.metadata?.assignedReviewerId && (
            <p>
              <strong>Assigned Reviewer:</strong>{" "}
              {getUsernameFromEmail(
                userMap.get(workflow.metadata.assignedReviewerId),
              )}
            </p>
          )}
        </div>

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {successMessage && (
          <div className="success-message">
            <span className="success-icon">✅</span>
            {successMessage}
          </div>
        )}

        <div className="modal-footer">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="done-button"
          >
            {isLoading ? "Processing..." : "Done"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
