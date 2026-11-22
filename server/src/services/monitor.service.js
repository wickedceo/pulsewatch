
const axios = require('axios');
const pool = require('../config/database');
const {
  WebsiteUrlError,
  createRequestAgents,
  parseWebsiteUrl,
  resolvePublicAddresses,
} = require('./url-security.service');

const MAX_REDIRECTS = 5;
const MAX_CHECK_DURATION_MS = 10000;
const MAX_RESPONSE_SIZE = 1024 * 1024;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

const createTimeoutError = () => {
  const error = new Error('Website check timed out');
  error.code = 'ETIMEDOUT';
  return error;
};

const getRemainingTime = (startedAt) =>
  MAX_CHECK_DURATION_MS - (Date.now() - startedAt);

const resolveBeforeDeadline = async (hostname, lookup, startedAt) => {
  const remainingTime = getRemainingTime(startedAt);
  if (remainingTime <= 0) throw createTimeoutError();

  let timeout;
  try {
    return await Promise.race([
      resolvePublicAddresses(hostname, lookup),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(createTimeoutError()), remainingTime);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
};

const discardResponseBody = (response) => {
  const body = response?.data;
  if (!body || typeof body.destroy !== 'function' || body.destroyed) return;

  // Availability checks use headers only; cancel the body before it can be buffered.
  body.once?.('error', () => {});
  body.destroy();
};

const requestWithRedirectValidation = async (initialUrl, options) => {
  const {
    lookup,
    method = 'HEAD',
    request = (url, config) => axios.request({ ...config, url }),
    startedAt = Date.now(),
  } = options;
  let currentUrl = initialUrl;

  for (let redirectCount = 0; ; redirectCount += 1) {
    const addresses = await resolveBeforeDeadline(
      currentUrl.hostname,
      lookup,
      startedAt
    );
    const agents = createRequestAgents(addresses[0]);
    let response;
    let redirectedUrl;
    let finalResponse;

    try {
      const remainingTime = getRemainingTime(startedAt);
      if (remainingTime <= 0) {
        throw createTimeoutError();
      }

      response = await request(currentUrl.toString(), {
        method,
        responseType: 'stream',
        timeout: remainingTime,
        maxRedirects: 0,
        maxContentLength: MAX_RESPONSE_SIZE,
        maxBodyLength: MAX_RESPONSE_SIZE,
        validateStatus: () => true,
        proxy: false,
        httpAgent: agents.httpAgent,
        httpsAgent: agents.httpsAgent,
      });

      const location = response.headers?.location || response.headers?.Location;
      if (REDIRECT_STATUS_CODES.has(response.status) && location) {
        if (redirectCount >= MAX_REDIRECTS) {
          throw new WebsiteUrlError(
            'TOO_MANY_REDIRECTS',
            'Website redirected too many times'
          );
        }

        try {
          redirectedUrl = new URL(location, currentUrl);
        } catch {
          throw new WebsiteUrlError(
            'INVALID_REDIRECT',
            'Website returned an invalid redirect destination'
          );
        }

        redirectedUrl = parseWebsiteUrl(redirectedUrl.toString());
      } else {
        finalResponse = {
          status: response.status,
          headers: response.headers,
        };
      }
    } finally {
      try {
        discardResponseBody(response);
      } finally {
        agents.httpAgent.destroy();
        agents.httpsAgent.destroy();
      }
    }

    if (finalResponse) {
      return { response: finalResponse, url: currentUrl };
    }

    currentUrl = redirectedUrl;
  }
};

const checkWebsite = async (input, options = {}) => {
  const startTime = Date.now();
  const initialUrl = parseWebsiteUrl(input);

  try {
    const requestOptions = {
      lookup: options.lookup,
      request: options.request,
      startedAt: startTime,
    };
    let check = await requestWithRedirectValidation(initialUrl, requestOptions);

    if ([405, 501].includes(check.response.status)) {
      check = await requestWithRedirectValidation(check.url, {
        ...requestOptions,
        method: 'GET',
      });
    }

    return {
      url: initialUrl.toString(),
      status: check.response.status,
      responseTime: Date.now() - startTime,
      isOnline: check.response.status >= 200 && check.response.status < 400,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof WebsiteUrlError) throw error;

    return {
      url: initialUrl.toString(),
      status: null,
      responseTime: Date.now() - startTime,
      isOnline: false,
      error: error.code || 'REQUEST_FAILED',
      checkedAt: new Date().toISOString(),
    };
  }
};

const checkRegisteredWebsite = async (websiteId, userId) => {
  const websiteResult = await pool.query(
    `SELECT id, url, current_url_generation, is_active
     FROM websites
     WHERE id = $1 AND user_id = $2`,
    [websiteId, userId]
  );

  if (websiteResult.rows.length === 0) {
    return null;
  }

  const website = websiteResult.rows[0];
  const urlGeneration = Number(website.current_url_generation);
  if (!Number.isSafeInteger(urlGeneration) || urlGeneration < 1) {
    throw new Error('Website URL generation is invalid');
  }

  if (!website.is_active) {
    throw new Error('WEBSITE_INACTIVE');
  }

  let result;
  try {
    result = await checkWebsite(website.url);
  } catch (error) {
    if (!(error instanceof WebsiteUrlError)) throw error;

    result = {
      url: website.url,
      status: null,
      responseTime: 0,
      isOnline: false,
      error: error.code,
      checkedAt: new Date().toISOString(),
    };
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;

    await client.query(
      `INSERT INTO monitoring_checks
        (website_id, url_generation, status_code, response_time_ms,
         is_online, error, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        website.id,
        urlGeneration,
        result.status,
        result.responseTime,
        result.isOnline,
        result.error || null,
        result.checkedAt,
      ]
    );

    await client.query(
      `UPDATE websites
       SET last_checked_at = $1
       WHERE id = $2 AND current_url_generation = $3`,
      [result.checkedAt, website.id, urlGeneration]
    );

    await client.query('COMMIT');
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Monitoring check transaction failed and could not be rolled back'
        );
      }
    }

    throw error;
  } finally {
    client.release();
  }

  return { ...result, urlGeneration };
};

const getMonitoringHistory = async (websiteId, userId, generation) => {
  const generationClause = generation === 'legacy'
    ? 'AND mc.url_generation IS NULL'
    : Number.isSafeInteger(generation)
      ? 'AND mc.url_generation = $3'
      : 'AND mc.url_generation = w.current_url_generation';
  const values = Number.isSafeInteger(generation)
    ? [websiteId, userId, generation]
    : [websiteId, userId];

  const result = await pool.query(
    `SELECT
       mc.id,
       mc.website_id,
       mc.url_generation,
       mc.status_code,
       mc.response_time_ms,
       mc.is_online,
       mc.error,
       mc.checked_at,
       uv.url AS monitored_url
     FROM websites w
     LEFT JOIN monitoring_checks mc
       ON mc.website_id = w.id ${generationClause}
     LEFT JOIN website_url_versions uv
       ON uv.website_id = mc.website_id
      AND uv.generation = mc.url_generation
     WHERE w.id = $1 AND w.user_id = $2
     ORDER BY mc.checked_at DESC NULLS LAST, mc.id DESC
     LIMIT 100`,
    values
  );

  if (!result.rows.length) return null;
  return result.rows.filter((row) => row.id !== null);
};

const getMonitoringStats = async (websiteId, userId, generation) => {
  const result = await pool.query(
    `SELECT
       uv.generation AS url_generation,
       uv.url AS monitored_url,
       w.current_url_generation,
       COUNT(mc.id)::INTEGER AS total_checks,
       COUNT(mc.id) FILTER (WHERE mc.is_online = TRUE)::INTEGER AS successful_checks,
       COUNT(mc.id) FILTER (WHERE mc.is_online = FALSE)::INTEGER AS failed_checks,
       CASE
         WHEN COUNT(mc.id) = 0 THEN NULL
         ELSE
         ROUND(
           100.0 * COUNT(mc.id) FILTER (WHERE mc.is_online = TRUE)
           / NULLIF(COUNT(mc.id), 0),
           2
         )
       END AS uptime_percentage,
       ROUND(
         AVG(mc.response_time_ms) FILTER (
           WHERE mc.is_online = TRUE AND mc.response_time_ms IS NOT NULL
         )
       )::INTEGER
         AS average_response_time_ms
     FROM websites w
     JOIN website_url_versions uv
       ON uv.website_id = w.id
      AND uv.generation = COALESCE($3::INTEGER, w.current_url_generation)
     LEFT JOIN monitoring_checks mc
       ON mc.website_id = w.id
      AND mc.url_generation = uv.generation
     WHERE w.id = $1 AND w.user_id = $2
     GROUP BY w.id, uv.generation, uv.url`,
    [websiteId, userId, generation ?? null]
  );

  return result.rows[0] || null;
};

module.exports = {
  checkWebsite,
  checkRegisteredWebsite,
  getMonitoringHistory,
  getMonitoringStats,
};
