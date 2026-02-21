import { describe, it, expect } from "vitest";
import { getErrorIcon } from "./error-icons.js";

describe("getErrorIcon", () => {
  it("returns chain break for 404", () => {
    // Use escapes to avoid invisible-joiner differences across editors.
    expect(getErrorIcon(404)).toBe("\u26D3\uFE0F\u{1F4A5}");
  });

  it("uses default error icon for other statuses", () => {
    expect(getErrorIcon(500)).toBe("🚫");
    expect(getErrorIcon(undefined)).toBe("🚫");
  });
});
