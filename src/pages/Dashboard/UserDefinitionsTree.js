import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  addPredefinedChild,
  buildDefinitionTree,
  createDefinition,
  deleteDefinition,
  listDefinitions,
  moveDefinition,
  pathOf,
  searchKeepIds,
  subscribeToDefinitions,
  subtreeIds,
  updateDefinition,
  visibleRows,
} from "../../backend/definitionsApi";
import { UI_STRINGS } from "../../constants/uiStrings";
import MoveDefinitionModal from "./MoveDefinitionModal";
import DeleteDefinitionModal from "./DeleteDefinitionModal";

const S = UI_STRINGS.dashboard.userDefinitionsTree;
// La sangría deja de crecer después de 8 niveles; la ruta completa queda en el tooltip.
const MAX_INDENT = 8;
const GROUP_KEYS = ["equipment", "material", "personnel", "elements"];

// Error de Supabase → texto de UI_STRINGS (por el HINT de la regla, o por el código).
export function definitionErrorText(err) {
  const byHint = {
    cycle: S.errors.cycle,
    duplicate_sibling: S.errors.duplicateSibling,
    invalid_parent: S.errors.invalidParent,
    predefined_needs_parent: S.errors.predefinedNeedsParent,
    name_required: S.errors.nameRequired,
  };
  if (err?.hint && byHint[err.hint]) return byHint[err.hint];
  if (err?.code === "permission-denied") return S.errors.noPermission;
  return err?.message || S.errors.generic;
}

const labelOf = (node) =>
  node.kind === "predefined"
    ? node.predefined?.label || node.name
    : `${node.name} v ${node.version}`;

// ¿Se puede soltar `comp` (lo que se arrastra desde el panel) sobre `target`?
export function canDropOn(target, comp) {
  if (!comp || target?.kind !== "user") return false;
  if (comp.kind === "userDefinition") {
    return !subtreeIds(comp.definition).has(target.id);
  }
  return comp.kind === "predefined";
}

/**
 * Rama "User Created Definitions" del panel (WFPR-003): la fila raíz y el árbol de definiciones
 * anidadas, guardado en Supabase. Se dibuja como lista plana para soportar miles de niveles.
 */
