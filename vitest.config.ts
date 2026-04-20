import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    coverage: {
      // v8 is bundled with vitest's coverage provider; no Babel hooks needed.
      provider: "v8",
      // Reporters: text for the local terminal, html for browsable details,
      // json-summary for CI badges, and lcov so external tools (Codecov,
      // SonarQube, IDEs) can pick the report up directly.
      reporter: ["text", "html", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      // Only measure source code we actually ship — UI primitives and
      // generated/vendored code under src/components/ui aren't worth tracking.
      include: ["src/lib/**/*.{ts,tsx}", "src/hooks/**/*.ts"],
      exclude: [
        "src/lib/**/__tests__/**",
        "src/lib/types.ts",
        // screenshot.tsx is a thin wrapper around html-to-image / Clipboard /
        // createRoot — it's almost entirely DOM glue and capturing it under
        // jsdom would need a stack of mocks that proves nothing about the
        // real browser path. We cover the share-card *math* via shieldSvg
        // and state tests; the html-to-image dance is verified by hand
        // during the smoke-deploy step.
        "src/lib/screenshot.tsx",
      ],
      // Hard floors. Globals are calibrated slightly below current numbers so
      // small refactors don't flap the build, while per-file thresholds keep a
      // tight grip on the math-heavy core (calculator/hf/state) where a drop
      // in coverage almost certainly means an untested branch with real
      // physics consequences.
      //
      // When you raise coverage, also raise these floors — never lower them
      // without leaving a comment about *why*.
      thresholds: {
        lines: 90,
        functions: 75,
        branches: 85,
        statements: 90,
        "src/lib/calculator.ts": {
          lines: 95,
          functions: 95,
          branches: 80,
          statements: 95,
        },
        "src/lib/calcInput.ts": {
          lines: 100,
          functions: 100,
          branches: 90,
          statements: 100,
        },
        "src/lib/hf.ts": {
          lines: 90,
          functions: 85,
          branches: 85,
          statements: 90,
        },
        "src/lib/state.ts": {
          lines: 90,
          functions: 100,
          branches: 100,
          statements: 90,
        },
        "src/hooks/useCalcResult.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/hooks/useValueScore.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/hooks/useHfModelImport.ts": {
          lines: 95,
          functions: 100,
          branches: 90,
          statements: 95,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
