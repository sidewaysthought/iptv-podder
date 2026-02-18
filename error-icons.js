// error-icons.js
// Browser global + ESM export so vitest can import it cleanly.

export function getErrorIcon(status) {
  return status === 404 ? "⛓️‍💥" : "🚫";
}

if (typeof window !== "undefined") {
  window.getErrorIcon = getErrorIcon;
}

// Optional CommonJS compatibility
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getErrorIcon };
}
