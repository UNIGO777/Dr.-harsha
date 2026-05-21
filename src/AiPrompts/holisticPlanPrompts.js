// ─── Holistic Prevention & Lifestyle Plan Prompts ────────────────────────────
// Split into 5 focused steps to keep each AI call small and fast.
//
// Step 1 — Risk Assessment + Foundation  (~input: full patient data, ~output: 1500 tok)
// Step 2 — Short-Term Plan 0-3 months   (~input: summary + risk tags, ~output: 2000 tok)
// Step 3 — Medium & Long-Term Plans     (~input: summary + risk tags, ~output: 1500 tok)
// Step 4 — Treatment + Tests + Review   (~input: summary + risk tags, ~output: 1500 tok)
// Step 5 — Lifestyle + Handouts + Table (~input: summary + risk tags, ~output: 1500 tok)

const BASE_RULES = `RULES:
- Return ONLY valid JSON. No markdown, no code fences, no text outside the JSON.
- For medications: NEVER prescribe directly — use "Consider discussion regarding…" or "May benefit from…".
- Quantify every goal where possible (e.g. lose 3-4 kg, walk 8000 steps/day, sleep 7-8 hrs).
- Keep tone professional but understandable. Do not overpromise.
- Focus on ROOT CAUSE correction and HIGH IMPACT interventions.
- Mention reversible vs non-reversible risks clearly.
- Mention disease progression risks if ignored AND expected benefits if compliant.
- Clearly separate: lifestyle interventions, medications, supplements, investigations, referrals, procedures/surgeries.
- Mention when specialist consultation is required urgently.
- Mention red flag findings separately.
- Give quantified goals wherever possible.`;

