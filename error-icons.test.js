const { describe, it, expect } = require("vitest");
const { getErrorIcon } = require("./error-icons");

describe("getErrorIcon", () => {
  it("returns chain break for 404", () => {
    expect(getErrorIcon(404)).toBe("⛓️‍💥");
  });

  it("uses default error icon for other statuses", () => {
    expect(getErrorIcon(500)).toBe("🚫");
    expect(getErrorIcon(undefined)).toBe("🚫");
  });
});
