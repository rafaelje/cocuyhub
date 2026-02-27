import type { CommandError } from "../types";

export function getErrorMessage(error: CommandError): string {
  switch (error.type) {
    case "FileNotFound":
      return `Archivo no encontrado: ${error.path}`;
    case "ParseError":
      return `JSON inválido: ${error.message}`;
    case "ReadError":
      return `Error al leer: ${error.message}`;
    case "WriteError":
      return `Error al guardar: ${error.message}`;
    case "SnapshotError":
      return `Error de snapshot: ${error.message}`;
    case "ProcessError":
      return `Error de detección de proceso: ${error.message}`;
    default:
      // Note: CommandError uses a single interface (not discriminated union), so
      // TypeScript cannot narrow to `never` here. If a new type is added to the
      // CommandError union, add a matching case above.
      return "Error inesperado";
  }
}
