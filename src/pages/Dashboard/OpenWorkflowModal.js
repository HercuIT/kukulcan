import "../../styles/ModalStyle/OpenWorkflowModal.css";
import { useState, useEffect } from "react";
import { collection, query, where, or, getDocs } from "firebase/firestore";
import { db } from "../../backend/firebaseConfig";

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

  const appId = "manufacturing-suite-v1";
  const isDeployer = userRoles?.deployer === true;

  useEffect(() => {
    const fetchWorkflows = async () => {
      if (!open || !user) return;

      setLoading(true);
      setError(null);

      try {
        const workflowsRef = collection(db, "artifacts", appId, "workflows");

        let q;
        let userRole = "unknown";

        if (isDeployer) {
          // 🆕 PARA DEPLOYERS: Obtener workflows en estado 'approved'
          q = query(workflowsRef, where("metadata.status", "==", "approved"));
          userRole = "deployer";
        } else {
          // PARA DISEÑADORES Y REVISORES: Lógica existente
          q = query(
            workflowsRef,
            or(
              where("metadata.designerIds", "array-contains", user.uid),
              where("metadata.assignedReviewerId", "==", user.uid),
            ),
          );
        }

        const querySnapshot = await getDocs(q);
        const workflowsList = querySnapshot.docs.map((doc) => {
          const data = doc.data();

          // Determinar el rol del usuario para este workflow
          let workflowUserRole = userRole;
          if (!isDeployer) {
            workflowUserRole = data.metadata.designerIds?.includes(user.uid)
              ? "designer"
              : "reviewer";
          }

          return {
            id: doc.id,
            ...data,
            userRole: workflowUserRole,
          };
        });

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

  const sortedWorkflows = [...workflows].sort((a, b) => {
    const dateA = a.metadata?.lastModifiedAt?.toDate
      ? a.metadata.lastModifiedAt.toDate()
      : 0;
    const dateB = b.metadata?.lastModifiedAt?.toDate
      ? b.metadata.lastModifiedAt.toDate()
      : 0;
    return dateB - dateA;
  });

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
                    {workflow.metadata?.lastModifiedAt?.toDate
                      ? workflow.metadata.lastModifiedAt
                          .toDate()
                          .toLocaleString()
                      : "N/A"}
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
