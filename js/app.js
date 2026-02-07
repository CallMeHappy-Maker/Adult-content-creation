const createPostBtn = document.getElementById("create-post-btn");
const postContent = document.getElementById("post-content");
const visibilitySelect = document.getElementById("visibility");
const feedback = document.getElementById("creator-feedback");
const feedSection = document.getElementById("feed");

createPostBtn.addEventListener("click", () => {
  const content = postContent.value.trim();
  const visibility = visibilitySelect.value;

  if (!content) {
    feedback.textContent = "Post cannot be empty!";
    feedback.style.color = "#f55";
    return;
  }

  const postEl = document.createElement("div");
  postEl.className = "post";
  postEl.innerHTML = `
    <p>${content}</p>
    <small>Visibility: ${visibility}</small>
  `;

  feedSection.prepend(postEl);

  postContent.value = "";
  visibilitySelect.value = "public";
  feedback.textContent = "Post created successfully!";
  feedback.style.color = "#0f0";
});
