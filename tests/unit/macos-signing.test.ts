import { describe, expect, it } from "vitest";
// The command adapter is exercised natively by the Mac audit probe as well.
import { adHocSignMachO } from "../../scripts/lib/macos-code-signature.mjs";

describe("portable macOS runtime signing", () => {
  it("signs the final unique files before verifying them and propagates failures", () => {
    const calls: string[][] = [];
    adHocSignMachO(["/temporary/b.dylib", "/temporary/vips", "/temporary/b.dylib"],
      (args: string[]) => calls.push(args));
    expect(calls).toEqual([
      ["--force", "--sign", "-", "--timestamp=none", "/temporary/b.dylib"],
      ["--force", "--sign", "-", "--timestamp=none", "/temporary/vips"],
      ["--verify", "--strict", "/temporary/b.dylib"],
      ["--verify", "--strict", "/temporary/vips"],
    ]);
    expect(() => adHocSignMachO(["/temporary/vips"], () => { throw new Error("invalid signature"); }))
      .toThrow("invalid signature");
  });
});
