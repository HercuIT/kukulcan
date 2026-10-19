import React from "react";
import { subtreeIds } from "../../backend/definitionsApi";
import { UI_STRINGS } from "../../constants/uiStrings";

const S = UI_STRINGS.dashboard.deleteDefinitionModal;

/**
 * Confirma el borrado. Sin hijos: Borrar / Cancelar. Con hijos: borrar todo el subárbol o
 * conservar los hijos (suben un nivel). onConfirm(keepChildren).
 * Lee la definición del árbol vivo (`tree`): si otro usuario le agrega hijos con el diálogo
 * abierto, se ven antes de confirmar.
 */
export default function DeleteDefinitionModal({
  open,
  definition: snapshot,
  tree,
  onClose,
  onConfirm,
}) {
  if (!open || !snapshot) return null;
  const definition = tree?.byId?.get(snapshot.id) || snapshot;
  const total = subtreeIds(definition).size;
  const hasChildren = definition.children?.length > 0;
  // Los hijos suben al nivel del padre; en el nivel superior no pueden quedar predefinidos.
  const canKeepChildren =
    Boolean(definition.parentId) ||
    !definition.children?.some((c) => c.kind === "predefined");

  return (
    <div className="create-node-modal-backdrop">
      <div className="create-node-modal" style={{ maxWidth: 460 }}>
        <h2>{S.title(definition.name)}</h2>
        {hasChildren && <p>{S.hasChildren(definition.children.length)}</p>}
        {hasChildren && !canKeepChildren && <p>{S.cannotKeepPredefined}</p>}
        <div
          className="create-node-modal-buttons"
          style={{ marginTop: 16, flexWrap: "wrap", gap: 8 }}
        >
          <button onClick={onClose}>{S.cancel}</button>
          {hasChildren ? (
            <>
              {canKeepChildren && (
                <button onClick={() => onConfirm(true)}>
                  {S.keepChildren}
                </button>
              )}
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
