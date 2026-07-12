/**
 * Minimal ambient typing for react-test-renderer (no @types package is
 * installed in this repo). Scoped to kit/__tests__ only; sufficient for the
 * create()/toJSON()/act() surface these component tests use.
 */
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface TestRendererJSON {
    type: string;
    props: Record<string, unknown>;
    children: (TestRendererJSON | string)[] | null;
  }

  export interface TestRendererInstance {
    toJSON(): TestRendererJSON | TestRendererJSON[] | null;
    unmount(): void;
    update(nextElement: ReactElement): void;
  }

  export function create(element: ReactElement): TestRendererInstance;
  export function act(callback: () => void | Promise<void>): Promise<void>;

  const TestRenderer: {
    create: typeof create;
    act: typeof act;
  };
  export default TestRenderer;
}
