import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Drift guard: an agent reads a tool's description to decide what it does and
 * whether it is safe to call. Behavior that the description doesn't mention
 * effectively doesn't exist. These checks fail whenever a tool gains a
 * parameter its description never names, or a description stops saying
 * whether the tool writes and whether that write is reversible.
 */

const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");

type Tool = { name: string; description: string; params: string[] };

function parseTools(src: string): Tool[] {
  const tools: Tool[] = [];
  // Each registration: server.tool(\n "name",\n "description",\n {schema...},\n async
  const re = /server\.tool\(\s*"([^"]+)",\s*"((?:[^"\\]|\\.)*)",\s*\{([\s\S]*?)\},\s*async/g;
  let match;
  while ((match = re.exec(src))) {
    const [, name, description, schemaBlock] = match;
    // Top-level schema keys look like `  key: z.` at the shallowest indent.
    const params = [...schemaBlock!.matchAll(/^\s{4}(\w+):\s*z\./gm)].map((m) => m[1]!);
    tools.push({ name: name!, description: description!, params });
  }
  return tools;
}

const tools = parseTools(source);

// Words that appear in a description in a natural form; a param "counts" as
// mentioned if its exact name (or the name with underscores as spaces) is in
// the description, OR it is one of these universally-understood identifiers
// whose stem must appear.
const STEM_OK: Record<string, RegExp> = {
  id: /\bid\b|this id|by id/i,
  query: /query/i,
  days: /days/i,
  from: /\bfrom\b|between/i,
  to: /\bto\b|between/i,
  body: /body|text/i,
};

function mentioned(param: string, description: string): boolean {
  const d = description.toLowerCase();
  if (d.includes(param.toLowerCase())) return true;
  if (d.includes(param.toLowerCase().replace(/_/g, " "))) return true;
  const stem = STEM_OK[param];
  return stem ? stem.test(description) : false;
}

describe("mcp tool descriptions stay truthful", () => {
  it("finds the full tool registry in the source", () => {
    expect(tools.length).toBeGreaterThanOrEqual(29);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
  });

  it("every description states whether the tool reads or writes, and reversibility for writes", () => {
    for (const tool of tools) {
      const d = tool.description;
      const readOnly = /read-only/i.test(d);
      const write = /\bwrite\b/i.test(d);
      expect(readOnly || write, `${tool.name}: description must say "Read-only" or "Write"`).toBe(true);
      if (write && !readOnly) {
        expect(
          /reversible|irreversible|destructive/i.test(d),
          `${tool.name}: a write's description must state reversibility (reversible / irreversible / destructive)`,
        ).toBe(true);
      }
    }
  });

  it("every parameter is mentioned in its tool's description (no silent drift)", () => {
    const failures: string[] = [];
    for (const tool of tools) {
      for (const param of tool.params) {
        if (!mentioned(param, tool.description)) {
          failures.push(`${tool.name}: parameter "${param}" is not mentioned in the description`);
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
