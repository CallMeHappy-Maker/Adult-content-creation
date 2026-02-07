document.addEventListener('DOMContentLoaded', async () => {
  const auth = await initAuth();
  if (!auth || !auth.user) {
    window.location.href = '/account.html';
    return;
  }

  if (auth.profile && auth.profile.display_name) {
    document.getElementById('client-display-name').value = auth.profile.display_name;
  }
  if (auth.profile && auth.profile.location) {
    document.getElementById('client-location').value = auth.profile.location;
  }
  if (auth.profile && auth.profile.bio) {
    document.getElementById('client-bio').value = auth.profile.bio;
  }

  document.getElementById('save-client-btn').addEventListener('click', saveClientProfile);
});

async function saveClientProfile() {
  const displayName = document.getElementById('client-display-name').value.trim();
  const location = document.getElementById('client-location').value.trim();
  const bio = document.getElementById('client-bio').value.trim();
  const feedback = document.getElementById('client-signup-feedback');

  if (!displayName) {
    feedback.textContent = 'Please enter a display name.';
    feedback.style.color = '#ff4444';
    return;
  }

  const interests = Array.from(document.querySelectorAll('input[name="interest"]:checked')).map(cb => cb.value);

  const btn = document.getElementById('save-client-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  feedback.textContent = '';

  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_type: 'buyer',
        display_name: displayName,
        location: location,
        bio: bio,
        specialties: interests
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save profile');
    }

    document.querySelector('.signup-form').classList.add('hidden');
    document.getElementById('client-signup-success').classList.remove('hidden');
  } catch (err) {
    feedback.textContent = err.message;
    feedback.style.color = '#ff4444';
    btn.disabled = false;
    btn.textContent = 'Complete Setup';
  }
}
