import { describe, it, expect } from "vitest";
import { getErrorMessage } from "./errors";
import type { CommandError } from "../types";

describe("getErrorMessage", () => {
  it("formats FileNotFound with path", () => {
    const err: CommandError = { type: "FileNotFound", path: "/Users/me/.claude.json" };
    expect(getErrorMessage(err)).toBe("Archivo no encontrado: /Users/me/.claude.json");
  });

  it("formats ParseError with message", () => {
    const err: CommandError = { type: "ParseError", message: "Unexpected token" };
    expect(getErrorMessage(err)).toBe("JSON inválido: Unexpected token");
  });

  it("formats WriteError with message", () => {
    const err: CommandError = { type: "WriteError", message: "Permission denied" };
    expect(getErrorMessage(err)).toBe("Error al guardar: Permission denied");
  });

  it("formats SnapshotError with message", () => {
    const err: CommandError = { type: "SnapshotError", message: "Disk full" };
    expect(getErrorMessage(err)).toBe("Error de snapshot: Disk full");
  });

  it("formats ProcessError with message", () => {
    const err: CommandError = { type: "ProcessError", message: "sysinfo failed" };
    expect(getErrorMessage(err)).toBe("Error de detección de proceso: sysinfo failed");
  });

  it("handles undefined path gracefully for FileNotFound", () => {
    const err = { type: "FileNotFound" } as CommandError;
    expect(getErrorMessage(err)).toBe("Archivo no encontrado: undefined");
  });
});
