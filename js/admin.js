document.addEventListener("DOMContentLoaded", async () => {
  const loading = document.getElementById("admin-loading");
  const denied = document.getElementById("admin-denied");
  const dashboard = document.getElementById("admin-dashboard");

  await new Promise(r => setTimeout(r, 500));

  try {
    const res = await fetch('/api/admin/check');
    if (!res.ok) {
      loading.classList.add("hidden");
      denied.classList.remove("hidden");
      return;
    }
  } catch {
    loading.classList.add("hidden");
    denied.classList.remove("hidden");
    return;
  }

  loading.classList.add("hidden");
  dashboard.classList.remove("hidden");

  loadStats();
  loadUsers();
  loadReviewQueue();
  loadMessages();
  loadKillSwitch();
});

async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const stats = await res.json();
    const grid = document.getElementById("stats-grid");

    const items = [
      { label: "Total Users", value: stats.totalUsers, color: "#CC0033" },
      { label: "Verified", value: stats.verifiedUsers, color: "#0f0" },
      { label: "Creators", value: stats.creators, color: "#f0f" },
      { label: "Buyers", value: stats.buyers, color: "#ff0" },
      { label: "Conversations", value: stats.totalConversations, color: "#CC0033" },
      { label: "Messages", value: stats.totalMessages, color: "#CC0033" },
      { label: "Stripe Connected", value: stats.stripeConnected, color: "#0f0" },
    ];

    grid.innerHTML = items.map(i => `
      <div class="stat-card">
        <div class="stat-value" style="color:${i.color}">${i.value}</div>
        <div class="stat-label">${i.label}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users');
    const users = await res.json();
    const tbody = document.getElementById("users-tbody");
    const countEl = document.getElementById("user-count");
    countEl.textContent = `${users.length} users`;

    tbody.innerHTML = users.map(u => {
      const name = u.stage_name || u.first_name || u.email || 'Unknown';
      const realName = [u.first_name, u.last_name].filter(Boolean).join(' ');
      const type = u.account_type || 'unset';
      const status = u.verification_status || 'none';
      const location = [u.city, u.state, u.country].filter(Boolean).join(', ') || '-';
      const stripe = u.stripe_onboarding_complete ? 'Active' : (u.stripe_connect_account_id ? 'Pending' : '-');
      const stripeClass = u.stripe_onboarding_complete ? 'status-verified' : '';
      const joined = new Date(u.created_at).toLocaleDateString();

      let statusClass = 'status-pending';
      if (status === 'verified') statusClass = 'status-verified';
      else if (status === 'submitted') statusClass = 'status-submitted';

      let typeClass = '';
      if (type === 'creator') typeClass = 'type-creator';
      else if (type === 'buyer') typeClass = 'type-buyer';

      return `
        <tr>
          <td>
            <div class="admin-user-cell">
              <strong>${esc(name)}</strong>
              <small>${esc(realName)}</small>
              <small>${esc(u.email || '')}</small>
            </div>
          </td>
          <td><span class="admin-badge ${typeClass}">${type}</span></td>
          <td><span class="admin-badge ${statusClass}">${status}</span></td>
          <td>${esc(location)}</td>
          <td>${u.message_count || 0}</td>
          <td><span class="${stripeClass}">${stripe}</span></td>
          <td>${joined}</td>
          <td>
            <button class="btn-remove-user" data-id="${u.id}" data-name="${esc(name)}">Remove</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-remove-user').forEach(btn => {
      btn.addEventListener('click', () => removeUser(btn.dataset.id, btn.dataset.name));
    });
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

