import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * base-ui's DropdownMenu uses a Portal and floating-ui logic that doesn't
 * play nicely with jsdom (the menu items never end up in the queried tree).
 *
 * For a *unit* test we don't actually care about Floating UI, only about
 * the toggle's behaviour: clicking an item calls setTheme correctly.
 *
 * We therefore replace the primitives with thin wrappers that render every
 * child eagerly. This is the same approach the shadcn docs recommend for
 * RTL — it isolates ThemeToggle's logic from the menu library's mechanics.
 */
vi.mock("@/components/ui/dropdown-menu", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: ({
      children,
      ...rest
    }: { children?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...rest}>{children}</button>
    ),
    DropdownMenuContent: Pass,
    DropdownMenuItem: ({
      children,
      onClick,
      ...rest
    }: { children?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" onClick={onClick} {...rest}>
        {children}
      </button>
    ),
  };
});

const { ThemeToggle } = await import("../ThemeToggle");

function renderToggle(initialTheme?: string) {
  if (initialTheme) {
    window.localStorage.setItem("theme", initialTheme);
  }
  return render(
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="theme"
    >
      <ThemeToggle />
    </NextThemesProvider>,
  );
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    window.localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.className = "";
  });

  it("renders an accessible trigger button", () => {
    renderToggle();
    const trigger = screen.getByRole("button", { name: /toggle theme/i });
    expect(trigger).toBeInTheDocument();
  });

  it("renders all three theme options", () => {
    renderToggle();
    expect(screen.getByTestId("theme-option-light")).toBeInTheDocument();
    expect(screen.getByTestId("theme-option-dark")).toBeInTheDocument();
    expect(screen.getByTestId("theme-option-system")).toBeInTheDocument();
  });

  it("selecting Dark sets the .dark class on <html> and persists", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByTestId("theme-option-dark"));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it("selecting Light removes the .dark class and persists", async () => {
    const user = userEvent.setup();
    renderToggle("dark");

    await user.click(screen.getByTestId("theme-option-light"));

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("selecting System stores 'system' (not the resolved value)", async () => {
    const user = userEvent.setup();
    renderToggle("dark");

    await user.click(screen.getByTestId("theme-option-system"));

    expect(window.localStorage.getItem("theme")).toBe("system");
  });
});
