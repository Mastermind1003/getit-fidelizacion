'use strict';

const { queryOne, queryAll } = require('../../db/pool');

async function getById(executor, id) {
  return queryOne(executor, 'SELECT * FROM loyalty_programs WHERE id = $1', [id]);
}

async function list(executor) {
  return queryAll(executor, 'SELECT * FROM loyalty_programs');
}

async function updateDesign(executor, id, u) {
  await executor.query(
    `UPDATE loyalty_programs
       SET name=$1, required_stamps=$2, logo_url=$3, logo_width=$4,
           primary_color=$5, secondary_color=$6, stamp_icon=$7, stamp_color=$8, stamp_size=$9
     WHERE id=$10`,
    [u.name, u.required_stamps, u.logo_url, u.logo_width, u.primary_color,
     u.secondary_color, u.stamp_icon, u.stamp_color, u.stamp_size, id]
  );
}

module.exports = { getById, list, updateDesign };