export default function UserDefinitionsTree({
  label,
  level = 0,
  isOpen,
  onToggle,
  isDesigner,
  search = "",
  setDragComponent,
  openParamDetails,
  renderCreateModal,
}) {
  const [definitions, setDefinitions] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [menu, setMenu] = useState(null);
  const [createState, setCreateState] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(
    () =>
      subscribeToDefinitions(setDefinitions, (err) =>
        setMessage(definitionErrorText(err)),
      ),
    [],
  );

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const tree = useMemo(() => buildDefinitionTree(definitions), [definitions]);

  const rows = useMemo(() => {
    if (search.trim()) {
      const keep = searchKeepIds(tree.byId, search);
      return visibleRows(tree.roots, keep, keep);
    }
    return visibleRows(tree.roots, expanded);
  }, [tree, expanded, search]);

  // Ejecuta un cambio, muestra su error si falla y recarga (por si Realtime no está activo).
  const run = useCallback(async (action) => {
    setMessage("");
    try {
      await action();
      setDefinitions(await listDefinitions());
      return true;
    } catch (err) {
      setMessage(definitionErrorText(err));
      return false;
    }
  }, []);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expand = (id) =>
    id && setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  // --- arrastrar ---
  const startDrag = (e, node) => {
    const payload = {
      kind: "userDefinition",
      id: node.id,
      label: labelOf(node),
      definition: node,
      basePath: node.parentId ? pathOf(tree.byId, node.parentId) : [],
    };
    e.dataTransfer.setData("text/plain", payload.label);
    setDragComponent?.(payload);
  };
  const endDrag = () => {
    setDropTargetId(null);
    setDragComponent?.(null);
  };
  const currentDrag = () => window._dragComponent;

  const dropOn = async (target) => {
    const comp = currentDrag();
    setDropTargetId(null);
    if (!isDesigner || !comp) return;
    if (target === null) {
      if (comp.kind === "userDefinition" && comp.definition.kind === "user") {
        await run(() => moveDefinition(comp.id, null));
      }
      return;
    }
    if (!canDropOn(target, comp)) return;
    const ok =
      comp.kind === "userDefinition"
        ? await run(() => moveDefinition(comp.id, target.id))
        : await run(() =>
            addPredefinedChild(target.id, {
              key: comp.predefinedKey,
              label: comp.label,
              type: comp.type || comp.label,
              ...(comp.procedurePhase
                ? { procedurePhase: comp.procedurePhase }
                : {}),
              ...(comp.operation ? { operation: comp.operation } : {}),
            }),
          );
    if (ok) expand(target.id);
  };

  // --- menú contextual ---
  const openMenu = (e, target) => {
    if (!isDesigner) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, target });
  };

  const siblingsOf = (node) =>
    node.parentId ? tree.byId.get(node.parentId)?.children || [] : tree.roots;

  const menuItems = (target) => {
    if (target === "root") {
      return [
        {
          label: S.menu.new,
          onClick: () => setCreateState({ parentId: null, initial: null }),
        },
      ];
    }
    const siblings = siblingsOf(target);
    const index = siblings.findIndex((n) => n.id === target.id);
    const items = [];
    if (target.kind === "user") {
      items.push(
        {
          label: S.menu.newInside,
          onClick: () => setCreateState({ parentId: target.id, initial: null }),
        },
        {
          label: S.menu.edit,
          onClick: () => setCreateState({ parentId: null, initial: target }),
        },
      );
    }
    items.push(
      {
        label: S.menu.moveUp,
        disabled: index <= 0,
        onClick: () =>
          run(() => moveDefinition(target.id, target.parentId, index - 1)),
      },
      {
        label: S.menu.moveDown,
        disabled: index < 0 || index >= siblings.length - 1,
        onClick: () =>
          run(() => moveDefinition(target.id, target.parentId, index + 1)),
      },
      { label: S.menu.moveTo, onClick: () => setMoveTarget(target) },
      { label: S.menu.delete, onClick: () => setDeleteTarget(target) },
    );
    return items;
  };

  // --- filas ---
  const indent = (depth) => (level + 1) * 10 + Math.min(depth, MAX_INDENT) * 12;

  const renderDefinitionRow = ({ node, depth }) => {
    const hasContent = node.kind === "user";
    const isNodeOpen = expanded.has(node.id) || Boolean(search.trim());
    const path = pathOf(tree.byId, node.id).join(" › ");
    return (
      <div
        key={node.id}
        data-testid={`definition-row-${node.id}`}
        className="tree-node"
        title={[path, node.description].filter(Boolean).join("\n")}
        draggable={isDesigner}
        onDragStart={(e) => startDrag(e, node)}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (isDesigner && canDropOn(node, currentDrag())) {
            e.preventDefault();
            setDropTargetId(node.id);
          }
        }}
        onDragLeave={() =>
          setDropTargetId((id) => (id === node.id ? null : id))
        }
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dropOn(node);
        }}
        onContextMenu={(e) => openMenu(e, node)}
        style={{
          marginLeft: indent(depth),
          cursor: isDesigner ? "grab" : "pointer",
          color: node.kind === "predefined" ? "blue" : "green",
          background: dropTargetId === node.id ? "#d0e8ff" : undefined,
          borderRadius: 4,
        }}
      >
        <span
          style={{ marginRight: 4, cursor: "pointer" }}
          onClick={() => hasContent && toggle(node.id)}
        >
          {hasContent ? (isNodeOpen ? "- " : "+ ") : "  "}
        </span>
        <span onClick={() => hasContent && toggle(node.id)}>
          {labelOf(node)}
          {node.kind === "predefined" && (
            <em style={{ color: "#555", marginLeft: 6 }}>
              {S.predefinedTag}
            </em>
          )}
        </span>
      </div>
    );
  };

  const renderGroups = ({ node, depth }) => {
    const paramsKey = `${node.id}:params`;
    const paramsOpen = expanded.has(paramsKey);
    const params = (node.parameters || []).filter((p) => p && p.name);
    return (
      <div key={`${node.id}:groups`}>
        <div
          className="tree-node"
          style={{ marginLeft: indent(depth), cursor: "pointer" }}
          onClick={() => params.length && toggle(paramsKey)}
        >
          {params.length ? (paramsOpen ? "- " : "+ ") : "  "}
          {S.groups.parameters}
          {params.length ? ` (${params.length})` : ""}
        </div>
        {paramsOpen &&
          params.map((p) => (
            <div
              key={`${paramsKey}:${p.name}`}
              className="tree-node"
              style={{ marginLeft: indent(depth + 1), cursor: "pointer" }}
              onClick={() => openParamDetails?.(p, labelOf(node))}
            >
              {String(p.name)}
            </div>
          ))}
        {GROUP_KEYS.map((g) => (
          <div
            key={`${node.id}:${g}`}
            className="tree-node"
            style={{ marginLeft: indent(depth) }}
          >
            {"  "}
            {S.groups[g]}
          </div>
        ))}
      </div>
    );
  };

  const topCount = tree.roots.length;
  const createParentPath =
    createState?.parentId != null ? pathOf(tree.byId, createState.parentId) : null;

  return (
    <>
      <div
        className="tree-node"
        data-testid="user-definitions-root"
        onContextMenu={(e) => openMenu(e, "root")}
        onDragOver={(e) => {
          const comp = currentDrag();
          if (
            isDesigner &&
            comp?.kind === "userDefinition" &&
            comp.definition.kind === "user"
          ) {
            e.preventDefault();
            setDropTargetId("root");
          }
        }}
        onDragLeave={() => setDropTargetId((id) => (id === "root" ? null : id))}
        onDrop={(e) => {
          e.preventDefault();
          dropOn(null);
        }}
        style={{
          marginLeft: level * 10,
          cursor: "pointer",
          background: dropTargetId === "root" ? "#d0e8ff" : undefined,
          borderRadius: 4,
        }}
      >
        {isDesigner && (
          <span
            role="button"
            aria-label={S.menu.new}
            style={{
              marginRight: 6,
              cursor: "pointer",
              fontWeight: "bold",
              color: "#1677ff",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setCreateState({ parentId: null, initial: null });
            }}
          >
            +
          </span>
        )}
        <span style={{ marginRight: 4 }} onClick={onToggle}>
          {topCount > 0 ? (isOpen ? "- " : "+ ") : ""}
        </span>
        <span onClick={onToggle}>
          {topCount > 0 ? `${label} (${topCount})` : label}
        </span>
      </div>

      {message && (
        <div
          role="alert"
          className="error-message"
          style={{ marginLeft: (level + 1) * 10, color: "red" }}
        >
          {message}
        </div>
      )}

      {(isOpen || search.trim()) &&
        rows.map((row) =>
          row.type === "groups" ? renderGroups(row) : renderDefinitionRow(row),
        )}

      {menu && (
        <div
          role="menu"
          style={{
            position: "fixed",
            top: menu.y,
            left: menu.x,
            background: "#fff",
            border: "1px solid #ccc",
            boxShadow: "0 2px 8px #888",
            zIndex: 999,
            borderRadius: 4,
          }}
        >
          {menuItems(menu.target).map((item) => (
            <div
              key={item.label}
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              style={{
                padding: "8px 18px",
                cursor: item.disabled ? "default" : "pointer",
                color: item.disabled ? "#aaa" : undefined,
              }}
              onClick={() => {
                if (item.disabled) return;
                setMenu(null);
                item.onClick();
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}

      {renderCreateModal?.({
        open: Boolean(createState),
        initial: createState?.initial || null,
        parentPath: createParentPath,
        onClose: () => setCreateState(null),
        onOk: async (form) => {
          const fields = {
            name: form.name,
            version: form.version,
            description: form.desc,
            abstract: form.abstract,
            implementation: form.implementation,
            parameters: form.parameters,
          };
          const { initial, parentId } = createState;
          const ok = await run(() =>
            initial
              ? updateDefinition(initial.id, fields)
              : createDefinition(parentId, fields),
          );
          if (ok) {
            setCreateState(null);
            expand(parentId);
          }
        },
      })}

      <MoveDefinitionModal
        open={Boolean(moveTarget)}
        definition={moveTarget}
        tree={tree}
        onClose={() => setMoveTarget(null)}
        onMove={async (newParentId) => {
          const ok = await run(() => moveDefinition(moveTarget.id, newParentId));
          if (ok) {
            setMoveTarget(null);
            expand(newParentId);
          }
        }}
      />

      <DeleteDefinitionModal
        open={Boolean(deleteTarget)}
        definition={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async (keepChildren) => {
          const ok = await run(() =>
            deleteDefinition(deleteTarget.id, keepChildren),
          );
          if (ok) setDeleteTarget(null);
        }}
      />
    </>
  );
}
