import "../../styles/DashboardStyle/DashboardStyle.css";
/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SaveWorkflowModal from "./SaveWorkflowModal";
import OpenWorkflowModal from "./OpenWorkflowModal";
import ShareWorkflowModal from "./ShareWorkflowModal";
import UnsavedChangesModal from "./UnsavedChangesModal";
import CheckoutModal from "./CheckoutModal";
import VersionHistoryModal from "./VersionHistoryModal";
import UserDefinitionsTree from "./UserDefinitionsTree";
import { connectionsForLoadedWorkflow } from "./canvasConnections";
import { dropDanglingConnections } from "../../backend/mappers";
import { EquipmentNode } from "./equipmentData";
import { MaterialsNode } from "./MaterialData";
import { onSessionChange, signOut } from "../../backend/authApi";
import {
  approveWorkflow,
  checkoutWorkflow,
  compileWorkflow,
  createWorkflow,
  getWorkflow,
  listMyWorkflows,
  listUsers,
  saveWorkflow,
  subscribeToWorkflow,
} from "../../backend/workflowsApi";
import {
  expandForCanvas,
  predefinedKeyFor,
} from "../../backend/definitionsApi";
import ModalMessage from "../../components/ModalMessage";
import Selecto from "react-selecto";
import Logo from "../../components/Logo/Logo";
import { useTheme } from "../../theme/ThemeContext";
import { UI_STRINGS } from "../../constants/uiStrings";

// === Helpers para normalizar nodos y generar IDs cortos ===
const NODE_DEFINITION_NAMES = new Set([
  "Procedure Phase",
  "Procedure Operation",
  "Procedure Unit Procedure",
  "Procedure",
  "Area Procedure",
  "Site Procedure",
]);

// === NodeParametersModal (versión grande + atributos + audit) ===
function NodeParametersModal({
  open,
  onClose,
  onAccept,
  nodeData,
  isReadOnly,
}) {
  const TABS = [
    "Current Node (Local Parameters)",
    "Add Vanilla Node",
    "Mix Node",
  ];

  // 1) Datos base (trae atributos para que sí aparezcan en el panel)
  const seed = [
    {
      id: 1,
      name: "Vanilla Flavor Amount",
      type: "CPP",
      origin: "Value",
      desc: "Second Floor",
      value: "3.8",
      units: "Kg",
      attributes: { testSpec: { quantity: "3.8kg ± 0.1kg" } },
    },
    {
      id: 2,
      name: "Mixing Temperature",
      type: "CQA",
      origin: "Defer",
      desc: "Formulation",
      value: "Temp Setpoint",
      units: "C",
      attributes: { qualifiedLimits: { min: 18, max: 25 } },
    },
    {
      id: 3,
      name: "Mixing Speed",
      type: "CQA",
      origin: "Defer",
      desc: "Formulation",
      value: "Target Speed",
      units: "RPM",
      attributes: { range: { lower: 100, upper: 800 } },
    },
  ];

  // 2) Si el nodo ya trae parámetros guardados, los usamos; si no, usamos seed
  const initialByTab = React.useMemo(() => {
    const fromNode = nodeData?.parameters || nodeData?.paramsByTab;
    if (fromNode && typeof fromNode === "object") {
      // normalizamos: aseguramos las 3 pestañas
      return {
        [TABS[0]]: fromNode[TABS[0]] || [],
        [TABS[1]]: fromNode[TABS[1]] || [],
        [TABS[2]]: fromNode[TABS[2]] || [],
      };
    }
    return { [TABS[0]]: seed, [TABS[1]]: [], [TABS[2]]: [] };
  }, [nodeData]);

  const [activeTab, setActiveTab] = React.useState(TABS[0]);
  const [paramsByTab, setParamsByTab] = React.useState(initialByTab);
  const [selectedParamId, setSelectedParamId] = React.useState(
    initialByTab[TABS[0]]?.[0]?.id ?? null,
  );

  // Estado para la posición (desplazamiento) del panel
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  // Estado para saber si estamos arrastrando
  const [isDragging, setIsDragging] = React.useState(false);
  // Estado para guardar la posición inicial del clic
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

  // Efecto para manejar el arrastre
  React.useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      // Calcula la nueva posición restando la posición inicial del clic
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // Solo añadimos los listeners si estamos arrastrando
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    // Función de limpieza para quitar los listeners
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart]); // Dependencias

  React.useEffect(() => {
    if (open) {
      setActiveTab(TABS[0]);
      setParamsByTab(initialByTab);
      setSelectedParamId(initialByTab[TABS[0]]?.[0]?.id ?? null);
      setPosition({ x: 0, y: 0 });
      //document.body.style.overflow = "hidden";
    }
    //return () => (document.body.style.overflow = "");
  }, [open, initialByTab]);

  if (!open) return null;

  const nextId = () => Math.floor(Math.random() * 1e9);

  const addParameter = () => {
    const blank = {
      id: nextId(),
      name: "",
      type: "",
      origin: "",
      desc: "",
      value: "",
      units: "",
      attributes: {}, // deja el objeto para que el panel de atributos funcione
    };
    setParamsByTab((prev) => {
      const list = [...(prev[activeTab] || []), blank];
      return { ...prev, [activeTab]: list };
    });
    setSelectedParamId(blank.id);
  };

  const updateField = (id, field, value) => {
    setParamsByTab((prev) => ({
      ...prev,
      [activeTab]: (prev[activeTab] || []).map((p) =>
        p.id === id ? { ...p, [field]: value } : p,
      ),
    }));
  };

  const updateAttribute = (paramId, attrKey, value) => {
    setParamsByTab((prev) => ({
      ...prev,
      [activeTab]: (prev[activeTab] || []).map((p) =>
        p.id === paramId
          ? {
              ...p,
              attributes: {
                ...(p.attributes || {}),
                [attrKey]: value,
              },
            }
          : p,
      ),
    }));
  };

  const updateNestedAttribute = (paramId, attrKey, nestedKey, value) => {
    setParamsByTab((prev) => ({
      ...prev,
      [activeTab]: (prev[activeTab] || []).map((p) =>
        p.id === paramId
          ? {
              ...p,
              attributes: {
                ...(p.attributes || {}),
                [attrKey]: {
                  ...(p.attributes?.[attrKey] || {}),
                  [nestedKey]: value,
                },
              },
            }
          : p,
      ),
    }));
  };

  const removeParameter = (id) => {
    setParamsByTab((prev) => {
      const list = (prev[activeTab] || []).filter((p) => p.id !== id);
      return { ...prev, [activeTab]: list };
    });
    if (selectedParamId === id) setSelectedParamId(null);
  };

  const selectedParam =
    (paramsByTab[activeTab] || []).find((p) => p.id === selectedParamId) ||
    null;

  const renderAttributes = () => {
    if (!selectedParam) {
      return (
        <div style={{ color: "var(--kk-ink-muted)" }}>
          {UI_STRINGS.dashboard.nodeParametersModal.selectAParameterToSee}
        </div>
      );
    }

    // Asignamos defaults si no existen para que la UI sea consistente
    const attrs = selectedParam.attributes || {};
    // Usar el nombre del parámetro como default si el atributo 'name' no existe
    const name = attrs.name !== undefined ? attrs.name : selectedParam.name;
    const upperLimit = attrs.upperLimit ?? "";
    const lowerLimit = attrs.lowerLimit ?? "";
    const testSpec1 = attrs.testSpec1 ?? "";
    const qualifiedLimits = attrs.qualifiedLimits || { min: "", max: "" };
    const hierarchyScope = attrs.hierarchyScope ?? "";
    const expandedDesc = attrs.expandedDesc ?? "";
    const paramId = selectedParam.id;

    // REQ-UI-015: Tabla de Atributos Extendidos
    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--kk-raised)", textAlign: "left" }}>
            <th style={{ padding: 6, width: "30%" }}>
              {UI_STRINGS.dashboard.nodeParametersModal.attribute}
            </th>
            <th style={{ padding: 6 }}>
              {UI_STRINGS.dashboard.nodeParametersModal.value}
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Name */}
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>
              {UI_STRINGS.dashboard.nodeParametersModal.name}
            </td>
            <td style={{ padding: 4 }}>
              <input
                value={name}
                onChange={(e) =>
                  updateAttribute(paramId, "name", e.target.value)
                }
                style={{ width: "100%" }}
                disabled={isReadOnly}
                placeholder={
                  UI_STRINGS.dashboard.nodeParametersModal.attributeName
                }
              />
            </td>
          </tr>
          {/* Upper Limit */}
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>
              {UI_STRINGS.dashboard.nodeParametersModal.upperLimit}
            </td>
            <td style={{ padding: 4 }}>
              <input
                type="number"
                value={upperLimit}
                onChange={(e) =>
                  updateAttribute(paramId, "upperLimit", e.target.value)
                }
                style={{ width: "100%" }}
                disabled={isReadOnly}
                placeholder={
                  UI_STRINGS.dashboard.nodeParametersModal.upperLimitPlaceholder
                }
              />
            </td>
          </tr>
          {/* Lower Limit */}
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>
              {UI_STRINGS.dashboard.nodeParametersModal.lowerLimit}
            </td>
            <td style={{ padding: 4 }}>
              <input
                type="number"
                value={lowerLimit}
                onChange={(e) =>
                  updateAttribute(paramId, "lowerLimit", e.target.value)
                }
                style={{ width: "100%" }}
                disabled={isReadOnly}
                placeholder={
                  UI_STRINGS.dashboard.nodeParametersModal.lowerLimitPlaceholder
                }
              />
            </td>
          </tr>
          {/* Test Specification 1 */}
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>
              {UI_STRINGS.dashboard.nodeParametersModal.testSpecification1}
            </td>
            <td style={{ padding: 4 }}>
              <input
                value={testSpec1}
                onChange={(e) =>
                  updateAttribute(paramId, "testSpec1", e.target.value)
                }
                style={{ width: "100%" }}
                disabled={isReadOnly}
                placeholder={
                  UI_STRINGS.dashboard.nodeParametersModal
                    .testSpecificationPlaceholder
                }
              />
            </td>
          </tr>
          {/* Qualified Limits */}
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>
              {UI_STRINGS.dashboard.nodeParametersModal.qualifiedLimits}
            </td>
            <td style={{ padding: 4, display: "flex", gap: 8 }}>
              <input
                value={qualifiedLimits.min}
                onChange={(e) =>
                  updateNestedAttribute(
                    paramId,
                    "qualifiedLimits",
                    "min",
                    e.target.value,
                  )
                }
                style={{ width: "50%" }}
                disabled={isReadOnly}
                placeholder={UI_STRINGS.dashboard.nodeParametersModal.min}
              />
              <input
                value={qualifiedLimits.max}
                onChange={(e) =>
                  updateNestedAttribute(
                    paramId,
                    "qualifiedLimits",
                    "max",
                    e.target.value,
                  )
                }
                style={{ width: "50%" }}
                disabled={isReadOnly}
                placeholder={UI_STRINGS.dashboard.nodeParametersModal.max}
              />
            </td>
          </tr>
          {/* Hierarchy Scope */}
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>
              {UI_STRINGS.dashboard.nodeParametersModal.hierarchyScope}
            </td>
            <td style={{ padding: 4 }}>
              <input
                value={hierarchyScope}
                onChange={(e) =>
                  updateAttribute(paramId, "hierarchyScope", e.target.value)
                }
                style={{ width: "100%" }}
                disabled={isReadOnly}
                placeholder={
                  UI_STRINGS.dashboard.nodeParametersModal
                    .hierarchyScopePlaceholder
                }
              />
            </td>
          </tr>
          {/* Expanded Description */}
          <tr>
            <td style={{ padding: 4, fontWeight: "bold" }}>
              {UI_STRINGS.dashboard.nodeParametersModal.expandedDescription}
            </td>
            <td style={{ padding: 4 }}>
              <textarea
                value={expandedDesc}
                onChange={(e) =>
                  updateAttribute(paramId, "expandedDesc", e.target.value)
                }
                style={{ width: "100%", minHeight: "60px" }}
                disabled={isReadOnly}
                placeholder={
                  UI_STRINGS.dashboard.nodeParametersModal
                    .detailedDescriptionOfTheAttribute
                }
              />
            </td>
          </tr>
        </tbody>
      </table>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0, // <-- Reemplaza top/left/right/bottom
        background: "transparent",
        zIndex: 10000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center", // <-- MODIFICADO: Centra verticalmente
        padding: "20px", // Mantenemos el padding por si el modal es más grande que la ventana
        overflowY: "auto", // <-- MODIFICADO: Permite scroll si el modal no cabe
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "1200px",
          height: "600px",
          background: "var(--kk-surface)",
          borderRadius: 10,
          boxShadow: "var(--kk-shadow-overlay)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          pointerEvents: "auto",
          transform: `translate(${position.x}px, ${position.y}px)`,
          userSelect: isDragging ? "none" : "auto", // Evita seleccionar texto
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            borderBottom: "1px solid var(--kk-border)",
            cursor: "move",
          }}
          onMouseDown={(e) => {
            setIsDragging(true);
            // Guarda dónde hicimos clic (e.clientX) MENOS el desplazamiento
            // actual (position.x) para que el panel no "salte"
            setDragStart({
              x: e.clientX - position.x,
              y: e.clientY - position.y,
            });
            e.preventDefault(); // Evita que se seleccione el texto del título
          }}
        >
          <h3 style={{ margin: 0 }}>
            {nodeData?.label || UI_STRINGS.dashboard.nodeParametersModal.node}{" "}
            {UI_STRINGS.dashboard.nodeParametersModal.parametersTitleSuffix}
          </h3>
          <button
            onClick={onClose}
            style={{
              fontSize: 22,
              background: "none",
              border: "none",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Cuerpo */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "260px 1fr",
            flex: 1,
            overflow: "hidden",
          }}
        >
          {/* Tabs izquierda */}
          <div
            style={{
              borderRight: "1px solid var(--kk-border)",
              overflowY: "auto",
            }}
          >
            {TABS.map((tab) => (
              <div
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  // al cambiar de pestaña, seleccionamos el primer parámetro si existe
                  const first = (paramsByTab[tab] || [])[0]?.id ?? null;
                  setSelectedParamId(first);
                }}
                style={{
                  padding: "12px 16px",
                  background:
                    activeTab === tab ? "var(--kk-brand-mint)" : "transparent",
                  color:
                    activeTab === tab ? "var(--kk-on-brand)" : "var(--kk-ink)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                {tab}
              </div>
            ))}
          </div>

          {/* Panel derecho */}
          <div style={{ padding: 18, overflowY: "auto" }}>
            {/* Barra superior + botón agregar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <h4 style={{ margin: 0 }}>
                {UI_STRINGS.dashboard.nodeParametersModal.parameters}{" "}
                {activeTab === "Add Vanilla Node" &&
                  UI_STRINGS.dashboard.nodeParametersModal.vanillaNode}
              </h4>
              <button
                onClick={addParameter}
                disabled={isReadOnly}
                style={{
                  background: isReadOnly
                    ? "var(--kk-border)"
                    : "var(--kk-brand-mint)",
                  color: "var(--kk-on-brand)",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  cursor: isReadOnly ? "not-allowed" : "pointer",
                }}
              >
                {UI_STRINGS.dashboard.nodeParametersModal.newParameter}
              </button>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: "18px",
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 3 }}>
                {" "}
                {/* Columna 1: Parámetros (aprox 60%) */}
                {/* Tabla parámetros */}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr
                      style={{
                        background: "var(--kk-raised)",
                        textAlign: "left",
                      }}
                    >
                      <th style={{ padding: 6 }}>
                        {UI_STRINGS.dashboard.nodeParametersModal.name}
                      </th>
                      <th style={{ padding: 6 }}>
                        {UI_STRINGS.dashboard.nodeParametersModal.type}
                      </th>
                      <th style={{ padding: 6 }}>
                        {UI_STRINGS.dashboard.nodeParametersModal.origin}
                      </th>
                      <th style={{ padding: 6 }}>
                        {
                          UI_STRINGS.dashboard.nodeParametersModal
                            .shortDescription
                        }
                      </th>
                      <th style={{ padding: 6 }}>
                        {UI_STRINGS.dashboard.nodeParametersModal.value}
                      </th>
                      <th style={{ padding: 6 }}>
                        {UI_STRINGS.dashboard.nodeParametersModal.engUnits}
                      </th>
                      <th style={{ padding: 6, width: 30 }}>✖</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(paramsByTab[activeTab] || []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          style={{ color: "var(--kk-ink-muted)", padding: 10 }}
                        >
                          {
                            UI_STRINGS.dashboard.nodeParametersModal
                              .noParametersUseNewParameter
                          }
                        </td>
                      </tr>
                    ) : (
                      (paramsByTab[activeTab] || []).map((p) => {
                        const selected = p.id === selectedParamId;
                        return (
                          <tr
                            key={p.id}
                            onClick={() => setSelectedParamId(p.id)}
                            style={{
                              background: selected
                                ? "var(--kk-cyan-soft)"
                                : "transparent",
                            }}
                            // --- AÑADIR ESTOS MANEJADORES ---
                            onDragOver={(e) => {
                              e.preventDefault(); // ¡Necesario para permitir el drop!
                              e.currentTarget.style.background =
                                "var(--kk-mint-soft)"; // Feedback visual
                            }}
                            onDragEnter={(e) => e.preventDefault()}
                            onDragLeave={(e) => {
                              // Devolver el color original
                              e.currentTarget.style.background = selected
                                ? "var(--kk-cyan-soft)"
                                : "transparent";
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.currentTarget.style.background = selected
                                ? "var(--kk-cyan-soft)"
                                : "transparent";

                              try {
                                // 1. Obtener los datos arrastrados
                                const data = JSON.parse(
                                  e.dataTransfer.getData("application/json"),
                                );

                                // 2. Decidir qué valor asignar (¡NUEVA LÓGICA!)
                                let valueToAssign;

                                if (data.details && data.details.tagPath) {
                                  // Opción 1 (Preferida): Usar el tagPath de 'details'
                                  valueToAssign = data.details.tagPath;
                                } else if (
                                  data.abstract &&
                                  data.abstract.startsWith("Tag: ")
                                ) {
                                  // Opción 2: Extraer el valor de 'abstract' (quitando "Tag: ")
                                  valueToAssign = data.abstract
                                    .substring(5)
                                    .trim();
                                } else {
                                  // Opción 3 (Fallback): Usar el label (comportamiento anterior)
                                  valueToAssign = data.label || "Error";
                                }

                                // 3. Usar la función existente para actualizar el estado
                                updateField(p.id, "value", valueToAssign);

                                console.log(
                                  `Dropped ${data.label} onto ${p.name}, assigned value: ${valueToAssign}`,
                                );
                              } catch (err) {
                                console.error("Error al soltar:", err);
                              }
                            }}
                          >
                            <td style={{ padding: 4 }}>
                              <input
                                value={p.name}
                                onChange={(e) =>
                                  updateField(p.id, "name", e.target.value)
                                }
                                placeholder={
                                  UI_STRINGS.dashboard.nodeParametersModal.name
                                }
                                style={{ width: "100%" }}
                                disabled={true}
                              />
                            </td>
                            <td style={{ padding: 4 }}>
                              <input
                                value={p.type}
                                onChange={(e) =>
                                  updateField(p.id, "type", e.target.value)
                                }
                                placeholder={
                                  UI_STRINGS.dashboard.nodeParametersModal.type
                                }
                                style={{ width: "100%" }}
                                disabled={isReadOnly}
                              />
                            </td>
                            <td style={{ padding: 4 }}>
                              <input
                                value={p.origin}
                                onChange={(e) =>
                                  updateField(p.id, "origin", e.target.value)
                                }
                                placeholder={
                                  UI_STRINGS.dashboard.nodeParametersModal
                                    .origin
                                }
                                style={{ width: "100%" }}
                                disabled={true}
                              />
                            </td>
                            <td style={{ padding: 4 }}>
                              <input
                                value={p.desc}
                                onChange={(e) =>
                                  updateField(p.id, "desc", e.target.value)
                                }
                                placeholder={
                                  UI_STRINGS.dashboard.nodeParametersModal
                                    .shortDescriptionPlaceholder
                                }
                                style={{ width: "100%" }}
                                disabled={isReadOnly}
                              />
                            </td>
                            <td style={{ padding: 4 }}>
                              <input
                                value={p.value}
                                onChange={(e) =>
                                  updateField(p.id, "value", e.target.value)
                                }
                                placeholder={
                                  UI_STRINGS.dashboard.nodeParametersModal.value
                                }
                                style={{ width: "100%" }}
                                disabled={isReadOnly}
                              />
                            </td>
                            <td style={{ padding: 4 }}>
                              <input
                                value={p.units}
                                onChange={(e) =>
                                  updateField(p.id, "units", e.target.value)
                                }
                                placeholder={
                                  UI_STRINGS.dashboard.nodeParametersModal.units
                                }
                                style={{ width: "100%" }}
                                disabled={isReadOnly}
                              />
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  removeParameter(p.id);
                                }}
                                disabled={isReadOnly}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: isReadOnly
                                    ? "var(--kk-ink-muted)"
                                    : "var(--kk-status-changes-fg)",
                                  fontWeight: 700,
                                  cursor: isReadOnly
                                    ? "not-allowed"
                                    : "pointer",
                                }}
                                title={
                                  UI_STRINGS.dashboard.nodeParametersModal
                                    .delete
                                }
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>{" "}
              {/* Fin Columna 1 */}
              <div style={{ flex: 2 }}>
                {" "}
                {/* (aprox 40%) */}
                {/* Extended Attributes */}
                <div style={{ marginTop: 0 }}>
                  <h4 style={{ margin: "14px 0 6px" }}>
                    {
                      UI_STRINGS.dashboard.nodeParametersModal
                        .extendedAttributes
                    }
                  </h4>
                  <div
                    style={{
                      border: "1px solid var(--kk-border)",
                      borderRadius: 6,
                      padding: 10,
                      minHeight: 56,
                    }}
                  >
                    {renderAttributes()}
                  </div>
                </div>
              </div>{" "}
              {/* Fin Columna 2 */}
            </div>{" "}
            {/* Fin Contenedor Flex Row */}
            {/* Audit Trail (fijo, ilustrativo) */}
            <div style={{ marginTop: 18 }}>
              <h4 style={{ margin: "14px 0 6px" }}>
                {UI_STRINGS.dashboard.nodeParametersModal.auditTrail}
              </h4>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      background: "var(--kk-raised)",
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: 6 }}>
                      {
                        UI_STRINGS.dashboard.nodeParametersModal
                          .shortDescription
                      }
                    </th>
                    <th style={{ padding: 6 }}>
                      {UI_STRINGS.dashboard.nodeParametersModal.action}
                    </th>
                    <th style={{ padding: 6 }}>
                      {UI_STRINGS.dashboard.nodeParametersModal.user}
                    </th>
                    <th style={{ padding: 6 }}>
                      {UI_STRINGS.dashboard.nodeParametersModal.version}
                    </th>
                    <th style={{ padding: 6 }}>
                      {UI_STRINGS.dashboard.nodeParametersModal.timestamp}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: 6 }}>
                      {
                        UI_STRINGS.dashboard.nodeParametersModal
                          .auditSampleDescription
                      }
                    </td>
                    <td style={{ padding: 6 }}>
                      {
                        UI_STRINGS.dashboard.nodeParametersModal
                          .auditSampleAction
                      }
                    </td>
                    <td style={{ padding: 6 }}>
                      {UI_STRINGS.dashboard.nodeParametersModal.auditSampleUser}
                    </td>
                    <td style={{ padding: 6 }}>2.0</td>
                    <td style={{ padding: 6 }}>
                      {
                        UI_STRINGS.dashboard.nodeParametersModal
                          .auditSampleTimestamp
                      }
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--kk-border)",
            textAlign: "right",
          }}
        >
          <button onClick={onClose} style={{ marginRight: 8 }}>
            {UI_STRINGS.dashboard.nodeParametersModal.cancel}
          </button>
          <button
            onClick={() => onAccept?.({ paramsByTab })}
            disabled={isReadOnly}
            style={{
              background: isReadOnly
                ? "var(--kk-border)"
                : "var(--kk-brand-mint)",
              color: "var(--kk-on-brand)",
              border: "none",
              borderRadius: 6,
              padding: "8px 14px",
              cursor: isReadOnly ? "not-allowed" : "pointer",
            }}
          >
            {UI_STRINGS.dashboard.nodeParametersModal.accept}
          </button>
        </div>
      </div>
    </div>
  );
}

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Si el nodo trae family explícitoo
function classifyType(node) {
  const t = String(node.type || "").trim();
  if (/^(begin|start)$/i.test(t)) return "BeginElement";
  if (/^end$/i.test(t)) return "EndElement";
  if (/^connection$/i.test(t)) return "Connection";
  if (node.family) return String(node.family);

  if (NODE_DEFINITION_NAMES.has(t)) return "NodeDefinition";
  if (/(cutter|press|belt|robot|machine|laser|conveyor)/i.test(t))
    return "Equipment";

  // Extiende aquí en el futuro: Assets, DataLayer, WorkInstructions, Materials…
  return t || "Node";
}

