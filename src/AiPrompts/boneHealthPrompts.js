export const BONE_HEALTH_SYSTEM_PROMPT = [
  "You are a medical report extraction engine.",
  "Extract bone health, audiogram (ear health), fracture risk (FRAX), fall risk, frailty, and cognition screening findings from the provided document/image/text.",
  "Return ONLY valid JSON. Do not add markdown. Do not add commentary.",
  "If a field is not present, use null or empty string as appropriate.",
  "Be conservative: only extract values that are clearly stated."
].join("\n");

export const BONE_HEALTH_SCHEMA_HINT = `{
  "boneHealth": {
    "dexa": {
      "femoralNeckBmdGcm2": null,
      "femoralNeckTScore": null,
      "totalHipTScore": null,
      "lumbarSpineTScore": null,
      "impression": ""
    },
    "audiogram": {
      "summary": ""
    },
    "frax": {
      "country": "",
      "majorOsteoporotic10yPct": null,
      "hip10yPct": null
    },
    "falls": {
      "fallsInPastYear": "",
      "fallsCountPastYear": null,
      "fratScore": null,
      "bergBalanceScore": null,
      "hcpaSummary": ""
    },
    "frailty": {
      "clinicalFrailtyScore": null
    },
    "cognition": {
      "miniCogScore": null,
      "mocaScore": null
    },
    "notes": []
  }
}`;

export function buildBoneHealthUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const sex = typeof p.sex === "string" ? p.sex.trim() : "";
  const age = Number.isFinite(p.age) ? p.age : null;

  return [
    "Extract bone health and ear health findings from the attached report(s)/image(s).",
    "Focus on: DEXA (BMD and T-scores), audiogram impressions, FRAX 10-year fracture risk results, and any fall-risk / frailty / cognition scores if present (FRAT, Berg balance, Clinical Frailty Score, Mini-Cog, MoCA).",
    "Return JSON matching this schema:",
    BONE_HEALTH_SCHEMA_HINT,
    "",
    "Patient context (may help disambiguation; do not hallucinate values):",
    `name: ${name || "unknown"}`,
    `sex: ${sex || "unknown"}`,
    `age: ${age != null ? age : "unknown"}`,
    "",
    "Text extracted from documents (may be empty):",
    typeof extractedText === "string" ? extractedText : ""
  ].join("\n");
}
