let _cachedAuthData = null;

async function initAuth() {
  try {
    const res = await fetch('/api/auth/user');
    const data = await res.json();
    _cachedAuthData = data;
    updateNavAuth(data);
    return data;
  } catch (error) {
    console.error('Auth init failed:', error);
    _cachedAuthData = null;
    updateNavAuth(null);
    return null;
  }
}

function getCurrentUser() {
  return _cachedAuthData;
}

function isLoggedIn() {
  return _cachedAuthData && _cachedAuthData.user;
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/api/login';
    return false;
  }
  return true;
}

function logout() {
  window.location.href = '/api/logout';
}

function updateNavAuth(data) {
  const authNav = document.getElementById('auth-nav');
  if (!authNav) return;

  if (data && data.user) {
    const user = data.user;
    const profile = data.profile;
    const displayName = user.first_name || user.email || 'User';

    let avatarHtml = '';
    if (user.profile_image_url) {
      avatarHtml = `<img src="${user.profile_image_url}" alt="${displayName}" class="auth-nav-avatar">`;
    } else {
      const initials = (user.first_name || 'U').charAt(0).toUpperCase();
      avatarHtml = `<span class="auth-nav-initials">${initials}</span>`;
    }

    let verifyLink = '';
    if (!profile || profile.verification_status === 'pending' || !profile.verification_status) {
      verifyLink = `<a href="/verify.html" class="auth-nav-verify">Verify</a>`;
    }

    authNav.innerHTML = `
      <div class="auth-nav-user">
        ${avatarHtml}
        <span class="auth-nav-name">${escapeHtmlAuth(displayName)}</span>
        ${verifyLink}
        <a href="/api/logout" class="auth-nav-logout">Log Out</a>
      </div>
    `;
  } else {
    authNav.innerHTML = `
      <a href="/api/login" class="auth-nav-login">Log In</a>
    `;
  }
}

function escapeHtmlAuth(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});
