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

// ── Bone Health Findings Generation (from structured form data) ───────────────

export const BONE_HEALTH_FINDINGS_SYSTEM_PROMPT = [
  "You are a clinical musculoskeletal report writing assistant specialising in preventive and lifestyle medicine.",
  "Given structured assessment data from a bone & joint health evaluation, write professional clinical findings and an overall impression.",
  "Return ONLY valid JSON. No markdown. No commentary.",
  "Use precise medical language appropriate for a preventive health report.",
  "Each findings field should be 1–3 concise, clinically meaningful sentences.",
  "If data for a section is absent or all normal, state that clearly and briefly.",
  "Notes should be actionable clinical recommendations, 1 sentence each."
].join("\n");

export const BONE_HEALTH_FINDINGS_SCHEMA = `{
  "hipLeft": "string — left hip joint clinical findings",
  "hipRight": "string — right hip joint clinical findings",
  "spine": "string — spine findings (note cervical/thoracic/lumbar levels if relevant)",
  "otherJoints": "string — other joint findings (shoulders, ankles, wrists, etc.)",
  "overallImpression": "string — comprehensive musculoskeletal summary covering all risk areas and priority concerns",
  "notes": ["string — one actionable clinical note or recommendation per item"]
}`;

export function buildBoneHealthFindingsUserPrompt({ patient, assessment }) {
  const lines = [
    "Generate clinical findings and overall impression from the structured bone & joint assessment below.",
    "Return JSON matching this schema:",
    BONE_HEALTH_FINDINGS_SCHEMA,
    "",
    "=== PATIENT ==="
  ];

  const p = patient && typeof patient === "object" ? patient : {};
  if (p.name) lines.push(`Name: ${p.name}`);
  if (p.sex) lines.push(`Sex: ${p.sex}`);
  if (p.age) lines.push(`Age: ${p.age}`);
  if (p.bmi != null) lines.push(`BMI: ${parseFloat(p.bmi).toFixed(1)}`);

  const a = assessment && typeof assessment === "object" ? assessment : {};

  // ── Risk Scores ──────────────────────────────────────────────────────────
  lines.push("", "=== RISK SCORES ===");

  if (a.backPain) {
    lines.push(`Back Pain Score: ${a.backPain.score}/10 — ${a.backPain.risk}`);
    if (Array.isArray(a.backPain.positiveFactors) && a.backPain.positiveFactors.length > 0) {
      lines.push(`  Positive factors: ${a.backPain.positiveFactors.join(", ")}`);
    }
  }
  if (a.shoulderPain) {
    lines.push(`Shoulder Pain Score: ${a.shoulderPain.score}/12 — ${a.shoulderPain.risk}`);
    if (Array.isArray(a.shoulderPain.positiveFactors) && a.shoulderPain.positiveFactors.length > 0) {
      lines.push(`  Positive factors: ${a.shoulderPain.positiveFactors.join(", ")}`);
    }
  }
  if (a.kneePain) {
    lines.push(`Knee Pain Score: ${a.kneePain.score}/43 — ${a.kneePain.risk}`);
    if (Array.isArray(a.kneePain.positiveFactors) && a.kneePain.positiveFactors.length > 0) {
      lines.push(`  Positive factors: ${a.kneePain.positiveFactors.join(", ")}`);
    }
  }

  // ── Muscle Assessment ────────────────────────────────────────────────────
  if (a.muscles && typeof a.muscles === "object") {
    lines.push("", "=== MUSCLE ASSESSMENT ===");
    const m = a.muscles;
    if (m.mriFatInfiltration) lines.push(`MRI fat infiltration: ${m.mriFatInfiltration}`);
    if (m.sarcopenia) lines.push(`Sarcopenia: ${m.sarcopenia}${m.sarcopeniaType ? ` (${m.sarcopeniaType})` : ""}`);
    if (m.mass) lines.push(`Muscle mass: ${m.mass} ${m.massUnit || "kg"}`);
    if (m.gripLeft || m.gripRight) lines.push(`Grip strength: L ${m.gripLeft || "—"} kg / R ${m.gripRight || "—"} kg`);
    if (m.gaitSpeed) lines.push(`Gait speed: ${m.gaitSpeed} m/s`);
    if (m.impression) lines.push(`Impression: ${m.impression}`);
  }

  // ── Flexibility ──────────────────────────────────────────────────────────
  if (a.flexibility && typeof a.flexibility === "object") {
    lines.push("", "=== FLEXIBILITY ===");
    const f = a.flexibility;
    if (f.hamstringLeft) lines.push(`Hamstring L: ${f.hamstringLeft}°${f.hamstringLeftInterp ? ` — ${f.hamstringLeftInterp}` : ""}`);
    if (f.hamstringRight) lines.push(`Hamstring R: ${f.hamstringRight}°${f.hamstringRightInterp ? ` — ${f.hamstringRightInterp}` : ""}`);
    if (f.quadLeft) lines.push(`Quadriceps L: ${f.quadLeft}`);
    if (f.quadRight) lines.push(`Quadriceps R: ${f.quadRight}`);
  }

  // ── Knee OA ──────────────────────────────────────────────────────────────
  if (a.kneeOA && typeof a.kneeOA === "object") {
    lines.push("", "=== KNEE OA (KELLGREN–LAWRENCE) ===");
    const k = a.kneeOA;
    if (k.leftGrade != null) lines.push(`Left knee: KL Grade ${k.leftGrade}`);
    if (k.rightGrade != null) lines.push(`Right knee: KL Grade ${k.rightGrade}`);
    if (k.findings) lines.push(`Findings: ${k.findings}`);
  }

  // ── Foot Assessment ──────────────────────────────────────────────────────
  if (a.foot && typeof a.foot === "object") {
    lines.push("", "=== FOOT ASSESSMENT ===");
    const ft = a.foot;
    if (ft.hallux) lines.push(`Big toe deformity: ${ft.hallux}`);
    if (ft.description) lines.push(`Description: ${ft.description}`);
  }

  // ── Shoulder MRI ─────────────────────────────────────────────────────────
  if (typeof a.shoulderMri === "string" && a.shoulderMri.trim()) {
    lines.push("", "=== SHOULDER MRI ===");
    lines.push(`Summary: ${a.shoulderMri.trim()}`);
  }

  // ── Hip & Spine context (existing entries, for context/augmentation) ─────
  if (a.existingHipSpine && typeof a.existingHipSpine === "object") {
    lines.push("", "=== EXISTING HIP & SPINE NOTES (for context) ===");
    const h = a.existingHipSpine;
    if (h.hipLeft) lines.push(`Left hip (existing): ${h.hipLeft}`);
    if (h.hipRight) lines.push(`Right hip (existing): ${h.hipRight}`);
    if (h.spine) lines.push(`Spine (existing): ${h.spine}`);
    if (h.other) lines.push(`Other (existing): ${h.other}`);
  }

  return lines.join("\n");
}

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
