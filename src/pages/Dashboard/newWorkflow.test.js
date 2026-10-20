import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./Dashboard";
import { ThemeProvider } from "../../theme/ThemeContext";
import { UI_STRINGS } from "../../constants/uiStrings";
import * as workflowsApi from "../../backend/workflowsApi";
import * as definitionsApi from "../../backend/definitionsApi";
import * as authApi from "../../backend/authApi";

jest.mock("../../backend/supabaseClient", () => ({ supabase: {} }));
jest.mock("../../backend/authApi", () => ({
  onSessionChange: jest.fn(() => () => {}),
  signOut: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../backend/workflowsApi");
jest.mock("../../backend/definitionsApi");
jest.mock("react-selecto", () => () => null);

const M = UI_STRINGS.dashboard.menuBar;
const P = UI_STRINGS.dashboard.page;
const U = UI_STRINGS.dashboard.unsavedChangesModal;
const S = UI_STRINGS.dashboard.saveWorkflowModal;
const C = UI_STRINGS.dashboard.checkoutModal;

const mockDesignerUser = { uid: "user-designer-1", email: "designer@example.com" };
const mockDesignerRoles = { designer: true, reviewer: false, deployer: false };

describe("File -> New workflow and unsaved changes guard", () => {
  let sampleWorkflowDraft;
  let sampleWorkflowApproved;
  let sampleWorkflowPending;
  let activeSubscriptions;

  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
    activeSubscriptions = new Map();

    sampleWorkflowDraft = {
      id: "wf-1",
      name: "Workflow 1 Draft",
      content: {
        nodes: [
          { id: "begin", type: "start", label: "Begin", x: 100, y: 100 },
          { id: "step1", type: "Procedure Phase", label: "Mixing", x: 200, y: 100 },
          { id: "end", type: "end", label: "End", x: 300, y: 100 },
        ],
        connections: [
          { id: "c1", from: "begin", to: "step1" },
          { id: "c2", from: "step1", to: "end" },
        ],
      },
      metadata: {
        status: "draft",
        version: 1,
        designerIds: ["user-designer-1"],
        history: [],
      },
    };

    sampleWorkflowApproved = {
      id: "wf-approved",
      name: "Workflow Approved",
      content: {
        nodes: [
          { id: "begin", type: "start", label: "Begin", x: 100, y: 100 },
          { id: "end", type: "end", label: "End", x: 300, y: 100 },
        ],
        connections: [{ id: "c1", from: "begin", to: "end" }],
      },
      metadata: {
        status: "approved",
        version: 2,
        designerIds: ["user-designer-1"],
        history: [],
      },
    };

    sampleWorkflowPending = {
      id: "wf-pending",
      name: "Workflow Pending",
      content: {
        nodes: [
          { id: "begin", type: "start", label: "Begin", x: 100, y: 100 },
          { id: "end", type: "end", label: "End", x: 300, y: 100 },
        ],
        connections: [{ id: "c1", from: "begin", to: "end" }],
      },
      metadata: {
        status: "pending_review",
        version: 1,
        designerIds: ["user-designer-1"],
        history: [],
      },
    };

    workflowsApi.listMyWorkflows.mockResolvedValue([
      sampleWorkflowDraft,
      sampleWorkflowApproved,
      sampleWorkflowPending,
    ]);

    workflowsApi.getWorkflow.mockImplementation(async (id) => {
      if (id === "wf-1") return sampleWorkflowDraft;
      if (id === "wf-approved") return sampleWorkflowApproved;
      if (id === "wf-pending") return sampleWorkflowPending;
      return null;
    });

    workflowsApi.subscribeToWorkflow.mockImplementation((id, callback) => {
      activeSubscriptions.set(id, callback);
      if (id === "wf-1") callback(sampleWorkflowDraft);
      if (id === "wf-approved") callback(sampleWorkflowApproved);
      if (id === "wf-pending") callback(sampleWorkflowPending);
      return () => {
        activeSubscriptions.delete(id);
      };
    });

    workflowsApi.saveWorkflow.mockResolvedValue({ id: "saved-id" });
    workflowsApi.createWorkflow.mockResolvedValue("new-wf-created-id");
    workflowsApi.listUsers.mockResolvedValue([]);

    definitionsApi.subscribeToDefinitions.mockImplementation((cb) => {
      cb([]);
      return () => {};
    });
    definitionsApi.buildDefinitionTree.mockReturnValue([]);
    definitionsApi.visibleRows.mockReturnValue([]);
  });

  const renderDashboard = (user = mockDesignerUser, userRoles = mockDesignerRoles) => {
    return render(
      <MemoryRouter>
        <ThemeProvider>
          <App user={user} userRoles={userRoles} />
        </ThemeProvider>
      </MemoryRouter>,
    );
  };

  const getWorkflowTitle = (container) =>
    container.querySelector(".center-section h2")?.textContent;

  const openWorkflowViaModal = async (container, workflowName) => {
    // Click File menu
    fireEvent.click(screen.getByText(M.menuLabels.File));
    // Click Open
    fireEvent.click(screen.getByText(M.menuLabels.Open));
    // Wait for Open modal to display workflow list
    await waitFor(() => {
      expect(screen.getByText(workflowName)).toBeInTheDocument();
    });
    // Click the workflow item
    fireEvent.click(screen.getByText(workflowName));
    await waitFor(() => {
      expect(getWorkflowTitle(container)).toBe(workflowName);
    });
  };

  const pickFileMenu = (optionName) => {
    fireEvent.click(screen.getByText(M.menuLabels.File));
    fireEvent.click(screen.getByText(optionName));
  };

  // An opened workflow is read-only until checkout, so edits need File -> Checkout first.
  const checkoutOpenWorkflow = async () => {
    pickFileMenu(M.menuLabels.Checkout);
    fireEvent.change(
      screen.getByPlaceholderText(C.describeYourChangesHere),
      { target: { value: "Edit before New" } },
    );
    fireEvent.click(screen.getByRole("button", { name: C.checkout }));
    await waitFor(() => {
      expect(workflowsApi.checkoutWorkflow).toHaveBeenCalledWith(
        "wf-1",
        "Edit before New",
      );
    });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(C.describeYourChangesHere)).toBeNull();
    });
  };

  // --- Positive Scenarios ---

  test("Open draft W1, New, Save, enter 'W2' creates a new workflow and leaves W1 untouched", async () => {
    const { container } = renderDashboard();

    // 1. Open W1
    await openWorkflowViaModal(container, sampleWorkflowDraft.name);

    // 2. Pick File -> New
    pickFileMenu(M.menuLabels.New);

    // Header updates to unsavedWorkflowTitle
    expect(getWorkflowTitle(container)).toBe(P.unsavedWorkflowTitle);

    // 3. Pick File -> Save
    pickFileMenu(M.menuLabels.Save);

    // Name dialog opens
    expect(screen.getByText(S.guardarFlujoDeTrabajo)).toBeInTheDocument();

    // Enter "W2" and click Save
    const input = screen.getByPlaceholderText(S.ejProcesoDeEnsamblajeV1);
    fireEvent.change(input, { target: { value: "W2" } });
    fireEvent.click(screen.getByText(S.guardar));

    // Verify createWorkflow was called with name "W2"
    await waitFor(() => {
      expect(workflowsApi.createWorkflow).toHaveBeenCalledTimes(1);
    });
    expect(workflowsApi.createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "W2",
      }),
    );

    // Invariant: saveWorkflow must NOT have been called on W1!
    expect(workflowsApi.saveWorkflow).not.toHaveBeenCalled();
  });

  test("After New, title reads 'New Workflow(Without save)', Share and Review are hidden, File has no Checkout or Version History", async () => {
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowDraft.name);

    // Before New: Share button is visible for designer
    expect(screen.getByText(M.workflowActions)).toBeInTheDocument();

    // Pick File -> New
    pickFileMenu(M.menuLabels.New);

    // Title reads "New Workflow(Without save)"
    expect(getWorkflowTitle(container)).toBe(P.unsavedWorkflowTitle);

    // Share and Review buttons are hidden
    expect(screen.queryByText(M.workflowActions)).toBeNull();
    expect(screen.queryByText(M.reviewWorkflow)).toBeNull();

    // File menu has no Checkout or Version History
    fireEvent.click(screen.getByText(M.menuLabels.File));
    expect(screen.queryByText(M.menuLabels.Checkout)).toBeNull();
    expect(screen.queryByText(M.menuLabels["Version History"])).toBeNull();
  });

  test("New with no prior workflow starts editable default canvas with unsaved title", () => {
    const { container } = renderDashboard();

    expect(getWorkflowTitle(container)).toBe(P.unsavedWorkflowTitle);
    expect(screen.queryByText(M.workflowActions)).toBeNull();

    // Pick File -> New
    pickFileMenu(M.menuLabels.New);

    expect(getWorkflowTitle(container)).toBe(P.unsavedWorkflowTitle);
  });

  test("Open W1, New, Save As creates a new workflow via the name modal", async () => {
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowDraft.name);

    pickFileMenu(M.menuLabels.New);
    pickFileMenu(M.menuLabels["Save As"]);

    expect(screen.getByText(S.guardarFlujoDeTrabajo)).toBeInTheDocument();
    const input = screen.getByPlaceholderText(S.ejProcesoDeEnsamblajeV1);
    fireEvent.change(input, { target: { value: "Copy Workflow" } });
    fireEvent.click(screen.getByText(S.guardar));

    await waitFor(() => {
      expect(workflowsApi.createWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Copy Workflow" }),
      );
    });
    expect(workflowsApi.saveWorkflow).not.toHaveBeenCalled();
  });

  test("Open W1, New, then Open W1 again loads W1 read-only with its saved nodes and connections", async () => {
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowDraft.name);
    pickFileMenu(M.menuLabels.New);

    expect(getWorkflowTitle(container)).toBe(P.unsavedWorkflowTitle);

    await openWorkflowViaModal(container, sampleWorkflowDraft.name);
    expect(getWorkflowTitle(container)).toBe(sampleWorkflowDraft.name);
  });

  // --- Negative Scenarios ---

  test("Negative: Non-designer picks New, then Save shows permission alert and makes no API call", () => {
    const nonDesigner = { uid: "user-2", email: "viewer@example.com" };
    const nonDesignerRoles = { designer: false, reviewer: false, deployer: false };
    renderDashboard(nonDesigner, nonDesignerRoles);

    pickFileMenu(M.menuLabels.New);
    pickFileMenu(M.menuLabels.Save);

    expect(window.alert).toHaveBeenCalledWith(
      M.alerts.accionNoPermitida,
    );
    expect(workflowsApi.createWorkflow).not.toHaveBeenCalled();
    expect(workflowsApi.saveWorkflow).not.toHaveBeenCalled();
  });

  test("Negative: Open approved W1, New gives an editable canvas and isWorkflowReadOnly false", async () => {
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowApproved.name);

    pickFileMenu(M.menuLabels.New);

    // Canvas should now be editable, title unsavedWorkflowTitle
    expect(getWorkflowTitle(container)).toBe(P.unsavedWorkflowTitle);

    // Picking Save should open name dialog, not "cannot edit" alert
    pickFileMenu(M.menuLabels.Save);
    expect(screen.getByText(S.guardarFlujoDeTrabajo)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalledWith(
      expect.stringContaining("cannot edit"),
    );
  });

  test("Negative: Open pending_review W1, New, Save opens name dialog rather than 'cannot edit' alert", async () => {
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowPending.name);

    pickFileMenu(M.menuLabels.New);
    pickFileMenu(M.menuLabels.Save);

    expect(screen.getByText(S.guardarFlujoDeTrabajo)).toBeInTheDocument();
  });

  // --- Edge Scenarios ---

  test("Edge: New twice in a row leaves same state as once", () => {
    const { container } = renderDashboard();

    pickFileMenu(M.menuLabels.New);
    pickFileMenu(M.menuLabels.New);

    expect(getWorkflowTitle(container)).toBe(P.unsavedWorkflowTitle);
    expect(screen.queryByText(U.newWorkflowTitle)).toBeNull();
  });

  test("Edge: Realtime update to W1 after New is ignored because subscription closed", async () => {
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowDraft.name);
    expect(activeSubscriptions.has("wf-1")).toBe(true);

    pickFileMenu(M.menuLabels.New);

    // Subscription to wf-1 must be unsubscribed
    expect(activeSubscriptions.has("wf-1")).toBe(false);

    expect(getWorkflowTitle(container)).toBe(P.unsavedWorkflowTitle);
  });

  // --- Unsaved-changes Guard ---

  test("Unsaved-changes guard: Edit W1, New, Discard changes resets to default canvas without saving W1", async () => {
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowDraft.name);
    await checkoutOpenWorkflow();

    // Simulate canvas drop to make dirty
    const canvas = container.querySelector(".canvas-area");
    window._dragComponent = { label: "Mixing", type: "Procedure Phase" };
    fireEvent.drop(canvas, { clientX: 150, clientY: 150 });

    // Pick File -> New
    pickFileMenu(M.menuLabels.New);

    // Unsaved changes prompt must appear with context-specific title & message
    expect(screen.getByText(U.newWorkflowTitle)).toBeInTheDocument();
    expect(screen.getByText(U.newWorkflowMessage)).toBeInTheDocument();
    expect(document.querySelector(".unsaved-changes-modal .btn-secondary")).toBeInTheDocument();

    // Click Discard changes
    fireEvent.click(screen.getByText(U.descartarCambios));

    // Must reset to default canvas and unsaved title
    expect(getWorkflowTitle(container)).toBe(P.unsavedWorkflowTitle);
    expect(workflowsApi.saveWorkflow).not.toHaveBeenCalled();
  });

  test("Unsaved-changes guard: Edit W1, New, Save now updates W1 then resets to blank canvas", async () => {
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowDraft.name);
    await checkoutOpenWorkflow();

    // Make canvas dirty
    const canvas = container.querySelector(".canvas-area");
    window._dragComponent = { label: "Mixing", type: "Procedure Phase" };
    fireEvent.drop(canvas, { clientX: 150, clientY: 150 });

    pickFileMenu(M.menuLabels.New);

    expect(screen.getByText(U.newWorkflowTitle)).toBeInTheDocument();

    // Click Save now
    fireEvent.click(screen.getByText(U.guardarAhora));

    // Must call saveWorkflow on W1
    await waitFor(() => {
      expect(workflowsApi.saveWorkflow).toHaveBeenCalledWith(
        "wf-1",
        expect.any(Object),
      );
    });

    // Afterwards, resets to new blank canvas with no current workflow
    await waitFor(() => {
      expect(getWorkflowTitle(container)).toBe(P.unsavedWorkflowTitle);
    });
  });

  test("Unsaved-changes guard: Edit unsaved canvas, New, Save now, name it creates workflow then resets", async () => {
    const { container } = renderDashboard();

    // Unsaved canvas: make dirty
    const canvas = container.querySelector(".canvas-area");
    window._dragComponent = { label: "Mixing", type: "Procedure Phase" };
    fireEvent.drop(canvas, { clientX: 150, clientY: 150 });

    pickFileMenu(M.menuLabels.New);

    // Prompt appears
    expect(screen.getByText(U.newWorkflowTitle)).toBeInTheDocument();

    // Click Save now -> opens name dialog because currentWorkflowId is null
    fireEvent.click(screen.getByText(U.guardarAhora));

    expect(screen.getByText(S.guardarFlujoDeTrabajo)).toBeInTheDocument();
    const input = screen.getByPlaceholderText(S.ejProcesoDeEnsamblajeV1);
    fireEvent.change(input, { target: { value: "Saved Before New" } });
    fireEvent.click(screen.getByText(S.guardar));

    await waitFor(() => {
      expect(workflowsApi.createWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Saved Before New" }),
      );
    });

    // Resets to new blank canvas
    await waitFor(() => {
      expect(getWorkflowTitle(container)).toBe(P.unsavedWorkflowTitle);
    });
  });

  test("Unsaved-changes guard: Edit W1, New, Cancel keeps edits and stays on W1", async () => {
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowDraft.name);
    await checkoutOpenWorkflow();

    const canvas = container.querySelector(".canvas-area");
    window._dragComponent = { label: "Mixing", type: "Procedure Phase" };
    fireEvent.drop(canvas, { clientX: 150, clientY: 150 });

    pickFileMenu(M.menuLabels.New);

    expect(screen.getByText(U.newWorkflowTitle)).toBeInTheDocument();

    // Click Cancel in unsaved changes modal
    const cancelBtn = document.querySelector(".unsaved-changes-modal .btn-secondary");
    fireEvent.click(cancelBtn);

    // Stays on W1
    expect(getWorkflowTitle(container)).toBe(sampleWorkflowDraft.name);
    expect(workflowsApi.saveWorkflow).not.toHaveBeenCalled();
    expect(workflowsApi.createWorkflow).not.toHaveBeenCalled();
  });

  test("Unsaved-changes guard: Edit unsaved canvas, New, Save now, cancel name dialog keeps edits without reset", () => {
    const { container } = renderDashboard();

    const canvas = container.querySelector(".canvas-area");
    window._dragComponent = { label: "Mixing", type: "Procedure Phase" };
    fireEvent.drop(canvas, { clientX: 150, clientY: 150 });

    pickFileMenu(M.menuLabels.New);
    fireEvent.click(screen.getByText(U.guardarAhora));

    // Cancel name dialog
    fireEvent.click(screen.getByText(S.cancelar));

    // Edits are kept, not reset
    expect(workflowsApi.createWorkflow).not.toHaveBeenCalled();
    expect(screen.queryByText(S.guardarFlujoDeTrabajo)).toBeNull();
  });

  test("Unsaved-changes guard: Edit W1, New, Save now fails displays error and does not reset", async () => {
    workflowsApi.saveWorkflow.mockRejectedValueOnce(new Error("Network DB error"));
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowDraft.name);
    await checkoutOpenWorkflow();

    const canvas = container.querySelector(".canvas-area");
    window._dragComponent = { label: "Mixing", type: "Procedure Phase" };
    fireEvent.drop(canvas, { clientX: 150, clientY: 150 });

    pickFileMenu(M.menuLabels.New);
    fireEvent.click(screen.getByText(U.guardarAhora));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining("Network DB error"),
      );
    });

    // Still on W1, no reset
    expect(getWorkflowTitle(container)).toBe(sampleWorkflowDraft.name);
  });

  test("Session expiry guard: Save now fails keeps the user signed in with the prompt open", async () => {
    workflowsApi.saveWorkflow.mockRejectedValueOnce(new Error("Network DB error"));
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowDraft.name);
    await checkoutOpenWorkflow();

    const canvas = container.querySelector(".canvas-area");
    window._dragComponent = { label: "Mixing", type: "Procedure Phase" };
    fireEvent.drop(canvas, { clientX: 150, clientY: 150 });

    // The session ends while the canvas has unsaved edits.
    const onSession = authApi.onSessionChange.mock.calls.at(-1)[0];
    act(() => onSession(null));
    expect(screen.getByText(U.suSesionHaExpirado)).toBeInTheDocument();

    fireEvent.click(screen.getByText(U.guardarAhora));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining("Network DB error"),
      );
    });
    // Not signed out: the prompt stays so the user can retry or discard.
    expect(authApi.signOut).not.toHaveBeenCalled();
    expect(screen.getByText(U.suSesionHaExpirado)).toBeInTheDocument();
  });

  test("Session expiry guard: Save now succeeds saves W1 then signs out", async () => {
    const { container } = renderDashboard();

    await openWorkflowViaModal(container, sampleWorkflowDraft.name);
    await checkoutOpenWorkflow();

    const canvas = container.querySelector(".canvas-area");
    window._dragComponent = { label: "Mixing", type: "Procedure Phase" };
    fireEvent.drop(canvas, { clientX: 150, clientY: 150 });

    const onSession = authApi.onSessionChange.mock.calls.at(-1)[0];
    act(() => onSession(null));
    fireEvent.click(screen.getByText(U.guardarAhora));

    await waitFor(() => {
      expect(workflowsApi.saveWorkflow).toHaveBeenCalledWith(
        "wf-1",
        expect.any(Object),
      );
    });
    await waitFor(() => expect(authApi.signOut).toHaveBeenCalledTimes(1));
  });
});
