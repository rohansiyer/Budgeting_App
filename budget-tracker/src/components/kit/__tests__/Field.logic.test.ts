import { resolveFieldBorderState } from '../Field.logic';

describe('resolveFieldBorderState', () => {
  test('defaults when neither focused nor errored', () => {
    expect(resolveFieldBorderState(false, false)).toBe('default');
  });

  test('focused wins over default', () => {
    expect(resolveFieldBorderState(true, false)).toBe('focused');
  });

  test('error wins over focused: an invalid focused field still reads invalid', () => {
    expect(resolveFieldBorderState(true, true)).toBe('error');
  });

  test('error wins even when unfocused', () => {
    expect(resolveFieldBorderState(false, true)).toBe('error');
  });
});
