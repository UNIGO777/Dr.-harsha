export const PNS_ASSESSMENT_SYSTEM_PROMPT = `You are a clinician preparing a Peripheral Nervous System (PNS) assessment note for OPD.
Return ONLY valid JSON.
Do not return markdown.
Do not over-diagnose disease.
Avoid alarmist language.
Keep it clinically usable and simple.`;

export const PNS_ASSESSMENT_SCHEMA_HINT = `{
  "pns": {
    "vibrationSensation": {
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
1. voltageV        — the voltage reading (number, in Volts, e.g. 7.13)
2. displacementUm  — the displacement reading (number, in micrometres μm, e.g. 14.26)
3. status          — one of: "Normal", "Reduced", or "Absent" (from the interpretation table)

Sites for each foot: Toe · First Metatarsal Head · Third Metatarsal Head · Fifth Metatarsal Head · Instep · Heel

The report may show voltage and displacement as labelled callouts on a foot diagram AND a separate table listing Normal/Reduced/Absent. Extract both.
Also capture clinicalNote (e.g. "This may be clinically co-related").
If a value is missing or unclear, keep it null. Do not guess.

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
