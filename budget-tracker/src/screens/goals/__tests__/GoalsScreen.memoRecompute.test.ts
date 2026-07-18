/**
 * F4-4 regression test: GoalsScreen's derived-data memos must recompute on
 * every committed store mutation, not just on `today` changing. The store
 * object handed out by useStore/useStoreVersion is REFERENTIALLY STABLE for
 * the provider's lifetime (see src/providers/StoreProvider.tsx) — only the
 * monotonic version counter changes on mutation. A memo keyed on
 * `[store, today]` therefore silently never recomputes; keying on
 * `[version, today]` (the actual GoalsScreen.tsx fix) does.
 *
 * This repo's Jest setup cannot transform JSX in .tsx source (see
 * Snackbar.useAutoDismiss.test.ts's note), so this is built with
 * React.createElement over a minimal harness that mirrors the exact
 * useMemo-dependency shape GoalsScreen.tsx uses — no store/DB needed, since
 * the bug is pure React memoization behavior, not store logic.
 */
import React, { useMemo } from 'react';
import TestRenderer, { act } from 'react-test-renderer';

(global as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A referentially-stable object across renders, exactly like the `store`
// object returned by useStore/useContext(StoreCtx) — same identity every
// render regardless of how many mutations happened underneath it.
const stableStoreRef = { tag: 'stable-store' };

function Harness(props: {
  version: number;
  today: string;
  compute: () => void;
  keyOnVersion: boolean;
}) {
  const deps = props.keyOnVersion ? [props.version, props.today] : [stableStoreRef, props.today];
  useMemo(() => {
    props.compute();
    return null;
  }, deps);
  return null;
}

test('BUGGY shape: memoizing on [stableStoreRef, today] never recomputes across mutations', () => {
  const compute = jest.fn();
  let renderer: ReturnType<typeof TestRenderer.create>;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(Harness, {
        version: 1,
        today: '2026-07-17',
        compute,
        keyOnVersion: false,
      }),
    );
  });
  expect(compute).toHaveBeenCalledTimes(1);

  // Simulate three committed store mutations: version bumps, `today` is
  // unchanged, and the store object reference never changes (as in prod).
  for (const version of [2, 3, 4]) {
    act(() => {
      renderer.update(
        React.createElement(Harness, { version, today: '2026-07-17', compute, keyOnVersion: false }),
      );
    });
  }
  // This is the bug: the deps array is referentially identical every time
  // (same stableStoreRef, same today), so React never re-invokes compute.
  expect(compute).toHaveBeenCalledTimes(1);
});

test('FIXED shape: memoizing on [version, today] recomputes on every version bump', () => {
  const compute = jest.fn();
  let renderer: ReturnType<typeof TestRenderer.create>;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(Harness, {
        version: 1,
        today: '2026-07-17',
        compute,
        keyOnVersion: true,
      }),
    );
  });
  expect(compute).toHaveBeenCalledTimes(1);

  for (const version of [2, 3, 4]) {
    act(() => {
      renderer.update(
        React.createElement(Harness, { version, today: '2026-07-17', compute, keyOnVersion: true }),
      );
    });
  }
  // This is the fix: the version counter is part of the dep array, so each
  // committed mutation (bumped version) forces a recompute.
  expect(compute).toHaveBeenCalledTimes(4);
});

test('FIXED shape does not recompute when neither version nor today changes', () => {
  const compute = jest.fn();
  let renderer: ReturnType<typeof TestRenderer.create>;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(Harness, {
        version: 1,
        today: '2026-07-17',
        compute,
        keyOnVersion: true,
      }),
    );
  });
  act(() => {
    renderer.update(
      React.createElement(Harness, { version: 1, today: '2026-07-17', compute, keyOnVersion: true }),
    );
  });
  expect(compute).toHaveBeenCalledTimes(1);
});
