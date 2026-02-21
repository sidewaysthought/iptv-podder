// error-icons.js
// ESM module (used by main.js and vitest)

export function getErrorIcon(status) {
  // Keep this exact sequence in sync with error-icons.test.js
  return status === 404 ? "⛓️💥" : "🚫";
}
