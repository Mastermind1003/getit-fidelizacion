'use strict';

// Manifest PWA (se sirve como JSON).
function render() {
  return {
    name: 'Tarjeta de Fidelización',
    short_name: 'Fidelidad',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1115',
    theme_color: '#16321f',
  };
}

module.exports = { render };
