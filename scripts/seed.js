'use strict';

// Siembra datos base idempotentes: sucursal + programa + reward por defecto,
// filas singleton de configuración (id=1) y los usuarios de acceso.
// Passwords desde config.SEED (env). Correr tras migrate:  npm run seed
const { pool, withTransaction } = require('../src/db/pool');
const { SEED } = require('../src/config');
const { makePasswordHash } = require('../src/lib/password');

async function seedBaseData(client) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS c FROM branches');
  if (rows[0].c > 0) {
    console.log('[seed] branches ya existen — se omite data base (branch/programa/reward).');
    return;
  }
  const b = await client.query(
    'INSERT INTO branches (name, address) VALUES ($1,$2) RETURNING id',
    ['Sucursal Centro', 'Av. Principal 123']
  );
  const branchId = b.rows[0].id;
  const p = await client.query(
    `INSERT INTO loyalty_programs
       (name, required_stamps, rules_json, logo_url, logo_width, primary_color, secondary_color, stamp_icon, stamp_color, stamp_size)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    ['Club Fidelidad', 10, { min_amount: 0 }, 'https://i.imgur.com/nJrUCee.png', 140, '#000000', '#0f1115', '★', '#d62828', 22]
  );
  const programId = p.rows[0].id;
  await client.query(
    'INSERT INTO rewards (program_id, name, description, stamps_required) VALUES ($1,$2,$3,$4)',
    [programId, 'Producto gratis', 'Premio al completar 10 marcas', 10]
  );
  console.log(`[seed] data base creada (branch ${branchId}, program ${programId}).`);
}

async function seedConfigSingletons(client) {
  // Las columnas tienen DEFAULT en el schema → basta insertar la fila id=1.
  await client.query('INSERT INTO registro_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  await client.query('INSERT INTO login_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  await client.query('INSERT INTO tyc_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  console.log('[seed] configuración singleton asegurada (registro/login/tyc).');
}

async function seedStaff(client) {
  const branch = await client.query('SELECT id FROM branches ORDER BY id LIMIT 1');
  const branchId = branch.rows[0] ? branch.rows[0].id : null;
  for (const [role, u] of Object.entries(SEED)) {
    const hash = makePasswordHash(u.password);
    const email = `${u.username}@local.app`;
    const res = await client.query(
      `INSERT INTO staff_users (branch_id, name, username, email, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (username) DO NOTHING RETURNING id`,
      [branchId, u.name, u.username, email, hash, role]
    );
    console.log(
      res.rows[0]
        ? `[seed] usuario "${u.username}" creado (rol ${role}).`
        : `[seed] usuario "${u.username}" ya existe — se omite.`
    );
  }
}

async function seed() {
  await withTransaction(async (client) => {
    await seedBaseData(client);
    await seedConfigSingletons(client);
    await seedStaff(client);
  });
  console.log('[seed] listo.');
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error('[seed] error:', err.message);
    pool.end();
    process.exit(1);
  });
