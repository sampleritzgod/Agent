import { TECHNICAL_TERMS } from "./technical-terms";
import type { TransliterateOptions } from "./types";

/**
 * Rule-based Devanagari -> Latin (Hinglish) transliterator. This performs
 * transliteration only — it never translates. Non-Devanagari runs (English
 * words, technical terms, punctuation, numbers) pass through untouched, so terms
 * already in Latin are preserved as-is.
 *
 * Handles conjuncts (virama), matras, anusvara/chandrabindu/visarga, nukta, and
 * applies Hindi schwa deletion (word-final + Ohala's medial VC_CV rule) so the
 * output reads naturally (e.g. करके -> "karke", नमस्ते -> "namaste").
 */

const DEV_START = 0x0900;
const DEV_END = 0x097f;
const VIRAMA = "\u094d";
const NUKTA = "\u093c";
const ANUSVARA = "\u0902";
const CHANDRABINDU = "\u0901";
const VISARGA = "\u0903";

const INDEPENDENT_VOWELS: Record<string, string> = {
  "\u0905": "a", // अ
  "\u0906": "aa", // आ
  "\u0907": "i", // इ
  "\u0908": "i", // ई
  "\u0909": "u", // उ
  "\u090a": "u", // ऊ
  "\u090b": "ri", // ऋ
  "\u0960": "ri", // ॠ
  "\u090c": "li", // ऌ
  "\u090f": "e", // ए
  "\u0910": "ai", // ऐ
  "\u0913": "o", // ओ
  "\u0914": "au", // औ
  "\u0911": "o", // ऑ
  "\u0912": "o", // ऒ
  "\u090d": "e", // ऍ
  "\u090e": "e", // ऎ
  "\u0972": "a", // ॲ
};

const MATRAS: Record<string, string> = {
  "\u093e": "aa", // ा
  "\u093f": "i", // ि
  "\u0940": "i", // ी
  "\u0941": "u", // ु
  "\u0942": "u", // ू
  "\u0943": "ri", // ृ
  "\u0944": "ri", // ॄ
  "\u0947": "e", // े
  "\u0948": "ai", // ै
  "\u094b": "o", // ो
  "\u094c": "au", // ौ
  "\u0949": "o", // ॉ
  "\u094a": "o", // ॊ
  "\u0945": "e", // ॅ
  "\u0946": "e", // ॆ
  "\u0962": "li", // ॢ
};

const CONSONANTS: Record<string, string> = {
  "\u0915": "k", // क
  "\u0916": "kh", // ख
  "\u0917": "g", // ग
  "\u0918": "gh", // घ
  "\u0919": "ng", // ङ
  "\u091a": "ch", // च
  "\u091b": "chh", // छ
  "\u091c": "j", // ज
  "\u091d": "jh", // झ
  "\u091e": "ny", // ञ
  "\u091f": "t", // ट
  "\u0920": "th", // ठ
  "\u0921": "d", // ड
  "\u0922": "dh", // ढ
  "\u0923": "n", // ण
  "\u0924": "t", // त
  "\u0925": "th", // थ
  "\u0926": "d", // द
  "\u0927": "dh", // ध
  "\u0928": "n", // न
  "\u0929": "n", // ऩ
  "\u092a": "p", // प
  "\u092b": "ph", // फ
  "\u092c": "b", // ब
  "\u092d": "bh", // भ
  "\u092e": "m", // म
  "\u092f": "y", // य
  "\u0930": "r", // र
  "\u0931": "r", // ऱ
  "\u0932": "l", // ल
  "\u0933": "l", // ळ
  "\u0934": "l", // ऴ
  "\u0935": "v", // व
  "\u0936": "sh", // श
  "\u0937": "sh", // ष
  "\u0938": "s", // स
  "\u0939": "h", // ह
  // Precomposed nukta consonants
  "\u0958": "q", // क़
  "\u0959": "kh", // ख़
  "\u095a": "g", // ग़
  "\u095b": "z", // ज़
  "\u095c": "r", // ड़
  "\u095d": "rh", // ढ़
  "\u095e": "f", // फ़
  "\u095f": "y", // य़
};

/** Base consonant -> nukta variant (for base + U+093C sequences). */
const NUKTA_VARIANTS: Record<string, string> = {
  "\u0915": "q", // क़
  "\u0916": "kh", // ख़
  "\u0917": "g", // ग़
  "\u091c": "z", // ज़
  "\u0921": "r", // ड़
  "\u0922": "rh", // ढ़
  "\u092b": "f", // फ़
  "\u092f": "y", // य़
};

