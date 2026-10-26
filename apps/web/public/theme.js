/* This runs before the app stylesheet so a saved choice is present at first paint. */
(function () {
  var theme = "dark";
  try { if (localStorage.getItem("theloop-theme") === "light") theme = "light"; } catch (_) {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f7f7f5" : "#141414");
})();
