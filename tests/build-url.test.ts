import { describe, expect, it, vi } from 'vitest';

import { buildUrl, createFetchHttpClient } from '../src/http/fetch-http-client';

describe('buildUrl', () => {
  const defaultBaseUrl = new URL('https://api.lily.test/');

  describe('standard query parameters serialization', () => {
    it('serializes simple key-value string pairs', () => {
      const url = buildUrl(defaultBaseUrl, 'v1/agents', {
        status: 'active',
        role: 'admin',
      });

      expect(url.toString()).toBe(
        'https://api.lily.test/v1/agents?status=active&role=admin',
      );
      expect(url.searchParams.get('status')).toBe('active');
      expect(url.searchParams.get('role')).toBe('admin');
    });

    it('serializes standard pagination query parameters', () => {
      const url = buildUrl(defaultBaseUrl, 'v1/agents', { page: 1, limit: 20 });

      expect(url.toString()).toBe(
        'https://api.lily.test/v1/agents?page=1&limit=20',
      );
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('limit')).toBe('20');
    });

    it('serializes mixed string, number, and boolean query parameters', () => {
      const url = buildUrl(defaultBaseUrl, 'v1/search', {
        q: 'agent',
        page: 2,
        includeDetails: true,
      });

      expect(url.toString()).toBe(
        'https://api.lily.test/v1/search?q=agent&page=2&includeDetails=true',
      );
      expect(url.searchParams.get('q')).toBe('agent');
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('includeDetails')).toBe('true');
    });
  });

  describe('undefined query values handling', () => {
    it('omits query keys with undefined values without creating empty key params', () => {
      const url = buildUrl(defaultBaseUrl, 'v1/agents', {
        status: 'active',
        filter: undefined,
        limit: 10,
        cursor: undefined,
      });

      expect(url.toString()).toBe(
        'https://api.lily.test/v1/agents?status=active&limit=10',
      );
      expect(url.searchParams.has('filter')).toBe(false);
      expect(url.searchParams.has('cursor')).toBe(false);
      expect(url.searchParams.get('status')).toBe('active');
      expect(url.searchParams.get('limit')).toBe('10');
    });

    it('does not emit dangling question mark when all query values are undefined', () => {
      const url = buildUrl(defaultBaseUrl, 'v1/agents', {
        a: undefined,
        b: undefined,
      });

      expect(url.toString()).toBe('https://api.lily.test/v1/agents');
      expect(url.search).toBe('');
    });
  });

  describe('boolean values stringification', () => {
    it('stringifies boolean true and false literals correctly', () => {
      const url = buildUrl(defaultBaseUrl, 'v1/config', {
        active: true,
        sandbox: false,
        debug: true,
      });

      expect(url.toString()).toBe(
        'https://api.lily.test/v1/config?active=true&sandbox=false&debug=true',
      );
      expect(url.searchParams.get('active')).toBe('true');
      expect(url.searchParams.get('sandbox')).toBe('false');
      expect(url.searchParams.get('debug')).toBe('true');
    });
  });

  describe('numeric values serialization', () => {
    it('retains numeric 0 and does not treat it as falsy or omitted', () => {
      const url = buildUrl(defaultBaseUrl, 'v1/metrics', {
        offset: 0,
        count: 0,
      });

      expect(url.toString()).toBe(
        'https://api.lily.test/v1/metrics?offset=0&count=0',
      );
      expect(url.searchParams.get('offset')).toBe('0');
      expect(url.searchParams.get('count')).toBe('0');
    });

    it('serializes negative numbers and floating point numbers accurately', () => {
      const url = buildUrl(defaultBaseUrl, 'v1/geo', {
        latitude: -34.6037,
        longitude: -58.3816,
        delta: -5,
        score: 98.6,
      });

      expect(url.toString()).toBe(
        'https://api.lily.test/v1/geo?latitude=-34.6037&longitude=-58.3816&delta=-5&score=98.6',
      );
      expect(url.searchParams.get('latitude')).toBe('-34.6037');
      expect(url.searchParams.get('longitude')).toBe('-58.3816');
      expect(url.searchParams.get('delta')).toBe('-5');
      expect(url.searchParams.get('score')).toBe('98.6');
    });
  });

  describe('special characters and encoding', () => {
    it('properly encodes spaces, email addresses, and url reserved characters', () => {
      const url = buildUrl(defaultBaseUrl, 'v1/users', {
        email: 'alice+test@example.com',
        query: 'lily protocol & sdk',
        filter: 'key=value?#',
      });

      expect(url.searchParams.get('email')).toBe('alice+test@example.com');
      expect(url.searchParams.get('query')).toBe('lily protocol & sdk');
      expect(url.searchParams.get('filter')).toBe('key=value?#');
      expect(url.toString()).toBe(
        'https://api.lily.test/v1/users?email=alice%2Btest%40example.com&query=lily+protocol+%26+sdk&filter=key%3Dvalue%3F%23',
      );
    });

    it('properly encodes unicode and emoji characters', () => {
      const url = buildUrl(defaultBaseUrl, 'v1/i18n', {
        greeting: '¡Hola Mundo!',
        emoji: '🚀✨',
        tag: 'café',
      });

      expect(url.searchParams.get('greeting')).toBe('¡Hola Mundo!');
      expect(url.searchParams.get('emoji')).toBe('🚀✨');
      expect(url.searchParams.get('tag')).toBe('café');
      expect(url.toString()).toBe(
        'https://api.lily.test/v1/i18n?greeting=%C2%A1Hola+Mundo%21&emoji=%F0%9F%9A%80%E2%9C%A8&tag=caf%C3%A9',
      );
    });

    it('properly encodes percent characters and slashes in query values', () => {
      const url = buildUrl(defaultBaseUrl, 'v1/discounts', {
        rate: '100%',
        redirect: '/dashboard/overview',
      });

      expect(url.searchParams.get('rate')).toBe('100%');
      expect(url.searchParams.get('redirect')).toBe('/dashboard/overview');
      expect(url.toString()).toBe(
        'https://api.lily.test/v1/discounts?rate=100%25&redirect=%2Fdashboard%2Foverview',
      );
    });
  });

  describe('base URL and path slash normalization', () => {
    it('normalizes path with leading slash against base URL ending with slash', () => {
      const baseUrl = new URL('https://api.lily.test/');
      const url = buildUrl(baseUrl, '/v1/system/health');

      expect(url.toString()).toBe('https://api.lily.test/v1/system/health');
      expect(url.pathname).toBe('/v1/system/health');
    });

    it('normalizes path without leading slash against base URL ending with slash', () => {
      const baseUrl = new URL('https://api.lily.test/');
      const url = buildUrl(baseUrl, 'v1/system/health');

      expect(url.toString()).toBe('https://api.lily.test/v1/system/health');
      expect(url.pathname).toBe('/v1/system/health');
    });

    it('resolves relative path against base URL with sub-path and trailing slash', () => {
      const baseUrl = new URL('https://api.lily.test/api/v1/');
      const url = buildUrl(baseUrl, 'agents');

      expect(url.toString()).toBe('https://api.lily.test/api/v1/agents');
      expect(url.pathname).toBe('/api/v1/agents');
    });

    it('resolves leading slash path by stripping first slash to avoid replacing base pathname prefix', () => {
      const baseUrl = new URL('https://api.lily.test/api/v1/');
      const url = buildUrl(baseUrl, '/agents');

      expect(url.toString()).toBe('https://api.lily.test/api/v1/agents');
      expect(url.pathname).toBe('/api/v1/agents');
    });

    it('handles root or empty path string cleanly', () => {
      const baseUrl = new URL('https://api.lily.test/');
      const urlWithEmpty = buildUrl(baseUrl, '');
      const urlWithSlash = buildUrl(baseUrl, '/');

      expect(urlWithEmpty.toString()).toBe('https://api.lily.test/');
      expect(urlWithSlash.toString()).toBe('https://api.lily.test/');
    });
  });

  describe('empty and undefined query objects', () => {
    it('produces clean URL without question mark when query parameter is omitted', () => {
      const url = buildUrl(defaultBaseUrl, '/v1/system/health');

      expect(url.toString()).toBe('https://api.lily.test/v1/system/health');
      expect(url.search).toBe('');
    });

    it('produces clean URL without question mark when query is undefined', () => {
      const url = buildUrl(defaultBaseUrl, '/v1/system/health', undefined);

      expect(url.toString()).toBe('https://api.lily.test/v1/system/health');
      expect(url.search).toBe('');
    });

    it('produces clean URL without question mark when query is an empty object', () => {
      const url = buildUrl(defaultBaseUrl, '/v1/system/health', {});

      expect(url.toString()).toBe('https://api.lily.test/v1/system/health');
      expect(url.search).toBe('');
    });
  });

  describe('integration with createFetchHttpClient', () => {
    it('passes serialized query parameters in URL when making fetch request', async () => {
      let capturedUrl: URL | undefined;

      const fetchSpy = vi.fn((input: URL | RequestInfo) => {
        if (input instanceof URL) {
          capturedUrl = input;
        } else if (typeof input === 'string') {
          capturedUrl = new URL(input);
        } else {
          capturedUrl = new URL(input.url);
        }

        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const client = createFetchHttpClient({
        baseUrl: new URL('https://api.lily.test/'),
        timeoutMs: 5000,
        retry: { retries: 0, retryDelayMs: 0, retryableStatusCodes: [] },
        defaultHeaders: {},
        userAgent: 'lily-sdk/test',
        fetch: fetchSpy,
      });

      const response = await client.request({
        method: 'GET',
        path: '/v1/agents',
        query: {
          page: 2,
          limit: 50,
          active: true,
          filter: undefined,
          search: 'alpha & beta',
        },
      });

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(capturedUrl).toBeDefined();
      expect(capturedUrl?.toString()).toBe(
        'https://api.lily.test/v1/agents?page=2&limit=50&active=true&search=alpha+%26+beta',
      );
      expect(capturedUrl?.searchParams.get('page')).toBe('2');
      expect(capturedUrl?.searchParams.get('limit')).toBe('50');
      expect(capturedUrl?.searchParams.get('active')).toBe('true');
      expect(capturedUrl?.searchParams.get('search')).toBe('alpha & beta');
      expect(capturedUrl?.searchParams.has('filter')).toBe(false);
    });
  });
});
