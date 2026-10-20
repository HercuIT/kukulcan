import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { updatePassword } from "../../backend/authApi";
import { UI_STRINGS } from "../../constants/uiStrings";
import SetPassword, { MIN_PASSWORD_LENGTH } from "./SetPassword";

jest.mock("../../backend/authApi", () => ({ updatePassword: jest.fn() }));

const S = UI_STRINGS.setPassword;

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/set-password"]}>
      <Routes>
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/" element={<div data-testid="home">Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const fill = (password, confirm = password) => {
    fireEvent.change(screen.getByLabelText(S.newPassword), {
      target: { value: password },
    });
    fireEvent.change(screen.getByLabelText(S.confirmPassword), {
      target: { value: confirm },
    });
  };
  const save = () =>
    fireEvent.click(screen.getByRole("button", { name: S.save }));
  return { fill, save };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("SetPassword", () => {
  describe("positive", () => {
    test("saves the new password and goes to Home", async () => {
      updatePassword.mockResolvedValue();
      const { fill, save } = renderPage();
      fill("s3cret-pass");
      save();
      expect(await screen.findByTestId("home")).toBeInTheDocument();
      expect(updatePassword).toHaveBeenCalledWith("s3cret-pass");
      expect(window.alert).toHaveBeenCalledWith(S.alerts.success);
    });
  });

  test("positive: pressing Enter in a field submits the form", async () => {
    updatePassword.mockResolvedValue();
    const { fill } = renderPage();
    fill("s3cret-pass");
    fireEvent.submit(screen.getByLabelText(S.confirmPassword).closest("form"));
    await waitFor(() =>
      expect(updatePassword).toHaveBeenCalledWith("s3cret-pass"),
    );
  });

  describe("negative", () => {
    test("mismatched passwords are rejected without calling Supabase", () => {
      const { fill, save } = renderPage();
      fill("s3cret-pass", "other-pass");
      save();
      expect(screen.getByText(S.errors.mismatch)).toBeInTheDocument();
      expect(updatePassword).not.toHaveBeenCalled();
    });

    test("a weak password reported by Supabase shows its message", async () => {
      updatePassword.mockRejectedValue(
        Object.assign(new Error("weak"), { code: "weak-password" }),
      );
      const { fill, save } = renderPage();
      fill("abcdefg1");
      save();
      expect(
        await screen.findByText(S.errors.weakPassword),
      ).toBeInTheDocument();
      expect(updatePassword).toHaveBeenCalledWith("abcdefg1");
    });

    test("a password without a letter or a digit is rejected without calling Supabase (HTE-107 rules)", () => {
      const { fill, save } = renderPage();
      fill("abcdefgh");
      save();
      expect(screen.getByText(S.errors.weakPassword)).toBeInTheDocument();
      fill("12345678");
      save();
      expect(screen.getByText(S.errors.weakPassword)).toBeInTheDocument();
      expect(updatePassword).not.toHaveBeenCalled();
    });

    test("other failures show the generic message and stay on the page", async () => {
      updatePassword.mockRejectedValue(new Error("Auth session missing!"));
      const { fill, save } = renderPage();
      fill("s3cret-pass");
      save();
      expect(await screen.findByText(S.errors.generic)).toBeInTheDocument();
      expect(screen.queryByTestId("home")).not.toBeInTheDocument();
    });
  });

  describe("edge", () => {
    test("empty fields are rejected", () => {
      const { save } = renderPage();
      save();
      expect(screen.getByText(S.errors.missingFields)).toBeInTheDocument();
    });

    test("passwords shorter than the minimum are rejected; exactly the minimum is accepted", async () => {
      updatePassword.mockResolvedValue();
      const { fill, save } = renderPage();
      expect(MIN_PASSWORD_LENGTH).toBe(8);
      const short = `${"a".repeat(MIN_PASSWORD_LENGTH - 2)}1`;
      fill(short);
      save();
      expect(
        screen.getByText(S.errors.tooShort(MIN_PASSWORD_LENGTH)),
      ).toBeInTheDocument();

      const exact = `${"a".repeat(MIN_PASSWORD_LENGTH - 1)}1`;
      fill(exact);
      save();
      await waitFor(() => expect(updatePassword).toHaveBeenCalledWith(exact));
    });
  });
});
