import { describe, it, expect } from 'vitest';
import {
  parseBitmap,
  toBitmap,
  isUnlocked,
  ACHIEVEMENTS,
  getUserAchievements,
} from './achievements';

describe('parseBitmap', () => {
  it('returns empty set for zero bitmap', () => {
    expect(parseBitmap('0')).toEqual(new Set());
  });

  it('parses single achievement at index 0', () => {
    expect(parseBitmap('1')).toEqual(new Set([0]));
  });

  it('parses multiple achievements', () => {
    // 0b101 = 5 hex → ids 0 and 2
    expect(parseBitmap('5')).toEqual(new Set([0, 2]));
  });

  it('parses high-index achievements', () => {
    // bit 20 set = 0x100000
    expect(parseBitmap('100000')).toEqual(new Set([20]));
  });

  it('strips 0x prefix', () => {
    expect(parseBitmap('0x1')).toEqual(new Set([0]));
  });

  it('handles empty string', () => {
    expect(parseBitmap('')).toEqual(new Set());
  });
});

describe('toBitmap', () => {
  it('converts empty set to 0', () => {
    expect(toBitmap(new Set())).toBe('0');
  });

  it('converts single id to correct hex', () => {
    expect(toBitmap(new Set([0]))).toBe('1');
  });

  it('converts multiple ids', () => {
    const result = toBitmap(new Set([0, 2]));
    expect(result).toBe('5'); // 0b101
  });

  it('handles high-index ids', () => {
    const result = toBitmap(new Set([20]));
    expect(result).toBe('100000');
  });
});

describe('parseBitmap <-> toBitmap roundtrip', () => {
  it('roundtrips correctly', () => {
    const ids = new Set([0, 1, 3, 20, 40, 60, 80, 83, 84, 85]);
    const hex = toBitmap(ids);
    const parsed = parseBitmap(hex);
    expect(parsed).toEqual(ids);
  });

  it('roundtrips all achievement ids', () => {
    const allIds = new Set(ACHIEVEMENTS.map((a) => a.id));
    const hex = toBitmap(allIds);
    const parsed = parseBitmap(hex);
    expect(parsed).toEqual(allIds);
  });
});

describe('isUnlocked', () => {
  it('returns false for empty bitmap', () => {
    expect(isUnlocked('0', 0)).toBe(false);
  });

  it('returns true for unlocked achievement', () => {
    expect(isUnlocked('1', 0)).toBe(true);
  });

  it('returns false for locked achievement', () => {
    expect(isUnlocked('1', 1)).toBe(false);
  });

  it('works with complex bitmaps', () => {
    const hex = toBitmap(new Set([0, 20, 40]));
    expect(isUnlocked(hex, 0)).toBe(true);
    expect(isUnlocked(hex, 20)).toBe(true);
    expect(isUnlocked(hex, 40)).toBe(true);
    expect(isUnlocked(hex, 1)).toBe(false);
    expect(isUnlocked(hex, 21)).toBe(false);
  });
});

describe('ACHIEVEMENTS', () => {
  it('has unique ids', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique keys', () => {
    const keys = ACHIEVEMENTS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('all ids are within 0-255', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toBeGreaterThanOrEqual(0);
      expect(a.id).toBeLessThan(256);
    }
  });

  it('has all required categories', () => {
    const categories = new Set(ACHIEVEMENTS.map((a) => a.category));
    expect(categories).toContain('progress');
    expect(categories).toContain('streak');
    expect(categories).toContain('skill');
    expect(categories).toContain('community');
    expect(categories).toContain('special');
  });
});

describe('getUserAchievements', () => {
  it('returns all achievements with unlock status', () => {
    const bitmap = toBitmap(new Set([0, 1]));
    const result = getUserAchievements(bitmap);

    expect(result.length).toBe(ACHIEVEMENTS.length);

    const firstSteps = result.find((a) => a.key === 'first_steps');
    expect(firstSteps?.isUnlocked).toBe(true);

    const courseCompleter = result.find((a) => a.key === 'course_completer');
    expect(courseCompleter?.isUnlocked).toBe(true);

    const speedRunner = result.find((a) => a.key === 'speed_runner');
    expect(speedRunner?.isUnlocked).toBe(false);
  });

  it('marks all locked for empty bitmap', () => {
    const result = getUserAchievements('0');
    expect(result.every((a) => !a.isUnlocked)).toBe(true);
  });
});
