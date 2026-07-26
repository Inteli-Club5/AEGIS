import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const NEXTJS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("onchain relationship and time-filter labels", () => {
  it("describes policy filters as last-reference timestamps", () => {
    const source = readFileSync(join(NEXTJS_ROOT, "app/dashboard/policies/page.tsx"), "utf8");

    assert.match(source, /Last referenced from \(UTC\)/);
    assert.match(source, /Last referenced to \(UTC\)/);
    assert.doesNotMatch(source, /label="Referenced (?:from|to) \(UTC\)"/);
  });

  it("does not imply execution-level TeeML correlation", () => {
    const source = readFileSync(join(NEXTJS_ROOT, "app/dashboard/executions/[id]/page.tsx"), "utf8");

    assert.match(source, /Validations for linked agent/);
    assert.doesNotMatch(source, /Related TeeML validations/);
  });
});
