import { describe, expect, it } from "vitest";
import { toolchainVersionFailure } from "../../scripts/lib/linux-toolchain-version.mjs";

describe("Linux native toolchain preflight", () => {
  it("rejects old Cargo even when rustc and formatting components are current", () => {
    expect(toolchainVersionFailure("rustc", "rustc 1.96.0 (native)", "1.90")).toBeNull();
    expect(toolchainVersionFailure("cargo", "cargo 1.75.0", "1.90")).toContain("older");
    expect(toolchainVersionFailure("cargo", "cargo 1.96.0", "1.90")).toBeNull();
  });

  it("requires the supported native Node/npm lines and a readable version", () => {
    expect(toolchainVersionFailure("node", "v22.23.1", "1.90")).not.toBeNull();
    expect(toolchainVersionFailure("node", "v24.22.2", "1.90")).toBeNull();
    expect(toolchainVersionFailure("npm", "12.2.1", "1.90")).not.toBeNull();
    expect(toolchainVersionFailure("npm", "11.19.1", "1.90")).toBeNull();
    expect(toolchainVersionFailure("cargo", "unavailable", "1.90")).not.toBeNull();
  });
});
