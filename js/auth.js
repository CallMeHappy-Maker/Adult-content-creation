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
    window.location.href = '/account.html';
    return false;
  }
  return true;
}

function isVerified() {
  if (!_cachedAuthData || !_cachedAuthData.profile) return false;
  const status = _cachedAuthData.profile.verification_status;
  return status === 'submitted' || status === 'verified';
}

function requireVerified(action) {
  if (!isLoggedIn()) {
    showAuthGate('Log in to ' + (action || 'continue'));
    return false;
  }
  if (!isVerified()) {
    showAuthGate('Complete verification to ' + (action || 'continue'));
    return false;
  }
  return true;
}

function showAuthGate(message) {
  let overlay = document.getElementById('auth-gate-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'auth-gate-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;';

  const isAuthenticated = isLoggedIn();
  const buttonHref = isAuthenticated ? '/verify.html' : '/account.html';
  const buttonText = isAuthenticated ? 'Complete Verification' : 'Log In';

  overlay.innerHTML = `
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:2rem;max-width:400px;width:90%;text-align:center;">
      <h3 style="color:#0ff;margin:0 0 1rem;">${escapeHtmlAuth(message)}</h3>
      <p style="color:#aaa;font-size:0.9rem;margin-bottom:1.5rem;">
        ${isAuthenticated ? 'You need to verify your identity before you can access this feature.' : 'Please log in to access this feature.'}
      </p>
      <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
        <a href="${buttonHref}" style="display:inline-block;padding:0.6rem 1.5rem;background:#8B0000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">${buttonText}</a>
        <button onclick="this.closest('#auth-gate-overlay').remove()" style="padding:0.6rem 1.5rem;background:#333;color:#ccc;border:none;border-radius:6px;cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
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

    let messagesLink = `<a href="/chat.html" class="auth-nav-link">Messages</a>`;

    let adminLink = '';
    checkAdminStatus().then(isAdminUser => {
      if (isAdminUser) {
        const adminEl = document.createElement('a');
        adminEl.href = '/admin.html';
        adminEl.className = 'auth-nav-admin';
        adminEl.textContent = 'Admin';
        const navUser = authNav.querySelector('.auth-nav-user');
        if (navUser) {
          const logoutLink = navUser.querySelector('.auth-nav-logout');
          if (logoutLink) navUser.insertBefore(adminEl, logoutLink);
        }
      }
    });

    authNav.innerHTML = `
      <div class="auth-nav-user">
        ${avatarHtml}
        <span class="auth-nav-name">${escapeHtmlAuth(displayName)}</span>
        ${verifyLink}
        ${messagesLink}
        <a href="/api/logout" class="auth-nav-logout">Log Out</a>
      </div>
    `;
  } else {
    authNav.innerHTML = `
      <a href="/account.html" class="auth-nav-login">Login / Sign Up</a>
    `;
  }
}

async function checkAdminStatus() {
  try {
    const res = await fetch('/api/admin/check');
    if (res.ok) {
      const data = await res.json();
      return data.isAdmin === true;
    }
    return false;
  } catch {
    return false;
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
