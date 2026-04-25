/**
 * Rule-based natural language query parser.
 * Converts plain English queries into filter objects.
 *
 * Returns a filters object on success, or null if the query cannot be interpreted.
 */

// Country name → ISO 2-letter code map (African countries focus + common extras)
const COUNTRY_NAME_TO_ID = {
  nigeria: "NG", ghana: "GH", kenya: "KE", uganda: "UG", tanzania: "TZ",
  ethiopia: "ET", cameroon: "CM", senegal: "SN", mali: "ML", niger: "NE",
  "burkina faso": "BF", benin: "BJ", togo: "TG", "côte d'ivoire": "CI",
  "ivory coast": "CI", guinea: "GN", "guinea-bissau": "GW",
  "sierra leone": "SL", liberia: "LR", gambia: "GM", "cape verde": "CV",
  angola: "AO", mozambique: "MZ", zambia: "ZM", zimbabwe: "ZW",
  malawi: "MW", namibia: "NA", botswana: "BW", lesotho: "LS",
  swaziland: "SZ", eswatini: "SZ", madagascar: "MG", mauritius: "MU",
  comoros: "KM", rwanda: "RW", burundi: "BI", "democratic republic of congo": "CD",
  "dr congo": "CD", congo: "CG", "republic of congo": "CG",
  gabon: "GA", "equatorial guinea": "GQ", "central african republic": "CF",
  chad: "TD", sudan: "SD", "south sudan": "SS", somalia: "SO",
  djibouti: "DJ", eritrea: "ER", egypt: "EG", libya: "LY", tunisia: "TN",
  algeria: "DZ", morocco: "MA", mauritania: "MR",
  "south africa": "ZA", zimbabwe: "ZW",
  // Common non-African
  usa: "US", "united states": "US", uk: "GB", "united kingdom": "GB",
  france: "FR", germany: "DE", italy: "IT", spain: "ES", brazil: "BR",
  india: "IN", china: "CN", japan: "JP", canada: "CA", australia: "AU",
};

// ISO code set for direct 2-letter lookups
const VALID_ISO_CODES = new Set(Object.values(COUNTRY_NAME_TO_ID));

/**
 * Attempts to resolve a country string to an ISO code.
 * Handles both "NG" style codes and full names.
 */
function resolveCountry(str) {
  if (!str) return null;
  const upper = str.trim().toUpperCase();
  if (VALID_ISO_CODES.has(upper)) return upper;
  const lower = str.trim().toLowerCase();
  return COUNTRY_NAME_TO_ID[lower] ?? null;
}

/**
 * Extracts a country reference from the query string.
 * Looks for patterns like "from nigeria", "in kenya", "from NG".
 */
function extractCountry(query) {
  // "from <country>" or "in <country>"
  const fromMatch = query.match(/\b(?:from|in)\s+([a-z\s'-]+?)(?:\s+(?:and|or|above|below|over|under|aged?|who|that|,|$))/i);
  if (fromMatch) {
    const code = resolveCountry(fromMatch[1].trim());
    if (code) return code;
  }

  // Try greedy "from/in <rest of phrase>"
  const greedyMatch = query.match(/\b(?:from|in)\s+([a-z\s'-]+)$/i);
  if (greedyMatch) {
    const code = resolveCountry(greedyMatch[1].trim());
    if (code) return code;
  }

  // Standalone country name or ISO code anywhere in query
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_ID)) {
    const escaped = name.replace(/[-']/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(query)) return code;
  }

  // Standalone 2-letter ISO code (uppercase in original query)
  const isoMatch = query.match(/\b([A-Z]{2})\b/);
  if (isoMatch && VALID_ISO_CODES.has(isoMatch[1])) return isoMatch[1];

  return null;
}

/**
 * Extracts gender from query.
 */
function extractGender(query) {
  if (/\b(male and female|female and male|both genders?|all genders?)\b/i.test(query))
    return null; // no gender filter

  if (/\b(females?|women|woman|girls?)\b/i.test(query)) return "female";
  if (/\b(males?|men|man|boys?|guys?)\b/i.test(query)) return "male";
  return null;
}

/**
 * Extracts age group from query.
 */
function extractAgeGroup(query) {
  if (/\bseniors?\b/i.test(query)) return "senior";
  if (/\badults?\b/i.test(query)) return "adult";
  if (/\bteenagers?\b|teens?\b/i.test(query)) return "teenager";
  if (/\bchildren\b|\bchild\b|\bkids?\b/i.test(query)) return "child";
  return null;
}

/**
 * Extracts min/max age constraints from query.
 * Handles patterns like "above 30", "below 25", "over 18", "under 40",
 * "aged 20", "between 20 and 30", and "young" keyword.
 */
function extractAgeRange(query) {
  let min_age;
  let max_age;

  // "between X and Y"
  const betweenMatch = query.match(/\bbetween\s+(\d+)\s+and\s+(\d+)\b/i);
  if (betweenMatch) {
    min_age = parseInt(betweenMatch[1], 10);
    max_age = parseInt(betweenMatch[2], 10);
    return { min_age, max_age };
  }

  // "above/over X"
  const aboveMatch = query.match(/\b(?:above|over|older than|greater than)\s+(\d+)\b/i);
  if (aboveMatch) min_age = parseInt(aboveMatch[1], 10);

  // "below/under X"
  const belowMatch = query.match(/\b(?:below|under|younger than|less than)\s+(\d+)\b/i);
  if (belowMatch) max_age = parseInt(belowMatch[1], 10);

  // "aged X" or "age X"
  const agedMatch = query.match(/\baged?\s+(\d+)\b/i);
  if (agedMatch && min_age === undefined && max_age === undefined) {
    min_age = parseInt(agedMatch[1], 10);
    max_age = parseInt(agedMatch[1], 10);
  }

  // "young" keyword → 16–24
  if (/\byoung\b/i.test(query) && min_age === undefined && max_age === undefined) {
    min_age = 16;
    max_age = 24;
  }

  return { min_age, max_age };
}

/**
 * Main parser entry point.
 * Returns a filters object, or null if nothing meaningful was parsed.
 */
export function parseNaturalLanguageQuery(query) {
  if (!query || query.trim() === "") return null;

  const q = query.trim().toLowerCase();

  const gender = extractGender(q);
  const age_group = extractAgeGroup(q);
  const country_id = extractCountry(q);
  const { min_age, max_age } = extractAgeRange(q);

  const filters = {};

  if (gender) filters.gender = gender;
  if (age_group) filters.age_group = age_group;
  if (country_id) filters.country_id = country_id;
  if (min_age !== undefined) filters.min_age = min_age;
  if (max_age !== undefined) filters.max_age = max_age;

  // Must have extracted at least one meaningful filter
  if (Object.keys(filters).length === 0) return null;

  return filters;
}
