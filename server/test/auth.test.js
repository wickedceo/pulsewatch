const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const axios = require('axios');
const { afterEach, beforeEach, test } = require('node:test');
const pool = require('../src/config/database');
const app = require('../src/app');
const originalAxiosRequest = axios.request;

const state = {
  users: [],
  sessions: [],
  websites: [],
  urlVersions: [],
  checks: [],
};

const result = (rows = []) => ({ rows, rowCount: rows.length });
let failVersionInsert = false;

const queryDatabase = async (sql, values = []) => {
  const query = sql.trim().replace(/\s+/g, ' ').toLowerCase();

  if (['begin', 'commit', 'rollback'].includes(query)) return result();

  if (query.startsWith('insert into users')) {
    const [email, passwordHash] = values;
    if (state.users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
      const error = new Error('duplicate user');
      error.code = '23505';
      throw error;
    }

    const user = {
      id: crypto.randomUUID(),
      email,
      password_hash: passwordHash,
    };
    state.users.push(user);
    return result([{ id: user.id, email: user.email }]);
  }

  if (query.startsWith('insert into sessions')) {
    const [userId, tokenHash, expiresAt] = values;
    state.sessions.push({ userId, tokenHash, expiresAt });
    return result();
  }

  if (query.includes('from sessions s join users u')) {
    const [tokenHash] = values;
    const session = state.sessions.find(
      (item) => item.tokenHash === tokenHash && item.expiresAt > new Date()
    );
    const user = state.users.find((item) => item.id === session?.userId);
    return result(user ? [{ id: user.id, email: user.email }] : []);
  }

  if (query.startsWith('select id, email, password_hash from users')) {
    const user = state.users.find((item) => item.email === values[0]);
    return result(user ? [user] : []);
  }

  if (query.startsWith('delete from sessions')) {
    state.sessions = state.sessions.filter((item) => item.tokenHash !== values[0]);
    return result();
  }

  if (query.startsWith('insert into websites')) {
    const [userId, name, url] = values;
    const website = {
      id: crypto.randomUUID(),
      user_id: userId,
      name,
      url,
      current_url_generation: 1,
      is_active: true,
      last_checked_at: null,
      created_at: new Date().toISOString(),
    };
    state.websites.push(website);
    return result([website]);
  }

  if (query.startsWith('insert into website_url_versions')) {
    if (failVersionInsert) {
      failVersionInsert = false;
      throw new Error('injected URL version insert failure');
    }

    const [websiteId, generation, url] = values;
    const version = {
      website_id: websiteId,
      generation,
      url,
      created_at: new Date().toISOString(),
    };
    state.urlVersions.push(version);
    return result([version]);
  }

  if (query.startsWith('select * from websites where id = $1 and user_id = $2')) {
    const website = state.websites.find(
      (item) => item.id === values[0] && item.user_id === values[1]
    );
    return result(website ? [website] : []);
  }

  if (query.startsWith('update websites set name = $1 where id = $2')) {
    const [name, websiteId, userId] = values;
    const website = state.websites.find(
      (item) => item.id === websiteId && item.user_id === userId
    );
    if (!website) return result();
    website.name = name;
    return result([website]);
  }

  if (query.startsWith('update websites set name = $1, url = $2, current_url_generation = $3')) {
    const [name, url, generation, websiteId, userId] = values;
    const website = state.websites.find(
      (item) => item.id === websiteId && item.user_id === userId
    );
    if (!website) return result();
    website.name = name;
    website.url = url;
    website.current_url_generation = generation;
    website.last_checked_at = null;
    return result([website]);
  }

  if (query.startsWith('update websites set last_checked_at = $1')) {
    const [lastCheckedAt, websiteId, generation] = values;
    const website = state.websites.find(
      (item) =>
        item.id === websiteId &&
        item.current_url_generation === generation
    );
    if (!website) return result();
    website.last_checked_at = lastCheckedAt;
    return result([website]);
  }

  if (query.startsWith('select id, url, current_url_generation, is_active from websites')) {
    const website = state.websites.find(
      (item) => item.id === values[0] && item.user_id === values[1]
    );
    return result(website ? [website] : []);
  }

  if (query.startsWith('insert into monitoring_checks')) {
    const [
      websiteId,
      generation,
      statusCode,
      responseTime,
      isOnline,
      error,
      checkedAt,
    ] = values;
    const check = {
      id: `check-${state.checks.length + 1}`,
      website_id: websiteId,
      url_generation: generation,
      status_code: statusCode,
      response_time_ms: responseTime,
      is_online: isOnline,
      error,
      checked_at: checkedAt,
    };
    state.checks.push(check);
    return result([check]);
  }

  if (query.startsWith('delete from websites')) {
    const [websiteId, userId] = values;
    const website = state.websites.find(
      (item) => item.id === websiteId && item.user_id === userId
    );
    if (!website) return result();
    state.websites = state.websites.filter((item) => item.id !== websiteId);
    state.urlVersions = state.urlVersions.filter(
      (item) => item.website_id !== websiteId
    );
    state.checks = state.checks.filter((item) => item.website_id !== websiteId);
    return result([{ id: websiteId }]);
  }

  if (query.startsWith('select w.*')) {
    return result(
      state.websites
        .filter((website) => website.user_id === values[0])
        .map((website) => ({
          ...website,
          url_generations: state.urlVersions.filter(
            (version) => version.website_id === website.id
          ),
        }))
    );
  }

  if (query.startsWith('select mc.id, mc.website_id, mc.url_generation')) {
    const [websiteId, userId, generation] = values;
    const website = state.websites.find(
      (item) => item.id === websiteId && item.user_id === userId
    );
    if (!website) return result();
    const checks = state.checks
      .filter((item) => item.website_id === websiteId)
      .filter((item) => query.includes('mc.url_generation = $3')
        ? item.url_generation === generation
        : query.includes('mc.url_generation is null')
          ? item.url_generation === null
          : query.includes('mc.url_generation = w.current_url_generation')
            ? item.url_generation === website.current_url_generation
            : true)
      .sort((left, right) =>
        new Date(right.checked_at).getTime() -
          new Date(left.checked_at).getTime() ||
        String(right.id).localeCompare(String(left.id))
      )
      .slice(0, 100)
      .map((check) => ({
        ...check,
        monitored_url: state.urlVersions.find(
          (version) =>
            version.website_id === websiteId &&
            version.generation === check.url_generation
        )?.url || null,
      }));
    return result(checks.length ? checks : [{
      id: null,
      website_id: websiteId,
      url_generation: null,
      status_code: null,
      response_time_ms: null,
      is_online: null,
      error: null,
      checked_at: null,
      monitored_url: null,
    }]);
  }

  if (query.startsWith('select uv.generation as url_generation')) {
    const [websiteId, userId, requestedGeneration] = values;
    const website = state.websites.find(
      (item) => item.id === websiteId && item.user_id === userId
    );
    if (!website) return result();
    const generation = requestedGeneration || website.current_url_generation;
    const version = state.urlVersions.find(
      (item) => item.website_id === websiteId && item.generation === generation
    );
    if (!version) return result();

    const checks = state.checks.filter(
      (item) => item.website_id === websiteId &&
        item.url_generation === generation
    );
    const successful = checks.filter((item) => item.is_online);
    const validResponseTimes = successful
      .map((item) => item.response_time_ms)
      .filter((value) => value !== null && value !== undefined);
    return result([{
      url_generation: generation,
      monitored_url: version.url,
      current_url_generation: website.current_url_generation,
      total_checks: checks.length,
      successful_checks: successful.length,
      failed_checks: checks.length - successful.length,
      uptime_percentage: checks.length
        ? String((successful.length / checks.length) * 100)
        : null,
      average_response_time_ms: validResponseTimes.length
        ? Math.round(validResponseTimes.reduce((sum, value) => sum + value, 0) /
          validResponseTimes.length)
        : null,
    }]);
  }

  throw new Error(`Unexpected test query: ${query}`);
};

