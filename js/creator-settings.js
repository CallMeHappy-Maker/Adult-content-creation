function populateTimeSelects() {
  const startSelect = document.getElementById('start-time');
  const endSelect = document.getElementById('end-time');
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const val = hh + ':' + mm;
      const label = formatTime(h, m);
      startSelect.add(new Option(label, val));
      endSelect.add(new Option(label, val));
    }
  }
  startSelect.value = '09:00';
  endSelect.value = '17:00';
}

function formatTime(h, m) {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return hour12 + ':' + String(m).padStart(2, '0') + ' ' + period;
}

async function loadSettings() {
  try {
    const res = await fetch('/api/creator-settings');
    const data = await res.json();
    if (!data) return;

    if (data.availability_days) {
      const days = Array.isArray(data.availability_days) ? data.availability_days : JSON.parse(data.availability_days);
      document.querySelectorAll('input[name="avail-day"]').forEach(cb => {
        cb.checked = days.includes(cb.value);
      });
    }

    if (data.availability_start_time) {
      document.getElementById('start-time').value = data.availability_start_time.substring(0, 5);
    }
    if (data.availability_end_time) {
      document.getElementById('end-time').value = data.availability_end_time.substring(0, 5);
    }

    if (data.cancellation_buffer_hours != null) {
      document.getElementById('cancellation-buffer').value = String(data.cancellation_buffer_hours);
    }

    if (data.require_booking_approval != null) {
      const val = data.require_booking_approval ? 'on' : 'off';
      const radio = document.querySelector('input[name="booking-approval"][value="' + val + '"]');
      if (radio) radio.checked = true;
    }

    if (data.auto_block_after_violations != null) {
      document.getElementById('auto-block-violations').value = String(data.auto_block_after_violations);
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function saveSettings() {
  const feedback = document.getElementById('settings-feedback');
  feedback.textContent = '';

  const days = [];
  document.querySelectorAll('input[name="avail-day"]:checked').forEach(cb => {
    days.push(cb.value);
  });

  const payload = {
    availability_days: days,
    availability_start_time: document.getElementById('start-time').value,
    availability_end_time: document.getElementById('end-time').value,
    cancellation_buffer_hours: parseInt(document.getElementById('cancellation-buffer').value),
    require_booking_approval: document.querySelector('input[name="booking-approval"]:checked').value === 'on',
    auto_block_after_violations: parseInt(document.getElementById('auto-block-violations').value)
  };

  try {
    const res = await fetch('/api/creator-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      feedback.style.color = '#4CAF50';
      feedback.textContent = 'Settings saved successfully!';
    } else {
      feedback.style.color = '#CC0033';
      feedback.textContent = data.error || 'Failed to save settings.';
    }
  } catch (err) {
    feedback.style.color = '#CC0033';
    feedback.textContent = 'Network error. Please try again.';
  }

  setTimeout(() => { feedback.textContent = ''; }, 4000);
}

document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  if (!requireAuth()) return;
  populateTimeSelects();
  await loadSettings();
  document.getElementById('save-settings').addEventListener('click', saveSettings);
});