const DIGITS: Record<string, string> = {
  "\u0966": "0",
  "\u0967": "1",
  "\u0968": "2",
  "\u0969": "3",
  "\u096a": "4",
  "\u096b": "5",
  "\u096c": "6",
  "\u096d": "7",
  "\u096e": "8",
  "\u096f": "9",
};

interface Unit {
  kind: "C" | "V" | "O";
  /** Latin onset consonant cluster (for kind "C"). */
  cluster: string;
  /** Number of consonants in the cluster (for schwa-deletion rules). */
  consonantCount: number;
  /** Vowel sound: an explicit vowel, "a" (inherent schwa), or "" (suppressed). */
  vowel: string;
  /** Coda tokens after the vowel: "M" (anusvara, resolved late), "n", "h". */
  coda: string[];
  /** Literal Latin output (for kind "V" and "O"). */
  out: string;
}

function isConsonant(ch: string): boolean {
  return ch in CONSONANTS;
}

function isMatra(ch: string): boolean {
  return ch in MATRAS;
}

function isCoda(ch: string): boolean {
  return ch === ANUSVARA || ch === CHANDRABINDU || ch === VISARGA;
}

function codaToken(ch: string): string {
  if (ch === ANUSVARA) return "M"; // resolved to n/m based on the next onset
  if (ch === CHANDRABINDU) return "n";
  return "h"; // visarga
}

/** Parse a single Devanagari word into phonetic units. */
function parseUnits(word: string): Unit[] {
  const units: Unit[] = [];
  let i = 0;

  while (i < word.length) {
    const ch = word[i];

    if (isConsonant(ch)) {
      let cluster = CONSONANTS[ch];
      let consonantCount = 1;
      i += 1;
      if (word[i] === NUKTA) {
        cluster = NUKTA_VARIANTS[ch] ?? cluster;
        i += 1;
      }

      let vowel = "a";
      // Consume virama-joined consonants to build a conjunct cluster.
      while (word[i] === VIRAMA) {
        i += 1;
        if (i < word.length && isConsonant(word[i])) {
          let next = CONSONANTS[word[i]];
          const base = word[i];
          i += 1;
          if (word[i] === NUKTA) {
            next = NUKTA_VARIANTS[base] ?? next;
            i += 1;
          }
          cluster += next;
          consonantCount += 1;
        } else {
          // Trailing halant: consonant with no vowel.
          vowel = "";
          break;
        }
      }

      if (vowel !== "" && isMatra(word[i])) {
        vowel = MATRAS[word[i]];
        i += 1;
      }

      const coda: string[] = [];
      while (i < word.length && isCoda(word[i])) {
        coda.push(codaToken(word[i]));
        i += 1;
      }

      units.push({ kind: "C", cluster, consonantCount, vowel, coda, out: "" });
      continue;
    }

    if (ch in INDEPENDENT_VOWELS) {
      i += 1;
      const coda: string[] = [];
      while (i < word.length && isCoda(word[i])) {
        coda.push(codaToken(word[i]));
        i += 1;
      }
      units.push({
        kind: "V",
        cluster: "",
        consonantCount: 0,
        vowel: "",
        coda,
        out: INDEPENDENT_VOWELS[ch],
      });
      continue;
    }

    if (ch in DIGITS) {
      units.push({ kind: "O", cluster: "", consonantCount: 0, vowel: "", coda: [], out: DIGITS[ch] });
      i += 1;
      continue;
    }

    // Avagraha, ZWNJ/ZWJ, and anything else Devanagari we don't model: drop.
    units.push({ kind: "O", cluster: "", consonantCount: 0, vowel: "", coda: [], out: "" });
    i += 1;
  }

  return units;
}

function isVowelBearing(unit: Unit | undefined): boolean {
  if (!unit) return false;
  if (unit.kind === "V") return true;
  return unit.kind === "C" && unit.vowel !== "";
}

/**
 * Apply Hindi schwa deletion in place:
 *  - word-final inherent schwa is dropped (राम -> "raam"),
 *  - medial schwa is dropped in a VC_CV context where the following akshara is a
 *    single consonant + vowel (करके -> "karke"), but kept before clusters
 *    (नमस्ते -> "namaste").
 * The initial schwa is always retained.
 */
