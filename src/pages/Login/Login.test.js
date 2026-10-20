import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { resendConfirmation, signIn } from "../../backend/authApi";
import { UI_STRINGS } from "../../constants/uiStrings";
import Login from "./Login";

jest.mock("../../backend/authApi", () => ({
  signIn: jest.fn(),
  resendConfirmation: jest.fn(),
}));

const S = UI_STRINGS.login;

function renderLogin() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<div data-testid="register" />} />
      </Routes>
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

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Login", () => {
  describe("positive", () => {
    test("renders its labels from UI_STRINGS, with a link to create an account instead of a Register button", () => {
      renderLogin();
      expect(
        screen.getByRole("heading", { name: S.iniciarSesion }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: S.createAccount }),
      ).toHaveAttribute("href", "/register");
      expect(screen.getByText(S.noAccount, { exact: false })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: S.saltarDev }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole("button")).toHaveLength(2);
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

    test("pressing Enter in the password field submits the form", async () => {
      signIn.mockResolvedValue({ uid: "u-1" });
      const { type } = renderLogin();
      type(S.correoElectronico, "designer@example.com");
      type(S.contrasena, "secret");
      fireEvent.submit(screen.getByPlaceholderText(S.contrasena));
      await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    });

    test("the create-account link opens /register", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("link", { name: S.createAccount }));
      expect(screen.getByTestId("register")).toBeInTheDocument();
    });

    test("an unconfirmed account can resend the confirmation email", async () => {
      signIn.mockRejectedValue(appError("email-not-confirmed"));
      resendConfirmation.mockResolvedValue();
      const { type } = renderLogin();
      type(S.correoElectronico, "  New@Example.com ");
      type(S.contrasena, "Planta2026");
      fireEvent.click(screen.getByRole("button", { name: S.iniciarSesion }));
      expect(
        await screen.findByText(S.errors.emailNotConfirmed),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: S.resend }));
      expect(await screen.findByText(S.messages.resent)).toBeInTheDocument();
      expect(resendConfirmation).toHaveBeenCalledWith("new@example.com");
    });
  });

  describe("negative", () => {
    test("wrong credentials show the invalid-credentials message and no resend button", async () => {
      signIn.mockRejectedValue(appError("invalid-credentials"));
      const { type } = renderLogin();
      type(S.correoElectronico, "a@b.c");
      type(S.contrasena, "bad");
      fireEvent.click(screen.getByRole("button", { name: S.iniciarSesion }));
      expect(
        await screen.findByText(S.errors.correoOContrasenaIncorrectosPor),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: S.resend })).toBeNull();
    });

    test("other failures show the generic message", async () => {
      signIn.mockRejectedValue(new Error("network"));
      const { type } = renderLogin();
      type(S.correoElectronico, "a@b.c");
      type(S.contrasena, "pw");
      fireEvent.click(screen.getByRole("button", { name: S.iniciarSesion }));
      expect(
        await screen.findByText(S.errors.ocurrioUnErrorAlIntentar),
      ).toBeInTheDocument();
    });

    test("a rate-limited resend shows the wait message", async () => {
      signIn.mockRejectedValue(appError("email-not-confirmed"));
      resendConfirmation.mockRejectedValue(appError("rate-limited"));
      const { type } = renderLogin();
      type(S.correoElectronico, "a@b.c");
      type(S.contrasena, "pw");
      fireEvent.click(screen.getByRole("button", { name: S.iniciarSesion }));
      fireEvent.click(await screen.findByRole("button", { name: S.resend }));
      expect(await screen.findByText(S.errors.rateLimited)).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    test("empty fields are rejected without calling Supabase", () => {
      renderLogin();
      fireEvent.click(screen.getByRole("button", { name: S.iniciarSesion }));
      expect(
        screen.getByText(S.errors.porFavorCompletaAmbosCampos),
      ).toBeInTheDocument();
      expect(signIn).not.toHaveBeenCalled();
    });

    test("resend is disabled for 60 seconds after sending, then enabled again", async () => {
      jest.useFakeTimers();
      signIn.mockRejectedValue(appError("email-not-confirmed"));
      resendConfirmation.mockResolvedValue();
      const { type } = renderLogin();
      type(S.correoElectronico, "a@b.c");
      type(S.contrasena, "pw");
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: S.iniciarSesion }));
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: S.resend }));
      });
      const waiting = screen.getByRole("button", { name: S.resendIn(60) });
      expect(waiting).toBeDisabled();
      fireEvent.click(waiting);
      expect(resendConfirmation).toHaveBeenCalledTimes(1);
      for (let i = 0; i < 60; i++) {
        act(() => jest.advanceTimersByTime(1000));
      }
      expect(screen.getByRole("button", { name: S.resend })).toBeEnabled();
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
