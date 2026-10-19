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
import { UI_STRINGS } from "../../constants/uiStrings";

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
      setError(UI_STRINGS.dashboard.shareWorkflowModal.errors.loginRequired);
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
      setError(
        UI_STRINGS.dashboard.shareWorkflowModal.errors
          .pleaseEnterAnEmailAddress,
      );
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
      setError(
        UI_STRINGS.dashboard.shareWorkflowModal.errors
          .cannotRemoveTheLastDesigner,
      );
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
          <h2>
            {UI_STRINGS.dashboard.shareWorkflowModal.title(workflow.name)}
          </h2>
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
              {UI_STRINGS.dashboard.shareWorkflowModal.shareAssign}
            </button>
          )}
          {showReviewActions && (
            <button
              className={`tab-button ${activeSection === "review" ? "active" : ""}`}
              onClick={() => setActiveSection("review")}
            >
              {UI_STRINGS.dashboard.shareWorkflowModal.reviewActions}
            </button>
          )}
        </div>

        {!isSignedIn && (
          <div className="error-message">
            {UI_STRINGS.dashboard.shareWorkflowModal.loginRequiredWarning}
          </div>
        )}

        {/* Share & Assign Section */}
        {activeSection === "share" && isDesigner && (
          <>
            <div className="share-section">
              <h4>{UI_STRINGS.dashboard.shareWorkflowModal.designTeam}</h4>
              <p className="section-description">
                {UI_STRINGS.dashboard.shareWorkflowModal.thesePeopleCanEditThe}
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
                        title={
                          UI_STRINGS.dashboard.shareWorkflowModal.removeDesigner
                        }
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
                  placeholder={
                    UI_STRINGS.dashboard.shareWorkflowModal.enterDesignerSEmail
                  }
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading || !isSignedIn}
                  className="email-input"
                />
                <button
                  onClick={handleAddDesigner}
                  disabled={isLoading || !newUserEmail.trim() || !isSignedIn}
                  className="add-button"
                >
                  {isLoading
                    ? UI_STRINGS.dashboard.shareWorkflowModal.adding
                    : UI_STRINGS.dashboard.shareWorkflowModal.addDesigner}
                </button>
              </div>
            </div>

            <div className="share-section">
              <h4>{UI_STRINGS.dashboard.shareWorkflowModal.assignReviewer}</h4>
              <p className="section-description">
                {
                  UI_STRINGS.dashboard.shareWorkflowModal
                    .selectThePersonWhoShould
                }
              </p>

              <select
                value={selectedReviewer}
                onChange={(e) => handleAssignReviewer(e.target.value)}
                disabled={isLoading || !isSignedIn}
                className="reviewer-select"
              >
                <option value="">
                  {UI_STRINGS.dashboard.shareWorkflowModal.unassigned}
                </option>
                {potentialReviewers.map((reviewer) => (
                  <option key={reviewer.uid} value={reviewer.uid}>
                    {getUsernameFromEmail(reviewer.email)} ({reviewer.email})
                  </option>
                ))}
              </select>

              {selectedReviewer && (
                <div className="current-reviewer">
                  {UI_STRINGS.dashboard.shareWorkflowModal.currentlyAssignedTo}{" "}
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
            <h4>{UI_STRINGS.dashboard.shareWorkflowModal.reviewWorkflow}</h4>
            <p className="section-description">
              {
                UI_STRINGS.dashboard.shareWorkflowModal
                  .youAreTheAssignedReviewer
              }
            </p>

            <div className="review-actions">
              <div className="action-card">
                <h5>
                  {UI_STRINGS.dashboard.shareWorkflowModal.approveWorkflow}
                </h5>
                <p>
                  {
                    UI_STRINGS.dashboard.shareWorkflowModal
                      .approveThisWorkflowIfIt
                  }
                </p>
                <button
                  onClick={handleApprove}
                  disabled={isLoading}
                  className="approve-action-btn"
                >
                  {isLoading
                    ? UI_STRINGS.dashboard.shareWorkflowModal.processing
                    : UI_STRINGS.dashboard.shareWorkflowModal.approveWorkflow}
                </button>
              </div>

              <div className="action-card">
                <h5>
                  {UI_STRINGS.dashboard.shareWorkflowModal.requestChanges}
                </h5>
                <p>
                  {
                    UI_STRINGS.dashboard.shareWorkflowModal
                      .requestChangesIfModificationsAre
                  }
                </p>
                <button
                  onClick={handleRequestChanges}
                  disabled={isLoading}
                  className="request-changes-action-btn"
                >
                  {isLoading
                    ? UI_STRINGS.dashboard.shareWorkflowModal.processing
                    : UI_STRINGS.dashboard.shareWorkflowModal.requestChanges}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status Information */}
        <div className="workflow-status-info">
          <p>
            <strong>
              {UI_STRINGS.dashboard.shareWorkflowModal.currentStatus}
            </strong>{" "}
            {workflow.metadata?.status ||
              UI_STRINGS.dashboard.shareWorkflowModal.unknown}
          </p>
          {workflow.metadata?.assignedReviewerId && (
            <p>
              <strong>
                {UI_STRINGS.dashboard.shareWorkflowModal.assignedReviewer}
              </strong>{" "}
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
            {isLoading
              ? UI_STRINGS.dashboard.shareWorkflowModal.processing
              : UI_STRINGS.dashboard.shareWorkflowModal.done}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
