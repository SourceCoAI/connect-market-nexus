import { describe, it, expect } from 'vitest';
import { retryConditions } from './use-retry';

describe('retryConditions', () => {
  describe('networkOnly', () => {
    it('returns true for network errors', () => {
      const networkError = new Error('network');
      networkError.name = 'NetworkError';
      expect(retryConditions.networkOnly(networkError)).toBe(true);
      expect(retryConditions.networkOnly({ code: 'NETWORK_ERROR' })).toBe(true);
      expect(retryConditions.networkOnly(new Error('network request failed'))).toBe(true);
      expect(retryConditions.networkOnly(new Error('fetch error occurred'))).toBe(true);
    });

    it('returns falsy for non-network errors', () => {
      expect(retryConditions.networkOnly({ name: 'TypeError' })).toBeFalsy();
      expect(retryConditions.networkOnly({ message: 'validation error' })).toBeFalsy();
      expect(retryConditions.networkOnly(new Error('general error'))).toBeFalsy();
    });
  });

  describe('serverErrorsOnly', () => {
    it('returns true for 5xx errors', () => {
      expect(retryConditions.serverErrorsOnly({ status: 500 })).toBe(true);
      expect(retryConditions.serverErrorsOnly({ status: 502 })).toBe(true);
      expect(retryConditions.serverErrorsOnly({ status: 503 })).toBe(true);
      expect(retryConditions.serverErrorsOnly({ response: { status: 500 } })).toBe(true);
    });

    it('returns false for 4xx errors', () => {
      expect(retryConditions.serverErrorsOnly({ status: 400 })).toBe(false);
      expect(retryConditions.serverErrorsOnly({ status: 404 })).toBe(false);
      expect(retryConditions.serverErrorsOnly({ status: 401 })).toBe(false);
    });

    it('returns false for errors without status', () => {
      expect(retryConditions.serverErrorsOnly(new Error('no status'))).toBe(false);
    });
  });

  describe('nonAuthErrors', () => {
    it('returns true for non-auth errors', () => {
      expect(retryConditions.nonAuthErrors({ message: 'network timeout' })).toBe(true);
      expect(retryConditions.nonAuthErrors({ message: 'server error' })).toBe(true);
    });

    it('returns false for auth-related errors', () => {
      expect(retryConditions.nonAuthErrors(new Error('auth failed'))).toBe(false);
      expect(retryConditions.nonAuthErrors(new Error('Unauthorized access'))).toBe(false);
      expect(retryConditions.nonAuthErrors(new Error('Forbidden resource'))).toBe(false);
    });
  });

  describe('withJitter', () => {
    it('returns false for high attempt numbers', () => {
      // After attempt 5, should always return false
      let allFalse = true;
      for (let i = 0; i < 100; i++) {
        if (retryConditions.withJitter(null, 5)) {
          allFalse = false;
        }
      }
      expect(allFalse).toBe(true);
    });

    it('returns boolean for low attempt numbers', () => {
      const result = retryConditions.withJitter(null, 0);
      expect(typeof result).toBe('boolean');
    });
  });
});
