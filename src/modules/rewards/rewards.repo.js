'use strict';

const { queryOne } = require('../../db/pool');

async function firstByProgram(executor, programId) {
  return queryOne(executor, 'SELECT * FROM rewards WHERE program_id = $1 LIMIT 1', [programId]);
}

async function insertRedemption(executor, cardId, rewardId, staffId, branchId) {
  const r = await executor.query(
    `INSERT INTO reward_redemptions (loyalty_card_id, reward_id, staff_id, branch_id)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [cardId, rewardId, staffId, branchId]
  );
  return r.rows[0].id;
}

module.exports = { firstByProgram, insertRedemption };
