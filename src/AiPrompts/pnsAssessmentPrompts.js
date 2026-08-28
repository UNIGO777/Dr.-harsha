export const PNS_ASSESSMENT_SYSTEM_PROMPT = `You are a clinician preparing a Peripheral Nervous System (PNS) assessment note for OPD.
Return ONLY valid JSON.
Do not return markdown.
Do not over-diagnose disease.
Avoid alarmist language.
Keep it clinically usable and simple.

TRANSCRIPTION DISCIPLINE: the vibration-sensation table is a transcription task,
not a judgement call. Copy each site's voltage, displacement and status exactly
as the report states them. Never derive a status from a number, never reuse one
status across a whole foot, and leave a field null rather than guessing.`;

export const PNS_ASSESSMENT_SCHEMA_HINT = `{
  "pns": {
    "vibrationSensation": {
      // every "status" below must be exactly "Normal" | "Abnormal" | "Very Abnormal" (or null)
      "rightFoot": {
        "toe":                { "voltageV": null, "displacementUm": null, "status": null },
        "firstMetatarsalHead": { "voltageV": null, "displacementUm": null, "status": null },
        "thirdMetatarsalHead": { "voltageV": null, "displacementUm": null, "status": null },
        "fifthMetatarsalHead": { "voltageV": null, "displacementUm": null, "status": null },
        "instep":             { "voltageV": null, "displacementUm": null, "status": null },
        "heel":               { "voltageV": null, "displacementUm": null, "status": null }
      },
      "leftFoot": {
        "toe":                { "voltageV": null, "displacementUm": null, "status": null },
        "firstMetatarsalHead": { "voltageV": null, "displacementUm": null, "status": null },
        "thirdMetatarsalHead": { "voltageV": null, "displacementUm": null, "status": null },
        "fifthMetatarsalHead": { "voltageV": null, "displacementUm": null, "status": null },
        "instep":             { "voltageV": null, "displacementUm": null, "status": null },
        "heel":               { "voltageV": null, "displacementUm": null, "status": null }
      },
      "clinicalNote": ""
    },
    "nerveConduction": {
      "status": null,
      "extracted": "",
      "notes": ""
    },
    "interpretation": "",
    "flags": [],
    "advice": "",
    "patientFriendlySummary": "",
    "doctorTakeaway": ""
  }
}`;

export function buildPnsAssessmentUserPrompt({ patient, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const t = typeof extractedText === "string" ? extractedText : "";

  return `TASK: Peripheral Nervous System (PNS) assessment — extract TWO sections from the report.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION A: VIBRATION SENSATION TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For EACH site on Right Foot and Left Foot extract:
1. voltageV        — the voltage reading (number, in Volts, e.g. 29.43)
2. displacementUm  — the displacement reading (number, in micrometres μm, e.g. 58.86)
3. status          — EXACTLY one of: "Normal", "Abnormal", "Very Abnormal"

Sites for each foot: Toe · First Metatarsal Head · Third Metatarsal Head · Fifth Metatarsal Head · Instep · Heel
That is 12 rows in total (6 per foot).

STATUS RULES — read carefully, this is the most commonly mis-read part:
• The ONLY permitted values are "Normal", "Abnormal", "Very Abnormal".
  Never output "Reduced", "Absent", "Mild", "Severe" or any other word.
• Every one of the 12 sites has its OWN status. Do NOT apply one status to a
  whole foot. It is normal for sites on the same foot to differ — e.g. the Heel
  can be "Abnormal" while every other site on that foot is "Very Abnormal".
• NEVER infer status from the voltage number. Read the status the report states.
• In the extracted text layer of these machines the status appears as an option
  list that is TRUNCATED AT THE SELECTED VALUE — the LAST option on the line is
  the answer:
      "Toe : Normal : Abnormal : Very Abnormal"   → status is "Very Abnormal"
      "Heel : Normal : Abnormal"                  → status is "Abnormal"
      "Instep : Normal"                           → status is "Normal"
  Do not treat these lines as "all options are possible" — take the last one.

FOOT / ORDER RULES:
• The site blocks appear in a fixed order: the FIRST six blocks are the RIGHT
  foot, the NEXT six are the LEFT foot, each in the order
  Toe → First → Third → Fifth Metatarsal Head → Instep → Heel.
• On the printed foot diagram the foot drawn on the LEFT of the page is the
  RIGHT foot (plantar view). If the diagram and the interpretation table seem to
  disagree, the interpretation table wins.
• Each site's voltage and displacement belong to that same site — keep the
  pairing intact when you read them off the diagram callouts.

Also capture clinicalNote (e.g. "This may be clinically co-related").
If a value is genuinely missing or unreadable, keep it null. Do not guess, and
do not copy a neighbouring site's value to fill a gap.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION B: NERVE CONDUCTION STUDY (NCS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If a Nerve Conduction Study is present in the report, extract:
1. status    — "Normal" if ALL nerves tested are within normal limits, "Abnormal" if ANY nerve is outside normal limits. null if NCS is not present.
2. extracted — a structured text summary of all extracted nerve readings, e.g.:
   "Median Motor: Latency 3.8ms, Amplitude 8.2mV, Velocity 52m/s — Normal\nUlnar Motor: Latency 4.1ms, Amplitude 6.5mV, Velocity 48m/s — Normal\n..."
3. notes     — any clinical notes or comments from the NCS report.

If NCS is not present in the document, set status to null and extracted to "".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALSO GENERATE:
- interpretation: brief overall clinical interpretation (2–3 sentences, lifestyle/prevention, not alarmist)
- flags: array of short alert strings ONLY for abnormal findings (empty array [] if all normal)
- advice: practical non-pharmacological recommendations
- patientFriendlySummary: one paragraph for the patient
- doctorTakeaway: one-line clinical note for the doctor

Patient:
${JSON.stringify(p)}

Report text (may be partial):
${t}

Return ONLY valid JSON in this exact shape:
${PNS_ASSESSMENT_SCHEMA_HINT}`;
}
