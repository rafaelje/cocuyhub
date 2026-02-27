import { invoke } from "@tauri-apps/api/core";
import type { CommandError } from "../types";

export async function invokeCommand<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    throw error as CommandError;
  }
}
