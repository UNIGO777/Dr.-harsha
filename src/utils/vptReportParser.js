/**
 * Deterministic parser for VPT (Vibration Perception Threshold) PNS reports.
 *
 * These machines emit a fixed layout, so parsing beats asking an LLM: the text
 * layer of a "VPT PNS Analysis" PDF lists each site as an OPTION LIST that is
 * truncated at the selected value, followed by the two readings:
 *
 *     Toe : Normal : Abnormal : Very Abnormal      <- selected = "Very Abnormal"
 *     51.24 V
 *     102.48 µm
 *     Heel : Normal : Abnormal                     <- selected = "Abnormal"
 *     19.83 V
 *     39.66 µm
 *
 * The first six site blocks are the RIGHT foot, the next six are the LEFT foot
 * (matching the printed interpretation table, where the foot drawn on the left
 * of the page is the right foot — plantar view).
 *
 * If anything about the document does not match this shape the parser returns
 * null, and the caller keeps whatever the AI produced.
 */

/** Canonical statuses used by these devices, weakest → strongest impairment. */
export const VPT_STATUS_VALUES = ["Normal", "Abnormal", "Very Abnormal"];

// Vocabulary some models emit (and older saved reports contain) mapped onto the
// canonical set, so nothing renders as an unknown badge.
const STATUS_ALIASES = {
  normal: "Normal",
  abnormal: "Abnormal",
  "very abnormal": "Very Abnormal",
  veryabnormal: "Very Abnormal",
  "very-abnormal": "Very Abnormal",
  reduced: "Abnormal",
  impaired: "Abnormal",
  diminished: "Abnormal",
  absent: "Very Abnormal",
  "severely abnormal": "Very Abnormal"
};

export function normalizeVptStatus(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (!cleaned) return null;
  return STATUS_ALIASES[cleaned] || null;
}

const SITE_ORDER = ["toe", "firstMetatarsalHead", "thirdMetatarsalHead", "fifthMetatarsalHead", "instep", "heel"];

const SITE_LABEL_TO_KEY = {
  toe: "toe",
  "first metatarsal head": "firstMetatarsalHead",
  "1st metatarsal head": "firstMetatarsalHead",
  "third metatarsal head": "thirdMetatarsalHead",
  "3rd metatarsal head": "thirdMetatarsalHead",
  "fifth metatarsal head": "fifthMetatarsalHead",
  "5th metatarsal head": "fifthMetatarsalHead",
  instep: "instep",
  heel: "heel"
};

// Site header + its option list. The list ends at the selected value, so
// "Toe : Normal: Abnormal: Very Abnormal" means Very Abnormal.
// Bounded to status words so a two-column table line yields one match per foot.
const SITE_LINE_RE =
  /(Toe|First Metatarsal Head|1st Metatarsal Head|Third Metatarsal Head|3rd Metatarsal Head|Fifth Metatarsal Head|5th Metatarsal Head|Instep|Heel)\s*:\s*((?:\s*(?:Very\s+Abnormal|Abnormal|Normal)\s*:?)+)/gi;

// Readings. µ may be MICRO SIGN (U+00B5) or GREEK SMALL LETTER MU (U+03BC).
const VOLTAGE_RE = /(\d+(?:\.\d+)?)\s*V(?![a-z])/gi;
const DISPLACEMENT_RE = /(\d+(?:\.\d+)?)\s*[µμu]m\b/gi;

function collect(regex, text, mapper) {
  const out = [];
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) out.push(mapper(match));
  return out;
}

