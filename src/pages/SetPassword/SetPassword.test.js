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
    fireEvent.change(screen.getByPlaceholderText(S.newPassword), {
      target: { value: password },
    });
    fireEvent.change(screen.getByPlaceholderText(S.confirmPassword), {
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
      fill("123456");
      save();
      expect(
        await screen.findByText(S.errors.weakPassword),
      ).toBeInTheDocument();
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
      fill("a".repeat(MIN_PASSWORD_LENGTH - 1));
      save();
      expect(
        screen.getByText(S.errors.tooShort(MIN_PASSWORD_LENGTH)),
      ).toBeInTheDocument();

      fill("a".repeat(MIN_PASSWORD_LENGTH));
      save();
      await waitFor(() =>
        expect(updatePassword).toHaveBeenCalledWith(
          "a".repeat(MIN_PASSWORD_LENGTH),
        ),
      );
    });
  });
});
