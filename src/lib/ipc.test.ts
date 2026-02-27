import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri invoke before importing ipc.ts
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invokeCommand } from "./ipc";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

describe("invokeCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns resolved value on success", async () => {
    mockInvoke.mockResolvedValue({ mcpServers: {} });
    const result = await invokeCommand<{ mcpServers: object }>("get_config");
    expect(result).toEqual({ mcpServers: {} });
    expect(mockInvoke).toHaveBeenCalledWith("get_config", undefined);
  });

  it("passes args to invoke", async () => {
    mockInvoke.mockResolvedValue("ok");
    await invokeCommand("save_config", { path: "/foo.json" });
    expect(mockInvoke).toHaveBeenCalledWith("save_config", { path: "/foo.json" });
  });

  it("rethrows Tauri error on failure", async () => {
    const tauriError = { type: "FileNotFound", path: "/missing.json" };
    mockInvoke.mockRejectedValue(tauriError);
    await expect(invokeCommand("get_config")).rejects.toEqual(tauriError);
  });

  it("rethrows string error from Tauri", async () => {
    mockInvoke.mockRejectedValue("unexpected error");
    await expect(invokeCommand("some_command")).rejects.toBe("unexpected error");
  });
});
