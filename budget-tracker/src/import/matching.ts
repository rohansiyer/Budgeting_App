/**
 * Semantic category matching (Import engine, F11). Fully on-device and
 * DETERMINISTIC: same inputs → same suggestion, always.
 *
 * Match precedence (first hit wins):
 *   1. LEARNED — an exact normalized-merchant hit in the corrections store
 *      returns that category (confidence 'learned'). A learned mapping ALWAYS
 *      beats a keyword guess.
 *   2. KEYWORD — the merchant's tokens hit a category's keyword set, derived
 *      from the category's default colorKey bucket plus its own name tokens
 *      (confidence 'keyword').
 *   3. NONE — nothing fired; the row goes to the review screen.
 */
import type { CategoryColorKey } from '../types/contracts';
import type { ImportRow } from './csv';

// ---------------------------------------------------------------------------
// Merchant normalization.
// ---------------------------------------------------------------------------
const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
  'WI','WY','DC',
]);

/**
 * Normalize a raw merchant string for matching + dedupe:
 *   - uppercase
 *   - strip card-processor prefixes ("TST* ", "SQ *", "PP*", "POS ")
 *   - punctuation → space
 *   - drop store numbers ("#1234", bare digit runs)
 *   - drop a trailing US state code (city suffixes are bank-specific; the state
 *     is the reliably-strippable tail)
 *   - collapse whitespace
 */
export function normalizeMerchant(raw: string): string {
  let s = (raw ?? '').toUpperCase();
  // Processor prefixes like "TST* ", "SQ *", "PP*", "CKE*".
  s = s.replace(/\b[A-Z]{2,4}\s*\*\s*/g, ' ');
  // Leading POS/DEBIT/CHECKCARD noise.
  s = s.replace(/\b(POS|DEBIT|CREDIT|CHECKCARD|PURCHASE|PMT|ACH)\b/g, ' ');
  // Punctuation → space.
  s = s.replace(/[^A-Z0-9 ]+/g, ' ');
  // Store numbers: "#1234" and bare digit runs.
  s = s.replace(/#?\b\d[\d-]*\b/g, ' ');
  let tokens = s.split(/\s+/).filter((t) => t.length > 0);
  // Drop a trailing state code.
  if (tokens.length > 1 && US_STATES.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }
  return tokens.join(' ').trim();
}

/** Tokenize a normalized (or raw) merchant into uppercase word tokens. */
export function tokenize(normalized: string): string[] {
  return normalizeMerchant(normalized).split(/\s+/).filter((t) => t.length > 0);
}

// ---------------------------------------------------------------------------
// Default keyword buckets (~15 each). Buckets map to a colorKey via the default
// category association: violet=Fixed, amber=Food, mint=Savings, blue=Transit,
// pink=Fun (README §5 category palette).
// ---------------------------------------------------------------------------
export type KeywordBucket = 'food' | 'transit' | 'fun' | 'fixed' | 'savings';

export const KEYWORDS: Record<KeywordBucket, readonly string[]> = {
  food: [
    'GROCERY','GROCERIES','MARKET','FOODS','FOOD','CAFE','COFFEE','STARBUCKS','RESTAURANT',
    'PIZZA','KITCHEN','DINER','BAKERY','DELI','TRADER','JOES','SAFEWAY','KROGER','ALDI',
    'CHIPOTLE','MCDONALDS','GRILL','TACO','SUSHI','DRAGON','BURGER',
  ],
  transit: [
    'UBER','LYFT','SHELL','CHEVRON','EXXON','MOBIL','GAS','FUEL','METRO','TRANSIT','PARKING',
    'TOLL','ARCO','SUNOCO','MARATHON','CITGO','TRAIN','BART','CALTRAIN','AMTRAK','MTA',
  ],
  fun: [
    'NETFLIX','SPOTIFY','HULU','DISNEY','CINEMA','MOVIE','THEATER','STEAM','XBOX','PLAYSTATION',
    'NINTENDO','TAVERN','BREWERY','CONCERT','TICKETMASTER','AMC','REGAL','PATREON','TWITCH','GAMESTOP',
  ],
  fixed: [
    'RENT','MORTGAGE','ELECTRIC','UTILITY','UTILITIES','WATER','INTERNET','COMCAST','XFINITY',
    'VERIZON','ATT','TMOBILE','INSURANCE','PHONE','PGE','SEWER','TRASH','LANDLORD','GEICO',
  ],
  savings: [
    'SAVINGS','VANGUARD','FIDELITY','SCHWAB','ROBINHOOD','ACORNS','BETTERMENT','WEALTHFRONT',
    'ALLY','MARCUS','SOFI','BROKERAGE','IRA','INVEST','DEPOSIT',
  ],
};

/** Default colorKey → keyword bucket association. */
const COLOR_BUCKET: Record<CategoryColorKey, KeywordBucket> = {
  amber: 'food',
  blue: 'transit',
  pink: 'fun',
  violet: 'fixed',
  mint: 'savings',
};

export interface MatchCategory {
  id: string;
  name: string;
  colorKey: CategoryColorKey;
  fixed: boolean;
}

export interface MatchContext {
  /** Deterministic tie-break: earlier categories win a keyword tie. */
  categories: MatchCategory[];
  corrections: Array<{ normalizedMerchant: string; categoryId: string }>;
}

export type MatchConfidence = 'learned' | 'keyword' | 'none';

export interface MatchResult {
  row: ImportRow;
  normalizedMerchant: string;
  suggestedCategoryId: string | null;
  confidence: MatchConfidence;
}

/** The full keyword set a category matches on: its colorKey bucket + name tokens. */
function keywordSetFor(cat: MatchCategory): Set<string> {
  const set = new Set<string>(KEYWORDS[COLOR_BUCKET[cat.colorKey]] ?? []);
  for (const t of cat.name.toUpperCase().split(/[^A-Z0-9]+/).filter((x) => x.length > 2)) {
    set.add(t);
  }
  return set;
}

export function matchRow(row: ImportRow, ctx: MatchContext): MatchResult {
  const normalizedMerchant = normalizeMerchant(row.description);

  // 1. Learned correction (exact normalized hit) beats everything.
  const learned = ctx.corrections.find((c) => c.normalizedMerchant === normalizedMerchant);
  if (learned && ctx.categories.some((cat) => cat.id === learned.categoryId)) {
    return {
      row,
      normalizedMerchant,
      suggestedCategoryId: learned.categoryId,
      confidence: 'learned',
    };
  }

  // 2. Keyword: first category (in order) whose keyword set hits a merchant token.
  const tokens = normalizedMerchant.split(/\s+/).filter((t) => t.length > 0);
  const tokenSet = new Set(tokens);
  for (const cat of ctx.categories) {
    const keywords = keywordSetFor(cat);
    for (const t of tokenSet) {
      if (keywords.has(t)) {
        return { row, normalizedMerchant, suggestedCategoryId: cat.id, confidence: 'keyword' };
      }
    }
  }

  // 3. Nothing fired.
  return { row, normalizedMerchant, suggestedCategoryId: null, confidence: 'none' };
}

export function matchRows(rows: ImportRow[], ctx: MatchContext): MatchResult[] {
  return rows.map((r) => matchRow(r, ctx));
}