let server;
let baseUrl;

const request = (path, options = {}) =>
  fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

const register = async (email, password = 'correct horse battery staple') => {
  const response = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  return { response, cookie };
};

beforeEach(async () => {
  state.users = [];
  state.sessions = [];
  state.websites = [];
  state.urlVersions = [];
  state.checks = [];
  failVersionInsert = false;
  axios.request = originalAxiosRequest;
  pool.query = queryDatabase;
  pool.connect = async () => {
    let snapshot;
    return {
      query: async (sql, values) => {
        const normalized = sql.trim().toLowerCase();
        if (normalized === 'begin') {
          snapshot = structuredClone(state);
        } else if (normalized === 'rollback' && snapshot) {
          Object.assign(state, snapshot);
          snapshot = null;
        } else if (normalized === 'commit') {
          snapshot = null;
        }
        return queryDatabase(sql, values);
      },
      release() {},
    };
  };
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  axios.request = originalAxiosRequest;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

test('registration validates input, hashes passwords, and blocks duplicate email', async () => {
  const invalid = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
  });
  assert.equal(invalid.status, 400);

  const { response, cookie } = await register('Owner@Example.com');
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(payload.data.user.email, 'owner@example.com');
  assert.match(cookie, /^pulsewatch_session=/);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(response.headers.get('set-cookie'), /SameSite=Lax/);
  assert.notEqual(state.users[0].password_hash, 'correct horse battery staple');
  assert.match(state.users[0].password_hash, /^scrypt\$32768\$8\$1\$/);

  const duplicate = await register('OWNER@example.com');
  assert.equal(duplicate.response.status, 409);
});

