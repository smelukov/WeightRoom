import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { CardData } from "@/lib/types";

/**
 * `@base-ui/react/dialog` uses a Portal that ends up outside the queried tree
 * in jsdom. We replace the dialog primitives with pass-through wrappers so
 * the share-modal body renders inline and Testing Library can find it.
 *
 * NOTE: this mock intentionally does NOT honour the `open` prop — we only
 * mount the modal when we want to test it, and the tabs/panels live inside
 * `DialogContent` regardless of open state in our tests.
 */
vi.mock("@/components/ui/dialog", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Dialog: Pass,
    DialogTrigger: Pass,
    DialogPortal: Pass,
    DialogBackdrop: Pass,
    DialogClose: Pass,
    DialogContent: Pass,
    DialogHeader: Pass,
    DialogTitle: ({ children }: { children?: ReactNode }) => (
      <h2>{children}</h2>
    ),
    DialogDescription: ({ children }: { children?: ReactNode }) => (
      <p>{children}</p>
    ),
  };
});

// `qrcode.react` and `html-to-image` are heavy / DOM-dependent. They aren't
// what we're testing here — we care about the modal's tab-switching shell.
vi.mock("qrcode.react", () => ({
  QRCodeSVG: () => <span data-testid="qr" />,
}));

vi.mock("html-to-image", () => ({
  toPng: vi.fn().mockResolvedValue("data:image/png;base64,xxx"),
  toBlob: vi.fn().mockResolvedValue(new Blob(["x"], { type: "image/png" })),
  toSvg: vi.fn().mockResolvedValue("<svg/>"),
}));

const { ShareModal } = await import("../ShareModal");

function makeCard(id: string, modelKey = "qwen3.6-27b"): CardData {
  return {
    id,
    model: {
      modelKey,
      customModel: {
        params: 7e9,
        layers: 32,
        kvHeads: 8,
        headDim: 128,
        moe: false,
      },
      quant: "q4_k_m",
      kvQuant: "bf16",
      contextK: 32,
      concurrentUsers: 1,
      kvCacheFillPct: 100,
    },
    hosting: {
      price: "1.99",
      gpuCount: "1",
      gpuVram: "80",
      gpuInfo: "H100",
      gpuBandwidth: "3350",
      cpuCores: "16",
      cpuFreqGHz: "3.5",
      cpuModel: "EPYC",
      ramBandwidthGBs: "200",
      ramType: "DDR5",
      storageType: "NVMe",
      efficiency: "80",
      notes: "",
      availableRam: "192",
      availableStorage: "1000",
      osOverheadGb: 2,
    },
  };
}

describe("ShareModal", () => {
  beforeEach(() => {
    // ResizeObserver is referenced by the live preview pane. jsdom doesn't
    // provide one, and an undefined symbol crashes React render rather than
    // failing the assertion we actually care about.
    if (!("ResizeObserver" in globalThis)) {
      class FakeResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      (globalThis as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver = FakeResizeObserver;
    }
  });

  afterEach(() => cleanup());

  it("opens on the Link tab by default and shows the encoded URL", () => {
    render(
      <ShareModal
        open
        onOpenChange={() => {}}
        mode="single"
        configs={[makeCard("c1")]}
      />,
    );
    const linkTab = screen.getByRole("tab", { name: /link/i });
    expect(linkTab.getAttribute("aria-selected")).toBe("true");
    // The Link tab renders the shareable URL in an <input>.
    const url = screen.getByDisplayValue(/\?s=/) as HTMLInputElement;
    expect(url.value).toContain("?s=");
  });

  it("respects the initialTab prop", () => {
    render(
      <ShareModal
        open
        onOpenChange={() => {}}
        mode="single"
        configs={[makeCard("c1")]}
        initialTab="badge"
      />,
    );
    expect(
      screen.getByRole("tab", { name: /badge/i }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("switches between all four tabs", async () => {
    const user = userEvent.setup();
    render(
      <ShareModal
        open
        onOpenChange={() => {}}
        mode="single"
        configs={[makeCard("c1")]}
      />,
    );

    for (const name of ["Image", "Badge", "Embed", "Link"]) {
      await user.click(screen.getByRole("tab", { name: new RegExp(name, "i") }));
      expect(
        screen
          .getByRole("tab", { name: new RegExp(name, "i") })
          .getAttribute("aria-selected"),
      ).toBe("true");
    }
  });

  it("on the Embed tab generates an iframe snippet pointing at embed.html", async () => {
    const user = userEvent.setup();
    render(
      <ShareModal
        open
        onOpenChange={() => {}}
        mode="single"
        configs={[makeCard("c1")]}
      />,
    );
    await user.click(screen.getByRole("tab", { name: /embed/i }));
    const snippet = await screen.findByDisplayValue(/embed\.html/);
    expect(snippet.tagName).toBe("TEXTAREA");
    expect((snippet as HTMLTextAreaElement).value).toMatch(/<iframe[\s\S]*?>/);
    expect((snippet as HTMLTextAreaElement).value).toContain("?s=");
  });

  it("on the Badge tab the markdown snippet contains a base64 data URL", async () => {
    const user = userEvent.setup();
    render(
      <ShareModal
        open
        onOpenChange={() => {}}
        mode="single"
        configs={[makeCard("c1")]}
      />,
    );
    await user.click(screen.getByRole("tab", { name: /badge/i }));
    const md = (await screen.findByLabelText(/markdown/i)) as HTMLTextAreaElement;
    expect(md.value).toContain("data:image/svg+xml;base64,");
  });

  it("shows the card picker only when there are multiple configs", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ShareModal
        open
        onOpenChange={() => {}}
        mode="single"
        configs={[makeCard("c1")]}
        initialTab="image"
      />,
    );
    expect(screen.queryByLabelText(/^card$/i)).toBeNull();

    rerender(
      <ShareModal
        open
        onOpenChange={() => {}}
        mode="compare"
        configs={[makeCard("c1"), makeCard("c2", "llama-3.3-70b")]}
        initialTab="image"
      />,
    );
    // The remount-via-key behaviour means we may need to switch to the
    // image tab again after rerender — but initialTab handles that.
    await user.click(screen.getByRole("tab", { name: /image/i }));
    expect(screen.getByLabelText(/^card$/i)).toBeInTheDocument();
  });
});
