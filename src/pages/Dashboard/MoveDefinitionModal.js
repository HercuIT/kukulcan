import React, { useEffect, useMemo, useState } from "react";
import { subtreeIds, visibleRows } from "../../backend/definitionsApi";
import { UI_STRINGS } from "../../constants/uiStrings";

const S = UI_STRINGS.dashboard.moveDefinitionModal;
const TOP_LEVEL = "__top__";
const MAX_INDENT = 8;

/**
 * Elige el nuevo padre de una definición. No ofrece la propia definición, sus descendientes ni
 * las referencias predefinidas; "Nivel superior" solo si la definición es de usuario.
 */
export default function MoveDefinitionModal({
  open,
  definition,
  tree,
  onClose,
  onMove,
}) {
  const [target, setTarget] = useState("");

  useEffect(() => {
    if (open) setTarget("");
  }, [open, definition]);

  const options = useMemo(() => {
    if (!open || !definition || !tree) return [];
    const blocked = subtreeIds(tree.byId.get(definition.id) || definition);
    const all = new Set(tree.byId.keys());
    return visibleRows(tree.roots, all)
      .filter(
        (r) =>
          r.type === "definition" &&
          r.node.kind === "user" &&
          !blocked.has(r.node.id),
      )
      .map((r) => ({ id: r.node.id, depth: r.depth, node: r.node }));
  }, [open, definition, tree]);

  const canGoTop = definition?.kind === "user";

  // Si Realtime quita el destino elegido de la lista, la selección vuelve a vacía (no se manda
  // un id viejo que ya no se ve).
  const stillOffered =
    (target === TOP_LEVEL && canGoTop) || options.some((o) => o.id === target);
  useEffect(() => {
    if (target && !stillOffered) setTarget("");
  }, [target, stillOffered]);
  const selected = stillOffered ? target : "";

  if (!open || !definition) return null;

  const confirm = () => {
    if (!selected) return;
    onMove(selected === TOP_LEVEL ? null : selected);
  };

  return (
    <div className="create-node-modal-backdrop">
      <div className="create-node-modal" style={{ maxWidth: 460 }}>
        <h2>{S.title(definition.name)}</h2>
        <label htmlFor="move-definition-target">{S.newParent}</label>
        <select
          id="move-definition-target"
          size={10}
          value={selected}
          onChange={(e) => setTarget(e.target.value)}
          style={{ width: "100%" }}
        >
          {/* Sin esta opción el navegador marca la primera y no se puede elegir con un clic */}
          <option value="" disabled>
            {S.choose}
          </option>
          {canGoTop && <option value={TOP_LEVEL}>{S.topLevel}</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {" ".repeat(Math.min(o.depth, MAX_INDENT) * 3)}
              {`${o.node.name} v ${o.node.version}`}
            </option>
          ))}
        </select>
        {options.length === 0 && !canGoTop && (
          <p style={{ color: "var(--kk-ink-muted)" }}>{S.noTargets}</p>
        )}
        <div className="create-node-modal-buttons" style={{ marginTop: 16 }}>
          <button onClick={onClose}>{S.cancel}</button>
          <button onClick={confirm} disabled={!selected}>
            {S.move}
          </button>
        </div>
      </div>
    </div>
  );
}