// Genera IDs cortos y legibles para este XML (mapea oldId -> newId)
function makeCompactIds(nodesInOrder) {
  const used = new Set();
  const idMap = new Map();
  let seq = 1;

  for (const n of nodesInOrder) {
    const t = String(n.type || "");
    let newId;

    if (/^(begin|start)$/i.test(t)) {
      newId = "node_begin";
    } else if (/^end$/i.test(t)) {
      newId = "node_end";
    } else if (/^connection$/i.test(t)) {
      newId = `connection_${seq++}`;
    } else {
      const base = slug(n.label || n.name || n.type) || "node";
      let candidate = `${base.substring(0, 16)}_${seq++}`;
      while (used.has(candidate))
        candidate = `${base.substring(0, 16)}_${seq++}`;
      newId = candidate;
    }

    used.add(newId);
    idMap.set(n.id, newId);
  }

  return idMap;
}

// Modal para el formulario "Create Node"
// initial: definición a editar (modo edición); parentPath: nombres de los ancestros al crear dentro.
export function CreateNodeModal({
  open,
  onClose,
  onOk,
  initial = null,
  parentPath = null,
}) {
  const [name, setName] = React.useState("");
  const [version, setVersion] = React.useState("1.0");
  const [desc, setDesc] = React.useState("");
  const [abstract, setAbstract] = React.useState("");
  const [error, setError] = React.useState("");
  const [params, setParams] = React.useState([
    { id: Date.now(), name: "", dataType: "REAL", defaultValue: "" },
  ]);
  const [program, setProgram] = React.useState("MainProgram");
  const [routine, setRoutine] = React.useState("SFC_Control_Routine");

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setVersion(initial?.version ?? "1.0");
      setDesc(initial?.description ?? "");
      setAbstract(initial?.abstract ?? "");
      setError("");
      setProgram(initial?.implementation?.program || "MainProgram");
      setRoutine(initial?.implementation?.routine || "SFC_Control_Routine");
      // Al editar se cargan los parámetros tal cual (sin fila en blanco si no tiene ninguno). Los
      // BOOL siguen siendo booleanos: String(false) es "false", que Boolean() convertiría en true.
      setParams(
        initial
          ? (Array.isArray(initial.parameters) ? initial.parameters : []).map(
              (p, i) => ({
                id: Date.now() + i,
                name: p?.name ?? "",
                dataType: p?.dataType || "REAL",
                defaultValue:
                  p?.dataType === "BOOL"
                    ? parseBool(p.defaultValue)
                    : String(p?.defaultValue ?? ""),
              }),
            )
          : [{ id: Date.now(), name: "", dataType: "REAL", defaultValue: "" }],
      );
    }
  }, [open, initial]);

  const addParam = () =>
    setParams((l) => [
      ...l,
      {
        id: Math.floor(Math.random() * 1e9),
        name: "",
        dataType: "REAL",
        defaultValue: "",
      },
    ]);
  const removeParam = (id) => setParams((l) => l.filter((p) => p.id !== id));
  const updateParam = (id, field, value) =>
    setParams((l) =>
      l.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );

  const normalizeDefaultValue = (p) => {
    switch (p.dataType) {
      case "BOOL":
        return parseBool(p.defaultValue);
      case "INT":
        return Number.isFinite(parseInt(p.defaultValue, 10))
          ? parseInt(p.defaultValue, 10)
          : 0;
      case "REAL":
        return Number.isFinite(parseFloat(p.defaultValue))
          ? parseFloat(p.defaultValue)
          : 0.0;
      case "STRING":
      default:
        return String(p.defaultValue ?? "");
    }
  };

  const validateParams = () => {
    for (const p of params) {
      const E = UI_STRINGS.dashboard.createNodeModal.errors;
      if (!p.name || !p.dataType) return E.invalidParameter(p.name);
      if (p.dataType === "BOOL") {
        if (p.defaultValue === undefined || p.defaultValue === null)
          return E.defaultRequired(p.name);
      } else if (p.dataType === "INT") {
        if (!/^-?\d+$/.test(String(p.defaultValue).trim()))
          return E.invalidInt(p.name);
      } else if (p.dataType === "REAL") {
        if (isNaN(parseFloat(String(p.defaultValue))))
          return E.invalidReal(p.name);
      } else if (String(p.defaultValue).length === 0) {
        return E.defaultRequired(p.name);
      }
    }
    return null;
  };

  const handleOk = () => {
    // Descripción y abstract se piden al crear; al editar pueden quedar vacíos (definiciones
    // guardadas sin ellos, que la base permite).
    const missingText = !initial && (!desc.trim() || !abstract.trim());
    if (!name.trim() || !version.trim() || missingText) {
      setError(
        UI_STRINGS.dashboard.createNodeModal.errors.porFavorCompletaTodosLos,
      );
      return;
    }
    const err = validateParams();
    if (err) return setError(err);
    const cleanParams = params.map((p) => ({
      name: p.name.trim(),
      dataType: p.dataType,
      defaultValue: normalizeDefaultValue(p),
    }));
    onOk({
      name,
      version,
      desc,
      abstract,
      implementation: {
        program,
        routine,
      },
      parameters: cleanParams,
    });
  };

  if (!open) return null;
  return (
    <div className="create-node-modal-backdrop">
      <div
        className="create-node-modal"
        style={{
          maxHeight: "80vh",
          overflowY: "auto",
          paddingRight: "8px",
        }}
      >
        <h2>
          {initial
            ? UI_STRINGS.dashboard.createNodeModal.titleEdit(initial.name)
            : UI_STRINGS.dashboard.createNodeModal.createNode}
        </h2>
        {parentPath?.length > 0 && (
          <p style={{ marginTop: 0, color: "var(--kk-ink-muted)" }}>
            {UI_STRINGS.dashboard.createNodeModal.insideOf(
              parentPath.join(" \u203a "),
            )}
          </p>
        )}
        <label>{UI_STRINGS.dashboard.createNodeModal.nodeDefinitionName}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={UI_STRINGS.dashboard.createNodeModal.enterNodeName}
        />
        <label>{UI_STRINGS.dashboard.createNodeModal.nodeVersion}</label>
        <input
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder={UI_STRINGS.dashboard.createNodeModal.versionPlaceholder}
        />
        <label>{UI_STRINGS.dashboard.createNodeModal.description}</label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={UI_STRINGS.dashboard.createNodeModal.describeTheNode}
        />
        <label>{UI_STRINGS.dashboard.createNodeModal.nodeAbstract}</label>
        <textarea
          value={abstract}
          onChange={(e) => setAbstract(e.target.value)}
          placeholder={UI_STRINGS.dashboard.createNodeModal.abstractOrSummary}
        />

        <div
          style={{
            marginTop: 12,
            borderTop: "1px solid var(--kk-border)",
            paddingTop: 12,
          }}
        >
          <h3 style={{ margin: "0 0 8px 0" }}>
            {UI_STRINGS.dashboard.createNodeModal.implementation}
          </h3>

          <label>{UI_STRINGS.dashboard.createNodeModal.program}</label>
          <select value={program} onChange={(e) => setProgram(e.target.value)}>
            <option value="MainProgram">MainProgram</option>
            <option value="AuxProgram1">AuxProgram1</option>
            {/* puedes agregar más simulados si quieres */}
          </select>

          <label>{UI_STRINGS.dashboard.createNodeModal.routine}</label>
          <select value={routine} onChange={(e) => setRoutine(e.target.value)}>
            <option value="SFC_Control_Routine">SFC_Control_Routine</option>
            <option value="Aux_SFC_Routine">Aux_SFC_Routine</option>
          </select>
        </div>

        <div
          style={{
            marginTop: 12,
            borderTop: "1px solid var(--kk-border)",
            paddingTop: 12,
          }}
        >
          <h3 style={{ margin: "0 0 8px 0" }}>
            {UI_STRINGS.dashboard.createNodeModal.customParameters}
          </h3>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 8,
            }}
          >
            <button
              onClick={addParam}
              style={{
                background: "var(--kk-brand-mint)",
                color: "var(--kk-on-brand)",
                border: "none",
                borderRadius: 6,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              {UI_STRINGS.dashboard.createNodeModal.addParameter}
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--kk-raised)", textAlign: "left" }}>
                <th style={{ padding: 6 }}>
                  {UI_STRINGS.dashboard.createNodeModal.name}
                </th>
                <th style={{ padding: 6 }}>
                  {UI_STRINGS.dashboard.createNodeModal.dataType}
                </th>
                <th style={{ padding: 6 }}>
                  {UI_STRINGS.dashboard.createNodeModal.defaultValue}
                </th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {params.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{ padding: 8, color: "var(--kk-ink-muted)" }}
                  >
                    {
                      UI_STRINGS.dashboard.createNodeModal
                        .noParametersUseAddParameter
                    }
                  </td>
                </tr>
              )}
              {params.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: 4 }}>
                    <input
                      value={p.name}
                      onChange={(e) =>
                        updateParam(p.id, "name", e.target.value)
                      }
                      placeholder={UI_STRINGS.dashboard.createNodeModal.name}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={{ padding: 4 }}>
                    <select
                      value={p.dataType}
                      onChange={(e) =>
                        updateParam(p.id, "dataType", e.target.value)
                      }
                      style={{ width: "100%" }}
                    >
                      <option value="REAL">REAL</option>
                      <option value="INT">INT</option>
                      <option value="BOOL">BOOL</option>
                      <option value="STRING">STRING</option>
                    </select>
                  </td>
                  <td style={{ padding: 4 }}>
                    {p.dataType === "BOOL" ? (
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={parseBool(p.defaultValue)}
                          onChange={(e) =>
                            updateParam(p.id, "defaultValue", e.target.checked)
                          }
                        />
                        <span>{String(Boolean(p.defaultValue))}</span>
                      </label>
                    ) : p.dataType === "INT" ? (
                      <input
                        type="number"
                        step="1"
                        value={p.defaultValue}
                        onChange={(e) =>
                          updateParam(p.id, "defaultValue", e.target.value)
                        }
                        placeholder={
                          UI_STRINGS.dashboard.createNodeModal.intPlaceholder
                        }
                        style={{ width: "100%" }}
                      />
                    ) : p.dataType === "REAL" ? (
                      <input
                        type="number"
                        step="any"
                        value={p.defaultValue}
                        onChange={(e) =>
                          updateParam(p.id, "defaultValue", e.target.value)
                        }
                        placeholder={
                          UI_STRINGS.dashboard.createNodeModal.realPlaceholder
                        }
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={p.defaultValue}
                        onChange={(e) =>
                          updateParam(p.id, "defaultValue", e.target.value)
                        }
                        placeholder={
                          UI_STRINGS.dashboard.createNodeModal
                            .defaultValuePlaceholder
                        }
                        style={{ width: "100%" }}
                      />
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      title={UI_STRINGS.dashboard.createNodeModal.delete}
                      onClick={() => removeParam(p.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--kk-status-changes-fg)",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      ✖
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && (
          <div
            style={{
              color: "var(--kk-status-changes-fg)",
              marginBottom: 10,
              fontWeight: "bold",
            }}
          >
            {error}
          </div>
        )}
        <div className="create-node-modal-buttons">
          <button onClick={onClose}>
            {UI_STRINGS.dashboard.createNodeModal.cancel}
          </button>
          <button onClick={handleOk}>
            {UI_STRINGS.dashboard.createNodeModal.ok}
          </button>
        </div>
      </div>
    </div>
  );
}

