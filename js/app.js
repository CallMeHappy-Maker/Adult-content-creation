const createPostBtn = document.getElementById("create-post-btn");
const postContent = document.getElementById("post-content");
const postMedia = document.getElementById("post-media");
const visibilitySelect = document.getElementById("visibility");
const feedback = document.getElementById("creator-feedback");
const feedSection = document.getElementById("feed");
const filterSelect = document.getElementById("filter");
const creatorNameInput = document.getElementById("creator-name");

document.addEventListener("DOMContentLoaded", () => {
  const savedPosts = JSON.parse(localStorage.getItem("creatorPosts") || "[]");
  savedPosts.forEach(p => addPostToFeed(p.content, p.visibility, null, p.creator));
});

function savePost(content, visibility, creator) {
  const savedPosts = JSON.parse(localStorage.getItem("creatorPosts") || "[]");
  savedPosts.unshift({ content, visibility, creator });
  localStorage.setItem("creatorPosts", JSON.stringify(savedPosts));
}

function addPostToFeed(content, visibility, mediaFile = null, creator = "Anonymous") {
  const postEl = document.createElement("div");
  postEl.className = "post";
  postEl.dataset.visibility = visibility;

  let mediaHTML = "";
  if (mediaFile) {
    const url = URL.createObjectURL(mediaFile);
    if (mediaFile.type.startsWith("image/")) {
      mediaHTML = `<img src="${url}" style="max-width:100%; border-radius:6px;">`;
    } else if (mediaFile.type.startsWith("video/")) {
      mediaHTML = `<video src="${url}" controls style="max-width:100%; border-radius:6px;"></video>`;
    }
  }

  postEl.innerHTML = `
    <strong>${creator}</strong>
    <p>${content}</p>
    ${mediaHTML}
    <small>Visibility: ${visibility}</small>
    <div style="margin-top:5px;">
      <button class="edit-btn">Edit</button>
      <button class="delete-btn">Delete</button>
    </div>
  `;

  const editBtn = postEl.querySelector(".edit-btn");
  const deleteBtn = postEl.querySelector(".delete-btn");

  editBtn.addEventListener("click", () => {
    const newContent = prompt("Edit your post:", content);
    if (newContent !== null) {
      postEl.querySelector("p").textContent = newContent;
      const posts = JSON.parse(localStorage.getItem("creatorPosts") || "[]");
      const idx = posts.findIndex(p => p.content === content && p.visibility === visibility);
      if (idx > -1) {
        posts[idx].content = newContent;
        localStorage.setItem("creatorPosts", JSON.stringify(posts));
      }
      content = newContent;
    }
  });

  deleteBtn.addEventListener("click", () => {
    postEl.remove();
    const posts = JSON.parse(localStorage.getItem("creatorPosts") || "[]");
    const idx = posts.findIndex(p => p.content === content && p.visibility === visibility);
    if (idx > -1) {
      posts.splice(idx, 1);
      localStorage.setItem("creatorPosts", JSON.stringify(posts));
    }
  });

  feedSection.prepend(postEl);

  const currentFilter = filterSelect.value;
  if (currentFilter !== "all" && visibility !== currentFilter) {
    postEl.style.display = "none";
  }
}

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

  postContent.value = "";
  postMedia.value = "";
  visibilitySelect.value = "public";
  feedback.textContent = "Post created successfully!";
  feedback.style.color = "#0f0";
});

filterSelect.addEventListener("change", () => {
  const filter = filterSelect.value;
  const allPosts = feedSection.querySelectorAll(".post");
  allPosts.forEach(post => {
    const vis = post.dataset.visibility;
    post.style.display = filter === "all" || vis === filter ? "block" : "none";
  });
});
