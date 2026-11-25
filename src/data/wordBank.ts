import crypto from 'node:crypto';
import type { WordBankStats, WordEntry, WordPack, WordRegion } from '../types/game.ts';
import { INDIAN_WORDS_PART_1 } from './wordsIndian1.ts';
import { INDIAN_WORDS_PART_2 } from './wordsIndian2.ts';
import { INDIAN_WORDS_PART_3 } from './wordsIndian3.ts';
import { GLOBAL_WORDS_PART_1 } from './wordsGlobal1.ts';
import { GLOBAL_WORDS_PART_2 } from './wordsGlobal2.ts';

function buildBank(): WordEntry[] {
  const seen = new Set<string>();
  const entries: WordEntry[] = [];

  const ingest = (list: ReadonlyArray<readonly [string, string, string]>, region: WordRegion) => {
    for (const [rawWord, rawSimilar, rawCategory] of list) {
      const word = rawWord.trim();
      const similarWord = rawSimilar.trim();
      const category = rawCategory.trim();
      const key = word.toLowerCase();
      if (!word || !similarWord || seen.has(key)) continue;
      seen.add(key);
      entries.push({
        id: `${region.slice(0, 3)}_${entries.length + 1}`,
        word,
        similarWord,
        category,
        region,
      });
    }
  };

  ingest(INDIAN_WORDS_PART_1, 'indian');
  ingest(INDIAN_WORDS_PART_2, 'indian');
  ingest(INDIAN_WORDS_PART_3, 'indian');
  ingest(GLOBAL_WORDS_PART_1, 'global');
  ingest(GLOBAL_WORDS_PART_2, 'global');

  return entries;
}

export const WORD_BANK: WordEntry[] = buildBank();

export const WORD_BANK_STATS: WordBankStats = (() => {
  let indian = 0;
  let global = 0;
  const catMap = new Map<string, { name: string; region: WordRegion; count: number }>();

  for (const entry of WORD_BANK) {
    if (entry.region === 'indian') indian += 1;
    else global += 1;

    const existing = catMap.get(entry.category);
    if (existing) {
      existing.count += 1;
    } else {
      catMap.set(entry.category, { name: entry.category, region: entry.region, count: 1 });
    }
  }

  return {
    total: WORD_BANK.length,
    indian,
    global,
    categories: Array.from(catMap.values()).sort((a, b) => b.count - a.count),
  };
})();

export function getPackPool(pack: WordPack): WordEntry[] {
  if (pack === 'indian') return WORD_BANK.filter((w) => w.region === 'indian');
  if (pack === 'global') return WORD_BANK.filter((w) => w.region === 'global');
  return WORD_BANK;
}

export function pickRandomWord(pack: WordPack, usedIds: Set<string>): { entry: WordEntry; wrappedAround: boolean } {
  const pool = getPackPool(pack);
  let candidates = pool.filter((w) => !usedIds.has(w.id));
  let wrappedAround = false;

  if (candidates.length === 0) {
    // Only wraps around after exhausting the entire pool (hundreds/1200+ rounds!)
    wrappedAround = true;
    candidates = pool;
  }

  // In mixed mode, slightly weight toward Indian (~63% natural ratio since ~780 Indian vs ~460 Global)
  const idx = crypto.randomInt(0, candidates.length);
  return { entry: candidates[idx], wrappedAround };
}
