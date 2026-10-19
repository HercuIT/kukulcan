import "../../styles/ModalStyle/OpenWorkflowModal.css";
import { useState, useEffect } from "react";
import { listMyWorkflows } from "../../backend/workflowsApi";

const StatusIndicator = ({ status }) => {
  const statusInfo = {
    draft: { label: "Draft", className: "status-draft" },
    pending_review: {
      label: "Pending Review",
      className: "status-pending_review",
    },
    changes_requested: {
      label: "Changes Requested",
      className: "status-changes_requested",
    },
    approved: { label: "Approved", className: "status-approved" },
    deployed: { label: "Deployed", className: "status-deployed" },
  };

  const currentStatus = statusInfo[status] || {
    label: status,
    className: "status-draft",
  };

  return (
    <span className={`status-pill ${currentStatus.className}`}>
      {currentStatus.label}
    </span>
  );
};

const RoleIndicator = ({ role }) => {
  return (
    <span className={`role-pill role-${role}`}>
      {role === "designer"
        ? "Designer"
        : role === "reviewer"
          ? "Reviewer"
          : role === "deployer"
            ? "Deployer"
            : role}
    </span>
  );
};

export default function OpenWorkflowModal({
  open,
  onClose,
  user,
  userRoles,
  onSelect,
}) {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isDeployer = userRoles?.deployer === true;

  useEffect(() => {
    const fetchWorkflows = async () => {
      if (!open || !user) return;

      setLoading(true);
      setError(null);

      try {
        // Deployers: workflows aprobados. Diseñadores y revisores: donde participan.
        const found = await listMyWorkflows(
          isDeployer ? "deployer" : "designer",
        );
        const workflowsList = found.map((workflow) => ({
          ...workflow,
          // Determinar el rol del usuario para este workflow
          userRole: isDeployer
            ? "deployer"
            : workflow.metadata.designerIds?.includes(user.uid)
              ? "designer"
              : "reviewer",
        }));

        console.log(
          `Found ${workflowsList.length} workflows for role: ${isDeployer ? "deployer" : "designer/reviewer"}`,
        );
        setWorkflows(workflowsList);
      } catch (err) {
        console.error("Error loading workflows:", err);
        setError("Error loading workflows: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkflows();
  }, [open, user, userRoles, isDeployer]);

  if (!open) {
    return null;
  }

  // Las fechas llegan como cadenas ISO desde Postgres
  const toDate = (iso) => (iso ? new Date(iso) : null);

  const sortedWorkflows = [...workflows].sort(
    (a, b) =>
      (toDate(b.metadata?.lastModifiedAt) || 0) -
      (toDate(a.metadata?.lastModifiedAt) || 0),
  );

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>Open Workflow</h2>

        {loading && <div className="loading-message">Loading workflows...</div>}

        {error && <div className="error-message">{error}</div>}

        <div className="workflow-list">
          {/* HEADER WITH 4 COLUMNS */}
          <div className="workflow-list-header">
            <span>Workflow Name</span>
            <span>State</span>
            <span>Your Role</span>
            <span>Last Modified</span>
          </div>

          {!loading && !error && sortedWorkflows.length > 0
            ? sortedWorkflows.map((workflow) => (
                <div
                  key={workflow.id}
                  className="workflow-list-item"
                  onClick={() => onSelect(workflow.id)}
                >
                  {/* EACH ELEMENT IN ITS CORRESPONDING COLUMN */}
                  <span className="workflow-name">
                    {workflow.name || "Unnamed"}
                  </span>
                  <span>
                    <StatusIndicator status={workflow.metadata?.status} />
                  </span>
                  <span>
                    <RoleIndicator role={workflow.userRole} />
                  </span>
                  <span className="workflow-date">
                    {toDate(workflow.metadata?.lastModifiedAt)?.toLocaleString() ??
                      "N/A"}
                  </span>
                </div>
              ))
            : !loading &&
              !error && (
                <div className="empty-list-message">
                  {isDeployer
                    ? "No approved workflows available for deployment."
                    : user?.email?.includes("reviewer")
                      ? "You have no workflows assigned for review."
                      : "No workflows available."}
                </div>
              )}
        </div>

        <div className="modal-buttons">
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
