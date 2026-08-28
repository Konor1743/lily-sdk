import { describe, expect, it, vi } from 'vitest';

import { PaymentClient } from '../src/clients/payment-client';
import { LilyAuthenticationError } from '../src/errors/sdk-error';
import { createFetchHttpClient } from '../src/http/fetch-http-client';
import { LilySdk } from '../src/sdk';
import { createMockHttpClient } from './helpers/mock-http-client';

describe('client behavior', () => {
  it.each([
    '1',
    '1.0',
    '01.5',
    '0.0000001',
    '0.000001',
    '0',
    '0.00',
    '100.0000000',
    '1e-5',
    '1.5e3',
    '.5',
    '10.',
    '-5.25',
    '1000000000000',
  ])(
    'passes MoneyAmount string %s through payment requests unchanged',
    async (amount) => {
      const requestSpy = vi.fn(() =>
        Promise.resolve({
          status: 200,
          headers: new Headers(),
          data: {},
        }),
      );

      const sdk = new LilySdk(
        {
          baseUrl: 'https://api.lily.test',
          fetch: globalThis.fetch,
        },
        createMockHttpClient(requestSpy),
      );

      const moneyAmount = {
        assetCode: 'USDC',
        assetIssuer: 'GISSUER1234567890',
        amount,
      };

      await sdk.payments.quote({
        fromWalletId: 'wallet-123',
        toAddress: 'GDESTINATION123',
        amount: moneyAmount,
      });

      await sdk.payments.execute({
        fromWalletId: 'wallet-123',
        toAddress: 'GDESTINATION123',
        amount: moneyAmount,
        memo: 'test-memo',
        idempotencyKey: 'idem-456',
      });

      expect(requestSpy).toHaveBeenNthCalledWith(1, {
        method: 'POST',
        path: '/v1/payments/quote',
        body: {
          fromWalletId: 'wallet-123',
          toAddress: 'GDESTINATION123',
          amount: {
            assetCode: 'USDC',
            assetIssuer: 'GISSUER1234567890',
            amount,
          },
        },
      });

      expect(requestSpy).toHaveBeenNthCalledWith(2, {
        method: 'POST',
        path: '/v1/payments',
        body: {
          fromWalletId: 'wallet-123',
          toAddress: 'GDESTINATION123',
          amount: {
            assetCode: 'USDC',
            assetIssuer: 'GISSUER1234567890',
            amount,
          },
          memo: 'test-memo',
          idempotencyKey: 'idem-456',
        },
      });
    },
  );

  it('calls payment endpoints directly via PaymentClient instance', async () => {
    const requestSpy = vi.fn(() =>
      Promise.resolve({
        status: 200,
        headers: new Headers(),
        data: {},
      }),
    );

    const client = new PaymentClient(createMockHttpClient(requestSpy));

    await client.quote({
      fromWalletId: 'wallet-abc',
      toAddress: 'GDEST-abc',
      amount: {
        assetCode: 'XLM',
        amount: '42.000',
      },
    });

    await client.execute({
      fromWalletId: 'wallet-abc',
      toAddress: 'GDEST-abc',
      amount: {
        assetCode: 'XLM',
        amount: '42.000',
      },
    });

    await client.get('pay-789');

    expect(requestSpy).toHaveBeenNthCalledWith(1, {
      method: 'POST',
      path: '/v1/payments/quote',
      body: {
        fromWalletId: 'wallet-abc',
        toAddress: 'GDEST-abc',
        amount: {
          assetCode: 'XLM',
          amount: '42.000',
        },
      },
    });

    expect(requestSpy).toHaveBeenNthCalledWith(2, {
      method: 'POST',
      path: '/v1/payments',
      body: {
        fromWalletId: 'wallet-abc',
        toAddress: 'GDEST-abc',
        amount: {
          assetCode: 'XLM',
          amount: '42.000',
        },
      },
    });

    expect(requestSpy).toHaveBeenNthCalledWith(3, {
      method: 'GET',
      path: '/v1/payments/pay-789',
    });
  });

  it('calls system health endpoint through the system client', async () => {
    const requestSpy = vi.fn(() =>
      Promise.resolve({
        status: 200,
        headers: new Headers(),
        data: {
          status: 'ok',
          version: '0.1.0',
          timestamp: new Date().toISOString(),
          checks: {
            api: 'ok',
          },
        },
      }),
    );

    const sdk = new LilySdk(
      {
        baseUrl: 'https://api.lily.test',
        fetch: globalThis.fetch,
      },
      createMockHttpClient(requestSpy),
    );

    const health = await sdk.system.health();

    expect(requestSpy).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/system/health',
    });
    expect(health.status).toBe('ok');
  });

  it('adds auth headers to transport requests', async () => {
    const fetchSpy = vi.fn((_input: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer secret-token',
        'x-api-key': 'secret-key',
      });

      return Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'ok',
            version: '0.1.0',
            timestamp: new Date().toISOString(),
            checks: {
              api: 'ok',
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      );
    });

    const httpClient = createFetchHttpClient({
      baseUrl: new URL('https://api.lily.test/'),
      apiKey: 'secret-key',
      authToken: 'secret-token',
      timeoutMs: 2_000,
      retry: {
        retries: 0,
        retryDelayMs: 0,
        retryableStatusCodes: [],
      },
      defaultHeaders: {},
      userAgent: 'lily-sdk/test',
      fetch: fetchSpy,
    });

    const response = await httpClient.request({
      method: 'GET',
      path: '/v1/system/health',
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('maps authentication failures to a typed error', async () => {
    const httpClient = createFetchHttpClient({
      baseUrl: new URL('https://api.lily.test/'),
      timeoutMs: 2_000,
      retry: {
        retries: 0,
        retryDelayMs: 0,
        retryableStatusCodes: [],
      },
      defaultHeaders: {},
      userAgent: 'lily-sdk/test',
      fetch: vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'nope' }), {
            status: 401,
            headers: {
              'content-type': 'application/json',
            },
          }),
        ),
      ),
    });

    await expect(
      httpClient.request({
        method: 'GET',
        path: '/v1/system/health',
      }),
    ).rejects.toBeInstanceOf(LilyAuthenticationError);
  });
});
