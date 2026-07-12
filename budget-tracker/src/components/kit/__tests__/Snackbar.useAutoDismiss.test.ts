/**
 * Exercises the hook through a real React render/commit cycle (via
 * react-test-renderer) rather than importing Snackbar.tsx itself: this
 * repo's Jest setup cannot transform JSX in .tsx source (ts-jest does not
 * apply the project's `jsx` compiler option under test), so any test that
 * imports a component module fails at parse time before a single assertion
 * runs. The harness below is built with React.createElement, not JSX, which
 * sidesteps that gap while still testing the hook under real React timing.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useAutoDismiss } from '../Snackbar.useAutoDismiss';

(global as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness(props: { visible: boolean; durationMs: number; onTimeout?: () => void }) {
  useAutoDismiss(props.visible, props.durationMs, props.onTimeout);
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('fires onTimeout after durationMs while visible', () => {
  const onTimeout = jest.fn();
  act(() => {
    TestRenderer.create(React.createElement(Harness, { visible: true, durationMs: 5000, onTimeout }));
  });

  act(() => {
    jest.advanceTimersByTime(4999);
  });
  expect(onTimeout).not.toHaveBeenCalled();

  act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(onTimeout).toHaveBeenCalledTimes(1);
});

test('never fires while not visible', () => {
  const onTimeout = jest.fn();
  act(() => {
    TestRenderer.create(React.createElement(Harness, { visible: false, durationMs: 1000, onTimeout }));
  });

  act(() => {
    jest.advanceTimersByTime(10000);
  });
  expect(onTimeout).not.toHaveBeenCalled();
});

test('clears the timer when the host flips visible off before the deadline', () => {
  const onTimeout = jest.fn();
  let renderer: ReturnType<typeof TestRenderer.create>;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(Harness, { visible: true, durationMs: 5000, onTimeout }),
    );
  });

  act(() => {
    jest.advanceTimersByTime(2000);
    renderer.update(React.createElement(Harness, { visible: false, durationMs: 5000, onTimeout }));
  });

  act(() => {
    jest.advanceTimersByTime(10000);
  });
  expect(onTimeout).not.toHaveBeenCalled();
});

test('clears the timer on unmount so a dismissed screen never fires late', () => {
  const onTimeout = jest.fn();
  let renderer: ReturnType<typeof TestRenderer.create>;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(Harness, { visible: true, durationMs: 5000, onTimeout }),
    );
  });

  act(() => {
    jest.advanceTimersByTime(2000);
    renderer.unmount();
  });

  act(() => {
    jest.advanceTimersByTime(10000);
  });
  expect(onTimeout).not.toHaveBeenCalled();
});