test('login rejects invalid credentials and returns a server-side session for valid credentials', async () => {
  const { cookie: registrationCookie } = await register('login@example.com');

  const invalid = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'login@example.com',
      password: 'this password is incorrect',
    }),
  });
  assert.equal(invalid.status, 401);
  assert.equal((await invalid.json()).message, 'Invalid email or password');

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'LOGIN@example.com',
      password: 'correct horse battery staple',
    }),
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /^pulsewatch_session=/);

  const currentUser = await request('/api/auth/me', {
    headers: { Cookie: registrationCookie },
  });
  assert.equal(currentUser.status, 200);
  assert.equal((await currentUser.json()).data.user.email, 'login@example.com');

  const logout = await request('/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: registrationCookie },
  });
  assert.equal(logout.status, 200);
  const revokedSession = await request('/api/auth/me', {
    headers: { Cookie: registrationCookie },
  });
  assert.equal(revokedSession.status, 401);
});

test('protected website and monitoring data are isolated by user', async () => {
  const unauthenticated = await request('/api/websites');
  assert.equal(unauthenticated.status, 401);

  const owner = await register('owner@example.com');
  const create = await request('/api/websites', {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: JSON.stringify({
      name: 'Owner site',
      url: 'https://93.184.216.34/owner',
    }),
  });
  assert.equal(create.status, 201);
  const website = (await create.json()).data;
  assert.equal(website.current_url_generation, 1);
  assert.equal(state.urlVersions.length, 1);
  assert.equal(state.urlVersions[0].url, website.url);

  const other = await register('other@example.com');
  const otherList = await request('/api/websites', {
    headers: { Cookie: other.cookie },
  });
  assert.deepEqual((await otherList.json()).data, []);

  const otherHistory = await request(`/api/monitor/${website.id}/history`, {
    headers: { Cookie: other.cookie },
  });
  assert.equal(otherHistory.status, 404);
  const otherGenerationHistory = await request(
    `/api/monitor/${website.id}/history?generation=1`,
    { headers: { Cookie: other.cookie } }
  );
  assert.equal(otherGenerationHistory.status, 404);
  const otherStats = await request(`/api/monitor/${website.id}/stats`, {
    headers: { Cookie: other.cookie },
  });
  assert.equal(otherStats.status, 404);
  const otherGenerationStats = await request(
    `/api/monitor/${website.id}/stats?generation=1`,
    { headers: { Cookie: other.cookie } }
  );
  assert.equal(otherGenerationStats.status, 404);
  const missingWebsiteHistory = await request(
    `/api/monitor/${crypto.randomUUID()}/history`,
    { headers: { Cookie: owner.cookie } }
  );
  assert.equal(missingWebsiteHistory.status, 404);
  const otherCheck = await request(`/api/monitor/${website.id}/check`, {
    method: 'POST',
    headers: { Cookie: other.cookie },
  });
  assert.equal(otherCheck.status, 404);

  state.checks.push({
    id: 'check-1',
    website_id: website.id,
    url_generation: 1,
    status_code: 200,
    response_time_ms: 200000,
    is_online: true,
    error: null,
    checked_at: new Date().toISOString(),
  });
  for (let index = 1; index <= 125; index += 1) {
    state.checks.push({
      id: `old-check-${index}`,
      website_id: website.id,
      url_generation: 1,
      status_code: 200,
      response_time_ms: 200000,
      is_online: true,
      error: null,
      checked_at: new Date(Date.now() - index * 1000).toISOString(),
    });
  }

  const otherUpdate = await request(`/api/websites/${website.id}`, {
    method: 'PUT',
    headers: { Cookie: other.cookie },
    body: JSON.stringify({
      name: 'Stolen site',
      url: 'https://8.8.8.8/changed',
    }),
  });
  assert.equal(otherUpdate.status, 404);
  assert.equal(state.urlVersions.length, 1);

  const ownerUpdate = await request(`/api/websites/${website.id}`, {
    method: 'PUT',
    headers: { Cookie: owner.cookie },
    body: JSON.stringify({
      name: 'Updated site',
      url: 'https://8.8.8.8/changed',
    }),
  });
  assert.equal(ownerUpdate.status, 200);
  const updatedWebsite = (await ownerUpdate.json()).data;
  assert.equal(updatedWebsite.name, 'Updated site');
  assert.equal(updatedWebsite.id, website.id);
  assert.equal(updatedWebsite.current_url_generation, 2);
  assert.equal(updatedWebsite.last_checked_at, null);
  assert.equal(state.checks.length, 126);
  assert.deepEqual(
    state.urlVersions.map((version) => [version.generation, version.url]),
    [
      [1, website.url],
      [2, 'https://8.8.8.8/changed'],
    ]
  );

  const currentStats = await request(`/api/monitor/${website.id}/stats`, {
    headers: { Cookie: owner.cookie },
  });
  const currentStatsData = (await currentStats.json()).data;
  assert.equal(currentStatsData.url_generation, 2);
  assert.equal(currentStatsData.total_checks, 0);
  assert.equal(currentStatsData.uptime_percentage, null);
  assert.equal(currentStatsData.average_response_time_ms, null);

  const oldStats = await request(
    `/api/monitor/${website.id}/stats?generation=1`,
    { headers: { Cookie: owner.cookie } }
  );
  const oldStatsData = (await oldStats.json()).data;
  assert.equal(oldStatsData.url_generation, 1);
  assert.equal(oldStatsData.monitored_url, website.url);
  assert.equal(oldStatsData.total_checks, 126);
  assert.equal(oldStatsData.average_response_time_ms, 200000);

  state.checks.push({
    id: 'current-check',
    website_id: website.id,
    url_generation: 2,
    status_code: 200,
    response_time_ms: 30,
    is_online: true,
    error: null,
    checked_at: new Date().toISOString(),
  });

  const ownerHistory = await request(`/api/monitor/${website.id}/history`, {
    headers: { Cookie: owner.cookie },
  });
  const ownerHistoryData = (await ownerHistory.json()).data;
  assert.equal(ownerHistoryData.length, 1);
  assert.equal(ownerHistoryData[0].id, 'current-check');
  assert.equal(ownerHistoryData[0].url_generation, 2);
  assert.equal(ownerHistoryData[0].monitored_url, 'https://8.8.8.8/changed');

  const oldGenerationHistory = await request(
    `/api/monitor/${website.id}/history?generation=1`,
    { headers: { Cookie: owner.cookie } }
  );
  const oldGenerationHistoryData = (await oldGenerationHistory.json()).data;
  assert.equal(oldGenerationHistoryData.length, 100);
  assert.ok(oldGenerationHistoryData.every((check) => check.url_generation === 1));

  const ownerWebsites = await request('/api/websites', {
    headers: { Cookie: owner.cookie },
  });
  const listedWebsite = (await ownerWebsites.json()).data[0];
  assert.equal(listedWebsite.url_generations.length, 2);
  assert.equal(listedWebsite.url_generations[0].url, website.url);

  const nameOnlyUpdate = await request(`/api/websites/${website.id}`, {
    method: 'PUT',
    headers: { Cookie: owner.cookie },
    body: JSON.stringify({
      name: 'Renamed only',
      url: 'https://8.8.8.8/changed',
    }),
  });
  assert.equal(nameOnlyUpdate.status, 200);
  assert.equal((await nameOnlyUpdate.json()).data.current_url_generation, 2);
  assert.equal(state.urlVersions.length, 2);

  const unsafeUpdate = await request(`/api/websites/${website.id}`, {
    method: 'PUT',
    headers: { Cookie: owner.cookie },
    body: JSON.stringify({
      name: 'Unsafe',
      url: 'http://127.0.0.1/admin',
    }),
  });
  assert.equal(unsafeUpdate.status, 400);
  assert.equal(state.websites[0].current_url_generation, 2);

  state.checks.push({
    id: 'legacy-check',
    website_id: website.id,
    url_generation: null,
    status_code: 200,
    response_time_ms: 75,
    is_online: true,
    error: null,
    checked_at: new Date().toISOString(),
  });
  const pendingStatsResponse = await request(
    `/api/monitor/${website.id}/stats`,
    { headers: { Cookie: owner.cookie } }
  );
  const pendingStats = (await pendingStatsResponse.json()).data;
  assert.equal(pendingStats.total_checks, 1);
  assert.equal(Number(pendingStats.uptime_percentage), 100);

  const legacyHistoryResponse = await request(
    `/api/monitor/${website.id}/history?generation=legacy`,
    { headers: { Cookie: owner.cookie } }
  );
  const legacyHistory = (await legacyHistoryResponse.json()).data;
  assert.equal(legacyHistory.length, 1);
  assert.equal(legacyHistory[0].id, 'legacy-check');
  assert.equal(legacyHistory[0].url_generation, null);
  assert.equal(legacyHistory[0].monitored_url, null);

  const otherDelete = await request(`/api/websites/${website.id}`, {
    method: 'DELETE',
    headers: { Cookie: other.cookie },
  });
  assert.equal(otherDelete.status, 404);

  const ownerDelete = await request(`/api/websites/${website.id}`, {
    method: 'DELETE',
    headers: { Cookie: owner.cookie },
  });
  assert.equal(ownerDelete.status, 200);
  assert.equal(state.websites.length, 0);
  assert.equal(state.urlVersions.length, 0);
  assert.equal(state.checks.length, 0);

  const ownerList = await request('/api/websites', {
    headers: { Cookie: owner.cookie },
  });
  assert.deepEqual((await ownerList.json()).data, []);
});

