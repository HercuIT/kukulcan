import React, { useState } from "react";
import ShareWorkflowModal from "./ShareWorkflowModal";
import { UI_STRINGS } from "../../constants/uiStrings";
// Importa el nuevo modal

export default function WorkflowHeader({
  workflow,
  user,
  onApprove,
  appId,
  potentialReviewers,
}) {
  const [isShareModalOpen, setShareModalOpen] = useState(false);

  const isDesigner = workflow.metadata.designerIds.includes(user.uid);
  const isReviewer = workflow.metadata.assignedReviewerId === user.uid;

  // Lógica para decidir si los botones se muestran
  const canShare = isDesigner;
  const canApprove =
    isReviewer && workflow.metadata.status === "pending_review";

  return (
    <div className="workflow-header">
      <h1 className="workflow-title">{workflow.name}</h1>
      <div className="workflow-actions">
        {/* El botón ahora abre el modal */}
        {canShare && (
          <button onClick={() => setShareModalOpen(true)}>
            {UI_STRINGS.dashboard.workflowHeader.compartir}
          </button>
        )}
        {canApprove && (
          <button className="approve-btn" onClick={onApprove}>
            {UI_STRINGS.dashboard.workflowHeader.aprobar}
          </button>
        )}
      </div>

      {/* Renderiza el modal y pásale las props necesarias */}
      <ShareWorkflowModal
        open={isShareModalOpen}
        onClose={() => setShareModalOpen(false)}
        workflow={workflow}
        appId={appId}
        potentialReviewers={potentialReviewers}
      />
    </div>
  );
}
