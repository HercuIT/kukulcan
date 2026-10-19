import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { signIn, signUp } from "../../backend/authApi";
import { UI_STRINGS } from "../../constants/uiStrings";
import Login from "./Login";

jest.mock("../../backend/authApi", () => ({
  signIn: jest.fn(),
  signUp: jest.fn(),
}));

const S = UI_STRINGS.login;

function renderLogin() {
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
  const type = (placeholder, value) =>
    fireEvent.change(screen.getByPlaceholderText(placeholder), {
      target: { value },
    });
  return { type };
}

const appError = (code) => Object.assign(new Error(code), { code });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("Login", () => {
  describe("positive", () => {
    test("renders its labels from UI_STRINGS", () => {
      renderLogin();
      expect(
        screen.getByRole("heading", { name: S.iniciarSesion }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: S.registrar }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: S.saltarDev }),
      ).toBeInTheDocument();
    });

    test("signs in with the typed credentials", async () => {
      signIn.mockResolvedValue({ uid: "u-1" });
      const { type } = renderLogin();
      type(S.correoElectronico, "designer@example.com");
      type(S.contrasena, "secret");
      fireEvent.click(screen.getByRole("button", { name: S.iniciarSesion }));
      await waitFor(() =>
        expect(signIn).toHaveBeenCalledWith("designer@example.com", "secret"),
      );
    });

    test("signs up and confirms the registration", async () => {
      signUp.mockResolvedValue({ uid: "u-2" });
      const { type } = renderLogin();
      type(S.correoElectronico, "new@example.com");
      type(S.contrasena, "secret");
      fireEvent.click(screen.getByRole("button", { name: S.registrar }));
      await waitFor(() =>
        expect(window.alert).toHaveBeenCalledWith(
          S.alerts.usuarioRegistradoConExitoSe,
        ),
      );
    });
  });

  describe("negative", () => {
    test("wrong credentials show the invalid-credentials message", async () => {
      signIn.mockRejectedValue(appError("invalid-credentials"));
      const { type } = renderLogin();
      type(S.correoElectronico, "a@b.c");
      type(S.contrasena, "bad");
      fireEvent.click(screen.getByRole("button", { name: S.iniciarSesion }));
      expect(
        await screen.findByText(S.errors.correoOContrasenaIncorrectosPor),
      ).toBeInTheDocument();
    });

    test("an email already in use shows its message", async () => {
      signUp.mockRejectedValue(appError("email-in-use"));
      const { type } = renderLogin();
      type(S.correoElectronico, "a@b.c");
      type(S.contrasena, "pw");
      fireEvent.click(screen.getByRole("button", { name: S.registrar }));
      expect(
        await screen.findByText(S.errors.esteCorreoElectronicoYaEsta),
      ).toBeInTheDocument();
    });

    test("other failures show the generic messages", async () => {
      signIn.mockRejectedValue(new Error("network"));
      const { type } = renderLogin();
      type(S.correoElectronico, "a@b.c");
      type(S.contrasena, "pw");
      fireEvent.click(screen.getByRole("button", { name: S.iniciarSesion }));
      expect(
        await screen.findByText(S.errors.ocurrioUnErrorAlIntentar),
      ).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    test("empty fields are rejected without calling Supabase", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("button", { name: S.iniciarSesion }));
      fireEvent.click(screen.getByRole("button", { name: S.registrar }));
      expect(
        screen.getByText(S.errors.porFavorCompletaAmbosCampos),
      ).toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
      expect(signUp).not.toHaveBeenCalled();
    });

    test("the dev shortcut signs in with the dev account", async () => {
      signIn.mockRejectedValue(appError("invalid-credentials"));
      renderLogin();
      fireEvent.click(screen.getByRole("button", { name: S.saltarDev }));
      await waitFor(() =>
        expect(signIn).toHaveBeenCalledWith("dev@test.com", "password123"),
      );
      expect(
        await screen.findByText(S.errors.laCuentaDeDesarrolladorNo),
      ).toBeInTheDocument();
    });
  });
});