// Menú contextual
function ContextMenu({ x, y, visible, onNew }) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: y,
        left: x,
        background: "var(--kk-surface)",
        border: "1px solid var(--kk-border)",
        boxShadow: "var(--kk-shadow-node)",
        zIndex: 999,
        borderRadius: 4,
      }}
    >
      <div
        style={{ padding: "8px 18px", cursor: "pointer", fontWeight: "bold" }}
        onClick={onNew}
      >
        {UI_STRINGS.dashboard.contextMenu.new}
      </div>
    </div>
  );
}

// Listas maestras de Procedure Phase y Operations
const PROCEDURE_PHASES = ["Mixing", "Drying", "Inspection"];

const OPERATIONS_BY_PHASE = {
  Mixing: ["Add Ingredient", "Set Temperature", "Measure Flow"],
  Drying: ["Start Drying", "Stop Drying"],
  Inspection: ["Visual Check", "Measure Flow"],
};

// Wizard guiado: Phase -> Operation
function PredefinedNodeWizard({ open, onClose, onCreate }) {
  const [phase, setPhase] = React.useState("");
  const [operation, setOperation] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setPhase("");
      setOperation("");
    }
  }, [open]);

  if (!open) return null;

  const operationsForPhase = phase ? OPERATIONS_BY_PHASE[phase] || [] : [];
  const canCreate = phase && operation;

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate({ procedurePhase: phase, operation });
  };

  return (
    <div className="create-node-modal-backdrop">
      <div className="create-node-modal">
        <h3>
          {
            UI_STRINGS.dashboard.predefinedNodeWizard
              .newPreDefinedNodeDefinition
          }
        </h3>

        <div style={{ marginBottom: 16 }}>
          <h4>{UI_STRINGS.dashboard.predefinedNodeWizard.n1ProcedurePhase}</h4>
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            <option value="">
              {UI_STRINGS.dashboard.predefinedNodeWizard.selectAPhase}
            </option>
            {PROCEDURE_PHASES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <h4>{UI_STRINGS.dashboard.predefinedNodeWizard.n2Operation}</h4>
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
            disabled={!phase} // 🔒 no se puede elegir antes de Phase
          >
            <option value="">
              {phase
                ? UI_STRINGS.dashboard.predefinedNodeWizard.selectAnOperation
                : UI_STRINGS.dashboard.predefinedNodeWizard.selectAPhaseFirst}
            </option>
            {operationsForPhase.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </div>

        <div className="create-node-modal-buttons">
          <button onClick={onClose}>
            {UI_STRINGS.dashboard.predefinedNodeWizard.cancel}
          </button>
          <button onClick={handleCreate} disabled={!canCreate}>
            {UI_STRINGS.dashboard.predefinedNodeWizard.create}
          </button>
        </div>
      </div>
    </div>
  );
}

// Componente TreeNode modificado
function TreeNode({
  label,
  hasChildren,
  children,
  parentRefs,
  index,
  resetOpen,
  forceOpen,
  level = 0,
  isLastChild = false,
  onContextMenu,
  desc,
  abstract,
  color,
  usedComponents = [],
  onClick,
  isDraggable,
  setDragComponent,
  isDesigner,
  node,
  expandedNodes,
  setExpandedNodes,
  setInteractionMode, // ✅ agregado
}) {
  const open = expandedNodes?.[label] || false;
  const nodeRef = useRef(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (resetOpen) {
      setExpandedNodes((prev) => ({
        ...prev,
        [label]: false,
      }));
    }
  }, [resetOpen, label, setExpandedNodes]);

  useEffect(() => {
    if (forceOpen) {
      setExpandedNodes((prev) => ({
        ...prev,
        [label]: true,
      }));
    }
  }, [forceOpen, label, setExpandedNodes]);

  useEffect(() => {
    if (parentRefs) parentRefs.current[index] = nodeRef;
  }, [parentRefs, index]);

  const findNextNode = () => {
    const all = Array.from(document.querySelectorAll(".tree-label"));
    const i = all.findIndex((el) => el === nodeRef.current);
    return i !== -1 && i < all.length - 1 ? all[i + 1] : null;
  };

  const findPrevNode = () => {
    const all = Array.from(document.querySelectorAll(".tree-label"));
    const i = all.findIndex((el) => el === nodeRef.current);
    return i > 0 ? all[i - 1] : null;
  };

  // ✅ ARREGLADO COMPLETO
  const handleKeyDown = (e) => {
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
    }

    if (e.key === "Enter") {
      if (children) {
        setExpandedNodes((prev) => ({
          ...prev,
          [label]: !prev[label],
        }));
      }
    }

    // ↓ bajar
    if (e.key === "ArrowDown") {
      const next = findNextNode();
      if (next) next.focus();
    }

    // ↑ subir
    if (e.key === "ArrowUp") {
      const prev = findPrevNode();
      if (prev) prev.focus();
    }

    // → abrir nodo
    if (e.key === "ArrowRight") {
      if (children && !open) {
        setExpandedNodes((prev) => ({
          ...prev,
          [label]: true,
        }));
      }
    }

    // ← cerrar nodo
    if (e.key === "ArrowLeft") {
      if (children && open) {
        setExpandedNodes((prev) => ({
          ...prev,
          [label]: false,
        }));
      }
    }
  };

  // Determina si este nodo está usado
  const isUsed = usedComponents.includes(label);

  return (
    <div
      className={`tree-node ${isLastChild ? "last-child" : ""}`}
      style={{ position: "relative" }}
    >
      <div
        className="tree-label"
        tabIndex={0}
        ref={nodeRef}
        style={{
          cursor: isDraggable ? "grab" : children ? "pointer" : "default",
          fontWeight: isUsed ? "bold" : children ? "bold" : "normal",
          background: isUsed ? "var(--kk-status-review-bg)" : "inherit",
          color: color || (isUsed ? "var(--kk-status-review-fg)" : "inherit"),
          borderRadius: "4px",
          padding: "2px 4px",
        }}
        draggable={(isDraggable || (!children && isDesigner)) && isDesigner}
        onDragStart={(e) => {
          if ((isDraggable || (!children && isDesigner)) && isDesigner) {
            const payload = { label, desc, abstract, color };
            if (node?.details) payload.details = node.details;
            if (node?.type) payload.type = node.type;
            e.dataTransfer.setData("application/json", JSON.stringify(payload));
            setDragComponent?.(payload);
          }
        }}
        onClick={() => {
          if (label === "User Created Definitions") return;
          if (children && children.length > 0) {
            setExpandedNodes((prev) => ({ ...prev, [label]: !prev[label] }));
          } else if (onClick) {
            onClick();
          }
        }}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (label === "User Created Definitions") {
            setInteractionMode?.("place-start-object");
            return;
          }
          if (onContextMenu) {
            onContextMenu(e, node);
          }
        }}
        onMouseEnter={(e) => {
          if (desc || abstract) {
            setShowTooltip(true);
            setTooltipPos({ x: e.clientX + 10, y: e.clientY + 10 });
          }
        }}
        onMouseMove={(e) => {
          if (showTooltip) {
            setTooltipPos({ x: e.clientX + 10, y: e.clientY + 10 });
          }
        }}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {hasChildren && (open ? "- " : "+ ")} {label}
      </div>

      {showTooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltipPos.x,
            top: tooltipPos.y,
            background: "var(--kk-surface)",
            border: "1px solid var(--kk-border-strong)",
            padding: 8,
            zIndex: 9999,
          }}
        >
          <div>
            <strong>{UI_STRINGS.dashboard.treeNode.description}</strong> {desc}
          </div>
          <div>
            <strong>{UI_STRINGS.dashboard.treeNode.abstract}</strong> {abstract}
          </div>
        </div>
      )}

      {open && children && (
        <div className="tree-children">
          {React.Children.map(children, (child) =>
            React.cloneElement(child, {
              level: level + 1,
              parentRefs,
              resetOpen,
              onContextMenu,
              usedComponents,
              setDragComponent,
              isDesigner,
              expandedNodes,
              setExpandedNodes,
              setInteractionMode,
            }),
          )}
        </div>
      )}
    </div>
  );
}

const PREDEFINED_PROCEDURE_LABELS = [
  "Procedure Phase",
  "Procedure Operation",
  "Procedure Unit Procedure",
  "Procedure",
  "Area Procedure",
  "Site Procedure",
];

