export const ANS_ASSESSMENT_SYSTEM_PROMPT = `You are a clinician preparing an Autonomic Nervous System (ANS) lifestyle counselling note for OPD.
Return ONLY valid JSON.
Do not return markdown.
Do not over-diagnose disease.
Avoid alarmist language.
Keep it clinically usable and simple.`;

export const ANS_ASSESSMENT_SCHEMA_HINT = `{
  "orthostatic": {
    "measurements": {
      "lying": { "sbp": null, "dbp": null, "hr": null },
      "stand1": { "sbp": null, "dbp": null, "hr": null },
      "stand3": { "sbp": null, "dbp": null, "hr": null }
    },
    "interpretation": "",
    "flags": [],
    "nurseInstructions": ""
  },
  "hrv": {
    "metrics": {
      "sdnnMs": null,
      "rmssdMs": null,
      "sdsdMs": null,
      "nn50Count": null,
      "pnn50Percent": null,
      "triangularIndex": null,
      "modeRrMs": null,
      "meanHrBpm": null,
      "meanRrMs": null,
      "lf": null,
      "hf": null,
      "lfHfRatio": null,
      "totalPower": null
    },
    "extracted": {
      "heartRateMarkers": [],
      "timeDomainHrv": [],
      "frequencyDomainHrv": [],
      "awakeVsSleepComparison": []
    },
    "interpretation": {
      "overallAutonomicBalance": "",
      "parasympatheticVagalTone": "",
      "sympatheticOverdrive": "",
      "circadianRhythmNightRecovery": "",
      "stressRecoveryCapacity": "",
      "zone": "",
      "advice": {
        "sleep": [],
        "exercise": [],
        "breathingStress": [],
        "workRoutine": [],
        "nutritionHydration": []
      },
      "patientFriendlySummary": "",
      "doctorTakeaway": ""
    }
  }
}`;

export function buildAnsAssessmentUserPrompt({ patient, orthostatic, computed, extractedText }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const o = orthostatic && typeof orthostatic === "object" ? orthostatic : {};
  const c = computed && typeof computed === "object" ? computed : {};
  const t = typeof extractedText === "string" ? extractedText : "";

  return `TASK A: Orthostatic vitals (manual entry + extract from report)
1) If manual values are present, use them.
2) Also try to extract orthostatic vitals from the report text (if present) and fill orthostatic.measurements with numbers (mmHg, bpm). If not found, keep nulls.
Use the best available values to produce a brief interpretation:
- SBP drop ≥20 mmHg OR DBP drop ≥10 mmHg (especially persistent at 1 and 3 minutes) suggests orthostatic hypotension / autonomic insufficiency.
- Excess HR rise suggests deconditioning / stress / dehydration (do not over-diagnose).
Return: orthostatic.measurements, orthostatic.interpretation, orthostatic.flags (array), orthostatic.nurseInstructions (single string).

Nurse instructions (must include): Lie flat at least 5 minutes before first reading. Take readings within 1 and 3 minutes of standing. Persistent drop (SBP ≥20 or DBP ≥10) = orthostatic hypotension.

TASK B: HRV / ANS interpretation from uploaded report text
1) Extract ONLY ANS-relevant data under headings:
- Heart rate–based markers
- Time-domain HRV
- Frequency-domain (spectral) HRV
- Awake vs sleep comparison
If present, explicitly capture common HRV metrics and values (with units), for example:
- SDNN, RMSSD, SDSD, NN50, pNN50, HRV Triangular Index, Mode RR, Mean HR/Mean RR
- LF, HF, VLF, LF/HF ratio, Total power, normalized units
Write each extracted item as a short single-line string like: "SDNN: 28.42 ms (low)" or "RMSSD: 9.73 ms".
Also populate hrv.metrics with numeric values when you can confidently read them from the report text.
If a value is not present or ambiguous, keep it null. Do not guess.
Ignore arrhythmias unless autonomic significance.
2) Interpret from lifestyle & prevention perspective (OPD counselling):
- overall balance, vagal tone, sympathetic overdrive, circadian rhythm/night recovery, stress capacity
3) Stratify zone: Green (resilient), Yellow (early imbalance), Orange (poor adaptability), Red (high cardiometabolic risk)
4) Provide practical non-pharmacological advice only:
- sleep, exercise, breathing/stress, work routine, nutrition/hydration
5) End with:
- one-paragraph patient-friendly summary
- one-line doctor takeaway

Patient:
${JSON.stringify(p)}

Orthostatic inputs:
${JSON.stringify(o)}

Computed orthostatic:
${JSON.stringify(c)}

Report text (may be partial):
${t}

Return ONLY valid JSON in this exact shape:
${ANS_ASSESSMENT_SCHEMA_HINT}`;
}
