/**
 * Devanagari spellings of common technical terms mapped to their canonical Latin
 * form. Applied as whole-word replacements before phonetic transliteration so
 * product/library names keep their conventional spelling and casing (e.g.
 * `डॉकर` -> `Docker`, not `dokar`).
 *
 * Multi-word phrases are matched first (longest key wins), so `स्प्रिंग बूट`
 * becomes `Spring Boot` rather than `Spring` + transliterated `बूट`.
 */
export const TECHNICAL_TERMS: Record<string, string> = {
  // Spring / Spring Boot
  "स्प्रिंग बूट": "Spring Boot",
  "स्प्रिंगबूट": "Spring Boot",
  "स्प्रिंग": "Spring",
  // React
  "रिएक्ट": "React",
  "रीएक्ट": "React",
  "रियेक्ट": "React",
  // Node.js
  "नोड जेएस": "Node.js",
  "नोड.जेएस": "Node.js",
  "नोडजेएस": "Node.js",
  "नोड जे एस": "Node.js",
  "नोड": "Node",
  // Redis
  "रेडिस": "Redis",
  "रेडीस": "Redis",
  "रैडिस": "Redis",
  // Docker
  "डॉकर": "Docker",
  "डाकर": "Docker",
  "डोकर": "Docker",
  // Kafka
  "काफ्का": "Kafka",
  "काफका": "Kafka",
  "कफ्का": "Kafka",
  "काफ़्का": "Kafka",
  // Other frequently-seen technical terms (kept canonical, not translated)
  "जावास्क्रिप्ट": "JavaScript",
  "जावा स्क्रिप्ट": "JavaScript",
  "टाइपस्क्रिप्ट": "TypeScript",
  "एचटीएमएल": "HTML",
  "सीएसएस": "CSS",
  "एपीआई": "API",
  "डेटाबेस": "database",
  "जावा": "Java",
  "पायथन": "Python",
};
