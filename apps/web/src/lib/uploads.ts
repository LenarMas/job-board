import "server-only";
import path from "node:path";
import { findRepoRoot } from "@jobtrack/core";

export function uploadsDir(): string {
  return process.env.JOBTRACK_UPLOADS ?? path.join(findRepoRoot(), "uploads");
}
