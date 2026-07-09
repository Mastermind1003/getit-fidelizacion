'use strict';

// before/after son JSONB: se pasan objetos JS (o null) y node-postgres los
// serializa. NO hacer JSON.stringify manual (evita doble-encoding).
async function logAudit(executor, actorStaffId, action, entity, entityId, before, after) {
  await executor.query(
    `INSERT INTO audit_logs (actor_staff_id, action, entity, entity_id, before_json, after_json)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [actorStaffId || null, action, entity, entityId, before || null, after || null]
  );
}

module.exports = { logAudit };
