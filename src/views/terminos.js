'use strict';

// Términos y Condiciones (SSR de tyc_config, con defaults completos).
function render(cfg = {}) {
  const logoUrl = cfg.logo_url || 'https://i.imgur.com/nJrUCee.png';
  const logoWidth = cfg.logo_width || 120;
  const bgColor = cfg.bg_color || '#f4f4f5';
  const cardColor = cfg.card_color || '#ffffff';
  const titleColor = cfg.title_color || '#16321f';
  const h2Color = cfg.h2_color || '#16321f';
  const textColor = cfg.text_color || '#333333';
  const razonSocial = cfg.razon_social || 'Convenience de Chile SPA';
  const rut = cfg.rut || '76.865.177-9';
  const nombreFantasia = cfg.nombre_fantasia || 'Get it';
  const domicilio = cfg.domicilio || 'Santiago, Región Metropolitana, Chile';
  const titulo = cfg.titulo || 'Términos y Condiciones del Club de Fidelización';
  const fechaActualizacion = cfg.fecha_actualizacion || '08 de julio de 2026';
  const s1_titulo = cfg.s1_titulo || '1. Aceptación de los términos';
  const s1_texto = cfg.s1_texto || 'Al registrarte en el Club de Fidelización Get it, declaras haber leído, comprendido y aceptado los presentes Términos y Condiciones. Si no estás de acuerdo con alguno de ellos, no debes completar el registro.';
  const s2_titulo = cfg.s2_titulo || '2. El programa de fidelización';
  const s2_texto = cfg.s2_texto || 'El Club de Fidelización Get it es un programa administrado por Convenience de Chile SPA que permite a sus miembros acumular marcas por cada visita o compra realizada en los establecimientos participantes de la marca Get it.';
  const s3_titulo = cfg.s3_titulo || '3. Registro y membresía';
  const s3_texto = cfg.s3_texto || 'Para participar en el programa, el cliente debe registrarse proporcionando datos verídicos y actualizados. Cada persona puede tener una sola cuenta asociada a su RUT. El registro es personal e intransferible.';
  const s4_titulo = cfg.s4_titulo || '4. Tratamiento de datos personales';
  const s4_texto = cfg.s4_texto || 'De conformidad con la Ley N° 19.628 sobre Protección de la Vida Privada y sus modificaciones, Convenience de Chile SPA recopila y trata los datos personales de sus miembros exclusivamente para gestionar su membresía, acreditar marcas y canjes, y enviar comunicaciones sobre ofertas y beneficios del Club de Fidelización Get it. Convenience de Chile SPA no compartirá, venderá ni cederá estos datos a terceros sin el consentimiento expreso del titular, salvo que sea requerido por ley o autoridad competente.';
  const s5_titulo = cfg.s5_titulo || '5. Derechos del titular de datos';
  const s5_texto = cfg.s5_texto || 'Conforme a la Ley N° 19.628, el cliente tiene derecho a acceder, rectificar y solicitar la eliminación de sus datos personales, así como revocar el consentimiento para el envío de comunicaciones comerciales. Para ejercer estos derechos, el cliente puede contactar directamente a un establecimiento Get it o escribir a través de los canales oficiales de la empresa.';
  const s6_titulo = cfg.s6_titulo || '6. Seguridad de la información';
  const s6_texto = cfg.s6_texto || 'Convenience de Chile SPA adopta medidas técnicas y organizativas razonables para proteger los datos personales de sus miembros contra accesos no autorizados, pérdida o alteración.';
  const s7_titulo = cfg.s7_titulo || '7. Modificaciones';
  const s7_texto = cfg.s7_texto || 'Convenience de Chile SPA se reserva el derecho de actualizar estos Términos y Condiciones. Las modificaciones serán informadas a través de los canales del programa y entrarán en vigencia desde su publicación. El uso continuado del programa implica la aceptación de los términos actualizados.';
  const s8_titulo = cfg.s8_titulo || '8. Legislación aplicable';
  const s8_texto = cfg.s8_texto || 'Estos Términos y Condiciones se rigen por las leyes de la República de Chile. Cualquier controversia derivada del presente programa será sometida a los tribunales ordinarios de justicia de Santiago.';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:-apple-system,system-ui,sans-serif;background:${bgColor};margin:0;padding:20px;color:${textColor};}
  .wrap{max-width:680px;margin:0 auto;background:${cardColor};border-radius:12px;padding:32px 28px;box-shadow:0 1px 4px rgba(0,0,0,0.08);}
  .logo{text-align:center;margin-bottom:20px;}
  .logo .logo-badge{}
  .logo img{max-width:${logoWidth}px;object-fit:contain;display:block;}
  h1{font-size:20px;color:${titleColor};margin-bottom:4px;}
  .meta{font-size:12px;color:#888;margin-bottom:28px;}
  h2{font-size:15px;color:${h2Color};margin-top:28px;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:6px;}
  p,li{font-size:14px;line-height:1.7;margin-bottom:8px;}
  ul{padding-left:20px;}
  .back{display:inline-block;margin-top:24px;font-size:13px;color:${titleColor};font-weight:600;text-decoration:none;}
  .empresa{background:#f7f7f7;border-radius:8px;padding:12px 16px;font-size:13px;margin-bottom:24px;line-height:1.8;}
</style></head>
<body>
<div class="wrap">
  <div class="logo"><span class="logo-badge"><img src="${logoUrl}" alt="Get it" onerror="this.style.display='none'"></span></div>
  <h1>${titulo}</h1>
  <div class="meta">Última actualización: ${fechaActualizacion}</div>
  <div class="empresa">
    <strong>Razón social:</strong> ${razonSocial}<br>
    <strong>RUT:</strong> ${rut}<br>
    <strong>Nombre de fantasía:</strong> ${nombreFantasia}<br>
    <strong>Domicilio:</strong> ${domicilio}
  </div>
  <h2>${s1_titulo}</h2><p>${s1_texto}</p>
  <h2>${s2_titulo}</h2><p>${s2_texto}</p>
  <ul>
    <li>Cada compra válida otorga una (1) marca en la tarjeta digital del cliente.</li>
    <li>Al completar el número de marcas definido por el programa vigente, el cliente obtiene el derecho a canjear el premio correspondiente.</li>
    <li>Las marcas no son transferibles, no tienen valor monetario y no pueden canjearse por dinero en efectivo.</li>
    <li>Convenience de Chile SPA se reserva el derecho de modificar las condiciones del programa, incluyendo la cantidad de marcas requeridas y los premios disponibles, con aviso previo a través de los canales oficiales.</li>
  </ul>
  <h2>${s3_titulo}</h2><p>${s3_texto}</p>
  <h2>${s4_titulo}</h2><p>${s4_texto}</p>
  <ul>
    <li>Nombre y apellido</li><li>RUT</li><li>Correo electrónico</li>
    <li>Número de teléfono</li><li>Fecha de nacimiento</li>
    <li>Historial de visitas y compras asociadas al programa</li>
  </ul>
  <h2>${s5_titulo}</h2><p>${s5_texto}</p>
  <ul>
    <li>Acceder a sus datos personales registrados.</li>
    <li>Rectificar datos incorrectos o desactualizados.</li>
    <li>Solicitar la eliminación de sus datos y cancelación de su membresía.</li>
    <li>Revocar el consentimiento para el envío de comunicaciones comerciales.</li>
  </ul>
  <h2>${s6_titulo}</h2><p>${s6_texto}</p>
  <h2>${s7_titulo}</h2><p>${s7_texto}</p>
  <h2>${s8_titulo}</h2><p>${s8_texto}</p>
  <a class="back" href="/registro">← Volver al registro</a>
</div>
</body></html>`;
}

module.exports = { render };