function applySchwaDeletion(units: Unit[]): void {
  // Single-akshara words keep their schwa (क -> "ka", न -> "na"); a lone
  // consonant with no other sound would be unpronounceable otherwise.
  const pronounced = units.filter((u) => !(u.kind === "O" && u.out === ""));
  if (pronounced.length <= 1) {
    return;
  }

  // Word-final schwa: last pronounced unit is a consonant with inherent schwa.
  for (let i = units.length - 1; i >= 0; i -= 1) {
    const unit = units[i];
    if (unit.kind === "O" && unit.out === "") continue;
    if (unit.kind === "C" && unit.vowel === "a") {
      unit.vowel = "";
    }
    break;
  }

  // Medial schwa (right-to-left so deletions cascade). Skip the initial unit.
  for (let i = units.length - 2; i >= 1; i -= 1) {
    const unit = units[i];
    if (unit.kind !== "C" || unit.vowel !== "a" || unit.consonantCount !== 1) {
      continue;
    }
    const prev = units[i - 1];
    const next = units[i + 1];
    const nextIsSimpleCV =
      next?.kind === "C" && next.vowel !== "" && next.consonantCount === 1;
    if (isVowelBearing(prev) && nextIsSimpleCV) {
      unit.vowel = "";
    }
  }
}

function resolveCoda(tokens: string[], nextOnset: string | undefined): string {
  return tokens
    .map((token) => {
      if (token !== "M") {
        return token;
      }
      const first = nextOnset?.[0];
      const isLabial = first === "p" || first === "b" || first === "m" || first === "f";
      return isLabial ? "m" : "n";
    })
    .join("");
}

function nextOnsetOf(units: Unit[], index: number): string | undefined {
  for (let i = index + 1; i < units.length; i += 1) {
    const unit = units[i];
    if (unit.kind === "C") return unit.cluster;
    if (unit.kind === "V") return undefined; // a vowel follows, no consonant onset
  }
  return undefined;
}

function assemble(units: Unit[]): string {
  let out = "";
  units.forEach((unit, index) => {
    if (unit.kind === "C") {
      out += unit.cluster + unit.vowel + resolveCoda(unit.coda, nextOnsetOf(units, index));
    } else if (unit.kind === "V") {
      out += unit.out + resolveCoda(unit.coda, nextOnsetOf(units, index));
    } else {
      out += unit.out;
    }
  });
  return out;
}

function transliterateWord(word: string): string {
  const units = parseUnits(word);
  applySchwaDeletion(units);
  const raw = assemble(units);
  // Common conjunct fix-ups for natural Hindi pronunciation.
  return raw.replace(/jny/g, "gy");
}

function isDevanagari(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= DEV_START && code <= DEV_END;
}

function capitalizeSentences(text: string): string {
  let result = "";
  let capitalizeNext = true;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (capitalizeNext && /[a-z]/i.test(ch)) {
      result += ch.toUpperCase();
      capitalizeNext = false;
    } else {
      result += ch;
    }
    // Only start a new sentence on terminal punctuation followed by whitespace
    // or end-of-text — avoids capitalizing after dots inside "Node.js".
    if (/[.!?]/.test(ch) && (i + 1 >= text.length || /\s/.test(text[i + 1]))) {
      capitalizeNext = true;
    }
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace known technical terms (Devanagari) with their canonical Latin form. */
function applyTechnicalTerms(text: string, dictionary: Record<string, string>): string {
  const keys = Object.keys(dictionary).sort((a, b) => b.length - a.length);
  let result = text;
  for (const key of keys) {
    // Bounded by non-Devanagari (or string edges) so we never match inside a word.
    const pattern = new RegExp(
      `(^|[^\\u0900-\\u097F])${escapeRegExp(key)}(?![\\u0900-\\u097F])`,
      "g",
    );
    result = result.replace(pattern, (_match, prefix: string) => `${prefix}${dictionary[key]}`);
  }
  return result;
}

/**
 * Transliterate a string of (possibly mixed) Devanagari + Latin text into
 * Latin-script Hinglish. Non-Devanagari characters are preserved exactly.
 */
export function transliterateHindi(
  text: string,
  options: TransliterateOptions = {},
): string {
  if (!text) {
    return "";
  }

  const dictionary = { ...TECHNICAL_TERMS, ...(options.technicalTerms ?? {}) };
  // Normalize dandas to sentence stops before term replacement / tokenization.
  let working = text.replace(/[\u0964\u0965]/g, ".");
  working = applyTechnicalTerms(working, dictionary);

  let out = "";
  let buffer = "";
  const flush = (): void => {
    if (buffer) {
      out += transliterateWord(buffer);
      buffer = "";
    }
  };

  for (const ch of working) {
    if (isDevanagari(ch)) {
      buffer += ch;
    } else {
      flush();
      out += ch;
    }
  }
  flush();

  const collapsed = out.replace(/[ \t]{2,}/g, " ");
  return options.capitalizeSentences === false
    ? collapsed
    : capitalizeSentences(collapsed);
}
