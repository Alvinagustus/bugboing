// Deliberate bug for the real-agent loop: the runtime heading does not match
// the copy in index.html, so the bug is only visible after JavaScript runs.
const headline = document.getElementById("headline");
headline.textContent = "BugBoing Demoo";

document.getElementById("refresh").addEventListener("click", () => {
  document.getElementById("status").textContent = "Refreshed at " + new Date().toLocaleTimeString();
});