// ─── Dr. Harsha programme recommendation rules ─────────────────────────────
const PROGRAMME_RULES = `DR. HARSHA PROGRAMME RECOMMENDATIONS (include in relevant plan sections):
- If Diabetic → recommend "Dr. Harsha's Diet for Diabetes programme"
- If Pre-diabetic → recommend "Dr. Harsha's Pre-Diabetes Diet programme"
- If Hypertensive → recommend "Dr. Harsha's Diet for High BP programme"
- If overweight/obese → recommend "Dr. Harsha's Weight Loss Diet programme"
- If Dyslipidaemia → recommend "Dr. Harsha's Diet for High Cholesterol programme"
- If Heart Attack history → recommend "Dr. Harsha's Diet for Heart Attack programme"
- If Stroke history → recommend "Dr. Harsha's Diet for Stroke programme"
- For exercise section always mention: "Follow Dr. Harsha's Exercise Health App (to be launched soon)"
- Do NOT include dietician as a cross-specialty referral.`;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function safeStr(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

function formatSection(label, data) {
  if (!data || typeof data !== "object") return "";
  const json = JSON.stringify(data);
  if (json === "{}" || json === "null" || json === "[]") return "";
  return `\n### ${label}\n${json}`;
}

function buildPatientHeader(patient) {
  if (!patient || typeof patient !== "object") return "Patient data not provided.";
  const parts = [];
  if (safeStr(patient.name)) parts.push(`Name: ${patient.name}`);
  if (safeStr(patient.sex)) parts.push(`Sex: ${patient.sex}`);
  if (patient.age != null) parts.push(`Age: ${patient.age} yrs`);
  if (patient.heightCm != null) parts.push(`Height: ${patient.heightCm} cm`);
  if (patient.weightKg != null) parts.push(`Weight: ${patient.weightKg} kg`);
  if (patient.bmi != null || patient.bmiKg_m2 != null) parts.push(`BMI: ${patient.bmi ?? patient.bmiKg_m2} kg/m²`);
  if (safeStr(patient.occupation)) parts.push(`Occupation: ${patient.occupation}`);
  if (safeStr(patient.dietType)) parts.push(`Diet: ${patient.dietType}`);
  return parts.join(" | ") || "See demographics below.";
}

function buildClinicalData(sections, reportValues) {
  const s = sections && typeof sections === "object" ? sections : {};
  const rv = reportValues && typeof reportValues === "object" ? reportValues : {};

  const patientData = {
    ...(typeof rv === "object" ? {
      name: rv.name, sex: rv.sex, dob: rv.dob, age: rv.age,
      heightCm: rv.gpeHeightCm, weightKg: rv.gpeWeightKg,
      bmi: rv.gpeBmi, waistCm: rv.gpeWaistCircumference,
      occupation: rv.occupation, dietType: rv.dietType,
    } : {}),
    ...(s.patient && typeof s.patient === "object" ? s.patient : {})
  };

  return [
    formatSection("PATIENT", patientData),
    formatSection("PAST MEDICAL HISTORY", s.pastMedicalHistory),
    formatSection("SURGICAL HISTORY", s.surgicalHistory),
    formatSection("FAMILY HISTORY", s.familyHistory),
    formatSection("PERSONAL HISTORY (habits/lifestyle)", s.personalHistory),
    formatSection("SLEEP CYCLE", s.sleepCycle),
    formatSection("STRESS (PHQ-9/GAD-7)", s.stressAssessment),
    formatSection("PSS-10", s.pss10),
    formatSection("SOCIAL FITNESS", s.socialFitness),
    formatSection("PHYSICAL EXAM", s.generalPhysicalExamination),
    formatSection("BODY COMPOSITION", s.bodyCompositionAnalysis),
    formatSection("ADVANCED BODY COMPOSITION", s.advancedBodyComposition),
    formatSection("LAB RESULTS", s.docsTests),
    formatSection("ARTERIAL HEALTH", s.arterialHealth),
    formatSection("HEART HEALTH SCORE", s.heartHealthScore),
    formatSection("BRAIN HEALTH", s.brainHealthAssessment),
    formatSection("LUNG FUNCTION", s.lungFunction),
    formatSection("LIVER HEALTH", s.liverHealth),
    formatSection("EYE HEALTH", s.eyeHealth),
    formatSection("KIDNEY HEALTH", s.kidneyHealth),
    formatSection("ULTRASOUND", s.ultrasound),
    formatSection("EXERCISE ASSESSMENT", s.exerciseAssessment),
    formatSection("DIET ASSESSMENT", s.dietAssessment),
    formatSection("ANS ASSESSMENT", s.ansAssessment),
    formatSection("PNS ASSESSMENT", s.pnsAssessment),
    formatSection("DIABETES RISK", s.diabetesRisk),
    formatSection("BONE HEALTH", s.boneHealth),
    formatSection("WOMEN HEALTH", s.womenHealth),
    formatSection("CANCER SCREENING", s.cancerScreening),
    formatSection("ADULT VACCINATION", s.adultVaccination),
    formatSection("ELDER HEALTH", s.elderHealth),
    formatSection("WOMEN SPECIFIC HISTORY", s.womenSpecificHistory),
    formatSection("MALE SPECIFIC HISTORY", s.maleSpecificHistory),
  ].filter(Boolean).join("\n");
}

// ─── STEP 1: Risk Assessment + Foundation ────────────────────────────────────

export const STEP1_SYSTEM_PROMPT = `You are an advanced Lifestyle, Prevention, and Metabolic Health Consultant combining expertise in lifestyle medicine, preventive cardiology, obesity medicine, nutrition science, sleep medicine, exercise medicine, functional health, risk reduction strategy, conventional medical management, and elective preventive interventions.
Analyze the patient's complete health report and generate the FOUNDATION ASSESSMENT.
${BASE_RULES}`;

export const STEP1_SCHEMA = `{
  "riskTags": {
    "RISK_OBESITY": "none|mild|moderate|severe",
    "RISK_SLEEP_APNEA": "none|low|moderate|high",
    "RISK_FATTY_LIVER": "none|mild|moderate|advanced",
    "RISK_SMOKING": "none|ex-smoker|active",
    "RISK_SARCOPENIA": "none|low|moderate|high",
    "RISK_AUTONOMIC": "none|low|moderate|high",
    "RISK_DIABETES": "none|prediabetes|controlled|uncontrolled",
    "RISK_HYPERTENSION": "none|prehypertension|controlled|uncontrolled",
    "RISK_DYSLIPIDEMIA": "none|borderline|high",
    "RISK_CARDIOVASCULAR": "none|low|moderate|high|very-high",
    "RISK_KIDNEY": "none|low|moderate|high",
    "RISK_BONE": "none|osteopenia|osteoporosis",
    "RISK_BRAIN": "none|low|moderate|high",
    "RISK_LUNG": "none|mild|moderate|severe",
    "RISK_MENTAL_HEALTH": "none|mild|moderate|severe",
    "RISK_NUTRITION": "none|mild|moderate|severe",
    "RISK_SEDENTARY": "none|low|moderate|high",
    "RISK_ALCOHOL": "none|low|moderate|high",
    "RISK_HORMONAL": "none|low|moderate|high",
    "RISK_INFLAMMATION": "none|low|moderate|high"
  },
  "priorityScore": {
    "immediate": ["action 1", "action 2"],
    "within3Months": ["action 1"],
    "longTermOptimization": ["action 1"]
  },
  "executiveSummary": {
    "overallImpression": "Brief 2-3 sentence clinical impression",
    "majorRootCauses": ["cause 1", "cause 2"],
    "top5LongTermRisks": ["risk 1", "risk 2", "risk 3", "risk 4", "risk 5"],
    "mostReversibleRisks": ["risk 1", "risk 2"],
    "biologicalAgeInterpretation": "Interpretation vs chronological age including vascular age if applicable",
    "prognosisIfCompliant": "Expected outcomes if plan followed",
    "prognosisIfNonCompliant": "Expected outcomes if plan ignored"
  },
  "redFlagFindings": [
    {
      "finding": "description of dangerous finding",
      "urgency": "immediate|within_1_week|within_1_month",
      "action": "recommended urgent action",
      "type": "dangerous|urgent_specialist|high_risk_lab|overlooked_diagnosis"
    }
  ],
  "rootCauseAnalysis": {
    "summary": "Narrative of how root causes interact and compound each other",
    "drivers": [
      {
        "cause": "e.g. Obesity|Smoking|Sleep deprivation|Insulin resistance|Sedentary lifestyle|Nutritional deficiencies|Chronic inflammation|Stress|Autonomic dysfunction|Fatty liver|Sarcopenia|Poor diet|Alcohol|Hormonal imbalance|Genetic risk",
        "severity": "mild|moderate|severe",
        "mechanism": "how it drives disease progression",
        "reversible": true,
        "progressionRiskIfIgnored": "what happens if this is not addressed"
      }
    ]
  },
  "overallHealthStatus": {
    "summary": "2-3 sentence overall status",
    "organSystemStatus": {
      "cardiovascular": "normal|borderline|compromised|critical",
      "metabolic": "normal|borderline|compromised|critical",
      "liver": "normal|borderline|compromised|critical",
      "kidney": "normal|borderline|compromised|critical",
      "lung": "normal|borderline|compromised|critical",
      "brain": "normal|borderline|compromised|critical",
      "bone": "normal|borderline|compromised|critical",
      "autonomic": "normal|borderline|compromised|critical",
      "mental": "normal|borderline|compromised|critical"
    },
    "overallRiskGrade": "low|moderate|high|very-high",
    "biologicalAge": "estimated age or null",
    "keyFindings": ["finding 1", "finding 2"]
  }
}`;

export function buildStep1UserPrompt({ patient, sections, reportValues, personalization }) {
  const header = buildPatientHeader({
    ...(patient || {}),
    ...(sections?.patient || {})
  });
  const clinicalData = buildClinicalData(sections, reportValues);
  const persBlock = personalization && Object.keys(personalization).length > 0
    ? `\n## PERSONALIZATION\n${JSON.stringify(personalization)}`
    : "";

  return `Analyze this patient's complete health report and generate the Foundation Assessment JSON.

## PATIENT
${header}
${persBlock}

## CLINICAL DATA
${clinicalData}

Return ONLY this JSON schema — no other text:
${STEP1_SCHEMA}`;
}

// ─── STEP 2: Short-Term Plan (0–3 months) ────────────────────────────────────

export const STEP2_SYSTEM_PROMPT = `You are an advanced Lifestyle, Prevention, and Metabolic Health Consultant combining expertise in lifestyle medicine, preventive cardiology, obesity medicine, nutrition science, sleep medicine, exercise medicine, functional health, and risk reduction strategy.
Generate the SHORT-TERM ACTION PLAN (0–3 months) for the patient.
${BASE_RULES}
${PROGRAMME_RULES}`;

export const STEP2_SCHEMA = `{
  "shortTermPlan": {
    "sectionA_immediatePriorities": ["What should be addressed first and why — one sentence each"],
    "sectionB_lifestyleChanges": {
      "diet": "One sentence dietary change recommendation",
      "exercise": "One sentence exercise recommendation",
      "sleep": "One sentence sleep recommendation",
      "stress": "One sentence stress management recommendation",
      "smokingCessation": "One sentence advice or null if not applicable",
      "alcoholReduction": "One sentence advice or null if not applicable",
      "sunlight": "One sentence sunlight exposure recommendation",
      "screenTime": "One sentence screen time recommendation",
      "mealTiming": "One sentence meal timing recommendation",
      "hydration": "One sentence hydration recommendation"
    },
    "sectionC_weightGoals": {
      "currentWeightKg": null,
      "initialTargetKg": null,
      "safeWeightLossPerWeekKg": null,
      "waistReductionTargetCm": null,
      "harshaWeightLossProgramme": "Include 'Dr. Harsha's Weight Loss Diet programme' if overweight/obese or null"
    },
    "sectionD_dietPlanGoals": {
      "dailyProteinTargetG": null,
      "dailyFiberTargetG": null,
      "ultraProcessedFoodReduction": "Target reduction description",
      "sugarReductionG": null,
      "saltReductionG": null,
      "oilReductionMl": null,
      "mealStructure": "Meal timing and structure description",
      "eatingBehaviourCorrections": ["correction 1"],
      "harshaDietProgramme": "Applicable Dr. Harsha programme name (e.g. Diet for Diabetes / Pre-Diabetes / High BP / High Cholesterol / Heart Attack / Stroke) or null"
    },
    "sectionE_exerciseGoals": {
      "aerobicMinutesPerWeek": null,
      "strengthSessionsPerWeek": null,
      "mobilityFlexibilityMinutesPerDay": null,
      "dailyStepTarget": null,
      "sedentaryBreakEveryMinutes": null,
      "exerciseAppRecommendation": "Follow Dr. Harsha's Exercise Health App (to be launched soon)"
    },
    "sectionF_sleepGoals": {
      "targetHoursPerNight": null,
      "bedtimeTarget": "e.g. 10:00 PM",
      "wakeTimeTarget": "e.g. 6:00 AM",
      "osaNotes": "OSA management notes or null"
    },
    "sectionG_medicationConsiderations": [
      { "category": "e.g. BP medicines|Lipid lowering|Diabetes medicines|Anti-obesity|Smoking cessation|Sleep therapy|Hormonal", "recommendation": "One sentence — Consider discussion regarding…" }
    ],
    "sectionH_supplementConsiderations": [
      { "supplement": "e.g. Vitamin D|B12|Iron|Magnesium|Omega-3|Protein|Creatine|Fiber", "oneSentence": "Evidence-based one-sentence recommendation" }
    ],
    "sectionI_investigationsNeeded": [
      { "test": "e.g. Blood tests|Imaging|Sleep study|Holter|Stress test|Fibroscan|CAC scan|Hormonal evaluation", "rationale": "why needed", "urgency": "immediate|within_1_month|within_3_months" }
    ],
    "sectionJ_crossSpecialtyReferrals": [
      { "specialist": "e.g. Cardiologist|Endocrinologist|Hepatologist|Pulmonologist|Sleep specialist|Psychiatrist|Physiotherapist|Bariatric surgeon|Ophthalmologist (NOT dietician)", "reason": "specific reason", "urgency": "urgent|routine" }
    ],
    "sectionK_electiveSurgicalConsiderations": [
      { "intervention": "e.g. Bariatric surgery|CPAP|Joint procedure|Cataract|LASIK|Angiography|Prostate surgery", "indication": "when/why to consider" }
    ],
    "sectionL_monitoringPlan": {
      "weightTracking": "frequency",
      "bpMonitoring": "frequency",
      "sugarMonitoring": "frequency",
      "sleepTracking": "frequency",
      "repeatLabsAt": "e.g. 3 months",
      "repeatScansAt": "e.g. 6 months or as indicated"
    },
    "sectionM_expectedImprovements3Months": ["Realistic expected benefit 1", "benefit 2"]
  }
}`;

export function buildStep2UserPrompt({ patient, riskTags, sections }) {
  const header = buildPatientHeader(patient);
  const keyData = [
    formatSection("PHYSICAL EXAM / VITALS", sections?.generalPhysicalExamination),
    formatSection("BODY COMPOSITION", sections?.bodyCompositionAnalysis),
    formatSection("LAB RESULTS", sections?.docsTests),
    formatSection("SLEEP CYCLE", sections?.sleepCycle),
    formatSection("STRESS ASSESSMENT", sections?.stressAssessment),
    formatSection("EXERCISE ASSESSMENT", sections?.exerciseAssessment),
    formatSection("DIET ASSESSMENT", sections?.dietAssessment),
    formatSection("PERSONAL HISTORY", sections?.personalHistory),
    formatSection("PAST MEDICAL HISTORY", sections?.pastMedicalHistory),
    formatSection("DIABETES RISK", sections?.diabetesRisk),
    formatSection("LIVER HEALTH", sections?.liverHealth),
    formatSection("ANS ASSESSMENT", sections?.ansAssessment),
  ].filter(Boolean).join("\n");

  return `Generate the SHORT-TERM PLAN (0–3 months) for this patient across all sections A through M.

## PATIENT
${header}

## RISK PROFILE (from Step 1)
${JSON.stringify(riskTags || {}, null, 0)}

## KEY CLINICAL DATA
${keyData}

Return ONLY this JSON schema:
${STEP2_SCHEMA}`;
}

// ─── STEP 3: Medium & Long-Term Plans ────────────────────────────────────────

export const STEP3_SYSTEM_PROMPT = `You are an advanced Lifestyle, Prevention, and Metabolic Health Consultant combining expertise in lifestyle medicine, preventive cardiology, obesity medicine, nutrition science, sleep medicine, exercise medicine, and chronic disease management.
Generate the MEDIUM-TERM (3–12 months) and LONG-TERM (1–10 years) plans.
${BASE_RULES}`;

export const STEP3_SCHEMA = `{
  "mediumTermPlan": {
    "diseaseReversalGoals": ["goal 1"],
    "weightTargetKg": null,
    "metabolicTargets": {
      "hba1cTarget": null,
      "ldlTarget": null,
      "bpTarget": "e.g. <130/80",
      "waistTargetCm": null
    },
    "fitnessTargets": ["target 1"],
    "medicationReductionPossibilities": ["possibility 1"],
    "organReversalGoals": {
      "liverReversal": "goal or null",
      "sleepNormalization": "goal or null",
      "cvdRiskReduction": "goal or null"
    },
    "parametersToImproveBy1Year": ["parameter 1"],
    "complicationsPreventedBy1Year": ["complication 1"]
  },
  "longTermPlan": {
    "healthyLifespanGoals": ["goal 1"],
    "preventionTargets": {
      "heartAttack": "prevention strategy",
      "stroke": "prevention strategy",
      "diabetes": "prevention strategy",
      "dementia": "prevention strategy",
      "kidneyDisease": "prevention strategy",
      "fattyLiverProgression": "prevention strategy",
      "cancer": "prevention strategy",
      "frailty": "prevention strategy"
    },
    "musclePreservationStrategy": ["strategy 1"],
    "cognitivePreservationStrategy": ["strategy 1"],
    "bonePreservationStrategy": ["strategy 1"],
    "vaccinationStrategy": ["vaccine 1"],
    "screeningStrategy": [
      { "screening": "name", "frequency": "e.g. every 5 years", "startAge": null }
    ],
    "reversibleDiseases": ["disease 1"],
    "requiresLifelongMonitoring": ["condition 1"],
    "sustainableDietStrategy": "long-term dietary approach",
    "sustainableExerciseStrategy": "long-term exercise approach",
    "relapsePrevention": ["strategy 1"]
  }
}`;

export function buildStep3UserPrompt({ patient, riskTags, sections }) {
  const header = buildPatientHeader(patient);
  const keyData = [
    formatSection("FAMILY HISTORY", sections?.familyHistory),
    formatSection("PAST MEDICAL HISTORY", sections?.pastMedicalHistory),
    formatSection("CARDIOVASCULAR / ARTERIAL HEALTH", sections?.arterialHealth),
    formatSection("HEART HEALTH SCORE", sections?.heartHealthScore),
    formatSection("DIABETES RISK", sections?.diabetesRisk),
    formatSection("LIVER HEALTH", sections?.liverHealth),
    formatSection("KIDNEY HEALTH", sections?.kidneyHealth),
    formatSection("BRAIN HEALTH", sections?.brainHealthAssessment),
    formatSection("BONE HEALTH", sections?.boneHealth),
    formatSection("CANCER SCREENING", sections?.cancerScreening),
    formatSection("ADULT VACCINATION", sections?.adultVaccination),
  ].filter(Boolean).join("\n");

  return `Generate the MEDIUM-TERM (3–12 months) and LONG-TERM (1–10 years) plans.

## PATIENT
${header}

## RISK PROFILE (from Step 1)
${JSON.stringify(riskTags || {}, null, 0)}

## KEY CLINICAL DATA
${keyData}

Return ONLY this JSON schema:
${STEP3_SCHEMA}`;
}

// ─── STEP 4: Treatment + Tests + Review ──────────────────────────────────────

export const STEP4_SYSTEM_PROMPT = `You are an advanced Lifestyle, Prevention, and Metabolic Health Consultant with deep expertise in clinical medicine, preventive cardiology, and conventional medical management.
Generate TREATMENT ADVICE, ADDITIONAL TESTS, and NEXT REVIEW PLAN for the patient.
${BASE_RULES}`;

export const STEP4_SCHEMA = `{
  "treatmentAdvice": {
    "summary": "Overall treatment philosophy for this patient",
    "medications": [
      { "category": "e.g. Antihypertensive / Statin", "recommendation": "Consider discussion regarding…", "priority": "immediate|short_term|long_term" }
    ],
    "procedures": [
      { "procedure": "name", "indication": "when/why to consider" }
    ],
    "specialistCare": [
      { "specialist": "name", "role": "what they should manage" }
    ]
  },
  "additionalTests": {
    "bloodTests": [
      { "test": "name", "rationale": "why needed", "urgency": "immediate|within_1_month|within_3_months|annual" }
    ],
    "imaging": [
      { "scan": "name", "rationale": "why needed", "urgency": "immediate|within_1_month|within_3_months|annual" }
    ],
    "specialisedTests": [
      { "test": "e.g. Sleep study / Fibroscan", "rationale": "why needed", "urgency": "immediate|within_1_month|within_3_months" }
    ],
    "crossConsultations": [
      { "specialist": "name", "reason": "reason", "urgency": "urgent|routine" }
    ]
  },
  "nextReviewPlan": {
    "followUpVisit": "e.g. 4 weeks / 3 months",
    "goalForNextVisit": "what should be achieved",
    "labsToRepeatAtFollowUp": ["lab 1"],
    "scansToRepeatAtFollowUp": ["scan 1"],
    "monitoringFrequency": {
      "weight": "e.g. weekly",
      "bp": "e.g. twice daily",
      "bloodSugar": "e.g. fasting weekly",
      "steps": "e.g. daily via app",
      "sleep": "e.g. nightly via app"
    },
    "warningSignsToWatchFor": ["sign 1"],
    "annualChecklist": ["item 1"]
  }
}`;

export function buildStep4UserPrompt({ patient, riskTags, sections }) {
  const header = buildPatientHeader(patient);
  const keyData = [
    formatSection("PAST MEDICAL HISTORY", sections?.pastMedicalHistory),
    formatSection("LAB RESULTS", sections?.docsTests),
    formatSection("HEART HEALTH SCORE", sections?.heartHealthScore),
    formatSection("ARTERIAL HEALTH", sections?.arterialHealth),
    formatSection("LUNG FUNCTION", sections?.lungFunction),
    formatSection("LIVER HEALTH", sections?.liverHealth),
    formatSection("KIDNEY HEALTH", sections?.kidneyHealth),
    formatSection("DIABETES RISK", sections?.diabetesRisk),
    formatSection("EYE HEALTH", sections?.eyeHealth),
    formatSection("BONE HEALTH", sections?.boneHealth),
    formatSection("BRAIN HEALTH", sections?.brainHealthAssessment),
    formatSection("ANS ASSESSMENT", sections?.ansAssessment),
    formatSection("WOMEN HEALTH", sections?.womenHealth),
    formatSection("CANCER SCREENING", sections?.cancerScreening),
    formatSection("ADULT VACCINATION", sections?.adultVaccination),
  ].filter(Boolean).join("\n");

  return `Generate TREATMENT ADVICE, ADDITIONAL TESTS, and NEXT REVIEW PLAN.

## PATIENT
${header}

## RISK PROFILE (from Step 1)
${JSON.stringify(riskTags || {}, null, 0)}

## KEY CLINICAL DATA
${keyData}

Return ONLY this JSON schema:
${STEP4_SCHEMA}`;
}

// ─── STEP 5: Lifestyle + Referrals + Handouts + Table ────────────────────────

export const STEP5_SYSTEM_PROMPT = `You are an advanced Lifestyle, Prevention, and Metabolic Health Consultant specialising in lifestyle medicine and patient education.
Generate LIFESTYLE ADVICE, REFERRALS, PATIENT HANDOUTS, MOTIVATIONAL COUNSELLING, and the STRUCTURED ACTION TABLE.
${BASE_RULES}
${PROGRAMME_RULES}
MOTIVATIONAL COUNSELLING RULES:
- Explain why action is urgent but AVOID fearmongering.
- Describe what can realistically improve — AVOID unrealistic promises.
- Emphasise importance of consistency and family support.`;

export const STEP5_SCHEMA = `{
  "lifestyleAdvice": {
    "dietPlan": {
      "approach": "e.g. Mediterranean / Low-GI / High-protein",
      "keyFoods": ["food 1"],
      "foodsToAvoid": ["food 1"],
      "mealTimingTips": ["tip 1"],
      "portionControl": "guidance",
      "cookingTips": ["tip 1"],
      "eatingOutTips": ["tip 1"],
      "fitnessAppRecommendation": "e.g. MyFitnessPal"
    },
    "exercisePlan": {
      "weeklyStructure": "e.g. 5 days aerobic + 2 days strength",
      "recommendedActivities": ["activity 1"],
      "progressionPlan": "how to progress over 3 months",
      "precautions": ["precaution 1"],
      "fitnessAppRecommendation": "e.g. Google Fit / Strava"
    },
    "sleepHygiene": ["tip 1", "tip 2"],
    "stressManagement": ["technique 1"],
    "habitChangeGoals": [
      { "habit": "habit to change", "target": "specific goal", "timeline": "timeline" }
    ]
  },
  "referralFeedback": {
    "specialistReferrals": [
      { "specialist": "name", "reason": "specific reason", "urgency": "urgent|routine", "whatToTell": "brief for specialist" }
    ],
    "scannerReferrals": [
      { "facility": "e.g. Radiology center", "scanRequired": "scan name", "reason": "indication" }
    ],
    "googleReviewRequest": "Patient-friendly message encouraging a review"
  },
  "handouts": {
    "patientSummary": "2-3 sentence plain-language summary",
    "keyMessages": ["message 1", "message 2"],
    "dos": ["do this 1"],
    "donts": ["avoid this 1"],
    "goalCard": [
      { "goal": "short goal", "target": "measurable target", "by": "timeline" }
    ],
    "emergencySigns": ["warning sign 1"]
  },
  "motivationalCounselling": {
    "whyActNow": "Compelling honest reason for urgency — balanced, no fearmongering",
    "whatCanImprove": "Realistic description of improvements possible with compliance",
    "importanceOfConsistency": "Why sustained consistency matters more than perfection",
    "importanceOfFamilySupport": "How family involvement accelerates outcomes",
    "patientMessage": "Warm, personal, motivating message (2-3 sentences) to the patient"
  },
  "structuredTable": [
    {
      "timeline": "0-1 month|0-3 months|3-12 months|1-5 years|5-10 years",
      "goal": "goal name (e.g. Weight|BP|Sleep|Exercise|Smoking|Diet|Labs|Organ health|Mental health|Functional fitness)",
      "action": "specific action to take",
      "target": "measurable target"
    }
  ]
}`;

export function buildStep5UserPrompt({ patient, riskTags, shortTermGoals, sections }) {
  const header = buildPatientHeader(patient);
  const keyData = [
    formatSection("PERSONAL HISTORY", sections?.personalHistory),
    formatSection("DIET ASSESSMENT", sections?.dietAssessment),
    formatSection("EXERCISE ASSESSMENT", sections?.exerciseAssessment),
    formatSection("SLEEP CYCLE", sections?.sleepCycle),
    formatSection("STRESS / MENTAL HEALTH", sections?.stressAssessment),
    formatSection("SOCIAL FITNESS", sections?.socialFitness),
  ].filter(Boolean).join("\n");

  const goalsBlock = shortTermGoals
    ? `\n## SHORT-TERM GOALS SUMMARY (from Step 2)\n${JSON.stringify(shortTermGoals, null, 0)}`
    : "";

  return `Generate LIFESTYLE ADVICE, REFERRALS, HANDOUTS, MOTIVATIONAL COUNSELLING, and STRUCTURED TABLE.

The structuredTable must cover ALL of: Weight, BP, Sleep, Exercise, Smoking, Diet, Labs, Organ health, Mental health, and Functional fitness — with rows across all timelines (0-1m, 0-3m, 3-12m, 1-5y, 5-10y) as applicable.

## PATIENT
${header}

## RISK PROFILE (from Step 1)
${JSON.stringify(riskTags || {}, null, 0)}
${goalsBlock}

## LIFESTYLE DATA
${keyData}

Return ONLY this JSON schema:
${STEP5_SCHEMA}`;
}

// ─── REGENERATE: Modify existing plan based on change request ────────────────

export const REGENERATE_SYSTEM_PROMPT = `You are a Preventive Medicine and Metabolic Health expert.
You will receive an existing holistic prevention & lifestyle plan that was previously generated for a patient, along with the patient's clinical data and a specific change request from the treating team.
Your task is to return a fully updated version of the plan that incorporates the requested changes while keeping everything else consistent.
${BASE_RULES}`;

export function buildRegenerateUserPrompt({ patient, sections, existingPlan, changeRequest }) {
  const header = buildPatientHeader(patient || {});
  const clinicalData = buildClinicalData(sections || {}, {});
  const planJson = JSON.stringify(existingPlan || {});
  const request = safeStr(changeRequest) || "Improve and refine the plan.";

  return `The treating team wants to update this patient's Holistic Prevention & Lifestyle Plan.

## PATIENT
${header}

## CLINICAL DATA
${clinicalData}

## EXISTING PLAN (currently saved)
${planJson}

## CHANGE REQUEST FROM TREATING TEAM
"${request}"

Instructions:
- Apply the change request to the relevant sections of the plan.
- Keep all other sections unchanged unless the change request directly affects them.
- Preserve the exact same JSON keys and structure as the existing plan above.
- Do NOT drop any top-level keys that exist in the existing plan.
- Return the complete updated plan as a single JSON object (same structure as the existing plan).

Return ONLY the updated JSON. No markdown, no explanation, no text outside the JSON.`;
}
