const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { test } = require('node:test');
const { checkWebsite } = require('../src/services/monitor.service');
const {
  WebsiteUrlError,
  isGloballyRoutableAddress,
  parseWebsiteUrl,
  validateWebsiteUrl,
} = require('../src/services/url-security.service');

const publicLookup = async () => [
  { address: '93.184.216.34', family: 4 },
];

test('normalizes valid HTTP URLs and rejects malformed, credentialed, and internal hosts', () => {
  assert.equal(
    parseWebsiteUrl(' HTTPS://Example.COM:443/status#fragment ').toString(),
    'https://example.com/status'
  );
  assert.throws(() => parseWebsiteUrl('ftp://example.com'), WebsiteUrlError);
  assert.throws(() => parseWebsiteUrl('https://user:pass@example.com'), WebsiteUrlError);
  assert.throws(() => parseWebsiteUrl(`https://${'a'.repeat(2050)}.com`), WebsiteUrlError);

  for (const host of [
    'localhost',
    'service.localhost',
    'admin.internal',
    'metadata.google',
    'instance-data',
    '127.0.0.1',
    '0x7f000001',
    '169.254.169.254',
    '[::1]',
    '[fc00::1]',
    '[fe80::1]',
    '[::ffff:127.0.0.1]',
    '[64:ff9b::a00:1]',
    '168.63.129.16',
  ]) {
    assert.throws(
      () => parseWebsiteUrl(`http://${host}/`),
      (error) => error instanceof WebsiteUrlError && error.code === 'SSRF_BLOCKED',
      `${host} must be blocked`
    );
  }
});

test('rejects private, reserved, mapped, and transition IP ranges', () => {
  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',
    '::',
    '::1',
    '::ffff:10.0.0.1',
    '64:ff9b::a00:1',
    '2001:db8::1',
    '2002:7f00:1::',
    'fc00::1',
    'fe80::1',
    'ff02::1',
  ]) {
    assert.equal(isGloballyRoutableAddress(address), false, `${address} must be blocked`);
  }

  assert.equal(isGloballyRoutableAddress('8.8.8.8'), true);
  assert.equal(isGloballyRoutableAddress('2001:4860:4860::8888'), true);
});

test('validates every DNS answer and rejects mixed public/private responses', async () => {
  const normalized = await validateWebsiteUrl(
    'HTTPS://Monitor.Example.com:443/health#check',
    { lookup: publicLookup }
  );
  assert.equal(normalized, 'https://monitor.example.com/health');

  await assert.rejects(
    validateWebsiteUrl('https://mixed.example.com', {
      lookup: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ],
    }),
    (error) => error.code === 'SSRF_BLOCKED'
  );

  await assert.rejects(
    validateWebsiteUrl('https://empty.example.com', {
      lookup: async () => [],
    }),
    (error) => error.code === 'SSRF_BLOCKED'
  );
});

test('pins the validated DNS address for the request to prevent rebinding', async () => {
  let dnsLookups = 0;
  let resolvedAddress;
  const lookup = async () => {
    dnsLookups += 1;
    return [{ address: '93.184.216.34', family: 4 }];
  };
  const request = async (_url, options) => {
    const records = await new Promise((resolve, reject) => {
      options.httpsAgent.options.lookup(
        'rebound.example.com',
        { all: true },
        (error, addresses) => error ? reject(error) : resolve(addresses)
      );
    });
    resolvedAddress = records[0].address;
    return { status: 200, headers: {} };
  };

  const result = await checkWebsite('https://rebound.example.com', {
    lookup,
    request,
  });

  assert.equal(result.isOnline, true);
  assert.equal(dnsLookups, 1);
  assert.equal(resolvedAddress, '93.184.216.34');
});

test('uses HEAD first and falls back to streamed GET only for 405 and 501', async () => {
  for (const unsupportedStatus of [405, 501]) {
    const methods = [];
    const result = await checkWebsite('https://head-unsupported.example.com', {
      lookup: publicLookup,
      request: async (_url, options) => {
        methods.push(options.method);
        return {
          status: options.method === 'HEAD' ? unsupportedStatus : 200,
          headers: {},
        };
      },
    });

    assert.deepEqual(methods, ['HEAD', 'GET']);
    assert.equal(result.status, 200);
    assert.equal(result.isOnline, true);
  }
});

test('classifies a Cloudflare-sized streamed GET response from headers without reading its body', async () => {
  const contentLength = 1_334_663;
  let bytesProduced = 0;
  let headBody;
  let getBody;
  const methods = [];
  const makeBody = () => new Readable({
    read() {
      const chunkSize = Math.min(64 * 1024, contentLength - bytesProduced);
      if (chunkSize <= 0) {
        this.push(null);
        return;
      }

      bytesProduced += chunkSize;
      this.push(Buffer.alloc(chunkSize));
    },
  });

  const result = await checkWebsite('https://www.cloudflare.com/', {
    lookup: publicLookup,
    request: async (_url, options) => {
      methods.push(options.method);
      if (options.method === 'HEAD') {
        headBody = makeBody();
        return { status: 405, headers: {}, data: headBody };
      }

      getBody = makeBody();
      assert.equal(options.responseType, 'stream');
      assert.equal(options.maxContentLength, 1024 * 1024);
      assert.equal(options.maxRedirects, 0);
      return {
        status: 200,
        headers: { 'content-length': String(contentLength) },
        data: getBody,
      };
    },
  });

  assert.deepEqual(methods, ['HEAD', 'GET']);
  assert.equal(result.status, 200);
  assert.equal(result.isOnline, true);
  assert.equal(result.error, undefined);
  assert.equal(headBody.destroyed, true);
  assert.equal(getBody.destroyed, true);
  assert.equal(bytesProduced, 0);
});

