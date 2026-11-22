const pool = require('../config/database');

const withTransaction = async (operation) => {
  const client = await pool.connect();
  let started = false;

  try {
    await client.query('BEGIN');
    started = true;
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (started) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Database transaction failed and could not be rolled back'
        );
      }
    }

    throw error;
  } finally {
    client.release();
  }
};

const createWebsite = async (userId, name, url) => {
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO websites (user_id, name, url)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, name || null, url]
    );
    const website = result.rows[0];

    await client.query(
      `INSERT INTO website_url_versions (website_id, generation, url)
       VALUES ($1, $2, $3)`,
      [website.id, website.current_url_generation, website.url]
    );

    return website;
  });
};

const getWebsites = async (userId) => {
  const result = await pool.query(
    `SELECT
       w.*,
       COALESCE(
         (
           SELECT json_agg(
             json_build_object(
               'generation', uv.generation,
               'url', uv.url,
               'created_at', uv.created_at
             )
             ORDER BY uv.generation
           )
           FROM website_url_versions uv
           WHERE uv.website_id = w.id
         ),
         '[]'::json
       ) AS url_generations
     FROM websites w
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId]
  );

  return result.rows;
};

const updateWebsite = async (userId, websiteId, name, url) => {
  return withTransaction(async (client) => {
    const currentResult = await client.query(
      `SELECT * FROM websites
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [websiteId, userId]
    );
    const currentWebsite = currentResult.rows[0];
    if (!currentWebsite) return null;

    if (url === currentWebsite.url) {
      const result = await client.query(
        `UPDATE websites
         SET name = $1
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [name || null, websiteId, userId]
      );
      return result.rows[0] || null;
    }

    const nextGeneration = Number(currentWebsite.current_url_generation) + 1;
    if (!Number.isSafeInteger(nextGeneration)) {
      throw new Error('Website URL generation is invalid');
    }

    await client.query(
      `INSERT INTO website_url_versions (website_id, generation, url)
       VALUES ($1, $2, $3)`,
      [websiteId, nextGeneration, url]
    );

    const result = await client.query(
      `UPDATE websites
       SET name = $1, url = $2, current_url_generation = $3,
           last_checked_at = NULL
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [name || null, url, nextGeneration, websiteId, userId]
    );

    return result.rows[0] || null;
  });
};

const deleteWebsite = async (userId, websiteId) => {
  const result = await pool.query(
    `DELETE FROM websites
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [websiteId, userId]
  );

  return result.rows[0] || null;
};

module.exports = {
  createWebsite,
  deleteWebsite,
  getWebsites,
  updateWebsite,
};