async function loadMessages() {
  try {
    const res = await fetch('/api/admin/messages');
    const convos = await res.json();
    const tbody = document.getElementById("messages-tbody");
    const countEl = document.getElementById("convo-count");
    countEl.textContent = `${convos.length} conversations`;

    if (convos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;">No conversations yet</td></tr>';
      return;
    }

    tbody.innerHTML = convos.map(c => {
      const lastMsg = c.last_message ? (c.last_message.length > 60 ? c.last_message.substring(0, 60) + '...' : c.last_message) : '-';
      const lastAt = c.last_message_at ? new Date(c.last_message_at).toLocaleString() : '-';
      const started = new Date(c.created_at).toLocaleDateString();

      return `
        <tr>
          <td>${esc(c.creator_name)}</td>
          <td>${esc(c.buyer_name)}</td>
          <td>${c.message_count || 0}</td>
          <td class="msg-preview">${esc(lastMsg)}</td>
          <td>${started}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load messages:', err);
  }
}

async function loadReviewQueue() {
  try {
    const res = await fetch('/api/admin/review-queue');
    const items = await res.json();
    const tbody = document.getElementById("review-tbody");
    const countEl = document.getElementById("review-count");
    countEl.textContent = `${items.length} items`;

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">No elevated-risk services to review</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(item => {
      const creator = item.stage_name || item.display_name || item.email || 'Unknown';
      const price = '$' + parseFloat(item.price).toFixed(2);
      const score = item.onboarding_score || 0;
      const scoreColor = score >= 80 ? '#0f0' : score >= 60 ? '#ff0' : '#f55';
      const status = item.is_active ? 'Active' : 'Paused';
      const statusClass = item.is_active ? 'status-verified' : 'status-pending';
      const created = new Date(item.created_at).toLocaleDateString();
      const toggleText = item.is_active ? 'Pause' : 'Activate';
      const toggleClass = item.is_active ? 'btn-danger' : 'btn-primary';

      return `
        <tr>
          <td>${esc(creator)}</td>
          <td>
            <div class="admin-user-cell">
              <strong>${esc(item.title)}</strong>
              <small>${esc(item.service_type)}</small>
            </div>
          </td>
          <td>${price}</td>
          <td><span style="color:${scoreColor};font-weight:bold;">${score}/100</span></td>
          <td><span class="admin-badge ${statusClass}">${status}</span></td>
          <td>${created}</td>
          <td>
            <button class="${toggleClass} btn-toggle-service" data-id="${item.id}" style="padding:0.3rem 0.6rem;font-size:0.8rem;">${toggleText}</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-toggle-service').forEach(btn => {
      btn.addEventListener('click', () => toggleService(btn.dataset.id));
    });
  } catch (err) {
    console.error('Failed to load review queue:', err);
  }
}

async function toggleService(serviceId) {
  try {
    const res = await fetch(`/api/admin/services/${serviceId}/toggle`, { method: 'POST' });
    if (res.ok) {
      loadReviewQueue();
    } else {
      alert('Failed to update service.');
    }
  } catch (e) {
    alert('Failed to update service.');
  }
}

async function removeUser(userId, userName) {
  if (!confirm(`Remove user "${userName}"? This will delete their profile, conversations, and messages. This cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Failed to remove user');
      return;
    }

    loadStats();
    loadUsers();
    loadMessages();
  } catch (err) {
    alert('Failed to remove user. Please try again.');
  }
}

let killSwitchActive = false;

async function loadKillSwitch() {
  try {
    const res = await fetch('/api/platform-settings/pause_availability_bookings');
    const data = await res.json();
    killSwitchActive = data.value === 'true';
    updateKillSwitchUI();
  } catch (e) {
    document.getElementById("kill-switch-status").textContent = "Failed to load status.";
  }
}

function updateKillSwitchUI() {
  const btn = document.getElementById("kill-switch-btn");
  const status = document.getElementById("kill-switch-status");
  if (killSwitchActive) {
    btn.textContent = "Resume Bookings";
    btn.classList.remove("btn-danger");
    btn.classList.add("btn-primary");
    status.textContent = "Availability bookings are currently PAUSED. No new bookings can be placed.";
    status.style.color = "#f55";
  } else {
    btn.textContent = "Pause Bookings";
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-danger");
    status.textContent = "Availability bookings are currently ACTIVE.";
    status.style.color = "#0f0";
  }
}

async function toggleKillSwitch() {
  const newVal = killSwitchActive ? 'false' : 'true';
  const action = killSwitchActive ? 'resume' : 'pause';
  if (!confirm(`Are you sure you want to ${action} all availability bookings?`)) return;

  try {
    const res = await fetch('/api/admin/platform-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'pause_availability_bookings', value: newVal })
    });
    if (res.ok) {
      killSwitchActive = !killSwitchActive;
      updateKillSwitchUI();
    } else {
      alert('Failed to update setting.');
    }
  } catch (e) {
    alert('Failed to update setting.');
  }
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
