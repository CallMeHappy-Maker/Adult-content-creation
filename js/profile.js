document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const creatorParam = params.get("creator");

  const profileName = document.getElementById("profile-name");
  const profileBio = document.getElementById("profile-bio");
  const profileAvatar = document.getElementById("profile-avatar");
  const statPosts = document.getElementById("stat-posts");
  const statPublic = document.getElementById("stat-public");
  const statFollowers = document.getElementById("stat-followers");
  const postList = document.getElementById("profile-post-list");
  const noPostsMsg = document.getElementById("no-posts-msg");
  const editProfileBtn = document.getElementById("edit-profile-btn");
  const profileEditSection = document.getElementById("profile-edit");
  const editBio = document.getElementById("edit-bio");
  const saveProfileBtn = document.getElementById("save-profile-btn");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");
  const allCreatorsSection = document.getElementById("all-creators");
  const creatorsList = document.getElementById("creators-list");
  const noCreatorsMsg = document.getElementById("no-creators-msg");

  const allPosts = JSON.parse(localStorage.getItem("creatorPosts") || "[]");
  const profiles = JSON.parse(localStorage.getItem("creatorProfiles") || "{}");

  function getInitial(name) {
    return name.charAt(0).toUpperCase();
  }

  function renderCreatorProfile(name) {
    const profile = profiles[name] || {};
    const creatorPosts = allPosts.filter(p => p.creator === name);

    profileName.textContent = name;
    profileBio.textContent = profile.bio || "No bio yet.";
    profileAvatar.textContent = getInitial(name);

    const publicCount = creatorPosts.filter(p => p.visibility === "public").length;
    const followersCount = creatorPosts.filter(p => p.visibility === "followers").length;

    statPosts.textContent = creatorPosts.length;
    statPublic.textContent = publicCount;
    statFollowers.textContent = followersCount;

    postList.innerHTML = "";
    if (creatorPosts.length === 0) {
      noPostsMsg.classList.remove("hidden");
    } else {
      noPostsMsg.classList.add("hidden");
      creatorPosts.forEach(post => {
        const postEl = document.createElement("div");
        postEl.className = "post";
        postEl.innerHTML = `
          <strong>${post.creator}</strong>
          <p>${post.content}</p>
          <small>Visibility: ${post.visibility}</small>
        `;
        postList.appendChild(postEl);
      });
    }

    allCreatorsSection.classList.add("hidden");
    document.title = `${name} - FET Platform`;
  }

  function renderAllCreators() {
    document.getElementById("profile-header").classList.add("hidden");
    document.getElementById("profile-posts").classList.add("hidden");
    allCreatorsSection.classList.remove("hidden");

    const creatorNames = [...new Set(allPosts.map(p => p.creator))];

    if (creatorNames.length === 0) {
      noCreatorsMsg.classList.remove("hidden");
      return;
    }

    noCreatorsMsg.classList.add("hidden");
    creatorsList.innerHTML = "";

    creatorNames.forEach(name => {
      const profile = profiles[name] || {};
      const postCount = allPosts.filter(p => p.creator === name).length;

      const card = document.createElement("a");
      card.href = `/profile.html?creator=${encodeURIComponent(name)}`;
      card.className = "creator-card";
      card.innerHTML = `
        <div class="creator-card-avatar">${getInitial(name)}</div>
        <div class="creator-card-info">
          <h4>${name}</h4>
          <p>${profile.bio || "No bio yet."}</p>
          <small>${postCount} post${postCount !== 1 ? "s" : ""}</small>
        </div>
      `;
      creatorsList.appendChild(card);
    });
  }

  const currentCreator = localStorage.getItem("lastCreatorName") || "";

  if (creatorParam) {
    renderCreatorProfile(creatorParam);
    if (creatorParam === currentCreator) {
      editProfileBtn.classList.remove("hidden");
    } else {
      editProfileBtn.classList.add("hidden");
    }
  } else {
    renderAllCreators();
  }

  editProfileBtn.addEventListener("click", () => {
    if (creatorParam !== currentCreator) return;
    const currentBio = profiles[creatorParam]?.bio || "";
    editBio.value = currentBio;
    profileEditSection.classList.remove("hidden");
    editProfileBtn.classList.add("hidden");
  });

  saveProfileBtn.addEventListener("click", () => {
    if (!creatorParam) return;
    profiles[creatorParam] = profiles[creatorParam] || {};
    profiles[creatorParam].bio = editBio.value.trim();
    localStorage.setItem("creatorProfiles", JSON.stringify(profiles));
    profileBio.textContent = profiles[creatorParam].bio || "No bio yet.";
    profileEditSection.classList.add("hidden");
    editProfileBtn.classList.remove("hidden");
  });

  cancelEditBtn.addEventListener("click", () => {
    profileEditSection.classList.add("hidden");
    editProfileBtn.classList.remove("hidden");
  });
});
