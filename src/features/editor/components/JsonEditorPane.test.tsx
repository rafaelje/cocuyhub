import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@/stores/useConfigStore", () => ({ useConfigStore: vi.fn() }));
vi.mock("@/stores/useSettingsStore", () => ({ useSettingsStore: vi.fn() }));
vi.mock("@/lib/ipc", () => ({ invokeCommand: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type MockMonaco = {
  KeyMod: { CtrlCmd: number };
  KeyCode: { KeyS: number };
  languages: {
    json: {
      jsonDefaults: {
        setDiagnosticsOptions: ReturnType<typeof vi.fn>;
      };
    };
  };
};

type MockEditor = {
  onDidChangeCursorPosition: (
    cb: (e: { position: { lineNumber: number; column: number } }) => void
  ) => void;
  addCommand: (keybinding: number, handler: () => void) => void;
  getValue: () => string;
};

let capturedOnValidate:
  | ((markers: { severity: number }[]) => void)
  | undefined;
let capturedOnMount:
  | ((editor: MockEditor, monaco: MockMonaco) => void)
  | undefined;
let capturedOnChange: ((value: string | undefined) => void) | undefined;

const mockMonaco: MockMonaco = {
  KeyMod: { CtrlCmd: 2048 },
  KeyCode: { KeyS: 31 },
  languages: {
    json: {
      jsonDefaults: {
        setDiagnosticsOptions: vi.fn(),
      },
    },
  },
};

vi.mock("@monaco-editor/react", () => ({
  default: vi.fn(
    (props: {
      value?: string;
      onValidate?: (markers: { severity: number }[]) => void;
      onMount?: (editor: MockEditor, monaco: MockMonaco) => void;
      onChange?: (value: string | undefined) => void;
      options?: { readOnly?: boolean };
    }) => {
      capturedOnValidate = props.onValidate;
      capturedOnMount = props.onMount;
      capturedOnChange = props.onChange;
      return <div data-testid="monaco-editor" data-value={props.value} />;
    }
  ),
}));

import type { ToolTarget } from "@/types";
import Editor from "@monaco-editor/react";
import { useConfigStore } from "@/stores/useConfigStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { invokeCommand } from "@/lib/ipc";
import { toast } from "sonner";
import { useAppStore } from "@/stores/useAppStore";
import { JsonEditorPane } from "./JsonEditorPane";

function setupSettingsStore(
  codePath: string | null = "/code/config.json",
  desktopPath: string | null = "/desktop/config.json"
) {
  vi.mocked(useSettingsStore).mockImplementation((selector) =>
    selector({ codePath, desktopPath } as never)
  );
}

function setupStore(
  codeRaw: string | null = null,
  desktopRaw: string | null = null
) {
  const mockReloadConfig = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useConfigStore).mockImplementation((selector) =>
    selector({ codeRaw, desktopRaw } as never)
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (useConfigStore as any).getState = vi.fn().mockReturnValue({
    reloadConfig: mockReloadConfig,
  });
  setupSettingsStore();
  return { mockReloadConfig };
}

function mountEditor(getValue: () => string = () => "") {
  act(() => {
    capturedOnMount?.(
      {
        onDidChangeCursorPosition: vi.fn(),
        addCommand: vi.fn(),
        getValue,
      },
      mockMonaco
    );
  });
}

describe("JsonEditorPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnValidate = undefined;
    capturedOnMount = undefined;
    capturedOnChange = undefined;
    mockMonaco.languages.json.jsonDefaults.setDiagnosticsOptions = vi.fn();
    useAppStore.setState((state) => ({ ...state, editorDirty: false, externalChangeWarning: false, configActiveTool: "code" as ToolTarget }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Story 5.1 tests (updated for editable mode) ---

  it("renders two tab buttons: Claude Code and Claude Desktop", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    expect(screen.getByRole("tab", { name: "Claude Code" })).not.toBeNull();
    expect(
      screen.getByRole("tab", { name: "Claude Desktop" })
    ).not.toBeNull();
  });

  it("shows Claude Desktop tab as active when store has configActiveTool='desktop'", () => {
    useAppStore.setState((s) => ({ ...s, configActiveTool: "desktop" as ToolTarget }));
    setupStore(null, null);
    render(<JsonEditorPane />);
    expect(
      screen.getByRole("tab", { name: "Claude Desktop" }).getAttribute("aria-selected")
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: "Claude Code" }).getAttribute("aria-selected")
    ).toBe("false");
  });

  it("Claude Code tab is active by default (aria-selected=true)", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    const codeTab = screen.getByRole("tab", { name: "Claude Code" });
    expect(codeTab.getAttribute("aria-selected")).toBe("true");
  });

  it("switching to Claude Desktop tab updates aria-selected", async () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    await userEvent.click(screen.getByRole("tab", { name: "Claude Desktop" }));
    expect(
      screen
        .getByRole("tab", { name: "Claude Desktop" })
        .getAttribute("aria-selected")
    ).toBe("true");
    expect(
      screen
        .getByRole("tab", { name: "Claude Code" })
        .getAttribute("aria-selected")
    ).toBe("false");
  });

  it("passes codeRaw as value when Code tab is active", () => {
    setupStore('{"mcpServers":{}}', null);
    render(<JsonEditorPane />);
    const editor = screen.getByTestId("monaco-editor");
    expect(editor.getAttribute("data-value")).toBe('{"mcpServers":{}}');
  });

  it("passes desktopRaw as value when Desktop tab is active", async () => {
    setupStore('{"mcpServers":{}}', '{"mcpServers":{"desktop-mcp":{}}}');
    render(<JsonEditorPane />);
    await userEvent.click(screen.getByRole("tab", { name: "Claude Desktop" }));
    const editor = screen.getByTestId("monaco-editor");
    expect(editor.getAttribute("data-value")).toBe(
      '{"mcpServers":{"desktop-mcp":{}}}'
    );
  });

  it("passes empty string as value when raw is null", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    const editor = screen.getByTestId("monaco-editor");
    expect(editor.getAttribute("data-value")).toBe("");
  });

  it("status bar shows 'Ln 1, Col 1' initially", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    expect(screen.getByText("Ln 1, Col 1")).not.toBeNull();
  });

  it("status bar updates line/col when cursor moves via onMount", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      capturedOnMount?.(
        {
          onDidChangeCursorPosition: (cb) => {
            cb({ position: { lineNumber: 3, column: 7 } });
          },
          addCommand: vi.fn(),
          getValue: vi.fn(),
        },
        mockMonaco
      );
    });
    expect(screen.getByText("Ln 3, Col 7")).not.toBeNull();
  });

  it("status bar shows 'Valid JSON' with emerald indicator when no errors", () => {
    setupStore(null, null);
    const { container } = render(<JsonEditorPane />);
    act(() => {
      capturedOnValidate?.([]);
    });
    expect(screen.getByText("Valid JSON")).not.toBeNull();
    expect(container.querySelector(".bg-emerald-500")).not.toBeNull();
  });

  it("status bar shows '2 errors' with red indicator when validation finds 2 errors", () => {
    setupStore(null, null);
    const { container } = render(<JsonEditorPane />);
    act(() => {
      capturedOnValidate?.([{ severity: 8 }, { severity: 8 }]);
    });
    expect(screen.getByText("2 errors")).not.toBeNull();
    expect(container.querySelector(".bg-red-500")).not.toBeNull();
  });

  it("status bar shows '1 error' (singular) for a single error", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      capturedOnValidate?.([{ severity: 8 }]);
    });
    expect(screen.getByText("1 error")).not.toBeNull();
  });

  it("severity 4 markers show as warnings (not counted as errors)", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      capturedOnValidate?.([{ severity: 4 }]);
    });
    expect(screen.getByText("1 warning")).not.toBeNull();
    expect(screen.queryByText("Valid JSON")).toBeNull();
    expect(screen.queryByText(/error/)).toBeNull();
  });

  it("Monaco editor is NOT read-only (readOnly option is absent or false)", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    const calls = vi.mocked(Editor).mock.calls;
    const hasReadOnly = calls.some(
      ([props]) =>
        (props as { options?: { readOnly?: boolean } }).options?.readOnly ===
        true
    );
    expect(hasReadOnly).toBe(false);
  });

  it("resets position and error count when switching tabs", async () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      capturedOnMount?.(
        {
          onDidChangeCursorPosition: (cb) => {
            cb({ position: { lineNumber: 5, column: 10 } });
          },
          addCommand: vi.fn(),
          getValue: vi.fn(),
        },
        mockMonaco
      );
      capturedOnValidate?.([{ severity: 8 }]);
    });
    expect(screen.getByText("Ln 5, Col 10")).not.toBeNull();
    expect(screen.getByText("1 error")).not.toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Claude Desktop" }));
    expect(screen.getByText("Ln 1, Col 1")).not.toBeNull();
    expect(screen.getByText("Valid JSON")).not.toBeNull();
  });

  // --- Story 5.2 tests ---

  it("onChange fires → editorDirty becomes true", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      capturedOnChange?.("new content");
    });
    expect(useAppStore.getState().editorDirty).toBe(true);
  });

  it("DirtyBanner does not show initially (editorDirty=false)", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("DirtyBanner shows when editorDirty=true", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
    });
    expect(screen.getByRole("status")).not.toBeNull();
    expect(screen.getByText(/Unsaved changes/)).not.toBeNull();
  });

  it("Save button is disabled initially (editorDirty=false)", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    const btn = screen.getByRole("button", { name: "Save" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Save button is disabled when errorCount > 0 (invalid JSON)", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
      capturedOnValidate?.([{ severity: 8 }]);
    });
    const btn = screen.getByRole("button", { name: "Save" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Save button enabled when editorDirty=true and no errors", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
    });
    const btn = screen.getByRole("button", { name: "Save" });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("Save button shows 'No path' and is disabled when no codePath", () => {
    setupStore(null, null);
    setupSettingsStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
    });
    const btn = screen.getByRole("button", { name: "No path" });
    expect(btn).not.toBeNull();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("clicking Save calls invokeCommand('config_write_file') with correct args", async () => {
    setupStore(null, null);
    vi.mocked(invokeCommand).mockResolvedValue(undefined);
    render(<JsonEditorPane />);
    mountEditor(() => '{"mcpServers":{}}');
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(vi.mocked(invokeCommand)).toHaveBeenCalledWith(
        "config_write_file",
        {
          path: "/code/config.json",
          content: '{"mcpServers":{}}',
          tool: "code",
        }
      );
    });
  });

  it("on save success: setEditorDirty(false), toast.success fired, and reloadConfig called", async () => {
    const { mockReloadConfig } = setupStore(null, null);
    vi.mocked(invokeCommand).mockResolvedValue(undefined);
    render(<JsonEditorPane />);
    mountEditor(() => '{"mcpServers":{}}');
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(useAppStore.getState().editorDirty).toBe(false);
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Config saved", {
        duration: 3000,
      });
      expect(mockReloadConfig).toHaveBeenCalledWith("code");
    });
  });

  it("on save failure: toast.error fired and editorDirty remains true", async () => {
    setupStore(null, null);
    vi.mocked(invokeCommand).mockRejectedValue({ message: "Write failed" });
    render(<JsonEditorPane />);
    mountEditor(() => '{"mcpServers":{}}');
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        "Failed to save: Write failed",
        { duration: Infinity }
      );
    });
    expect(useAppStore.getState().editorDirty).toBe(true);
  });

  it("⌘S dispatched to window triggers handleSave", async () => {
    setupStore(null, null);
    vi.mocked(invokeCommand).mockResolvedValue(undefined);
    render(<JsonEditorPane />);
    mountEditor(() => '{"mcpServers":{}}');
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
    });
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true })
      );
    });
    await waitFor(() => {
      expect(vi.mocked(invokeCommand)).toHaveBeenCalledWith(
        "config_write_file",
        expect.objectContaining({ path: "/code/config.json", tool: "code" })
      );
    });
  });

  it("Ctrl+S dispatched to window triggers handleSave (Windows/Linux)", async () => {
    setupStore(null, null);
    vi.mocked(invokeCommand).mockResolvedValue(undefined);
    render(<JsonEditorPane />);
    mountEditor(() => '{"mcpServers":{}}');
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
    });
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true })
      );
    });
    await waitFor(() => {
      expect(vi.mocked(invokeCommand)).toHaveBeenCalledWith(
        "config_write_file",
        expect.objectContaining({ path: "/code/config.json", tool: "code" })
      );
    });
  });

  it("window keydown listener is removed on unmount", () => {
    setupStore(null, null);
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<JsonEditorPane />);
    const handler = addSpy.mock.calls.find(([type]) => type === "keydown")?.[1];

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", handler);
  });

  it("⌘⇧S does NOT trigger save (Shift+S is manual snapshot shortcut)", async () => {
    setupStore(null, null);
    vi.mocked(invokeCommand).mockResolvedValue(undefined);
    render(<JsonEditorPane />);
    mountEditor();
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
    });
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "s",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      })
    );
    await act(async () => {});
    expect(vi.mocked(invokeCommand)).not.toHaveBeenCalled();
  });

  it("switching tabs resets editorDirty to false", async () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
    });
    await userEvent.click(screen.getByRole("tab", { name: "Claude Desktop" }));
    expect(useAppStore.getState().editorDirty).toBe(false);
  });

  it("Save button shows 'Saving...' while isSaving", async () => {
    setupStore(null, null);
    vi.mocked(invokeCommand).mockImplementation(() => new Promise(() => {}));
    render(<JsonEditorPane />);
    mountEditor(() => '{"mcpServers":{}}');
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
    });
    // Intentionally not awaited — want to observe mid-save state
    void userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Saving..." })
      ).not.toBeNull();
    });
  });

  // --- Story 5.3 tests ---

  it("calls setDiagnosticsOptions with schema on editor mount", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    mountEditor();
    expect(
      mockMonaco.languages.json.jsonDefaults.setDiagnosticsOptions
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        validate: true,
        enableSchemaRequest: false,
        schemas: expect.arrayContaining([
          expect.objectContaining({
            fileMatch: ["*"],
            schema: expect.objectContaining({ type: "object" }),
          }),
        ]),
      })
    );
  });

  it("re-registers schema on tab switch (setDiagnosticsOptions called on each mount)", async () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    mountEditor();
    expect(
      mockMonaco.languages.json.jsonDefaults.setDiagnosticsOptions
    ).toHaveBeenCalledTimes(1);

    // Switch tab → Monaco remounts → handleEditorMount called again
    await userEvent.click(screen.getByRole("tab", { name: "Claude Desktop" }));
    mountEditor(); // simulate Monaco remount for desktop tab
    expect(
      mockMonaco.languages.json.jsonDefaults.setDiagnosticsOptions
    ).toHaveBeenCalledTimes(2);
  });

  it("status bar shows Valid JSON when no errors and no warnings", () => {
    setupStore(null, null);
    const { container } = render(<JsonEditorPane />);
    act(() => {
      capturedOnValidate?.([]);
    });
    expect(screen.getByText("Valid JSON")).not.toBeNull();
    expect(container.querySelector(".bg-emerald-500")).not.toBeNull();
  });

  it("status bar shows '1 warning' (singular) for a single warning marker", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      capturedOnValidate?.([{ severity: 4 }]);
    });
    expect(screen.getByText("1 warning")).not.toBeNull();
  });

  it("status bar shows '2 warnings' (plural) for multiple warning markers", () => {
    setupStore(null, null);
    const { container } = render(<JsonEditorPane />);
    act(() => {
      capturedOnValidate?.([{ severity: 4 }, { severity: 4 }]);
    });
    expect(screen.getByText("2 warnings")).not.toBeNull();
    expect(container.querySelector(".bg-yellow-500")).not.toBeNull();
  });

  it("status bar shows 'N errors, M warnings' when both errors and warnings present", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      capturedOnValidate?.([{ severity: 8 }, { severity: 4 }, { severity: 4 }]);
    });
    expect(screen.getByText(/1 error, 2 warnings/)).not.toBeNull();
  });

  it("warning indicator uses yellow color class", () => {
    setupStore(null, null);
    const { container } = render(<JsonEditorPane />);
    act(() => {
      capturedOnValidate?.([{ severity: 4 }]);
    });
    expect(container.querySelector(".bg-yellow-500")).not.toBeNull();
    expect(container.querySelector(".text-yellow-400")).not.toBeNull();
  });

  it("warnings do not disable Save button when editorDirty=true and no errors", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      useAppStore.setState((s) => ({ ...s, editorDirty: true }));
      capturedOnValidate?.([{ severity: 4 }, { severity: 4 }]);
    });
    const btn = screen.getByRole("button", { name: "Save" });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("switching tabs resets warningCount to 0", async () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      capturedOnValidate?.([{ severity: 4 }]);
    });
    expect(screen.getByText("1 warning")).not.toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Claude Desktop" }));
    expect(screen.getByText("Valid JSON")).not.toBeNull();
  });

  it("does not count error markers (severity 8) as warnings", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      capturedOnValidate?.([{ severity: 8 }, { severity: 8 }]);
    });
    // Should show "2 errors" with no mention of warnings
    expect(screen.getByText("2 errors")).not.toBeNull();
    expect(screen.queryByText(/warning/)).toBeNull();
  });

  // --- Story 5.4 tests ---

  it("ExternalChangeBanner is not shown by default (externalChangeWarning=false)", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ExternalChangeBanner shows when externalChangeWarning=true and editorDirty=true", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      useAppStore.setState((s) => ({ ...s, externalChangeWarning: true, editorDirty: true }));
    });
    expect(screen.getByRole("alert")).not.toBeNull();
    expect(
      screen.getByText(/File modified externally — your unsaved changes may conflict/)
    ).not.toBeNull();
  });

  it("ExternalChangeBanner is not shown when externalChangeWarning=true but editorDirty=false", () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      useAppStore.setState((s) => ({ ...s, externalChangeWarning: true, editorDirty: false }));
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ExternalChangeBanner dismiss button clears externalChangeWarning", async () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      useAppStore.setState((s) => ({ ...s, externalChangeWarning: true, editorDirty: true }));
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss external change warning" })
    );
    expect(useAppStore.getState().externalChangeWarning).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("switching tabs clears ExternalChangeBanner", async () => {
    setupStore(null, null);
    render(<JsonEditorPane />);
    act(() => {
      useAppStore.setState((s) => ({ ...s, externalChangeWarning: true, editorDirty: true }));
    });
    expect(screen.getByRole("alert")).not.toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Claude Desktop" }));
    expect(useAppStore.getState().externalChangeWarning).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("successful save clears ExternalChangeBanner", async () => {
    setupStore(null, null);
    vi.mocked(invokeCommand).mockResolvedValue(undefined);
    render(<JsonEditorPane />);
    mountEditor(() => '{"mcpServers":{}}');
    act(() => {
      useAppStore.setState((s) => ({
        ...s,
        editorDirty: true,
        externalChangeWarning: true,
      }));
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(useAppStore.getState().externalChangeWarning).toBe(false);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ExternalChangeBanner persists after failed save (warning not cleared on error)", async () => {
    setupStore(null, null);
    vi.mocked(invokeCommand).mockRejectedValue({ message: "Write failed" });
    render(<JsonEditorPane />);
    mountEditor(() => '{"mcpServers":{}}');
    act(() => {
      useAppStore.setState((s) => ({
        ...s,
        editorDirty: true,
        externalChangeWarning: true,
      }));
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalled();
    });
    expect(useAppStore.getState().externalChangeWarning).toBe(true);
    expect(screen.getByRole("alert")).not.toBeNull();
  });
});
