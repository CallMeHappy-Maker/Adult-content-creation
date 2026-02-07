document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const creatorParam = params.get("creator");

  const PLATFORM_FEE_PERCENT = 0.15;
  const STRIPE_PERCENT = 0.029;
  const STRIPE_FLAT = 0.30;

  const serviceTypeLabels = {
    "custom-video": "Custom Video",
    "custom-photos": "Custom Photos",
    "in-person": "In-Person Session",
    "video-call": "Video Call"
  };

  const serviceTypeIcons = {
    "custom-video": "🎬",
    "custom-photos": "📸",
    "in-person": "🤝",
    "video-call": "📹"
  };

  function formatCurrency(amount) {
    return "$" + amount.toFixed(2);
  }

  function calculateFees(creatorFee) {
    const platformFee = creatorFee * PLATFORM_FEE_PERCENT;
    const subtotal = creatorFee + platformFee;
    const processingFee = (subtotal * STRIPE_PERCENT) + STRIPE_FLAT;
    const total = subtotal + processingFee;
    return { creatorFee, platformFee, processingFee, total };
  }

  function getProfiles() {
    return JSON.parse(localStorage.getItem("creatorProfiles") || "{}");
  }

  function saveProfiles(profiles) {
    localStorage.setItem("creatorProfiles", JSON.stringify(profiles));
  }

  if (creatorParam) {
    renderStorefront(creatorParam);
  } else {
    renderSetupForm();
  }

  function renderSetupForm() {
    const setupSection = document.getElementById("creator-setup");
    setupSection.classList.remove("hidden");

    const pendingServices = [];
    const servicesList = document.getElementById("services-list");
    const addServiceBtn = document.getElementById("add-service-btn");
    const saveProfileBtn = document.getElementById("save-profile-btn");
    const setupFeedback = document.getElementById("setup-feedback");
    const storefrontLinkDiv = document.getElementById("storefront-link");
    const viewStorefrontLink = document.getElementById("view-storefront-link");

    function renderPendingServices() {
      servicesList.innerHTML = "";
      if (pendingServices.length === 0) {
        servicesList.innerHTML = '<p style="color:#888;">No services added yet. Add at least one service below.</p>';
        return;
      }
      pendingServices.forEach((svc, idx) => {
        const el = document.createElement("div");
        el.className = "service-card";
        el.innerHTML = `
          <div class="service-card-header">
            <span class="service-type-badge">${serviceTypeIcons[svc.type] || ""} ${serviceTypeLabels[svc.type] || svc.type}</span>
            <button class="btn-remove" data-idx="${idx}">&times;</button>
          </div>
          <h4>${svc.title}</h4>
          <p>${svc.description}</p>
          <span class="service-price">${formatCurrency(svc.price)}</span>
        `;
        servicesList.appendChild(el);
      });

      servicesList.querySelectorAll(".btn-remove").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-idx"));
          pendingServices.splice(idx, 1);
          renderPendingServices();
        });
      });
    }

    renderPendingServices();

    addServiceBtn.addEventListener("click", () => {
      const type = document.getElementById("service-type").value;
      const title = document.getElementById("service-title").value.trim();
      const description = document.getElementById("service-description").value.trim();
      const price = parseFloat(document.getElementById("service-price").value);

      if (!title) { setupFeedback.textContent = "Service title is required."; setupFeedback.style.color = "#f55"; return; }
      if (!description) { setupFeedback.textContent = "Service description is required."; setupFeedback.style.color = "#f55"; return; }
      if (isNaN(price) || price <= 0) { setupFeedback.textContent = "Enter a valid price."; setupFeedback.style.color = "#f55"; return; }

      pendingServices.push({
        id: "svc_" + Date.now(),
        type,
        title,
        description,
        price
      });

      document.getElementById("service-title").value = "";
      document.getElementById("service-description").value = "";
      document.getElementById("service-price").value = "";
      setupFeedback.textContent = "";

      renderPendingServices();
    });

    saveProfileBtn.addEventListener("click", () => {
      const name = document.getElementById("creator-name").value.trim();
      const bio = document.getElementById("creator-bio").value.trim();

      if (!name) { setupFeedback.textContent = "Creator name is required."; setupFeedback.style.color = "#f55"; return; }
      if (pendingServices.length === 0) { setupFeedback.textContent = "Add at least one service."; setupFeedback.style.color = "#f55"; return; }

      const profiles = getProfiles();
      profiles[name] = {
        name,
        bio,
        services: pendingServices
      };
      saveProfiles(profiles);

      setupFeedback.textContent = "Profile saved successfully!";
      setupFeedback.style.color = "#0f0";

      viewStorefrontLink.href = `/creators.html?creator=${encodeURIComponent(name)}`;
      storefrontLinkDiv.classList.remove("hidden");
    });
  }

  function renderStorefront(creatorName) {
    const profiles = getProfiles();
    const profile = profiles[creatorName];

    const storefrontSection = document.getElementById("storefront");
    storefrontSection.classList.remove("hidden");

    if (!profile) {
      storefrontSection.innerHTML = `
        <a href="/" class="back-link">&larr; Back to Browse</a>
        <div style="text-align:center; padding:2rem;">
          <h2>Creator Not Found</h2>
          <p>This creator profile doesn't exist.</p>
          <a href="/" class="btn-primary">Browse Creators</a>
        </div>
      `;
      return;
    }

    const initial = creatorName.charAt(0).toUpperCase();
    document.getElementById("storefront-avatar").textContent = initial;
    document.getElementById("storefront-name").textContent = profile.name || creatorName;
    document.getElementById("storefront-bio").textContent = profile.bio || "No bio yet.";
    document.title = `${profile.name || creatorName} - Adult Content Marketplace`;

    const servicesContainer = document.getElementById("storefront-services");
    const services = profile.services || [];

    if (services.length === 0) {
      servicesContainer.innerHTML = '<p style="color:#888;">This creator has no services listed yet.</p>';
      return;
    }

    services.forEach((svc, idx) => {
      const card = document.createElement("div");
      card.className = "service-card";
      card.innerHTML = `
        <div class="service-card-header">
          <span class="service-type-badge">${serviceTypeIcons[svc.type] || ""} ${serviceTypeLabels[svc.type] || svc.type}</span>
        </div>
        <h4>${svc.title}</h4>
        <p>${svc.description}</p>
        <span class="service-price">${formatCurrency(svc.price)}</span>
        <button class="btn-order" data-idx="${idx}">Order</button>
      `;
      servicesContainer.appendChild(card);
    });

    servicesContainer.querySelectorAll(".btn-order").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-idx"));
        openOrderForm(profile, services[idx]);
      });
    });
  }

  function openOrderForm(profile, service) {
    const container = document.getElementById("order-form-container");
    container.classList.remove("hidden");
    container.scrollIntoView({ behavior: "smooth" });

    document.getElementById("order-service-name").textContent = `Ordering: ${service.title} from ${profile.name}`;

    const inPersonFields = document.getElementById("in-person-fields");
    if (service.type === "in-person") {
      inPersonFields.classList.remove("hidden");
    } else {
      inPersonFields.classList.add("hidden");
    }

    const fees = calculateFees(service.price);
    document.getElementById("order-creator-fee").textContent = formatCurrency(fees.creatorFee);
    document.getElementById("order-platform-fee").textContent = formatCurrency(fees.platformFee);
    document.getElementById("order-processing-fee").textContent = formatCurrency(fees.processingFee);
    document.getElementById("order-total").textContent = formatCurrency(fees.total);

    const placeOrderBtn = document.getElementById("place-order-btn");
    const cancelOrderBtn = document.getElementById("cancel-order-btn");
    const orderFeedback = document.getElementById("order-feedback");

    const newPlaceBtn = placeOrderBtn.cloneNode(true);
    placeOrderBtn.parentNode.replaceChild(newPlaceBtn, placeOrderBtn);
    const newCancelBtn = cancelOrderBtn.cloneNode(true);
    cancelOrderBtn.parentNode.replaceChild(newCancelBtn, cancelOrderBtn);

    newCancelBtn.addEventListener("click", () => {
      container.classList.add("hidden");
      document.getElementById("buyer-name").value = "";
      document.getElementById("buyer-email").value = "";
      document.getElementById("buyer-details").value = "";
      orderFeedback.textContent = "";
    });

    newPlaceBtn.addEventListener("click", () => {
      const buyerName = document.getElementById("buyer-name").value.trim();
      const buyerEmail = document.getElementById("buyer-email").value.trim();

      if (!buyerName) { orderFeedback.textContent = "Your name is required."; orderFeedback.style.color = "#f55"; return; }
      if (!buyerEmail) { orderFeedback.textContent = "Your email is required."; orderFeedback.style.color = "#f55"; return; }

      orderFeedback.textContent = "Processing order...";
      orderFeedback.style.color = "#0f0";

      setTimeout(() => {
        orderFeedback.textContent = "Order placed! Payment integration coming soon. The creator will be notified.";
        orderFeedback.style.color = "#ff0";
      }, 1500);
    });
  }
});
