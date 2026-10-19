import React from "react";
import { subtreeIds } from "../../backend/definitionsApi";
import { UI_STRINGS } from "../../constants/uiStrings";

const S = UI_STRINGS.dashboard.deleteDefinitionModal;

/**
 * Confirma el borrado. Sin hijos: Borrar / Cancelar. Con hijos: borrar todo el subárbol o
 * conservar los hijos (suben un nivel). onConfirm(keepChildren).
 */
export default function DeleteDefinitionModal({
  open,
  definition,
  onClose,
  onConfirm,
}) {
  if (!open || !definition) return null;
  const total = subtreeIds(definition).size;
  const hasChildren = definition.children?.length > 0;

  return (
    <div className="create-node-modal-backdrop">
      <div className="create-node-modal" style={{ maxWidth: 460 }}>
        <h2>{S.title(definition.name)}</h2>
        {hasChildren && <p>{S.hasChildren(definition.children.length)}</p>}
        <div
          className="create-node-modal-buttons"
          style={{ marginTop: 16, flexWrap: "wrap", gap: 8 }}
        >
          <button onClick={onClose}>{S.cancel}</button>
          {hasChildren ? (
            <>
              <button onClick={() => onConfirm(true)}>{S.keepChildren}</button>
              <button onClick={() => onConfirm(false)}>
                {S.deleteAll(total)}
              </button>
            </>
          ) : (
            <button onClick={() => onConfirm(false)}>{S.delete}</button>
          )}
        </div>
      </div>
    </div>
  );
}
