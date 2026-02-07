document.addEventListener("DOMContentLoaded", () => {
  const dobMonth = document.getElementById("dob-month");
  const dobDay = document.getElementById("dob-day");
  const dobYear = document.getElementById("dob-year");
  const verifyBtn = document.getElementById("verify-age-btn");
  const ageFeedback = document.getElementById("age-verify-feedback");

  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 18; y >= currentYear - 100; y--) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    dobYear.appendChild(opt);
  }

  function populateDays() {
    const month = parseInt(dobMonth.value);
    const year = parseInt(dobYear.value) || currentYear;
    const currentDay = dobDay.value;
    dobDay.innerHTML = '<option value="">--</option>';
    if (!month) return;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      if (d === parseInt(currentDay)) opt.selected = true;
      dobDay.appendChild(opt);
    }
  }

  dobMonth.addEventListener("change", populateDays);
  dobYear.addEventListener("change", populateDays);

  verifyBtn.addEventListener("click", () => {
    const month = parseInt(dobMonth.value);
    const day = parseInt(dobDay.value);
    const year = parseInt(dobYear.value);

    if (!month || !day || !year) {
      ageFeedback.textContent = "Please select your full date of birth.";
      ageFeedback.style.color = "#f55";
      return;
    }

    const dob = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    if (age < 18) {
      ageFeedback.textContent = "You must be 18 or older to register as a creator.";
      ageFeedback.style.color = "#f55";
      return;
    }

    document.getElementById("age-verify-gate").classList.add("hidden");
    document.getElementById("main-content").classList.remove("hidden");
  });

  const profilePicInput = document.getElementById("profile-pic-input");
  const profilePicPreview = document.getElementById("profile-pic-preview");
  const profilePicImg = document.getElementById("profile-pic-img");
  const profilePicPlaceholder = document.getElementById("profile-pic-placeholder");
  let profilePicData = null;

  profilePicInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      document.getElementById("signup-feedback").textContent = "Image must be under 2MB.";
      document.getElementById("signup-feedback").style.color = "#f55";
      return;
    }

    if (!file.type.startsWith("image/")) {
      document.getElementById("signup-feedback").textContent = "Please select an image file.";
      document.getElementById("signup-feedback").style.color = "#f55";
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      profilePicData = ev.target.result;
      profilePicImg.src = profilePicData;
      profilePicImg.classList.remove("hidden");
      profilePicPlaceholder.classList.add("hidden");
    };
    reader.readAsDataURL(file);
  });

  profilePicPreview.addEventListener("click", () => {
    profilePicInput.click();
  });

  const saveBtn = document.getElementById("save-creator-btn");
  const feedback = document.getElementById("signup-feedback");

  saveBtn.addEventListener("click", () => {
    const stageName = document.getElementById("stage-name").value.trim();
    const bio = document.getElementById("creator-bio").value.trim();
    const specialties = Array.from(document.querySelectorAll('input[name="specialty"]:checked')).map(cb => cb.value);

    if (!stageName) {
      feedback.textContent = "Please enter your stage name.";
      feedback.style.color = "#f55";
      return;
    }

    if (stageName.length < 2) {
      feedback.textContent = "Stage name must be at least 2 characters.";
      feedback.style.color = "#f55";
      return;
    }

    if (specialties.length === 0) {
      feedback.textContent = "Please select at least one content specialty.";
      feedback.style.color = "#f55";
      return;
    }

    const profiles = JSON.parse(localStorage.getItem("creatorProfiles") || "{}");

    profiles[stageName] = {
      name: stageName,
      bio: bio,
      profilePic: profilePicData,
      specialties: specialties,
      services: profiles[stageName]?.services || [],
      createdAt: new Date().toISOString()
    };

    localStorage.setItem("creatorProfiles", JSON.stringify(profiles));

    feedback.textContent = "";
    saveBtn.classList.add("hidden");

    const successDiv = document.getElementById("signup-success");
    successDiv.classList.remove("hidden");
    document.getElementById("go-to-services").href = `/creators.html?creator=${encodeURIComponent(stageName)}&edit=1`;
    document.getElementById("view-my-storefront").href = `/creators.html?creator=${encodeURIComponent(stageName)}`;

    successDiv.scrollIntoView({ behavior: "smooth" });
  });
});
