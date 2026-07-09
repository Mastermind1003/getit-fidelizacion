// Helpers de sesión compartidos por admin y caja (dedup de logout/togglePwd).
async function logout() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* noop */ }
  window.location.href = '/login';
}

function togglePwd(id) {
  const input = document.getElementById(id);
  if (input) input.type = input.type === 'password' ? 'text' : 'password';
}
