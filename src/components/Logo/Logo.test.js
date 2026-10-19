import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UI_STRINGS } from "../../constants/uiStrings";
import Logo from "./Logo";

const S = UI_STRINGS.components.logo;

describe("Logo", () => {
  describe("positive", () => {
    test("shows the mark and the name; the mark is decorative", () => {
      const { container } = render(<Logo />);
      expect(screen.getByText(S.name)).toBeInTheDocument();
      const img = container.querySelector("img");
      expect(img).toHaveAttribute("alt", "");
      expect(img.getAttribute("src")).toMatch(/\/brand\/kukulcan-mark\.svg$/);
    });

    test("with `to` it is a link to that route with an accessible name", () => {
      render(
        <MemoryRouter>
          <Logo size="sm" to="/" />
        </MemoryRouter>,
      );
      const link = screen.getByRole("link", { name: S.homeLink });
      expect(link).toHaveAttribute("href", "/");
    });

    test("size lg gets the large modifier class", () => {
      const { container } = render(<Logo size="lg" />);
      expect(container.firstChild).toHaveClass("kk-logo", "kk-logo--lg");
    });
  });

  describe("negative", () => {
    test("if the mark fails to load it is hidden and the name stays", () => {
      const { container } = render(<Logo />);
      fireEvent.error(container.querySelector("img"));
      expect(container.querySelector("img")).toBeNull();
      expect(screen.getByText(S.name)).toBeInTheDocument();
    });

    test("without `to` it is not a link", () => {
      render(<Logo />);
      expect(screen.queryByRole("link")).toBeNull();
    });
  });

  describe("edge", () => {
    test("an unknown size falls back to sm", () => {
      const { container } = render(<Logo size="xl" />);
      expect(container.firstChild).toHaveClass("kk-logo--sm");
    });
  });
});