test('returns a HEAD 200 response without issuing a GET', async () => {
  const methods = [];
  const result = await checkWebsite('https://head-supported.example.com', {
    lookup: publicLookup,
    request: async (_url, options) => {
      methods.push(options.method);
      return { status: 200, headers: {} };
    },
  });

  assert.deepEqual(methods, ['HEAD']);
  assert.equal(result.status, 200);
  assert.equal(result.isOnline, true);
});

test('timeouts during HEAD and fallback GET remain transport failures', async () => {
  let headCalls = 0;
  const headTimeout = await checkWebsite('https://head-timeout.example.com', {
    lookup: publicLookup,
    request: async (_url, options) => {
      headCalls += 1;
      assert.equal(options.method, 'HEAD');
      assert.ok(options.timeout > 0 && options.timeout <= 10000);
      const error = new Error('request timed out');
      error.code = 'ETIMEDOUT';
      throw error;
    },
  });

  assert.equal(headCalls, 1);
  assert.equal(headTimeout.status, null);
  assert.equal(headTimeout.isOnline, false);
  assert.equal(headTimeout.error, 'ETIMEDOUT');

  const methods = [];
  const fallbackTimeout = await checkWebsite('https://fallback-timeout.example.com', {
    lookup: publicLookup,
    request: async (_url, options) => {
      methods.push(options.method);
      if (options.method === 'HEAD') return { status: 405, headers: {} };
      const error = new Error('request timed out');
      error.code = 'ETIMEDOUT';
      throw error;
    },
  });

  assert.deepEqual(methods, ['HEAD', 'GET']);
  assert.equal(fallbackTimeout.status, null);
  assert.equal(fallbackTimeout.isOnline, false);
  assert.equal(fallbackTimeout.error, 'ETIMEDOUT');
});

test('revalidates each redirect and never requests a private redirect target', async () => {
  let requestCount = 0;
  const resultPromise = checkWebsite('https://start.example.com', {
    lookup: publicLookup,
    request: async () => {
      requestCount += 1;
      return {
        status: 302,
        headers: { location: 'http://[::1]/admin' },
      };
    },
  });

  await assert.rejects(
    resultPromise,
    (error) => error.code === 'SSRF_BLOCKED'
  );
  assert.equal(requestCount, 1);
});

test('revalidates redirects made by the GET fallback before connecting', async () => {
  const methods = [];
  const requestedUrls = [];

  await assert.rejects(
    checkWebsite('https://start.example.com', {
      lookup: publicLookup,
      request: async (url, options) => {
        methods.push(options.method);
        requestedUrls.push(url);
        return options.method === 'HEAD'
          ? { status: 501, headers: {} }
          : { status: 302, headers: { location: 'http://127.0.0.1/admin' } };
      },
    }),
    (error) => error.code === 'SSRF_BLOCKED'
  );

  assert.deepEqual(methods, ['HEAD', 'GET']);
  assert.deepEqual(requestedUrls, [
    'https://start.example.com/',
    'https://start.example.com/',
  ]);
});

test('resolves and pins every public redirect destination', async () => {
  const resolvedHosts = [];
  const requestedUrls = [];
  const lookup = async (hostname) => {
    resolvedHosts.push(hostname);
    return [{
      address: hostname === 'start.example.com' ? '93.184.216.34' : '8.8.8.8',
      family: 4,
    }];
  };
  const request = async (url, options) => {
    requestedUrls.push(url);
    const agent = new URL(url).protocol === 'https:'
      ? options.httpsAgent
      : options.httpAgent;
    const pinned = await new Promise((resolve, reject) => {
      agent.options.lookup(new URL(url).hostname, (error, address) =>
        error ? reject(error) : resolve(address)
      );
    });
    assert.equal(
      pinned,
      new URL(url).hostname === 'start.example.com'
        ? '93.184.216.34'
        : '8.8.8.8'
    );

    return requestedUrls.length === 1
      ? { status: 302, headers: { location: 'https://next.example.net/ready' } }
      : { status: 403, headers: {} };
  };

  const result = await checkWebsite('https://start.example.com', {
    lookup,
    request,
  });

  assert.deepEqual(resolvedHosts, ['start.example.com', 'next.example.net']);
  assert.equal(requestedUrls.length, 2);
  assert.equal(result.status, 403);
  assert.equal(result.isOnline, false);
});

test('resolves redirect hosts and rejects private DNS answers before connecting', async () => {
  let redirectHostLookups = 0;
  let requestCount = 0;
  const lookup = async (hostname) => {
    if (hostname === 'redirect.example.com') {
      redirectHostLookups += 1;
      return [{ address: '127.0.0.1', family: 4 }];
    }

    return [{ address: '8.8.8.8', family: 4 }];
  };
  const resultPromise = checkWebsite('https://start.example.com', {
    lookup,
    request: async () => {
      requestCount += 1;
      return {
        status: 302,
        headers: { location: 'https://redirect.example.com/' },
      };
    },
  });

  await assert.rejects(
    resultPromise,
    (error) => error.code === 'SSRF_BLOCKED'
  );
  assert.equal(requestCount, 1);
  assert.equal(redirectHostLookups, 1);
});