/** The selected status is the LAST recognised option on the site line. */
function statusFromOptionList(optionsText) {
  const candidates = String(optionsText || "")
    .split(":")
    .map((part) => normalizeVptStatus(part))
    .filter(Boolean);
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

function buildEmptyFoot() {
  const foot = {};
  for (const key of SITE_ORDER) foot[key] = { voltageV: null, displacementUm: null, status: null };
  return foot;
}

/**
 * Parse a VPT report's extracted text.
 * Returns { rightFoot, leftFoot, clinicalNote, confidence } or null when the
 * document does not match the expected 12-site layout.
 */
export function parseVptReportText(rawText) {
  const text = typeof rawText === "string" ? rawText : "";
  if (!text.trim()) return null;

  const sites = collect(SITE_LINE_RE, text, (m) => ({
    key: SITE_LABEL_TO_KEY[m[1].trim().toLowerCase()],
    status: statusFromOptionList(m[2])
  })).filter((site) => site.key);

  // Six sites per foot, both feet — anything else is a layout we do not
  // recognise, and we refuse rather than emit half-right data.
  if (sites.length !== 12) return null;

  // Two layouts occur in the wild, told apart by whether a site repeats
  // immediately:
  //   paired      — the printed two-column table: R.Toe, L.Toe, R.1st, L.1st …
  //   sequential  — a linearised export: all six right sites, then all six left
  const isPaired = sites[0].key === sites[1].key;
  const expected = isPaired
    ? SITE_ORDER.flatMap((key) => [key, key])
    : [...SITE_ORDER, ...SITE_ORDER];
  if (!sites.every((site, index) => site.key === expected[index])) return null;

  const rightFoot = buildEmptyFoot();
  const leftFoot = buildEmptyFoot();

  sites.forEach((site, index) => {
    const foot = isPaired ? (index % 2 === 0 ? rightFoot : leftFoot) : index < 6 ? rightFoot : leftFoot;
    foot[site.key].status = site.status;
  });

  // Readings only line up with sites in the sequential layout. In the printed
  // table the numbers are diagram callouts laid out across both feet, so we
  // leave the values to the model rather than guess the pairing.
  if (!isPaired) {
    const voltages = collect(VOLTAGE_RE, text, (m) => Number(m[1]));
    const displacements = collect(DISPLACEMENT_RE, text, (m) => Number(m[1]));
    if (voltages.length === 12 && displacements.length === 12) {
      sites.forEach((site, index) => {
        const foot = index < 6 ? rightFoot : leftFoot;
        if (Number.isFinite(voltages[index])) foot[site.key].voltageV = voltages[index];
        if (Number.isFinite(displacements[index])) foot[site.key].displacementUm = displacements[index];
      });
    }
  }

  const clinicalNoteMatch = text.match(/This may be clinically co[- ]?related/i);

  return {
    rightFoot,
    leftFoot,
    clinicalNote: clinicalNoteMatch ? clinicalNoteMatch[0] : "",
    layout: isPaired ? "table" : "sequential",
    confidence: sites.every((s) => s.status) ? "high" : "partial"
  };
}

/** Coerce a value the AI produced into a finite number, or null. */
function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeFoot(foot) {
  const source = foot && typeof foot === "object" ? foot : {};
  const out = {};
  for (const key of SITE_ORDER) {
    const site = source[key] && typeof source[key] === "object" ? source[key] : {};
    out[key] = {
      voltageV: toNumberOrNull(site.voltageV),
      displacementUm: toNumberOrNull(site.displacementUm),
      status: normalizeVptStatus(site.status)
    };
  }
  return out;
}

/**
 * Merge AI output with the deterministic parse.
 * The parser wins on the 12 site rows (it reads the document literally);
 * the AI keeps everything it is actually good at — interpretation, advice,
 * flags, NCS. Per-field, a parsed value only overrides when it is present.
 */
export function applyVptParseToAiPayload(payload, extractedText) {
  const result = payload && typeof payload === "object" ? payload : {};
  const pns = result.pns && typeof result.pns === "object" ? result.pns : (result.pns = {});
  const vibration =
    pns.vibrationSensation && typeof pns.vibrationSensation === "object"
      ? pns.vibrationSensation
      : (pns.vibrationSensation = {});

  // Always normalise the AI's own vocabulary first ("Reduced" → "Abnormal", …)
  vibration.rightFoot = normalizeFoot(vibration.rightFoot);
  vibration.leftFoot = normalizeFoot(vibration.leftFoot);

  const parsed = parseVptReportText(extractedText);
  if (!parsed) {
    vibration.extractionSource = "ai";
    return result;
  }

  for (const footKey of ["rightFoot", "leftFoot"]) {
    for (const siteKey of SITE_ORDER) {
      const parsedSite = parsed[footKey][siteKey];
      const target = vibration[footKey][siteKey];
      if (parsedSite.voltageV !== null) target.voltageV = parsedSite.voltageV;
      if (parsedSite.displacementUm !== null) target.displacementUm = parsedSite.displacementUm;
      if (parsedSite.status !== null) target.status = parsedSite.status;
    }
  }

  if (parsed.clinicalNote && !String(vibration.clinicalNote || "").trim()) {
    vibration.clinicalNote = parsed.clinicalNote;
  }
  vibration.extractionSource = "parser";
  vibration.extractionConfidence = parsed.confidence;

  return result;
}

export const VPT_SITE_ORDER = SITE_ORDER;
