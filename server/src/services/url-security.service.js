const dns = require('node:dns/promises');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const ipaddr = require('ipaddr.js');

const MAX_URL_LENGTH = 2048;
const DNS_LOOKUP_TIMEOUT_MS = 4000;
const INTERNAL_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
  '.lan',
  '.test',
  '.example',
  '.invalid',
  '.onion',
];
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'localdomain',
  'metadata',
  'metadata.google',
  'instance-data',
]);
const NAT64_PREFIXES = [
  { address: '64:ff9b::', prefixLength: 96 },
  { address: '64:ff9b:1::', prefixLength: 48 },
];

class WebsiteUrlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'WebsiteUrlError';
    this.code = code;
  }
}

const hostnameForLookup = (hostname) =>
  hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();

const isGloballyRoutableAddress = (address) => {
  if (typeof address !== 'string' || address.includes('%')) return false;

  try {
    const parsed = ipaddr.process(address);

    if (parsed.range() !== 'unicast') return false;
    if (
      parsed.kind() === 'ipv4' &&
      parsed.toString() === '168.63.129.16'
    ) {
      return false;
    }

    if (
      parsed.kind() === 'ipv6' &&
      NAT64_PREFIXES.some(({ address: prefix, prefixLength }) =>
        parsed.match(ipaddr.parse(prefix), prefixLength)
      )
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

const parseWebsiteUrl = (input) => {
  if (typeof input !== 'string' || !input.trim() || input.length > MAX_URL_LENGTH) {
    throw new WebsiteUrlError(
      'INVALID_URL',
      `Website URL must be a non-empty URL of at most ${MAX_URL_LENGTH} characters`
    );
  }

  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw new WebsiteUrlError('INVALID_URL', 'Please provide a valid website URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new WebsiteUrlError(
      'INVALID_URL',
      'Only HTTP and HTTPS website URLs are supported'
    );
  }

  if (url.username || url.password) {
    throw new WebsiteUrlError(
      'INVALID_URL',
      'Website URLs must not contain embedded credentials'
    );
  }

  const hostname = hostnameForLookup(url.hostname);

  if (!hostname || hostname.includes('%')) {
    throw new WebsiteUrlError('INVALID_URL', 'Please provide a valid website hostname');
  }

  if (url.hostname.endsWith('.')) {
    url.hostname = url.hostname.slice(0, -1);
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    INTERNAL_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    (net.isIP(hostname) === 0 && !hostname.includes('.'))
  ) {
    throw new WebsiteUrlError(
      'SSRF_BLOCKED',
      'Website URLs must resolve to a publicly routable address'
    );
  }

  if (net.isIP(hostname) && !isGloballyRoutableAddress(hostname)) {
    throw new WebsiteUrlError(
      'SSRF_BLOCKED',
      'Website URLs must resolve to a publicly routable address'
    );
  }

  url.hash = '';
  return url;
};

const resolvePublicAddresses = async (hostname, lookup = dns.lookup) => {
  const normalizedHostname = hostnameForLookup(hostname);
  const literalFamily = net.isIP(normalizedHostname);

  if (literalFamily) {
    if (!isGloballyRoutableAddress(normalizedHostname)) {
      throw new WebsiteUrlError(
        'SSRF_BLOCKED',
        'Website URLs must resolve to a publicly routable address'
      );
    }

    return [{ address: normalizedHostname, family: literalFamily }];
  }

  let timeout;
  let records;
  try {
    records = await Promise.race([
      lookup(normalizedHostname, { all: true, verbatim: true }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error('DNS lookup timed out');
          error.code = 'ETIMEDOUT';
          reject(error);
        }, DNS_LOOKUP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }

  if (
    !Array.isArray(records) ||
    records.length === 0 ||
    records.some((record) => !isGloballyRoutableAddress(record.address))
  ) {
    throw new WebsiteUrlError(
      'SSRF_BLOCKED',
      'Website URLs must resolve only to publicly routable addresses'
    );
  }

  return records;
};

const validateWebsiteUrl = async (input, options = {}) => {
  const url = parseWebsiteUrl(input);
  const lookup = options.lookup || dns.lookup;

  try {
    await resolvePublicAddresses(url.hostname, lookup);
  } catch (error) {
    if (error instanceof WebsiteUrlError) throw error;
    throw new WebsiteUrlError(
      'DNS_LOOKUP_FAILED',
      'Website hostname could not be resolved'
    );
  }

  return url.toString();
};

const createPinnedLookup = (record) => (_hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (options?.all) {
    callback(null, [{ address: record.address, family: record.family }]);
    return;
  }

  callback(null, record.address, record.family);
};

const createRequestAgents = (record) => {
  const lookup = createPinnedLookup(record);

  return {
    httpAgent: new http.Agent({ lookup }),
    httpsAgent: new https.Agent({ lookup }),
  };
};

module.exports = {
  BLOCKED_HOSTNAMES,
  INTERNAL_HOST_SUFFIXES,
  WebsiteUrlError,
  createRequestAgents,
  isGloballyRoutableAddress,
  parseWebsiteUrl,
  resolvePublicAddresses,
  validateWebsiteUrl,
};
