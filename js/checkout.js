// -----------------------------
// FET Platform Checkout Module
// -----------------------------

const PLATFORM_FEE_PERCENT = 0.15;
const STRIPE_PERCENT = 0.029;
const STRIPE_FLAT = 0.30;

const checkoutSection = document.getElementById("checkout");
const checkoutCreator = document.getElementById("checkout-creator");
const checkoutType = document.getElementById("checkout-type");
const checkoutCreatorFee = document.getElementById("checkout-creator-fee");
const checkoutPlatformFee = document.getElementById("checkout-platform-fee");
const checkoutProcessingFee = document.getElementById("checkout-processing-fee");
const checkoutTotal = document.getElementById("checkout-total");
const payBtn = document.getElementById("pay-btn");
const cancelCheckoutBtn = document.getElementById("cancel-checkout-btn");
const checkoutFeedback = document.getElementById("checkout-feedback");

function formatCurrency(amount) {
  return "$" + amount.toFixed(2);
}

function calculateFees(creatorFee) {
  const platformFee = creatorFee * PLATFORM_FEE_PERCENT;
  const subtotal = creatorFee + platformFee;
  const processingFee = (subtotal * STRIPE_PERCENT) + STRIPE_FLAT;
  const total = subtotal + processingFee;

  return {
    creatorFee,
    platformFee,
    processingFee,
    total
  };
}

function showCheckout(creatorName, contentType, creatorFee) {
  const fees = calculateFees(creatorFee);

  checkoutCreator.textContent = creatorName;
  checkoutType.textContent = contentType;
  checkoutCreatorFee.textContent = formatCurrency(fees.creatorFee);
  checkoutPlatformFee.textContent = formatCurrency(fees.platformFee);
  checkoutProcessingFee.textContent = formatCurrency(fees.processingFee);
  checkoutTotal.textContent = formatCurrency(fees.total);
  checkoutFeedback.textContent = "";

  checkoutSection.classList.remove("hidden");
  checkoutSection.scrollIntoView({ behavior: "smooth" });
}

function hideCheckout() {
  checkoutSection.classList.add("hidden");
}

cancelCheckoutBtn.addEventListener("click", () => {
  hideCheckout();
});

payBtn.addEventListener("click", () => {
  checkoutFeedback.textContent = "Redirecting to payment...";
  checkoutFeedback.style.color = "#0f0";

  setTimeout(() => {
    checkoutFeedback.textContent = "Payment link not configured yet. Connect Stripe to enable payments.";
    checkoutFeedback.style.color = "#ff0";
  }, 1500);
});

document.getElementById("adultForm").addEventListener("submit", function(e) {
  e.preventDefault();
  const creatorName = document.getElementById("creator-name")?.value.trim() || "Creator";
  showCheckout(creatorName, "Custom Content Request", 20.00);
});
