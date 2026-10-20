import { render, screen, fireEvent } from "@testing-library/react";
import UnsavedChangesModal from "./UnsavedChangesModal";
import { UI_STRINGS } from "../../constants/uiStrings";

describe("UnsavedChangesModal", () => {
  const S = UI_STRINGS.dashboard.unsavedChangesModal;

  test("does not render when open is false", () => {
    const { container } = render(
      <UnsavedChangesModal
        open={false}
        onSave={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(S.suSesionHaExpirado)).toBeNull();
  });

  test("renders the session-expired title and message by default (reason logout)", () => {
    render(
      <UnsavedChangesModal
        open={true}
        onSave={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );

    expect(screen.getByText(S.suSesionHaExpirado)).toBeInTheDocument();
    expect(screen.getByText(S.haRealizadoCambiosSinGuardar)).toBeInTheDocument();
    expect(
      screen.getByText(S.deseaGuardarlosAntesDeContinuar),
    ).toBeInTheDocument();
    expect(screen.getByText(S.guardarAhora)).toBeInTheDocument();
    expect(screen.getByText(S.descartarCambios)).toBeInTheDocument();
    // Logout has no Cancel: the session is ending
    expect(screen.queryByText(S.cancel)).toBeNull();
  });

  test("reason new renders the new-workflow title, message and Cancel button", () => {
    const onCancel = jest.fn();
    render(
      <UnsavedChangesModal
        open={true}
        reason="new"
        onSave={jest.fn()}
        onDiscard={jest.fn()}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText(S.newWorkflowTitle)).toBeInTheDocument();
    expect(screen.getByText(S.newWorkflowMessage)).toBeInTheDocument();
    expect(screen.queryByText(S.suSesionHaExpirado)).toBeNull();
    expect(screen.getByText(S.cancel)).toBeInTheDocument();

    fireEvent.click(screen.getByText(S.cancel));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("reason logout hides Cancel even when onCancel is passed", () => {
    render(
      <UnsavedChangesModal
        open={true}
        reason="logout"
        onSave={jest.fn()}
        onDiscard={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.queryByText(S.cancel)).toBeNull();
    expect(screen.queryByText(S.newWorkflowTitle)).toBeNull();
  });

  test("calls onSave and onDiscard handlers when buttons are clicked", () => {
    const onSave = jest.fn();
    const onDiscard = jest.fn();

    render(
      <UnsavedChangesModal
        open={true}
        onSave={onSave}
        onDiscard={onDiscard}
      />,
    );

    fireEvent.click(screen.getByText(S.guardarAhora));
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(S.descartarCambios));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  test("disables buttons and shows saving spinner when isSaving is true", () => {
    const onSave = jest.fn();
    const onDiscard = jest.fn();
    const onCancel = jest.fn();

    render(
      <UnsavedChangesModal
        open={true}
        onSave={onSave}
        onDiscard={onDiscard}
        onCancel={onCancel}
        reason="new"
        isSaving={true}
      />,
    );

    expect(screen.getByText(S.guardando)).toBeInTheDocument();
    expect(screen.getByText(S.guardandoSusCambios)).toBeInTheDocument();

    const saveBtn = screen.getByText(S.guardando).closest("button");
    const discardBtn = screen.getByText(S.descartarCambios);
    const cancelBtn = screen.getByText(S.cancel);

    expect(saveBtn).toBeDisabled();
    expect(discardBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
  });
});
