(function(global) {
  function getErrorIcon(status) {
    return status === 404 ? "⛓️‍💥" : "🚫";
  }

  global.getErrorIcon = getErrorIcon;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { getErrorIcon };
  }
})(typeof window !== "undefined" ? window : globalThis);
