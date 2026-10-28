const submitLinks = document.querySelectorAll('[data-submit-photo]');
const notice = document.querySelector('#setup-note');
const rawUrl = window.CONCURSO_CONFIG?.appsScriptUrl;
let formUrl = null;
if (typeof rawUrl === 'string' && rawUrl.trim()) {
  try {
    const candidate = new URL(rawUrl.trim());
    const path = /^\/(?:a\/)?macros\/(?:[^/]+\/)?s\/[A-Za-z0-9_-]+\/exec\/?$/;
    if (candidate.protocol === 'https:' && candidate.hostname === 'script.google.com' && !candidate.port && !candidate.username && !candidate.password && path.test(candidate.pathname)) {
      candidate.hash = '';
      formUrl = candidate.href;
    }
  } catch (_) { /* No se abre una dirección que no sea un despliegue válido. */ }
}
submitLinks.forEach(link => {
  if (formUrl) {
    link.href = formUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.removeAttribute('aria-disabled');
  } else {
    link.setAttribute('aria-disabled', 'true');
    link.addEventListener('click', event => { event.preventDefault(); notice.hidden = false; });
  }
});
// El formulario se abre por navegación normal: Google gestiona el acceso corporativo.
notice.hidden = !!formUrl;
document.querySelector('#print-bases').addEventListener('click', () => window.print());
