// Configuración pm2 para el EC2 co-locado (apps.getitchile.cl).
// Uso:  pm2 start ecosystem.config.js && pm2 save
// Las variables sensibles (DATABASE_URL, PORT, SEED_*) van en .env (dotenv las carga).
module.exports = {
  apps: [
    {
      name: 'getit-fidelizacion',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,          // fork mode: rate-limit en memoria + 1 sola instancia
      exec_mode: 'fork',
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
