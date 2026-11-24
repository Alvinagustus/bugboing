const filterBtn = document.getElementById("filter-in-stock");
const countEl = document.getElementById("count");
const items = Array.from(document.querySelectorAll("#products li"));

function render(showInStockOnly) {
  let visible = 0;
  for (const item of items) {
    // BUG: the button state toggles, but out-of-stock items are never hidden.
    // A "page renders" check passes; only filtering behavior catches this.
    const hide = false;
    item.hidden = hide;
    if (!hide) visible += 1;
  }
  countEl.textContent = visible + (visible === 1 ? " item" : " items");
}

filterBtn.addEventListener("click", () => {
  const pressed = filterBtn.getAttribute("aria-pressed") === "true";
  const next = !pressed;
  filterBtn.setAttribute("aria-pressed", String(next));
  render(next);
});
