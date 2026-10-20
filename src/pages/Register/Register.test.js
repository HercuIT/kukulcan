import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { resendConfirmation, signUp } from "../../backend/authApi";
import { UI_STRINGS } from "../../constants/uiStrings";
import Register from "./Register";

jest.mock("../../backend/authApi", () => ({
  signUp: jest.fn(),
  resendConfirmation: jest.fn(),
}));

const S = UI_STRINGS.register;
const appError = (code) => Object.assign(new Error(code), { code });

function renderRegister() {
  render(
    <MemoryRouter initialEntries={["/register"]}>
      <Register />
    </MemoryRouter>,
  );
  const field = (label) => screen.getByLabelText(label, { selector: "input" });
  const type = (label, value) =>
    fireEvent.change(field(label), { target: { value } });
  const fill = (email, password, confirm = password) => {
    type(S.email, email);
    type(S.password, password);
    type(S.confirmPassword, confirm);
  };
  const submit = () =>
    fireEvent.click(screen.getByRole("button", { name: S.submit }));
  return { field, type, fill, submit };
}

const ruleItem = (label) => screen.getByText(label).closest("li");

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("Register", () => {
  describe("positive", () => {
    test("a valid form signs up once with the lowercased email and shows 'Check your email'", async () => {
      signUp.mockResolvedValue({ uid: "u-1" });
      const { fill, submit } = renderRegister();
      fill("Ana@Empresa.COM", "Planta2026");
      submit();
      expect(
        await screen.findByRole("heading", { name: S.checkEmail.title }),
      ).toBeInTheDocument();
      expect(signUp).toHaveBeenCalledTimes(1);
      expect(signUp).toHaveBeenCalledWith("ana@empresa.com", "Planta2026");
      expect(
        screen.getByText(S.checkEmail.body("ana@empresa.com")),
      ).toBeInTheDocument();
    });

    test("the checklist ticks each rule as it's met", () => {
      const { type } = renderRegister();
      const length = S.rules.length(8, 72);
      expect(ruleItem(length)).toHaveAttribute("data-met", "false");
      type(S.password, "a");
      expect(ruleItem(S.rules.letter)).toHaveAttribute("data-met", "true");
      expect(ruleItem(S.rules.digit)).toHaveAttribute("data-met", "false");
      type(S.password, "abcdefg1");
      expect(ruleItem(length)).toHaveAttribute("data-met", "true");
      expect(ruleItem(S.rules.digit)).toHaveAttribute("data-met", "true");
    });

    test("pressing Enter in the last field submits", async () => {
      signUp.mockResolvedValue({});
      const { fill, field } = renderRegister();
      fill("ana@empresa.com", "Planta2026");
      fireEvent.submit(field(S.confirmPassword));
      await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    });

    test("resend from 'Check your email' sends again; 'Use a different email' goes back", async () => {
      signUp.mockResolvedValue({});
      resendConfirmation.mockResolvedValue();
      jest.useFakeTimers();
      const { fill, submit } = renderRegister();
      fill("ana@empresa.com", "Planta2026");
      await act(async () => submit());
      const waiting = screen.getByRole("button", {
        name: S.checkEmail.resendIn(60),
      });
      expect(waiting).toBeDisabled();
      for (let i = 0; i < 60; i++) act(() => jest.advanceTimersByTime(1000));
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: S.checkEmail.resend }),
        );
      });
      expect(resendConfirmation).toHaveBeenCalledWith("ana@empresa.com");
      expect(screen.getByText(S.checkEmail.resent)).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: S.checkEmail.changeEmail }),
      );
      expect(screen.getByRole("heading", { name: S.title })).toBeInTheDocument();
    });

    test("the show/hide toggle reveals the password", () => {
      const { field } = renderRegister();
      expect(field(S.password)).toHaveAttribute("type", "password");
      fireEvent.click(screen.getAllByRole("button", { name: S.showPassword })[0]);
      expect(field(S.password)).toHaveAttribute("type", "text");
      expect(
        screen.getByRole("button", { name: S.hidePassword }),
      ).toBeInTheDocument();
    });
  });

  describe("negative", () => {
    test("empty or malformed email shows its error under the field, focuses it, and sends nothing", () => {
      const { fill, submit, field, type } = renderRegister();
      fill("", "Planta2026");
      submit();
      expect(screen.getByText(S.errors.emailRequired)).toBeInTheDocument();
      expect(field(S.email)).toHaveFocus();
      expect(field(S.email)).toHaveAttribute(
        "aria-describedby",
        "register-email-error",
      );
      type(S.email, "ana@");
      submit();
      expect(screen.getByText(S.errors.emailInvalid)).toBeInTheDocument();
      expect(signUp).not.toHaveBeenCalled();
    });

    test("passwords breaking a rule are rejected, with the failed rule unticked", () => {
      const { fill, submit } = renderRegister();
      fill("ana@empresa.com", "abcdefgh");
      submit();
      expect(screen.getByText(S.errors.passwordRules)).toBeInTheDocument();
      expect(ruleItem(S.rules.digit)).toHaveAttribute("data-met", "false");
      fill("ana@empresa.com", "1234567");
      submit();
      expect(ruleItem(S.rules.length(8, 72))).toHaveAttribute(
        "data-met",
        "false",
      );
      expect(signUp).not.toHaveBeenCalled();
    });

    test("a different confirmation is rejected", () => {
      const { fill, submit } = renderRegister();
      fill("ana@empresa.com", "Planta2026", "Planta2027");
      submit();
      expect(screen.getByText(S.errors.mismatch)).toBeInTheDocument();
      expect(signUp).not.toHaveBeenCalled();
    });

    test("errors show on blur, before submitting", () => {
      const { field, type } = renderRegister();
      type(S.email, "nope");
      fireEvent.blur(field(S.email));
      expect(screen.getByText(S.errors.emailInvalid)).toBeInTheDocument();
      type(S.email, "ana@empresa.com");
      expect(screen.queryByText(S.errors.emailInvalid)).toBeNull();
    });

    test("rate limiting and other failures show their message and keep the email", async () => {
      const { fill, submit, field } = renderRegister();
      signUp.mockRejectedValueOnce(appError("rate-limited"));
      fill("ana@empresa.com", "Planta2026");
      submit();
      expect(await screen.findByText(S.errors.rateLimited)).toBeInTheDocument();
      expect(field(S.email)).toHaveValue("ana@empresa.com");
      signUp.mockRejectedValueOnce(new Error("network"));
      submit();
      expect(await screen.findByText(S.errors.generic)).toBeInTheDocument();
    });

    test("Supabase's weak-password error lands on the password field", async () => {
      signUp.mockRejectedValue(appError("weak-password"));
      const { fill, submit } = renderRegister();
      fill("ana@empresa.com", "Planta2026");
      submit();
      expect(await screen.findByText(S.errors.passwordRules)).toBeInTheDocument();
    });
  });

  describe("edge", () => {
    test("a 72-character password is accepted, 73 is rejected", async () => {
      signUp.mockResolvedValue({});
      const { fill, submit } = renderRegister();
      fill("ana@empresa.com", `a1${"x".repeat(71)}`);
      submit();
      expect(screen.getByText(S.errors.passwordRules)).toBeInTheDocument();
      const ok = `a1${"x".repeat(70)}`;
      fill("ana@empresa.com", ok);
      submit();
      await waitFor(() =>
        expect(signUp).toHaveBeenCalledWith("ana@empresa.com", ok),
      );
    });

    test("a double click sends one request and the button shows 'Creating account…'", async () => {
      let finish;
      signUp.mockImplementation(
        () => new Promise((resolve) => (finish = resolve)),
      );
      const { fill } = renderRegister();
      fill("ana@empresa.com", "Planta2026");
      const button = screen.getByRole("button", { name: S.submit });
      fireEvent.click(button);
      fireEvent.click(button);
      const busy = screen.getByRole("button", { name: S.submitting });
      expect(busy).toBeDisabled();
      expect(signUp).toHaveBeenCalledTimes(1);
      await act(async () => finish({}));
    });

    test("an already registered address gets the same 'Check your email' screen", async () => {
      // Con la confirmación activa Supabase responde igual (sin error) para no revelar la cuenta.
      signUp.mockResolvedValue({ uid: "fake", email: "taken@empresa.com" });
      const { fill, submit } = renderRegister();
      fill("taken@empresa.com", "Planta2026");
      submit();
      expect(
        await screen.findByRole("heading", { name: S.checkEmail.title }),
      ).toBeInTheDocument();
    });
  });
});
