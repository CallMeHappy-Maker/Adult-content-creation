document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const creatorParam = params.get("creator");

  const PLATFORM_FEE_PERCENT = 0.15;
  const STRIPE_PERCENT = 0.029;
  const STRIPE_FLAT = 0.30;

  const serviceTypeLabels = {
    "custom-video": "Custom Video",
    "custom-photos": "Custom Photos",
    "in-person": "Availability Booking",
    "video-call": "Video Call"
  };

  const serviceTypeIcons = {
    "custom-video": "🎬",
    "custom-photos": "📸",
    "in-person": "📅",
    "video-call": "📹"
  };

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

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

  if (creatorParam) {
    document.getElementById("creator-directory").classList.add("hidden");
    renderStorefront(creatorParam);
  } else {
    loadCreatorDirectory();
  }

  function setupSearch() {
    const searchBtn = document.getElementById("search-btn");
    const searchName = document.getElementById("search-name");

    searchBtn.addEventListener("click", () => loadCreatorDirectory());

    searchName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") loadCreatorDirectory();
    });
  }

  async function loadCreatorDirectory() {
    const grid = document.getElementById("creators-grid");
    const loading = document.getElementById("creators-loading");
    const noCreators = document.getElementById("no-creators");

    loading.classList.remove("hidden");
    grid.innerHTML = "";
    noCreators.classList.add("hidden");

    const search = document.getElementById("search-name").value.trim();
    const zip = document.getElementById("search-zip").value.trim();
    const radius = document.getElementById("search-radius").value;

    let url = "/api/creators?";
    if (search) url += "search=" + encodeURIComponent(search) + "&";
    if (zip) url += "zip_code=" + encodeURIComponent(zip) + "&";
    if (radius) url += "radius=" + encodeURIComponent(radius) + "&";

    try {
      const res = await fetch(url);
      const creators = await res.json();

      loading.classList.add("hidden");

      const localProfiles = getProfiles();
      const localCreators = Object.values(localProfiles).filter(p => {
        if (!search) return true;
        return p.name && p.name.toLowerCase().includes(search.toLowerCase());
      });

      const allCreators = [...creators];

      localCreators.forEach(lc => {
        const exists = allCreators.some(c =>
          (c.stage_name || '').toLowerCase() === (lc.name || '').toLowerCase()
        );
        if (!exists) {
          allCreators.push({
            stage_name: lc.name,
            bio: lc.bio,
            city: null,
            state_province: null,
            profile_image_url: null,
            specialties: null,
            _local: true
          });
        }
      });

      if (allCreators.length === 0) {
        noCreators.classList.remove("hidden");
        return;
      }

      allCreators.forEach(creator => {
        const card = document.createElement("a");
        card.className = "creator-directory-card";
        card.href = `/creators.html?creator=${encodeURIComponent(creator.stage_name || creator.display_name || 'Unknown')}`;

        const name = creator.stage_name || creator.display_name || "Unknown Creator";
        const location = [creator.city, creator.state_province].filter(Boolean).join(", ");

        let thumbHtml;
        if (creator.profile_image_url) {
          thumbHtml = `<img src="${esc(creator.profile_image_url)}" alt="${esc(name)}" class="creator-thumb-img">`;
        } else {
          const initial = name.charAt(0).toUpperCase();
          thumbHtml = `<span class="creator-thumb-initial">${initial}</span>`;
        }

        const specialtiesHtml = (creator.specialties || []).map(s =>
          `<span class="creator-specialty-tag">${esc(serviceTypeLabels[s] || s)}</span>`
        ).join('');

        card.innerHTML = `
          <div class="creator-thumb">${thumbHtml}</div>
          <div class="creator-card-info">
            <h3 class="creator-card-name">${esc(name)}</h3>
            ${location ? `<p class="creator-card-location">${esc(location)}</p>` : ''}
            ${creator.bio ? `<p class="creator-card-bio">${esc((creator.bio || '').substring(0, 100))}${(creator.bio || '').length > 100 ? '...' : ''}</p>` : ''}
            ${specialtiesHtml ? `<div class="creator-card-specialties">${specialtiesHtml}</div>` : ''}
          </div>
        `;

        grid.appendChild(card);
      });
    } catch (err) {
      loading.classList.add("hidden");
      console.error("Failed to load creators:", err);

      const localProfiles = getProfiles();
      const localCreators = Object.values(localProfiles);

      if (localCreators.length === 0) {
        noCreators.classList.remove("hidden");
        return;
      }

      localCreators.forEach(lc => {
        const card = document.createElement("a");
        card.className = "creator-directory-card";
        card.href = `/creators.html?creator=${encodeURIComponent(lc.name)}`;
        const initial = (lc.name || '?').charAt(0).toUpperCase();
        card.innerHTML = `
          <div class="creator-thumb"><span class="creator-thumb-initial">${initial}</span></div>
          <div class="creator-card-info">
            <h3 class="creator-card-name">${esc(lc.name)}</h3>
            ${lc.bio ? `<p class="creator-card-bio">${esc(lc.bio.substring(0, 100))}</p>` : ''}
          </div>
        `;
        grid.appendChild(card);
      });
    }
  }

  setupSearch();

  async function renderStorefront(creatorName) {
    const profiles = getProfiles();
    let profile = profiles[creatorName];
    let dbCreator = null;

    if (!profile) {
      try {
        const res = await fetch(`/api/creators/${encodeURIComponent(creatorName)}`);
        if (res.ok) {
          dbCreator = await res.json();
          profile = {
            name: dbCreator.stage_name || dbCreator.display_name || creatorName,
            bio: dbCreator.bio,
            services: [],
            _db: true,
            profile_image_url: dbCreator.profile_image_url,
            city: dbCreator.city,
            state_province: dbCreator.state_province,
            specialties: dbCreator.specialties
          };
        }
      } catch (e) {
        console.error("Failed to fetch creator from DB:", e);
      }
    }

    const storefrontSection = document.getElementById("storefront");
    storefrontSection.classList.remove("hidden");

    if (!profile) {
      storefrontSection.innerHTML = `
        <a href="/creators.html" class="back-link">&larr; Back to All Creators</a>
        <div style="text-align:center; padding:2rem;">
          <h2>Creator Not Found</h2>
          <p>This creator profile doesn't exist yet.</p>
          <a href="/creators.html" class="btn-primary">Browse Creators</a>
        </div>
      `;
      return;
    }

    const avatarInitial = document.getElementById("storefront-avatar-initial");
    const avatarImg = document.getElementById("storefront-avatar-img");
    const initial = creatorName.charAt(0).toUpperCase();

    if (profile.profile_image_url) {
      avatarInitial.classList.add("hidden");
      avatarImg.src = profile.profile_image_url;
      avatarImg.classList.remove("hidden");
    } else {
      avatarInitial.textContent = initial;
    }

    document.getElementById("storefront-name").textContent = profile.name || creatorName;
    document.getElementById("storefront-bio").textContent = profile.bio || "No bio yet.";
    document.title = `${profile.name || creatorName} - Adult Content Marketplace`;

    const locationParts = [profile.city, profile.state_province].filter(Boolean);
    if (locationParts.length > 0) {
      document.getElementById("storefront-location").textContent = locationParts.join(", ");
    }

    if (profile.specialties && profile.specialties.length > 0) {
      const specEl = document.getElementById("storefront-specialties");
      specEl.innerHTML = profile.specialties.map(s =>
        `<span class="creator-specialty-tag">${esc(serviceTypeLabels[s] || s)}</span>`
      ).join('');
    }

    const headerEl = document.getElementById("storefront-header");
    const msgLink = document.createElement("a");
    msgLink.href = "#";
    msgLink.className = "btn-message-creator";
    msgLink.textContent = "Message This Creator";
    msgLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof requireVerified === 'function' && !requireVerified('message this creator')) return;

      const authData = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
      if (authData && authData.user) {
        const prof = authData.profile;
        const buyerName = prof && prof.stage_name ? prof.stage_name : (authData.user.first_name || authData.user.email || 'User');
        window.location.href = `/chat.html?creator=${encodeURIComponent(creatorName)}&buyer=${encodeURIComponent(buyerName)}`;
      } else {
        const buyerName = prompt("Enter your name to message this creator:");
        if (buyerName && buyerName.trim()) {
          window.location.href = `/chat.html?creator=${encodeURIComponent(creatorName)}&buyer=${encodeURIComponent(buyerName.trim())}`;
        }
      }
    });
    headerEl.appendChild(msgLink);

    const servicesContainer = document.getElementById("storefront-services");
    let services = profile.services || [];

    let bookingsPaused = false;
    try {
      const ksRes = await fetch('/api/platform-settings/pause_availability_bookings');
      const ksData = await ksRes.json();
      bookingsPaused = ksData.value === 'true';
    } catch (e) {}

    if (bookingsPaused) {
      services = services.filter(s => s.type !== 'in-person');
    }

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
        <h4>${esc(svc.title)}</h4>
        <p>${esc(svc.description)}</p>
        <span class="service-price">${formatCurrency(svc.price)}</span>
        <button class="btn-order" data-idx="${idx}">Order</button>
      `;
      servicesContainer.appendChild(card);
    });

    servicesContainer.querySelectorAll(".btn-order").forEach(btn => {
      btn.addEventListener("click", () => {
        if (typeof requireVerified === 'function' && !requireVerified('place an order')) return;
        const idx = parseInt(btn.getAttribute("data-idx"));
        openOrderForm(profile, services[idx]);
      });
    });
  }

  function containsAddress(text) {
    const addressPatterns = [
      /\d{1,5}\s+\w+\s+(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|way|pl|place)\b/i,
      /\b(apt|apartment|suite|unit|#)\s*\d+/i,
      /\b\d{5}(-\d{4})?\b/,
    ];
    return addressPatterns.some(p => p.test(text));
  }

  const detailsInput = document.getElementById("buyer-details");
  const detailsHint = document.getElementById("buyer-details-hint");
  if (detailsInput && detailsHint) {
    detailsInput.addEventListener("input", () => {
      detailsHint.textContent = `${detailsInput.value.length}/500 characters`;
    });
  }

  async function openOrderForm(profile, service) {
    const container = document.getElementById("order-form-container");
    let orderFeedback = document.getElementById("order-feedback");

    const isInPerson = service.type === "in-person";

    if (isInPerson) {
      try {
        const ksRes = await fetch('/api/platform-settings/pause_availability_bookings');
        const ksData = await ksRes.json();
        if (ksData.value === 'true') {
          orderFeedback.textContent = "Availability bookings are temporarily paused. Please check back later.";
          orderFeedback.style.color = "#f55";
          container.classList.remove("hidden");
          container.scrollIntoView({ behavior: "smooth" });
          return;
        }
      } catch (e) {}
    }

    container.classList.remove("hidden");
    container.scrollIntoView({ behavior: "smooth" });

    document.getElementById("order-service-name").textContent = `Ordering: ${service.title} from ${profile.name}`;

    const inPersonFields = document.getElementById("in-person-fields");
    const disclaimerEl = document.getElementById("platform-disclaimer");

    if (isInPerson) {
      inPersonFields.classList.remove("hidden");
      disclaimerEl.classList.remove("hidden");

      const areaInfo = document.getElementById("in-person-creator-area");
      const locationParts = [profile.city, profile.state_province].filter(Boolean);
      let areaHtml = '';
      if (locationParts.length > 0) {
        areaHtml = `<p><strong>Creator's General Area:</strong> ${esc(locationParts.join(", "))}</p>`;
      } else {
        areaHtml = `<p><strong>Creator's General Area:</strong> Not specified — arrange via messaging after booking.</p>`;
      }

      fetch(`/api/creators/${encodeURIComponent(profile.name)}/settings`)
        .then(r => r.json())
        .then(settings => {
          if (settings) {
            const dayMap = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
            const days = (settings.availability_days || '').split(',').map(d => dayMap[d] || d).join(', ');
            const start = settings.availability_start_time || '10:00';
            const end = settings.availability_end_time || '18:00';
            const buffer = settings.cancellation_buffer_hours || 48;
            const approval = settings.require_booking_approval ? 'Yes — creator must approve before confirmation' : 'No — instant booking';

            areaHtml += `<div class="creator-availability-info">
              <p><strong>Available Days:</strong> ${esc(days)}</p>
              <p><strong>Hours:</strong> ${esc(start)} – ${esc(end)}</p>
              <p><strong>Cancellation Policy:</strong> ${buffer}h notice required</p>
              <p><strong>Requires Approval:</strong> ${approval}</p>
            </div>`;
          }
          areaInfo.innerHTML = areaHtml;
        })
        .catch(() => { areaInfo.innerHTML = areaHtml; });

      document.querySelectorAll(".safety-cb").forEach(cb => { cb.checked = false; });
    } else {
      inPersonFields.classList.add("hidden");
      disclaimerEl.classList.add("hidden");
    }

    const fees = calculateFees(service.price);
    document.getElementById("order-creator-fee").textContent = formatCurrency(fees.creatorFee);
    document.getElementById("order-platform-fee").textContent = formatCurrency(fees.platformFee);
    document.getElementById("order-processing-fee").textContent = formatCurrency(fees.processingFee);
    document.getElementById("order-total").textContent = formatCurrency(fees.total);

    const placeOrderBtn = document.getElementById("place-order-btn");
    const cancelOrderBtn = document.getElementById("cancel-order-btn");
    orderFeedback = document.getElementById("order-feedback");

    const newPlaceBtn = placeOrderBtn.cloneNode(true);
    placeOrderBtn.parentNode.replaceChild(newPlaceBtn, placeOrderBtn);
    const newCancelBtn = cancelOrderBtn.cloneNode(true);
    cancelOrderBtn.parentNode.replaceChild(newCancelBtn, cancelOrderBtn);

    newCancelBtn.addEventListener("click", () => {
      container.classList.add("hidden");
      disclaimerEl.classList.add("hidden");
      document.getElementById("buyer-name").value = "";
      document.getElementById("buyer-email").value = "";
      document.getElementById("buyer-details").value = "";
      orderFeedback.textContent = "";
    });

    newPlaceBtn.addEventListener("click", async () => {
      const buyerName = document.getElementById("buyer-name").value.trim();
      const buyerEmail = document.getElementById("buyer-email").value.trim();

      if (!buyerName) { orderFeedback.textContent = "Your name is required."; orderFeedback.style.color = "#f55"; return; }
      if (!buyerEmail) { orderFeedback.textContent = "Your email is required."; orderFeedback.style.color = "#f55"; return; }

      const buyerDetailsVal = document.getElementById("buyer-details").value.trim();
      if (containsAddress(buyerDetailsVal)) {
        orderFeedback.textContent = "Please do not include street addresses, apartment numbers, or zip codes in your request details. Location arrangements should happen off-platform.";
        orderFeedback.style.color = "#f55";
        return;
      }

      if (isInPerson) {
        const allChecked = Array.from(document.querySelectorAll(".safety-cb")).every(cb => cb.checked);
        if (!allChecked) {
          orderFeedback.textContent = "You must accept all safety checklist items before placing an availability booking.";
          orderFeedback.style.color = "#f55";
          document.getElementById("safety-checklist").scrollIntoView({ behavior: "smooth" });
          return;
        }
      }

      orderFeedback.textContent = "Processing order...";
      orderFeedback.style.color = "#0f0";

      try {
        if (isInPerson) {
          const disclaimerRes = await fetch('/api/booking-disclaimer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serviceType: service.type,
              creatorName: profile.name,
            })
          });
          if (!disclaimerRes.ok) {
            const err = await disclaimerRes.json();
            orderFeedback.textContent = err.error || 'Failed to log disclaimer acceptance.';
            orderFeedback.style.color = "#f55";
            return;
          }
        }

        const buyerDetails = document.getElementById("buyer-details").value.trim();
        const sessionDetails = {};
        if (isInPerson) {
          const locationParts = [profile.city, profile.state_province].filter(Boolean);
          if (locationParts.length > 0) sessionDetails.city = locationParts[0];
        }

        const checkoutRes = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceName: service.title,
            creatorName: profile.name,
            amount: Math.round(fees.total * 100),
            description: `${service.title} from ${profile.name}`,
            serviceType: service.type,
            sessionDetails,
          })
        });

        const checkoutData = await checkoutRes.json();
        if (!checkoutRes.ok) {
          orderFeedback.textContent = checkoutData.error || 'Failed to create checkout session.';
          orderFeedback.style.color = "#f55";
          return;
        }

        if (checkoutData.url) {
          window.location.href = checkoutData.url;
        } else {
          orderFeedback.textContent = "Checkout session created. Redirecting...";
        }
      } catch (err) {
        orderFeedback.textContent = "Something went wrong. Please try again.";
        orderFeedback.style.color = "#f55";
      }
    });
  }
});