test('URL generation updates roll back when writing the new version fails', async () => {
  const owner = await register('rollback@example.com');
  const create = await request('/api/websites', {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: JSON.stringify({
      name: 'Rollback site',
      url: 'https://93.184.216.34/original',
    }),
  });
  const website = (await create.json()).data;

  failVersionInsert = true;
  const update = await request(`/api/websites/${website.id}`, {
    method: 'PUT',
    headers: { Cookie: owner.cookie },
    body: JSON.stringify({
      name: 'Changed',
      url: 'https://8.8.8.8/new',
    }),
  });

  assert.equal(update.status, 500);
  assert.equal(state.websites[0].url, 'https://93.184.216.34/original');
  assert.equal(state.websites[0].current_url_generation, 1);
  assert.deepEqual(
    state.urlVersions.map((version) => [version.generation, version.url]),
    [[1, 'https://93.184.216.34/original']]
  );
});

test('an in-flight check remains on its captured generation after the URL changes', async () => {
  const owner = await register('inflight@example.com');
  const create = await request('/api/websites', {
    method: 'POST',
    headers: { Cookie: owner.cookie },
    body: JSON.stringify({
      name: 'In-flight site',
      url: 'https://93.184.216.34/original',
    }),
  });
  const website = (await create.json()).data;

  let resolveRequest;
  let signalRequestStarted;
  const requestStarted = new Promise((resolve) => {
    signalRequestStarted = resolve;
  });
  axios.request = (config) => {
    signalRequestStarted(config.url);
    return new Promise((resolve) => {
      resolveRequest = resolve;
    });
  };

  const checkPromise = request(`/api/monitor/${website.id}/check`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
  });
  assert.equal(await requestStarted, website.url);

  const update = await request(`/api/websites/${website.id}`, {
    method: 'PUT',
    headers: { Cookie: owner.cookie },
    body: JSON.stringify({
      name: 'In-flight site',
      url: 'https://8.8.8.8/new',
    }),
  });
  assert.equal(update.status, 200);

  resolveRequest({ status: 200, headers: {}, data: undefined });
  const checkResponse = await checkPromise;
  assert.equal(checkResponse.status, 200);
  assert.equal(state.checks.length, 1);
  assert.equal(state.checks[0].url_generation, 1);
  assert.equal(state.websites[0].current_url_generation, 2);
  assert.equal(state.websites[0].last_checked_at, null);

  axios.request = async () => ({ status: 200, headers: {}, data: undefined });
  const currentCheck = await request(`/api/monitor/${website.id}/check`, {
    method: 'POST',
    headers: { Cookie: owner.cookie },
  });
  assert.equal(currentCheck.status, 200);
  assert.equal(state.checks[1].url_generation, 2);

  const currentStats = await request(`/api/monitor/${website.id}/stats`, {
    headers: { Cookie: owner.cookie },
  });
  const stats = (await currentStats.json()).data;
  assert.equal(stats.url_generation, 2);
  assert.equal(stats.total_checks, 1);
  assert.equal(stats.successful_checks, 1);
  assert.equal(stats.average_response_time_ms, state.checks[1].response_time_ms);

  const historicalStats = await request(
    `/api/monitor/${website.id}/stats?generation=1`,
    { headers: { Cookie: owner.cookie } }
  );
  assert.equal((await historicalStats.json()).data.total_checks, 1);
});
