import "../../styles/ModalStyle/OpenWorkflowModal.css";
import { useState, useEffect } from "react";
import { listMyWorkflows } from "../../backend/workflowsApi";
import { UI_STRINGS } from "../../constants/uiStrings";

const StatusIndicator = ({ status }) => {
  const statusInfo = {
    draft: {
      label: UI_STRINGS.dashboard.openWorkflowModal.statuses.draft,
      className: "status-draft",
    },
    pending_review: {
      label: UI_STRINGS.dashboard.openWorkflowModal.statuses.pending_review,
      className: "status-pending_review",
    },
    changes_requested: {
      label: UI_STRINGS.dashboard.openWorkflowModal.statuses.changes_requested,
      className: "status-changes_requested",
    },
    approved: {
      label: UI_STRINGS.dashboard.openWorkflowModal.statuses.approved,
      className: "status-approved",
    },
    deployed: {
      label: UI_STRINGS.dashboard.openWorkflowModal.statuses.deployed,
      className: "status-deployed",
    },
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
        ? UI_STRINGS.dashboard.openWorkflowModal.roles.designer
        : role === "reviewer"
          ? UI_STRINGS.dashboard.openWorkflowModal.roles.reviewer
          : role === "deployer"
            ? UI_STRINGS.dashboard.openWorkflowModal.roles.deployer
            : role}
    </span>
  );
};

/**
 * @param {{ [prop: string]: any }} props open, onClose, user, userRoles, onSelect. Dashboard también
 *   pasa `workflows`, que este modal no usa: carga su propia lista (CLAUDE.md → defectos conocidos).
 */
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
        setError(
          UI_STRINGS.dashboard.openWorkflowModal.errors.errorLoadingWorkflows +
            err.message,
        );
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
      (toDate(b.metadata?.lastModifiedAt)?.getTime() || 0) -
      (toDate(a.metadata?.lastModifiedAt)?.getTime() || 0),
  );

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>{UI_STRINGS.dashboard.openWorkflowModal.openWorkflow}</h2>

        {loading && (
          <div className="loading-message">
            {UI_STRINGS.dashboard.openWorkflowModal.loadingWorkflows}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <div className="workflow-list">
          {/* HEADER WITH 4 COLUMNS */}
          <div className="workflow-list-header">
            <span>{UI_STRINGS.dashboard.openWorkflowModal.workflowName}</span>
            <span>{UI_STRINGS.dashboard.openWorkflowModal.state}</span>
            <span>{UI_STRINGS.dashboard.openWorkflowModal.yourRole}</span>
            <span>{UI_STRINGS.dashboard.openWorkflowModal.lastModified}</span>
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
                    {workflow.name ||
                      UI_STRINGS.dashboard.openWorkflowModal.unnamed}
                  </span>
                  <span>
                    <StatusIndicator status={workflow.metadata?.status} />
                  </span>
                  <span>
                    <RoleIndicator role={workflow.userRole} />
                  </span>
                  <span className="workflow-date">
                    {toDate(
                      workflow.metadata?.lastModifiedAt,
                    )?.toLocaleString() ??
                      UI_STRINGS.dashboard.openWorkflowModal.notAvailable}
                  </span>
                </div>
              ))
            : !loading &&
              !error && (
                <div className="empty-list-message">
                  {isDeployer
                    ? UI_STRINGS.dashboard.openWorkflowModal
                        .noApprovedWorkflowsAvailableFor
                    : user?.email?.includes("reviewer")
                      ? UI_STRINGS.dashboard.openWorkflowModal
                          .youHaveNoWorkflowsAssigned
                      : UI_STRINGS.dashboard.openWorkflowModal
                          .noWorkflowsAvailable}
                </div>
              )}
        </div>

        <div className="modal-buttons">
          <button onClick={onClose}>
            {UI_STRINGS.dashboard.openWorkflowModal.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
