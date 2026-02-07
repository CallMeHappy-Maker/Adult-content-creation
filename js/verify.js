document.addEventListener("DOMContentLoaded", () => {
  const dobMonth = document.getElementById("v-dob-month");
  const dobDay = document.getElementById("v-dob-day");
  const dobYear = document.getElementById("v-dob-year");
  const idFileInput = document.getElementById("v-id-file");
  const idPreview = document.getElementById("id-preview");
  const idPreviewImg = document.getElementById("id-preview-img");
  const removeIdBtn = document.getElementById("remove-id-btn");
  const submitBtn = document.getElementById("submit-verification");
  const feedback = document.getElementById("verify-feedback");
  const verifyForm = document.getElementById("verify-form");
  const verifySuccess = document.getElementById("verify-success");
  const specialtiesSection = document.getElementById("specialties-section");
  const statusBar = document.getElementById("verification-status-bar");
  const statusBadge = document.getElementById("status-badge");

  let idDocumentData = null;

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

  document.querySelectorAll('input[name="account_type"]').forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.value === "creator") {
        specialtiesSection.classList.remove("hidden");
      } else {
        specialtiesSection.classList.add("hidden");
      }
    });
  });

  idFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showFeedback("File must be under 5MB.", "#f55");
      return;
    }

    if (!file.type.startsWith("image/")) {
      showFeedback("Please select an image file.", "#f55");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      idDocumentData = ev.target.result;
      idPreviewImg.src = idDocumentData;
      idPreview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  removeIdBtn.addEventListener("click", () => {
    idDocumentData = null;
    idPreview.classList.add("hidden");
    idFileInput.value = "";
  });

  async function checkExistingProfile() {
    try {
      const authData = getCurrentUser();
      if (!authData || !authData.user) return;

      if (authData.profile) {
        const p = authData.profile;
        if (p.verification_status === 'submitted' || p.verification_status === 'verified') {
          statusBar.classList.remove("hidden");
          const statusText = p.verification_status === 'verified' ? 'Verified' : 'Under Review';
          const statusClass = p.verification_status === 'verified' ? 'status-verified' : 'status-submitted';
          statusBadge.className = 'status-badge ' + statusClass;
          statusBadge.textContent = 'Status: ' + statusText;
        }

        if (p.account_type) {
          const radio = document.querySelector(`input[name="account_type"][value="${p.account_type}"]`);
          if (radio) {
            radio.checked = true;
            if (p.account_type === 'creator') specialtiesSection.classList.remove("hidden");
          }
        }
        if (p.stage_name) document.getElementById("v-stage-name").value = p.stage_name;
        if (p.legal_first_name) document.getElementById("v-legal-first").value = p.legal_first_name;
        if (p.legal_last_name) document.getElementById("v-legal-last").value = p.legal_last_name;
        if (p.city) document.getElementById("v-city").value = p.city;
        if (p.state_province) document.getElementById("v-state").value = p.state_province;
        if (p.country) document.getElementById("v-country").value = p.country;
        if (p.bio) document.getElementById("v-bio").value = p.bio;
        if (p.id_document_type) document.getElementById("v-id-type").value = p.id_document_type;

        if (p.date_of_birth) {
          const dob = new Date(p.date_of_birth);
          dobMonth.value = dob.getMonth() + 1;
          populateDays();
          dobDay.value = dob.getDate();
          dobYear.value = dob.getFullYear();
        }

        if (p.specialties && Array.isArray(p.specialties)) {
          p.specialties.forEach(s => {
            const cb = document.querySelector(`input[name="v-specialty"][value="${s}"]`);
            if (cb) cb.checked = true;
          });
        }
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    }
  }

  setTimeout(checkExistingProfile, 500);

  submitBtn.addEventListener("click", async () => {
    const accountType = document.querySelector('input[name="account_type"]:checked');
    const stageName = document.getElementById("v-stage-name").value.trim();
    const legalFirst = document.getElementById("v-legal-first").value.trim();
    const legalLast = document.getElementById("v-legal-last").value.trim();
    const month = parseInt(dobMonth.value);
    const day = parseInt(dobDay.value);
    const year = parseInt(dobYear.value);
    const city = document.getElementById("v-city").value.trim();
    const state = document.getElementById("v-state").value.trim();
    const country = document.getElementById("v-country").value;
    const bio = document.getElementById("v-bio").value.trim();
    const idType = document.getElementById("v-id-type").value;

    if (!accountType) { showFeedback("Please select an account type.", "#f55"); return; }
    if (!stageName) { showFeedback("Please enter a display name.", "#f55"); return; }
    if (!legalFirst || !legalLast) { showFeedback("Please enter your legal name.", "#f55"); return; }
    if (!month || !day || !year) { showFeedback("Please enter your full date of birth.", "#f55"); return; }

    const dob = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;

    if (age < 18) { showFeedback("You must be 18 or older to use this platform.", "#f55"); return; }
    if (!city || !state || !country) { showFeedback("Please complete your location.", "#f55"); return; }
    if (!idDocumentData) { showFeedback("Please upload an ID document.", "#f55"); return; }

    let specialties = [];
    if (accountType.value === 'creator') {
      document.querySelectorAll('input[name="v-specialty"]:checked').forEach(cb => {
        specialties.push(cb.value);
      });
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
    showFeedback("Uploading ID document...", "#0ff");

    try {
      const idRes = await fetch('/api/profile/upload-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_document: idDocumentData,
          id_document_type: idType,
        }),
      });

      if (idRes.status === 401) {
        window.location.href = '/api/login';
        return;
      }

      if (!idRes.ok) {
        const err = await idRes.json();
        throw new Error(err.error || 'Failed to upload ID');
      }

      showFeedback("Saving profile...", "#0ff");

      const dobStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const profileRes = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_type: accountType.value,
          stage_name: stageName,
          legal_first_name: legalFirst,
          legal_last_name: legalLast,
          date_of_birth: dobStr,
          city: city,
          state_province: state,
          country: country,
          bio: bio || null,
          specialties: specialties.length > 0 ? specialties : null,
        }),
      });

      if (!profileRes.ok) {
        const err = await profileRes.json();
        throw new Error(err.error || 'Failed to save profile');
      }

      verifyForm.classList.add("hidden");
      verifySuccess.classList.remove("hidden");
    } catch (error) {
      showFeedback(error.message || "An error occurred. Please try again.", "#f55");
      submitBtn.disabled = false;
      submitBtn.textContent = "Complete Verification";
    }
  });

  function showFeedback(msg, color) {
    feedback.textContent = msg;
    feedback.style.color = color;
  }
});
