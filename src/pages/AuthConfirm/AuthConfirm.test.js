import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { StrictMode } from "react";
import { confirmEmail, resendConfirmation } from "../../backend/authApi";
import { UI_STRINGS } from "../../constants/uiStrings";
import AuthConfirm, { readConfirmLink } from "./AuthConfirm";

jest.mock("../../backend/authApi", () => ({
  confirmEmail: jest.fn(),
  resendConfirmation: jest.fn(),
}));

const S = UI_STRINGS.authConfirm;
const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c";
const appError = (code, cause) =>
  Object.assign(new Error(code), { code, cause });

async function renderAt(search, { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[`/auth/confirm${search}`]}>
      <Routes>
        <Route path="/auth/confirm" element={<AuthConfirm />} />
        <Route path="/" element={<div data-testid="login" />} />
      </Routes>
    </MemoryRouter>
  );
  await act(async () => {
    render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  });
}

const typeEmail = (value) =>
  fireEvent.change(screen.getByLabelText(S.email), { target: { value } });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("AuthConfirm", () => {
  describe("positive", () => {
    test("a valid link confirms the account once and says so", async () => {
      confirmEmail.mockResolvedValue();
      await renderAt(`?token_hash=${TOKEN}&type=email`);
      expect(confirmEmail).toHaveBeenCalledWith(TOKEN);
      expect(screen.getByText(S.success)).toBeInTheDocument();
    });

    test("React StrictMode doesn't spend the one-time token twice", async () => {
      confirmEmail.mockResolvedValue();
      await renderAt(`?token_hash=${TOKEN}&type=email`, { strict: true });
      expect(confirmEmail).toHaveBeenCalledTimes(1);
    });

    test("from the expired screen, Resend sends a new link to the typed email", async () => {
      confirmEmail.mockRejectedValue(appError("link-expired"));
      resendConfirmation.mockResolvedValue();
      await renderAt(`?token_hash=${TOKEN}&type=email`);
      expect(screen.getByText(S.errors.expired)).toBeInTheDocument();
      typeEmail(" Ana@Empresa.com ");
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: S.resend }));
      });
      expect(resendConfirmation).toHaveBeenCalledWith("ana@empresa.com");
      expect(screen.getByText(S.resent)).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("an expired or already used link shows the expired message and a way back", async () => {
      confirmEmail.mockRejectedValue(appError("link-expired"));
      await renderAt(`?token_hash=${TOKEN}&type=email`);
      expect(screen.getByText(S.errors.expired)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("link", { name: S.backToLogin }));
      expect(screen.getByTestId("login")).toBeInTheDocument();
    });

    test("a missing or garbage token_hash shows the expired message without calling Supabase", async () => {
      await renderAt("");
      expect(screen.getByText(S.errors.expired)).toBeInTheDocument();
      await renderAt("?token_hash=%3Cscript%3E&type=email");
      expect(confirmEmail).not.toHaveBeenCalled();
    });

    test("a network failure offers Retry, and Retry works", async () => {
      confirmEmail.mockRejectedValueOnce(
        appError("unknown", { name: "AuthRetryableFetchError", status: 0 }),
      );
      confirmEmail.mockResolvedValueOnce();
      await renderAt(`?token_hash=${TOKEN}&type=email`);
      expect(screen.getByText(S.errors.network)).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: S.retry }));
      });
      expect(confirmEmail).toHaveBeenCalledTimes(2);
      expect(screen.getByText(S.success)).toBeInTheDocument();
    });

    test("an invalid email on the expired screen isn't sent", async () => {
      await renderAt("");
      typeEmail("ana@");
      fireEvent.click(screen.getByRole("button", { name: S.resend }));
      expect(screen.getByText(S.errors.emailInvalid)).toBeInTheDocument();
      expect(resendConfirmation).not.toHaveBeenCalled();
    });

    test("a rate-limited resend shows the wait message", async () => {
      resendConfirmation.mockRejectedValue(appError("rate-limited"));
      await renderAt("");
      typeEmail("ana@empresa.com");
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: S.resend }));
      });
      expect(screen.getByText(S.errors.rateLimited)).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    test("Resend clicked again before 60 s does nothing", async () => {
      jest.useFakeTimers();
      resendConfirmation.mockResolvedValue();
      await renderAt("");
      typeEmail("ana@empresa.com");
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: S.resend }));
      });
      const waiting = screen.getByRole("button", { name: S.resendIn(60) });
      expect(waiting).toBeDisabled();
      fireEvent.click(waiting);
      expect(resendConfirmation).toHaveBeenCalledTimes(1);
    });

    test("readConfirmLink accepts email and signup links and rejects other types", () => {
      const p = (s) => new URLSearchParams(s);
      expect(readConfirmLink(p(`token_hash=${TOKEN}&type=email`))).toBe(TOKEN);
      expect(readConfirmLink(p(`token_hash=${TOKEN}&type=signup`))).toBe(
        TOKEN,
      );
      expect(readConfirmLink(p(`token_hash=${TOKEN}`))).toBe(TOKEN);
      expect(readConfirmLink(p(`token_hash=${TOKEN}&type=recovery`))).toBeNull();
      expect(readConfirmLink(p("token_hash=short&type=email"))).toBeNull();
      expect(readConfirmLink(p(`token_hash=${"a".repeat(201)}`))).toBeNull();
    });
  });
});
