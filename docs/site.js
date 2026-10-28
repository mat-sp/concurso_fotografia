const url = window.CONCURSO_CONFIG?.appsScriptUrl || '';
const valid = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url);
const frame = document.querySelector('#form-frame');
if (valid) {
  frame.src = url;
  document.querySelector('#setup-note').hidden = true;
  const direct = document.querySelector('#direct-form');
  direct.href = url;
  direct.hidden = false;
} else {
  frame.src = './form-preview.html';
}
document.querySelector('#print-bases').addEventListener('click', () => window.print());
