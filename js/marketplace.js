document.addEventListener("DOMContentLoaded", () => {
  const profiles = JSON.parse(localStorage.getItem("creatorProfiles") || "{}");
  const grid = document.getElementById("creator-grid");
  const noCreators = document.getElementById("no-creators");

  const serviceTypeLabels = {
    "custom-video": "Custom Video",
    "custom-photos": "Custom Photos",
    "in-person": "Availability Booking",
    "video-call": "Video Call"
  };

  const creatorNames = Object.keys(profiles);

  if (creatorNames.length === 0) {
    noCreators.classList.remove("hidden");
    return;
  }

  noCreators.classList.add("hidden");

  creatorNames.forEach(name => {
    const profile = profiles[name];
    const initial = name.charAt(0).toUpperCase();
    const bio = profile.bio || "No bio yet.";
    const bioSnippet = bio.length > 80 ? bio.substring(0, 80) + "..." : bio;

    const serviceTypes = (profile.services || []).map(s => {
      return `<span class="service-tag">${serviceTypeLabels[s.type] || s.type}</span>`;
    }).join("");

    const card = document.createElement("div");
    card.className = "creator-card";
    card.innerHTML = `
      <div class="creator-card-avatar">${initial}</div>
      <div class="creator-card-info">
        <h4>${profile.name || name}</h4>
        <p>${bioSnippet}</p>
        <div class="service-tags">${serviceTypes || '<span class="service-tag">No services yet</span>'}</div>
        <a href="/creators.html?creator=${encodeURIComponent(name)}" class="btn-view-profile">View Profile</a>
      </div>
    `;
    grid.appendChild(card);
  });
});