function TreeViewExample({
  usedComponents = [],
  setDragComponent,
  onEquipmentSelect,
  isDesigner,
  setInteractionMode,
}) {
  const [expandedNodes, setExpandedNodes] = useState({});
  const [filterType, setFilterType] = useState("all");
  const treeRefs = useRef([]);
  const treeContainerRef = useRef(null);
  const [search, setSearch] = useState("");
  const [resetOpen, setResetOpen] = useState(0);
  const [selectedTreeNode, setSelectedTreeNode] = useState(null);

  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    target: null,
  });

  const [preDefinedNodes, setPreDefinedNodes] = useState([]);
  const [predefWizardOpen, setPredefWizardOpen] = useState(false);

  const [forceOpenNodeDefs] = useState(true);

  const [paramModal, setParamModal] = useState({
    open: false,
    param: null,
    nodeLabel: "",
  });

  const openParamDetails = (param, nodeLabel) =>
    setParamModal({ open: true, param, nodeLabel });

  const closeParamDetails = () =>
    setParamModal({ open: false, param: null, nodeLabel: "" });

  useEffect(() => {
    if (search === "") setResetOpen((prev) => prev + 1);
  }, [search]);

  useEffect(() => {
    const closeMenu = () => setContextMenu((c) => ({ ...c, visible: false }));
    if (contextMenu.visible) {
      window.addEventListener("click", closeMenu);
      window.addEventListener("contextmenu", closeMenu);
    }
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("contextmenu", closeMenu);
    };
  }, [contextMenu.visible]);

  // === DRAG ===
  const handleDragStart = (e, node) => {
    const dragData = {
      label: node.label,
      desc: node.desc,
      abstract: node.abstract,
      color: node.color,
      details: node.details,
      implementation: node.implementation || null,
      procedurePhase: node.procedurePhase || null,
      operation: node.operation || null,
    };
    // Elementos de Pre-Defined Definitions: se pueden soltar dentro de una definición de usuario.
    if (node.predefinedKey) {
      dragData.kind = "predefined";
      dragData.predefinedKey = node.predefinedKey;
      dragData.type = node.label;
    }

    e.dataTransfer.setData("application/json", JSON.stringify(dragData));
    // El lienzo lee window._dragComponent al soltar.
    setDragComponent?.(dragData);
  };

  let idx = 0;

  // =========================
  //  RENDER TREE
  // =========================
  const renderTree = (node, level = 0) => {
    if (!node) return null;

    const { label, children, forceOpen } = node;
    const currentIdx = idx++;

    const isEquipment = !!node.details;
    const isLeafNode = !children || children.length === 0;
    const isUserCreated = label === "User Created Definitions";

    let actualChildren = Array.isArray(children) ? children : [];

    // Los nodos se pueden expandir/colapsar aunque haya un filtro activo (HTE-55)
    const isOpen = forceOpen || expandedNodes[label] || false;

    if (filterType !== "all" && level === 0) {
      if (filterType === "workflows" && label !== "Workflows") return null;
      if (filterType === "equipment" && label !== "Nodes") return null;
      if (filterType === "materials" && label !== "Materials") return null;
    }

    if (isUserCreated) {
      return (
        <UserDefinitionsTree
          key={label}
          label={label}
          level={level}
          isOpen={isOpen}
          onToggle={() =>
            setExpandedNodes((prev) => ({ ...prev, [label]: !prev[label] }))
          }
          isDesigner={isDesigner}
          search={search}
          setDragComponent={setDragComponent}
          openParamDetails={openParamDetails}
          renderCreateModal={(props) => <CreateNodeModal {...props} />}
        />
      );
    }

    if (label === "Pre-Defined Definitions" && children) {
      actualChildren = [
        ...children
          .filter((child) => child && child.label)
          .map((child) => ({
            ...child,
            color: "var(--kk-cyan-text)",
            predefinedKey: predefinedKeyFor(child),
          })),
        // Nodos creados con el PredefinedNodeWizard
        ...preDefinedNodes.map((n) => ({
          label: `${n.procedurePhase} - ${n.operation}`,
          color: "var(--kk-cyan-text)",
          isDraggable: true,
          procedurePhase: n.procedurePhase,
          operation: n.operation,
          predefinedKey: predefinedKeyFor(n),
        })),
      ];
    }

    const childCount = actualChildren.length;
    const displayLabel = childCount > 0 ? `${label} (${childCount})` : label;
    const hasChildren =
      Array.isArray(actualChildren) && actualChildren.length > 0;

    return (
      <>
        <div
          className="tree-node"
          onClick={
            isEquipment && onEquipmentSelect
              ? () => onEquipmentSelect(node)
              : undefined
          }
          onContextMenu={
            PREDEFINED_PROCEDURE_LABELS.includes(label)
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    visible: true,
                    x: e.clientX,
                    y: e.clientY,
                    target: "preDefined",
                  });
                }
              : undefined
          }
          draggable={isLeafNode || node.isDraggable}
          onDragStart={(e) => {
            // Antes solo arrastraban las hojas; una fila marcada isDraggable también arrastra.
            if (isLeafNode || node.isDraggable) handleDragStart(e, node);
          }}
          onDragEnd={() => setDragComponent?.(null)}
          style={{
            marginLeft: level * 10,
            cursor: "pointer",
            color: node.color || "var(--kk-ink)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {hasChildren && (
              <span
                style={{ marginRight: 4, cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedNodes((prev) => ({
                    ...prev,
                    [label]: !prev[label],
                  }));
                }}
              >
                {isOpen ? "- " : "+ "}
              </span>
            )}
            <div
              className="tree-label"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTreeNode(label);
                if (hasChildren) {
                  setExpandedNodes((prev) => ({
                    ...prev,
                    [label]: !prev[label],
                  }));
                }
              }}
              onMouseEnter={(e) => {
                if (node.desc || node.abstract || node.details) {
                  const tooltip = document.createElement("div");
                  tooltip.id = "tree-tooltip";
                  tooltip.style.cssText = `position:fixed;left:${e.clientX + 12}px;top:${e.clientY + 12}px;background:var(--kk-surface);color:var(--kk-ink);border:1px solid var(--kk-border-strong);box-shadow:var(--kk-shadow-overlay);padding:8px 12px;z-index:9999;font-size:13px;max-width:280px;border-radius:4px;pointer-events:none;`;
                  tooltip.innerHTML = `
                    ${node.desc ? `<div><strong>Description:</strong> ${node.desc}</div>` : ""}
                    ${node.abstract ? `<div><strong>Abstract:</strong> ${node.abstract}</div>` : ""}
                    ${node.details?.capacity ? `<div><strong>Capacity:</strong> ${node.details.capacity}</div>` : ""}
                    ${node.details?.status ? `<div><strong>Status:</strong> ${node.details.status}</div>` : ""}
                    ${node.details?.manufacturerModel ? `<div><strong>Model:</strong> ${node.details.manufacturerModel}</div>` : ""}
                    ${node.details?.tagPath ? `<div><strong>Tag Path:</strong> ${node.details.tagPath}</div>` : ""}
                  `;
                  document.body.appendChild(tooltip);
                }
              }}
              onMouseMove={(e) => {
                const tooltip = document.getElementById("tree-tooltip");
                if (tooltip) {
                  tooltip.style.left = `${e.clientX + 12}px`;
                  tooltip.style.top = `${e.clientY + 12}px`;
                }
              }}
              onMouseLeave={() => {
                const tooltip = document.getElementById("tree-tooltip");
                if (tooltip) tooltip.remove();
              }}
              style={{
                cursor: hasChildren ? "pointer" : "default",
                background:
                  selectedTreeNode === label
                    ? "var(--kk-cyan-soft)"
                    : "inherit",
                color:
                  selectedTreeNode === label
                    ? "var(--kk-cyan-text)"
                    : "inherit",
                borderRadius: "4px",
                padding: "2px 4px",
              }}
            >
              {displayLabel}
            </div>
          </div>
          {isOpen &&
            Array.isArray(actualChildren) &&
            actualChildren.map((child, i) => renderTree(child, level + 1))}
        </div>
      </>
    );
  };

  // =========================
  //  NODOS PRINCIPALES
  // =========================
  const preDefinedNode = {
    label: "Pre-Defined Definitions",
    children: PREDEFINED_PROCEDURE_LABELS.map((label) => ({ label })),
  };

  const workflowsNode = {
    label: "Workflows",
    children: [
      {
        label: "Node Definitions",
        forceOpen: false,
        children: [{ label: "User Created Definitions" }, preDefinedNode],
      },
      { label: "Nodes" },
    ],
  };

  const equipmentNode = {
    label: new EquipmentNode().label,
    children: new EquipmentNode().children,
  };

  const assetsNode = {
    label: "Assets",
    children: [{ label: "Assets Definitions" }, { label: "Assets Instances" }],
  };

  const dataLayerNode = {
    label: "Data Layer",
    children: [
      {
        label: "Devices",
        children: [
          {
            label: "Sensor de Temperatura",
            isDraggable: true,
            details: { tagPath: "/Linea1/Temp" },
          },
          {
            label: "Sensor de Presión",
            isDraggable: true,
            details: { tagPath: "/Linea1/Presion" },
          },
        ],
      },
    ],
  };

  const workInstructionsNode = {
    label: "Work Instructions",
    children: [
      { label: "Work Instruction Definitions" },
      { label: "Work Instruction Instances" },
    ],
  };

  const materialsNode = new MaterialsNode();

  const schedulerNode = {
    label: "Scheduler",
    children: [
      { label: "Scheduled Tasks" },
      { label: "Calendar" },
      { label: "Timeline" },
    ],
  };

  // =========================
  //  FILTRO (búsqueda)
  // =========================
  const filterTree = (node) => {
    if (!node) return null;
    if (!search) return node;
    if (node.label === "User Created Definitions") return node;
    const labelMatch = node.label.toLowerCase().includes(search.toLowerCase());
    const children = (node.children || []).map(filterTree).filter(Boolean);
    if (labelMatch) return { ...node, forceOpen: true };
    if (children.length) return { ...node, children, forceOpen: true };
    return null;
  };

  idx = 0;

  // RETURN
  return (
    <div ref={treeContainerRef} className="tree-container">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={UI_STRINGS.dashboard.treeView.search}
      />

      <div style={{ marginBottom: "10px" }}>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">{UI_STRINGS.dashboard.treeView.all}</option>
          <option value="workflows">
            {UI_STRINGS.dashboard.treeView.workflows}
          </option>
          <option value="equipment">
            {UI_STRINGS.dashboard.treeView.equipment}
          </option>
          <option value="materials">
            {UI_STRINGS.dashboard.treeView.materials}
          </option>
        </select>
      </div>

      {renderTree(filterTree(workflowsNode))}
      {renderTree(filterTree(equipmentNode))}
      {renderTree(filterTree(assetsNode))}
      {renderTree(filterTree(dataLayerNode))}
      {renderTree(filterTree(workInstructionsNode))}
      {renderTree(filterTree(materialsNode))}
      {renderTree(filterTree(schedulerNode))}

      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        visible={contextMenu.visible}
        onNew={() => {
          if (!isDesigner) return;

          setPredefWizardOpen(true);

          setContextMenu((c) => ({ ...c, visible: false }));
        }}
      />

      <PredefinedNodeWizard
        open={predefWizardOpen}
        onClose={() => setPredefWizardOpen(false)}
        onCreate={(data) => {
          setPreDefinedNodes((prev) => [...prev, data]);
          setPredefWizardOpen(false);
        }}
      />

      {paramModal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--kk-scrim)",
            zIndex: 10000,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 420,
              background: "var(--kk-surface)",
              borderRadius: 10,
              boxShadow: "var(--kk-shadow-overlay)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: "1px solid var(--kk-border)",
              }}
            >
              <h3 style={{ margin: 0 }}>
                {UI_STRINGS.dashboard.treeView.parameterProperties}
              </h3>
              <button
                onClick={closeParamDetails}
                style={{
                  fontSize: 22,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: 16 }}>
              <p>
                <strong>{UI_STRINGS.dashboard.treeView.node}</strong>{" "}
                {paramModal?.nodeLabel ||
                  UI_STRINGS.dashboard.treeView.notAvailable}
              </p>
              <p>
                <strong>{UI_STRINGS.dashboard.treeView.name}</strong>{" "}
                {paramModal?.param?.name ||
                  UI_STRINGS.dashboard.treeView.notAvailable}
              </p>
              <p>
                <strong>{UI_STRINGS.dashboard.treeView.dataType}</strong>{" "}
                {paramModal?.param?.dataType ||
                  UI_STRINGS.dashboard.treeView.notAvailable}
              </p>
              <p>
                <strong>{UI_STRINGS.dashboard.treeView.defaultValue}</strong>{" "}
                {paramModal?.param?.defaultValue !== undefined
                  ? String(paramModal.param.defaultValue)
                  : UI_STRINGS.dashboard.treeView.notAvailable}
              </p>
            </div>
            <div style={{ padding: 10, textAlign: "right" }}>
              <button onClick={closeParamDetails}>
                {UI_STRINGS.dashboard.treeView.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

//  MENU BAR

const menuOptions = {
  TMApp: ["Home", "Settings", "Profile"],
  File: ["New", "Open", "Save", "Save As", "Exit"],
  Edit: ["Undo", "Redo", "Cut", "Copy", "Paste"],
  View: [
    "Zoom In",
    "Zoom Out",
    "Full Screen",
    "Light Theme",
    "Dark Theme",
    "System Theme",
  ],
  Help: ["Documentation", "About", "Contact"],
};

// Opciones del menú View que cambian el tema (HTE-111) → modo de ThemeContext.
const THEME_OPTIONS = {
  "Light Theme": "light",
  "Dark Theme": "dark",
  "System Theme": "system",
};

export function MenuBar({
  user,
  workflow,
  onNewWorkflow,
  onSaveWorkflow,
  onOpenWorkflow,
  onSaveAsWorkflow,
  onCheckout,
  onVersionHistory,
  OnLogout,
  isDesigner,
  isSessionReadOnly,
  onShare,
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { mode, setMode } = useTheme();

  const handleOptionClick = (menu, option) => {
    setOpenMenu(null);

    if ((option === "Save" || option === "Save As") && !isDesigner) {
      alert(UI_STRINGS.dashboard.menuBar.alerts.accionNoPermitida);
      return;
    }

    if (menu === "File" && option === "New") return onNewWorkflow?.();
    if (menu === "File" && option === "Save") return onSaveWorkflow?.();
    if (menu === "File" && option === "Save As") return onSaveAsWorkflow?.();
    if (menu === "File" && option === "Open") return onOpenWorkflow?.();
    if (menu === "File" && option === "Checkout") return onCheckout?.();
    if (menu === "File" && option === "Version History")
      return onVersionHistory?.();
    if (menu === "TMApp" && option === "Home") return navigate("/");
    if (menu === "View" && THEME_OPTIONS[option]) {
      return setMode(THEME_OPTIONS[option]);
    }

    alert(UI_STRINGS.dashboard.menuBar.alerts.seleccionaste(menu, option));
  };

  const isReviewer = workflow?.metadata?.assignedReviewerId === user?.uid;
  const isPendingReview = workflow?.metadata?.status === "pending_review";

  const canShare = isDesigner;
  const canReview = isReviewer && isPendingReview;

  const fileOptions = [...menuOptions.File];
  if (workflow) fileOptions.push("Version History");
  if (workflow && isDesigner && isSessionReadOnly) fileOptions.push("Checkout");

  return (
    <nav className="menu-bar" ref={menuRef}>
      <Logo size="sm" to="/" />

      {Object.keys(menuOptions).map((menu) => {
        const options = menu === "File" ? fileOptions : menuOptions[menu];

        return (
          <div key={menu} className="menu-item">
            <button
              className="menu-btn"
              onClick={() => setOpenMenu(openMenu === menu ? null : menu)}
            >
              {UI_STRINGS.dashboard.menuBar.menuLabels[menu] ?? menu}
            </button>

            {openMenu === menu && (
              <div className="dropdown" onMouseLeave={() => setOpenMenu(null)}>
                {options.map((option) => {
                  const isActive =
                    menu === "View" && THEME_OPTIONS[option] === mode;
                  return (
                    <div
                      key={option}
                      className="dropdown-option"
                      role={
                        THEME_OPTIONS[option] ? "menuitemradio" : "menuitem"
                      }
                      aria-checked={
                        THEME_OPTIONS[option] ? isActive : undefined
                      }
                      // Opciones alcanzables con Tab y activables con Enter/Espacio (teclado).
                      tabIndex={0}
                      onClick={() => handleOptionClick(menu, option)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleOptionClick(menu, option);
                        }
                      }}
                    >
                      {isActive && (
                        <>
                          <span aria-hidden="true">
                            {UI_STRINGS.dashboard.menuBar.activeMark}
                          </span>
                          <span className="visually-hidden">
                            {UI_STRINGS.dashboard.menuBar.activeOption}
                          </span>
                        </>
                      )}
                      {UI_STRINGS.dashboard.menuBar.menuLabels[option] ??
                        option}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="center-section">
        <h2>{workflow?.name || UI_STRINGS.dashboard.menuBar.newWorkflow}</h2>
        {canShare && (
          <button onClick={onShare}>
            {UI_STRINGS.dashboard.menuBar.workflowActions}
          </button>
        )}
        {canReview && (
          <button>{UI_STRINGS.dashboard.menuBar.reviewWorkflow}</button>
        )}
      </div>

      <div>
        <span>{user?.email}</span>
        <button onClick={OnLogout}>
          {UI_STRINGS.dashboard.menuBar.logout}
        </button>
      </div>
    </nav>
  );
} // ← FIN MenuBar

// =============================
//  HELPERS
// =============================

// Valor por defecto de un parámetro BOOL → booleano. Acepta el string "true"/"false" de datos viejos.
export const parseBool = (value) =>
  value === true || String(value).trim().toLowerCase() === "true";

function getDefaultWorkflowNodes() {
  const baseX = 140;
  const startY = 100;
  const vSpacing = 120;
  return [
    { label: "Begin", x: baseX, y: startY, type: "start", id: "begin" },
    {
      label: "Connection 1",
      x: baseX,
      y: startY + vSpacing,
      type: "connection",
      id: "connection1",
    },
    {
      label: "End",
      x: baseX,
      y: startY + vSpacing * 2,
      type: "end",
      id: "end",
    },
  ];
}

function buildCompileWorkflowFromCanvas(nodes, connections) {
  const ordered = [...nodes].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  const idMap = makeCompactIds(ordered);

  const nodeWithImpl = ordered.find(
    (n) =>
      n.implementation &&
      (n.implementation.program || n.implementation.routine),
  );

  const programName = nodeWithImpl?.implementation?.program || "MainProgram";
  const routineName =
    nodeWithImpl?.implementation?.routine || "SFC_Control_Routine";

  const xmlNodes = ordered.map((node) => ({
    id: idMap.get(node.id),
    name: node.label || node.type || "Node",
    type: node.type,
    family: classifyType(node),
    parameters: node.parameters || null,
    x: node.x ?? 0,
    y: node.y ?? 0,
    implementation: node.implementation || null,
  }));

  const xmlConnections = (connections || []).map((c) => ({
    from: idMap.get(c.from),
    to: idMap.get(c.to),
  }));

  return {
    id: `W-${Date.now()}`,
    name: "Flujo desde Canvas",
    version: "1.0",
    program: programName,
    routine: routineName,
    nodes: xmlNodes,
    connections: xmlConnections,
  };
}

function mapCanvasNodeToWorkflowNode(node) {
  if (!["start", "connection", "end"].includes(node.type)) {
    const safe = (node.label || node.type || "Node").replace(/\s+/g, "");
    return {
      id: node.id,
      type: node.type,
      params: {
        tagPath: `[default]Linea1/${safe}`,
        value: true,
      },
    };
  }
  return { id: node.id, type: node.type, params: {} };
}

function inferConnectionsLinear(nodes) {
  const sorted = [...nodes].sort((a, b) => a.y - b.y);
  const conns = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    conns.push({ from: sorted[i].id, to: sorted[i + 1].id });
  }
  return conns;
}

function buildWorkflowFromCanvas(nodes) {
  const ordered = [...nodes].sort((a, b) => a.y - b.y);
  const wfNodes = ordered.map(mapCanvasNodeToWorkflowNode);
  const connections = inferConnectionsLinear(ordered);

  return {
    workflowId: `wf-${Date.now()}`,
    name: "Flujo desde Canvas (sim)",
    nodes: wfNodes,
    connections,
  };
}

function validateWorkflow(nodes, connections) {
  const errors = [];

  if (!nodes.length) {
    errors.push(UI_STRINGS.dashboard.validation.emptyWorkflow);
    return errors;
  }

  const startNodes = nodes.filter((n) => n.type === "start");
  if (startNodes.length === 0)
    errors.push(UI_STRINGS.dashboard.validation.missingStart);
  if (startNodes.length > 1)
    errors.push(UI_STRINGS.dashboard.validation.multipleStart);

  const endNodes = nodes.filter((n) => n.type === "end");
  if (endNodes.length === 0)
    errors.push(UI_STRINGS.dashboard.validation.missingEnd);

  const map = {};
  nodes.forEach((n) => (map[n.id] = []));

  connections.forEach((c) => {
    if (map[c.from]) map[c.from].push(c.to);
  });

  nodes.forEach((n) => {
    const hasOut = map[n.id]?.length > 0;
    const hasIn = connections.some((c) => c.to === n.id);

    if (!hasOut && !hasIn) {
      errors.push(
        UI_STRINGS.dashboard.validation.disconnectedNode(n.label || n.id),
      );
    }
  });

  if (startNodes.length === 1) {
    const visited = new Set();

    const dfs = (id) => {
      if (visited.has(id)) return;
      visited.add(id);
      (map[id] || []).forEach(dfs);
    };

    dfs(startNodes[0].id);

    nodes.forEach((n) => {
      if (!visited.has(n.id)) {
        errors.push(
          UI_STRINGS.dashboard.validation.unreachableNode(n.label || n.id),
        );
      }
    });
  }

  return errors;
}

export default function App({ user, userRoles }) {
  // Estado de si la sesión es de solo lectura
  const [isSessionReadOnly, setIsSessionReadOnly] = useState(false);

  // Estado de los botones de la tool bar (parallel/branch currently not implemented)
  const [isParametersModalOpen, setParametersModalOpen] = useState(false);

  const [selectedEquipment, setSelectedEquipment] = useState(null);

  const [isKeyboardNavigation] = useState(false);
  // Levantamos la selección para que la toolbar pueda reaccionar
  const [selectedNodes, setSelectedNodes] = useState([]);

  const [selectedNode, setSelectedNode] = useState(null);

  const handleEquipmentSelect = (equipment) => {
    setSelectedEquipment(equipment);
  };

  // Abrir el modal de parámetros para un nodo recién agregado al canvas
  const handleOpenParamsForNewNode = (idx, node) => {
    if (idx == null || !node) return;

    // seleccionar ese nodo en el canvas (solo si NO es navegación con teclado)
    if (!isKeyboardNavigation) {
      setSelectedNodes([idx]);
    }

    // pasarle al modal los datos del nodo
    setSelectedEquipment(node);

    // abrir el modal
    setParametersModalOpen(true);
  };

  const [interactionMode, setInteractionMode] = useState("select");

  const [compileDialog, setCompileDialog] = React.useState({
    open: false,
    url: null,
    filename: null,
    message: "",
  });

  const [usedComponents, setUsedComponents] = useState([]);

  const [canvasNodes, setCanvasNodes] = useState(getDefaultWorkflowNodes());

  const [manualConnections, setManualConnections] = useState([]); //ESTE ES EL FIX

  const [isSaveModalOpen, setSaveModalOpen] = useState(false);

  const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);

  const [isVersionHistoryModalOpen, setVersionHistoryModalOpen] =
    useState(false);

  const [isLoadModalOpen, setLoadModalOpen] = useState(false);

  const [savedWorkflows, setSavedWorkflows] = useState([]);

  const [currentWorkflowId, setCurrentWorkflowId] = useState(null);

  const [currentWorkflow, setCurrentWorkflow] = useState(null);

  const [isShareModalOpen, setShareModalOpen] = useState(false);

  const [potentialReviewers, setPotentialReviewers] = useState([]);

  const [allUsers, setAllUsers] = useState([]);

  const [isDirty, setIsDirty] = useState(false);

  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  const inactivityTimer = useRef(null);

  const isDirtyRef = useRef(isDirty);

  const [isSaving, setIsSaving] = useState(false);

  const [isGridEnabled, setIsGridEnabled] = useState(false);

  const toggleGrid = () => setIsGridEnabled((s) => !s);

  const topRightRef = useRef(null);

  const isDeployer = userRoles?.deployer === true;

  const toolbarRef = useRef(null);

  const contentRowRef = useRef(null);

  const [contentMarginTop, setContentMarginTop] = useState(null);

  const [toolbarLeftPx, setToolbarLeftPx] = useState(null);
  const [toolbarTopPx, setToolbarTopPx] = useState(null);

  const navigate = useNavigate();

  const isDesigner = userRoles?.designer === true;

  // Define los estados que SÍ permiten la edición
  const allowedStatuses = ["draft", "changes_requested"];

  // El workflow está bloqueado si tiene un estado que NO está en la lista de permitidos
  const isWorkflowReadOnly =
    currentWorkflow &&
    currentWorkflow.metadata &&
    !allowedStatuses.includes(currentWorkflow.metadata.status);

  // La UI de parámetros será de solo lectura si el usuario NO es designer O si el workflow está bloqueado
  const isParametersReadOnly =
    !isDesigner || isWorkflowReadOnly || isSessionReadOnly;

  useEffect(() => {
    // Detector de expiración de la sesión de Supabase
    const unsubscribe = onSessionChange((user) => {
      if (!user) {
        console.log("Sesión de Supabase expirada o cerrada");
        handleLogoutRequest();
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const performLogout = () => {
    signOut().then(() => navigate("/login"));
  };

  const handleLogoutRequest = () => {
    console.log("=== INACTIVIDAD O SESIÓN EXPIRADA ===");
    console.log("isDirty:", isDirtyRef.current);

    if (isDirtyRef.current) {
      console.log("Mostrando modal de cambios no guardados");
      setShowUnsavedModal(true);
    } else {
      console.log("Cerrando sesión directamente (sin cambios)");
      performLogout();
    }
  };

  // Función para reiniciar el temporizador
  const resetInactivityTimer = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(handleLogoutRequest, 15 * 60 * 1000);
  };

  // useEffect para activar los listeners de inactividad
  useEffect(() => {
    const events = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
    ];

    const listener = () => {
      resetInactivityTimer();
    };

    events.forEach((event) => window.addEventListener(event, listener));
    resetInactivityTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, listener));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, []);

  // Align toolbar left edge with the canvas container left edge (topRightRef)
  useEffect(() => {
    const compute = () => {
      try {
        const canvasEl = topRightRef.current;
        if (!canvasEl) return;
        const rect = canvasEl.getBoundingClientRect();
        const left = Math.round(rect.left + window.pageXOffset + 8);
        setToolbarLeftPx(left);

        const menuEl = document.querySelector(".menu-bar");
        const menuBottom = menuEl
          ? Math.round(
              menuEl.getBoundingClientRect().bottom + window.pageYOffset,
            )
          : Math.round(8 + window.pageYOffset);
        const top = menuBottom + 6;
        setToolbarTopPx(top);

        const SMALL_CONTENT_GAP = 8;
        setContentMarginTop(SMALL_CONTENT_GAP);
      } catch (err) {
        // ignore
      }
    };

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [topRightRef.current]);

  const PERMISSION_ERROR_MSG =
    UI_STRINGS.dashboard.page.errors.designerRoleRequired;

  useEffect(() => {
    if (!currentWorkflowId) {
      setCurrentWorkflow(null);
      return;
    }

    const unsubscribe = subscribeToWorkflow(currentWorkflowId, (workflow) => {
      if (workflow) {
        setCurrentWorkflow(workflow);
      } else {
        setCurrentWorkflow(null);
        setCurrentWorkflowId(null);
        console.error("El workflow que estabas viendo fue eliminado.");
      }
    });

    return () => unsubscribe();
  }, [currentWorkflowId]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersList = await listUsers();

        setAllUsers(usersList);

        const reviewersList = usersList.filter((user) => user.isReviewer);
        setPotentialReviewers(reviewersList);
      } catch (error) {
        console.error("Error al cargar usuarios y revisores:", error);
      }
    };

    fetchUsers();
  }, []);

  const showPermissionError = () => {
    setModalMsg(PERMISSION_ERROR_MSG);
  };

  const handleApprove = async () => {
    if (!currentWorkflow) {
      alert(UI_STRINGS.dashboard.page.alerts.noWorkflowSelected);
      return;
    }

    try {
      await approveWorkflow(currentWorkflow.id);

      alert(UI_STRINGS.dashboard.page.alerts.workflowApproved);
    } catch (error) {
      if (error.code === "unauthenticated") {
        handleLogoutRequest();
      } else {
        console.error("Error approving workflow:", error);
        alert(UI_STRINGS.dashboard.page.alerts.errorPrefix + error.message);
      }
    }
  };

  const handleOpenShareModal = () => {
    setShareModalOpen(true);
  };

  async function sendWorkflow(flow) {
    const res = await fetch("/create-flow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(flow),
    });

    const data = await res.json();
    if (!res.ok)
      throw new Error(
        data.error || UI_STRINGS.dashboard.page.errors.errorEnServidor,
      );
    return data;
  }

  async function sendCompile(workflowToCompile) {
    try {
      if (Array.isArray(workflowToCompile.connections)) {
        workflowToCompile.connections = workflowToCompile.connections.map(
          (c) => ({
            ...c,
            condition: c.condition || "TRUE",
          }),
        );
      }

      return await compileWorkflow(workflowToCompile);
    } catch (err) {
      throw new Error(
        UI_STRINGS.dashboard.page.errors.compileConnectionError +
          UI_STRINGS.dashboard.page.errors.detailPrefix +
          (err.message || err),
      );
    }
  }

  useEffect(() => {
    const fetchWorkflows = async () => {
      if (!user) return;
      try {
        const workflowsList = await listMyWorkflows("designer");
        setSavedWorkflows(
          workflowsList.filter((wf) =>
            wf.metadata.designerIds.includes(user.uid),
          ),
        );
      } catch (error) {
        console.error("Error al obtener los flujos de trabajo:", error);
      }
    };
    fetchWorkflows();
  }, [user]);

  const handleLogout = () => {
    signOut()
      .then(() => {
        navigate("/login");
      })
      .catch((error) => console.error("Error al cerrar sesión:", error));
  };

  const handleSave = () => {
    if (!isDesigner) {
      showPermissionError();
      return;
    }
    if (canvasNodes.length === 0)
      return alert(UI_STRINGS.dashboard.page.alerts.theCanvasIsEmpty);

    const allowedStatuses = ["draft", "changes_requested"];
    if (
      currentWorkflowId &&
      !allowedStatuses.includes(currentWorkflow?.metadata?.status)
    ) {
      alert(
        UI_STRINGS.dashboard.page.alerts.cannotEditAWorkflowThat(
          currentWorkflow?.metadata?.status,
        ),
      );
      return;
    }

    if (currentWorkflowId) {
      executeUpdateWorkflow();
    } else {
      setSaveModalOpen(true);
    }
  };

  const handleSaveAs = () => {
    if (!isDesigner) {
      showPermissionError();
      return;
    }
    if (canvasNodes.length === 0)
      return alert(UI_STRINGS.dashboard.page.alerts.theCanvasIsEmpty);
    setSaveModalOpen(true);
  };

  const executeUpdateWorkflow = async () => {
    if (!user || !currentWorkflowId) {
      alert(UI_STRINGS.dashboard.page.alerts.userOrWorkflowNotVerified);
      return false;
    }

    setIsSaving(true);

    try {
      const latest = await getWorkflow(currentWorkflowId);
      const currentStatus = latest?.metadata?.status;
      const allowedStatuses = ["draft", "changes_requested"];

      if (latest && !allowedStatuses.includes(currentStatus)) {
        alert(
          UI_STRINGS.dashboard.page.alerts.noSePuedeEditarUn(currentStatus),
        );
        return false;
      }

      // El trigger de la base sube la versión y sella fecha y autor
      await saveWorkflow(currentWorkflowId, {
        nodes: canvasNodes,
        connections: manualConnections,
      });

      console.log("✅ Workflow actualizado");
      setIsDirty(false);
      return true;
    } catch (e) {
      console.error("❌ Error actualizando workflow:", e);

      if (e.code === "permission-denied") {
        alert(UI_STRINGS.dashboard.page.alerts.permissionDeniedUpdate);
      } else {
        alert(UI_STRINGS.dashboard.page.alerts.errorAlActualizar + e.message);
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const executeSaveAsNew = async (workflowName) => {
    if (!user) {
      alert(UI_STRINGS.dashboard.page.alerts.userNotVerified);
      return;
    }

    setIsSaving(true);

    try {
      // Se crea en draft con el usuario como creador y primer diseñador (defaults y trigger)
      const newId = await createWorkflow({
        name: workflowName,
        nodes: canvasNodes,
        connections: manualConnections,
      });
      console.log("✅ Workflow guardado con ID:", newId);
      setSaveModalOpen(false);
      setCurrentWorkflowId(newId);
      setIsDirty(false);
      return true;
    } catch (e) {
      console.error("❌ Error guardando workflow:", e);

      if (e.code === "permission-denied") {
        alert(UI_STRINGS.dashboard.page.alerts.permissionDeniedSave);
      } else {
        alert(UI_STRINGS.dashboard.page.alerts.errorAlGuardar + e.message);
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadWorkflow = async (workflowId) => {
    if (!user) return;

    try {
      const workflowData = await getWorkflow(workflowId);
      if (workflowData) {
        setCanvasNodes(workflowData.content.nodes || []);
        setManualConnections(
          connectionsForLoadedWorkflow(workflowData.content),
        );

        setCurrentWorkflowId(workflowId);
        setIsDirty(false);
        setIsSessionReadOnly(true);
        alert(UI_STRINGS.dashboard.page.alerts.flujoDeTrabajoCargadoModo);
      } else {
        alert(UI_STRINGS.dashboard.page.alerts.workflowNotFound);
      }
    } catch (error) {
      alert(UI_STRINGS.dashboard.page.alerts.errorAlCargarElFlujo);
      console.error("Error al cargar:", error);
    }
    setLoadModalOpen(false);
  };

  const workflowTitle = currentWorkflow
    ? currentWorkflow.name
    : UI_STRINGS.dashboard.page.unsavedWorkflowTitle;

  const [isCompiling, setIsCompiling] = React.useState(false);
  const [modalMsg, setModalMsg] = useState(null);

  // Handler para el botón Compile
  async function handleCompileDiagram() {
    try {
      setIsCompiling(true);

      console.log("Connections:", manualConnections);

      const wf = buildCompileWorkflowFromCanvas(canvasNodes, manualConnections);

      const connections = (manualConnections || []).map((c) => ({
        from: c.from,
        to: c.to,
        fromPort: c.fromPort,
        toPort: c.toPort,
      }));
      const errors = validateWorkflow(canvasNodes, connections);

      if (errors.length > 0) {
        setModalMsg(
          UI_STRINGS.dashboard.page.messages.errorDeValidacion +
            errors.map((e) => "• " + e).join("\n"),
        );
        setIsCompiling(false);
        return;
      }

      const xmlBlob = await sendCompile({
        ...wf,
        workflowName: workflowTitle,
      });

      const url = URL.createObjectURL(xmlBlob);

      const rawName =
        workflowTitle || wf.workflowName || wf.name || wf.id || "workflow";

      let safeName = String(rawName)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_.-]+/g, "_");

      if (!safeName.toLowerCase().endsWith(".xml")) {
        safeName += ".xml";
      }

      const filename = safeName;

      setCompileDialog({
        open: true,
        url,
        filename,
        message: UI_STRINGS.dashboard.page.compileSuccess,
      });
    } catch (err) {
      console.error(err);
      const lines = String(err.message || "Error en compilación").split("\n");
      const title = lines.shift() || "Fallo de compilación";
      const list = lines.map((l) => `• ${l.replace(/^- /, "")}`).join("\n");
      setModalMsg(`❌ ${title}\n${list}`);
    } finally {
      setIsCompiling(false);
    }
  }

  async function handleTestDiagram() {
    try {
      const flow = buildWorkflowFromCanvas(canvasNodes);
      console.log("Flow ->", flow);
      const { plan } = await sendWorkflow(flow);
      console.log("✅ Plan simulado:", plan);
      setModalMsg(
        UI_STRINGS.dashboard.page.messages.flujoEnviadoYSimuladoRevisa,
      );
    } catch (err) {
      console.error(err);
      setModalMsg(UI_STRINGS.dashboard.page.messages.errorPrefix + err.message);
    }
  }

  const isParallelDisabled = selectedNodes.length === 0;
  const isBranchDisabled = selectedNodes.length === 0;

  const protectedTypes = new Set(["start", "connection", "end"]);
  const anyProtectedSelected = selectedNodes.some((idx) =>
    protectedTypes.has(canvasNodes[idx]?.type),
  );
  const isRemoveDisabled =
    !isDesigner || selectedNodes.length === 0 || anyProtectedSelected;

  const isNodeBelowEnabled =
    selectedNodes.length === 1 &&
    canvasNodes[selectedNodes[0]]?.type === "connection";

  const handleCheckout = async (description) => {
    console.log("Checkout with description:", description);

    if (!currentWorkflowId) {
      console.error("No active workflow to checkout");
      return;
    }

    try {
      await checkoutWorkflow(currentWorkflowId, description);

      setIsSessionReadOnly(false);

      setCheckoutModalOpen(false);
      alert(UI_STRINGS.dashboard.page.alerts.checkoutSuccessfulEditModeEnabled);
    } catch (error) {
      console.error("Error during checkout:", error);
      alert(
        UI_STRINGS.dashboard.page.alerts.errorDuringCheckout + error.message,
      );
    }
  };

  // =============================
  //  RETURN PRINCIPAL DE APP
  // =============================
  return (
    <div className="App">
      <MenuBar
        user={user}
        userRoles={userRoles}
        title={workflowTitle}
        workflow={currentWorkflow}
        onShare={handleOpenShareModal}
        onApprove={handleApprove}
        OnLogout={handleLogout}
        onNewWorkflow={() => {
          const nodes = getDefaultWorkflowNodes();
          setCanvasNodes(nodes);
          // Las conexiones del workflow anterior no pasan al nuevo: solo las aristas por defecto.
          setManualConnections(connectionsForLoadedWorkflow({ nodes }));
          setUsedComponents([]);
          setIsSessionReadOnly(false);
        }}
        onSaveWorkflow={handleSave}
        onSaveAsWorkflow={handleSaveAs}
        onOpenWorkflow={() => setLoadModalOpen(true)}
        onCheckout={() => setCheckoutModalOpen(true)}
        onVersionHistory={() => setVersionHistoryModalOpen(true)}
        isDesigner={isDesigner}
        isDeployer={isDeployer}
        isSessionReadOnly={isSessionReadOnly}
      />
      <CheckoutModal
        open={isCheckoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        onCheckout={handleCheckout}
      />
      <VersionHistoryModal
        open={isVersionHistoryModalOpen}
        onClose={() => setVersionHistoryModalOpen(false)}
        history={currentWorkflow?.metadata?.history || []}
      />
      {currentWorkflow && (
        <ShareWorkflowModal
          open={isShareModalOpen}
          onClose={() => setShareModalOpen(false)}
          workflow={currentWorkflow}
          potentialReviewers={potentialReviewers}
          allUsers={allUsers}
          user={user}
          userRoles={userRoles}
        />
      )}
      <div className="topUp">
        <div
          className="toolbar"
          role="toolbar"
          aria-label={UI_STRINGS.dashboard.page.canvasToolbar}
          ref={toolbarRef}
        >
          {/* Selection / Placement */}
          <button
            onClick={() => setInteractionMode("select")}
            title={UI_STRINGS.dashboard.page.select}
          >
            <img
              src="/ICONOSPNG/SELECT.png"
              alt={UI_STRINGS.dashboard.page.select}
            />{" "}
            {UI_STRINGS.dashboard.page.select}
          </button>
          <button
            onClick={() => setInteractionMode("place-node")}
            title={UI_STRINGS.dashboard.page.node}
          >
            <img
              src="/ICONOSPNG/NODE.png"
              alt={UI_STRINGS.dashboard.page.node}
            />{" "}
            {UI_STRINGS.dashboard.page.node}
          </button>
          <button
            onClick={() => setInteractionMode("connect")}
            title={UI_STRINGS.dashboard.page.connection}
          >
            <img
              src="/ICONOSPNG/CONNECTION.png"
              alt={UI_STRINGS.dashboard.page.connection}
            />{" "}
            {UI_STRINGS.dashboard.page.connection}
          </button>

          {/* Node organization */}
          <button
            onClick={() => {
              try {
                if (!isDesigner) return showPermissionError();
                setCanvasNodes((prev) =>
                  prev.map((n, i) =>
                    selectedNodes.includes(i)
                      ? { ...n, y: (n.y || 0) + 40 }
                      : n,
                  ),
                );
              } catch (err) {
                console.error(err);
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.moveNodeDownError +
                    (err.message || err),
                );
              }
            }}
            disabled={!isNodeBelowEnabled}
            title={UI_STRINGS.dashboard.page.nodeBelow}
          >
            <img
              src="/ICONOSPNG/NODEBELOW.png"
              alt={UI_STRINGS.dashboard.page.nodeBelow}
            />{" "}
            {UI_STRINGS.dashboard.page.nodeBelow}
          </button>

          <button
            onClick={() => {
              try {
                if (!isDesigner) return showPermissionError();
                setCanvasNodes((prev) =>
                  prev.map((n, i) =>
                    selectedNodes.includes(i)
                      ? { ...n, y: (n.y || 0) - 40 }
                      : n,
                  ),
                );
              } catch (err) {
                console.error(err);
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.moveNodeUpError +
                    (err.message || err),
                );
              }
            }}
            disabled={selectedNodes.length === 0}
            title={UI_STRINGS.dashboard.page.nodeAbove}
          >
            <img
              src="/ICONOSPNG/NODEABOVE.png"
              alt={UI_STRINGS.dashboard.page.nodeAbove}
            />{" "}
            {UI_STRINGS.dashboard.page.nodeAbove}
          </button>

          <button
            onClick={() => {
              try {
                if (!isDesigner) return showPermissionError();
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.removeLinkAccionSimulada,
                );
              } catch (err) {
                console.error(err);
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.errorEnRemoveLink +
                    (err.message || err),
                );
              }
            }}
            disabled={selectedNodes.length === 0}
            title={UI_STRINGS.dashboard.page.removeLink}
          >
            <img
              src="/ICONOSPNG/REMOVELINK.png"
              alt={UI_STRINGS.dashboard.page.removeLink}
            />{" "}
            {UI_STRINGS.dashboard.page.removeLink}
          </button>

          <button
            disabled={isParallelDisabled}
            title={UI_STRINGS.dashboard.page.parallel}
            onClick={() => {
              try {
                if (!isDesigner) return showPermissionError();
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.parallelActionSimulada,
                );
              } catch (err) {
                console.error(err);
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.errorEnParallel +
                    (err.message || err),
                );
              }
            }}
          >
            <img
              src="/ICONOSPNG/PARALEL.png"
              alt={UI_STRINGS.dashboard.page.parallel}
            />{" "}
            {UI_STRINGS.dashboard.page.parallel}
          </button>

          <button
            disabled={isBranchDisabled}
            title={UI_STRINGS.dashboard.page.branch}
            onClick={() => {
              try {
                if (!isDesigner) return showPermissionError();
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.branchActionSimulada,
                );
              } catch (err) {
                console.error(err);
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.errorEnBranch +
                    (err.message || err),
                );
              }
            }}
          >
            <img
              src="/ICONOSPNG/BRANCH.png"
              alt={UI_STRINGS.dashboard.page.branch}
            />{" "}
            {UI_STRINGS.dashboard.page.branch}
          </button>

          <button
            onClick={() => {
              try {
                if (!isDesigner) return showPermissionError();
                if (isRemoveDisabled) {
                  if (anyProtectedSelected) {
                    setModalMsg(
                      UI_STRINGS.dashboard.page.messages
                        .noSePuedenEliminarNodos,
                    );
                    return;
                  }
                  return;
                }
                const remaining = canvasNodes.filter(
                  (_, i) => !selectedNodes.includes(i),
                );
                setCanvasNodes(remaining);
                setManualConnections((prev) =>
                  dropDanglingConnections(prev, remaining),
                );
                setSelectedNodes([]);
              } catch (err) {
                console.error(err);
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.errorAlEliminarNodos +
                    (err.message || err),
                );
              }
            }}
            disabled={isRemoveDisabled}
            title={
              isRemoveDisabled && anyProtectedSelected
                ? "Protected node selected"
                : "Remove"
            }
            className={isRemoveDisabled ? "disabled" : ""}
          >
            <img
              src="/ICONOSPNG/REMOVE.png"
              alt={UI_STRINGS.dashboard.page.remove}
            />{" "}
            {UI_STRINGS.dashboard.page.remove}
          </button>

          <button
            onClick={() =>
              setModalMsg(
                UI_STRINGS.dashboard.page.messages
                  .equipmentViewShortcutSimulada,
              )
            }
            title={UI_STRINGS.dashboard.page.equipment}
          >
            <img
              src="/ICONOSPNG/EQUIPMENT.png"
              alt={UI_STRINGS.dashboard.page.equipment}
            />{" "}
            {UI_STRINGS.dashboard.page.equipment}
          </button>

          <button
            onClick={() =>
              setModalMsg(
                UI_STRINGS.dashboard.page.messages.materialViewShortcutSimulada,
              )
            }
            title={UI_STRINGS.dashboard.page.material}
          >
            <img
              src="/ICONOSPNG/MATERIAL.png"
              alt={UI_STRINGS.dashboard.page.material}
            />{" "}
            {UI_STRINGS.dashboard.page.material}
          </button>

          <button
            onClick={() =>
              setModalMsg(
                UI_STRINGS.dashboard.page.messages
                  .personnelViewShortcutSimulada,
              )
            }
            title={UI_STRINGS.dashboard.page.personnel}
          >
            <img
              src="/ICONOSPNG/PERSONNEL.png"
              alt={UI_STRINGS.dashboard.page.personnel}
            />{" "}
            {UI_STRINGS.dashboard.page.personnel}
          </button>

          <button
            onClick={() => {
              try {
                if (!isDesigner) return showPermissionError();
                setCanvasNodes((prev) =>
                  prev.map((n, i) =>
                    selectedNodes.includes(i)
                      ? { ...n, x: (n.x || 0) - 80 }
                      : n,
                  ),
                );
              } catch (err) {
                console.error(err);
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.errorEnBelowParallel +
                    (err.message || err),
                );
              }
            }}
            disabled={selectedNodes.length === 0}
            title={UI_STRINGS.dashboard.page.belowParallel}
          >
            <img
              src="/ICONOSPNG/BELOWPARALEL.png"
              alt={UI_STRINGS.dashboard.page.belowParallel}
            />{" "}
            {UI_STRINGS.dashboard.page.belowParallel}
          </button>

          <button
            onClick={() => {
              try {
                if (!isDesigner) return showPermissionError();
                setCanvasNodes((prev) =>
                  prev.map((n, i) =>
                    selectedNodes.includes(i)
                      ? { ...n, x: (n.x || 0) + 80 }
                      : n,
                  ),
                );
              } catch (err) {
                console.error(err);
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.errorEnAboveParallel +
                    (err.message || err),
                );
              }
            }}
            disabled={selectedNodes.length === 0}
            title={UI_STRINGS.dashboard.page.aboveParallel}
          >
            <img
              src="/ICONOSPNG/ABOVEPARALEL.png"
              alt={UI_STRINGS.dashboard.page.aboveParallel}
            />{" "}
            {UI_STRINGS.dashboard.page.aboveParallel}
          </button>

          <button
            onClick={() => {
              try {
                if (selectedNodes.length !== 1)
                  return setModalMsg(
                    UI_STRINGS.dashboard.page.messages
                      .seleccioneUnUnicoNodoPara,
                  );
                const idx = selectedNodes[0];
                if (!canvasNodes || !canvasNodes[idx])
                  return setModalMsg(
                    UI_STRINGS.dashboard.page.messages
                      .nodoSeleccionadoNoEncontrado,
                  );
                setSelectedEquipment(canvasNodes[idx]);
                setParametersModalOpen(true);
              } catch (err) {
                console.error(err);
                setModalMsg(
                  UI_STRINGS.dashboard.page.messages.errorAlMostrarParametros +
                    (err.message || err),
                );
              }
            }}
            disabled={selectedNodes.length === 0}
            title={UI_STRINGS.dashboard.page.nodeParameters}
          >
            <img
              src="/ICONOSPNG/PARAMETERS.png"
              alt={UI_STRINGS.dashboard.page.parameters}
            />{" "}
            {UI_STRINGS.dashboard.page.nodeParameters}
          </button>

          <button onClick={toggleGrid} title={UI_STRINGS.dashboard.page.grid}>
            <img
              src="/ICONOSPNG/GRID.png"
              alt={UI_STRINGS.dashboard.page.grid}
            />{" "}
            {isGridEnabled
              ? UI_STRINGS.dashboard.page.gridOn
              : UI_STRINGS.dashboard.page.gridOff}
          </button>
          <button
            type="button"
            onClick={handleTestDiagram}
            title={UI_STRINGS.dashboard.page.testDiagram}
          >
            {UI_STRINGS.dashboard.page.testDiagram}
          </button>

          <button
            type="button"
            onClick={handleCompileDiagram}
            style={{ marginLeft: 8 }}
            title={UI_STRINGS.dashboard.page.compile}
          >
            {UI_STRINGS.dashboard.page.compile}
          </button>
        </div>
      </div>

      {/* VENTANAS DE COMPILACIÓN (overlays) */}
      {isCompiling && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--kk-scrim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9998,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              background: "var(--kk-surface)",
              padding: 20,
              borderRadius: 12,
              width: 360,
              boxShadow: "var(--kk-shadow-overlay)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                margin: "0 auto 12px",
                border: "4px solid var(--kk-border)",
                borderTop: "4px solid var(--kk-cyan-text)",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {UI_STRINGS.dashboard.page.compilacionEnCurso}
            </div>
            <div style={{ color: "var(--kk-ink-muted)" }}>
              {UI_STRINGS.dashboard.page.estamosValidandoYGenerandoEl}
            </div>
          </div>
          <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
        </div>
      )}

      {compileDialog.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--kk-scrim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: 420,
              background: "var(--kk-surface)",
              borderRadius: 12,
              boxShadow: "var(--kk-shadow-overlay)",
              padding: 20,
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>
              {UI_STRINGS.dashboard.page.flujoValido}
            </h3>
            <p style={{ whiteSpace: "pre-wrap", marginTop: 0 }}>
              {compileDialog.message}
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 16,
              }}
            >
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = compileDialog.url;
                  a.download = compileDialog.filename || "workflow.xml";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--kk-brand-mint)",
                  color: "var(--kk-on-brand)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {UI_STRINGS.dashboard.page.descargar}
              </button>
              <button
                onClick={() => {
                  if (compileDialog.url) URL.revokeObjectURL(compileDialog.url);
                  setCompileDialog({
                    open: false,
                    url: null,
                    filename: null,
                    message: "",
                  });
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--kk-border)",
                  background: "var(--kk-surface)",
                  color: "var(--kk-ink)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {UI_STRINGS.dashboard.page.cancelar}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalMsg && (
        <ModalMessage
          title={UI_STRINGS.dashboard.page.resultado}
          message={modalMsg}
          onClose={() => setModalMsg(null)}
        />
      )}

      <div
        ref={contentRowRef}
        style={{
          marginTop: contentMarginTop != null ? contentMarginTop : undefined,
        }}
      >
        <div
          className="topLeft"
          style={{
            width: "270px",
            borderRight: "1px solid var(--kk-border)",
            overflowY: "auto",
            position: "relative",
            marginTop: 0,
          }}
        >
          <TreeViewExample
            isDesigner={isDesigner}
            usedComponents={usedComponents}
            setDragComponent={(comp) => (window._dragComponent = comp)}
            onEquipmentSelect={handleEquipmentSelect}
            setInteractionMode={setInteractionMode}
          />
        </div>
        <div
          ref={topRightRef}
          className="topRight"
          style={{ flex: 1, padding: "16px", position: "relative" }}
        >
          <Canvas
            nodes={canvasNodes}
            setNodes={setCanvasNodes}
            setUsedComponents={setUsedComponents}
            onDirty={() => setIsDirty(true)}
            isGridEnabled={isGridEnabled}
            boundingContainerRef={topRightRef}
            interactionMode={interactionMode}
            setInteractionMode={setInteractionMode}
            isDesigner={isDesigner}
            showPermissionError={showPermissionError}
            selectedNodes={selectedNodes}
            setSelectedNodes={setSelectedNodes}
            onNodeAdded={handleOpenParamsForNewNode}
            isReadOnly={isParametersReadOnly}
            setModalMsg={setModalMsg}
            manualConnections={manualConnections}
            setManualConnections={setManualConnections}
          />
        </div>
        <UnsavedChangesModal
          open={showUnsavedModal}
          onDiscard={() => {
            console.log("🗑️ Usuario descartó cambios");
            setIsDirty(false);
            performLogout();
          }}
          onSave={async () => {
            console.log("💾 Usuario eligió guardar");
            setIsSaving(true);
            try {
              if (currentWorkflowId) {
                await executeUpdateWorkflow();
              } else {
                const defaultName = `Workflow-${new Date().toISOString().split("T")[0]}-${Date.now()}`;
                await executeSaveAsNew(defaultName);
              }
              setIsDirty(false);
              performLogout();
            } catch (error) {
              console.error("Error al guardar:", error);
              alert(
                UI_STRINGS.dashboard.page.alerts.errorAlGuardarLosCambios +
                  error.message,
              );
            } finally {
              setIsSaving(false);
            }
          }}
          isSaving={isSaving}
        />
        <OpenWorkflowModal
          open={isLoadModalOpen}
          onClose={() => setLoadModalOpen(false)}
          workflows={savedWorkflows}
          onSelect={handleLoadWorkflow}
          user={user}
          userRoles={userRoles}
        />
        <SaveWorkflowModal
          open={isSaveModalOpen}
          onClose={() => setSaveModalOpen(false)}
          onSave={executeSaveAsNew}
        />
        <NodeParametersModal
          open={isParametersModalOpen}
          nodeData={selectedEquipment}
          onClose={() => setParametersModalOpen(false)}
          onAccept={({ paramsByTab }) => {
            const idx = selectedNodes[0];
            if (idx != null) {
              setCanvasNodes((prev) => {
                const copy = [...prev];
                const oldParams = copy[idx].parameters;

                if (JSON.stringify(oldParams) !== JSON.stringify(paramsByTab)) {
                  copy[idx] = {
                    ...copy[idx],
                    parameters: paramsByTab,
                  };
                  setIsDirty(true);
                }

                return copy;
              });
            }
            setParametersModalOpen(false);
          }}
          isReadOnly={isParametersReadOnly}
        />
      </div>
    </div>
  );
} // ← FIN App

