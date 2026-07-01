import { tokenizeForSearch } from './messages.service';

describe('tokenizeForSearch (pure)', () => {
  it('inserts spaces around each CJK character', () => {
    expect(tokenizeForSearch('hello世界')).toBe('hello 世 界');
    expect(tokenizeForSearch('你好')).toBe('你 好');
  });

  it('preserves pure-ASCII text unchanged', () => {
    expect(tokenizeForSearch('hello world')).toBe('hello world');
    expect(tokenizeForSearch('abc123')).toBe('abc123');
  });

  it('returns empty string for empty input', () => {
    expect(tokenizeForSearch('')).toBe('');
  });

  it('collapses multiple spaces into one', () => {
    expect(tokenizeForSearch('a   b')).toBe('a b');
    // CJK with surrounding spaces collapses too
    expect(tokenizeForSearch('  你 好  ')).toBe('你 好');
  });

  it('trims leading/trailing whitespace', () => {
    expect(tokenizeForSearch('  hello  ')).toBe('hello');
    expect(tokenizeForSearch(' 你 ')).toBe('你');
  });

  it('handles mixed CJK + ascii + punctuation', () => {
    expect(tokenizeForSearch('hi 你好! world世界')).toBe('hi 你 好 ! world 世 界');
  });

  it('only treats CJK Unified Ideographs (U+4E00-U+9FFF) as tokenizable', () => {
    // CJK punctuation （U+3000-U+303F) is NOT split — only \u4e00-\u9fff
    expect(tokenizeForSearch('。')).toBe('。');
    // full-width latin (U+FF00-U+FFEF) is NOT split
    expect(tokenizeForSearch('ＡＢ')).toBe('ＡＢ');
    // katakana NOT in range — unchanged
    expect(tokenizeForSearch('アイ')).toBe('アイ');
  });
});
