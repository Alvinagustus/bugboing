const nameInput = document.getElementById("name");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

saveBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();

  // BUG: required-name validation is missing. Empty names are reported as saved.
  statusEl.textContent = "Saved!";
  statusEl.className = "success";
});
