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

  test("renders default session-expired title and message when title and message are omitted", () => {
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
    // Cancel button should not be rendered when onCancel is not passed
    expect(screen.queryByText(S.cancelar)).toBeNull();
  });

  test("renders custom title, custom message, and Cancel button when props are provided", () => {
    const onCancel = jest.fn();
    render(
      <UnsavedChangesModal
        open={true}
        title={S.nuevoFlujoTitulo}
        message={S.nuevoFlujoMensaje}
        onSave={jest.fn()}
        onDiscard={jest.fn()}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText(S.nuevoFlujoTitulo)).toBeInTheDocument();
    expect(screen.getByText(S.nuevoFlujoMensaje)).toBeInTheDocument();
    expect(screen.queryByText(S.suSesionHaExpirado)).toBeNull();
    expect(screen.getByText(S.cancelar)).toBeInTheDocument();

    fireEvent.click(screen.getByText(S.cancelar));
    expect(onCancel).toHaveBeenCalledTimes(1);
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
        isSaving={true}
      />,
    );

    expect(screen.getByText(S.guardando)).toBeInTheDocument();
    expect(screen.getByText(S.guardandoSusCambios)).toBeInTheDocument();

    const saveBtn = screen.getByText(S.guardando).closest("button");
    const discardBtn = screen.getByText(S.descartarCambios);
    const cancelBtn = screen.getByText(S.cancelar);

    expect(saveBtn).toBeDisabled();
    expect(discardBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
  });
});
