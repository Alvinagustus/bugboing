const PROMO = "SAVE10";
const SUBTOTAL = 100;
const DISCOUNT = 10;

const promoInput = document.getElementById("promo");
const totalEl = document.getElementById("total");
const discountRow = document.getElementById("discount-row");
const statusEl = document.getElementById("status");

document.getElementById("apply").addEventListener("click", () => {
  const code = promoInput.value.trim().toUpperCase();
  if (code !== PROMO) {
    statusEl.textContent = "That promo code is not valid.";
    return;
  }

  discountRow.hidden = false;
  statusEl.textContent = "Promo code applied.";

  const total = SUBTOTAL - DISCOUNT;
  totalEl.textContent = "$" + total.toFixed(2);
});