// =============================
//  CANVAS
// =============================
function Canvas({
  nodes,
  setNodes,
  setUsedComponents,
  isGridEnabled,
  boundingContainerRef,
  interactionMode,
  setInteractionMode,
  isDesigner,
  showPermissionError,
  selectedNodes,
  setSelectedNodes,
  onDirty,
  onNodeAdded,
  isReadOnly,
  setModalMsg,
  manualConnections,
  setManualConnections,
}) {
  const isKeyboardNavigation = false;
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [nodeStart, setNodeStart] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const nodeElements = useRef({});
  const [dragStartedOnNode, setDragStartedOnNode] = useState(false);
  const [hoveredNodeIdx, setHoveredNodeIdx] = useState(null);

  // On first mount, initialize default connections for Begin->Connection->End
  useEffect(() => {
    try {
      if (manualConnections.length === 0 && nodes && nodes.length > 0) {
        const hasBegin = nodes.some(
          (n) => n.type === "start" || n.id === "begin",
        );
        const hasConn = nodes.some(
          (n) => n.type === "connection" || n.id === "connection1",
        );
        const hasEnd = nodes.some((n) => n.type === "end" || n.id === "end");
        if (hasBegin && hasConn && hasEnd) {
          const begin = nodes.find(
            (n) => n.type === "start" || n.id === "begin",
          );
          const conn = nodes.find(
            (n) => n.type === "connection" || n.id === "connection1",
          );
          const end = nodes.find((n) => n.type === "end" || n.id === "end");
          if (begin && conn && end) {
            const p1 = choosePortsForPair(begin, conn);
            const p2 = choosePortsForPair(conn, end);
            setManualConnections([
              {
                from: begin.id,
                to: conn.id,
                fromPort: p1.fromPort,
                toPort: p1.toPort,
                id: `conn-init-${Date.now()}-1`,
              },
              {
                from: conn.id,
                to: end.id,
                fromPort: p2.fromPort,
                toPort: p2.toPort,
                id: `conn-init-${Date.now()}-2`,
              },
            ]);
          }
        }
      }
    } catch (err) {
      // ignore
    }
  }, []);

  useEffect(() => {
    const errors = validateWorkflow(nodes, manualConnections);

    if (errors.length > 0) {
      setModalMsg(
        UI_STRINGS.dashboard.canvas.messages.errores + errors.join("\n"),
      );
    }
  }, [nodes, manualConnections]);

  const [newConnection, setNewConnection] = useState(null);
  const [errorToast, setErrorToast] = useState(null);

  const GRID_SIZE = 20;
  const snapToGrid = (value) => Math.round(value / GRID_SIZE) * GRID_SIZE;

  const [isBlankDragging, setIsBlankDragging] = useState(false);

  // Recompute connection ports whenever nodes move
  useEffect(() => {
    if (!manualConnections || manualConnections.length === 0) return;
    setManualConnections((prev) => {
      let changed = false;
      const updated = prev.map((mc) => {
        const fromNode = nodes.find((n) => n.id === mc.from);
        const toNode = nodes.find((n) => n.id === mc.to);
        if (!fromNode || !toNode) return mc;
        const ports = choosePortsForPair(fromNode, toNode);
        if (ports.fromPort !== mc.fromPort || ports.toPort !== mc.toPort) {
          changed = true;
          return { ...mc, fromPort: ports.fromPort, toPort: ports.toPort };
        }
        return mc;
      });
      return changed ? updated : prev;
    });
  }, [nodes]);

  const handleWheel = (e) => {
    if (e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    const scaleAmount = 0.1;
    let newZoom = zoom - e.deltaY * scaleAmount * 0.01;
    newZoom = Math.max(0.2, Math.min(newZoom, 2.5));
    setZoom(newZoom);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheelHandler = (e) => handleWheel(e);
    canvas.addEventListener("wheel", wheelHandler, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", wheelHandler);
    };
  }, [zoom]);

  const handleCanvasMouseDown = (e) => {
    if (
      isReadOnly &&
      (interactionMode === "connect" || interactionMode === "place-node")
    ) {
      setModalMsg(
        UI_STRINGS.dashboard.canvas.messages.noSePuedenAgregarElementos,
      );
      setInteractionMode("select");
      return;
    }

    if (!isDesigner && interactionMode !== "select") {
      showPermissionError();
      return;
    }

    if (interactionMode === "connect") {
      if (e.button === 0) {
        const canvasAreaEl = e.currentTarget;
        const transformEl =
          canvasAreaEl.querySelector(".canvas-transform") || canvasAreaEl;
        const rectT = transformEl.getBoundingClientRect();
        let xT = (e.clientX - rectT.left - pan.x) / zoom;
        let yT = (e.clientY - rectT.top - pan.y) / zoom;
        if (isGridEnabled) {
          xT = snapToGrid(xT);
          yT = snapToGrid(yT);
        }

        if (!isDesigner) {
          showPermissionError();
          return;
        }

        const existingConnNums = nodes
          .filter((n) => n.type === "connection")
          .map((n) => {
            const m = (n.label || "").match(/Connection\s*(\d+)/i);
            return m ? parseInt(m[1], 10) : 0;
          });
        const maxNum = existingConnNums.length
          ? Math.max(...existingConnNums)
          : 0;
        const nextNum = maxNum + 1;

        const newNode = {
          label: `Connection ${nextNum}`,
          x: xT,
          y: yT,
          type: "connection",
          id: `connection-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          color: "var(--kk-status-changes-fg)",
        };
        setNodes((prev) => [...prev, newNode]);
        setInteractionMode("place-start-object");

        return;
      }
    }

    // ✅ PLACE START OBJECT
    if (interactionMode === "place-start-object") {
      if (e.button === 0) {
        const canvasAreaEl = e.currentTarget;
        const transformEl =
          canvasAreaEl.querySelector(".canvas-transform") || canvasAreaEl;
        const rectT = transformEl.getBoundingClientRect();

        let xT = (e.clientX - rectT.left - pan.x) / zoom;
        let yT = (e.clientY - rectT.top - pan.y) / zoom;

        if (isGridEnabled) {
          xT = snapToGrid(xT);
          yT = snapToGrid(yT);
        }

        if (!isDesigner) {
          showPermissionError();
          return;
        }

        const newNode = {
          label: "Start Object",
          x: xT,
          y: yT,
          type: "startObject",
          id: `start-${Date.now()}`,
        };

        setNodes((prev) => [...prev, newNode]);
        setInteractionMode("select");
        return;
      }
    }

    // REQ-UI-002: Add new node with placeholder text
    if (interactionMode === "place-node") {
      if (e.button === 0) {
        const canvasAreaEl = e.currentTarget;
        const transformEl =
          canvasAreaEl.querySelector(".canvas-transform") || canvasAreaEl;
        const rectT = transformEl.getBoundingClientRect();

        let xT = (e.clientX - rectT.left - pan.x) / zoom;
        let yT = (e.clientY - rectT.top - pan.y) / zoom;

        if (isGridEnabled) {
          xT = snapToGrid(xT);
          yT = snapToGrid(yT);
        }

        if (!isDesigner) {
          showPermissionError();
          return;
        }

        const newNode = {
          label: null,
          x: xT,
          y: yT,
          type: "Node",
          id: `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        };

        setNodes((prev) => [...prev, newNode]);
        setInteractionMode("select");
        return;
      }
    }

    if (e.target.classList.contains("canvas-area")) {
      if (e.button === 2) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        document.body.style.cursor = "grab";
      }
      if (e.button === 0) {
        setIsBlankDragging(true);
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          setSelectedNodes([]);
        }
      }
    }
  };

  const handleTransformMouseDown = (e) => {
    if (
      e.target === e.currentTarget &&
      e.button === 0 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey
    ) {
      setSelectedNodes([]);
      setDraggedIdx(null);
      setDragStartedOnNode(false);
    }

    if (e.target === e.currentTarget && e.button === 2) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      document.body.style.cursor = "grabbing";
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (draggedIdx !== null && dragStartedOnNode && e.buttons === 1) {
      return;
    }
    if (isPanning && e.buttons === 2) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
    if (isBlankDragging && e.buttons === 1) {
      setSelectedNodes([]);
    }
    if (newConnection && newConnection.from !== null) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      setNewConnection((prev) => ({ ...prev, to: { x, y } }));
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
    setDraggedIdx(null);
    setIsBlankDragging(false);
    document.body.style.cursor = "";
    if (newConnection) {
      setNewConnection(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();

    if (isReadOnly) {
      setModalMsg(
        UI_STRINGS.dashboard.canvas.messages.accionDenegadaNoSePueden,
      );
      window._dragComponent = null;
      return;
    }

    if (!isDesigner) {
      showPermissionError();
      window._dragComponent = null;
      return;
    }

    const comp = window._dragComponent;

    if (comp) {
      const rect = e.currentTarget.getBoundingClientRect();
      let x = (e.clientX - rect.left - pan.x) / zoom;
      let y = (e.clientY - rect.top - pan.y) / zoom;

      if (isGridEnabled) {
        x = snapToGrid(x);
        y = snapToGrid(y);
      }

      if (comp.kind === "userDefinition") {
        // WFPR-003 (opción B): la definición y todos sus descendientes, conectados en cadena.
        const stamp = Date.now();
        const { nodes: added, connections } = expandForCanvas(comp.definition, {
          x,
          y,
          basePath: comp.basePath || [],
          makeId: (i) => `instancia-${stamp}-${i}`,
        });
        setUsedComponents((used) => [
          ...new Set([...used, ...added.map((n) => n.label)]),
        ]);
        setNodes((prevNodes) => [...prevNodes, ...added]);
        setManualConnections((prev) => [...prev, ...connections]);
        if (added.length === 1 && typeof onNodeAdded === "function") {
          onNodeAdded(nodes.length, added[0]);
        }
        if (onDirty) onDirty();
        window._dragComponent = null;
        return;
      }

      setUsedComponents((used) => [...new Set([...used, comp.label])]);

      // kind/predefinedKey solo sirven para soltar dentro del panel; no van al nodo.
      const { kind, predefinedKey, ...dropped } = comp;
      const newNode = {
        ...dropped,
        x,
        y,
        id: `instancia-${Date.now()}`,
        type: comp.type || comp.label || "noop",
        parameters: comp.parameters
          ? JSON.parse(JSON.stringify(comp.parameters))
          : undefined,
      };

      if (comp.procedurePhase) {
        newNode.procedurePhase = comp.procedurePhase;
      }
      if (comp.operation) {
        newNode.operation = comp.operation;
      }

      setNodes((prevNodes) => {
        const newNodes = [...prevNodes, newNode];

        const indexForNewNode = newNodes.length - 1;

        if (typeof onNodeAdded === "function") {
          const t = (newNode.type || "").toLowerCase();
          const shouldOpen = !["begin", "end", "connection", "start"].includes(
            t,
          );
          if (shouldOpen) {
            onNodeAdded(indexForNewNode, newNode);
          }
        }

        if (onDirty) onDirty();
        return newNodes;
      });

      window._dragComponent = null;
    }
  };

  // Helper: compute a port's absolute position
  const getPortPosition = (node, port) => {
    const nodeEl = nodeElements.current[node.id];

    const w = nodeEl ? nodeEl.clientWidth : 120;
    const h = nodeEl ? nodeEl.clientHeight : 40;

    const leftX = node.x || 0;
    const topY = node.y || 0;
    const rightX = leftX + w;
    const bottomY = topY + h;
    const centerX = leftX + w / 2;
    const centerY = topY + h / 2;

    switch (port) {
      case "top":
        return { x: centerX, y: topY };
      case "right":
        return { x: rightX, y: centerY };
      case "bottom":
        return { x: centerX, y: bottomY };
      case "left":
      default:
        return { x: leftX, y: centerY };
    }
  };

  // Decide which ports to use between two nodes based on relative position
  const choosePortsForPair = (fromNode, toNode) => {
    if (!fromNode || !toNode) return { fromPort: "right", toPort: "left" };
    const fx = fromNode.x || 0;
    const fy = fromNode.y || 0;
    const tx = toNode.x || 0;
    const ty = toNode.y || 0;
    const dx = tx - fx;
    const dy = ty - fy;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0
        ? { fromPort: "right", toPort: "left" }
        : { fromPort: "left", toPort: "right" };
    }

    return dy > 0
      ? { fromPort: "bottom", toPort: "top" }
      : { fromPort: "top", toPort: "bottom" };
  };

  // Toggle or start connection when interacting with a port
  const handlePortClick = (nodeIdx, port, e) => {
    e.stopPropagation();
    const node = nodes[nodeIdx];
    if (!node) return;

    if (newConnection && newConnection.from !== null) {
      if (newConnection.from === node.id && newConnection.fromPort === port) {
        setNewConnection(null);
        return;
      }

      setManualConnections((prev) => {
        const alreadyExists = prev.some(
          (c) =>
            c.from === newConnection.from &&
            c.to === node.id &&
            c.fromPort === newConnection.fromPort &&
            c.toPort === port,
        );

        if (alreadyExists) {
          setErrorToast("Esa conexión ya existe");
          setTimeout(() => setErrorToast(null), 2000);
          return prev;
        }

        const conn = {
          from: newConnection.from,
          to: node.id,
          fromPort: newConnection.fromPort,
          toPort: port,
          id: `conn-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        };

        return [...prev, conn];
      });

      setNewConnection(null);
      return;
    }

    const existing = (manualConnections || []).find(
      (c) =>
        (c.from === node.id && c.fromPort === port) ||
        (c.to === node.id && c.toPort === port),
    );

    if (existing) {
      setManualConnections((prev) => prev.filter((x) => x.id !== existing.id));
      return;
    }

    const fromPos = getPortPosition(node, port);
    setNewConnection({
      from: node.id,
      fromPort: port,
      to: { x: fromPos.x, y: fromPos.y },
    });
  };

  const handleDelete = (idx) => {
    if (isReadOnly) {
      setModalMsg(UI_STRINGS.dashboard.canvas.messages.accionDenegadaElFlujoEs);
      return;
    }

    if (!isDesigner) {
      showPermissionError();
      return;
    }

    const label = nodes[idx].label;
    const newNodes = nodes.filter((_, i) => i !== idx);
    setNodes(newNodes);
    setManualConnections((prev) => dropDanglingConnections(prev, newNodes));

    if (onDirty) onDirty();

    setUsedComponents((used) =>
      newNodes.some((n) => n.label === label)
        ? used
        : used.filter((u) => u !== label),
    );
  };

  const [invalidConnection, setInvalidConnection] = useState(null);

  const handleMouseUpOnNode = (toIdx, e) => {
    e.stopPropagation();
    if (
      interactionMode === "connect" &&
      newConnection &&
      newConnection.from !== null
    ) {
      const fromNode = nodes.find((n) => n.id === newConnection.from);
      const toNode = nodes[toIdx];

      if (fromNode.type === "start" && toNode.type === "end") {
        setErrorToast("No se puede conectar 'Begin' directamente a 'End'");
        setInvalidConnection({
          from: fromNode,
          to: toNode,
          timestamp: Date.now(),
        });
        setTimeout(() => setErrorToast(null), 3000);
        setTimeout(() => setInvalidConnection(null), 1000);
        setNewConnection(null);
        setInteractionMode("select");
        return;
      }

      const ports = choosePortsForPair(fromNode, toNode);

      const conn = {
        from: fromNode.id,
        to: toNode.id,
        fromPort: ports.fromPort,
        toPort: ports.toPort,
        id: `conn-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      };

      if (!conn.from || !conn.to) {
        console.error("❌ Conexión inválida:", conn);
        return;
      }

      setManualConnections((prev) => {
        const alreadyExists = prev.some(
          (c) =>
            c.from === conn.from &&
            c.to === conn.to &&
            c.fromPort === conn.fromPort &&
            c.toPort === conn.toPort,
        );

        if (alreadyExists) {
          console.warn("⚠️ Conexión duplicada ignorada:", conn);
          return prev;
        }

        return [...prev, conn];
      });

      setNewConnection(null);
      setInteractionMode("select");

      return;
    }
  };

  // Lógica centralizada de selección y arrastre múltiple
  function handleNodeMouseDown(idx, e) {
    e.stopPropagation();
    if (e.button !== 0) return;

    if (!isDesigner) {
      showPermissionError();
      return;
    }

    if (interactionMode === "connect") {
      const startNode = nodes[idx];
      setNewConnection({
        from: startNode.id,
        to: { x: startNode.x, y: startNode.y },
      });
      return;
    }

    const isModifierPressed = e.ctrlKey || e.metaKey || e.shiftKey;
    const isNodeSelected = selectedNodes.includes(idx);

    let currentSelection = [...selectedNodes];

    if (isModifierPressed) {
      if (isNodeSelected) {
        currentSelection = currentSelection.filter((i) => i !== idx);
      } else {
        currentSelection.push(idx);
      }
    } else {
      if (!isNodeSelected) {
        currentSelection = [idx];
      }
    }

    setSelectedNodes(currentSelection);

    if (isReadOnly) {
      setModalMsg(UI_STRINGS.dashboard.canvas.messages.noSePuedenMoverNodos);
      return;
    }

    setDraggedIdx(idx);
    setDragStartedOnNode(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setNodeStart(nodes.filter((_, i) => currentSelection.includes(i)));
  }

  useEffect(() => {
    if (draggedIdx === null || !dragStartedOnNode) return;

    if (onDirty) onDirty();

    const handleGlobalMouseMove = (e) => {
      if (e.buttons !== 1) return;
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;

      setNodes((currentNodes) => {
        const newNodes = [...currentNodes];
        selectedNodes.forEach((selIdx) => {
          const baseNode = nodeStart.find((n) => n.id === newNodes[selIdx].id);
          if (baseNode) {
            let x = baseNode.x + dx;
            let y = baseNode.y + dy;
            if (isGridEnabled) {
              const startNodeOriginal = nodes[selIdx];
              x =
                startNodeOriginal.x +
                snapToGrid(baseNode.x + dx - startNodeOriginal.x);
              y =
                startNodeOriginal.y +
                snapToGrid(baseNode.y + dy - startNodeOriginal.y);
            }
            newNodes[selIdx] = { ...newNodes[selIdx], x, y };
          }
        });
        return newNodes;
      });
    };

    const handleGlobalMouseUp = () => {
      setDraggedIdx(null);
      setDragStartedOnNode(false);
      document.body.style.cursor = "";
    };

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseup", handleGlobalMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [
    draggedIdx,
    dragStart,
    nodeStart,
    setNodes,
    zoom,
    isGridEnabled,
    selectedNodes,
    dragStartedOnNode,
    nodes,
  ]);

  // Build a layered, zoom-aware grid
  const gridStyle = (() => {
    if (!isGridEnabled) return {};

    const baseSizes = [160, 80, 40, 20, 10];

    const bgImages = [];
    const bgSizes = [];
    const bgPositions = [];

    for (let i = 0; i < baseSizes.length; i++) {
      const base = baseSizes[i];

      const step = Math.max(1, Math.round(base * zoom));

      const isSmallest = i === baseSizes.length - 1;
      if (step < 6 && !isSmallest) continue;

      // Cuadrícula de puntos (HTE-111): cada nivel es un punto de 1px en canvas-dot, más tenue
      // cuanto más fino es el nivel.
      const strength = i === 0 ? 100 : i === 1 ? 80 : i === 2 ? 60 : 40;
      const color = `color-mix(in srgb, var(--kk-canvas-dot) ${strength}%, transparent)`;

      bgImages.push(`radial-gradient(circle, ${color} 1px, transparent 1.5px)`);
      bgSizes.push(`${step}px ${step}px`);

      const mod = (v, m) => ((v % m) + m) % m;
      const offsetX = pan.x;
      const offsetY = pan.y;
      const posX = mod(offsetX, step);
      const posY = mod(offsetY, step);
      bgPositions.push(`${posX}px ${posY}px`);
    }

    if (bgImages.length === 0) return {};

    return {
      backgroundImage: bgImages.join(", "),
      backgroundSize: bgSizes.join(", "),
      backgroundPosition: bgPositions.join(", "),
    };
  })();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventContextMenu = (e) => e.preventDefault();
    canvas.addEventListener("contextmenu", preventContextMenu);
    return () => {
      canvas.removeEventListener("contextmenu", preventContextMenu);
    };
  }, []);

  // =============================
  //  RETURN CANVAS
  // =============================
  return (
    <div
      ref={canvasRef}
      className={`canvas-area ${interactionMode}-mode`}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onMouseLeave={handleCanvasMouseUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        ...gridStyle,
      }}
    >
      {errorToast && <div className="error-toast">{errorToast}</div>}

      <svg
        width="3000"
        height="2000"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          pointerEvents: "none",
          zIndex: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <g
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* Manual connections */}
          {manualConnections.map((mc) => {
            const fromNode = nodes.find((n) => n.id === mc.from);
            const toNode = nodes.find((n) => n.id === mc.to);
            if (!fromNode || !toNode) return null;
            const p1 = getPortPosition(fromNode, mc.fromPort);
            const p2 = getPortPosition(toNode, mc.toPort);
            return (
              <line
                key={mc.id}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                style={{ stroke: "var(--kk-cyan-text)" }}
                strokeWidth={3}
                opacity={0.95}
              />
            );
          })}

          {newConnection &&
            newConnection.from !== null &&
            (() => {
              const fromNode = nodes.find((n) => n.id === newConnection.from);
              if (!fromNode) return null;

              const startPos = getPortPosition(
                fromNode,
                newConnection.fromPort,
              );

              return (
                <line
                  x1={startPos.x}
                  y1={startPos.y}
                  x2={newConnection.to.x}
                  y2={newConnection.to.y}
                  style={{ stroke: "var(--kk-cyan-text)" }}
                  strokeWidth="2"
                  strokeDasharray="5,5"
                />
              );
            })()}

          {invalidConnection && (
            <BlinkingRedLine
              from={invalidConnection.from}
              to={invalidConnection.to}
            />
          )}
        </g>
      </svg>

      <div
        className="canvas-transform"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
        onMouseDown={handleTransformMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        {nodes.map((node, idx) => (
          <div
            key={node.id || idx}
            className={`canvas-node selecto-node${
              draggedIdx === idx ? " grabbing" : " grab"
            }${selectedNodes.includes(idx) ? " selected" : ""}`}
            data-idx={idx}
            ref={(el) => {
              if (el) {
                nodeElements.current[node.id] = el;
              } else {
                delete nodeElements.current[node.id];
              }
            }}
            onMouseEnter={() => setHoveredNodeIdx(idx)}
            onMouseLeave={() =>
              setHoveredNodeIdx((h) => (h === idx ? null : h))
            }
            style={{
              left: node.x,
              top: node.y,
              border: selectedNodes.includes(idx)
                ? "3px solid transparent"
                : "2px solid transparent",
              boxShadow: "none",
              zIndex: selectedNodes.includes(idx) ? 10 : 1,
            }}
            data-nodeid={node.id}
            onMouseDown={(e) => handleNodeMouseDown(idx, e)}
            onMouseUp={(e) => handleMouseUpOnNode(idx, e)}
          >
            {isReadOnly && (
              <div
                style={{
                  position: "absolute",
                  top: -10,
                  right: -10,
                  fontSize: "16px",
                  zIndex: 20,
                  pointerEvents: "none",
                }}
              >
                🔒
              </div>
            )}

            {node.type === "start" || node.type === "end" ? (
              <>
                <svg
                  width="40"
                  height="30"
                  viewBox="0 0 40 30"
                  className="start-end-svg"
                >
                  <polygon
                    points="5,5 35,5 20,25"
                    style={{
                      fill:
                        node.type === "start"
                          ? "var(--kk-brand-mint)"
                          : "var(--kk-brand-cyan)",
                      stroke: "var(--kk-on-brand)",
                    }}
                    strokeWidth="2"
                  />
                </svg>
                <div
                  className={`start-end-label start-end-label--${node.type}`}
                >
                  {node.type === "start"
                    ? UI_STRINGS.dashboard.canvas.begin
                    : UI_STRINGS.dashboard.canvas.end}
                </div>
              </>
            ) : node.type === "connection" ? (
              <div className="connection-node">
                <svg
                  width="40"
                  height="20"
                  viewBox="0 0 40 20"
                  className="connection-svg"
                >
                  <rect
                    x="8"
                    y="8"
                    width="24"
                    height="4"
                    style={{ fill: node.color || "var(--kk-ink)" }}
                  />
                  <rect
                    x="8"
                    y="14"
                    width="24"
                    height="4"
                    style={{ fill: node.color || "var(--kk-ink)" }}
                  />
                  <rect
                    x="8"
                    y="2"
                    width="24"
                    height="4"
                    style={{ fill: node.color || "var(--kk-ink)" }}
                  />
                </svg>
                <div
                  className="connection-label"
                  style={{ color: node.color || "inherit" }}
                >
                  {node.label || UI_STRINGS.dashboard.canvas.connection}
                </div>
              </div>
            ) : node.type === "startObject" ? (
              <>
                <div className="start-object-node">
                  <div className="start-object-label">
                    {node.label || UI_STRINGS.dashboard.canvas.startObject}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div
                  className={`canvas-node-label ${
                    !node.label ? "placeholder" : ""
                  }`}
                >
                  {node.label || UI_STRINGS.dashboard.canvas.enterText}
                </div>
                <div className="canvas-node-desc">{node.desc}</div>
              </>
            )}

            <button
              className="canvas-node-delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(idx);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title={UI_STRINGS.dashboard.canvas.delete}
            >
              ×
            </button>

            {/* Port dots - visible on hover or when selected */}
            {(hoveredNodeIdx === idx || selectedNodes.includes(idx)) && (
              <>
                <div
                  className="canvas-node-port port-top"
                  onClick={(e) => handlePortClick(idx, "top", e)}
                  title={UI_STRINGS.dashboard.canvas.topPort}
                />
                <div
                  className="canvas-node-port port-right"
                  onClick={(e) => handlePortClick(idx, "right", e)}
                  title={UI_STRINGS.dashboard.canvas.rightPort}
                />
                <div
                  className="canvas-node-port port-bottom"
                  onClick={(e) => handlePortClick(idx, "bottom", e)}
                  title={UI_STRINGS.dashboard.canvas.bottomPort}
                />
                <div
                  className="canvas-node-port port-left"
                  onClick={(e) => handlePortClick(idx, "left", e)}
                  title={UI_STRINGS.dashboard.canvas.leftPort}
                />
              </>
            )}
          </div>
        ))}
      </div>

      <Selecto
        boundContainer={boundingContainerRef.current}
        container={canvasRef}
        selectableTargets={[".selecto-node"]}
        hitRate={0}
        selectByClick={false}
        selectFromInside={false}
        toggleContinueSelect={["shift", "ctrl", "meta"]}
        onSelect={(e) => {
          const selected = e.selected.map((el) =>
            Number(el.getAttribute("data-idx")),
          );
          if (!isKeyboardNavigation) {
            setSelectedNodes(selected);
          }
        }}
        enabled={true}
      />
      <div className="canvas-zoom-controls">
        <button onClick={() => setZoom((z) => Math.max(0.2, z - 0.1))}>
          -
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}>
          +
        </button>
      </div>
    </div>
  );
} // ← FIN Canvas

// =============================
//  BlinkingRedLine
// =============================
function BlinkingRedLine({ from, to }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => setVisible((v) => !v), 150);
    return () => clearInterval(interval);
  }, []);
  if (!from || !to) return null;
  return visible ? (
    <line
      x1={from.x + 60}
      y1={from.y + 20}
      x2={to.x + 60}
      y2={to.y + 20}
      style={{ stroke: "var(--kk-status-changes-fg)" }}
      strokeWidth="5"
      strokeDasharray="10,6"
      opacity={0.8}
    />
  ) : null;
}
