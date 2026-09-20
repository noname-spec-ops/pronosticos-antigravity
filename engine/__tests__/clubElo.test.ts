import { describe, it, expect } from 'vitest';
import {
  getClubEloRating,
  getClubEloDatabase,
} from '../../services/clubEloService';

describe('Club ELO Benchmark Service', () => {
  it('loads club ELO database with top clubs', () => {
    const db = getClubEloDatabase();
    expect(db).toBeDefined();
    expect(Object.keys(db).length).toBeGreaterThan(10);
  });

  it('retrieves accurate ELO ratings for elite clubs with name normalization', () => {
    const manCityElo = getClubEloRating('Manchester City FC');
    expect(manCityElo).toBeGreaterThanOrEqual(2000);

    const realMadridElo = getClubEloRating('Real Madrid CF');
    expect(realMadridElo).toBeGreaterThanOrEqual(1980);

    const arsenalElo = getClubEloRating('Arsenal FC');
    expect(arsenalElo).toBeGreaterThan(1900);
  });

  it('provides sensible fallback for unknown or amateur clubs', () => {
    const fallback = getClubEloRating('NonExistent Village FC', 1450);
    expect(fallback).toBe(1450);
  });
});