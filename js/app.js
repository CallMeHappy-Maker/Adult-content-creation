// -----------------------------
// FET Platform Creator Module
// -----------------------------

// DOM Elements
const createPostBtn = document.getElementById("create-post-btn");
const postContent = document.getElementById("post-content");
const visibilitySelect = document.getElementById("visibility");
const postMedia = document.getElementById("post-media");
const creatorNameInput = document.getElementById("creator-name");
const feedback = document.getElementById("creator-feedback");
const feedSection = document.getElementById("feed");
const filterSelect = document.getElementById("filter");

// -----------------------------
// Helper Functions
// -----------------------------

// Load posts from localStorage
document.addEventListener("DOMContentLoaded", () => {
  const savedPosts = JSON.parse(localStorage.getItem("creatorPosts") || "[]");
  savedPosts.forEach(p => addPostToFeed(p.content, p.visibility, null, p.creator));
});

// Save post to localStorage
function savePost(content, visibility, creator) {
  const savedPosts = JSON.parse(localStorage.getItem("creatorPosts") || "[]");
  savedPosts.unshift({ content, visibility, creator });
  localStorage.setItem("creatorPosts", JSON.stringify(savedPosts));
}

// Add a post element to feed
function addPostToFeed(content, visibility, mediaFile = null, creator = null) {
  const creatorName = creator || creatorNameInput.value.trim() || "Anonymous";

  const postEl = document.createElement("div");
  postEl.className = "post";

  // Media preview
  let mediaHTML = "";
  if (mediaFile) {
    const url = URL.createObjectURL(mediaFile);
    if (mediaFile.type.startsWith("image/")) mediaHTML = `<img src="${url}" style="max-width:100%; border-radius:6px;">`;
    else if (mediaFile.type.startsWith("video/")) mediaHTML = `<video src="${url}" controls style="max-width:100%; border-radius:6px;"></video>`;
  }

  postEl.innerHTML = `
    <strong><a href="/profile.html?creator=${encodeURIComponent(creatorName)}" class="creator-link">${creatorName}</a></strong>
    <p>${content}</p>
    ${mediaHTML}
    <small>Visibility: ${visibility}</small>
    <div style="margin-top:5px;">
      <button class="edit-btn">Edit</button>
      <button class="delete-btn">Delete</button>
    </div>
  `;

  // Event listeners for edit/delete
  const editBtn = postEl.querySelector(".edit-btn");
  const deleteBtn = postEl.querySelector(".delete-btn");

  editBtn.addEventListener("click", () => {
    const newContent = prompt("Edit your post:", content);
    if (newContent !== null && newContent.trim() !== "") {
      postEl.querySelector("p").textContent = newContent;

      // Update localStorage
      const posts = JSON.parse(localStorage.getItem("creatorPosts") || "[]");
      const idx = posts.findIndex(p => p.content === content && p.visibility === visibility && p.creator === creatorName);
      if (idx > -1) {
        posts[idx].content = newContent;
        localStorage.setItem("creatorPosts", JSON.stringify(posts));
      }
    }
  });

  deleteBtn.addEventListener("click", () => {
    postEl.remove();
    const posts = JSON.parse(localStorage.getItem("creatorPosts") || "[]");
    const idx = posts.findIndex(p => p.content === content && p.visibility === visibility && p.creator === creatorName);
    if (idx > -1) {
      posts.splice(idx, 1);
      localStorage.setItem("creatorPosts", JSON.stringify(posts));
    }
  });

  // Prepend post to feed
  feedSection.prepend(postEl);
}

// -----------------------------
// Event Listeners
// -----------------------------

createPostBtn.addEventListener("click", () => {
  const content = postContent.value.trim();
  const visibility = visibilitySelect.value;
  const mediaFile = postMedia.files[0] || null;
  const creator = creatorNameInput.value.trim() || "Anonymous";

  if (!content && !mediaFile) {
    feedback.textContent = "Post cannot be empty!";
    feedback.style.color = "#f55";
    return;
  }

  addPostToFeed(content, visibility, mediaFile, creator);
  savePost(content, visibility, creator);
  localStorage.setItem("lastCreatorName", creator);

  postContent.value = "";
  postMedia.value = "";
  visibilitySelect.value = "public";
  feedback.textContent = "Post created successfully!";
  feedback.style.color = "#0f0";
});

// Filter feed by visibility
filterSelect.addEventListener("change", () => {
  const filter = filterSelect.value;
  const allPosts = feedSection.querySelectorAll(".post");
  allPosts.forEach(post => {
    const vis = post.querySelector("small").textContent.replace("Visibility: ", "");
    post.style.display = filter === "all" || vis === filter ? "block" : "none";
  });
});
