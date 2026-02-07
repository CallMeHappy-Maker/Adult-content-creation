(function() {
  const gate = document.getElementById('age-gate');
  const content = document.getElementById('main-content');

  if (sessionStorage.getItem('age_verified') === 'true') {
    if (gate) gate.style.display = 'none';
    if (content) content.classList.remove('hidden');
  }
})();

function acceptAge() {
  sessionStorage.setItem('age_verified', 'true');
  fetch('/api/age-confirm', { method: 'POST' }).catch(() => {});
  document.getElementById('age-gate').style.display = 'none';
  document.getElementById('main-content').classList.remove('hidden');
}
