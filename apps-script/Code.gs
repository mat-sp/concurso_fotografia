/** Concurso de fotografía matemática · IES Sancti Petri · Curso 2026-27.
 * Ejecutar como propietario. Configuración en Propiedades del script, nunca en GitHub.
 * Ninguna función pública permite consultar participaciones ni archivos.
 */
const DEADLINE_ = Date.parse('2026-11-30T22:59:59.999Z'); // 23:59:59.999 Europe/Madrid
const MAX_BYTES_ = 10 * 1024 * 1024;
const BASES_VERSION_ = '2026-27-v1';

function doGet() {
  const p = PropertiesService.getScriptProperties();
  const page = HtmlService.createTemplateFromFile('Formulario');
  const privacy = p.getProperty('PRIVACY_TEXT') || '';
  const siteUrl = p.getProperty('SITE_URL') || '';
  const ready = p.getProperty('SUBMISSIONS_OPEN') === 'true' && !!p.getProperty('DRIVE_FOLDER_ID') && privacy.trim().length > 30 && /^https:\/\//.test(siteUrl);
  page.clientConfig = JSON.stringify({
    demo: false, ready: ready, closed: Date.now() > DEADLINE_,
    privacyText: privacy, basesUrl: /^https:\/\//.test(siteUrl) ? siteUrl.replace(/#.*$/, '') + '#bases' : ''
  }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return page.evaluate().setTitle('Participar · Fotografía matemática')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Única operación de escritura accesible desde el navegador. */
function submitEntry(payload) {
  let lock, folders = [], createdRecords = [], committed = false;
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('SUBMISSIONS_OPEN') !== 'true' || !props.getProperty('DRIVE_FOLDER_ID') || (props.getProperty('PRIVACY_TEXT') || '').trim().length < 31 || !/^https:\/\//.test(props.getProperty('SITE_URL') || '')) return failure_('La recepción todavía no está disponible.');
    if (Date.now() > DEADLINE_) return failure_('El plazo de participación ha finalizado.');
    const entry = validateEntry_(payload);
    const source = decodeImage_(payload.photo, MAX_BYTES_);
    // JPEG reconstruido desde los píxeles de la imagen: no se publica el original con EXIF.
    const jury = decodeImage_(payload.juryPhoto, MAX_BYTES_);
    if (jury.mime !== 'image/jpeg') throw new Error('No se ha podido preparar la copia de valoración.');
    const cleanJury = stripJpegMetadata_(jury.bytes);
    if (source.width !== jury.width || source.height !== jury.height) {
      // La orientación EXIF puede intercambiar ancho y alto al decodificar la imagen.
      if (source.width !== jury.height || source.height !== jury.width) throw new Error('Las dimensiones de las dos copias no coinciden.');
    }
    const participantKey = 'participant_' + sha256_(normalize_(entry.fullName) + '|' + normalize_(entry.course) + '|' + normalize_(entry.group));
    const requestKey = 'request_' + entry.requestId;
    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) return failure_('Hay varios envíos en este momento. Espera unos segundos y vuelve a intentarlo.');
    // Un reintento tras una pérdida de conexión devuelve el mismo justificante.
    const prior = props.getProperty(requestKey);
    if (prior) {
      const saved = JSON.parse(prior);
      if (saved.participantKey !== participantKey) return failure_('El identificador de envío ya se ha utilizado. Recarga el formulario.');
      return { ok: true, code: saved.code, receivedAt: saved.receivedAt };
    }
    if (props.getProperty(participantKey)) return failure_('Ya consta una participación con ese nombre, curso y grupo. Solo se admite una fotografía por alumno.');
    if (Date.now() > DEADLINE_) return failure_('El plazo de participación ha finalizado.');
    const root = DriveApp.getFolderById(props.getProperty('DRIVE_FOLDER_ID'));
    // No se admiten carpetas compartidas por enlace o de acceso general.
    if (root.getSharingAccess() !== DriveApp.Access.PRIVATE) return failure_('La recepción no está disponible. La organización debe revisar la configuración de la carpeta.');
    const originalsRoot = subfolder_(root, 'Originales');
    const worksRoot = subfolder_(root, 'Obras');
    const recordsRoot = subfolder_(root, 'Registros');
    const code = 'FM-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
    const receivedAt = new Date().toISOString();
    const originalFolder = originalsRoot.createFolder(code); folders.push(originalFolder);
    const workFolder = worksRoot.createFolder(code); folders.push(workFolder);
    const original = originalFolder.createFile(Utilities.newBlob(source.bytes, source.mime, 'original.' + source.extension));
    const photo = workFolder.createFile(Utilities.newBlob(cleanJury, 'image/jpeg', 'fotografia.jpg'));
    // Solo código, título y explicación se mostrarán al jurado en la siguiente fase.
    workFolder.createFile('obra.json', JSON.stringify({ code: code, title: entry.title, explanation: entry.explanation, photoFileId: photo.getId() }, null, 2), MimeType.PLAIN_TEXT);
    const record = Object.assign({}, entry, {
      code: code, receivedAt: receivedAt, basesVersion: BASES_VERSION_,
      privacyText: props.getProperty('PRIVACY_TEXT'),
      originalFileId: original.getId(), workFolderId: workFolder.getId(),
      publicationStatus: 'pendiente_de_autorizacion',
      originalMime: source.mime, originalBytes: source.bytes.length
    });
    const jsonRecord = recordsRoot.createFile(code + '.json', JSON.stringify(record, null, 2), MimeType.PLAIN_TEXT); createdRecords.push(jsonRecord);
    const textRecord = recordsRoot.createFile(code + '.txt',
      'CONCURSO DE FOTOGRAFÍA MATEMÁTICA · IES SANCTI PETRI\n' +
      'Código: ' + code + '\nRecibido: ' + receivedAt + '\n\n' +
      'Nombre: ' + entry.fullName + '\nCurso: ' + entry.course + '\nGrupo: ' + entry.group + '\n' +
      'Título: ' + entry.title + '\nLugar: ' + entry.location + '\nExplicación: ' + (entry.explanation || '(no incluida)') + '\n\n' +
      'Bases aceptadas: ' + BASES_VERSION_ + '\nAutoría y requisitos declarados: sí\n' +
      'Autorización de difusión: pendiente de recabar por el centro.\n', MimeType.PLAIN_TEXT); createdRecords.push(textRecord);
    const receipt = JSON.stringify({ code: code, receivedAt: receivedAt, participantKey: participantKey });
    const values = {}; values[participantKey] = code; values[requestKey] = receipt;
    props.setProperties(values, false);
    committed = true;
    return { ok: true, code: code, receivedAt: receivedAt };
  } catch (error) {
    // Si falla una escritura, no se da el envío por completado ni se deja una ficha parcial.
    if (!committed) {
      createdRecords.forEach(function(file) { try { file.setTrashed(true); } catch (_) {} });
      folders.forEach(function(folder) { try { folder.setTrashed(true); } catch (_) {} });
    }
    if (error && error.isValidation) return failure_(error.message);
    return failure_('No se ha podido confirmar el guardado. Conserva el formulario y vuelve a pulsar Enviar; si ya se guardó, recuperarás el mismo justificante.');
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function failure_(message) { return { ok: false, message: message }; }
function invalid_(message) { const error = new Error(message); error.isValidation = true; throw error; }
function normalize_(text) { return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function sha256_(text) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function field_(value, label, max, optional) {
  if (typeof value !== 'string') invalid_('Revisa el campo ' + label + '.');
  const text = value.trim().replace(/\r\n/g, '\n');
  if ((!optional && !text) || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) invalid_('Revisa el campo ' + label + '.');
  return text;
}
function validateEntry_(p) {
  if (!p || typeof p !== 'object' || p.website) invalid_('No se ha podido validar el formulario.');
  if (p.acceptRules !== true || p.declareOriginal !== true || p.privacyRead !== true) invalid_('Debes aceptar las bases y confirmar las declaraciones obligatorias.');
  if (typeof p.requestId !== 'string' || !/^[a-zA-Z0-9-]{20,60}$/.test(p.requestId)) invalid_('Recarga el formulario antes de enviar.');
  return {
    requestId: p.requestId, fullName: field_(p.fullName, 'nombre y apellidos', 120),
    course: field_(p.course, 'curso', 80), group: field_(p.group, 'grupo', 40),
    title: field_(p.title, 'título', 100), location: field_(p.location, 'lugar', 180),
    explanation: field_(p.explanation, 'explicación', 600, true),
    acceptRules: true, declareOriginal: true, privacyRead: true
  };
}
function decodeImage_(image, maxBytes) {
  if (!image || typeof image.data !== 'string' || image.data.length > Math.ceil(maxBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) invalid_('El archivo no es válido o supera los 10 MB.');
  let bytes; try { bytes = Utilities.base64Decode(image.data); } catch (_) { invalid_('No se ha podido leer el archivo.'); }
  if (!bytes.length || bytes.length > maxBytes) invalid_('El archivo supera los 10 MB.');
  const u = bytes.map(function(b) { return (b + 256) % 256; });
  const dimensions = imageDimensions_(u);
  if (!dimensions || !dimensions.width || !dimensions.height || dimensions.width * dimensions.height > 50000000) invalid_('Utiliza una fotografía JPEG o PNG válida, de hasta 50 megapíxeles.');
  return Object.assign({ bytes: bytes }, dimensions);
}
function imageDimensions_(u) {
  const u32 = function(i) { return u[i] * 16777216 + u[i + 1] * 65536 + u[i + 2] * 256 + u[i + 3]; };
  if (u.length > 32 && [137,80,78,71,13,10,26,10].every(function(b, i) { return u[i] === b; }) && String.fromCharCode.apply(null,u.slice(12,16)) === 'IHDR') {
    return { mime: 'image/png', extension: 'png', width: u32(16), height: u32(20) };
  }
  if (u[0] !== 255 || u[1] !== 216) return null;
  let i = 2;
  while (i + 4 < u.length) {
    if (u[i++] !== 255) return null;
    while (u[i] === 255) i++;
    const marker = u[i++];
    if (marker === 218 || marker === 217) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    const n = u[i] * 256 + u[i + 1];
    if (n < 2 || i + n > u.length) return null;
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].indexOf(marker) !== -1 && n >= 8) return { mime:'image/jpeg', extension:'jpg', width:u[i+5]*256+u[i+6], height:u[i+3]*256+u[i+4] };
    i += n;
  }
  return null;
}
function stripJpegMetadata_(bytes) {
  const u = bytes.map(function(b) { return (b + 256) % 256; });
  if (u[0] !== 255 || u[1] !== 216) invalid_('La copia de valoración no es JPEG.');
  let out = bytes.slice(0, 2), i = 2;
  while (i < u.length) {
    const start = i;
    if (u[i++] !== 255) invalid_('La copia de valoración está dañada.');
    while (u[i] === 255) i++;
    const marker = u[i++];
    if (marker === 218) return out.concat(bytes.slice(start));
    if (marker === 217) return out.concat(bytes.slice(start, i));
    if (marker === 1 || (marker >= 208 && marker <= 215)) { out = out.concat(bytes.slice(start,i)); continue; }
    const n = u[i]*256+u[i+1];
    if (n < 2 || i+n > u.length) invalid_('La copia de valoración está dañada.');
    // Elimina EXIF, XMP, IPTC y comentarios. Conserva JFIF e ICC (perfiles de color).
    if (!((marker >= 225 && marker <= 239 && marker !== 226) || marker === 254)) out = out.concat(bytes.slice(start,i+n));
    i += n;
  }
  invalid_('La copia de valoración está incompleta.');
}
function subfolder_(parent, name) { const folders = parent.getFoldersByName(name); return folders.hasNext() ? folders.next() : parent.createFolder(name); }
