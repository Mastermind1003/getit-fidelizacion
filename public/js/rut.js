// Formato de RUT compartido (dedup de las 3 copias del monolito: mi-tarjeta, registro, caja).
function formatRut(val) {
  let v = String(val || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (v.length < 2) return v;
  return v.slice(0, -1) + '-' + v.slice(-1);
}
function onRutInput(e) {
  e.target.value = formatRut(e.target.value);
}
