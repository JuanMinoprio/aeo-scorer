// Minimal vitest-style `expect` on node:assert, so engine tests port from the
// juanminoprio.com suite unchanged (keeps the two copies easy to diff).
import assert from "node:assert/strict";

function matchers(actual: unknown, negate: boolean) {
  const check = (pass: boolean, msg: string) => assert.ok(negate ? !pass : pass, (negate ? "not " : "") + msg);
  return {
    toBe: (e: unknown) => check(Object.is(actual, e), `expected ${String(actual)} to be ${String(e)}`),
    toEqual: (e: unknown) => {
      if (negate) assert.notDeepStrictEqual(actual, e);
      else assert.deepStrictEqual(actual, e);
    },
    toBeGreaterThan: (n: number) => check((actual as number) > n, `expected ${actual} > ${n}`),
    toBeGreaterThanOrEqual: (n: number) => check((actual as number) >= n, `expected ${actual} >= ${n}`),
    toBeLessThan: (n: number) => check((actual as number) < n, `expected ${actual} < ${n}`),
    toBeLessThanOrEqual: (n: number) => check((actual as number) <= n, `expected ${actual} <= ${n}`),
    toContain: (e: unknown) =>
      check((actual as { includes(x: unknown): boolean }).includes(e), `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(e)}`),
    toMatch: (re: RegExp | string) =>
      check(typeof re === "string" ? String(actual).includes(re) : re.test(String(actual)), `expected ${JSON.stringify(actual)} to match ${re}`),
  };
}

export function expect(actual: unknown) {
  return { ...matchers(actual, false), not: matchers(actual, true) };
}
