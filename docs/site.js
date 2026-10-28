const frame = document.querySelector('#form-frame');
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
if (formUrl) {
  frame.src = formUrl;
  frame.hidden = false;
  document.querySelector('#setup-note').hidden = true;
  const direct = document.querySelector('#direct-form');
  direct.href = formUrl;
  direct.hidden = false;
} else {
  // Una configuración ausente o incorrecta nunca abre el formulario de prueba.
  frame.hidden = true;
  frame.removeAttribute('src');
  document.querySelector('#setup-note').hidden = false;
  document.querySelector('#setup-note').textContent = 'El formulario de envío todavía no está disponible. Puedes consultar las bases más abajo.';
}
document.querySelector('#print-bases').addEventListener('click', () => window.print());
