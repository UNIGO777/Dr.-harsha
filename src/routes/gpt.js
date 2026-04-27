import express from "express";
import multer from "multer";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAdvancedBodyCompositionHandler } from "../AiControllers/AdvancedBodyCompositionController.js";
import { createBloodAnalysisHandler, createOtherAnalysisHandler } from "../AiControllers/BloodOtherController.js";
import {
  createDocsTestsCleanHandler,
  createDocsTestsExcelHandler,
  createDocsTestsHandler
} from "../AiControllers/DocsTestsController.js";
import { createGptChatHandler } from "../AiControllers/GptChatController.js";
import {
  createHeartAnalysisHandler,
  createHeartUrineAnalysisHandler,
  createUrineAnalysisHandler
} from "../AiControllers/HeartUrineController.js";
import { createUltrasoundAnalysisHandler } from "../AiControllers/UltrasoundController.js";
import { createExerciseAssessmentHandler } from "../AiControllers/ExerciseAssessmentController.js";
import { createDietAssessmentHandler } from "../AiControllers/DietAssessmentController.js";
import { createAnsAssessmentHandler } from "../AiControllers/AnsAssessmentController.js";
import { createArterialHealthHandler } from "../AiControllers/ArterialHealthController.js";
import { createLungFunctionHandler } from "../AiControllers/LungFunctionController.js";
import { createLiverHealthHandler } from "../AiControllers/LiverHealthController.js";
import { createEyeHealthHandler } from "../AiControllers/EyeHealthController.js";
import { createKidneyHealthHandler } from "../AiControllers/KidneyHealthController.js";
import { createDiabetesRiskHandler } from "../AiControllers/DiabetesRiskController.js";
import { createWomenHealthHandler } from "../AiControllers/WomenHealthController.js";
import { createBoneHealthHandler } from "../AiControllers/BoneHealthController.js";
import { createAdultVaccinationHandler } from "../AiControllers/AdultVaccinationController.js";
import { createCancerScreeningHandler } from "../AiControllers/CancerScreeningController.js";
import { createGenesHealthHandler } from "../AiControllers/GenesHealthController.js";
import { createAllergyPanelsHandler } from "../AiControllers/AllergyPanelsController.js";
import { createBrainHealthAssessmentHandler } from "../AiControllers/BrainHealthAssessmentController.js";

import { AI_OUTPUT_JSON_SUFFIX } from "../AiPrompts/shared.js";
import {
  JSON_REPAIR_SYSTEM_PROMPT,
  buildJsonRepairArrayUserPrompt,
  buildJsonRepairObjectUserPrompt
} from "../AiPrompts/jsonRepairPrompts.js";
import {
  DOCS_TESTS_CLEAN_SCHEMA_HINT,
  DOCS_TESTS_CLEAN_SYSTEM_PROMPT,
  buildDocsTestsCleanUserPrompt
} from "../AiPrompts/docsTestsCleanPrompts.js";
import { MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT } from "../AiPrompts/medicalReportExtractionPrompts.js";
import {
  BLOOD_IMAGES_USER_PROMPT,
  BLOOD_SCHEMA_HINT,
  BLOOD_TEXT_FALLBACK_CLAUDE_USER_PROMPT,
  BLOOD_TEXT_USER_PROMPT
} from "../AiPrompts/bloodPrompts.js";
import {
  DOCS_TESTS_IMAGES_USER_PROMPT,
  DOCS_TESTS_SCHEMA_HINT,
  DOCS_TESTS_TEXT_USER_PROMPT
} from "../AiPrompts/docsTestsPrompts.js";
import { HEART_RELATED_TESTS_SYSTEM_PROMPT, buildHeartRelatedTestsUserPrompt } from "../AiPrompts/heartPrompts.js";
import { TESTS_FROM_PDFS_SYSTEM_PROMPT, buildTestsFromPdfsUserPrompt } from "../AiPrompts/testsFromPdfsPrompts.js";
import { buildTestsFromImagesUserPrompt } from "../AiPrompts/testsFromImagesPrompts.js";
import { URINOGRAM_ANCHOR_TERMS, buildUrinogramUserPrompt } from "../AiPrompts/urinePrompts.js";
import { ULTRASOUND_ANCHOR_TERMS, buildUltrasoundUserPrompt } from "../AiPrompts/ultrasoundPrompts.js";
import {
  EXERCISE_ASSESSMENT_SYSTEM_PROMPT,
  buildExerciseAssessmentUserPrompt
} from "../AiPrompts/exerciseAssessmentPrompts.js";
import { DIET_ASSESSMENT_SYSTEM_PROMPT, buildDietAssessmentUserPrompt } from "../AiPrompts/dietAssessmentPrompts.js";
import { ANS_ASSESSMENT_SYSTEM_PROMPT, buildAnsAssessmentUserPrompt } from "../AiPrompts/ansAssessmentPrompts.js";
import {
  ARTERIAL_HEALTH_SYSTEM_PROMPT,
  buildArterialHealthUserPrompt
} from "../AiPrompts/arterialHealthPrompts.js";
import { LUNG_FUNCTION_SYSTEM_PROMPT, buildLungFunctionUserPrompt } from "../AiPrompts/lungFunctionPrompts.js";
import { LIVER_HEALTH_SYSTEM_PROMPT, buildLiverHealthUserPrompt } from "../AiPrompts/liverHealthPrompts.js";
import { EYE_HEALTH_SYSTEM_PROMPT, buildEyeHealthUserPrompt } from "../AiPrompts/eyeHealthPrompts.js";
import { KIDNEY_HEALTH_SYSTEM_PROMPT, buildKidneyHealthUserPrompt } from "../AiPrompts/kidneyHealthPrompts.js";
import { DIABETES_RISK_SYSTEM_PROMPT, buildDiabetesRiskUserPrompt } from "../AiPrompts/diabetesRiskPrompts.js";
import { WOMEN_HEALTH_SYSTEM_PROMPT, buildWomenHealthUserPrompt } from "../AiPrompts/womenHealthPrompts.js";
import { BONE_HEALTH_SYSTEM_PROMPT, buildBoneHealthUserPrompt } from "../AiPrompts/boneHealthPrompts.js";
import {
  ADULT_VACCINATION_SYSTEM_PROMPT,
  buildAdultVaccinationUserPrompt
} from "../AiPrompts/adultVaccinationPrompts.js";
import {
  CANCER_SCREENING_SYSTEM_PROMPT,
  buildCancerScreeningUserPrompt
} from "../AiPrompts/cancerScreeningPrompts.js";
import { GENES_HEALTH_SYSTEM_PROMPT, buildGenesHealthUserPrompt } from "../AiPrompts/genesHealthPrompts.js";
import { ALLERGY_PANELS_SYSTEM_PROMPT, buildAllergyPanelsUserPrompt } from "../AiPrompts/allergyPanelsPrompts.js";
import {
  CARDIAC_INVESTIGATIONS_SYSTEM_PROMPT,
  buildCardiacInvestigationsUserPrompt
} from "../AiPrompts/cardiacInvestigationsPrompts.js";
import {
  BRAIN_HEALTH_ASSESSMENT_SYSTEM_PROMPT,
  BRAIN_HEALTH_PART2_EXTRACT_SYSTEM_PROMPT,
  buildBrainHealthAssessmentUserPrompt,
  buildBrainHealthPart2ExtractUserPrompt
} from "../AiPrompts/brainHealthAssessmentPrompts.js";

function requireString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getOpenAIClient() {
  if (!requireString(process.env.OPENAI_API_KEY)) {
    return null;
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function normalizeAiProvider(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!v) return "openai";
  if (v.includes("claude") || v.includes("anthropic")) return "claude";
  if (v.includes("gemini") || v.includes("google")) return "gemini";
  if (v.includes("openai") || v.includes("gpt")) return "openai";
  return "openai";
}

function getAiProviderFromReq(req) {
  return normalizeAiProvider(req?.body?.provider ?? req?.query?.provider);
}

function hasAnthropicKey() {
  return requireString(process.env.ANTHROPIC_API_KEY);
}

function hasGeminiKey() {
  return requireString(process.env.Gemini_api_key);
}

function getGeminiModel() {
  const m = typeof process.env.Gemini_model === "string" ? process.env.Gemini_model.trim() : "";
  return m || "gemini-2.5-flash";
}

function getTextFromAnthropicMessageResponse(response) {
  const content = response?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

function getFetch() {
  if (typeof fetch === "function") return fetch;
  throw new Error("Global fetch is not available. Use Node.js v18+.");
}

function getTextFromGeminiGenerateContentResponse(response) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  const parts = Array.isArray(candidates?.[0]?.content?.parts) ? candidates[0].content.parts : [];
  return parts
    .map((p) => (p && typeof p.text === "string" ? p.text : ""))
    .filter((t) => t)
    .join("\n");
}

async function geminiGenerateContent({ parts, model, temperature, maxOutputTokens }) {
  if (!hasGeminiKey()) {
    throw new Error("Gemini_api_key is not set");
  }

  const finalModel = requireString(model) ? model : getGeminiModel();
  const finalParts = Array.isArray(parts) && parts.length > 0 ? parts : [{ text: "" }];

  const res = await getFetch()(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(finalModel)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.Gemini_api_key
      },
      body: JSON.stringify({
        contents: [{ parts: finalParts }],
        generationConfig: {
          temperature: Number.isFinite(temperature) ? temperature : 0,
          maxOutputTokens: Number.isFinite(maxOutputTokens) ? Math.max(256, Math.trunc(maxOutputTokens)) : 4096
        }
      })
    }
  );

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof json?.error?.message === "string" && json.error.message.trim()
        ? json.error.message
        : `Gemini request failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}

async function anthropicCreateJsonMessage({ system, messages, model, temperature, maxTokens }) {
  if (!hasAnthropicKey()) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const finalModel = requireString(model)
    ? model
    : process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

  const res = await getFetch()("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: finalModel,
      max_tokens: Number.isFinite(maxTokens) ? Math.max(256, Math.trunc(maxTokens)) : 4096,
      temperature: Number.isFinite(temperature) ? temperature : 0,
      system: requireString(system) ? system : undefined,
      messages: Array.isArray(messages) ? messages : []
    })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (typeof data?.error?.message === "string" && data.error.message.trim()) ||
      (typeof data?.message === "string" && data.message.trim()) ||
      `Anthropic request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

function parseMaybeJson(value) {
  if (!requireString(value)) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseMaybeNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalNumberLoose(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  const normalized = s.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizeExerciseAssessmentIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const patient = b.patient && typeof b.patient === "object" ? b.patient : {};
  const assessment = b.assessment && typeof b.assessment === "object" ? b.assessment : b;

  const sex =
    typeof patient.sex === "string"
      ? patient.sex.trim().toLowerCase()
      : typeof assessment.sex === "string"
        ? assessment.sex.trim().toLowerCase()
        : "";
  const age = parseOptionalNumberLoose(patient.age ?? assessment.age);

  const normalizedPatient = {
    name: typeof patient.name === "string" ? patient.name.trim() : "",
    sex: sex === "male" || sex === "female" ? sex : "",
    age: Number.isFinite(age) && age > 0 ? Math.trunc(age) : null
  };

  const normalizedAssessment = {
    exRestingHrBpm: parseOptionalNumberLoose(assessment.exRestingHrBpm),
    exFunctionalTestType:
      typeof assessment.exFunctionalTestType === "string" ? assessment.exFunctionalTestType.trim() : "",
    exSixMinWalkDistanceM: parseOptionalNumberLoose(assessment.exSixMinWalkDistanceM),
    exTwoMinStepTotalSteps: parseOptionalNumberLoose(assessment.exTwoMinStepTotalSteps),
    exTalkTest: typeof assessment.exTalkTest === "string" ? assessment.exTalkTest.trim() : "",
    exBorgScore: parseOptionalNumberLoose(assessment.exBorgScore),
    exMaxHrRecordedBpm: parseOptionalNumberLoose(assessment.exMaxHrRecordedBpm),
    exHrAtStopBpm: parseOptionalNumberLoose(assessment.exHrAtStopBpm),
    exHrAt1MinBpm: parseOptionalNumberLoose(assessment.exHrAt1MinBpm),
    exSitToStandTimeSec: parseOptionalNumberLoose(assessment.exSitToStandTimeSec),
    exGripRightKg: parseOptionalNumberLoose(assessment.exGripRightKg),
    exGripLeftKg: parseOptionalNumberLoose(assessment.exGripLeftKg)
  };

  if (normalizedAssessment.exFunctionalTestType !== "2min_step") normalizedAssessment.exFunctionalTestType = "6mwt";

  const talk = normalizedAssessment.exTalkTest;
  if (!["sing", "talk", "short", "cannot"].includes(talk)) normalizedAssessment.exTalkTest = "";

  return { patient: normalizedPatient, assessment: normalizedAssessment };
}

function computeExerciseAssessment({ patient, assessment }) {
  const sex = patient?.sex === "male" || patient?.sex === "female" ? patient.sex : "";
  const age = Number.isFinite(patient?.age) ? patient.age : null;
  const apmhr = Number.isFinite(age) && age > 0 ? 220 - age : null;

  const rhr = Number.isFinite(assessment?.exRestingHrBpm) ? assessment.exRestingHrBpm : null;
  const rhrCategory =
    Number.isFinite(rhr) && rhr > 0
      ? rhr < 60
        ? "Excellent cardiovascular fitness"
        : rhr < 70
          ? "Good"
          : rhr < 80
            ? "Average"
            : rhr < 90
              ? "Reduced fitness"
              : "High cardiometabolic risk"
      : null;

  const functionalTestType = assessment?.exFunctionalTestType === "2min_step" ? "2min_step" : "6mwt";
  const sixMwt = Number.isFinite(assessment?.exSixMinWalkDistanceM) ? assessment.exSixMinWalkDistanceM : null;
  const stepCount = Number.isFinite(assessment?.exTwoMinStepTotalSteps) ? assessment.exTwoMinStepTotalSteps : null;
  const functionalCapacity =
    functionalTestType === "6mwt" && Number.isFinite(sixMwt) && sixMwt > 0
      ? sixMwt > 550
        ? "Good"
        : sixMwt >= 400
          ? "Fair"
          : sixMwt >= 300
            ? "Low"
            : "Poor"
      : null;

  const talk = assessment?.exTalkTest;
  const talkIntensity =
    talk === "sing" ? "Light" : talk === "talk" ? "Moderate" : talk === "short" ? "Vigorous" : talk === "cannot" ? "Stop" : null;

  const borg = Number.isFinite(assessment?.exBorgScore) ? assessment.exBorgScore : null;
  const borgIntensity =
    Number.isFinite(borg) && borg >= 0
      ? borg <= 1
        ? "Light"
        : borg <= 3
          ? "Mild"
          : borg <= 5
            ? "Moderate"
            : borg <= 7
              ? "Vigorous"
              : "Stop"
      : null;

  const maxHr = Number.isFinite(assessment?.exMaxHrRecordedBpm) ? assessment.exMaxHrRecordedBpm : null;
  const hrmaxPercent =
    Number.isFinite(maxHr) && maxHr > 0 && Number.isFinite(apmhr) && apmhr > 0 ? (maxHr / apmhr) * 100 : null;
  const hrmaxCategory =
    Number.isFinite(hrmaxPercent)
      ? hrmaxPercent < 50
        ? "Sedentary / very light"
        : hrmaxPercent <= 63
          ? "Mild"
          : hrmaxPercent <= 76
            ? "Moderate"
            : hrmaxPercent <= 93
              ? "Vigorous"
              : "Very vigorous (avoid in common people)"
      : null;

  const hrStop = Number.isFinite(assessment?.exHrAtStopBpm) ? assessment.exHrAtStopBpm : null;
  const hr1 = Number.isFinite(assessment?.exHrAt1MinBpm) ? assessment.exHrAt1MinBpm : null;
  const hrRecovery = Number.isFinite(hrStop) && Number.isFinite(hr1) ? hrStop - hr1 : null;
  const hrRecoveryCategory =
    Number.isFinite(hrRecovery)
      ? hrRecovery >= 20
        ? "Excellent"
        : hrRecovery >= 12
          ? "Normal"
          : "Poor autonomic fitness (high risk)"
      : null;

  const sts = Number.isFinite(assessment?.exSitToStandTimeSec) ? assessment.exSitToStandTimeSec : null;
  const stsCategory =
    Number.isFinite(sts) && sts > 0 ? (sts < 10 ? "Good" : sts <= 15 ? "Average" : "Weak / sarcopenia risk") : null;

  const gripR = Number.isFinite(assessment?.exGripRightKg) ? assessment.exGripRightKg : null;
  const gripL = Number.isFinite(assessment?.exGripLeftKg) ? assessment.exGripLeftKg : null;
  const gripMin = [gripR, gripL].filter((n) => Number.isFinite(n)).reduce((min, n) => (n < min ? n : min), Infinity);
  const gripWeakness =
    (sex === "male" && Number.isFinite(gripMin) && gripMin < 26) || (sex === "female" && Number.isFinite(gripMin) && gripMin < 16)
      ? true
      : false;

  const safetyFlags = [];
  if (talk === "cannot") safetyFlags.push("Cannot talk during activity (stop exercise)");
  if (Number.isFinite(borg) && borg >= 8) safetyFlags.push("Very severe breathlessness (Borg ≥ 8)");
  if (Number.isFinite(hrRecovery) && hrRecovery < 12) safetyFlags.push("Poor heart-rate recovery (<12 bpm)");
  if (Number.isFinite(hrmaxPercent) && hrmaxPercent > 93) safetyFlags.push("Very vigorous intensity (>93% HRmax)");
  if (Number.isFinite(rhr) && rhr >= 90) safetyFlags.push("High resting heart rate (≥90 bpm)");

  const toOrdinal = (label) => {
    if (!label) return null;
    if (label === "Stop") return "stop";
    const v = String(label).toLowerCase();
    if (v.includes("sedentary")) return 0;
    if (v === "light") return 0;
    if (v === "mild") return 1;
    if (v === "moderate") return 2;
    if (v === "vigorous") return 3;
    if (v.includes("very vigorous")) return 3;
    return null;
  };

  const ordinals = [toOrdinal(talkIntensity), toOrdinal(borgIntensity), toOrdinal(hrmaxCategory)].filter((v) => v !== null);
  const hasStop = ordinals.includes("stop");
  const numericOrdinals = ordinals.filter((v) => typeof v === "number").sort((a, b) => a - b);
  const finalOrdinal =
    hasStop ? null : numericOrdinals.length === 0 ? null : numericOrdinals[Math.floor((numericOrdinals.length - 1) / 2)];
  const finalCategory =
    hasStop
      ? "Stop"
      : finalOrdinal === 0
        ? "Sedentary"
        : finalOrdinal === 1
          ? "Mild"
          : finalOrdinal === 2
            ? "Moderate"
            : finalOrdinal === 3
              ? "Vigorous"
              : null;

  let score = 100;
  if (Number.isFinite(rhr)) {
    if (rhr >= 90) score -= 20;
    else if (rhr >= 80) score -= 10;
    else if (rhr >= 70) score -= 5;
  }
  if (Number.isFinite(sixMwt) && functionalTestType === "6mwt") {
    if (sixMwt < 300) score -= 25;
    else if (sixMwt < 400) score -= 15;
    else if (sixMwt < 550) score -= 5;
  }
  if (Number.isFinite(hrRecovery)) {
    if (hrRecovery < 12) score -= 20;
    else if (hrRecovery < 20) score -= 10;
  }
  if (Number.isFinite(sts)) {
    if (sts > 15) score -= 15;
    else if (sts >= 10) score -= 5;
  }
  if (gripWeakness) score -= 10;
  if (talk === "cannot" || (Number.isFinite(borg) && borg >= 8)) score -= 30;
  if (Number.isFinite(hrmaxPercent) && hrmaxPercent > 93) score -= 10;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
  if (hasStop || (Number.isFinite(hrRecovery) && hrRecovery < 12)) grade = "D";

  return {
    agePredictedMaxHrBpm: apmhr,
    restingHrCategory: rhrCategory,
    functionalTestType,
    functionalCapacity,
    talkIntensity,
    borgIntensity,
    hrmaxPercent: Number.isFinite(hrmaxPercent) ? Math.round(hrmaxPercent * 10) / 10 : null,
    hrmaxCategory,
    hrRecovery,
    hrRecoveryCategory,
    sitToStandCategory: stsCategory,
    gripWeakness,
    finalCategory,
    score,
    grade,
    safetyFlags
  };
}

async function generateExerciseAssessmentSummaryWithAi({ openai, provider, patient, assessment, computed, debug }) {
  const userPrompt = buildExerciseAssessmentUserPrompt({ patient, assessment, computed });
  const systemPrompt = EXERCISE_ASSESSMENT_SYSTEM_PROMPT;

  let raw = "";
  if (provider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else if (provider === "gemini") {
    const response = await geminiGenerateContent({
      model: getGeminiModel(),
      temperature: 0,
      parts: [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }]
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      text: { format: { type: "json_object" } },
      input: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] }
      ]
    });
    raw = getTextFromResponsesOutput(response);
  }

  const parsed =
    safeParseJsonObject(raw) ??
    safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ??
    null;

  const summary = typeof parsed?.summary === "string" ? parsed.summary : "";
  const safetyFlags = Array.isArray(parsed?.safetyFlags) ? parsed.safetyFlags.filter((s) => typeof s === "string" && s.trim()) : [];

  const payload = { summary, safetyFlags };
  if (debug) payload.raw = raw;
  return payload;
}

function parseOptionalIntegerLoose(value) {
  const n = parseOptionalNumberLoose(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normalizeDietAssessmentIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const patient = b.patient && typeof b.patient === "object" ? b.patient : {};
  const assessment = b.assessment && typeof b.assessment === "object" ? b.assessment : b;

  const sex =
    typeof patient.sex === "string"
      ? patient.sex.trim().toLowerCase()
      : typeof assessment.sex === "string"
        ? assessment.sex.trim().toLowerCase()
        : "";
  const age = parseOptionalIntegerLoose(patient.age ?? assessment.age);

  const normPatient = {
    name: typeof patient.name === "string" ? patient.name.trim() : "",
    sex: sex === "male" || sex === "female" ? sex : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };

  const yesNo = (v) => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    return s === "yes" || s === "no" ? s : "";
  };
  const freq = (v) => {
    const s = typeof v === "string" ? v.trim() : "";
    return ["lt3", "3to5", "7"].includes(s) ? s : "";
  };

  const listStringArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []);

  const normAssessment = {
    dietBreakfastTime: typeof assessment.dietBreakfastTime === "string" ? assessment.dietBreakfastTime.trim() : "",
    dietLunchTime: typeof assessment.dietLunchTime === "string" ? assessment.dietLunchTime.trim() : "",
    dietDinnerTime: typeof assessment.dietDinnerTime === "string" ? assessment.dietDinnerTime.trim() : "",
    dietBedtime: typeof assessment.dietBedtime === "string" ? assessment.dietBedtime.trim() : "",
    dietBreakfastRice: freq(assessment.dietBreakfastRice),
    dietBreakfastWheat: freq(assessment.dietBreakfastWheat),
    dietBreakfastMillets: freq(assessment.dietBreakfastMillets),
    dietBreakfastProtein: freq(assessment.dietBreakfastProtein),
    dietBreakfastFruit: freq(assessment.dietBreakfastFruit),
    dietBreakfastLeafyVeg: freq(assessment.dietBreakfastLeafyVeg),
    dietBreakfastNonLeafyVeg: freq(assessment.dietBreakfastNonLeafyVeg),
    dietBreakfastTeaCoffeeMilk: freq(assessment.dietBreakfastTeaCoffeeMilk),
    dietBreakfastDryNuts: freq(assessment.dietBreakfastDryNuts),
    dietBreakfastDrySeeds: freq(assessment.dietBreakfastDrySeeds),
    dietLunchRice: freq(assessment.dietLunchRice),
    dietLunchWheat: freq(assessment.dietLunchWheat),
    dietLunchMillets: freq(assessment.dietLunchMillets),
    dietLunchProtein: freq(assessment.dietLunchProtein),
    dietLunchFruit: freq(assessment.dietLunchFruit),
    dietLunchLeafyVeg: freq(assessment.dietLunchLeafyVeg),
    dietLunchNonLeafyVeg: freq(assessment.dietLunchNonLeafyVeg),
    dietLunchCurdButtermilk: freq(assessment.dietLunchCurdButtermilk),
    dietDinnerSimilarToLunch: yesNo(assessment.dietDinnerSimilarToLunch),
    dietDinnerHighRiceRagi: yesNo(assessment.dietDinnerHighRiceRagi),
    dietDinnerSkipFrequently: yesNo(assessment.dietDinnerSkipFrequently),
    dietRule5WholeGrainsDaily: yesNo(assessment.dietRule5WholeGrainsDaily),
    dietRule5ProteinDaily: yesNo(assessment.dietRule5ProteinDaily),
    dietRule5VegetablesDaily: yesNo(assessment.dietRule5VegetablesDaily),
    dietRule5FruitsDaily: yesNo(assessment.dietRule5FruitsDaily),
    dietRule5NutsSeedsDaily: yesNo(assessment.dietRule5NutsSeedsDaily),
    dietVarietyPulsesProtein: parseOptionalIntegerLoose(assessment.dietVarietyPulsesProtein),
    dietVarietyVegetables: parseOptionalIntegerLoose(assessment.dietVarietyVegetables),
    dietVarietyFruits: parseOptionalIntegerLoose(assessment.dietVarietyFruits),
    dietVarietyWholeGrains: parseOptionalIntegerLoose(assessment.dietVarietyWholeGrains),
    dietVarietyDryNuts: parseOptionalIntegerLoose(assessment.dietVarietyDryNuts),
    dietVarietyDrySeeds: parseOptionalIntegerLoose(assessment.dietVarietyDrySeeds),
    dietProbioticIntake:
      typeof assessment.dietProbioticIntake === "string" && ["ge5", "lt5", "rare"].includes(assessment.dietProbioticIntake.trim())
        ? assessment.dietProbioticIntake.trim()
        : "",
    dietNegativeHabits: listStringArray(assessment.dietNegativeHabits),
    dietOutsideFoodFrequency:
      typeof assessment.dietOutsideFoodFrequency === "string" && ["gt2wk", "once_week", "once_month"].includes(assessment.dietOutsideFoodFrequency.trim())
        ? assessment.dietOutsideFoodFrequency.trim()
        : "",
    dietSnacksTiming: typeof assessment.dietSnacksTiming === "string" ? assessment.dietSnacksTiming.trim() : "",
    dietSnacksItems: listStringArray(assessment.dietSnacksItems),
    dietBeveragesTeaCoffeeJuiceCupsPerDay: parseOptionalNumberLoose(assessment.dietBeveragesTeaCoffeeJuiceCupsPerDay),
    dietBeveragesWithSugar: yesNo(assessment.dietBeveragesWithSugar),
    dietBeveragesWithMilk: yesNo(assessment.dietBeveragesWithMilk),
    dietBeveragesPackagedDrinksJuices: yesNo(assessment.dietBeveragesPackagedDrinksJuices),
    dietPatternFlags: listStringArray(assessment.dietPatternFlags)
  };

  return { patient: normPatient, assessment: normAssessment };
}

function normalizeSocialFitnessIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const patient = b.patient && typeof b.patient === "object" ? b.patient : {};
  const assessment = b.assessment && typeof b.assessment === "object" ? b.assessment : b;

  const sex =
    typeof patient.sex === "string"
      ? patient.sex.trim().toLowerCase()
      : typeof assessment.sex === "string"
        ? assessment.sex.trim().toLowerCase()
        : "";
  const age = parseOptionalIntegerLoose(patient.age ?? assessment.age);

  const normPatient = {
    name: typeof patient.name === "string" ? patient.name.trim() : "",
    sex: sex === "male" || sex === "female" ? sex : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };

  const score = (v) => {
    if (typeof v === "number" && Number.isFinite(v)) return v === 0 || v === 1 || v === 2 ? v : null;
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!s) return null;
    const n = parseMaybeNumber(s);
    if (Number.isFinite(n) && (n === 0 || n === 1 || n === 2)) return n;
    const lower = s.toLowerCase();
    if (lower === "yes" || lower === "strong") return 2;
    if (lower === "some") return 1;
    if (lower === "no" || lower === "none") return 0;
    return null;
  };

  const normAssessment = {
    safetySecurity: score(assessment.safetySecurity),
    learningGrowth: score(assessment.learningGrowth),
    emotionalConfiding: score(assessment.emotionalConfiding),
    identityAffirmation: score(assessment.identityAffirmation),
    romanticIntimacy: score(assessment.romanticIntimacy),
    practicalHelp: score(assessment.practicalHelp),
    funRelaxation: score(assessment.funRelaxation)
  };

  return { patient: normPatient, assessment: normAssessment };
}

function computeSocialFitness({ assessment }) {
  const a = assessment && typeof assessment === "object" ? assessment : {};
  const keys = [
    "safetySecurity",
    "learningGrowth",
    "emotionalConfiding",
    "identityAffirmation",
    "romanticIntimacy",
    "practicalHelp",
    "funRelaxation"
  ];

  let total = 0;
  let answeredCount = 0;
  for (const k of keys) {
    const n = a[k];
    if (typeof n !== "number" || !Number.isFinite(n)) continue;
    answeredCount += 1;
    total += n;
  }
  const missingCount = keys.length - answeredCount;

  if (answeredCount === 0) {
    return { totalScore: null, interpretation: "", preventiveRisk: "", answeredCount, missingCount };
  }

  if (total >= 12) {
    return { totalScore: total, interpretation: "Excellent social health", preventiveRisk: "Protective", answeredCount, missingCount };
  }
  if (total >= 9) {
    return { totalScore: total, interpretation: "Good support", preventiveRisk: "Mild risk", answeredCount, missingCount };
  }
  if (total >= 6) {
    return {
      totalScore: total,
      interpretation: "Moderate social isolation",
      preventiveRisk: "Increased health risk",
      answeredCount,
      missingCount
    };
  }
  if (total >= 3) {
    return {
      totalScore: total,
      interpretation: "High social isolation",
      preventiveRisk: "High risk for depression, dementia",
      answeredCount,
      missingCount
    };
  }
  return {
    totalScore: total,
    interpretation: "Severe social disconnection",
    preventiveRisk: "Very high health risk",
    answeredCount,
    missingCount
  };
}

function normalizeHeartHealthScoreIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const patient = b.patient && typeof b.patient === "object" ? b.patient : {};
  const assessment = b.assessment && typeof b.assessment === "object" ? b.assessment : b;
  const lifestyle = assessment?.lifestyle && typeof assessment.lifestyle === "object" ? assessment.lifestyle : {};
  const biomarkers = assessment?.biomarkers && typeof assessment.biomarkers === "object" ? assessment.biomarkers : {};
  const ecg = assessment?.ecg && typeof assessment.ecg === "object" ? assessment.ecg : {};
  const echo = assessment?.echo && typeof assessment.echo === "object" ? assessment.echo : {};
  const vascular = assessment?.vascular && typeof assessment.vascular === "object" ? assessment.vascular : {};

  const sex =
    typeof patient.sex === "string"
      ? patient.sex.trim().toLowerCase()
      : typeof assessment.sex === "string"
        ? assessment.sex.trim().toLowerCase()
        : "";
  const age = parseOptionalIntegerLoose(patient.age ?? assessment.age);

  const normPatient = {
    name: typeof patient.name === "string" ? patient.name.trim() : "",
    sex: sex === "male" || sex === "female" ? sex : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };

  const yesNo = (v) => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (!s) return "";
    if (s === "yes" || s === "y" || s === "true" || s === "1") return "yes";
    if (s === "no" || s === "n" || s === "false" || s === "0") return "no";
    return "";
  };

  const severity = (v, allowed) => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    return allowed.includes(s) ? s : "";
  };

  const n = (v) => parseOptionalNumberLoose(v);

  const normAssessment = {
    lifestyle: {
      smoking: yesNo(lifestyle.smoking),
      bmi: n(lifestyle.bmi),
      weeklyPhysicalActivityMin: n(lifestyle.weeklyPhysicalActivityMin),
      diabetes: yesNo(lifestyle.diabetes),
      hba1c: n(lifestyle.hba1c),
      sleepApneaUntreated: yesNo(lifestyle.sleepApneaUntreated),
      fattyLiver: yesNo(lifestyle.fattyLiver),
      systolicBp: n(lifestyle.systolicBp),
      diastolicBp: n(lifestyle.diastolicBp),
      depressionAnxietySeverity: severity(lifestyle.depressionAnxietySeverity, ["none", "mild", "moderate", "severe"]),
      socialHealthSeverity: severity(lifestyle.socialHealthSeverity, ["good", "mild", "moderate", "severe"])
    },
    biomarkers: {
      ldl: n(biomarkers.ldl),
      nonHdl: n(biomarkers.nonHdl),
      apoB: n(biomarkers.apoB),
      lpa: n(biomarkers.lpa),
      triglycerides: n(biomarkers.triglycerides),
      hsCrp: n(biomarkers.hsCrp),
      uricAcid: n(biomarkers.uricAcid)
    },
    ecg: {
      atrialFibrillation: yesNo(ecg.atrialFibrillation),
      lvh: yesNo(ecg.lvh),
      stDepressionOrTInversion: yesNo(ecg.stDepressionOrTInversion),
      qtProlongation: yesNo(ecg.qtProlongation),
      bundleBranchBlock: yesNo(ecg.bundleBranchBlock),
      pathologicalQWaves: yesNo(ecg.pathologicalQWaves)
    },
    echo: {
      lvHypertrophy: yesNo(echo.lvHypertrophy),
      ef: n(echo.ef),
      leftAtrialEnlargement: yesNo(echo.leftAtrialEnlargement),
      diastolicDysfunctionGrade: n(echo.diastolicDysfunctionGrade),
      pulmonaryPressure: n(echo.pulmonaryPressure),
      wallMotionAbnormality: yesNo(echo.wallMotionAbnormality)
    },
    vascular: {
      cacScore: n(vascular.cacScore),
      carotidPlaque: yesNo(vascular.carotidPlaque),
      abi: n(vascular.abi)
    }
  };

  return { patient: normPatient, assessment: normAssessment };
}

function computeHeartHealthScore({ assessment }) {
  const a = assessment && typeof assessment === "object" ? assessment : {};
  const lifestyle = a?.lifestyle && typeof a.lifestyle === "object" ? a.lifestyle : {};
  const biomarkers = a?.biomarkers && typeof a.biomarkers === "object" ? a.biomarkers : {};
  const ecg = a?.ecg && typeof a.ecg === "object" ? a.ecg : {};
  const echo = a?.echo && typeof a.echo === "object" ? a.echo : {};
  const vascular = a?.vascular && typeof a.vascular === "object" ? a.vascular : {};

  const deductions = [];
  const add = (key, label, points, active) => {
    if (!active) return;
    deductions.push({ key, label, points });
  };

  const yes = (v) => v === "yes";
  const bmi = Number.isFinite(lifestyle.bmi) ? lifestyle.bmi : null;
  const weeklyActivity = Number.isFinite(lifestyle.weeklyPhysicalActivityMin) ? lifestyle.weeklyPhysicalActivityMin : null;
  const hba1c = Number.isFinite(lifestyle.hba1c) ? lifestyle.hba1c : null;
  const sbp = Number.isFinite(lifestyle.systolicBp) ? lifestyle.systolicBp : null;
  const dbp = Number.isFinite(lifestyle.diastolicBp) ? lifestyle.diastolicBp : null;
  const pulsePressure = Number.isFinite(sbp) && Number.isFinite(dbp) ? sbp - dbp : null;

  add("smoking", "Smoking", 8, yes(lifestyle.smoking));
  add("bmi", "BMI ≥ 30", 5, Number.isFinite(bmi) && bmi >= 30);
  add("physical_inactivity", "Physical inactivity (<150 min/week)", 4, Number.isFinite(weeklyActivity) && weeklyActivity < 150);
  add(
    "diabetes",
    "Diabetes / HbA1c ≥ 6.5",
    5,
    yes(lifestyle.diabetes) || (Number.isFinite(hba1c) && hba1c >= 6.5)
  );
  add("sleep_apnea", "Sleep apnea (untreated)", 3, yes(lifestyle.sleepApneaUntreated));
  add("fatty_liver", "Fatty liver", 3, yes(lifestyle.fattyLiver));
  add("hypertension", "Hypertension (>140/90)", 4, (Number.isFinite(sbp) && sbp > 140) || (Number.isFinite(dbp) && dbp > 90));

  add("depression_mild", "Depression/Anxiety (mild)", 1, lifestyle.depressionAnxietySeverity === "mild");
  add("depression_moderate", "Depression/Anxiety (moderate)", 2, lifestyle.depressionAnxietySeverity === "moderate");
  add("depression_severe", "Depression/Anxiety (severe)", 3, lifestyle.depressionAnxietySeverity === "severe");

  add("social_mild", "Social health (mild)", 1, lifestyle.socialHealthSeverity === "mild");
  add("social_moderate", "Social health (moderate)", 2, lifestyle.socialHealthSeverity === "moderate");
  add("social_severe", "Social health (severe)", 3, lifestyle.socialHealthSeverity === "severe");

  const ldl = Number.isFinite(biomarkers.ldl) ? biomarkers.ldl : null;
  const nonHdl = Number.isFinite(biomarkers.nonHdl) ? biomarkers.nonHdl : null;
  const apoB = Number.isFinite(biomarkers.apoB) ? biomarkers.apoB : null;
  const lpa = Number.isFinite(biomarkers.lpa) ? biomarkers.lpa : null;
  const tg = Number.isFinite(biomarkers.triglycerides) ? biomarkers.triglycerides : null;
  const hsCrp = Number.isFinite(biomarkers.hsCrp) ? biomarkers.hsCrp : null;
  const uric = Number.isFinite(biomarkers.uricAcid) ? biomarkers.uricAcid : null;

  add("ldl", "LDL ≥ 160", 4, Number.isFinite(ldl) && ldl >= 160);
  add("non_hdl", "Non-HDL ≥ 190", 3, Number.isFinite(nonHdl) && nonHdl >= 190);
  add("apob", "ApoB ≥ 100", 4, Number.isFinite(apoB) && apoB >= 100);
  add("lpa", "Lp(a) ≥ 50 mg/dL", 3, Number.isFinite(lpa) && lpa >= 50);
  add("triglycerides", "Triglycerides ≥ 200", 2, Number.isFinite(tg) && tg >= 200);
  add("hscrp", "hs-CRP ≥ 3", 2, Number.isFinite(hsCrp) && hsCrp >= 3);
  add("uric_acid", "Uric acid > 8", 2, Number.isFinite(uric) && uric > 8);

  add("ecg_af", "ECG: Atrial fibrillation", 3, yes(ecg.atrialFibrillation));
  add("ecg_lvh", "ECG: LVH", 2, yes(ecg.lvh));
  add("ecg_stt", "ECG: ST depression / T inversion", 2, yes(ecg.stDepressionOrTInversion));
  add("ecg_qt", "ECG: QT prolongation", 1, yes(ecg.qtProlongation));
  add("ecg_bbb", "ECG: Bundle branch block", 1, yes(ecg.bundleBranchBlock));
  add("ecg_qwaves", "ECG: Pathological Q waves", 1, yes(ecg.pathologicalQWaves));

  const ef = Number.isFinite(echo.ef) ? echo.ef : null;
  const diaGrade = Number.isFinite(echo.diastolicDysfunctionGrade) ? echo.diastolicDysfunctionGrade : null;
  const pap = Number.isFinite(echo.pulmonaryPressure) ? echo.pulmonaryPressure : null;

  add("echo_lvh", "Echo: LV hypertrophy", 4, yes(echo.lvHypertrophy));
  add("echo_ef", "Echo: EF < 50%", 4, Number.isFinite(ef) && ef < 50);
  add("echo_la", "Echo: Left atrial enlargement", 3, yes(echo.leftAtrialEnlargement));
  add("echo_diastolic", "Echo: Diastolic dysfunction grade ≥ 2", 3, Number.isFinite(diaGrade) && diaGrade >= 2);
  add("echo_pap", "Echo: Pulmonary pressure > 35 mmHg", 3, Number.isFinite(pap) && pap > 35);
  add("echo_wma", "Echo: Wall motion abnormality", 3, yes(echo.wallMotionAbnormality));

  const cac = Number.isFinite(vascular.cacScore) ? vascular.cacScore : null;
  const abi = Number.isFinite(vascular.abi) ? vascular.abi : null;
  add("cac_1_99", "CAC 1–99", 3, Number.isFinite(cac) && cac >= 1 && cac <= 99);
  add("cac_100_299", "CAC 100–299", 6, Number.isFinite(cac) && cac >= 100 && cac <= 299);
  add("cac_300", "CAC ≥ 300", 10, Number.isFinite(cac) && cac >= 300);
  add("carotid_plaque", "Carotid plaque", 5, yes(vascular.carotidPlaque));
  add("abi", "ABI < 0.9", 4, Number.isFinite(abi) && abi < 0.9);
  add("pulse_pressure", "Wide pulse pressure (>60)", 3, Number.isFinite(pulsePressure) && pulsePressure > 60);

  const totalDeduction = deductions.reduce((sum, d) => sum + (Number.isFinite(d?.points) ? d.points : 0), 0);
  const score = Math.max(0, Math.min(100, 100 - totalDeduction));
  const meaning = score >= 80 ? "excellent" : score >= 60 ? "mild risk" : score >= 40 ? "moderate risk" : score >= 20 ? "high risk" : "very high risk";

  return {
    score,
    totalDeduction,
    meaning,
    pulsePressure: Number.isFinite(pulsePressure) ? pulsePressure : null,
    deductions
  };
}

function normalizeBrainHealthPart1Incoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const patient = b.patient && typeof b.patient === "object" ? b.patient : {};
  const assessment = b.assessment && typeof b.assessment === "object" ? b.assessment : b;

  const yesNo = (v) => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (!s) return "";
    if (s === "yes" || s === "y" || s === "true" || s === "1") return "yes";
    if (s === "no" || s === "n" || s === "false" || s === "0") return "no";
    return "";
  };

  const sex =
    typeof patient.sex === "string"
      ? patient.sex.trim().toLowerCase()
      : typeof assessment.sex === "string"
        ? assessment.sex.trim().toLowerCase()
        : "";
  const age = parseOptionalIntegerLoose(patient.age ?? assessment.age);

  const normPatient = {
    name: typeof patient.name === "string" ? patient.name.trim() : "",
    sex: sex === "male" || sex === "female" ? sex : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };

  const fsrs = assessment?.fsrs && typeof assessment.fsrs === "object" ? assessment.fsrs : {};
  const caide = assessment?.caide && typeof assessment.caide === "object" ? assessment.caide : {};
  const risk = assessment?.brainHealthRiskScore && typeof assessment.brainHealthRiskScore === "object" ? assessment.brainHealthRiskScore : {};
  const libra = assessment?.libra && typeof assessment.libra === "object" ? assessment.libra : {};
  const part1 = assessment?.part1 && typeof assessment.part1 === "object" ? assessment.part1 : {};

  const n = (v) => parseOptionalNumberLoose(v);
  const points03 = (v) => {
    const num = parseOptionalIntegerLoose(v);
    if (!Number.isFinite(num)) return null;
    const clamped = Math.max(0, Math.min(3, Math.trunc(num)));
    return clamped;
  };

  const structuralDamage = part1?.structuralDamage && typeof part1.structuralDamage === "object" ? part1.structuralDamage : {};
  const brainReserve = part1?.brainReserve && typeof part1.brainReserve === "object" ? part1.brainReserve : {};

  const normAssessment = {
    fsrs: {
      sbp: n(fsrs.sbp),
      antihypertensiveTreatment: yesNo(fsrs.antihypertensiveTreatment),
      diabetes: yesNo(fsrs.diabetes),
      smoker: yesNo(fsrs.smoker),
      priorCvd: yesNo(fsrs.priorCvd),
      atrialFibrillation: yesNo(fsrs.atrialFibrillation),
      lvhOnEcg: yesNo(fsrs.lvhOnEcg)
    },
    caide: {
      educationYears: n(caide.educationYears),
      sbp: n(caide.sbp),
      bmi: n(caide.bmi),
      totalCholesterolMgDl: n(caide.totalCholesterolMgDl),
      totalCholesterolMmolL: n(caide.totalCholesterolMmolL),
      physicallyActive: yesNo(caide.physicallyActive),
      apoeE4Carrier: yesNo(caide.apoeE4Carrier)
    },
    brainHealthRiskScore: {
      vascular: {
        hypertension: yesNo(risk?.vascular?.hypertension),
        diabetesOrHbA1cHigh: yesNo(risk?.vascular?.diabetesOrHbA1cHigh),
        ldlHigh: yesNo(risk?.vascular?.ldlHigh),
        smoking: yesNo(risk?.vascular?.smoking),
        carotidPlaqueOrCimtHigh: yesNo(risk?.vascular?.carotidPlaqueOrCimtHigh)
      },
      metabolic: {
        bmiGt30: yesNo(risk?.metabolic?.bmiGt30),
        insulinResistance: yesNo(risk?.metabolic?.insulinResistance),
        triglyceridesHigh: yesNo(risk?.metabolic?.triglyceridesHigh),
        lowHdl: yesNo(risk?.metabolic?.lowHdl),
        fattyLiver: yesNo(risk?.metabolic?.fattyLiver),
        hsCrpHigh: yesNo(risk?.metabolic?.hsCrpHigh)
      },
      imaging: {
        whiteMatterHyperintensities: yesNo(risk?.imaging?.whiteMatterHyperintensities),
        silentInfarcts: yesNo(risk?.imaging?.silentInfarcts),
        brainAtrophy: yesNo(risk?.imaging?.brainAtrophy)
      },
      lifestyle: {
        physicalInactivity: yesNo(risk?.lifestyle?.physicalInactivity),
        poorDiet: yesNo(risk?.lifestyle?.poorDiet),
        alcoholExcess: yesNo(risk?.lifestyle?.alcoholExcess),
        smoking: yesNo(risk?.lifestyle?.smoking),
        lowCognitiveStimulation: yesNo(risk?.lifestyle?.lowCognitiveStimulation)
      },
      sleep: {
        stopBangHigh: yesNo(risk?.sleep?.stopBangHigh),
        sleepDurationLt6h: yesNo(risk?.sleep?.sleepDurationLt6h),
        chronicInsomnia: yesNo(risk?.sleep?.chronicInsomnia)
      },
      nutritional: {
        vitaminB12Deficiency: yesNo(risk?.nutritional?.vitaminB12Deficiency),
        vitaminDDeficiency: yesNo(risk?.nutritional?.vitaminDDeficiency),
        homocysteineGt15: yesNo(risk?.nutritional?.homocysteineGt15)
      },
      autonomic: {
        lowHrv: yesNo(risk?.autonomic?.lowHrv),
        orthostaticHypotension: yesNo(risk?.autonomic?.orthostaticHypotension),
        hyposmia: yesNo(risk?.autonomic?.hyposmia)
      }
    },
    libra: {
      depression: yesNo(libra.depression),
      diabetes: yesNo(libra.diabetes),
      hypertensionMidlife: yesNo(libra.hypertensionMidlife),
      obesityBmiGt30: yesNo(libra.obesityBmiGt30),
      hypercholesterolemia: yesNo(libra.hypercholesterolemia),
      currentSmoking: yesNo(libra.currentSmoking),
      lowSocialActivity: yesNo(libra.lowSocialActivity),
      highPhysicalActivity: yesNo(libra.highPhysicalActivity),
      moderateAlcoholUse: yesNo(libra.moderateAlcoholUse),
      highCognitiveActivity: yesNo(libra.highCognitiveActivity),
      healthyDiet: yesNo(libra.healthyDiet),
      chdCvd: yesNo(libra.chdCvd)
    },
    part1: {
      brainAgingYears: n(part1.brainAgingYears),
      omega3Index: typeof part1.omega3Index === "string" ? part1.omega3Index.trim().toLowerCase() : "",
      brainReserve: {
        education: yesNo(brainReserve.education),
        cognitiveActivity: yesNo(brainReserve.cognitiveActivity),
        bilingualism: yesNo(brainReserve.bilingualism),
        socialInteraction: yesNo(brainReserve.socialInteraction)
      },
      structuralDamage: {
        whiteMatterDiseasePoints: points03(structuralDamage.whiteMatterDiseasePoints),
        silentInfarctsPoints: points03(structuralDamage.silentInfarctsPoints),
        brainAtrophyPoints: points03(structuralDamage.brainAtrophyPoints),
        microbleedsPoints: points03(structuralDamage.microbleedsPoints),
        arterialStenosisPoints: points03(structuralDamage.arterialStenosisPoints)
      }
    }
  };

  return { patient: normPatient, assessment: normAssessment };
}

function computeBrainHealthRiskScoreFromFlags(brainHealthRiskScore) {
  const root = brainHealthRiskScore && typeof brainHealthRiskScore === "object" ? brainHealthRiskScore : {};
  const yes = (v) => v === "yes";
  const total =
    (yes(root?.vascular?.hypertension) ? 5 : 0) +
    (yes(root?.vascular?.diabetesOrHbA1cHigh) ? 5 : 0) +
    (yes(root?.vascular?.ldlHigh) ? 3 : 0) +
    (yes(root?.vascular?.smoking) ? 5 : 0) +
    (yes(root?.vascular?.carotidPlaqueOrCimtHigh) ? 7 : 0) +
    (yes(root?.metabolic?.bmiGt30) ? 3 : 0) +
    (yes(root?.metabolic?.insulinResistance) ? 5 : 0) +
    (yes(root?.metabolic?.triglyceridesHigh) ? 3 : 0) +
    (yes(root?.metabolic?.lowHdl) ? 3 : 0) +
    (yes(root?.metabolic?.fattyLiver) ? 3 : 0) +
    (yes(root?.metabolic?.hsCrpHigh) ? 3 : 0) +
    (yes(root?.imaging?.whiteMatterHyperintensities) ? 5 : 0) +
    (yes(root?.imaging?.silentInfarcts) ? 5 : 0) +
    (yes(root?.imaging?.brainAtrophy) ? 5 : 0) +
    (yes(root?.lifestyle?.physicalInactivity) ? 4 : 0) +
    (yes(root?.lifestyle?.poorDiet) ? 3 : 0) +
    (yes(root?.lifestyle?.alcoholExcess) ? 3 : 0) +
    (yes(root?.lifestyle?.smoking) ? 3 : 0) +
    (yes(root?.lifestyle?.lowCognitiveStimulation) ? 2 : 0) +
    (yes(root?.sleep?.stopBangHigh) ? 5 : 0) +
    (yes(root?.sleep?.sleepDurationLt6h) ? 3 : 0) +
    (yes(root?.sleep?.chronicInsomnia) ? 2 : 0) +
    (yes(root?.nutritional?.vitaminB12Deficiency) ? 3 : 0) +
    (yes(root?.nutritional?.vitaminDDeficiency) ? 3 : 0) +
    (yes(root?.nutritional?.homocysteineGt15) ? 4 : 0) +
    (yes(root?.autonomic?.lowHrv) ? 2 : 0) +
    (yes(root?.autonomic?.orthostaticHypotension) ? 2 : 0) +
    (yes(root?.autonomic?.hyposmia) ? 1 : 0);

  const category = total <= 20 ? "Low risk" : total <= 40 ? "Moderate risk" : total <= 60 ? "High risk" : "Very high risk";
  return { score: total, category };
}

function computeBrainHealthScoreMeaning(score) {
  if (!Number.isFinite(score)) return "";
  if (score >= 85) return "Excellent brain health";
  if (score >= 70) return "Mild risk";
  if (score >= 55) return "Moderate risk";
  if (score >= 40) return "High risk";
  return "Very high risk";
}

function computeFsrs({ sex, age, sbp, treated, diabetes, smoker, priorCvd, afib, lvh }) {
  const s = typeof sex === "string" ? sex.trim().toLowerCase() : "";
  if (s !== "male" && s !== "female") return { points: null, risk10y: "" };
  if (!Number.isFinite(age)) return { points: null, risk10y: "" };
  if (!Number.isFinite(sbp)) return { points: null, risk10y: "" };

  const agePoints = (() => {
    if (age < 54) return null;
    if (age <= 56) return 0;
    if (age <= 59) return 1;
    if (age <= 62) return 2;
    if (age <= 65) return 3;
    if (age <= 68) return 4;
    if (age <= 71) return 5;
    if (age <= 74) return 6;
    if (age <= 77) return 7;
    if (age <= 80) return 8;
    if (age <= 83) return 9;
    if (age <= 86) return 10;
    return null;
  })();
  if (agePoints == null) return { points: null, risk10y: "" };

  const sbpBinsMen = [
    { min: 95, max: 105, untreated: 0, treated: 2 },
    { min: 106, max: 115, untreated: 1, treated: 3 },
    { min: 116, max: 125, untreated: 1, treated: 4 },
    { min: 126, max: 135, untreated: 2, treated: 5 },
    { min: 136, max: 145, untreated: 3, treated: 6 },
    { min: 146, max: 155, untreated: 4, treated: 7 },
    { min: 156, max: 165, untreated: 5, treated: 8 },
    { min: 166, max: 175, untreated: 6, treated: 9 },
    { min: 176, max: 185, untreated: 7, treated: 10 },
    { min: 186, max: 195, untreated: 8, treated: 11 },
    { min: 196, max: 205, untreated: 9, treated: 12 }
  ];
  const sbpBinsWomen = [
    { min: 95, max: 105, untreated: 0, treated: 3 },
    { min: 106, max: 115, untreated: 1, treated: 4 },
    { min: 116, max: 125, untreated: 2, treated: 5 },
    { min: 126, max: 135, untreated: 3, treated: 6 },
    { min: 136, max: 145, untreated: 4, treated: 7 },
    { min: 146, max: 155, untreated: 5, treated: 8 },
    { min: 156, max: 165, untreated: 6, treated: 9 },
    { min: 166, max: 175, untreated: 7, treated: 10 },
    { min: 176, max: 185, untreated: 8, treated: 11 },
    { min: 186, max: 195, untreated: 9, treated: 12 },
    { min: 196, max: 205, untreated: 10, treated: 13 }
  ];

  const binList = s === "male" ? sbpBinsMen : sbpBinsWomen;
  const bin = binList.find((b) => sbp >= b.min && sbp <= b.max) ?? (sbp < binList[0].min ? binList[0] : binList[binList.length - 1]);
  const sbpPoints = treated ? bin.treated : bin.untreated;

  const otherPoints =
    (diabetes ? (s === "male" ? 2 : 3) : 0) +
    (smoker ? 3 : 0) +
    (priorCvd ? (s === "male" ? 3 : 2) : 0) +
    (afib ? (s === "male" ? 4 : 6) : 0) +
    (lvh ? (s === "male" ? 3 : 4) : 0);

  const total = agePoints + sbpPoints + otherPoints;

  const riskTableMen = new Map([
    [1, "3%"],
    [2, "3%"],
    [3, "4%"],
    [4, "4%"],
    [5, "5%"],
    [6, "5%"],
    [7, "6%"],
    [8, "7%"],
    [9, "8%"],
    [10, "10%"],
    [11, "11%"],
    [12, "13%"],
    [13, "15%"],
    [14, "17%"],
    [15, "20%"],
    [16, "22%"],
    [17, "26%"],
    [18, "29%"],
    [19, "33%"],
    [20, "37%"],
    [21, "42%"],
    [22, "47%"],
    [23, "52%"],
    [24, "57%"],
    [25, "63%"]
  ]);
  const riskTableWomen = new Map([
    [1, "1%"],
    [2, "1%"],
    [3, "2%"],
    [4, "2%"],
    [5, "2%"],
    [6, "3%"],
    [7, "4%"],
    [8, "4%"],
    [9, "5%"],
    [10, "6%"],
    [11, "8%"],
    [12, "9%"],
    [13, "11%"],
    [14, "13%"],
    [15, "16%"],
    [16, "19%"],
    [17, "23%"],
    [18, "27%"],
    [19, "32%"],
    [20, "37%"],
    [21, "43%"],
    [22, "50%"],
    [23, "57%"]
  ]);

  const table = s === "male" ? riskTableMen : riskTableWomen;
  const risk = table.get(total) ?? (s === "male" ? (total >= 26 ? ">63%" : "") : total >= 24 ? ">57%" : "");

  return { points: total, risk10y: risk };
}

function computeCaide({ age, sex, educationYears, sbp, bmi, cholMgDl, cholMmolL, physicallyActive, apoeCarrier }) {
  if (!Number.isFinite(age)) return { score: null, risk20y: "", table: "" };
  const s = typeof sex === "string" ? sex.trim().toLowerCase() : "";
  if (s !== "male" && s !== "female") return { score: null, risk20y: "", table: "" };

  const agePts = age < 47 ? 0 : age <= 53 ? 3 : 4;
  const eduPts = Number.isFinite(educationYears) ? (educationYears > 10 ? 0 : educationYears >= 7 ? 2 : 3) : null;
  if (eduPts == null) return { score: null, risk20y: "", table: "" };

  const sbpPts = Number.isFinite(sbp) ? (sbp > 140 ? 2 : 0) : null;
  const bmiPts = Number.isFinite(bmi) ? (bmi > 30 ? 2 : 0) : null;
  if (sbpPts == null || bmiPts == null) return { score: null, risk20y: "", table: "" };

  const cholFromMg = Number.isFinite(cholMgDl) ? cholMgDl : null;
  const cholFromMmol = Number.isFinite(cholMmolL) ? cholMmolL * 38.67 : null;
  const chol = cholFromMg ?? cholFromMmol;
  const cholPts = Number.isFinite(chol) ? (chol > 251 ? 2 : 0) : null;
  if (cholPts == null) return { score: null, risk20y: "", table: "" };

  const activity = physicallyActive === "yes" ? 0 : physicallyActive === "no" ? 1 : null;
  if (activity == null) return { score: null, risk20y: "", table: "" };

  const sexPts = s === "male" ? 1 : 0;
  const apoePts = apoeCarrier === "yes" ? 2 : apoeCarrier === "no" ? 0 : null;

  const base = agePts + eduPts + sexPts + sbpPts + bmiPts + cholPts + activity;
  const useApoeTable = apoePts != null;
  const total = useApoeTable ? base + apoePts : base;

  const riskWithout = (score) => {
    if (score <= 5) return "1% (Low)";
    if (score <= 7) return "3% (Moderate)";
    if (score <= 9) return "4% (Moderate)";
    if (score <= 11) return "7% (High)";
    return "16% (Very High)";
  };
  const riskWith = (score) => {
    if (score <= 5) return "1% (Low)";
    if (score <= 7) return "2% (Low-Moderate)";
    if (score <= 9) return "4% (Moderate)";
    if (score <= 11) return "6% (Moderate-High)";
    if (score <= 13) return "10% (High)";
    return "18% (Very High)";
  };

  return { score: total, risk20y: useApoeTable ? riskWith(total) : riskWithout(total), table: useApoeTable ? "with_apoe" : "without_apoe" };
}

function computeLibra(state) {
  const yes = (v) => v === "yes";
  const highPhysical = yes(state?.highPhysicalActivity);
  const score =
    (yes(state?.depression) ? 2.1 : 0) +
    (yes(state?.diabetes) ? 1.3 : 0) +
    (yes(state?.hypertensionMidlife) ? 1.6 : 0) +
    (yes(state?.obesityBmiGt30) ? 1.6 : 0) +
    (yes(state?.hypercholesterolemia) ? 1.4 : 0) +
    (yes(state?.currentSmoking) ? 1.5 : 0) +
    (yes(state?.lowSocialActivity) ? 1.0 : 0) +
    (yes(state?.chdCvd) ? 1.0 : 0) +
    (highPhysical ? -1.1 : 1.1) +
    (yes(state?.moderateAlcoholUse) ? -0.9 : 0) +
    (yes(state?.highCognitiveActivity) ? -1.0 : 0) +
    (yes(state?.healthyDiet) ? -1.2 : 0);
  return { score: Number.isFinite(score) ? score.toFixed(1) : "" };
}

function computeStructuralDamage(structuralDamage) {
  const sd = structuralDamage && typeof structuralDamage === "object" ? structuralDamage : {};
  const values = [
    sd.whiteMatterDiseasePoints,
    sd.silentInfarctsPoints,
    sd.brainAtrophyPoints,
    sd.microbleedsPoints,
    sd.arterialStenosisPoints
  ];
  const nums = values.map((v) => (Number.isFinite(v) ? v : null));
  const hasAny = nums.some((v) => v != null);
  if (!hasAny) return { total: null, meaning: "", breakdown: [] };

  const safe = nums.map((v) => (v == null ? 0 : Math.max(0, Math.min(3, Math.trunc(v)))));
  const total = safe.reduce((sum, x) => sum + x, 0);
  const meaning = total <= 4 ? "Excellent" : total <= 8 ? "Early vascular ageing" : total <= 14 ? "Moderate brain damage" : "Severe disease";
  const breakdown = [
    { marker: "White matter disease", points: safe[0] },
    { marker: "Silent infarcts", points: safe[1] },
    { marker: "Brain atrophy", points: safe[2] },
    { marker: "Microbleeds", points: safe[3] },
    { marker: "Arterial stenosis", points: safe[4] }
  ];
  return { total, meaning, breakdown };
}

function computeBrainLifestyle({ fsrs, brainHealthRiskScore, libra }) {
  const bp = (() => {
    let points = 10;
    if (brainHealthRiskScore?.vascular?.hypertension === "yes") points -= 6;
    const sbp = Number.isFinite(fsrs?.sbp) ? fsrs.sbp : null;
    if (Number.isFinite(sbp)) {
      if (sbp >= 140) points -= 4;
      else if (sbp >= 130) points -= 2;
    }
    return Math.max(0, Math.min(10, points));
  })();

  const metabolic = (() => {
    let points = 10;
    if (brainHealthRiskScore?.metabolic?.bmiGt30 === "yes") points -= 2;
    if (brainHealthRiskScore?.metabolic?.insulinResistance === "yes") points -= 2;
    if (brainHealthRiskScore?.metabolic?.triglyceridesHigh === "yes") points -= 1;
    if (brainHealthRiskScore?.metabolic?.lowHdl === "yes") points -= 1;
    if (brainHealthRiskScore?.metabolic?.fattyLiver === "yes") points -= 1;
    if (brainHealthRiskScore?.metabolic?.hsCrpHigh === "yes") points -= 1;
    return Math.max(0, Math.min(10, points));
  })();

  const lifestyle = (() => {
    let points = 10;
    if (brainHealthRiskScore?.lifestyle?.physicalInactivity === "yes") points -= 2;
    if (brainHealthRiskScore?.lifestyle?.poorDiet === "yes") points -= 2;
    if (brainHealthRiskScore?.lifestyle?.alcoholExcess === "yes") points -= 2;
    if (brainHealthRiskScore?.lifestyle?.smoking === "yes") points -= 2;
    if (brainHealthRiskScore?.lifestyle?.lowCognitiveStimulation === "yes") points -= 2;
    return Math.max(0, Math.min(10, points));
  })();

  const sleep = (() => {
    let points = 5;
    if (brainHealthRiskScore?.sleep?.stopBangHigh === "yes") points -= 2;
    if (brainHealthRiskScore?.sleep?.sleepDurationLt6h === "yes") points -= 2;
    if (brainHealthRiskScore?.sleep?.chronicInsomnia === "yes") points -= 1;
    return Math.max(0, Math.min(5, points));
  })();

  const psychosocial = (() => {
    let points = 5;
    if (libra?.depression === "yes") points -= 3;
    if (libra?.lowSocialActivity === "yes") points -= 2;
    return Math.max(0, Math.min(5, points));
  })();

  const total = bp + metabolic + lifestyle + sleep + psychosocial;
  return {
    total,
    domains: [
      { key: "blood_pressure", label: "Blood pressure", points: bp, max: 10 },
      { key: "metabolic", label: "Metabolic health", points: metabolic, max: 10 },
      { key: "lifestyle", label: "Lifestyle", points: lifestyle, max: 10 },
      { key: "sleep", label: "Sleep", points: sleep, max: 5 },
      { key: "psychosocial", label: "Psychosocial", points: psychosocial, max: 5 }
    ]
  };
}

function computeBrainReserve(brainReserve) {
  const br = brainReserve && typeof brainReserve === "object" ? brainReserve : {};
  const yes = (v) => v === "yes";
  const score = (yes(br.education) ? 1 : 0) + (yes(br.cognitiveActivity) ? 1 : 0) + (yes(br.bilingualism) ? 1 : 0) + (yes(br.socialInteraction) ? 1 : 0);
  const category = score >= 3 ? "High" : score === 2 ? "Moderate" : "Low";
  return { score, category };
}

function computeBrainHealthPart1({ patient, assessment }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const a = assessment && typeof assessment === "object" ? assessment : {};

  const risk = computeBrainHealthRiskScoreFromFlags(a.brainHealthRiskScore);
  const brainHealthScore = Number.isFinite(risk.score) ? Math.max(0, Math.min(100, 100 - risk.score)) : null;
  const brainHealthMeaning = computeBrainHealthScoreMeaning(brainHealthScore);

  const fsrsInputs = {
    sex: p.sex,
    age: p.age,
    sbp: a?.fsrs?.sbp,
    treated: a?.fsrs?.antihypertensiveTreatment === "yes",
    diabetes: a?.fsrs?.diabetes === "yes",
    smoker: a?.fsrs?.smoker === "yes",
    priorCvd: a?.fsrs?.priorCvd === "yes",
    afib: a?.fsrs?.atrialFibrillation === "yes",
    lvh: a?.fsrs?.lvhOnEcg === "yes"
  };
  const fsrsComputed = computeFsrs(fsrsInputs);
  const average = computeFsrs({ sex: p.sex, age: p.age, sbp: 125, treated: false, diabetes: false, smoker: false, priorCvd: false, afib: false, lvh: false });
  const optimal = computeFsrs({ sex: p.sex, age: p.age, sbp: 110, treated: false, diabetes: false, smoker: false, priorCvd: false, afib: false, lvh: false });

  const caideComputed = computeCaide({
    age: p.age,
    sex: p.sex,
    educationYears: a?.caide?.educationYears,
    sbp: a?.caide?.sbp,
    bmi: a?.caide?.bmi,
    cholMgDl: a?.caide?.totalCholesterolMgDl,
    cholMmolL: a?.caide?.totalCholesterolMmolL,
    physicallyActive: a?.caide?.physicallyActive,
    apoeCarrier: a?.caide?.apoeE4Carrier
  });
  const libraComputed = computeLibra(a.libra);
  const structuralDamage = computeStructuralDamage(a?.part1?.structuralDamage);
  const brainLifestyle = computeBrainLifestyle({ fsrs: a.fsrs, brainHealthRiskScore: a.brainHealthRiskScore, libra: a.libra });
  const brainReserve = computeBrainReserve(a?.part1?.brainReserve);

  const omega3 = a?.part1?.omega3Index === "optimal" ? "optimal" : a?.part1?.omega3Index === "borderline" ? "borderline" : a?.part1?.omega3Index === "low" ? "low" : "";
  const neuroMetabolic = {
    homocysteine: a?.brainHealthRiskScore?.nutritional?.homocysteineGt15 === "yes" ? "high" : a?.brainHealthRiskScore?.nutritional?.homocysteineGt15 === "no" ? "normal" : "",
    b12: a?.brainHealthRiskScore?.nutritional?.vitaminB12Deficiency === "yes" ? "low" : a?.brainHealthRiskScore?.nutritional?.vitaminB12Deficiency === "no" ? "normal" : "",
    vitaminD: a?.brainHealthRiskScore?.nutritional?.vitaminDDeficiency === "yes" ? "low" : a?.brainHealthRiskScore?.nutritional?.vitaminDDeficiency === "no" ? "normal" : "",
    omega3
  };

  return {
    brainHealthScore,
    brainHealthMeaning,
    riskScore: risk.score,
    riskCategory: risk.category,
    brainAgingYears: Number.isFinite(a?.part1?.brainAgingYears) ? a.part1.brainAgingYears : null,
    stroke: {
      your10y: fsrsComputed?.risk10y ?? "",
      average10y: average?.risk10y ?? "",
      optimal10y: optimal?.risk10y ?? ""
    },
    dementia: {
      caideRisk20y: caideComputed?.risk20y ?? "",
      libraScore: libraComputed?.score ?? "",
      brainReserveScore: brainReserve.score,
      brainReserveCategory: brainReserve.category
    },
    structuralDamage,
    brainLifestyle,
    neuroMetabolic
  };
}

function normalizeBrainHealthPart2Incoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const patient = b.patient && typeof b.patient === "object" ? b.patient : {};
  const assessment = b.assessment && typeof b.assessment === "object" ? b.assessment : b;

  const yesNo = (v) => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (!s) return "";
    if (s === "yes" || s === "y" || s === "true" || s === "1") return "yes";
    if (s === "no" || s === "n" || s === "false" || s === "0") return "no";
    return "";
  };

  const sex =
    typeof patient.sex === "string"
      ? patient.sex.trim().toLowerCase()
      : typeof assessment.sex === "string"
        ? assessment.sex.trim().toLowerCase()
        : "";
  const age = parseOptionalIntegerLoose(patient.age ?? assessment.age);

  const normPatient = {
    name: typeof patient.name === "string" ? patient.name.trim() : "",
    sex: sex === "male" || sex === "female" ? sex : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };

  const fsrs = assessment?.fsrs && typeof assessment.fsrs === "object" ? assessment.fsrs : {};
  const risk = assessment?.brainHealthRiskScore && typeof assessment.brainHealthRiskScore === "object" ? assessment.brainHealthRiskScore : {};
  const part2 = assessment?.part2 && typeof assessment.part2 === "object" ? assessment.part2 : {};
  const mriDamage = part2?.mriDamage && typeof part2.mriDamage === "object" ? part2.mriDamage : {};
  const lifestyle = part2?.lifestyle && typeof part2.lifestyle === "object" ? part2.lifestyle : {};

  const n = (v) => parseOptionalNumberLoose(v);
  const moca = parseOptionalIntegerLoose(part2.mocaScore);

  const fazekas = (() => {
    const num = parseOptionalIntegerLoose(mriDamage.fazekasGrade);
    if (!Number.isFinite(num)) return null;
    const clamped = Math.max(0, Math.min(3, Math.trunc(num)));
    return clamped;
  })();

  const atrophySeverity = (() => {
    const s = typeof mriDamage.atrophySeverity === "string" ? mriDamage.atrophySeverity.trim().toLowerCase() : "";
    return s === "none" || s === "mild" || s === "moderate_severe" ? s : "";
  })();

  const silentInfarcts = (() => {
    const s = typeof mriDamage.silentInfarcts === "string" ? mriDamage.silentInfarcts.trim().toLowerCase() : "";
    return s === "none" || s === "single" || s === "multiple" ? s : "";
  })();

  const microbleeds = (() => {
    const s = typeof mriDamage.microbleeds === "string" ? mriDamage.microbleeds.trim().toLowerCase() : "";
    return s === "none" || s === "1-2" || s === "ge3" ? s : "";
  })();

  const dietQuality = (() => {
    const s = typeof lifestyle.dietQuality === "string" ? lifestyle.dietQuality.trim().toLowerCase() : "";
    return s === "poor" || s === "moderate" || s === "healthy" ? s : "";
  })();

  const cognitiveActivity = (() => {
    const s = typeof lifestyle.cognitiveActivity === "string" ? lifestyle.cognitiveActivity.trim().toLowerCase() : "";
    return s === "low" || s === "moderate" || s === "high" ? s : "";
  })();

  const normAssessment = {
    fsrs: {
      sbp: n(fsrs.sbp),
      antihypertensiveTreatment: yesNo(fsrs.antihypertensiveTreatment),
      diabetes: yesNo(fsrs.diabetes),
      smoker: yesNo(fsrs.smoker),
      priorCvd: yesNo(fsrs.priorCvd),
      atrialFibrillation: yesNo(fsrs.atrialFibrillation),
      lvhOnEcg: yesNo(fsrs.lvhOnEcg)
    },
    brainHealthRiskScore: {
      vascular: {
        hypertension: yesNo(risk?.vascular?.hypertension),
        diabetesOrHbA1cHigh: yesNo(risk?.vascular?.diabetesOrHbA1cHigh),
        ldlHigh: yesNo(risk?.vascular?.ldlHigh),
        smoking: yesNo(risk?.vascular?.smoking),
        carotidPlaqueOrCimtHigh: yesNo(risk?.vascular?.carotidPlaqueOrCimtHigh)
      },
      metabolic: {
        bmiGt30: yesNo(risk?.metabolic?.bmiGt30)
      },
      lifestyle: {
        smoking: yesNo(risk?.lifestyle?.smoking)
      }
    },
    part2: {
      mriDamage: {
        fazekasGrade: fazekas,
        atrophySeverity,
        silentInfarcts,
        microbleeds,
        intracranialDisease: yesNo(mriDamage.intracranialDisease)
      },
      lifestyle: {
        weeklyExerciseMin: n(lifestyle.weeklyExerciseMin),
        dietQuality,
        sleepHours: n(lifestyle.sleepHours),
        sleepApnea: yesNo(lifestyle.sleepApnea),
        cognitiveActivity,
        socialEngagement: yesNo(lifestyle.socialEngagement),
        noSmoking: yesNo(lifestyle.noSmoking)
      },
      mocaScore: Number.isFinite(moca) ? moca : null
    }
  };

  return { patient: normPatient, assessment: normAssessment };
}

function normalizeBrainHealthPart2ExtractPayload(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const mri = root?.mriDamage && typeof root.mriDamage === "object" ? root.mriDamage : {};

  const toString = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

  const fazekasGrade = (() => {
    const raw = toString(mri.fazekasGrade).toLowerCase();
    if (!raw) return "";
    if (raw === "0" || raw === "1" || raw === "2" || raw === "3") return raw;
    if (raw === "i") return "1";
    if (raw === "ii") return "2";
    if (raw === "iii") return "3";
    const n = parseOptionalIntegerLoose(raw);
    if (!Number.isFinite(n)) return "";
    const clamped = Math.max(0, Math.min(3, Math.trunc(n)));
    return String(clamped);
  })();

  const atrophySeverity = (() => {
    const raw = toString(mri.atrophySeverity).toLowerCase().replace(/\s+/g, "_");
    if (!raw) return "";
    if (raw === "none" || raw === "normal" || raw === "no" || raw === "absent") return "none";
    if (raw === "mild") return "mild";
    if (raw === "moderate_severe" || raw === "moderate-to-severe" || raw === "moderate-severe") return "moderate_severe";
    if (raw === "moderate" || raw === "severe" || raw.includes("moderate") || raw.includes("severe")) return "moderate_severe";
    return "";
  })();

  const silentInfarcts = (() => {
    const raw = toString(mri.silentInfarcts).toLowerCase();
    if (!raw) return "";
    if (raw === "none" || raw === "no" || raw === "absent" || raw === "nil") return "none";
    if (raw === "single" || raw === "one") return "single";
    if (raw === "multiple" || raw === "many") return "multiple";
    return "";
  })();

  const microbleeds = (() => {
    const raw = toString(mri.microbleeds).toLowerCase().replace(/\s+/g, "");
    if (!raw) return "";
    if (raw === "none" || raw === "no" || raw === "absent" || raw === "nil") return "none";
    if (raw === "1-2" || raw === "1–2" || raw === "1to2" || raw === "1-2microbleeds") return "1-2";
    if (raw === "ge3" || raw === ">=3" || raw === "≥3" || raw === "3+" || raw === "morethan3") return "ge3";
    const n = parseOptionalIntegerLoose(raw);
    if (!Number.isFinite(n)) return "";
    if (n <= 0) return "none";
    if (n <= 2) return "1-2";
    return "ge3";
  })();

  const intracranialDisease = (() => {
    const raw = toString(mri.intracranialDisease).toLowerCase();
    if (!raw) return "";
    if (raw === "yes" || raw === "present" || raw === "positive") return "yes";
    if (raw === "no" || raw === "none" || raw === "absent" || raw === "negative") return "no";
    return "";
  })();

  const notes = Array.isArray(root.notes) ? root.notes.map((x) => toString(x)).filter(Boolean) : [];

  return {
    mriDamage: {
      fazekasGrade,
      atrophySeverity,
      silentInfarcts,
      microbleeds,
      intracranialDisease
    },
    notes
  };
}

function computeBrainHealthPart2({ patient, assessment }) {
  const p = patient && typeof patient === "object" ? patient : {};
  const a = assessment && typeof assessment === "object" ? assessment : {};
  const mri = a?.part2?.mriDamage && typeof a.part2.mriDamage === "object" ? a.part2.mriDamage : {};
  const life = a?.part2?.lifestyle && typeof a.part2.lifestyle === "object" ? a.part2.lifestyle : {};

  const mriDamageIndex = (() => {
    const breakdown = [];
    const add = (item, points) => breakdown.push({ item, points });

    const fazekas = Number.isFinite(mri.fazekasGrade) ? mri.fazekasGrade : null;
    add("White matter hyperintensities (Fazekas)", fazekas == null ? null : fazekas);

    const atrophy = mri.atrophySeverity === "mild" ? 1 : mri.atrophySeverity === "moderate_severe" ? 2 : mri.atrophySeverity === "none" ? 0 : null;
    add("Brain atrophy", atrophy);

    const infarcts = mri.silentInfarcts === "single" ? 1 : mri.silentInfarcts === "multiple" ? 2 : mri.silentInfarcts === "none" ? 0 : null;
    add("Silent infarcts", infarcts);

    const micro = mri.microbleeds === "1-2" ? 1 : mri.microbleeds === "ge3" ? 2 : mri.microbleeds === "none" ? 0 : null;
    add("Microbleeds", micro);

    const intracranial = mri.intracranialDisease === "yes" ? 1 : mri.intracranialDisease === "no" ? 0 : null;
    add("Intracranial stenosis / calcification", intracranial);

    const nums = breakdown.map((x) => (Number.isFinite(x.points) ? x.points : null));
    const hasAny = nums.some((v) => v != null);
    if (!hasAny) return { score: null, breakdown };
    const score = nums.reduce((sum, v) => sum + (v == null ? 0 : v), 0);
    return { score: Math.max(0, Math.min(10, score)), breakdown };
  })();

  const vascularRiskScore = (() => {
    const breakdown = [];
    const add = (item, points) => breakdown.push({ item, points });
    const yes = (v) => v === "yes";

    const hypertension = yes(a?.brainHealthRiskScore?.vascular?.hypertension) ? 2 : 0;
    add("Hypertension", hypertension);
    const diabetes = yes(a?.brainHealthRiskScore?.vascular?.diabetesOrHbA1cHigh) ? 2 : 0;
    add("Diabetes", diabetes);

    const smoking =
      yes(a?.brainHealthRiskScore?.vascular?.smoking) ||
      yes(a?.brainHealthRiskScore?.lifestyle?.smoking) ||
      yes(a?.fsrs?.smoker) ||
      life.noSmoking === "no"
        ? 2
        : 0;
    add("Smoking", smoking);

    const ldl = yes(a?.brainHealthRiskScore?.vascular?.ldlHigh) ? 1 : 0;
    add("LDL > 130", ldl);

    const obesity = yes(a?.brainHealthRiskScore?.metabolic?.bmiGt30) ? 1 : 0;
    add("Obesity", obesity);

    const af = yes(a?.fsrs?.atrialFibrillation) ? 2 : 0;
    add("Atrial fibrillation", af);

    const score = hypertension + diabetes + smoking + ldl + obesity + af;
    return { score: Math.max(0, Math.min(10, score)), breakdown };
  })();

  const lifestyleProtectionScore = (() => {
    const breakdown = [];
    const add = (item, points) => breakdown.push({ item, points });
    const yes = (v) => v === "yes";

    const exMin = Number.isFinite(life.weeklyExerciseMin) ? life.weeklyExerciseMin : null;
    const exercise = exMin == null ? null : exMin < 60 ? 0 : exMin < 150 ? 1 : 2;
    add("Regular exercise", exercise);

    const diet = life.dietQuality === "healthy" ? 2 : life.dietQuality === "moderate" ? 1 : life.dietQuality === "poor" ? 0 : null;
    add("Healthy diet", diet);

    const sleepHours = Number.isFinite(life.sleepHours) ? life.sleepHours : null;
    const sleep = life.sleepApnea === "yes" || (sleepHours != null && sleepHours < 6) ? 0 : sleepHours == null ? null : sleepHours < 7 ? 1 : sleepHours <= 8 ? 2 : 1;
    add("Good sleep", sleep);

    const cognitive = life.cognitiveActivity === "high" ? 2 : life.cognitiveActivity === "moderate" ? 1 : life.cognitiveActivity === "low" ? 0 : null;
    add("Cognitive stimulation", cognitive);

    const social = yes(life.socialEngagement) ? 1 : life.socialEngagement === "no" ? 0 : null;
    add("Social engagement", social);

    const noSmoking = yes(life.noSmoking) ? 1 : life.noSmoking === "no" ? 0 : null;
    add("No smoking", noSmoking);

    const nums = breakdown.map((x) => (Number.isFinite(x.points) ? x.points : null));
    const hasAny = nums.some((v) => v != null);
    if (!hasAny) return { score: null, breakdown };
    const score = nums.reduce((sum, v) => sum + (v == null ? 0 : v), 0);
    return { score: Math.max(0, Math.min(10, score)), breakdown };
  })();

  const age = Number.isFinite(p.age) ? p.age : null;
  const mriScore = Number.isFinite(mriDamageIndex.score) ? mriDamageIndex.score : null;
  const vascularScore = Number.isFinite(vascularRiskScore.score) ? vascularRiskScore.score : null;
  const lifestyleScore = Number.isFinite(lifestyleProtectionScore.score) ? lifestyleProtectionScore.score : null;

  const moca = Number.isFinite(a?.part2?.mocaScore) ? a.part2.mocaScore : null;
  const mocaAdjustmentYears = moca == null ? 0 : moca >= 26 ? -1 : moca >= 23 ? 0 : 2;

  const brainAgeRaw =
    age != null && mriScore != null && vascularScore != null && lifestyleScore != null
      ? age + mriScore * 1.5 + vascularScore * 0.8 - lifestyleScore * 0.5 + mocaAdjustmentYears
      : null;

  const brainAgeRounded = brainAgeRaw == null ? null : Math.round(brainAgeRaw);
  const deltaYears = brainAgeRaw == null || age == null ? null : Math.round((brainAgeRaw - age) * 10) / 10;

  const interpretation = (() => {
    if (deltaYears == null) return "";
    if (deltaYears <= 0) return "Healthy";
    if (deltaYears <= 5) return "Mild acceleration";
    if (deltaYears <= 10) return "Moderate";
    return "High risk brain ageing";
  })();

  return {
    mriDamageIndex,
    vascularRiskScore,
    lifestyleProtectionScore,
    brainAgeRaw: brainAgeRaw == null ? null : Math.round(brainAgeRaw * 10) / 10,
    brainAgeRounded,
    deltaYears,
    interpretation,
    mocaAdjustmentYears: moca == null ? null : mocaAdjustmentYears,
    formula: "Brain Age = Age + (MRI × 1.5) + (Vascular × 0.8) − (Lifestyle × 0.5) + MoCA adj."
  };
}

async function generateBrainHealthPart2ExtractWithAi({ openai, provider, patient, extractedText, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 30000) : "";
  const userPrompt = buildBrainHealthPart2ExtractUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = BRAIN_HEALTH_PART2_EXTRACT_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: [{ type: "text", text: userPrompt }] }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: [{ type: "text", text: userPrompt }] }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed =
    safeParseJsonObject(raw) ??
    safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ??
    null;

  const payload = parsed && typeof parsed === "object" ? parsed : {};
  if (debug) payload.raw = raw;
  return payload;
}

function heuristicExtractBrainHealthPart2FromText(extractedText) {
  const text = typeof extractedText === "string" ? extractedText : "";
  const s = text.replace(/\r/g, "\n");
  const upper = s.toUpperCase();

  const notes = [];
  const mriDamage = {
    fazekasGrade: "",
    atrophySeverity: "",
    silentInfarcts: "",
    microbleeds: "",
    intracranialDisease: ""
  };

  const matchOne = (re) => {
    const m = re.exec(s);
    return m ? m : null;
  };

  const fazekas = (() => {
    const m =
      matchOne(/\bFAZEKAS(?:\s*(?:GRADE|SCORE))?\s*[:\-]?\s*(0|1|2|3)\b/i) ||
      matchOne(/\bFAZEKAS(?:\s*(?:GRADE|SCORE))?\s*[:\-]?\s*(I{1,3})\b/i);
    if (!m) return "";
    const raw = String(m[1] || "").trim().toLowerCase();
    if (raw === "i") return "1";
    if (raw === "ii") return "2";
    if (raw === "iii") return "3";
    if (raw === "0" || raw === "1" || raw === "2" || raw === "3") return raw;
    return "";
  })();
  if (fazekas) mriDamage.fazekasGrade = fazekas;

  const atrophy = (() => {
    const m = matchOne(/\bATROPHY\b[\s\S]{0,80}\b(NONE|NORMAL|ABSENT|MILD|MODERATE(?:\s*[-–]\s*SEVERE)?|SEVERE)\b/i);
    if (!m) return "";
    const raw = String(m[1] || "").trim().toLowerCase();
    if (raw === "none" || raw === "normal" || raw === "absent") return "none";
    if (raw === "mild") return "mild";
    if (raw.includes("moderate") || raw.includes("severe")) return "moderate_severe";
    return "";
  })();
  if (atrophy) mriDamage.atrophySeverity = atrophy;

  const silentInfarcts = (() => {
    const m =
      matchOne(/\bSILENT\s+INFARCTS?\b[\s\S]{0,80}\b(NONE|NO|ABSENT|NIL|SINGLE|MULTIPLE)\b/i) ||
      matchOne(/\bLACUNAR\s+INFARCTS?\b[\s\S]{0,80}\b(NONE|NO|ABSENT|NIL|SINGLE|MULTIPLE)\b/i);
    if (!m) return "";
    const raw = String(m[1] || "").trim().toLowerCase();
    if (raw === "none" || raw === "no" || raw === "absent" || raw === "nil") return "none";
    if (raw === "single") return "single";
    if (raw === "multiple") return "multiple";
    return "";
  })();
  if (silentInfarcts) mriDamage.silentInfarcts = silentInfarcts;

  const microbleeds = (() => {
    const m =
      matchOne(/\bMICROBLEEDS?\b[\s\S]{0,80}\b(NONE|NO|ABSENT|NIL|(\d+)\s*[-–]\s*(\d+)|(\d+)\+|(\d+))\b/i) ||
      matchOne(/\bCEREBRAL\s+MICROBLEEDS?\b[\s\S]{0,80}\b(NONE|NO|ABSENT|NIL|(\d+)\s*[-–]\s*(\d+)|(\d+)\+|(\d+))\b/i);
    if (!m) return "";
    const raw = String(m[1] || "").trim().toLowerCase();
    if (raw === "none" || raw === "no" || raw === "absent" || raw === "nil") return "none";
    const rangeStart = m[2] ? parseOptionalIntegerLoose(m[2]) : null;
    const rangeEnd = m[3] ? parseOptionalIntegerLoose(m[3]) : null;
    if (Number.isFinite(rangeStart) && Number.isFinite(rangeEnd)) {
      if (rangeEnd <= 0) return "none";
      if (rangeEnd <= 2) return "1-2";
      return "ge3";
    }
    const plusN = m[4] ? parseOptionalIntegerLoose(m[4]) : null;
    if (Number.isFinite(plusN)) return plusN <= 2 ? "1-2" : "ge3";
    const singleN = m[5] ? parseOptionalIntegerLoose(m[5]) : null;
    if (Number.isFinite(singleN)) return singleN <= 0 ? "none" : singleN <= 2 ? "1-2" : "ge3";
    return "";
  })();
  if (microbleeds) mriDamage.microbleeds = microbleeds;

  const intracranialDisease = (() => {
    const hasIntracranial = upper.includes("INTRACRANIAL");
    const hasStenosis = upper.includes("STENOSIS");
    const hasCalc = upper.includes("CALCIFICATION") || upper.includes("CALCIFIED");
    if (!hasIntracranial && !hasStenosis && !hasCalc) return "";
    const mNo = matchOne(/\b(NO|ABSENT|WITHOUT)\b[\s\S]{0,40}\b(INTRACRANIAL\s+STENOSIS|INTRACRANIAL\s+CALCIFICATION|STENOSIS|CALCIFICATION)\b/i);
    if (mNo) return "no";
    const mYes = matchOne(/\b(INTRACRANIAL\s+STENOSIS|INTRACRANIAL\s+CALCIFICATION|STENOSIS|CALCIFICATION)\b[\s\S]{0,40}\b(PRESENT|SEEN|YES|NOTED)\b/i);
    if (mYes) return "yes";
    return "";
  })();
  if (intracranialDisease) mriDamage.intracranialDisease = intracranialDisease;

  if (!mriDamage.fazekasGrade && upper.includes("WHITE MATTER") && upper.includes("HYPERINTENS")) {
    notes.push("White matter hyperintensities mentioned; Fazekas grade not explicit")
  }
  if (!mriDamage.atrophySeverity && upper.includes("ATROPHY")) {
    notes.push("Atrophy mentioned; severity not explicit")
  }

  return { mriDamage, notes };
}

function computeDietAssessment({ assessment }) {
  const a = assessment && typeof assessment === "object" ? assessment : {};
  const rule5 = [
    a.dietRule5WholeGrainsDaily,
    a.dietRule5ProteinDaily,
    a.dietRule5VegetablesDaily,
    a.dietRule5FruitsDaily,
    a.dietRule5NutsSeedsDaily
  ];
  const rule5Score = rule5.filter((v) => v === "yes").length;

  const varietyTargets = {
    dietVarietyPulsesProtein: 5,
    dietVarietyVegetables: 7,
    dietVarietyFruits: 7,
    dietVarietyWholeGrains: 3,
    dietVarietyDryNuts: 3,
    dietVarietyDrySeeds: 3
  };

  const variety = Object.entries(varietyTargets).map(([k, target]) => {
    const v = a[k];
    const n = Number.isFinite(v) ? v : null;
    return { key: k, value: n, target, met: Number.isFinite(n) ? n >= target : false };
  });
  const varietyScore = variety.filter((x) => x.met).length;

  const probioticScore = a.dietProbioticIntake === "ge5" ? 1 : 0;

  const positiveScore = rule5Score + varietyScore + probioticScore;

  const negativeHabitsCount = Array.isArray(a.dietNegativeHabits) ? a.dietNegativeHabits.length : 0;
  const negativeScore = negativeHabitsCount;

  const netScore = positiveScore - negativeScore;

  const category =
    netScore > 10
      ? "Very healthy eating"
      : netScore >= 5
        ? "Healthy eating"
        : netScore >= 2
          ? "Mildly unhealthy"
          : netScore >= 0
            ? "Moderately unhealthy"
            : "Very unhealthy";

  return {
    positiveScore,
    negativeScore,
    netScore,
    category,
    rule5Score,
    varietyScore,
    probioticScore,
    varietyBreakdown: variety
  };
}

async function generateDietAssessmentSummaryWithAi({ openai, provider, patient, assessment, computed, debug }) {
  const userPrompt = buildDietAssessmentUserPrompt({ patient, assessment, computed });
  const systemPrompt = DIET_ASSESSMENT_SYSTEM_PROMPT;

  let raw = "";
  if (provider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else if (provider === "gemini") {
    const response = await geminiGenerateContent({
      model: getGeminiModel(),
      temperature: 0,
      parts: [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }]
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      text: { format: { type: "json_object" } },
      input: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] }
      ]
    });
    raw = getTextFromResponsesOutput(response);
  }

  const parsed =
    safeParseJsonObject(raw) ??
    safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ??
    null;

  const summary = typeof parsed?.summary === "string" ? parsed.summary : "";
  const counselling = typeof parsed?.counselling === "string" ? parsed.counselling : "";
  const keyIssues = Array.isArray(parsed?.keyIssues) ? parsed.keyIssues.filter((s) => typeof s === "string" && s.trim()) : [];
  const suggestedActions = Array.isArray(parsed?.suggestedActions)
    ? parsed.suggestedActions.filter((s) => typeof s === "string" && s.trim())
    : [];

  const payload = { summary, counselling, keyIssues, suggestedActions };
  if (debug) payload.raw = raw;
  return payload;
}

function normalizeAnsAssessmentIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };

  const num = (v) => parseOptionalNumberLoose(v);

  const orthostatic = {
    lying: { sbp: num(b.ansLyingSbp), dbp: num(b.ansLyingDbp), hr: num(b.ansLyingHr) },
    stand1: { sbp: num(b.ansStand1Sbp), dbp: num(b.ansStand1Dbp), hr: num(b.ansStand1Hr) },
    stand3: { sbp: num(b.ansStand3Sbp), dbp: num(b.ansStand3Dbp), hr: num(b.ansStand3Hr) }
  };

  return { patient, orthostatic };
}

function normalizeArterialHealthIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };
  return { patient };
}

function normalizeLungFunctionIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const heightCm = parseOptionalNumberLoose(b.heightCm);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null,
    heightCm: Number.isFinite(heightCm) && heightCm > 0 ? heightCm : null
  };
  return { patient };
}

function normalizeLiverHealthIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const heightCm = parseOptionalNumberLoose(b.heightCm);
  const weightKg = parseOptionalNumberLoose(b.weightKg);
  const waistCm = parseOptionalNumberLoose(b.waistCm);
  const astIU_L = parseOptionalNumberLoose(b.astIU_L);
  const altIU_L = parseOptionalNumberLoose(b.altIU_L);
  const plateletCount10e9_L = parseOptionalNumberLoose(b.plateletCount10e9_L);
  const albuminG_dL = parseOptionalNumberLoose(b.albuminG_dL);
  const triglyceridesMg_dL = parseOptionalNumberLoose(b.triglyceridesMg_dL);
  const ggtIU_L = parseOptionalNumberLoose(b.ggtIU_L);
  const diabetesRaw = typeof b.diabetesOrIfg === "string" ? b.diabetesOrIfg.trim().toLowerCase() : "";
  const diabetesOrIfg =
    diabetesRaw === "yes" || diabetesRaw === "true" || diabetesRaw === "1"
      ? true
      : diabetesRaw === "no" || diabetesRaw === "false" || diabetesRaw === "0"
        ? false
        : null;

  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null,
    heightCm: Number.isFinite(heightCm) && heightCm > 0 ? heightCm : null,
    weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : null,
    waistCm: Number.isFinite(waistCm) && waistCm > 0 ? waistCm : null,
    diabetesOrIfg,
    astIU_L: Number.isFinite(astIU_L) ? astIU_L : null,
    altIU_L: Number.isFinite(altIU_L) ? altIU_L : null,
    plateletCount10e9_L: Number.isFinite(plateletCount10e9_L) ? plateletCount10e9_L : null,
    albuminG_dL: Number.isFinite(albuminG_dL) ? albuminG_dL : null,
    triglyceridesMg_dL: Number.isFinite(triglyceridesMg_dL) ? triglyceridesMg_dL : null,
    ggtIU_L: Number.isFinite(ggtIU_L) ? ggtIU_L : null
  };
  return { patient };
}

function computeLiverScoresFromPatient(patient) {
  const ageCandidate = Number.isFinite(patient?.age) ? patient.age : null;
  const heightCmCandidate = Number.isFinite(patient?.heightCm) ? patient.heightCm : null;
  const weightKgCandidate = Number.isFinite(patient?.weightKg) ? patient.weightKg : null;
  const waistCmCandidate = Number.isFinite(patient?.waistCm) ? patient.waistCm : null;
  const bmiCandidate =
    computeBmiKgM2({ heightCm: heightCmCandidate, weightKg: weightKgCandidate });
  const diabetesCandidate = typeof patient?.diabetesOrIfg === "boolean" ? patient.diabetesOrIfg : null;
  const astCandidate = Number.isFinite(patient?.astIU_L) ? patient.astIU_L : null;
  const altCandidate = Number.isFinite(patient?.altIU_L) ? patient.altIU_L : null;
  const plateletCandidate = Number.isFinite(patient?.plateletCount10e9_L) ? patient.plateletCount10e9_L : null;
  const albuminCandidate = Number.isFinite(patient?.albuminG_dL) ? patient.albuminG_dL : null;
  const triglyceridesCandidate = Number.isFinite(patient?.triglyceridesMg_dL) ? patient.triglyceridesMg_dL : null;
  const ggtCandidate = Number.isFinite(patient?.ggtIU_L) ? patient.ggtIU_L : null;

  const astAltRatio =
    Number.isFinite(astCandidate) && astCandidate > 0 && Number.isFinite(altCandidate) && altCandidate > 0
      ? astCandidate / altCandidate
      : null;

  const nfsScore =
    Number.isFinite(ageCandidate) &&
    Number.isFinite(bmiCandidate) &&
    typeof diabetesCandidate === "boolean" &&
    Number.isFinite(astAltRatio) &&
    Number.isFinite(plateletCandidate) &&
    Number.isFinite(albuminCandidate)
      ? -1.675 +
        0.037 * ageCandidate +
        0.094 * bmiCandidate +
        1.13 * (diabetesCandidate ? 1 : 0) -
        0.99 * astAltRatio -
        0.013 * plateletCandidate -
        0.66 * albuminCandidate
      : null;

  const yForFli =
    Number.isFinite(triglyceridesCandidate) &&
    triglyceridesCandidate > 0 &&
    Number.isFinite(bmiCandidate) &&
    Number.isFinite(ggtCandidate) &&
    ggtCandidate > 0 &&
    Number.isFinite(waistCmCandidate)
      ? 0.953 * Math.log(triglyceridesCandidate) +
        0.139 * bmiCandidate +
        0.718 * Math.log(ggtCandidate) +
        0.053 * waistCmCandidate -
        15.745
      : null;
  const fliScore =
    Number.isFinite(yForFli) ? (Math.exp(yForFli) / (1 + Math.exp(yForFli))) * 100 : null;

  const fib4Score =
    Number.isFinite(ageCandidate) &&
    Number.isFinite(astCandidate) &&
    astCandidate > 0 &&
    Number.isFinite(altCandidate) &&
    altCandidate > 0 &&
    Number.isFinite(plateletCandidate) &&
    plateletCandidate > 0
      ? (ageCandidate * astCandidate) / (plateletCandidate * Math.sqrt(altCandidate))
      : null;

  const bardScore =
    Number.isFinite(astAltRatio) && Number.isFinite(bmiCandidate) && typeof diabetesCandidate === "boolean"
      ? (astAltRatio >= 0.8 ? 2 : 0) + (bmiCandidate >= 28 ? 1 : 0) + (diabetesCandidate ? 1 : 0)
      : null;

  return {
    inputs: {
      ageYears: ageCandidate,
      heightCm: Number.isFinite(heightCmCandidate) ? heightCmCandidate : null,
      weightKg: Number.isFinite(weightKgCandidate) ? weightKgCandidate : null,
      waistCircumferenceCm: Number.isFinite(waistCmCandidate) ? waistCmCandidate : null,
      bmiKg_m2: Number.isFinite(bmiCandidate) ? bmiCandidate : null,
      ifgOrDiabetes: typeof diabetesCandidate === "boolean" ? diabetesCandidate : null,
      astIU_L: Number.isFinite(astCandidate) ? astCandidate : null,
      altIU_L: Number.isFinite(altCandidate) ? altCandidate : null,
      plateletCount10e9_L: Number.isFinite(plateletCandidate) ? plateletCandidate : null,
      albuminG_dL: Number.isFinite(albuminCandidate) ? albuminCandidate : null,
      triglyceridesMg_dL: Number.isFinite(triglyceridesCandidate) ? triglyceridesCandidate : null,
      ggtIU_L: Number.isFinite(ggtCandidate) ? ggtCandidate : null,
      astAltRatio: Number.isFinite(astAltRatio) ? astAltRatio : null
    },
    nfs: {
      score: Number.isFinite(nfsScore) ? nfsScore : null,
      interpretation: interpretNfs(nfsScore)
    },
    fli: {
      score: Number.isFinite(fliScore) ? fliScore : null,
      interpretation: interpretFli(fliScore)
    },
    fib4: {
      score: Number.isFinite(fib4Score) ? fib4Score : null,
      interpretation: interpretFib4(fib4Score)
    },
    bard: {
      score: Number.isFinite(bardScore) ? bardScore : null,
      interpretation: interpretBard(bardScore)
    }
  };
}

function normalizeEyeHealthIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);

  const diabetesRaw = typeof b.diabetes === "string" ? b.diabetes.trim().toLowerCase() : "";
  const diabetes =
    diabetesRaw === "yes" || diabetesRaw === "true" || diabetesRaw === "1"
      ? true
      : diabetesRaw === "no" || diabetesRaw === "false" || diabetesRaw === "0"
        ? false
        : null;
  const diabetesYears = parseOptionalNumberLoose(b.diabetesYears);

  const hypertensionRaw = typeof b.hypertension === "string" ? b.hypertension.trim().toLowerCase() : "";
  const hypertension =
    hypertensionRaw === "yes" || hypertensionRaw === "true" || hypertensionRaw === "1"
      ? true
      : hypertensionRaw === "no" || hypertensionRaw === "false" || hypertensionRaw === "0"
        ? false
        : null;

  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null,
    diabetes,
    diabetesYears: Number.isFinite(diabetesYears) && diabetesYears >= 0 ? diabetesYears : null,
    hypertension
  };
  return { patient };
}

function normalizeKidneyHealthIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };
  return { patient };
}

function normalizeDiabetesRiskIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };
  return { patient };
}

function normalizeWomenHealthIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };
  return { patient };
}

function normalizeBoneHealthIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };
  return { patient };
}

function normalizeAdultVaccinationIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };
  return { patient };
}

function normalizeCancerScreeningIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };
  return { patient };
}

function normalizeGenesHealthIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };
  return { patient };
}

function normalizeAllergyPanelsIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };
  return { patient };
}

function normalizeBrainHealthAssessmentIncoming(body) {
  const b = body && typeof body === "object" ? body : {};
  const sexRaw = typeof b.sex === "string" ? b.sex.trim().toLowerCase() : "";
  const age = parseOptionalIntegerLoose(b.age);
  const patient = {
    name: typeof b.name === "string" ? b.name.trim() : "",
    sex: sexRaw === "male" || sexRaw === "female" ? sexRaw : "",
    age: Number.isFinite(age) && age > 0 ? age : null
  };
  return { patient };
}

function computeLungAgeYears({ sex, heightCm, fev1L }) {
  const s = typeof sex === "string" ? sex.trim().toLowerCase() : "";
  if (s !== "male" && s !== "female") return { lungAgeYears: null, formula: "" };
  if (!Number.isFinite(heightCm) || heightCm <= 0) return { lungAgeYears: null, formula: "" };
  if (!Number.isFinite(fev1L) || fev1L <= 0) return { lungAgeYears: null, formula: "" };

  const fev1 = fev1L > 20 ? fev1L / 1000 : fev1L;
  const formula =
    s === "male"
      ? "(0.036 * heightCm - 1.178 - fev1L) / 0.028"
      : "(0.022 * heightCm - 0.005 - fev1L) / 0.0229";
  const lungAge =
    s === "male"
      ? (0.036 * heightCm - 1.178 - fev1) / 0.028
      : (0.022 * heightCm - 0.005 - fev1) / 0.0229;

  if (!Number.isFinite(lungAge) || lungAge < 0 || lungAge > 150) return { lungAgeYears: null, formula };
  return { lungAgeYears: Math.round(lungAge), formula };
}

function computeOrthostaticVitals(orthostatic) {
  const o = orthostatic && typeof orthostatic === "object" ? orthostatic : {};
  const lying = o.lying && typeof o.lying === "object" ? o.lying : {};
  const stand1 = o.stand1 && typeof o.stand1 === "object" ? o.stand1 : {};
  const stand3 = o.stand3 && typeof o.stand3 === "object" ? o.stand3 : {};

  const sbpDrop1 =
    Number.isFinite(lying.sbp) && Number.isFinite(stand1.sbp) ? lying.sbp - stand1.sbp : null;
  const dbpDrop1 =
    Number.isFinite(lying.dbp) && Number.isFinite(stand1.dbp) ? lying.dbp - stand1.dbp : null;
  const hrRise1 =
    Number.isFinite(lying.hr) && Number.isFinite(stand1.hr) ? stand1.hr - lying.hr : null;

  const sbpDrop3 =
    Number.isFinite(lying.sbp) && Number.isFinite(stand3.sbp) ? lying.sbp - stand3.sbp : null;
  const dbpDrop3 =
    Number.isFinite(lying.dbp) && Number.isFinite(stand3.dbp) ? lying.dbp - stand3.dbp : null;
  const hrRise3 =
    Number.isFinite(lying.hr) && Number.isFinite(stand3.hr) ? stand3.hr - lying.hr : null;

  const ohAt1 =
    (Number.isFinite(sbpDrop1) && sbpDrop1 >= 20) || (Number.isFinite(dbpDrop1) && dbpDrop1 >= 10);
  const ohAt3 =
    (Number.isFinite(sbpDrop3) && sbpDrop3 >= 20) || (Number.isFinite(dbpDrop3) && dbpDrop3 >= 10);
  const persistentOrthostatic = ohAt1 && ohAt3;

  return {
    sbpDrop1,
    dbpDrop1,
    hrRise1,
    sbpDrop3,
    dbpDrop3,
    hrRise3,
    orthostaticAt1Min: ohAt1,
    orthostaticAt3Min: ohAt3,
    persistentOrthostatic
  };
}

async function generateAnsAssessmentWithAi({
  openai,
  provider,
  patient,
  orthostatic,
  computed,
  extractedText,
  imageFiles,
  debug
}) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 20000) : "";
  const userPrompt = buildAnsAssessmentUserPrompt({
    patient,
    orthostatic,
    computed,
    extractedText: textForPrompt
  });
  const systemPrompt = ANS_ASSESSMENT_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 8192
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed =
    safeParseJsonObject(raw) ??
    safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ??
    null;

  const payload = parsed && typeof parsed === "object" ? parsed : {};
  if (debug) payload.raw = raw;
  return payload;
}

async function generateArterialHealthWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 30000) : "";
  const userPrompt = buildArterialHealthUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = ARTERIAL_HEALTH_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 8192
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};
  if (debug) payload.raw = raw;
  return payload;
}

async function generateLungFunctionWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 30000) : "";
  const userPrompt = buildLungFunctionUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = LUNG_FUNCTION_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 8192
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const spirometry = payload?.spirometry && typeof payload.spirometry === "object" ? payload.spirometry : {};
  const pre = spirometry?.pre && typeof spirometry.pre === "object" ? spirometry.pre : {};
  const post = spirometry?.post && typeof spirometry.post === "object" ? spirometry.post : {};
  const keyValues =
    spirometry?.keyValues && typeof spirometry.keyValues === "object" ? spirometry.keyValues : {};

  const table = Array.isArray(spirometry?.table) ? spirometry.table : [];
  const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");
  const pickNum = (v) => {
    const n = parseOptionalNumberLoose(v);
    return Number.isFinite(n) ? n : null;
  };
  const pickObserved = (row) =>
    pickNum(
      row?.observed ??
        row?.Observed ??
        row?.observedValue ??
        row?.value ??
        row?.pre ??
        row?.Pre ??
        null
    );

  const findObservedByParam = (predicate) => {
    for (const r of table) {
      const p = norm(r?.parameter ?? r?.Parameter ?? "");
      if (!p) continue;
      if (!predicate(p)) continue;
      const n = pickObserved(r);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const fev1FromTable = findObservedByParam((p) => p.includes("fev1") && !p.includes("/"));
  const fvcFromTable = findObservedByParam((p) => p === "fvc" || (p.includes("fvc") && !p.includes("fev")));
  const ratioFromTable = findObservedByParam((p) => p.includes("fev1/fvc"));
  const pefFromTable = findObservedByParam((p) => p === "pef" || p.includes("pef"));
  const fef2575FromTable = findObservedByParam((p) => p.includes("fef") && (p.includes("25-75") || p.includes("25–75") || p.includes("25 75")));

  const fev1Candidate = pickNum(keyValues?.fev1L) ?? pickNum(pre?.fev1L) ?? fev1FromTable;
  const fvcCandidate = pickNum(keyValues?.fvcL) ?? pickNum(pre?.fvcL) ?? fvcFromTable;
  const ratioCandidate = pickNum(keyValues?.fev1FvcPercent) ?? pickNum(pre?.fev1FvcRatio) ?? ratioFromTable;
  const pefCandidate = pickNum(keyValues?.pef) ?? pickNum(pre?.pef) ?? pefFromTable;
  const fefCandidate = pickNum(keyValues?.fef25_75) ?? pickNum(pre?.fef25_75) ?? fef2575FromTable;

  const fev1L = Number.isFinite(fev1Candidate) ? (fev1Candidate > 20 ? fev1Candidate / 1000 : fev1Candidate) : null;
  const fvcL = Number.isFinite(fvcCandidate) ? (fvcCandidate > 20 ? fvcCandidate / 1000 : fvcCandidate) : null;

  payload.spirometry = payload.spirometry && typeof payload.spirometry === "object" ? payload.spirometry : {};
  payload.spirometry.keyValues = {
    ...keyValues,
    fev1L: keyValues?.fev1L ?? (Number.isFinite(fev1L) ? fev1L : null),
    fvcL: keyValues?.fvcL ?? (Number.isFinite(fvcL) ? fvcL : null),
    fev1FvcPercent: keyValues?.fev1FvcPercent ?? (Number.isFinite(ratioCandidate) ? ratioCandidate : null),
    pef: keyValues?.pef ?? (Number.isFinite(pefCandidate) ? pefCandidate : null),
    fef25_75: keyValues?.fef25_75 ?? (Number.isFinite(fefCandidate) ? fefCandidate : null),
    units: keyValues?.units && typeof keyValues.units === "object" ? keyValues.units : { pef: "", fef25_75: "" }
  };
  payload.spirometry.interpretation =
    typeof spirometry?.interpretation === "string"
      ? spirometry.interpretation
      : typeof pre?.interpretation === "string"
        ? pre.interpretation
        : typeof post?.interpretation === "string"
          ? post.interpretation
          : "";

  const pickText = (v) => {
    if (typeof v === "string") return v.trim() ? v.trim() : null;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return null;
  };
  const normalizedTable = table.map((row) => {
    const parameter =
      pickText(row?.parameter) ??
      pickText(row?.Parameter) ??
      pickText(row?.parameterName) ??
      pickText(row?.ParameterName) ??
      pickText(row?.param) ??
      pickText(row?.name) ??
      pickText(row?.testName) ??
      pickText(row?.test) ??
      pickText(row?.metric) ??
      "";
    const observed =
      pickText(row?.observed) ??
      pickText(row?.Observed) ??
      pickText(row?.observedValue) ??
      pickText(row?.value) ??
      pickText(row?.pre) ??
      pickText(row?.Pre) ??
      "";
    const predicted = pickText(row?.predicted) ?? pickText(row?.Predicted) ?? "";
    const percentPredicted =
      pickText(row?.percentPredicted) ?? pickText(row?.percent) ?? pickText(row?.["%Pred"]) ?? pickText(row?.percentPred) ?? "";
    const units = pickText(row?.units) ?? pickText(row?.Units) ?? "";
    const notes = pickText(row?.notes) ?? pickText(row?.Notes) ?? "";
    return { parameter, observed, predicted, percentPredicted, units, notes };
  });

  payload.spirometry.table = normalizedTable;

  const sexUsed = typeof patient?.sex === "string" ? patient.sex : "";
  const heightCmUsed = Number.isFinite(patient?.heightCm) ? patient.heightCm : null;
  const { lungAgeYears, formula } = computeLungAgeYears({ sex: sexUsed, heightCm: heightCmUsed, fev1L });

  payload.lungAge = {
    sexUsed,
    heightCmUsed,
    fev1LUsed: fev1L,
    lungAgeYears,
    formula
  };

  const normalizeTextBlock = (section) => {
    const source = section && typeof section === "object" ? section : {};
    return {
      findings: typeof source.findings === "string" ? source.findings : "",
      impression: typeof source.impression === "string" ? source.impression : "",
      summary: typeof source.summary === "string" ? source.summary : ""
    };
  };

  payload.chestXray = normalizeTextBlock(payload.chestXray);
  payload.hrct = normalizeTextBlock(payload.hrct);

  if (debug) payload.raw = raw;
  return payload;
}

function computeBmiKgM2({ heightCm, weightKg }) {
  if (!Number.isFinite(heightCm) || heightCm <= 0) return null;
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  if (!Number.isFinite(bmi) || bmi <= 0) return null;
  return bmi;
}

function interpretNfs(score) {
  if (!Number.isFinite(score)) return "";
  if (score < -1.455) return "Advanced fibrosis absent (F0–F2); NPV 93%";
  if (score <= 0.675) return "Indeterminate";
  return "Advanced fibrosis present (F3–F4); PPV 90%";
}

function interpretFli(score) {
  if (!Number.isFinite(score)) return "";
  if (score < 30) return "Fatty liver ruled out — Sensitivity 87%, LR− 0.2";
  if (score < 60) return "Indeterminate";
  return "Fatty liver present — Specificity 86%, LR+ 4.3";
}

function interpretFib4(score) {
  if (!Number.isFinite(score)) return "";
  if (score < 1.45) return "Advanced fibrosis absent (F0–F2) — NPV 90%";
  if (score <= 3.25) return "Indeterminate — biopsy may be needed";
  return "Advanced fibrosis present (F3–F4) — Specificity 97%, PPV 65%";
}

function interpretBard(score) {
  if (!Number.isFinite(score)) return "";
  if (score <= 1) return "Advanced fibrosis absent — High NPV of 96%";
  return "Advanced fibrosis present — Further evaluation needed";
}

function interpretElastographyKpa(kPa) {
  if (!Number.isFinite(kPa)) return "";
  if (kPa < 5) return "Normal";
  if (kPa < 7) return "Mild fibrosis risk";
  if (kPa < 9) return "Significant fibrosis possible";
  if (kPa < 12) return "Advanced fibrosis";
  return "Cirrhosis likely";
}

function interpretCap(cap) {
  if (!Number.isFinite(cap)) return "";
  if (cap < 238) return "Normal";
  if (cap < 260) return "Mild fatty liver";
  if (cap < 290) return "Moderate fatty liver";
  return "Severe fatty liver";
}

async function generateLiverHealthWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 30000) : "";
  const userPrompt = buildLiverHealthUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = LIVER_HEALTH_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 8192
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const root = payload?.liverHealth && typeof payload.liverHealth === "object" ? payload.liverHealth : payload;
  const labs = root?.labs && typeof root.labs === "object" ? root.labs : {};
  const anthropometry = root?.anthropometry && typeof root.anthropometry === "object" ? root.anthropometry : {};
  const metabolic = root?.metabolic && typeof root.metabolic === "object" ? root.metabolic : {};
  const elastography = root?.elastography && typeof root.elastography === "object" ? root.elastography : {};
  const ultrasound = root?.ultrasound && typeof root.ultrasound === "object" ? root.ultrasound : {};

  const tableIncoming = Array.isArray(root?.table) ? root.table : [];
  const pickText = (v) => {
    if (typeof v === "string") return v.trim() ? v.trim() : null;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return null;
  };
  const normalizedTable = tableIncoming.map((row) => {
    const parameter =
      pickText(row?.parameter) ??
      pickText(row?.Parameter) ??
      pickText(row?.parameterName) ??
      pickText(row?.ParameterName) ??
      pickText(row?.param) ??
      pickText(row?.name) ??
      pickText(row?.testName) ??
      pickText(row?.test) ??
      pickText(row?.metric) ??
      "";
    const observed =
      pickText(row?.observed) ??
      pickText(row?.Observed) ??
      pickText(row?.observedValue) ??
      pickText(row?.value) ??
      pickText(row?.result) ??
      "";
    const units = pickText(row?.units) ?? pickText(row?.Units) ?? "";
    const notes = pickText(row?.notes) ?? pickText(row?.Notes) ?? "";
    return { parameter, observed, units, notes };
  });

  const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");
  const pickNum = (v) => {
    const n = parseOptionalNumberLoose(v);
    return Number.isFinite(n) ? n : null;
  };
  const findObservedByParam = (predicate) => {
    for (const r of normalizedTable) {
      const p = norm(r?.parameter);
      if (!p) continue;
      if (!predicate(p)) continue;
      const n = pickNum(r?.observed);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const astFromTable = findObservedByParam((p) => p === "ast" || p.includes("sgot"));
  const altFromTable = findObservedByParam((p) => p === "alt" || p.includes("sgpt"));
  const plateletsFromTable = findObservedByParam((p) => p.includes("platelet"));
  const albuminFromTable = findObservedByParam((p) => p === "albumin" || p.includes("serum albumin"));
  const tgFromTable = findObservedByParam((p) => p.includes("triglycer"));
  const ggtFromTable = findObservedByParam((p) => p === "ggt" || p.includes("gamma"));

  const heightCmCandidate = pickNum(anthropometry?.heightCm) ?? (Number.isFinite(patient?.heightCm) ? patient.heightCm : null);
  const weightKgCandidate = pickNum(anthropometry?.weightKg) ?? (Number.isFinite(patient?.weightKg) ? patient.weightKg : null);
  const waistCmCandidate =
    pickNum(anthropometry?.waistCircumferenceCm) ?? (Number.isFinite(patient?.waistCm) ? patient.waistCm : null);
  const bmiCandidate =
    computeBmiKgM2({ heightCm: heightCmCandidate, weightKg: weightKgCandidate }) ?? pickNum(anthropometry?.bmiKg_m2);

  const diabetesCandidateRaw = metabolic?.ifgOrDiabetes;
  const diabetesCandidate =
    typeof patient?.diabetesOrIfg === "boolean"
      ? patient.diabetesOrIfg
      : typeof diabetesCandidateRaw === "boolean"
        ? diabetesCandidateRaw
        : typeof diabetesCandidateRaw === "string"
          ? ["yes", "true", "1"].includes(diabetesCandidateRaw.trim().toLowerCase())
          : null;

  const ageCandidate = Number.isFinite(patient?.age) ? patient.age : null;

  const astCandidate = pickNum(labs?.astIU_L) ?? astFromTable;
  const altCandidate = pickNum(labs?.altIU_L) ?? altFromTable;

  let plateletCandidate = pickNum(labs?.plateletCount10e9_L) ?? plateletsFromTable;
  if (Number.isFinite(plateletCandidate) && plateletCandidate > 2000) plateletCandidate = plateletCandidate / 1000;

  let albuminCandidate = pickNum(labs?.albuminG_dL) ?? albuminFromTable;
  if (Number.isFinite(albuminCandidate) && albuminCandidate > 20) albuminCandidate = albuminCandidate / 10;

  const triglyceridesCandidate = pickNum(labs?.triglyceridesMg_dL) ?? tgFromTable;
  const ggtCandidate = pickNum(labs?.ggtIU_L) ?? ggtFromTable;

  const astAltRatio =
    Number.isFinite(astCandidate) && astCandidate > 0 && Number.isFinite(altCandidate) && altCandidate > 0
      ? astCandidate / altCandidate
      : null;

  const nfsScore =
    Number.isFinite(ageCandidate) &&
    Number.isFinite(bmiCandidate) &&
    typeof diabetesCandidate === "boolean" &&
    Number.isFinite(astAltRatio) &&
    Number.isFinite(plateletCandidate) &&
    Number.isFinite(albuminCandidate)
      ? -1.675 +
        0.037 * ageCandidate +
        0.094 * bmiCandidate +
        1.13 * (diabetesCandidate ? 1 : 0) -
        0.99 * astAltRatio -
        0.013 * plateletCandidate -
        0.66 * albuminCandidate
      : null;

  const yForFli =
    Number.isFinite(triglyceridesCandidate) &&
    triglyceridesCandidate > 0 &&
    Number.isFinite(bmiCandidate) &&
    Number.isFinite(ggtCandidate) &&
    ggtCandidate > 0 &&
    Number.isFinite(waistCmCandidate)
      ? 0.953 * Math.log(triglyceridesCandidate) +
        0.139 * bmiCandidate +
        0.718 * Math.log(ggtCandidate) +
        0.053 * waistCmCandidate -
        15.745
      : null;
  const fliScore =
    Number.isFinite(yForFli) ? (Math.exp(yForFli) / (1 + Math.exp(yForFli))) * 100 : null;

  const fib4Score =
    Number.isFinite(ageCandidate) &&
    Number.isFinite(astCandidate) &&
    astCandidate > 0 &&
    Number.isFinite(altCandidate) &&
    altCandidate > 0 &&
    Number.isFinite(plateletCandidate) &&
    plateletCandidate > 0
      ? (ageCandidate * astCandidate) / (plateletCandidate * Math.sqrt(altCandidate))
      : null;

  const bardScore =
    Number.isFinite(astAltRatio) && Number.isFinite(bmiCandidate) && typeof diabetesCandidate === "boolean"
      ? (astAltRatio >= 0.8 ? 2 : 0) + (bmiCandidate >= 28 ? 1 : 0) + (diabetesCandidate ? 1 : 0)
      : null;

  const kPaCandidate = pickNum(elastography?.kPa);
  const capCandidate = pickNum(elastography?.cap);

  const computed = {
    inputs: {
      ageYears: ageCandidate,
      heightCm: Number.isFinite(heightCmCandidate) ? heightCmCandidate : null,
      weightKg: Number.isFinite(weightKgCandidate) ? weightKgCandidate : null,
      waistCircumferenceCm: Number.isFinite(waistCmCandidate) ? waistCmCandidate : null,
      bmiKg_m2: Number.isFinite(bmiCandidate) ? bmiCandidate : null,
      ifgOrDiabetes: typeof diabetesCandidate === "boolean" ? diabetesCandidate : null,
      astIU_L: Number.isFinite(astCandidate) ? astCandidate : null,
      altIU_L: Number.isFinite(altCandidate) ? altCandidate : null,
      plateletCount10e9_L: Number.isFinite(plateletCandidate) ? plateletCandidate : null,
      albuminG_dL: Number.isFinite(albuminCandidate) ? albuminCandidate : null,
      triglyceridesMg_dL: Number.isFinite(triglyceridesCandidate) ? triglyceridesCandidate : null,
      ggtIU_L: Number.isFinite(ggtCandidate) ? ggtCandidate : null,
      astAltRatio: Number.isFinite(astAltRatio) ? astAltRatio : null
    },
    nfs: {
      score: Number.isFinite(nfsScore) ? nfsScore : null,
      interpretation: interpretNfs(nfsScore)
    },
    fli: {
      score: Number.isFinite(fliScore) ? fliScore : null,
      interpretation: interpretFli(fliScore)
    },
    fib4: {
      score: Number.isFinite(fib4Score) ? fib4Score : null,
      interpretation: interpretFib4(fib4Score)
    },
    bard: {
      score: Number.isFinite(bardScore) ? bardScore : null,
      interpretation: interpretBard(bardScore)
    },
    elastography: {
      kPa: Number.isFinite(kPaCandidate) ? kPaCandidate : null,
      meaning: interpretElastographyKpa(kPaCandidate)
    },
    steatosis: {
      cap: Number.isFinite(capCandidate) ? capCandidate : null,
      fatLevel: interpretCap(capCandidate)
    }
  };

  const normalized = {
    labs: {
      astIU_L: Number.isFinite(astCandidate) ? astCandidate : null,
      altIU_L: Number.isFinite(altCandidate) ? altCandidate : null,
      plateletCount10e9_L: Number.isFinite(plateletCandidate) ? plateletCandidate : null,
      albuminG_dL: Number.isFinite(albuminCandidate) ? albuminCandidate : null,
      triglyceridesMg_dL: Number.isFinite(triglyceridesCandidate) ? triglyceridesCandidate : null,
      ggtIU_L: Number.isFinite(ggtCandidate) ? ggtCandidate : null
    },
    anthropometry: {
      heightCm: Number.isFinite(heightCmCandidate) ? heightCmCandidate : null,
      weightKg: Number.isFinite(weightKgCandidate) ? weightKgCandidate : null,
      bmiKg_m2: Number.isFinite(bmiCandidate) ? bmiCandidate : null,
      waistCircumferenceCm: Number.isFinite(waistCmCandidate) ? waistCmCandidate : null
    },
    metabolic: { ifgOrDiabetes: typeof diabetesCandidate === "boolean" ? diabetesCandidate : null },
    elastography: {
      kPa: Number.isFinite(kPaCandidate) ? kPaCandidate : null,
      cap: Number.isFinite(capCandidate) ? capCandidate : null,
      notes: typeof elastography?.notes === "string" ? elastography.notes : ""
    },
    ultrasound: {
      findings: typeof ultrasound?.findings === "string" ? ultrasound.findings : "",
      impression: typeof ultrasound?.impression === "string" ? ultrasound.impression : "",
      mentionsFattyLiver:
        typeof ultrasound?.mentionsFattyLiver === "boolean"
          ? ultrasound.mentionsFattyLiver
          : typeof ultrasound?.mentionsFattyLiver === "string"
            ? ["yes", "true", "1"].includes(ultrasound.mentionsFattyLiver.trim().toLowerCase())
            : null
    },
    table: normalizedTable,
    notes: Array.isArray(root?.notes) ? root.notes : [],
    computed
  };

  payload.liverHealth = normalized;
  if (debug) payload.raw = raw;
  return payload;
}

async function generateEyeHealthWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 20000) : "";
  const userPrompt = buildEyeHealthUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = EYE_HEALTH_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const root = payload?.eyeHealth && typeof payload.eyeHealth === "object" ? payload.eyeHealth : payload;
  const retinoscopy = root?.retinoscopy && typeof root.retinoscopy === "object" ? root.retinoscopy : {};

  const normalizeYesNo = (v) => {
    if (typeof v !== "string") return "";
    const s = v.trim().toLowerCase();
    if (s === "yes" || s === "y" || s === "present" || s === "positive") return "yes";
    if (s === "no" || s === "n" || s === "absent" || s === "negative") return "no";
    return "";
  };

  const normalized = {
    retinoscopy: {
      retinopathy: normalizeYesNo(retinoscopy?.retinopathy),
      type: typeof retinoscopy?.type === "string" ? retinoscopy.type : "",
      severity: typeof retinoscopy?.severity === "string" ? retinoscopy.severity : "",
      findings: typeof retinoscopy?.findings === "string" ? retinoscopy.findings : "",
      impression: typeof retinoscopy?.impression === "string" ? retinoscopy.impression : ""
    },
    otherFindings: typeof root?.otherFindings === "string" ? root.otherFindings : "",
    notes: Array.isArray(root?.notes) ? root.notes : []
  };

  payload.eyeHealth = normalized;
  if (debug) payload.raw = raw;
  return payload;
}

function computeKidneyFailureRisk({ ageYears, sex, egfr, uacr }) {
  const age = Number.isFinite(ageYears) ? ageYears : null;
  const male = sex === "male" ? 1 : 0;
  const e = Number.isFinite(egfr) ? egfr : null;
  const u = Number.isFinite(uacr) ? uacr : null;
  if (!Number.isFinite(age) || age <= 0) return { risk2YearPct: null, risk5YearPct: null };
  if (!Number.isFinite(e) || e <= 0) return { risk2YearPct: null, risk5YearPct: null };
  if (!Number.isFinite(u) || u <= 0) return { risk2YearPct: null, risk5YearPct: null };

  const lnU = Math.log(u);
  const lp =
    -0.2201 * (age / 10 - 7.036) +
    0.2467 * (male - 0.5642) +
    -0.5567 * (e / 5 - 7.222) +
    0.451 * (lnU - 5.137);
  const expLp = Math.exp(lp);
  const r2 = 1 - Math.pow(0.9832, expLp);
  const r5 = 1 - Math.pow(0.9365, expLp);

  const toPct = (x) => {
    if (!Number.isFinite(x)) return null;
    const pct = x * 100;
    if (!Number.isFinite(pct)) return null;
    return Math.max(0, Math.min(100, pct));
  };

  return { risk2YearPct: toPct(r2), risk5YearPct: toPct(r5) };
}

function computeKidneyAge({ ageYears, egfr }) {
  const age = Number.isFinite(ageYears) ? ageYears : null;
  const e = Number.isFinite(egfr) ? egfr : null;
  if (!Number.isFinite(age) || age <= 0) return { normalEgfrForAge: null, kidneyAgeYears: null, ckdScoreYears: null, ckd20Plus: null };
  if (!Number.isFinite(e) || e <= 0) return { normalEgfrForAge: null, kidneyAgeYears: null, ckdScoreYears: null, ckd20Plus: null };

  const normalEgfrForAge = 105 - 0.9 * (age - 40);
  const kidneyAge = 40 + (105 - e) / 0.9;
  const ckdScore = kidneyAge - age;
  const ckd20Plus = Number.isFinite(ckdScore) ? ckdScore >= 20 : null;

  return { normalEgfrForAge, kidneyAgeYears: kidneyAge, ckdScoreYears: ckdScore, ckd20Plus };
}

function computeInsulinResistance({ fastingGlucoseMg_dL, fastingInsulinUu_mL }) {
  const g = Number.isFinite(fastingGlucoseMg_dL) ? fastingGlucoseMg_dL : null;
  const i = Number.isFinite(fastingInsulinUu_mL) ? fastingInsulinUu_mL : null;
  if (!Number.isFinite(g) || !Number.isFinite(i) || g <= 0 || i <= 0) {
    return { homaIr: null, quicki: null };
  }
  const homaIr = (g * i) / 405;
  const quicki = 1 / (Math.log10(i) + Math.log10(g));
  return { homaIr, quicki };
}

async function generateKidneyHealthWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 20000) : "";
  const userPrompt = buildKidneyHealthUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = KIDNEY_HEALTH_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const root =
    payload?.kidneyHealth && typeof payload.kidneyHealth === "object"
      ? payload.kidneyHealth
      : payload?.renalHealth && typeof payload.renalHealth === "object"
        ? payload.renalHealth
        : payload;
  const labs = root?.labs && typeof root.labs === "object" ? root.labs : {};

  const egfr = parseOptionalNumberLoose(labs?.egfrMlMin1_73m2 ?? labs?.egfr ?? root?.egfr);
  const uacr = parseOptionalNumberLoose(labs?.uacrMg_g ?? labs?.uacr ?? labs?.acr ?? root?.uacr);
  const serumCreatinine = parseOptionalNumberLoose(labs?.serumCreatinineMg_dL ?? labs?.creatinine ?? root?.serumCreatinine);

  const ageYears = Number.isFinite(patient?.age) ? patient.age : null;
  const sex = typeof patient?.sex === "string" ? patient.sex : "";
  const computed = {
    kidneyFailureRisk: computeKidneyFailureRisk({ ageYears, sex, egfr, uacr }),
    kidneyAge: computeKidneyAge({ ageYears, egfr })
  };

  const normalized = {
    labs: {
      egfrMlMin1_73m2: Number.isFinite(egfr) ? egfr : null,
      uacrMg_g: Number.isFinite(uacr) ? uacr : null,
      serumCreatinineMg_dL: Number.isFinite(serumCreatinine) ? serumCreatinine : null
    },
    otherFindings: typeof root?.otherFindings === "string" ? root.otherFindings : "",
    notes: Array.isArray(root?.notes) ? root.notes : [],
    computed
  };

  payload.kidneyHealth = normalized;
  if (debug) payload.raw = raw;
  return payload;
}

async function generateDiabetesRiskWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 20000) : "";
  const userPrompt = buildDiabetesRiskUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = DIABETES_RISK_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const root =
    payload?.diabetesRisk && typeof payload.diabetesRisk === "object"
      ? payload.diabetesRisk
      : payload?.diabetes && typeof payload.diabetes === "object"
        ? payload.diabetes
        : payload;
  const labs = root?.labs && typeof root.labs === "object" ? root.labs : {};

  const hba1cPct = parseOptionalNumberLoose(labs?.hba1cPct ?? labs?.hba1c ?? root?.hba1c);
  const fastingGlucoseMg_dL = parseOptionalNumberLoose(
    labs?.fastingGlucoseMg_dL ?? labs?.fastingGlucose ?? labs?.fbs ?? root?.fastingGlucose
  );
  const fastingInsulinUu_mL = parseOptionalNumberLoose(
    labs?.fastingInsulinUu_mL ?? labs?.fastingInsulin ?? labs?.insulin ?? root?.fastingInsulin
  );
  const ldlMg_dL = parseOptionalNumberLoose(labs?.ldlMg_dL ?? labs?.ldl ?? labs?.ldlCholesterol ?? root?.ldl);

  const computed = {
    insulinResistance: computeInsulinResistance({ fastingGlucoseMg_dL, fastingInsulinUu_mL })
  };

  const normalized = {
    labs: {
      hba1cPct: Number.isFinite(hba1cPct) ? hba1cPct : null,
      fastingGlucoseMg_dL: Number.isFinite(fastingGlucoseMg_dL) ? fastingGlucoseMg_dL : null,
      fastingInsulinUu_mL: Number.isFinite(fastingInsulinUu_mL) ? fastingInsulinUu_mL : null,
      ldlMg_dL: Number.isFinite(ldlMg_dL) ? ldlMg_dL : null
    },
    computed
  };

  payload.diabetesRisk = normalized;
  if (debug) payload.raw = raw;
  return payload;
}

async function generateWomenHealthWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 20000) : "";
  const userPrompt = buildWomenHealthUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = WOMEN_HEALTH_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const root =
    payload?.womenHealth && typeof payload.womenHealth === "object"
      ? payload.womenHealth
      : payload?.women && typeof payload.women === "object"
        ? payload.women
        : payload;

  const toBool = (v) => {
    if (v === true || v === false) return v;
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (s === "yes" || s === "true" || s === "1") return true;
    if (s === "no" || s === "false" || s === "0") return false;
    return null;
  };

  const breast = root?.breast && typeof root.breast === "object" ? root.breast : {};
  const cervix = root?.cervix && typeof root.cervix === "object" ? root.cervix : {};
  const ovary = root?.ovary && typeof root.ovary === "object" ? root.ovary : {};
  const uterus = root?.uterus && typeof root.uterus === "object" ? root.uterus : {};

  const numberOfBreastBiopsies = parseOptionalNumberLoose(
    breast?.numberOfBreastBiopsies ?? breast?.breastBiopsiesCount ?? breast?.biopsies
  );
  const firstDegreeRelativesBreastCancerCount = parseOptionalNumberLoose(
    breast?.firstDegreeRelativesBreastCancerCount ?? breast?.firstDegreeRelatives ?? breast?.relativesWithBreastCancer
  );
  const ca125 = parseOptionalNumberLoose(ovary?.ca125 ?? root?.ca125 ?? root?.ca_125);
  const endometrialThicknessMm = parseOptionalNumberLoose(
    uterus?.endometrialThicknessMm ?? uterus?.endometrialThickness ?? root?.endometrialThicknessMm
  );

  const genesHealthRaw = root?.genesHealth && typeof root.genesHealth === "object" ? root.genesHealth : {};

  const normalized = {
    breast: {
      raceEthnicity: typeof breast?.raceEthnicity === "string" ? breast.raceEthnicity : "",
      numberOfBreastBiopsies: Number.isFinite(numberOfBreastBiopsies) ? numberOfBreastBiopsies : null,
      atypicalHyperplasia: toBool(breast?.atypicalHyperplasia),
      firstDegreeRelativesBreastCancerCount: Number.isFinite(firstDegreeRelativesBreastCancerCount)
        ? firstDegreeRelativesBreastCancerCount
        : null,
      personalBreastCancerHistory: toBool(breast?.personalBreastCancerHistory),
      mammogramSummary: typeof breast?.mammogramSummary === "string" ? breast.mammogramSummary : ""
    },
    cervix: {
      papSmearSummary: typeof cervix?.papSmearSummary === "string" ? cervix.papSmearSummary : "",
      hpvSummary: typeof cervix?.hpvSummary === "string" ? cervix.hpvSummary : ""
    },
    ovary: {
      transvaginalUltrasoundSummary:
        typeof ovary?.transvaginalUltrasoundSummary === "string" ? ovary.transvaginalUltrasoundSummary : "",
      ca125: Number.isFinite(ca125) ? ca125 : null,
      ca125Summary: typeof ovary?.ca125Summary === "string" ? ovary.ca125Summary : ""
    },
    uterus: {
      endometrialThicknessMm: Number.isFinite(endometrialThicknessMm) ? endometrialThicknessMm : null,
      endometrialBiopsySummary: typeof uterus?.endometrialBiopsySummary === "string" ? uterus.endometrialBiopsySummary : ""
    },
    genesHealth: {
      brcaGenePositive: toBool(genesHealthRaw?.brcaGenePositive),
      brca1: toBool(genesHealthRaw?.brca1),
      brca2: toBool(genesHealthRaw?.brca2),
      genesHealthNotes: typeof genesHealthRaw?.genesHealthNotes === "string" ? genesHealthRaw.genesHealthNotes : ""
    },
    notes: Array.isArray(root?.notes) ? root.notes : []
  };

  payload.womenHealth = normalized;
  if (debug) payload.raw = raw;
  return payload;
}

async function generateBoneHealthWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 20000) : "";
  const userPrompt = buildBoneHealthUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = BONE_HEALTH_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const root =
    payload?.boneHealth && typeof payload.boneHealth === "object"
      ? payload.boneHealth
      : payload?.bone && typeof payload.bone === "object"
        ? payload.bone
        : payload;

  const dexa = root?.dexa && typeof root.dexa === "object" ? root.dexa : {};
  const audiogram = root?.audiogram && typeof root.audiogram === "object" ? root.audiogram : {};
  const frax = root?.frax && typeof root.frax === "object" ? root.frax : {};
  const falls = root?.falls && typeof root.falls === "object" ? root.falls : {};
  const frailty = root?.frailty && typeof root.frailty === "object" ? root.frailty : {};
  const cognition = root?.cognition && typeof root.cognition === "object" ? root.cognition : {};

  const femoralNeckBmdGcm2 = parseOptionalNumberLoose(dexa?.femoralNeckBmdGcm2 ?? dexa?.femoralNeckBmd);
  const femoralNeckTScore = parseOptionalNumberLoose(dexa?.femoralNeckTScore ?? dexa?.tScoreFemoralNeck);
  const totalHipTScore = parseOptionalNumberLoose(dexa?.totalHipTScore ?? dexa?.tScoreTotalHip);
  const lumbarSpineTScore = parseOptionalNumberLoose(dexa?.lumbarSpineTScore ?? dexa?.tScoreLumbarSpine);
  const majorOsteoporotic10yPct = parseOptionalNumberLoose(frax?.majorOsteoporotic10yPct ?? frax?.majorFractureRisk10yPct);
  const hip10yPct = parseOptionalNumberLoose(frax?.hip10yPct ?? frax?.hipFractureRisk10yPct);
  const fallsCountPastYear = parseOptionalIntegerLoose(falls?.fallsCountPastYear ?? falls?.fallsCount ?? falls?.numberOfFalls);
  const fratScore = parseOptionalNumberLoose(falls?.fratScore ?? falls?.frat ?? falls?.fratTotalScore);
  const bergBalanceScore = parseOptionalNumberLoose(falls?.bergBalanceScore ?? falls?.bergScore ?? falls?.bergsBalanceScore);
  const clinicalFrailtyScore = parseOptionalNumberLoose(
    frailty?.clinicalFrailtyScore ?? frailty?.cfs ?? frailty?.clinicalFrailtyScale
  );
  const miniCogScore = parseOptionalNumberLoose(cognition?.miniCogScore ?? cognition?.miniCog);
  const mocaScore = parseOptionalNumberLoose(cognition?.mocaScore ?? cognition?.moca);
  const fallsInPastYearRaw = typeof falls?.fallsInPastYear === "string" ? falls.fallsInPastYear.trim().toLowerCase() : "";
  const fallsInPastYear =
    fallsInPastYearRaw === "yes" || fallsInPastYearRaw === "y" || fallsInPastYearRaw === "true" || fallsInPastYearRaw === "1"
      ? "yes"
      : fallsInPastYearRaw === "no" || fallsInPastYearRaw === "n" || fallsInPastYearRaw === "false" || fallsInPastYearRaw === "0"
        ? "no"
        : "";

  const normalized = {
    dexa: {
      femoralNeckBmdGcm2: Number.isFinite(femoralNeckBmdGcm2) ? femoralNeckBmdGcm2 : null,
      femoralNeckTScore: Number.isFinite(femoralNeckTScore) ? femoralNeckTScore : null,
      totalHipTScore: Number.isFinite(totalHipTScore) ? totalHipTScore : null,
      lumbarSpineTScore: Number.isFinite(lumbarSpineTScore) ? lumbarSpineTScore : null,
      impression: typeof dexa?.impression === "string" ? dexa.impression : ""
    },
    audiogram: {
      summary: typeof audiogram?.summary === "string" ? audiogram.summary : ""
    },
    frax: {
      country: typeof frax?.country === "string" ? frax.country : "",
      majorOsteoporotic10yPct: Number.isFinite(majorOsteoporotic10yPct) ? majorOsteoporotic10yPct : null,
      hip10yPct: Number.isFinite(hip10yPct) ? hip10yPct : null
    },
    falls: {
      fallsInPastYear,
      fallsCountPastYear: Number.isFinite(fallsCountPastYear) ? fallsCountPastYear : null,
      fratScore: Number.isFinite(fratScore) ? fratScore : null,
      bergBalanceScore: Number.isFinite(bergBalanceScore) ? bergBalanceScore : null,
      hcpaSummary: typeof falls?.hcpaSummary === "string" ? falls.hcpaSummary : ""
    },
    frailty: {
      clinicalFrailtyScore: Number.isFinite(clinicalFrailtyScore) ? clinicalFrailtyScore : null
    },
    cognition: {
      miniCogScore: Number.isFinite(miniCogScore) ? miniCogScore : null,
      mocaScore: Number.isFinite(mocaScore) ? mocaScore : null
    },
    notes: Array.isArray(root?.notes) ? root.notes : []
  };

  payload.boneHealth = normalized;
  if (debug) payload.raw = raw;
  return payload;
}

async function generateAdultVaccinationWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 20000) : "";
  const userPrompt = buildAdultVaccinationUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = ADULT_VACCINATION_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const root =
    payload?.adultVaccination && typeof payload.adultVaccination === "object"
      ? payload.adultVaccination
      : payload?.vaccination && typeof payload.vaccination === "object"
        ? payload.vaccination
        : payload;

  const normalizeYesNo = (v) => {
    if (v === true) return "yes";
    if (v === false) return "no";
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (!s) return "";
    if (s === "yes" || s === "y" || s === "true" || s === "1") return "yes";
    if (s === "no" || s === "n" || s === "false" || s === "0") return "no";
    return "";
  };

  const normalizeRiskFactor = (v) => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (!s) return "";
    if (s === "diabetes") return "diabetes";
    if (s === "ckd" || s.includes("kidney")) return "ckd";
    if (s === "smokers" || s === "smoker" || s.includes("smok")) return "smokers";
    if (s.includes("alcohol")) return "alcohol_use_disorder";
    if (s.includes("immuno")) return "immunocompromised";
    if (s === "hiv") return "hiv";
    if (s.includes("cancer") || s.includes("malignan")) return "cancer";
    if (s.includes("asplenia") || s.includes("splen")) return "asplenia";
    if (s.includes("cochlear")) return "cochlear_implant";
    if (s.includes("csf")) return "csf_leak";
    if (s.includes("copd") || s.includes("asthma") || s.includes("chronic lung")) return "chronic_lung_disease";
    if (s.includes("chronic heart") || s.includes("cardiac") || s.includes("heart disease")) return "chronic_heart_disease";
    if (s.includes("chronic liver") || s.includes("cirrhos") || s.includes("hepatitis") || s.includes("liver disease"))
      return "chronic_liver_disease";
    if (s.includes("healthcare") || s.includes("health care") || s.includes("hcw")) return "healthcare_workers";
    if (s.includes("high-risk") || s.includes("high risk")) return "high_risk_individuals";
    return "";
  };

  const normalizePrevnar = (v) => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (!s) return "prevnar_20";
    if (s.includes("prevnar") || s.includes("prevenar")) {
      if (s.includes("20")) return "prevnar_20";
      return "prevnar_20";
    }
    if (s === "prevnar_20") return "prevnar_20";
    return "prevnar_20";
  };

  const riskFactorsRaw = Array.isArray(root?.riskFactors) ? root.riskFactors : Array.isArray(root?.riskFactor) ? root.riskFactor : [];
  const riskFactors = Array.from(
    new Set(
      riskFactorsRaw
        .map(normalizeRiskFactor)
        .filter((x) => x)
        .filter((x) => typeof x === "string")
    )
  );

  const flu = root?.flu && typeof root.flu === "object" ? root.flu : {};
  const pneumonia = root?.pneumonia && typeof root.pneumonia === "object" ? root.pneumonia : {};
  const shingrix = root?.shingrix && typeof root.shingrix === "object" ? root.shingrix : {};
  const hepatitisB = root?.hepatitisB && typeof root.hepatitisB === "object" ? root.hepatitisB : {};
  const hepatitisA = root?.hepatitisA && typeof root.hepatitisA === "object" ? root.hepatitisA : {};
  const cervicalCancer = root?.cervicalCancer && typeof root.cervicalCancer === "object" ? root.cervicalCancer : {};

  const normalized = {
    riskFactors,
    flu: { planned: normalizeYesNo(flu?.planned ?? flu?.recommended) },
    pneumonia: {
      planned: normalizeYesNo(pneumonia?.planned ?? pneumonia?.recommended),
      vaccine: normalizePrevnar(pneumonia?.vaccine ?? pneumonia?.brand ?? pneumonia?.name)
    },
    shingrix: {
      planned: normalizeYesNo(shingrix?.planned ?? shingrix?.recommended),
      dose1: typeof shingrix?.dose1 === "string" ? shingrix.dose1 : "",
      dose2: typeof shingrix?.dose2 === "string" ? shingrix.dose2 : ""
    },
    hepatitisB: {
      planned: normalizeYesNo(hepatitisB?.planned ?? hepatitisB?.recommended),
      schedule: typeof hepatitisB?.schedule === "string" ? hepatitisB.schedule : ""
    },
    hepatitisA: { planned: normalizeYesNo(hepatitisA?.planned ?? hepatitisA?.recommended) },
    cervicalCancer: { planned: normalizeYesNo(cervicalCancer?.planned ?? cervicalCancer?.recommended) },
    notes: Array.isArray(root?.notes) ? root.notes : []
  };

  payload.adultVaccination = normalized;
  if (debug) payload.raw = raw;
  return payload;
}

async function generateCancerScreeningWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 20000) : "";
  const userPrompt = buildCancerScreeningUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = CANCER_SCREENING_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const root =
    payload?.cancerScreening && typeof payload.cancerScreening === "object"
      ? payload.cancerScreening
      : payload?.screening && typeof payload.screening === "object"
        ? payload.screening
        : payload;

  const normalizeYesNo = (v) => {
    if (v === true) return "yes";
    if (v === false) return "no";
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (!s) return "";
    if (s === "yes" || s === "y" || s === "true" || s === "1") return "yes";
    if (s === "no" || s === "n" || s === "false" || s === "0") return "no";
    return "";
  };

  const toNumberOrNull = (v) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "string") return null;
    const s = v.trim().replace(/,/g, "");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeMarker = (obj, { defaultUnit } = {}) => {
    const o = obj && typeof obj === "object" ? obj : {};
    const value = toNumberOrNull(o.value ?? o.result ?? o.level);
    const unit = typeof o.unit === "string" ? o.unit : typeof defaultUnit === "string" ? defaultUnit : "";
    const date = typeof o.date === "string" ? o.date : "";
    const summary = typeof o.summary === "string" ? o.summary : typeof o.impression === "string" ? o.impression : "";
    const done = normalizeYesNo(o.done ?? o.completed);
    return { done, value, unit, date, summary };
  };

  const psa = root?.psa && typeof root.psa === "object" ? root.psa : {};
  const total = normalizeMarker(psa?.total, { defaultUnit: "ng/mL" });
  const free = normalizeMarker(psa?.free);

  const bloodCancerPanel = root?.bloodCancerPanel && typeof root.bloodCancerPanel === "object" ? root.bloodCancerPanel : {};
  const stool = root?.stoolOccultBloodTest && typeof root.stoolOccultBloodTest === "object" ? root.stoolOccultBloodTest : {};
  const hrct = root?.lowDoseHrctChest && typeof root.lowDoseHrctChest === "object" ? root.lowDoseHrctChest : {};
  const ultra = root?.ultraPremium50plus && typeof root.ultraPremium50plus === "object" ? root.ultraPremium50plus : {};

  const normalized = {
    summary: typeof root?.summary === "string" ? root.summary : "",
    psa: { total, free },
    afp: normalizeMarker(root?.afp),
    ca125: normalizeMarker(root?.ca125),
    cea: normalizeMarker(root?.cea),
    bloodCancerPanel: {
      done: normalizeYesNo(bloodCancerPanel?.done ?? bloodCancerPanel?.completed),
      summary: typeof bloodCancerPanel?.summary === "string" ? bloodCancerPanel.summary : ""
    },
    stoolOccultBloodTest: {
      done: normalizeYesNo(stool?.done ?? stool?.completed),
      result: typeof stool?.result === "string" ? stool.result : "",
      date: typeof stool?.date === "string" ? stool.date : "",
      summary:
        typeof stool?.summary === "string"
          ? stool.summary
          : typeof stool?.impression === "string"
            ? stool.impression
            : ""
    },
    lowDoseHrctChest: {
      done: normalizeYesNo(hrct?.done ?? hrct?.completed),
      summary:
        typeof hrct?.summary === "string"
          ? hrct.summary
          : typeof hrct?.impression === "string"
            ? hrct.impression
            : ""
    },
    ultraPremium50plus: {
      done: normalizeYesNo(ultra?.done ?? ultra?.completed),
      summary:
        typeof ultra?.summary === "string"
          ? ultra.summary
          : typeof ultra?.impression === "string"
            ? ultra.impression
            : ""
    },
    notes: Array.isArray(root?.notes) ? root.notes : []
  };

  payload.cancerScreening = normalized;
  if (debug) payload.raw = raw;
  return payload;
}

async function generateGenesHealthWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 20000) : "";
  const userPrompt = buildGenesHealthUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = GENES_HEALTH_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const root =
    payload?.genesHealth && typeof payload.genesHealth === "object"
      ? payload.genesHealth
      : payload?.genes && typeof payload.genes === "object"
        ? payload.genes
        : payload;

  const allowed = new Set([
    "genetic_risk_cad",
    "integrated_risk_cad",
    "genetic_diabetes_risk_score",
    "genetic_risk_obesity",
    "personalized_drug_response",
    "genetic_risk_hypertension",
    "genetic_risk_nafld",
    "genetic_risk_hypercholesterolemia",
    "biological_age_pace_of_aging",
    "genetic_risk_parkinsons_alzheimers",
    "genetic_risk_hereditary_cancer",
    "genetic_risk_amd",
    "dna_variations_common_diseases_drug_response",
    "genetic_risk_of_specific_categories"
  ]);

  const normalizeKey = (v) => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (!s) return "";
    if (allowed.has(s)) return s;
    if (s.includes("integrated") && (s.includes("cad") || s.includes("coronary"))) return "integrated_risk_cad";
    if (s.includes("coronary") || s.includes("cad")) return "genetic_risk_cad";
    if (s.includes("diabet")) return "genetic_diabetes_risk_score";
    if (s.includes("obes")) return "genetic_risk_obesity";
    if (s.includes("drug") || s.includes("response")) return "personalized_drug_response";
    if (s.includes("hypert")) return "genetic_risk_hypertension";
    if (s.includes("fatty liver") || s.includes("nafld") || s.includes("non-alcoholic")) return "genetic_risk_nafld";
    if (s.includes("hyperchol")) return "genetic_risk_hypercholesterolemia";
    if (s.includes("biological age") || s.includes("pace of aging") || s.includes("ageing") || s.includes("aging"))
      return "biological_age_pace_of_aging";
    if (s.includes("parkinson") || s.includes("alzheimer")) return "genetic_risk_parkinsons_alzheimers";
    if (s.includes("hereditary cancer") || (s.includes("cancer") && s.includes("heredit"))) return "genetic_risk_hereditary_cancer";
    if (s.includes("macular") || s.includes("amd")) return "genetic_risk_amd";
    if (s.includes("predispose") || s.includes("common diseases") || s.includes("drug effectiveness"))
      return "dna_variations_common_diseases_drug_response";
    if (s.startsWith("genetic risk of") || s.includes("carrier screening") || s.includes("pregn"))
      return "genetic_risk_of_specific_categories";
    return "";
  };

  const selectedRaw = Array.isArray(root?.selected)
    ? root.selected
    : Array.isArray(root?.items)
      ? root.items
      : Array.isArray(root?.tests)
        ? root.tests
        : [];
  const selected = Array.from(
    new Set(
      selectedRaw
        .map(normalizeKey)
        .filter((x) => x)
        .filter((x) => allowed.has(x))
    )
  );

  const normalized = {
    selected,
    notes: Array.isArray(root?.notes) ? root.notes : []
  };

  payload.genesHealth = normalized;
  if (debug) payload.raw = raw;
  return payload;
}

async function generateBrainHealthAssessmentWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 20000) : "";
  const userPrompt = buildBrainHealthAssessmentUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = BRAIN_HEALTH_ASSESSMENT_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const root =
    payload?.brainHealthAssessment && typeof payload.brainHealthAssessment === "object"
      ? payload.brainHealthAssessment
      : payload;

  const toStringOrEmpty = (v) => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return "";
  };

  const normalizeCarotidFindings = (o) => {
    const f = o && typeof o === "object" ? o : {};
    return {
      cimt: toStringOrEmpty(f.cimt),
      plaque: toStringOrEmpty(f.plaque),
      stenosis: toStringOrEmpty(f.stenosis)
    };
  };

  const normalizeMriFindings = (o) => {
    const f = o && typeof o === "object" ? o : {};
    return {
      whiteMatterHyperintensities: toStringOrEmpty(f.whiteMatterHyperintensities),
      silentInfarcts: toStringOrEmpty(f.silentInfarcts),
      brainAtrophy: toStringOrEmpty(f.brainAtrophy)
    };
  };

  const carotid = root?.carotidDoppler && typeof root.carotidDoppler === "object" ? root.carotidDoppler : {};
  const mri = root?.mriBrain && typeof root.mriBrain === "object" ? root.mriBrain : {};
  const genetic = root?.geneticTesting && typeof root.geneticTesting === "object" ? root.geneticTesting : {};

  const normalized = {
    carotidDoppler: {
      category: toStringOrEmpty(carotid.category),
      reportedAt: toStringOrEmpty(carotid.reportedAt),
      summary: toStringOrEmpty(carotid.summary),
      findings: normalizeCarotidFindings(carotid.findings)
    },
    mriBrain: {
      category: toStringOrEmpty(mri.category),
      reportedAt: toStringOrEmpty(mri.reportedAt),
      summary: toStringOrEmpty(mri.summary),
      findings: normalizeMriFindings(mri.findings)
    },
    geneticTesting: {
      apoe: toStringOrEmpty(genetic.apoe),
      lrrk2: toStringOrEmpty(genetic.lrrk2)
    },
    notes: Array.isArray(root?.notes) ? root.notes : []
  };

  payload.brainHealthAssessment = normalized;
  if (debug) payload.raw = raw;
  return payload;
}

async function generateAllergyPanelsWithAi({ openai, provider, patient, extractedText, imageFiles, debug }) {
  const textForPrompt = requireString(extractedText) ? capTextForPrompt(extractedText, 20000) : "";
  const userPrompt = buildAllergyPanelsUserPrompt({ patient, extractedText: textForPrompt });
  const systemPrompt = ALLERGY_PANELS_SYSTEM_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  let raw = "";

  if (resolvedProvider === "gemini") {
    const parts = [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    raw = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    raw = getTextFromAnthropicMessageResponse(response);
  } else {
    if (!openai) throw new Error("OpenAI client is not available");
    const contentParts = [{ type: "text", text: userPrompt }];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? null;
  const payload = parsed && typeof parsed === "object" ? parsed : {};

  const root =
    payload?.allergyPanels && typeof payload.allergyPanels === "object"
      ? payload.allergyPanels
      : payload?.allergy && typeof payload.allergy === "object"
        ? payload.allergy
        : payload;

  const toStringOrEmpty = (v) => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return "";
  };

  const normalizeTest = (t) => {
    const o = t && typeof t === "object" ? t : {};
    return {
      name: toStringOrEmpty(o.name ?? o.testName ?? o.test ?? o.parameter),
      value: toStringOrEmpty(o.value ?? o.result ?? o.level),
      unit: toStringOrEmpty(o.unit ?? o.units),
      class: toStringOrEmpty(o.class ?? o.grade),
      referenceRange: toStringOrEmpty(o.referenceRange ?? o.refRange ?? o.reference),
      flag: toStringOrEmpty(o.flag ?? o.status),
      interpretation: toStringOrEmpty(o.interpretation ?? o.comment ?? o.remarks)
    };
  };

  const normalizePanel = (p) => {
    const o = p && typeof p === "object" ? p : {};
    const testsRaw = Array.isArray(o.tests) ? o.tests : Array.isArray(o.items) ? o.items : [];
    const tests = testsRaw.map(normalizeTest).filter((t) => requireString(t.name));
    return {
      name: toStringOrEmpty(o.name ?? o.panelName ?? o.title),
      reportedAt: toStringOrEmpty(o.reportedAt ?? o.date ?? o.reportDate),
      summary: toStringOrEmpty(o.summary ?? o.impression),
      tests
    };
  };

  const panelsRaw = Array.isArray(root?.panels)
    ? root.panels
    : Array.isArray(root?.results)
      ? root.results
      : Array.isArray(root?.data)
        ? root.data
        : [];
  const panels = panelsRaw.map(normalizePanel).filter((p) => requireString(p.name) || p.tests.length > 0);

  const normalized = {
    panels,
    notes: Array.isArray(root?.notes) ? root.notes : []
  };

  payload.allergyPanels = normalized;
  if (debug) payload.raw = raw;
  return payload;
}

function getTextFromMessageContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

function getTextFromResponsesOutput(response) {
  if (requireString(response?.output_text)) return response.output_text;
  const output = response?.output;
  if (!Array.isArray(output)) return "";

  const texts = [];
  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string") texts.push(part.text);
      else if (part?.type === "text" && typeof part.text === "string") texts.push(part.text);
    }
  }

  return texts.join("\n");
}

function extractFirstJsonObjectText(text) {
  if (!requireString(text)) return null;
  const s = String(text);
  const start = s.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function isImageMime(mime) {
  const m = typeof mime === "string" ? mime : mime?.mimetype ?? "";
  return String(m).toLowerCase().startsWith("image/");
}

function isPdfMime(input) {
  const mime = typeof input === "string" ? input : input?.mimetype;
  if (mime === "application/pdf") return true;
  if (mime === "application/octet-stream") {
    const name = typeof input?.originalname === "string" ? input.originalname.toLowerCase() : "";
    return name.endsWith(".pdf");
  }
  return false;
}

function isDocxMime(input) {
  const mime = typeof input === "string" ? input : input?.mimetype;
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return true;
  if (mime === "application/octet-stream") {
    const name = typeof input?.originalname === "string" ? input.originalname.toLowerCase() : "";
    return name.endsWith(".docx");
  }
  return false;
}

function collectUploadedFiles(req) {
  const uploaded = [];
  if (Array.isArray(req?.files)) uploaded.push(...req.files);
  else if (req?.files && typeof req.files === "object") {
    for (const arr of Object.values(req.files)) {
      if (Array.isArray(arr)) uploaded.push(...arr);
    }
  }
  if (req?.file) uploaded.push(req.file);
  return uploaded;
}

async function extractPdfTextRawForPrompt(pdfFiles) {
  const maxPdfTextChars = 80000;
  let extractedText = "";
  for (const f of Array.isArray(pdfFiles) ? pdfFiles : []) {
    if (extractedText.length >= maxPdfTextChars) break;
    const parsed = await pdfParse(f.buffer);
    const extracted = typeof parsed?.text === "string" ? parsed.text : "";
    const trimmed = extracted.trim();
    if (!trimmed) continue;
    const capped = trimmed.length > 20000 ? trimmed.slice(0, 20000) : trimmed;
    const next = `\n\n[PDF: ${f.originalname}]\n${capped}`;
    extractedText = (extractedText + next).slice(0, maxPdfTextChars);
  }
  return extractedText;
}

async function extractPdfTextForPrompt(pdfFiles) {
  const maxPdfTextChars = 80000;
  let extractedText = "";
  for (const f of pdfFiles) {
    if (extractedText.length >= maxPdfTextChars) break;
    const parsed = await pdfParse(f.buffer);
    const extracted = typeof parsed?.text === "string" ? parsed.text : "";
    const capped = capTextForPromptWithAnchors(extracted, 12000, [
      "Complete Urinogram",
      "Urinogram",
      "Microscopic Examination",
      "Chemical Examination",
      "Urinary Protein",
      "Urinary Glucose"
    ]);
    if (!capped) continue;
    const next = `\n\n[PDF: ${f.originalname}]\n${capped}`;
    extractedText = (extractedText + next).slice(0, maxPdfTextChars);
  }
  return extractedText;
}

async function extractPdfTextForBloodPrompt(pdfFiles) {
  const maxPdfTextChars = 240000;
  let extractedText = "";
  for (const f of pdfFiles) {
    if (extractedText.length >= maxPdfTextChars) break;
    const parsed = await pdfParse(f.buffer);
    const extracted = typeof parsed?.text === "string" ? parsed.text : "";
    const trimmed = extracted.trim();
    if (!trimmed) continue;
    const next = `\n\n[PDF: ${f.originalname}]\n${trimmed}`;
    extractedText = (extractedText + next).slice(0, maxPdfTextChars);
  }
  return extractedText;
}

async function extractDocxTextForBloodPrompt(docxFiles) {
  const maxDocxTextChars = 240000;
  let extractedText = "";
  for (const f of docxFiles) {
    if (extractedText.length >= maxDocxTextChars) break;
    const result = await mammoth.extractRawText({ buffer: f.buffer });
    const extracted = typeof result?.value === "string" ? result.value : "";
    const trimmed = extracted.trim();
    if (!trimmed) continue;
    const next = `\n\n[DOCX: ${f.originalname}]\n${trimmed}`;
    extractedText = (extractedText + next).slice(0, maxDocxTextChars);
  }
  return extractedText;
}

async function extractDocxTextForPrompt(docxFiles) {
  const maxDocxTextChars = 80000;
  let extractedText = "";
  for (const f of docxFiles) {
    if (extractedText.length >= maxDocxTextChars) break;
    const result = await mammoth.extractRawText({ buffer: f.buffer });
    const extracted = typeof result?.value === "string" ? result.value : "";
    const capped = capTextForPromptWithAnchors(extracted, 12000, [
      "Complete Urinogram",
      "Urinogram",
      "Microscopic Examination",
      "Chemical Examination",
      "Urinary Protein",
      "Urinary Glucose"
    ]);
    if (!capped) continue;
    const next = `\n\n[DOCX: ${f.originalname}]\n${capped}`;
    extractedText = (extractedText + next).slice(0, maxDocxTextChars);
  }
  return extractedText;
}

async function extractDocxTextRawForPrompt(docxFiles) {
  const maxDocxTextChars = 80000;
  let extractedText = "";
  for (const f of Array.isArray(docxFiles) ? docxFiles : []) {
    if (extractedText.length >= maxDocxTextChars) break;
    const result = await mammoth.extractRawText({ buffer: f.buffer });
    const extracted = typeof result?.value === "string" ? result.value : "";
    const trimmed = extracted.trim();
    if (!trimmed) continue;
    const capped = trimmed.length > 20000 ? trimmed.slice(0, 20000) : trimmed;
    const next = `\n\n[DOCX: ${f.originalname}]\n${capped}`;
    extractedText = (extractedText + next).slice(0, maxDocxTextChars);
  }
  return extractedText;
}

function getChunkParams(req) {
  const chunkIndex = parseMaybeNumber(req?.body?.chunkIndex) ?? 0;
  const chunkSize = parseMaybeNumber(req?.body?.chunkSize) ?? 150;
  return {
    chunkIndex: Math.max(0, Math.trunc(chunkIndex)),
    chunkSize: Math.max(1, Math.trunc(chunkSize))
  };
}

function sliceChunk(list, chunkIndex, chunkSize) {
  const items = Array.isArray(list) ? list : [];
  const totalChunks = Math.max(1, Math.ceil(items.length / chunkSize));
  const safeIndex = Math.min(Math.max(0, chunkIndex), totalChunks - 1);
  const start = safeIndex * chunkSize;
  const end = start + chunkSize;
  return { safeIndex, totalChunks, chunk: items.slice(start, end) };
}

function sliceChunkFixed(list, chunkIndex, maxChunks) {
  const items = Array.isArray(list) ? list : [];
  const requested = Number.isFinite(maxChunks) ? Math.max(1, Math.trunc(maxChunks)) : 4;
  const totalChunks = Math.max(1, Math.min(requested, items.length || 1));
  const chunkSize = Math.max(1, Math.ceil(items.length / totalChunks));
  const safeIndex = Math.min(Math.max(0, chunkIndex), totalChunks - 1);
  const start = safeIndex * chunkSize;
  const end = start + chunkSize;
  return { safeIndex, totalChunks, chunkSize, chunk: items.slice(start, end) };
}

function sliceTextFixed(text, chunkIndex, maxChunks) {
  const s = typeof text === "string" ? text : "";
  const requested = Number.isFinite(maxChunks) ? Math.max(1, Math.trunc(maxChunks)) : 4;
  const totalChunks = Math.max(1, Math.min(requested, s.length || 1));
  const chunkSize = Math.max(1, Math.ceil(s.length / totalChunks));
  const safeIndex = Math.min(Math.max(0, chunkIndex), totalChunks - 1);
  const start = safeIndex * chunkSize;
  const end = start + chunkSize;
  return { safeIndex, totalChunks, chunkSize, chunkText: s.slice(start, end) };
}

function sliceTextFixedWithOverlap(text, chunkIndex, maxChunks, overlapChars) {
  const s = typeof text === "string" ? text : "";
  const requested = Number.isFinite(maxChunks) ? Math.max(1, Math.trunc(maxChunks)) : 4;
  const totalChunks = Math.max(1, Math.min(requested, s.length || 1));
  const chunkSize = Math.max(1, Math.ceil(s.length / totalChunks));
  const safeIndex = Math.min(Math.max(0, chunkIndex), totalChunks - 1);

  const overlap = Number.isFinite(overlapChars) ? Math.max(0, Math.trunc(overlapChars)) : 0;
  const baseStart = safeIndex * chunkSize;
  const baseEnd = baseStart + chunkSize;
  const start = Math.max(0, baseStart - (safeIndex > 0 ? overlap : 0));
  const end = Math.min(s.length, baseEnd + (safeIndex < totalChunks - 1 ? overlap : 0));

  return {
    safeIndex,
    totalChunks,
    chunkSize,
    chunkText: s.slice(start, end)
  };
}

function splitTextWindows(text, windowChars, overlapChars, maxWindows) {
  const s = typeof text === "string" ? text : "";
  const trimmed = s.trim();
  if (!trimmed) return [];
  const size = Number.isFinite(windowChars) ? Math.max(4000, Math.trunc(windowChars)) : 12000;
  const overlap = Number.isFinite(overlapChars) ? Math.max(0, Math.trunc(overlapChars)) : 600;
  const cap = Number.isFinite(maxWindows) ? Math.max(1, Math.trunc(maxWindows)) : 8;
  const step = Math.max(1, size - overlap);

  const windows = [];
  for (let start = 0; start < s.length && windows.length < cap; start += step) {
    const end = Math.min(s.length, start + size);
    const chunk = s.slice(start, end);
    if (chunk.trim()) windows.push(chunk);
    if (end >= s.length) break;
  }
  return windows;
}

function heuristicExtractDocsTestsFromText(extractedText) {
  const text = typeof extractedText === "string" ? extractedText : "";
  if (!text.trim()) return [];

  const addressKeywordRegex =
    /\b(floor|flr|block|layout|phase|road|rd\.?|street|st\.?|sector|nagar|nag\.?|jp\s*nagar|bangalore|bengaluru|karnataka|india|pincode|pin\s*code|zip|district|state)\b/i;

  const looksLikeAddressLine = (line) => {
    const l = String(line ?? "").trim();
    if (!l) return false;
    const hasAddressKeyword = addressKeywordRegex.test(l);
    const hasPinLike = /\b[0-9]{5,6}\b/.test(l);
    const commaCount = (l.match(/,/g) || []).length;
    if (hasAddressKeyword && (commaCount >= 1 || hasPinLike)) return true;
    if (hasPinLike && commaCount >= 2) return true;
    return false;
  };

  const normalizedText = text
    .replace(/([A-Za-zµμ/%])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-zµμ/%])/g, "$1 $2")
    .replace(/[ \t]+/g, " ");

  const looksLikeRange = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    if (!/[0-9]/.test(v)) return false;
    return /(\bto\b|[-–—]|<|>)/i.test(v);
  };

  const looksLikeUnit = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    if (looksLikeRange(v)) return false;
    if (v.length > 25) return false;
    return /[a-z%/]/i.test(v);
  };

  const looksLikeValue = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    if (/[0-9]/.test(v)) return true;
    return /\b(absent|present|nil|negative|positive|trace|reactive|non\s*reactive)\b/i.test(v);
  };

  const looksLikeNumericValue = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    if (!/[0-9]/.test(v)) return false;
    return /^[<>]?[0-9]+([.,][0-9]+)?$/.test(v) || /^[0-9]+([.,][0-9]+)?%$/.test(v);
  };

  const isTechToken = (s) => {
    const v = String(s ?? "").trim().toUpperCase();
    if (!v) return false;
    return (
      v === "PHOTOMETRY" ||
      v === "CALCULATED" ||
      v === "CALC" ||
      v === "C.M.I." ||
      v === "CMI" ||
      v === "ECLIA" ||
      v === "ELISA" ||
      v === "CLIA" ||
      v === "HPLC" ||
      v === "ASSAY" ||
      v === "METHOD" ||
      v === "TECHNOLOGY"
    );
  };

  const ignoreLine = (line) => {
    const l = String(line ?? "").trim();
    if (!l) return true;
    if (l.length < 3 || l.length > 240) return true;
    if (looksLikeAddressLine(l)) return true;
    const lower = l.toLowerCase();
    if (lower.startsWith("page ")) return true;
    if (lower.includes("reference range") && lower.length < 50) return true;
    if (lower.includes("method") && lower.includes("unit") && lower.includes("result")) return true;
    if (lower.includes("patient") && lower.includes("name")) return true;
    if (lower.includes("collected") && lower.includes("reported")) return true;
    return false;
  };

  const lines = normalizedText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => !ignoreLine(l));

  const out = [];
  const seen = new Set();
  for (const line of lines) {
    if (looksLikeAddressLine(line)) continue;

    const hasColon = line.includes(":") && !line.includes("http");
    if (hasColon) {
      const idx = line.indexOf(":");
      const name = line.slice(0, idx).trim();
      const tail = line.slice(idx + 1).trim();
      if (name && looksLikeValue(tail) && !looksLikeAddressLine(name) && !looksLikeAddressLine(tail)) {
        const key = `${name.toLowerCase()}|${tail.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({
          testName: name,
          value: tail,
          results: [{ value: tail, dateAndTime: null }],
          unit: null,
          referenceRange: null,
          status: computeStatus({ value: tail, referenceRange: null, fallbackStatus: null }),
          section: null,
          page: null,
          remarks: null
          });
        }
        continue;
      }
    }

    const tokens = line.split(/\s+/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length < 2) continue;
    const numericIndex = tokens.findIndex((t) => looksLikeNumericValue(t));
    if (numericIndex === -1) continue;
    const value = tokens[numericIndex];
    if (!looksLikeValue(value)) continue;

    const tokenBefore = numericIndex > 0 ? tokens[numericIndex - 1] : null;
    const tokenAfter = numericIndex + 1 < tokens.length ? tokens[numericIndex + 1] : null;

    let unit = null;
    if (tokenBefore && looksLikeUnit(tokenBefore) && !isTechToken(tokenBefore)) unit = tokenBefore;
    if (!unit && tokenAfter && looksLikeUnit(tokenAfter) && !isTechToken(tokenAfter)) unit = tokenAfter;

    let nameTokens = [];
    if (numericIndex + 1 < tokens.length) {
      let start = numericIndex + 1;
      if (unit && tokens[start] === unit) start += 1;
      if (tokens[start] === "%") start += 1;
      nameTokens = tokens.slice(start);
    }

    if (nameTokens.length === 0 && numericIndex > 0) {
      nameTokens = tokens.slice(0, numericIndex);
      if (unit && nameTokens.length > 0 && nameTokens[nameTokens.length - 1] === unit) {
        nameTokens = nameTokens.slice(0, -1);
      }
    }

    while (nameTokens.length > 0 && isTechToken(nameTokens[0])) nameTokens.shift();
    const testName = nameTokens.join(" ").trim();
    if (!requireString(testName) || !/[a-z]/i.test(testName)) continue;
    if (looksLikeAddressLine(testName)) continue;

    let referenceRange = null;
    const rangeCandidates = tokens.filter((t) => looksLikeRange(t));
    if (rangeCandidates.length > 0) referenceRange = rangeCandidates[0];
    if (!unit && !referenceRange && looksLikeAddressLine(line)) continue;

    const key = `${testName.toLowerCase()}|${String(value).toLowerCase()}|${String(unit ?? "").toLowerCase()}|${String(referenceRange ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      testName,
      value,
      results: [{ value, dateAndTime: null }],
      unit,
      referenceRange,
      status: computeStatus({ value, referenceRange, fallbackStatus: null }),
      section: null,
      page: null,
      remarks: null
    });
  }

  return out;
}

function estimateTotalTestsInReportText(extractedText) {
  const text = typeof extractedText === "string" ? extractedText : "";
  if (!text.trim()) return null;
  const extracted = heuristicExtractDocsTestsFromText(text);
  const count = Array.isArray(extracted) ? extracted.length : 0;
  if (!Number.isFinite(count) || count <= 0) return null;
  return Math.min(5000, Math.trunc(count));
}

const MAX_UPLOAD_MB = (() => {
  const raw = process.env.MAX_UPLOAD_MB;
  const n = typeof raw === "string" ? Number(raw) : null;
  if (!Number.isFinite(n) || n <= 0) return 15;
  return Math.min(Math.round(n), 50);
})();

const MAX_ANALYSIS_FILES = 15;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: MAX_ANALYSIS_FILES
  }
});

export const gptRouter = express.Router();

gptRouter.post(
  "/gpt",
  upload.array("files", MAX_ANALYSIS_FILES),
  createGptChatHandler(getGptControllerContext)
);

function safeParseJsonObject(text) {
  if (!requireString(text)) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function safeParseJsonObjectLoose(text) {
  const direct = safeParseJsonObject(text);
  if (direct) return direct;
  const extracted = extractFirstJsonObjectText(text);
  if (!extracted) return null;
  return safeParseJsonObject(extracted);
}

function extractFirstJsonArrayText(text) {
  if (!requireString(text)) return null;
  const s = String(text);
  const start = s.indexOf("[");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function safeParseJsonArray(text) {
  if (!requireString(text)) return null;
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function safeParseJsonArrayLoose(text) {
  const direct = safeParseJsonArray(text);
  if (direct) return direct;
  const extracted = extractFirstJsonArrayText(text);
  if (!extracted) return null;
  return safeParseJsonArray(extracted);
}

async function repairJsonObjectWithClaude({ rawText, schemaHint, model }) {
  const cleaned = requireString(rawText) ? rawText : "";
  const system = JSON_REPAIR_SYSTEM_PROMPT;
  const user = buildJsonRepairObjectUserPrompt({ schemaHint, rawText: cleaned });

  const response = await anthropicCreateJsonMessage({
    system,
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
    model: requireString(model) ? model : process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    temperature: 0,
    maxTokens: 2048
  });

  const content = getTextFromAnthropicMessageResponse(response);
  return safeParseJsonObjectLoose(content);
}

async function repairJsonArrayWithClaude({ rawText, schemaHint, model }) {
  const cleaned = requireString(rawText) ? rawText : "";
  const system = JSON_REPAIR_SYSTEM_PROMPT;
  const user = buildJsonRepairArrayUserPrompt({ schemaHint, rawText: cleaned });

  const response = await anthropicCreateJsonMessage({
    system,
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
    model: requireString(model) ? model : process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    temperature: 0,
    maxTokens: 2048
  });

  const content = getTextFromAnthropicMessageResponse(response);
  return safeParseJsonArrayLoose(content);
}

function stripBrandingFromAdvancedBodyCompositionPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const report = payload.report;
  if (!report || typeof report !== "object" || Array.isArray(report)) return payload;

  const next = { ...payload, report: { ...report } };
  next.report.brand = null;
  next.report.deviceCode = null;
  next.report.title = "Body Composition Analysis Report";
  return next;
}

const HEART_TESTS = [
  "High Sensitivity C-Reactive Protein (HS-CRP)",
  "Total Cholesterol",
  "HDL Cholesterol",
  "LDL Cholesterol",
  "Triglycerides",
  "VLDL Cholesterol",
  "Non-HDL Cholesterol",
  "TC / HDL Ratio",
  "Triglyceride / HDL Ratio",
  "LDL / HDL Ratio",
  "HDL / LDL Ratio",
  "Lipoprotein (a) [Lp(a)]",
  "Apolipoprotein A1 (Apo-A1)",
  "Apolipoprotein B (Apo-B)",
  "Apo B / Apo A1 Ratio"
];

const HEART_RELATED_EXTRACT_TESTS = [
  "HS-CRP",
  "Homocysteine",
  "Lipoprotein (a) [Lp(a)]",
  "Apolipoprotein A1",
  "Apolipoprotein B",
  "Apo B / Apo A1 Ratio",
  "Total Cholesterol",
  "HDL Cholesterol",
  "LDL Cholesterol",
  "Triglycerides",
  "VLDL",
  "Non-HDL Cholesterol",
  "TC/HDL Ratio",
  "LDL/HDL Ratio",
  "Triglyceride/HDL Ratio",
  "HDL/LDL Ratio",
  "Fasting Blood Sugar",
  "HbA1c",
  "Average Blood Glucose",
  "Magnesium",
  "eGFR"
];

const BLOOD_ANALYSIS_EXTRACT_TESTS = uniqueTestNames([
  "Homocysteine",
  "Hematocrit (PCV)",
  "RDW-SD",
  "RDW SD",
  "Average Blood Glucose (ABG)",
  "Average Blood Glucose",
  "Fasting Blood Sugar",
  "HbA1c",
  "Testosterone",
  "HDL/LDL Ratio",
  "LDL Cholesterol",
  "Non-HDL Cholesterol",
  "Non HDL Cholesterol",
  "Total Cholesterol",
  "Trig/HDL Ratio",
  "Triglyceride/HDL Ratio",
  "Triglycerides",
  "VLDL Cholesterol",
  "VLDL",
  "SGPT (ALT)",
  "SGPT",
  "ALT (SGPT)",
  "Albumin - Serum",
  "Serum Albumin",
  "SGOT (AST)",
  "SGOT",
  "AST (SGOT)",
  "GGT",
  "Alb/Globulin Ratio",
  "Albumin/Globulin Ratio",
  "Serum Globulin",
  "Uric Acid",
  "25-OH Vitamin D",
  "25 OH Vitamin D",
  "Vitamin D (25-OH)",
  "Vitamin B-12",
  "Vitamin B12",
  "Hemoglobin",
  "Total RBC Count",
  "MCV",
  "MCH",
  "MCHC",
  "Total Leucocyte Count (WBC)",
  "Total Leukocyte Count (WBC)",
  "Platelet Count",
  "Cystatin C",
  "eGFR",
  "Serum Creatinine (Urine)",
  "Serum Creatinine",
  "Iron",
  "Ferritin",
  "Fructosamine",
  "Lipoprotein (a)",
  "Lipoprotein (a) [Lp(a)]",
  "Serum Zinc",
  "Amylase",
  "Urine Microalbumin",
  "Urine Glucose",
  "Urine Protein",
  "Urine Specific Gravity",
  "Urine pH"
]);

const URINE_TESTS = [
  "Volume",
  "Colour",
  "Appearance",
  "Specific Gravity",
  "pH",
  "Urinary Protein",
  "Urinary Glucose",
  "Urine Ketone",
  "Urinary Bilirubin",
  "Urobilinogen",
  "Bile Salt",
  "Bile Pigment",
  "Urine Blood",
  "Nitrite",
  "Leucocyte Esterase",
  "Mucus",
  "Red Blood Cells (RBC)",
  "Urinary Leucocytes (Pus Cells)",
  "Epithelial Cells",
  "Casts",
  "Crystals",
  "Bacteria",
  "Yeast",
  "Parasite",
  "Urinary Microalbumin",
  "Urine Creatinine",
  "Urine Albumin/Creatinine Ratio (UA/C)"
];

const URINOGRAM_EXTRACT_TESTS = [
  "Volume",
  "Colour",
  "Appearance",
  "Specific Gravity",
  "pH",
  "Urinary Protein",
  "Urinary Glucose",
  "Urine Ketone",
  "Urinary Bilirubin",
  "Urobilinogen",
  "Bile Salt",
  "Bile Pigment",
  "Urine Blood",
  "Nitrite",
  "Leucocyte Esterase",
  "Mucus",
  "Red Blood Cells",
  "Urinary Leucocytes (Pus Cells)",
  "Epithelial Cells",
  "Casts",
  "Crystals",
  "Bacteria",
  "Yeast",
  "Parasite"
];

function canonicalizeTestName(name) {
  if (!requireString(name)) return "";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function canonicalizeDocsTestsMergeKey(name) {
  const base = canonicalizeTestName(name);
  if (!base) return "";
  const stripped = base.replace(
    /(icpms|icp|ms|hplc|elisa|clia|eclia|photometry|colorimetry|turbidimetry|technology|method|calculated)/g,
    ""
  );
  return stripped || base;
}

function stripDocsTestsMethodSuffix(name) {
  if (!requireString(name)) return null;
  const raw = String(name).trim();
  if (!raw) return null;
  const withoutAngles = raw.replace(/[<>]+/g, " ").trim();
  const cut = withoutAngles.replace(
    /\b(icp\s*-?\s*ms|hplc|elisa|clia|eclia|photometry|colorimetry|turbidimetry|technology|method)\b.*$/i,
    ""
  );
  const cleaned = String(cut || withoutAngles).trim();
  return cleaned || raw;
}

function uniqueTestNames(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) continue;
    const key = canonicalizeTestName(s);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function parseParametersFile(raw) {
  if (!requireString(raw)) return [];
  const lines = String(raw)
    .split(/\r?\n/g)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  const out = [];
  for (const line of lines.slice(1)) {
    const parts = line.split("\t");
    const name = typeof parts?.[2] === "string" ? parts[2].trim() : "";
    if (!name) continue;
    out.push(name);
  }
  return uniqueTestNames(out);
}

const PARAMETERS_JSON_PATH = (() => {
  const raw = process.env.PARAMETERS_JSON_PATH;
  if (requireString(raw)) return path.resolve(raw.trim());
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../data/perameters.json");
})();

const requireModule = createRequire(import.meta.url);

const PARAMETERS_FILE_PATH = (() => {
  const raw = process.env.PARAMETERS_FILE_PATH;
  if (requireString(raw)) return path.resolve(raw.trim());
  return PARAMETERS_JSON_PATH;
})();

const PARAMETER_TESTS = (() => {
  try {
    const parsed = requireModule(PARAMETERS_JSON_PATH);
    const tests = Array.isArray(parsed?.tests) ? parsed.tests : null;
    if (tests) return uniqueTestNames(tests);
  } catch {}

  try {
    const raw = fs.readFileSync(PARAMETERS_FILE_PATH, "utf8");
    const maybeJson = safeParseJsonObject(raw);
    const tests = Array.isArray(maybeJson?.tests) ? maybeJson.tests : null;
    if (tests) return uniqueTestNames(tests);
    return parseParametersFile(raw);
  } catch {
    return [];
  }
})();

const PARAMETER_TESTS_CANON = new Set(PARAMETER_TESTS.map(canonicalizeTestName));
const PARAMETER_TESTS_PREFERRED = (() => {
  const map = new Map();
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || String(name).length < String(prev).length) map.set(key, name);
  }
  return map;
})();

function isHeartParameterTestName(name) {
  const u = String(name || "").toUpperCase();
  if (!u) return false;

  const keywords = [
    "CHOLESTEROL",
    "TRIGLYCER",
    "HDL",
    "LDL",
    "VLDL",
    "NON-HDL",
    "NON HDL",
    "APOLIPOPROTEIN",
    "APO-",
    "APO ",
    "LIPOPROTEIN",
    "LP(A)",
    "LP-PLA2",
    "HS-CRP",
    "HS CRP",
    "CRP",
    "HOMOCYSTEINE",
    "TROPONIN",
    "NT-PROBNP",
    "NT PROBNP",
    "BNP",
    "CK-MB",
    "CK MB",
    "CKMB",
    "CREATINE KINASE",
    "D-DIMER",
    "D DIMER"
  ];

  return keywords.some((k) => u.includes(k));
}

const HEART_PARAMETER_TESTS = (() => {
  const list = PARAMETER_TESTS.filter(isHeartParameterTestName);
  return uniqueTestNames(list);
})();

const HEART_ALL_TESTS = uniqueTestNames([...HEART_TESTS, ...HEART_PARAMETER_TESTS]);

const URINE_PARAMETER_TESTS = (() => {
  const list = PARAMETER_TESTS.filter((name) => {
    const u = String(name).toUpperCase();
    return u.includes("URINE") || u.includes("URINARY");
  });
  return uniqueTestNames(list);
})();

function isOtherParameterTestName(name) {
  const u = String(name || "").toUpperCase();
  if (!u) return false;

  const keywords = [
    "STOOL",
    "SPUTUM",
    "SEMEN",
    "SWAB",
    "VAGINAL",
    "CERVICAL",
    "URETHRAL",
    "THROAT",
    "NASAL",
    "SALIVA",
    "CSF",
    "CEREBROSPINAL",
    "SYNOVIAL",
    "PLEURAL",
    "ASCITIC",
    "PERITONEAL",
    "PERICARDIAL",
    "AMNIOTIC",
    "TISSUE",
    "BIOPSY",
    "SMEAR",
    "PAP",
    "KOH",
    "HANGING DROP",
    "MICROSCOPY",
    "CULTURE",
    "PCR",
    "ALCOHOL",
    "OPIATE",
    "OPIATES",
    "CANNAB",
    "TETRAHYDROCANNABINOL",
    "BENZODIAZEP",
    "BARBITUR",
    "METHAMPHET",
    "AMPHET",
    "MDMA",
    "COCAINE",
    "MORPHINE",
    "METHADONE",
    "KETAMINE",
    "PHENCYCLIDINE",
    "NICOTINE"
  ];

  return keywords.some((k) => u.includes(k));
}

const OTHER_PARAMETER_TESTS = (() => {
  const urineCanon = new Set(URINE_PARAMETER_TESTS.map(canonicalizeTestName));
  const heartCanon = new Set(HEART_ALL_TESTS.map(canonicalizeTestName));
  const list = [];
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    if (urineCanon.has(key)) continue;
    if (heartCanon.has(key)) continue;
    if (!isOtherParameterTestName(name)) continue;
    list.push(name);
  }
  return uniqueTestNames(list);
})();

const BLOOD_PARAMETER_TESTS = (() => {
  const urineCanon = new Set(URINE_PARAMETER_TESTS.map(canonicalizeTestName));
  const heartCanon = new Set(HEART_ALL_TESTS.map(canonicalizeTestName));
  const otherCanon = new Set(OTHER_PARAMETER_TESTS.map(canonicalizeTestName));
  const list = [];
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    if (urineCanon.has(key)) continue;
    if (heartCanon.has(key)) continue;
    if (otherCanon.has(key)) continue;
    list.push(name);
  }
  return uniqueTestNames(list);
})();

const PARAMETER_TESTS_FOR_EXTRACTION = (() => {
  const heartCanon = new Set(HEART_ALL_TESTS.map(canonicalizeTestName));
  const list = [];
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    if (heartCanon.has(key)) continue;
    list.push(name);
  }
  return uniqueTestNames(list);
})();

const OTHER_ANALYSIS_EXTRACT_TESTS = (() => {
  const excluded = uniqueTestNames([
    ...(Array.isArray(BLOOD_ANALYSIS_EXTRACT_TESTS) ? BLOOD_ANALYSIS_EXTRACT_TESTS : []),
    ...(Array.isArray(HEART_RELATED_EXTRACT_TESTS) ? HEART_RELATED_EXTRACT_TESTS : []),
    ...(Array.isArray(HEART_TESTS) ? HEART_TESTS : []),
    ...(Array.isArray(URINOGRAM_EXTRACT_TESTS) ? URINOGRAM_EXTRACT_TESTS : []),
    ...(Array.isArray(URINE_TESTS) ? URINE_TESTS : [])
  ]);
  const excludedCanon = new Set(excluded.map(canonicalizeTestName));
  const list = [];
  for (const name of PARAMETER_TESTS) {
    const key = canonicalizeTestName(name);
    if (!key) continue;
    if (excludedCanon.has(key)) continue;
    list.push(name);
  }
  return uniqueTestNames(list);
})();

const ALLOWED_STATUSES = new Set([
  "LOW",
  "HIGH",
  "NORMAL",
  "ABSENT",
  "PRESENT",
  "NOT_PRESENTED",
  "NOT_FOUND"
]);

function toNullOrString(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() ? value.trim() : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function pickFirstNumber(text) {
  if (!requireString(text)) return null;
  const match = String(text).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function parseRangeBounds(referenceRange) {
  if (!requireString(referenceRange)) return null;
  const range = String(referenceRange).trim();
  const nums = range.match(/-?\d+(?:\.\d+)?/g) ?? [];
  const numbers = nums.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return null;

  if (numbers.length >= 2 && (range.includes("-") || range.toLowerCase().includes("to"))) {
    const min = numbers[0];
    const max = numbers[1];
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max, kind: "between" };
  }

  if (range.includes("<")) {
    return { max: numbers[0], kind: "lt" };
  }
  if (range.includes(">")) {
    return { min: numbers[0], kind: "gt" };
  }

  if (numbers.length >= 2) {
    const min = numbers[0];
    const max = numbers[1];
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max, kind: "between" };
  }

  return null;
}

function computeStatus({ value, referenceRange, fallbackStatus }) {
  const vText = toNullOrString(value);
  if (vText == null) {
    const s = requireString(fallbackStatus) ? String(fallbackStatus).toUpperCase() : "";
    return ALLOWED_STATUSES.has(s) ? s : "NOT_PRESENTED";
  }

  const valueNum = pickFirstNumber(vText);
  const bounds = parseRangeBounds(toNullOrString(referenceRange));
  if (valueNum == null || !bounds) {
    const s = requireString(fallbackStatus) ? String(fallbackStatus).toUpperCase() : "";
    return ALLOWED_STATUSES.has(s) ? s : "NORMAL";
  }

  if (bounds.kind === "between") {
    if (typeof bounds.min === "number" && valueNum < bounds.min) return "LOW";
    if (typeof bounds.max === "number" && valueNum > bounds.max) return "HIGH";
    return "NORMAL";
  }
  if (bounds.kind === "lt") {
    if (typeof bounds.max === "number" && valueNum > bounds.max) return "HIGH";
    return "NORMAL";
  }
  if (bounds.kind === "gt") {
    if (typeof bounds.min === "number" && valueNum < bounds.min) return "LOW";
    return "NORMAL";
  }

  const s = requireString(fallbackStatus) ? String(fallbackStatus).toUpperCase() : "";
  return ALLOWED_STATUSES.has(s) ? s : "NORMAL";
}

async function buildDocsTestsExcelBuffer(tests) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "dr-harsha";
  workbook.created = new Date();

  const columns = [
    { header: "Test Name", key: "testName", width: 32 },
    { header: "Value", key: "value", width: 18 },
    { header: "Unit", key: "unit", width: 12 },
    { header: "Reference Range", key: "referenceRange", width: 22 },
    { header: "Status", key: "status", width: 14 },
    { header: "Section", key: "section", width: 22 },
    { header: "Page", key: "page", width: 8 },
    { header: "Remarks", key: "remarks", width: 28 }
  ];

  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  const headerFont = { color: { argb: "FFFFFFFF" }, bold: true };

  const sheetFill = {
    normal: { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } },
    high: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } },
    low: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEDD5" } }
  };

  const normalize = (t) => ({
    testName: toNullOrString(t?.testName) ?? "",
    value: toNullOrString(t?.value),
    unit: toNullOrString(t?.unit),
    referenceRange: toNullOrString(t?.referenceRange),
    status: computeStatus({
      value: toNullOrString(t?.value),
      referenceRange: toNullOrString(t?.referenceRange),
      fallbackStatus: t?.status
    }),
    section: toNullOrString(t?.section),
    page: typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null,
    remarks: toNullOrString(t?.remarks)
  });

  const safeTests = (Array.isArray(tests) ? tests.map(normalize) : []).filter((t) => t.value != null);

  const normal = safeTests.filter((t) => {
    const s = String(t.status).toUpperCase();
    return s === "NORMAL" || s === "ABSENT" || s === "PRESENT";
  });
  const high = safeTests.filter((t) => String(t.status).toUpperCase() === "HIGH");
  const low = safeTests.filter((t) => String(t.status).toUpperCase() === "LOW");

  const addSheet = (name, rows, fill) => {
    const ws = workbook.addWorksheet(name);
    ws.columns = columns;
    ws.getRow(1).eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length }
    };
    for (const r of rows) {
      const row = ws.addRow({
        testName: r.testName,
        value: r.value,
        unit: r.unit,
        referenceRange: r.referenceRange,
        status: r.status,
        section: r.section,
        page: r.page,
        remarks: r.remarks
      });
      row.eachCell((cell) => {
        cell.fill = fill;
        cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      });
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  addSheet("Normal", normal, sheetFill.normal);
  addSheet("High", high, sheetFill.high);
  addSheet("Low", low, sheetFill.low);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

function buildStrictCategory(list, incoming) {
  const incomingTests = Array.isArray(incoming?.tests) ? incoming.tests : [];
  const map = new Map();
  for (const t of incomingTests) {
    const name = toNullOrString(t?.testName);
    if (!name) continue;
    map.set(canonicalizeTestName(name), t);
  }

  const tests = list.map((testName) => {
    const entry = map.get(canonicalizeTestName(testName));
    const value = toNullOrString(entry?.value);
    const unit = toNullOrString(entry?.unit);
    const referenceRange = toNullOrString(entry?.referenceRange);
    const status = computeStatus({ value, referenceRange, fallbackStatus: entry?.status });
    const missing = status === "NOT_PRESENTED" || status === "NOT_FOUND";
    return {
      testName,
      value: missing ? null : value,
      unit: missing ? null : unit,
      referenceRange: missing ? null : referenceRange,
      status
    };
  });

  const data = tests.some((t) => t.status !== "NOT_PRESENTED" && t.status !== "NOT_FOUND");
  return { data, tests };
}

function buildPresentedCategory(list, incoming) {
  const category = buildStrictCategory(list, incoming);
  const tests = (category?.tests ?? []).filter(
    (t) => t?.status !== "NOT_PRESENTED" && t?.status !== "NOT_FOUND"
  );
  return { data: tests.length > 0, tests };
}

function capTextForPrompt(text, maxChars) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;
  const headChars = Math.floor(maxChars * 0.4);
  const midChars = Math.floor(maxChars * 0.2);
  const tailChars = maxChars - headChars - midChars;

  const head = trimmed.slice(0, headChars);

  const midStart = Math.max(0, Math.floor(trimmed.length / 2 - midChars / 2));
  const middle = trimmed.slice(midStart, midStart + midChars);

  const tail = trimmed.slice(Math.max(0, trimmed.length - tailChars));

  return `${head}\n...\n[MIDDLE]\n${middle}\n...\n[END]\n${tail}`;
}

function capTextForPromptWithAnchors(text, maxChars, anchors) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;

  const list = Array.isArray(anchors) ? anchors.filter(requireString) : [];
  const haystack = trimmed.toUpperCase();
  let matchIndex = -1;
  for (const a of list) {
    const idx = haystack.indexOf(String(a).toUpperCase());
    if (idx >= 0 && (matchIndex === -1 || idx < matchIndex)) matchIndex = idx;
  }

  if (matchIndex === -1) return capTextForPrompt(trimmed, maxChars);

  const headChars = Math.floor(maxChars * 0.25);
  const anchorChars = Math.floor(maxChars * 0.5);
  const tailChars = Math.max(0, maxChars - headChars - anchorChars);

  const head = trimmed.slice(0, headChars);

  const anchorStart = Math.max(0, Math.floor(matchIndex - anchorChars / 2));
  const anchorBlock = trimmed.slice(anchorStart, anchorStart + anchorChars);

  const tail = trimmed.slice(Math.max(0, trimmed.length - tailChars));

  return `${head}\n...\n[FOCUS]\n${anchorBlock}\n...\n[END]\n${tail}`;
}

function bulletList(list) {
  return list.map((t) => `- ${t}`).join("\n");
}

function chunkArray(list, size) {
  const out = [];
  const n = Array.isArray(list) ? list.length : 0;
  if (!Number.isFinite(size) || size <= 0) return out;
  for (let i = 0; i < n; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  const limit =
    Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : 1;
  const results = new Array(list.length);
  let nextIndex = 0;

  const workerCount = Math.min(limit, list.length);
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const i = nextIndex++;
      if (i >= list.length) break;
      results[i] = await mapper(list[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}

function normalizeIncomingTests(incoming) {
  const tests = Array.isArray(incoming?.tests) ? incoming.tests : [];
  return tests
    .map((t) => {
      const testName = toNullOrString(t?.testName);
      if (!testName) return null;
      return {
        testName,
        value: toNullOrString(t?.value),
        unit: toNullOrString(t?.unit),
        referenceRange: toNullOrString(t?.referenceRange),
        status: toNullOrString(t?.status)
      };
    })
    .filter(Boolean);
}

function normalizeDocsTestsIncoming(incoming) {
  const pickArray = (value) => (Array.isArray(value) ? value : []);
  const candidates = [
    ...pickArray(incoming?.tests),
    ...pickArray(incoming?.parameters),
    ...pickArray(incoming?.items),
    ...pickArray(incoming?.results),
    ...pickArray(incoming?.rows),
    ...pickArray(incoming?.data)
  ];

  const tests = Array.isArray(incoming) ? incoming : candidates;

  return pickArray(tests)
    .map((t) => {
      if (!t || typeof t !== "object" || Array.isArray(t)) return null;
      const testName =
        toNullOrString(t?.testName) ??
        toNullOrString(t?.test_name) ??
        toNullOrString(t?.name) ??
        toNullOrString(t?.parameterName) ??
        toNullOrString(t?.parameter) ??
        toNullOrString(t?.analyte) ??
        toNullOrString(t?.test) ??
        toNullOrString(t?.itemName);
      if (!testName) return null;
      const value = toNullOrString(t?.value) ?? toNullOrString(t?.observed_value);
      const unit = toNullOrString(t?.unit) ?? toNullOrString(t?.units);
      const referenceRange =
        toNullOrString(t?.referenceRange) ?? toNullOrString(t?.reference_range) ?? toNullOrString(t?.range);
      return { testName, value, unit, referenceRange };
    })
    .filter(Boolean);
}

function normalizeLooseIncomingTests(incoming) {
  const pickArray = (value) => (Array.isArray(value) ? value : []);

  const direct = [
    ...pickArray(incoming?.tests),
    ...pickArray(incoming?.blood_tests),
    ...pickArray(incoming?.parameters),
    ...pickArray(incoming?.items),
    ...pickArray(incoming?.results),
    ...pickArray(incoming?.rows),
    ...pickArray(incoming?.data),
    ...pickArray(incoming?.blood?.tests),
    ...pickArray(incoming?.blood?.parameters),
    ...pickArray(incoming?.result?.tests),
    ...pickArray(incoming?.result?.parameters)
  ];

  const fromExcel = [];
  const excelSheets = incoming?.excelSheets ?? incoming?.sheets ?? incoming?.excel ?? null;
  if (excelSheets && typeof excelSheets === "object" && !Array.isArray(excelSheets)) {
    const entries = Object.entries(excelSheets);
    for (const [k, v] of entries) {
      const key = String(k || "").toLowerCase();
      if (key.includes("normal") || key.includes("abnormal") || key.includes("notpresent")) {
        fromExcel.push(...pickArray(v));
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [kk, vv] of Object.entries(v)) {
          const subKey = String(kk || "").toLowerCase();
          if (subKey.includes("normal") || subKey.includes("abnormal") || subKey.includes("notpresent")) {
            fromExcel.push(...pickArray(vv));
          }
        }
      }
    }
  }

  const fromNested = [];
  if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
    for (const v of Object.values(incoming)) {
      if (!Array.isArray(v)) continue;
      const arr = v;
      if (arr.length === 0) continue;
      const looksLikeTests = arr.some((x) => {
        if (!x || typeof x !== "object" || Array.isArray(x)) return false;
        return (
          requireString(x?.testName) ||
          requireString(x?.test_name) ||
          requireString(x?.name) ||
          requireString(x?.parameter) ||
          requireString(x?.parameterName) ||
          requireString(x?.analyte) ||
          requireString(x?.test)
        );
      });
      if (looksLikeTests) fromNested.push(...arr);
    }
  }

  const tests = direct.length > 0 ? direct : fromExcel.length > 0 ? fromExcel : fromNested;
  return pickArray(tests)
    .map((t) => {
      if (!t || typeof t !== "object" || Array.isArray(t)) return null;
      const testName =
        toNullOrString(t?.testName) ??
        toNullOrString(t?.test_name) ??
        toNullOrString(t?.name) ??
        toNullOrString(t?.parameterName) ??
        toNullOrString(t?.parameter) ??
        toNullOrString(t?.analyte) ??
        toNullOrString(t?.test) ??
        toNullOrString(t?.itemName);
      if (!testName) return null;
      const normalizeDateTime = (v) => {
        const s = typeof v === "string" ? v : v == null ? "" : String(v);
        const trimmed = s.trim();
        return trimmed ? trimmed : null;
      };

      const normalizeResults = (value) => {
        const list = pickArray(value);
        return list
          .map((r) => {
            if (r == null) return null;
            if (typeof r === "string" || typeof r === "number") {
              const v = toNullOrString(r);
              if (!v) return null;
              return { value: v, dateAndTime: null, status: null };
            }
            if (typeof r !== "object" || Array.isArray(r)) return null;
            const v =
              toNullOrString(r?.value) ??
              toNullOrString(r?.observed_value) ??
              toNullOrString(r?.result) ??
              toNullOrString(r?.reading);
            if (!v) return null;
            const dateAndTime =
              normalizeDateTime(r?.dateAndTime) ??
              normalizeDateTime(r?.date_time) ??
              normalizeDateTime(r?.datetime) ??
              normalizeDateTime(r?.date) ??
              normalizeDateTime(r?.time) ??
              null;
            const status = toNullOrString(r?.status) ?? toNullOrString(r?.Status) ?? null;
            return { value: v, dateAndTime, status };
          })
          .filter(Boolean);
      };

      const results = normalizeResults(t?.results ?? t?.Results ?? t?.observations ?? t?.values);
      const value =
        toNullOrString(t?.value) ??
        toNullOrString(t?.observed_value) ??
        (results.length > 0 ? toNullOrString(results[results.length - 1]?.value) : null);
      const unit = toNullOrString(t?.unit) ?? toNullOrString(t?.units);
      const referenceRange =
        toNullOrString(t?.referenceRange) ?? toNullOrString(t?.reference_range) ?? toNullOrString(t?.range);
      const status = toNullOrString(t?.status);
      const computedResults = results.map((r) => ({
        ...r,
        status: computeStatus({ value: r?.value, referenceRange, fallbackStatus: toNullOrString(r?.status) ?? status })
      }));
      const computed =
        computedResults.length > 0
          ? toNullOrString(computedResults[computedResults.length - 1]?.status)
          : computeStatus({ value, referenceRange, fallbackStatus: status });
      const section = toNullOrString(t?.section);
      const page = typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null;
      const remarks = toNullOrString(t?.remarks);
      return { testName, value, results: computedResults, unit, referenceRange, status: computed, section, page, remarks };
    })
    .filter(Boolean);
}

function normalizeCategorizedDocsTestsIncoming(incoming) {
  const pickArray = (value) => (Array.isArray(value) ? value : []);
  const candidates = [
    ...pickArray(incoming?.tests),
    ...pickArray(incoming?.categories),
    ...pickArray(incoming?.groups),
    ...pickArray(incoming?.sections),
    ...pickArray(incoming?.data)
  ];
  const list = Array.isArray(incoming) ? incoming : candidates;
  const looksGrouped = pickArray(list).some((g) => {
    if (!g || typeof g !== "object" || Array.isArray(g)) return false;
    const hasTestsArray =
      Array.isArray(g?.tests) ||
      Array.isArray(g?.Tests) ||
      Array.isArray(g?.items) ||
      Array.isArray(g?.parameters) ||
      Array.isArray(g?.rows);
    const hasName =
      requireString(g?.categoryName) ||
      requireString(g?.CategaryName) ||
      requireString(g?.CategoryName) ||
      requireString(g?.name) ||
      requireString(g?.section);
    return hasTestsArray && hasName;
  });

  if (looksGrouped) {
    return pickArray(list)
      .map((g) => {
        if (!g || typeof g !== "object" || Array.isArray(g)) return null;
        const categoryNameRaw =
          toNullOrString(g?.categoryName) ??
          toNullOrString(g?.CategaryName) ??
          toNullOrString(g?.CategoryName) ??
          toNullOrString(g?.name) ??
          toNullOrString(g?.section) ??
          "Other Tests";
        const categoryName = String(categoryNameRaw).trim() || "Other Tests";
        const testsIncoming =
          Array.isArray(g?.tests)
            ? g.tests
            : Array.isArray(g?.Tests)
              ? g.Tests
              : Array.isArray(g?.items)
                ? g.items
                : Array.isArray(g?.parameters)
                  ? g.parameters
                  : Array.isArray(g?.rows)
                    ? g.rows
                    : [];
        const tests = normalizeLooseIncomingTests({ tests: testsIncoming });
        if (tests.length === 0) return null;
        return { categoryName, tests };
      })
      .filter(Boolean);
  }

  const flat = normalizeLooseIncomingTests(
    Array.isArray(incoming) ? { tests: incoming } : incoming ?? {}
  );
  if (flat.length === 0) return [];

  const map = new Map();
  for (const t of flat) {
    const nameRaw = toNullOrString(t?.section) ?? "Other Tests";
    const categoryName = String(nameRaw).trim() || "Other Tests";
    const prev = map.get(categoryName) ?? [];
    prev.push(t);
    map.set(categoryName, prev);
  }

  return Array.from(map.entries()).map(([categoryName, tests]) => ({
    categoryName,
    tests
  }));
}

function mergeTestEntries(existing, incoming) {
  const normalizeDateKey = (v) => {
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    return s ? s.toLowerCase() : "";
  };
  const mergeResults = (a, b) => {
    const out = [];
    const seen = new Set();
    const push = (r) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) return;
      const value = toNullOrString(r?.value);
      if (!value) return;
      const dateAndTime = toNullOrString(r?.dateAndTime);
      const key = `${normalizeDateKey(dateAndTime)}|${String(value).trim().toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        value,
        dateAndTime: dateAndTime ? String(dateAndTime).trim() : null,
        status: toNullOrString(r?.status)
      });
    };
    for (const r of Array.isArray(a) ? a : []) push(r);
    for (const r of Array.isArray(b) ? b : []) push(r);
    return out;
  };

  const map = new Map();
  for (const t of existing) {
    const key = canonicalizeDocsTestsMergeKey(t?.testName);
    if (!key) continue;
    map.set(key, t);
  }

  for (const t of incoming) {
    const key = canonicalizeDocsTestsMergeKey(t?.testName);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      const rr = toNullOrString(t?.referenceRange);
      const baseResults = Array.isArray(t?.results) ? t.results : [];
      const computedResults = baseResults.map((r) => ({
        value: toNullOrString(r?.value),
        dateAndTime: toNullOrString(r?.dateAndTime),
        status: computeStatus({ value: toNullOrString(r?.value), referenceRange: rr, fallbackStatus: toNullOrString(r?.status) ?? toNullOrString(t?.status) })
      }));
      const nextValue = toNullOrString(t?.value) ?? (computedResults.length > 0 ? toNullOrString(computedResults[computedResults.length - 1]?.value) : null);
      const nextStatus =
        computedResults.length > 0
          ? toNullOrString(computedResults[computedResults.length - 1]?.status)
          : computeStatus({ value: nextValue, referenceRange: rr, fallbackStatus: toNullOrString(t?.status) });
      map.set(key, { ...t, value: nextValue ?? null, results: computedResults, status: nextStatus });
      continue;
    }
    const mergedResults = mergeResults(prev?.results, t?.results);
    const prevValue = toNullOrString(prev?.value) ?? (mergedResults.length > 0 ? toNullOrString(mergedResults[mergedResults.length - 1]?.value) : null);
    const nextValue = toNullOrString(t?.value) ?? (mergedResults.length > 0 ? toNullOrString(mergedResults[mergedResults.length - 1]?.value) : null);

    const merged = {
      ...prev,
      ...t,
      results: mergedResults,
      value: nextValue ?? prevValue ?? null,
      unit: toNullOrString(t?.unit) ?? toNullOrString(prev?.unit) ?? null,
      referenceRange: toNullOrString(t?.referenceRange) ?? toNullOrString(prev?.referenceRange) ?? null,
      section: toNullOrString(t?.section) ?? toNullOrString(prev?.section) ?? null,
      page:
        (typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null) ??
        (typeof prev?.page === "number" && Number.isFinite(prev.page) ? prev.page : null),
      remarks: toNullOrString(t?.remarks) ?? toNullOrString(prev?.remarks) ?? null
    };

    const rr = toNullOrString(merged?.referenceRange);
    const computedResults = (Array.isArray(merged?.results) ? merged.results : []).map((r) => ({
      value: toNullOrString(r?.value),
      dateAndTime: toNullOrString(r?.dateAndTime),
      status: computeStatus({
        value: toNullOrString(r?.value),
        referenceRange: rr,
        fallbackStatus: toNullOrString(r?.status) ?? toNullOrString(t?.status) ?? toNullOrString(prev?.status)
      })
    }));
    merged.results = computedResults;
    merged.status =
      computedResults.length > 0
        ? toNullOrString(computedResults[computedResults.length - 1]?.status)
        : computeStatus({ value: toNullOrString(merged?.value), referenceRange: rr, fallbackStatus: toNullOrString(merged?.status) });

    map.set(key, merged);
  }

  return Array.from(map.values());
}

function filterDocsTestsToMedicalOnly(tests) {
  const list = Array.isArray(tests) ? tests : [];
  if (list.length === 0) return [];

  const pickLatestValue = (t) => {
    const direct = toNullOrString(t?.value);
    if (direct) return direct;
    const results = Array.isArray(t?.results) ? t.results : [];
    for (let i = results.length - 1; i >= 0; i -= 1) {
      const v = toNullOrString(results[i]?.value);
      if (v) return v;
    }
    return null;
  };

  const addressKeywordRegex =
    /\b(floor|flr|block|layout|phase|road|rd\.?|street|st\.?|sector|nagar|nag\.?|jp\s*nagar|bangalore|bengaluru|karnataka|india|pincode|pin\s*code|zip|district|state)\b/i;
  const looksLikeAddress = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    const hasAddressKeyword = addressKeywordRegex.test(v);
    const hasPinLike = /\b[0-9]{5,6}\b/.test(v);
    const commaCount = (v.match(/,/g) || []).length;
    if (hasAddressKeyword && (commaCount >= 1 || hasPinLike)) return true;
    if (hasPinLike && commaCount >= 2) return true;
    return false;
  };

  const looksLikeMeaninglessValue = (value) => {
    const v = String(value ?? "").trim();
    if (!v) return true;
    if (/^[0-9]{1,3}$/.test(v)) return true;
    if (/^[0-9]{5,6}$/.test(v)) return true;
    return false;
  };

  const keep = [];
  for (const t of list) {
    if (!t || typeof t !== "object" || Array.isArray(t)) continue;
    const testName = toNullOrString(t?.testName);
    const value = pickLatestValue(t);
    if (!testName || !value) continue;

    if (looksLikeAddress(testName) || looksLikeAddress(value)) continue;

    const unit = toNullOrString(t?.unit);
    const referenceRange = toNullOrString(t?.referenceRange);
    const section = toNullOrString(t?.section);
    const remarks = toNullOrString(t?.remarks);

    const canon = canonicalizeTestName(testName);
    const inDictionary = canon ? PARAMETER_TESTS_CANON.has(canon) : false;

    const hasLabSignals = Boolean(unit || referenceRange || section || remarks);
    if (!inDictionary && !hasLabSignals && looksLikeMeaninglessValue(value)) continue;

    keep.push(t);
  }
  return keep;
}

function looksLikeInterpretationTestName(name) {
  const raw = String(name ?? "").trim();
  if (!raw) return true;
  const s = raw.toLowerCase();
  if (["normal", "below", "above", "or higher", "to", "c values", "c value"].includes(s)) return true;
  if (/\bprediab(et)?ic\b/i.test(raw)) return true;
  if (/\bunsatisfactory\b/i.test(raw)) return true;
  if (/\b(good|fair|poor)\s+control\b/i.test(raw)) return true;
  if (/\bcontrol\b/i.test(raw) && !/\bquality\s*control\b/i.test(raw)) return true;
  if (/\b(range|ranges)\b/i.test(raw) && /\b(mg\/dl|mmol\/l|%)\b/i.test(raw)) return true;
  if (/^\s*(to|or)\b/i.test(raw) && /\b(mg\/dl|mmol\/l|%)\b/i.test(raw)) return true;
  if (/^\s*\d+(\.\d+)?\s*(mg\/dl|mmol\/l|%)?\s*(to|\-)\s*\d+(\.\d+)?/i.test(raw)) return true;
  if (/^\s*\d+(\.\d+)?\s*(mg\/dl|mmol\/l|%)\s*$/i.test(raw)) return true;
  return false;
}

function filterDocsTestsToMedicalTestsNoInterpretation(tests) {
  const list = Array.isArray(tests) ? tests : [];
  if (list.length === 0) return [];

  const pickLatestValue = (t) => {
    const direct = toNullOrString(t?.value);
    if (direct) return direct;
    const results = Array.isArray(t?.results) ? t.results : [];
    for (let i = results.length - 1; i >= 0; i -= 1) {
      const v = toNullOrString(results[i]?.value);
      if (v) return v;
    }
    return null;
  };

  const addressKeywordRegex =
    /\b(floor|flr|block|layout|phase|road|rd\.?|street|st\.?|sector|nagar|nag\.?|jp\s*nagar|bangalore|bengaluru|karnataka|india|pincode|pin\s*code|zip|district|state)\b/i;
  const looksLikeAddress = (s) => {
    const v = String(s ?? "").trim();
    if (!v) return false;
    const hasAddressKeyword = addressKeywordRegex.test(v);
    const hasPinLike = /\b[0-9]{5,6}\b/.test(v);
    const commaCount = (v.match(/,/g) || []).length;
    if (hasAddressKeyword && (commaCount >= 1 || hasPinLike)) return true;
    if (hasPinLike && commaCount >= 2) return true;
    return false;
  };

  const looksLikeMeaninglessValue = (value) => {
    const v = String(value ?? "").trim();
    if (!v) return true;
    if (/^[0-9]{1,3}$/.test(v)) return true;
    if (/^[0-9]{5,6}$/.test(v)) return true;
    return false;
  };

  const looksMedicalEnoughWithoutDictionary = (t) => {
    const testName = String(t?.testName ?? "").trim();
    const unit = String(t?.unit ?? "").trim();
    const referenceRange = String(t?.referenceRange ?? "").trim();
    const section = String(t?.section ?? "").trim();
    const remarks = String(t?.remarks ?? "").trim();
    const hasLabSignals = Boolean(unit || referenceRange || section || remarks);
    if (hasLabSignals) return true;
    const nameHasMedicalKeywords =
      /\b(glucose|sugar|hba1c|hemoglobin|cholesterol|triglycer|ldl|hdl|vldl|bilirubin|sgot|sgpt|ast|alt|alkaline|alp|urea|creatinine|uric|sodium|potassium|chloride|calcium|magnesium|phosph|tsh|t3|t4|vitamin|b12|d3|ferritin|iron|crp|esr|cbc|wbc|rbc|platelet|neutrophil|lymphocyte|monocyte|eosinophil|basophil|urine|urin|albumin|protein|globulin|a\/g|ratio|hct|mcv|mch|mchc|rdw)\b/i.test(
        testName
      );
    if (!nameHasMedicalKeywords) return false;
    if (looksLikeMeaninglessValue(pickLatestValue(t))) return false;
    return true;
  };

  const keep = [];
  for (const t of list) {
    if (!t || typeof t !== "object" || Array.isArray(t)) continue;
    const testName = toNullOrString(t?.testName);
    const value = pickLatestValue(t);
    if (!testName || !value) continue;

    if (looksLikeAddress(testName) || looksLikeAddress(value)) continue;
    if (looksLikeInterpretationTestName(testName)) continue;

    const canon = canonicalizeTestName(testName);
    const inDictionary = canon ? PARAMETER_TESTS_CANON.has(canon) : false;
    if (inDictionary) {
      keep.push(t);
      continue;
    }

    if (looksMedicalEnoughWithoutDictionary(t)) keep.push(t);
  }
  return keep;
}

function normalizeCleanerStatus(status, value) {
  const v = requireString(value) ? String(value).trim().toUpperCase() : "";
  const s = requireString(status) ? String(status).trim().toUpperCase() : "";
  if (v === "ABSENT" || s === "ABSENT") return "ABSENT";
  if (v === "PRESENT" || s === "PRESENT") return "PRESENT";
  if (s === "HIGH") return "HIGH";
  if (s === "LOW") return "LOW";
  return "NORMAL";
}

function isMissingDocsTestsField(value) {
  const s = toNullOrString(value);
  if (!s) return true;
  const v = s.trim().toLowerCase();
  if (!v) return true;
  if (v === "not presented") return true;
  if (v === "not_presented") return true;
  if (v === "not found") return true;
  if (v === "not_found") return true;
  if (v === "na" || v === "n/a") return true;
  if (v === "-" || v === "--") return true;
  return false;
}

function mergeAndDedupeCleanedTestsByName(tests) {
  const list = Array.isArray(tests) ? tests : [];
  if (list.length <= 1) return list;

  const normalizeDateKey = (v) => {
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    return s ? s.toLowerCase() : "";
  };

  const mergeResults = (a, b) => {
    const out = [];
    const seen = new Set();
    const push = (r) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) return;
      const value = toNullOrString(r?.value);
      if (isMissingDocsTestsField(value)) return;
      const dateAndTime = toNullOrString(r?.dateAndTime);
      const key = `${normalizeDateKey(dateAndTime)}|${String(value).trim().toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        value: String(value).trim(),
        dateAndTime: isMissingDocsTestsField(dateAndTime) ? null : String(dateAndTime).trim(),
        status: toNullOrString(r?.status)
      });
    };
    for (const r of Array.isArray(a) ? a : []) push(r);
    for (const r of Array.isArray(b) ? b : []) push(r);
    return out;
  };

  const pickBestText = (a, b) => {
    const aa = isMissingDocsTestsField(a) ? null : String(a).trim();
    const bb = isMissingDocsTestsField(b) ? null : String(b).trim();
    if (aa && bb) return bb.length >= aa.length ? bb : aa;
    return bb ?? aa ?? null;
  };

  const statusPriority = (s) => {
    const v = String(s ?? "").trim().toUpperCase();
    if (v === "HIGH") return 4;
    if (v === "LOW") return 3;
    if (v === "PRESENT") return 2;
    if (v === "ABSENT") return 2;
    return 1;
  };

  const map = new Map();
  const passthrough = [];

  for (const t of list) {
    if (!t || typeof t !== "object" || Array.isArray(t)) continue;
    const testName = toNullOrString(t?.testName);
    const key = canonicalizeDocsTestsMergeKey(testName);
    if (!key) {
      passthrough.push(t);
      continue;
    }

    const prev = map.get(key);
    if (!prev) {
      const results = mergeResults([], t?.results);
      const value = isMissingDocsTestsField(t?.value) ? null : toNullOrString(t?.value);
      const rr = pickBestText(null, t?.referenceRange);
      const computedResults = results.map((r) => ({
        ...r,
        status: computeStatus({ value: toNullOrString(r?.value), referenceRange: rr, fallbackStatus: toNullOrString(r?.status) ?? toNullOrString(t?.status) })
      }));
      const nextValue = value ?? (computedResults.length > 0 ? toNullOrString(computedResults[computedResults.length - 1]?.value) : null);
      const nextStatus =
        computedResults.length > 0
          ? toNullOrString(computedResults[computedResults.length - 1]?.status)
          : computeStatus({ value: nextValue, referenceRange: rr, fallbackStatus: toNullOrString(t?.status) });
      map.set(key, { ...t, testName: stripDocsTestsMethodSuffix(testName) ?? testName, value: nextValue, results: computedResults, status: nextStatus });
      continue;
    }

    const mergedResults = mergeResults(prev?.results, t?.results);
    const prevValue = isMissingDocsTestsField(prev?.value) ? null : toNullOrString(prev?.value);
    const nextValue = isMissingDocsTestsField(t?.value) ? null : toNullOrString(t?.value);
    const value =
      nextValue ??
      prevValue ??
      (mergedResults.length > 0 ? toNullOrString(mergedResults[mergedResults.length - 1]?.value) : null);

    const merged = {
      ...prev,
      ...t,
      testName: (() => {
        const a = toNullOrString(prev?.testName);
        const b = toNullOrString(t?.testName);
        const aa = stripDocsTestsMethodSuffix(a) ?? a;
        const bb = stripDocsTestsMethodSuffix(b) ?? b;
        if (aa && bb) return String(aa).length <= String(bb).length ? aa : bb;
        return bb ?? aa ?? null;
      })(),
      results: mergedResults,
      value,
      unit: pickBestText(prev?.unit, t?.unit),
      referenceRange: pickBestText(prev?.referenceRange, t?.referenceRange),
      section: pickBestText(prev?.section, t?.section),
      remarks: pickBestText(prev?.remarks, t?.remarks),
      page:
        (typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null) ??
        (typeof prev?.page === "number" && Number.isFinite(prev.page) ? prev.page : null),
      status: (() => {
        const a = toNullOrString(prev?.status);
        const b = toNullOrString(t?.status);
        return statusPriority(b) >= statusPriority(a) ? (b ?? a) : (a ?? b);
      })()
    };

    const rr = toNullOrString(merged?.referenceRange);
    const computedResults = (Array.isArray(merged?.results) ? merged.results : []).map((r) => ({
      ...r,
      status: computeStatus({ value: toNullOrString(r?.value), referenceRange: rr, fallbackStatus: toNullOrString(r?.status) ?? toNullOrString(merged?.status) })
    }));
    merged.results = computedResults;
    merged.status =
      computedResults.length > 0
        ? toNullOrString(computedResults[computedResults.length - 1]?.status)
        : computeStatus({ value: toNullOrString(merged?.value), referenceRange: rr, fallbackStatus: toNullOrString(merged?.status) });

    map.set(key, merged);
  }

  const mergedList = [...passthrough, ...Array.from(map.values())];
  return mergedList.filter((t) => {
    const hasValue = !isMissingDocsTestsField(t?.value);
    const hasResult =
      Array.isArray(t?.results) && t.results.some((r) => !isMissingDocsTestsField(r?.value));
    const hasRange = !isMissingDocsTestsField(t?.referenceRange);
    return hasValue || hasResult || hasRange;
  });
}

async function cleanDocsTestsWithAi({ openai, provider, tests, debug }) {
  const list = Array.isArray(tests) ? tests : [];
  if (list.length === 0) return { tests: [] };

  const normalizeDateKey = (v) => {
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    return s ? s.toLowerCase() : "";
  };
  const buildOriginalResultsMap = (incoming) => {
    const map = new Map();
    for (const t of Array.isArray(incoming) ? incoming : []) {
      const key = canonicalizeDocsTestsMergeKey(t?.testName);
      if (!key) continue;
      const rr = toNullOrString(t?.referenceRange);
      const testFallbackStatus = toNullOrString(t?.status);
      const prev = map.get(key) ?? [];
      const results = Array.isArray(t?.results) ? t.results : [];
      if (results.length > 0) {
        for (const r of results) {
          const value = toNullOrString(r?.value);
          if (isMissingDocsTestsField(value)) continue;
          const dateAndTime = toNullOrString(r?.dateAndTime);
          prev.push({
            value,
            dateAndTime: isMissingDocsTestsField(dateAndTime) ? null : String(dateAndTime).trim(),
            status: computeStatus({ value, referenceRange: rr, fallbackStatus: toNullOrString(r?.status) ?? testFallbackStatus })
          });
        }
      } else {
        const value = toNullOrString(t?.value);
        if (!isMissingDocsTestsField(value)) {
          prev.push({
            value,
            dateAndTime: null,
            status: computeStatus({ value, referenceRange: rr, fallbackStatus: testFallbackStatus })
          });
        }
      }
      map.set(key, prev);
    }
    return map;
  };
  const originalResultsByKey = buildOriginalResultsMap(list);

  const dictionaryText = bulletList(PARAMETER_TESTS);
  const dictionaryPrompt = capTextForPrompt(dictionaryText, 12000);
  const rowsJson = JSON.stringify(
    list.map((t) => ({
      testName: toNullOrString(t?.testName),
      results: Array.isArray(t?.results)
        ? t.results.map((r) => ({
          value: toNullOrString(r?.value),
          dateAndTime: toNullOrString(r?.dateAndTime),
          status: toNullOrString(r?.status)
        }))
        : toNullOrString(t?.value)
          ? [{ value: toNullOrString(t?.value), dateAndTime: null }]
          : [],
      unit: toNullOrString(t?.unit),
      referenceRange: toNullOrString(t?.referenceRange),
      section: toNullOrString(t?.section),
      page: typeof t?.page === "number" && Number.isFinite(t.page) ? t.page : null,
      remarks: toNullOrString(t?.remarks)
    }))
  );
  const rowsForPrompt = capTextForPrompt(rowsJson, 20000);

  const systemPrompt = DOCS_TESTS_CLEAN_SYSTEM_PROMPT;
  const userPrompt = buildDocsTestsCleanUserPrompt({ dictionaryPrompt, rowsForPrompt });

  const resolvedProvider = normalizeAiProvider(provider);
  let content = "";
  if (resolvedProvider === "gemini") {
    const response = await geminiGenerateContent({
      parts: [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }],
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 8192
    });
    content = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: userPrompt }]
        }
      ],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    content = getTextFromAnthropicMessageResponse(response);
  } else {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: userPrompt }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  }

  let parsed =
    (resolvedProvider === "claude" || resolvedProvider === "gemini"
      ? safeParseJsonObjectLoose(content)
      : safeParseJsonObject(content)) ??
    safeParseJsonArrayLoose(content) ??
    null;

  if (!parsed && resolvedProvider === "claude") {
    parsed = await repairJsonObjectWithClaude({
      rawText: content,
      schemaHint: DOCS_TESTS_CLEAN_SCHEMA_HINT,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
    });
  }

  const categories = normalizeCategorizedDocsTestsIncoming(parsed ?? {});
  const normalizedCategories = categories
    .map((c) => {
      const name = requireString(c?.categoryName) ? String(c.categoryName).trim() : "Other Tests";
      const incomingTests = Array.isArray(c?.tests) ? c.tests : [];
      const normalized = incomingTests.map((t) => ({
        ...t,
        results:
          (() => {
            const rr = toNullOrString(t?.referenceRange);
            const base =
              Array.isArray(t?.results) && t.results.length > 0
                ? t.results
                : toNullOrString(t?.value)
                  ? [{ value: toNullOrString(t?.value), dateAndTime: null, status: toNullOrString(t?.status) }]
                  : [];
            return base
              .map((r) => {
                const value = toNullOrString(r?.value);
                if (isMissingDocsTestsField(value)) return null;
                const dateAndTime = toNullOrString(r?.dateAndTime);
                const fallback = normalizeCleanerStatus(r?.status ?? t?.status, value);
                return {
                  value,
                  dateAndTime: isMissingDocsTestsField(dateAndTime) ? null : String(dateAndTime).trim(),
                  status: computeStatus({ value, referenceRange: rr, fallbackStatus: fallback })
                };
              })
              .filter(Boolean);
          })(),
        testName: (() => {
          const raw = toNullOrString(t?.testName);
          if (!raw) return raw;
          const stripped = stripDocsTestsMethodSuffix(raw) ?? raw;
          const key = canonicalizeTestName(stripped);
          const preferred = key ? PARAMETER_TESTS_PREFERRED.get(key) : null;
          return preferred ?? stripped;
        })(),
        status: (() => {
          const rr = toNullOrString(t?.referenceRange);
          const results = Array.isArray(t?.results) ? t.results : [];
          if (results.length > 0) {
            const last = results[results.length - 1];
            return computeStatus({ value: toNullOrString(last?.value), referenceRange: rr, fallbackStatus: toNullOrString(last?.status) ?? toNullOrString(t?.status) });
          }
          return computeStatus({ value: toNullOrString(t?.value), referenceRange: rr, fallbackStatus: toNullOrString(t?.status) });
        })()
      }));
      const filtered = filterDocsTestsToMedicalTestsNoInterpretation(normalized);
      const deduped = mergeAndDedupeCleanedTestsByName(filtered);
      if (deduped.length === 0) return null;
      const hydrated = deduped.map((t) => {
        const key = canonicalizeDocsTestsMergeKey(t?.testName);
        const originalResults = key ? originalResultsByKey.get(key) : null;
        if (!key || !Array.isArray(originalResults) || originalResults.length === 0) return t;

        const byDate = new Map();
        const push = (r, source) => {
          if (!r || typeof r !== "object" || Array.isArray(r)) return;
          const value = toNullOrString(r?.value);
          if (isMissingDocsTestsField(value)) return;
          const dateAndTime = toNullOrString(r?.dateAndTime);
          const dateKey = normalizeDateKey(dateAndTime);
          const prev = byDate.get(dateKey) ?? { original: [], ai: [] };
          const entry = {
            value,
            dateAndTime: isMissingDocsTestsField(dateAndTime) ? null : String(dateAndTime).trim(),
            status: toNullOrString(r?.status)
          };
          if (source === "original") prev.original.push(entry);
          else prev.ai.push(entry);
          byDate.set(dateKey, prev);
        };

        for (const r of Array.isArray(t?.results) ? t.results : []) push(r, "ai");
        for (const r of originalResults) push(r, "original");

        const mergedResults = [];
        for (const entry of byDate.values()) {
          if (entry.original.length > 0) mergedResults.push(...entry.original);
          else mergedResults.push(...entry.ai);
        }

        const nextValue =
          mergedResults.length > 0 ? toNullOrString(mergedResults[mergedResults.length - 1]?.value) : toNullOrString(t?.value);

        const rr = toNullOrString(t?.referenceRange);
        const computedResults = mergedResults.map((r) => ({
          ...r,
          status: computeStatus({ value: toNullOrString(r?.value), referenceRange: rr, fallbackStatus: toNullOrString(r?.status) ?? toNullOrString(t?.status) })
        }));
        const nextStatus =
          computedResults.length > 0
            ? toNullOrString(computedResults[computedResults.length - 1]?.status)
            : computeStatus({ value: nextValue, referenceRange: rr, fallbackStatus: toNullOrString(t?.status) });
        return { ...t, results: computedResults, value: nextValue ?? null, status: nextStatus };
      });

      return { categoryName: name || "Other Tests", tests: mergeAndDedupeCleanedTestsByName(hydrated) };
    })
    .filter(Boolean);

  if (debug) return { tests: normalizedCategories, raw: content };
  return { tests: normalizedCategories };
}

async function extractTestsFromPdfs({ openai, pdfFiles, extractedText, testNames, provider }) {
  const systemPrompt = TESTS_FROM_PDFS_SYSTEM_PROMPT;
  const userPrompt = buildTestsFromPdfsUserPrompt({ testList: bulletList(testNames) });

  let content = "";
  const resolvedProvider = normalizeAiProvider(provider);
  const textForPrompt = requireString(extractedText)
    ? extractedText
    : resolvedProvider === "claude" || resolvedProvider === "gemini"
      ? await extractPdfTextRawForPrompt(pdfFiles)
      : "";

  if (resolvedProvider === "gemini") {
    const response = await geminiGenerateContent({
      parts: [
        {
          text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}\n\n[PDF_TEXT]\n${capTextForPrompt(
            textForPrompt,
            12000
          )}`
        }
      ],
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    content = getTextFromGeminiGenerateContentResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? safeParseJsonObject(content) ?? {};
    return normalizeIncomingTests(parsedJson);
  }

  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${userPrompt}\n\n[PDF_TEXT]\n${textForPrompt}` }]
        }
      ],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    content = getTextFromAnthropicMessageResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? {};
    return normalizeIncomingTests(parsedJson);
  }

  if (requireString(textForPrompt)) {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: `${userPrompt}\n\n[PDF_TEXT]\n${textForPrompt}` }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  } else {
    const fileParts = pdfFiles.map((f) => {
      const base64 = f.buffer.toString("base64");
      const fileDataUrl = `data:application/pdf;base64,${base64}`;
      return { type: "input_file", filename: f.originalname || "report.pdf", file_data: fileDataUrl };
    });
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      text: { format: { type: "json_object" } },
      input: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        {
          role: "user",
          content: [...fileParts, { type: "input_text", text: userPrompt }]
        }
      ]
    });
    content = getTextFromResponsesOutput(response);
  }

  const parsedJson = safeParseJsonObject(content) ?? {};
  return normalizeIncomingTests(parsedJson);
}

async function extractAllBloodParametersFromText({ openai, extractedText, provider, debug }) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = BLOOD_TEXT_USER_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = BLOOD_SCHEMA_HINT;

  let content = "";
  if (resolvedProvider === "gemini") {
    const response = await geminiGenerateContent({
      parts: [
        {
          text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(
            extractedText,
            20000
          )}`
        }
      ],
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 8192
    });
    content = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${userPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(extractedText, 12000)}` }]
        }
      ],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    content = getTextFromAnthropicMessageResponse(response);
  } else {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: `${userPrompt}\n\n[REPORT_TEXT]\n${extractedText}` }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  }

  let parsedJson =
    (resolvedProvider === "claude" ? safeParseJsonObjectLoose(content) : safeParseJsonObject(content)) ?? null;
  if (!parsedJson && resolvedProvider === "claude") {
    parsedJson = await repairJsonObjectWithClaude({
      rawText: content,
      schemaHint,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
    });
  }
  if (resolvedProvider === "claude") {
    const maybeTests = normalizeLooseIncomingTests(parsedJson ?? {});
    if (maybeTests.length === 0) {
      const fallbackUserPrompt = BLOOD_TEXT_FALLBACK_CLAUDE_USER_PROMPT;

      const response2 = await anthropicCreateJsonMessage({
        system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: `${fallbackUserPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(extractedText, 9000)}` }]
          }
        ],
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
        temperature: 0,
        maxTokens: 4096
      });
      const content2 = getTextFromAnthropicMessageResponse(response2);
      let parsed2 = safeParseJsonObjectLoose(content2);
      if (!parsed2) {
        parsed2 = await repairJsonObjectWithClaude({
          rawText: content2,
          schemaHint,
          model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
        });
      }
      parsedJson = parsed2 ?? parsedJson;
      content = maybeTests.length > 0 ? content : content2;
    }
  }

  const tests = normalizeLooseIncomingTests(parsedJson ?? {});
  if (debug) return { tests, raw: content };
  return { tests };
}

async function extractDocsTestsFromText({ openai, extractedText, provider, debug }) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = DOCS_TESTS_TEXT_USER_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = DOCS_TESTS_SCHEMA_HINT;

  let content = "";
  if (resolvedProvider === "gemini") {
    const response = await geminiGenerateContent({
      parts: [
        {
          text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(
            extractedText,
            20000
          )}`
        }
      ],
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 8192
    });
    content = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${userPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(extractedText, 20000)}` }]
        }
      ],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    content = getTextFromAnthropicMessageResponse(response);
  } else {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: `${userPrompt}\n\n[REPORT_TEXT]\n${extractedText}` }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  }

  let parsedJson =
    (resolvedProvider === "claude" || resolvedProvider === "gemini"
      ? safeParseJsonObjectLoose(content)
      : safeParseJsonObject(content)) ??
    safeParseJsonArrayLoose(content) ??
    null;

  if (!parsedJson && resolvedProvider === "claude") {
    const repairedObject = await repairJsonObjectWithClaude({
      rawText: content,
      schemaHint,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
    });
    parsedJson = repairedObject ?? (await repairJsonArrayWithClaude({ rawText: content, schemaHint, model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022" }));
  }

  const tests = normalizeLooseIncomingTests(parsedJson ?? {});
  if (debug) return { tests, raw: content };
  return { tests };
}

async function extractDocsTestsFromImagesAndText({ openai, imageFiles, extractedText, provider, debug }) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = DOCS_TESTS_IMAGES_USER_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = DOCS_TESTS_SCHEMA_HINT;

  let content = "";

  if (resolvedProvider === "gemini") {
    const parts = [
      {
        text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPrompt(
          extractedText,
          14000
        )}`
      }
    ];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 8192
    });
    content = getTextFromGeminiGenerateContentResponse(response);
  } else if (resolvedProvider === "claude") {
    const parts = [{ type: "text", text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPrompt(extractedText, 14000)}` }];
    for (const f of imageFiles) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    content = getTextFromAnthropicMessageResponse(response);
  } else {
    const contentParts = [
      { type: "text", text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPrompt(extractedText, 14000)}` }
    ];
    for (const f of imageFiles) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });

    content = completion.choices?.[0]?.message?.content ?? "";
  }

  let parsedJson =
    (resolvedProvider === "claude" || resolvedProvider === "gemini"
      ? safeParseJsonObjectLoose(content)
      : safeParseJsonObject(content)) ??
    safeParseJsonArrayLoose(content) ??
    null;

  if (!parsedJson && resolvedProvider === "claude") {
    const repairedObject = await repairJsonObjectWithClaude({
      rawText: content,
      schemaHint,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
    });
    parsedJson = repairedObject ?? (await repairJsonArrayWithClaude({ rawText: content, schemaHint, model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022" }));
  }

  const tests = normalizeLooseIncomingTests(parsedJson ?? {});
  if (debug) return { tests, raw: content };
  return { tests };
}

async function extractAllBloodParametersFromImagesAndText({ openai, imageFiles, extractedText, provider, debug }) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = BLOOD_IMAGES_USER_PROMPT;

  const resolvedProvider = normalizeAiProvider(provider);
  const schemaHint = BLOOD_SCHEMA_HINT;

  let content = "";
  if (resolvedProvider === "claude") {
    const parts = [
      { type: "text", text: `${userPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(extractedText, 12000)}` }
    ];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 8192
    });
    content = getTextFromAnthropicMessageResponse(response);
  } else {
    const contentParts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[REPORT_TEXT]\n${capTextForPrompt(extractedText, 12000)}`
      }
    ];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });

    content = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsedJson =
    (resolvedProvider === "claude"
      ? safeParseJsonObjectLoose(content)
      : safeParseJsonObject(content)) ?? null;

  let finalJson = parsedJson;
  if (!finalJson && resolvedProvider === "claude") {
    finalJson = await repairJsonObjectWithClaude({
      rawText: content,
      schemaHint,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"
    });
  }

  const tests = normalizeLooseIncomingTests(finalJson ?? {});
  if (debug) return { tests, raw: content };
  return { tests };
}

async function extractTestsFromImagesAndText({ openai, imageFiles, extractedText, testNames, provider }) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = buildTestsFromImagesUserPrompt({ testList: bulletList(testNames) });

  const resolvedProvider = normalizeAiProvider(provider);
  let content = "";

  if (resolvedProvider === "claude") {
    const parts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPrompt(extractedText, 10000)}`
      }
    ];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    content = getTextFromAnthropicMessageResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? {};
    return normalizeIncomingTests(parsedJson);
  }

  const contentParts = [
    { type: "text", text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPrompt(extractedText, 10000)}` }
  ];
  const images = Array.isArray(imageFiles) ? imageFiles : [];
  for (const f of images) {
    const b64 = f.buffer.toString("base64");
    const dataUrl = `data:${f.mimetype};base64,${b64}`;
    contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
  }

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
      { role: "user", content: contentParts }
    ]
  });

  content = completion.choices?.[0]?.message?.content ?? "";
  const parsedJson = safeParseJsonObject(content) ?? {};
  return normalizeIncomingTests(parsedJson);
}

function normalizeHeartRelatedIncomingTests(parsedJson) {
  const arr = Array.isArray(parsedJson?.heart_related_tests) ? parsedJson.heart_related_tests : [];
  return arr
    .map((t) => {
      if (!t || typeof t !== "object" || Array.isArray(t)) return null;
      const testName =
        toNullOrString(t?.test_name) ?? toNullOrString(t?.testName) ?? toNullOrString(t?.name);
      if (!testName) return null;
      const value = toNullOrString(t?.observed_value) ?? toNullOrString(t?.value);
      const unit = toNullOrString(t?.units) ?? toNullOrString(t?.unit);
      const referenceRange = toNullOrString(t?.reference_range) ?? toNullOrString(t?.referenceRange);
      const status = toNullOrString(t?.status);
      return { testName, value, unit, referenceRange, status };
    })
    .filter(Boolean);
}

async function extractHeartRelatedTestsFromPdfs({ openai, pdfFiles, extractedText, provider }) {
  const systemPrompt = HEART_RELATED_TESTS_SYSTEM_PROMPT;
  const userPrompt = buildHeartRelatedTestsUserPrompt({
    heartTestsList: bulletList(HEART_RELATED_EXTRACT_TESTS)
  });

  let content = "";
  const resolvedProvider = normalizeAiProvider(provider);
  const textForPrompt = requireString(extractedText)
    ? extractedText
    : resolvedProvider === "claude"
      ? await extractPdfTextRawForPrompt(pdfFiles)
      : "";

  if (resolvedProvider === "claude") {
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: `${userPrompt}\n\n[PDF_TEXT]\n${textForPrompt}` }]
        }
      ],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    content = getTextFromAnthropicMessageResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? {};
    return normalizeHeartRelatedIncomingTests(parsedJson);
  }

  if (requireString(textForPrompt)) {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: `${userPrompt}\n\n[PDF_TEXT]\n${textForPrompt}` }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  } else {
    const fileParts = pdfFiles.map((f) => {
      const base64 = f.buffer.toString("base64");
      const fileDataUrl = `data:application/pdf;base64,${base64}`;
      return { type: "input_file", filename: f.originalname || "report.pdf", file_data: fileDataUrl };
    });
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      text: { format: { type: "json_object" } },
      input: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        {
          role: "user",
          content: [...fileParts, { type: "input_text", text: userPrompt }]
        }
      ]
    });
    content = getTextFromResponsesOutput(response);
  }

  const parsedJson = safeParseJsonObject(content) ?? {};
  return normalizeHeartRelatedIncomingTests(parsedJson);
}

function normalizeUrinogramIncomingTests(parsedJson) {
  const arr = Array.isArray(parsedJson?.urine_tests) ? parsedJson.urine_tests : [];
  return arr
    .map((t) => {
      if (!t || typeof t !== "object" || Array.isArray(t)) return null;
      const testName =
        toNullOrString(t?.test_name) ?? toNullOrString(t?.testName) ?? toNullOrString(t?.name);
      if (!testName) return null;
      const methodology = toNullOrString(t?.methodology);
      const value = toNullOrString(t?.observed_value) ?? toNullOrString(t?.value);
      const unit = toNullOrString(t?.units) ?? toNullOrString(t?.unit);
      const referenceRange = toNullOrString(t?.reference_range) ?? toNullOrString(t?.referenceRange);
      const status = toNullOrString(t?.status);
      return { testName, methodology, value, unit, referenceRange, status };
    })
    .filter(Boolean);
}

function toUrinogramKey(name) {
  const base = canonicalizeTestName(name);
  if (!base) return "";
  if (base.startsWith("redbloodcells")) return "redbloodcells";
  return base;
}

function buildCompleteUrinogramTests(incomingTests) {
  const list = Array.isArray(incomingTests) ? incomingTests : [];
  const map = new Map();
  for (const t of list) {
    const key = toUrinogramKey(t?.testName);
    if (!key) continue;
    map.set(key, t);
  }

  return URINOGRAM_EXTRACT_TESTS.map((testName) => {
    const key = toUrinogramKey(testName);
    const entry = map.get(key);
    if (entry) return { ...entry, testName };
    return {
      testName,
      methodology: null,
      value: "Not included in the PDF",
      unit: null,
      referenceRange: null,
      status: "Not included in the PDF"
    };
  });
}

function hasUrinogramMarkers(text) {
  const s = typeof text === "string" ? text.toUpperCase() : "";
  if (!s.trim()) return false;
  if (s.includes("URINOGRAM")) return true;
  if (s.includes("COMPLETE URINOGRAM")) return true;
  if (s.includes("MICROSCOPIC EXAMINATION")) return true;
  if (s.includes("CHEMICAL EXAMINATION")) return true;
  if (s.includes("URINARY PROTEIN")) return true;
  if (s.includes("URINARY GLUCOSE")) return true;
  return false;
}

async function extractUrinogramTestsFromPdfs({ openai, pdfFiles, imageFiles, extractedText, provider }) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = buildUrinogramUserPrompt({ bulletList });

  const resolvedProvider = normalizeAiProvider(provider);
  if (resolvedProvider === "gemini") {
    const pdfList = Array.isArray(pdfFiles) ? pdfFiles : [];
    const imageList = Array.isArray(imageFiles) ? imageFiles : [];
    const textForPrompt = requireString(extractedText) ? extractedText : await extractPdfTextRawForPrompt(pdfList);
    const parts = [
      {
        text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(
          textForPrompt,
          8000,
          URINOGRAM_ANCHOR_TERMS
        )}`
      }
    ];
    for (const f of imageList) {
      parts.push({
        inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    const content = getTextFromGeminiGenerateContentResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? safeParseJsonObject(content) ?? {};
    return normalizeUrinogramIncomingTests(parsedJson);
  }

  if (resolvedProvider === "claude") {
    const parts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 8000, URINOGRAM_ANCHOR_TERMS)}`
      }
    ];
    for (const f of Array.isArray(imageFiles) ? imageFiles : []) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }

    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });

    const content = getTextFromAnthropicMessageResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? {};
    return normalizeUrinogramIncomingTests(parsedJson);
  }

  let content = "";
  const pdfList = Array.isArray(pdfFiles) ? pdfFiles : [];
  const imageList = Array.isArray(imageFiles) ? imageFiles : [];
  const extractedHasMarkers = hasUrinogramMarkers(extractedText);

  if (requireString(extractedText) && extractedHasMarkers && imageList.length === 0) {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${extractedText}` }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
    const parsedJson = safeParseJsonObject(content) ?? {};
    const normalized = normalizeUrinogramIncomingTests(parsedJson);
    if (normalized.length >= Math.min(URINOGRAM_EXTRACT_TESTS.length, 10)) return normalized;
  }

  const shouldUseTextOnly = requireString(extractedText) && pdfList.length === 0 && imageList.length === 0;

  if (shouldUseTextOnly) {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: `${userPrompt}\n\n[PDF_TEXT]\n${extractedText}` }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  } else if (imageList.length > 0 && pdfList.length === 0) {
    const contentParts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 6000, URINOGRAM_ANCHOR_TERMS)}`
      }
    ];
    for (const f of imageList) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
  } else {
    const fileParts = pdfList.map((f) => {
      const base64 = f.buffer.toString("base64");
      const fileDataUrl = `data:application/pdf;base64,${base64}`;
      return { type: "input_file", filename: f.originalname || "report.pdf", file_data: fileDataUrl };
    });
    const extraText = requireString(extractedText)
      ? `\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 6000, URINOGRAM_ANCHOR_TERMS)}`
      : "";
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      text: { format: { type: "json_object" } },
      input: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        {
          role: "user",
          content: [...fileParts, { type: "input_text", text: `${userPrompt}${extraText}` }]
        }
      ]
    });
    content = getTextFromResponsesOutput(response);
  }

  const parsedJson = safeParseJsonObject(content) ?? {};
  return normalizeUrinogramIncomingTests(parsedJson);
}

function normalizeUltrasoundPatientSex(value) {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!s) return "Unknown";
  if (s === "m" || s === "male" || s.includes("male")) return "Male";
  if (s === "f" || s === "female" || s.includes("female")) return "Female";
  return "Unknown";
}

function extractUltrasoundPatientSexFromText(text) {
  const s = typeof text === "string" ? text : "";
  if (!s) return "Unknown";
  const lower = s.toLowerCase();

  const sexLine = lower.match(/\b(sex|gender)\s*[:\-]?\s*(male|female|m|f)\b/);
  if (sexLine?.[2]) return normalizeUltrasoundPatientSex(sexLine[2]);

  if (/\b(male)\b/.test(lower) && !/\bfemale\b/.test(lower)) return "Male";
  if (/\b(female)\b/.test(lower) && !/\bmale\b/.test(lower)) return "Female";

  if (/\bmr\.?\b/.test(lower) && !/\bmrs\.?\b/.test(lower) && !/\bms\.?\b/.test(lower)) return "Male";
  if (/\bmrs\.?\b/.test(lower) || /\bms\.?\b/.test(lower)) return "Female";

  return "Unknown";
}

function normalizeUltrasoundDetails(value) {
  if (typeof value === "string") {
    const s = value.trim();
    return s;
  }
  const obj = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!obj) return "";

  const details =
    toNullOrString(obj?.details ?? obj?.remark ?? obj?.remarks ?? obj?.note ?? obj?.notes ?? obj?.text) ?? "";
  if (details.trim()) return details.trim();

  const statusRaw = toNullOrString(obj?.status ?? obj?.value ?? obj?.result) ?? "";
  const status = statusRaw.trim().toLowerCase();
  if (status === "normal" || status === "abnormal") return statusRaw.trim();
  if (status === "n") return "Normal";
  if (status === "a") return "Abnormal";

  return "";
}

function normalizeUltrasoundPvr(value) {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!obj) {
    const s = typeof value === "string" ? value.trim() : "";
    const match = s.match(/(\d+(?:\.\d+)?)/);
    return { valueMl: match?.[1] ?? "", details: s };
  }
  const details =
    toNullOrString(obj?.details ?? obj?.remark ?? obj?.remarks ?? obj?.note ?? obj?.notes ?? obj?.text) ?? "";
  const rawMl =
    toNullOrString(obj?.valueMl ?? obj?.value_ml ?? obj?.value ?? obj?.ml ?? obj?.volumeMl ?? obj?.volume_ml) ?? "";
  const mlMatch = String(rawMl).trim().match(/(\d+(?:\.\d+)?)/);
  const valueMl = mlMatch?.[1] ?? "";
  return { valueMl, details: details.trim() };
}

function normalizeUltrasoundOtherFindings(value) {
  if (Array.isArray(value)) {
    return value.map((x) => toNullOrString(x)).filter(Boolean);
  }
  const s = toNullOrString(value);
  if (!s) return [];
  return s
    .split(/\r?\n|;|,/)
    .map((x) => String(x).trim())
    .filter(Boolean);
}

function normalizeUltrasoundReportDateString(value) {
  const raw = toNullOrString(value);
  if (!raw) return "";
  const s = raw.trim();
  if (!s) return "";

  const isoMatch = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = isoMatch[2].padStart(2, "0");
    const dd = isoMatch[3].padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const dmyMatch = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, "0");
    const mm = dmyMatch[2].padStart(2, "0");
    const yyRaw = dmyMatch[3];
    const yyyy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
    return `${yyyy}-${mm}-${dd}`;
  }

  const ymdMatch = s.match(/\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
  if (ymdMatch) {
    const yyyy = ymdMatch[1];
    const mm = ymdMatch[2].padStart(2, "0");
    const dd = ymdMatch[3].padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function extractUltrasoundReportDateFromText(text) {
  const s = typeof text === "string" ? text : "";
  if (!s) return "";

  const isoMatch = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = isoMatch[2].padStart(2, "0");
    const dd = isoMatch[3].padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const dmyMatch = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, "0");
    const mm = dmyMatch[2].padStart(2, "0");
    const yyRaw = dmyMatch[3];
    const yyyy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function normalizeUltrasoundFindings(parsedJson, { fallbackText, patientSexHint } = {}) {
  const root = parsedJson && typeof parsedJson === "object" ? parsedJson : {};
  const u = root?.ultrasound && typeof root.ultrasound === "object" ? root.ultrasound : root;

  const sexFromReport = normalizeUltrasoundPatientSex(
    u?.patientSex ?? u?.patient_sex ?? u?.sex ?? u?.gender ?? root?.patientSex ?? root?.sex
  );
  const sexFromHint = normalizeUltrasoundPatientSex(patientSexHint);
  const sexFromText = extractUltrasoundPatientSexFromText(fallbackText);
  const patientSex = sexFromReport !== "Unknown" ? sexFromReport : sexFromHint !== "Unknown" ? sexFromHint : sexFromText;

  const reportDate =
    normalizeUltrasoundReportDateString(
      u?.reportDate ?? u?.report_date ?? u?.date ?? u?.studyDate ?? u?.study_date ?? root?.reportDate ?? root?.date
    ) || extractUltrasoundReportDateFromText(fallbackText);

  const reportDetails =
    toNullOrString(u?.reportDetails ?? u?.report_details ?? u?.summary ?? u?.details ?? u?.impression) ?? "";

  const liver = normalizeUltrasoundDetails(u?.liver);
  const spleen = normalizeUltrasoundDetails(u?.spleen);
  const rightKidney = normalizeUltrasoundDetails(u?.rightKidney ?? u?.right_kidney ?? u?.rk);
  const leftKidney = normalizeUltrasoundDetails(u?.leftKidney ?? u?.left_kidney ?? u?.lk);
  const gallBladder = normalizeUltrasoundDetails(u?.gallBladder ?? u?.gall_bladder ?? u?.gb);
  const urinaryBladder = normalizeUltrasoundDetails(u?.urinaryBladder ?? u?.urinary_bladder ?? u?.ub);
  const postVoidResidualUrineVolumeMl = normalizeUltrasoundPvr(
    u?.postVoidResidualUrineVolumeMl ?? u?.post_void_residual_urine_volume_ml ?? u?.post_void_residual ?? u?.pvr
  );
  const uterus = normalizeUltrasoundDetails(u?.uterus);
  const ovaries = normalizeUltrasoundDetails(u?.ovaries ?? u?.ovary);
  const prostate = normalizeUltrasoundDetails(u?.prostate);
  const otherFindings = normalizeUltrasoundOtherFindings(u?.otherFindings ?? u?.other_findings ?? u?.other);

  const base = {
    patientSex,
    reportDate,
    reportDetails,
    liver,
    spleen,
    rightKidney,
    leftKidney,
    gallBladder,
    urinaryBladder,
    postVoidResidualUrineVolumeMl,
    otherFindings
  };

  if (patientSex === "Male") return { ...base, prostate };
  if (patientSex === "Female") return { ...base, uterus, ovaries };
  return { ...base, uterus, ovaries, prostate };
}

async function extractUltrasoundFindingsFromPdfs({
  openai,
  pdfFiles,
  imageFiles,
  extractedText,
  provider,
  patientSexHint
}) {
  const systemPrompt = MEDICAL_REPORT_EXTRACTION_SYSTEM_PROMPT;
  const userPrompt = buildUltrasoundUserPrompt({ patientSexHint });

  const resolvedProvider = normalizeAiProvider(provider);
  const pdfList = Array.isArray(pdfFiles) ? pdfFiles : [];
  const imageList = Array.isArray(imageFiles) ? imageFiles : [];

  if (resolvedProvider === "gemini") {
    const textForPrompt = requireString(extractedText) ? extractedText : await extractPdfTextRawForPrompt(pdfList);
    const parts = [
      {
        text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(
          textForPrompt,
          9000,
          ULTRASOUND_ANCHOR_TERMS
        )}`
      }
    ];
    for (const f of imageList) {
      parts.push({
        inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await geminiGenerateContent({
      parts,
      model: process.env.Gemini_model || getGeminiModel(),
      temperature: 0,
      maxOutputTokens: 4096
    });
    const content = getTextFromGeminiGenerateContentResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? safeParseJsonObject(content) ?? {};
    return normalizeUltrasoundFindings(parsedJson, { fallbackText: textForPrompt, patientSexHint });
  }

  if (resolvedProvider === "claude") {
    const textForPrompt = requireString(extractedText) ? extractedText : await extractPdfTextRawForPrompt(pdfList);
    const parts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(textForPrompt, 9000, ULTRASOUND_ANCHOR_TERMS)}`
      }
    ];
    for (const f of imageList) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
      });
    }
    const response = await anthropicCreateJsonMessage({
      system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
      messages: [{ role: "user", content: parts }],
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      temperature: 0,
      maxTokens: 4096
    });
    const content = getTextFromAnthropicMessageResponse(response);
    const parsedJson = safeParseJsonObjectLoose(content) ?? {};
    return normalizeUltrasoundFindings(parsedJson, { fallbackText: textForPrompt, patientSexHint });
  }

  let content = "";
  if (requireString(extractedText) && imageList.length === 0) {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        {
          role: "user",
          content: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 9000, ULTRASOUND_ANCHOR_TERMS)}`
        }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
    const parsedJson = safeParseJsonObject(content) ?? {};
    return normalizeUltrasoundFindings(parsedJson, { fallbackText: extractedText, patientSexHint });
  }

  if (imageList.length > 0 && pdfList.length === 0) {
    const contentParts = [
      {
        type: "text",
        text: `${userPrompt}\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 7000, ULTRASOUND_ANCHOR_TERMS)}`
      }
    ];
    for (const f of imageList) {
      const b64 = f.buffer.toString("base64");
      const dataUrl = `data:${f.mimetype};base64,${b64}`;
      contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
    }
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
        { role: "user", content: contentParts }
      ]
    });
    content = completion.choices?.[0]?.message?.content ?? "";
    const parsedJson = safeParseJsonObject(content) ?? {};
    return normalizeUltrasoundFindings(parsedJson, { fallbackText: extractedText, patientSexHint });
  }

  const fileParts = pdfList.map((f) => {
    const base64 = f.buffer.toString("base64");
    const fileDataUrl = `data:application/pdf;base64,${base64}`;
    return { type: "input_file", filename: f.originalname || "report.pdf", file_data: fileDataUrl };
  });
  const extraText = requireString(extractedText)
    ? `\n\n[EXTRACTED_TEXT]\n${capTextForPromptWithAnchors(extractedText, 7000, ULTRASOUND_ANCHOR_TERMS)}`
    : "";
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0,
    text: { format: { type: "json_object" } },
    input: [
      { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
      {
        role: "user",
        content: [...fileParts, { type: "input_text", text: `${userPrompt}${extraText}` }]
      }
    ]
  });
  content = getTextFromResponsesOutput(response);
  const parsedJson = safeParseJsonObject(content) ?? {};
  return normalizeUltrasoundFindings(parsedJson, { fallbackText: extractedText, patientSexHint });
}

gptRouter.post(
  "/advanced-body-composition",
  upload.single("file"),
  createAdvancedBodyCompositionHandler(getGptControllerContext)
);

gptRouter.post(
  "/heart-urine-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createHeartUrineAnalysisHandler(getGptControllerContext)
);

gptRouter.post(
  "/ultrasound-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createUltrasoundAnalysisHandler(getGptControllerContext)
);

gptRouter.post("/exercise-assessment", upload.none(), createExerciseAssessmentHandler(getGptControllerContext));

gptRouter.post("/diet-assessment", upload.none(), createDietAssessmentHandler(getGptControllerContext));

gptRouter.post("/social-fitness", upload.none(), (req, res) => {
  try {
    const normalized = normalizeSocialFitnessIncoming(req?.body);
    const computed = computeSocialFitness(normalized);
    res.json({ patient: normalized.patient, assessment: normalized.assessment, computed });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to calculate social fitness" });
  }
});

gptRouter.post("/heart-health-score", upload.none(), (req, res) => {
  try {
    const normalized = normalizeHeartHealthScoreIncoming(req?.body);
    const computed = computeHeartHealthScore(normalized);
    res.json({ patient: normalized.patient, assessment: normalized.assessment, computed });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to calculate heart health score" });
  }
});

gptRouter.post("/brain-health-part1", upload.none(), (req, res) => {
  try {
    const normalized = normalizeBrainHealthPart1Incoming(req?.body);
    const computed = computeBrainHealthPart1(normalized);
    res.json({ patient: normalized.patient, assessment: normalized.assessment, computed });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to calculate brain health summary" });
  }
});

gptRouter.post("/brain-health-part2", upload.none(), (req, res) => {
  try {
    const normalized = normalizeBrainHealthPart2Incoming(req?.body);
    const computed = computeBrainHealthPart2(normalized);
    res.json({ patient: normalized.patient, assessment: normalized.assessment, computed });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to calculate brain age" });
  }
});

gptRouter.post("/liver-health-scores", upload.none(), (req, res) => {
  try {
    const normalized = normalizeLiverHealthIncoming(req?.body);
    const computed = computeLiverScoresFromPatient(normalized.patient);
    res.json({ patient: normalized.patient, computed });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to calculate liver scores" });
  }
});

gptRouter.post(
  "/brain-health-part2-extract",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const provider = getAiProviderFromReq(req);
      const openai = getOpenAIClient();

      const patient = (() => {
        const raw = req?.body?.patientJson;
        const parsed = requireString(raw) ? safeParseJsonObjectLoose(raw) : null;
        const obj = parsed && typeof parsed === "object" ? parsed : {};
        const name = typeof obj.name === "string" ? obj.name.trim() : typeof req?.body?.name === "string" ? req.body.name.trim() : "";
        const sex = typeof obj.sex === "string" ? obj.sex.trim().toLowerCase() : typeof req?.body?.sex === "string" ? req.body.sex.trim().toLowerCase() : "";
        const age = parseOptionalIntegerLoose(obj.age ?? req?.body?.age);
        return {
          name,
          sex: sex === "male" || sex === "female" ? sex : "",
          age: Number.isFinite(age) && age > 0 ? age : null
        };
      })();

      const uploaded = collectUploadedFiles(req);
      const pdfFiles = uploaded.filter((f) => f && isPdfMime(f));
      const docxFiles = uploaded.filter((f) => f && isDocxMime(f));
      if (pdfFiles.length === 0 && docxFiles.length === 0) {
        return res.status(400).json({ error: "Please upload a PDF or DOCX report." });
      }

      const pdfText = pdfFiles.length > 0 ? await extractPdfTextRawForPrompt(pdfFiles) : "";
      const docxText = docxFiles.length > 0 ? await extractDocxTextRawForPrompt(docxFiles) : "";
      const extractedText = `${docxText}${pdfText}`.trim();

      const debug = String(req?.body?.debug || "").toLowerCase() === "true";
      const resolvedProvider = normalizeAiProvider(provider);
      const canUseAi =
        (resolvedProvider === "openai" && !!openai) ||
        (resolvedProvider === "claude" && hasAnthropicKey()) ||
        (resolvedProvider === "gemini" && hasGeminiKey());

      const payload = canUseAi
        ? await generateBrainHealthPart2ExtractWithAi({
            openai,
            provider,
            patient,
            extractedText,
            debug
          })
        : (() => {
            const heur = heuristicExtractBrainHealthPart2FromText(extractedText);
            const note = resolvedProvider
              ? `Heuristic extraction used (AI provider '${resolvedProvider}' not configured)`
              : "Heuristic extraction used (AI provider not configured)";
            return { ...heur, notes: [...(Array.isArray(heur.notes) ? heur.notes : []), note] };
          })();

      const extracted = normalizeBrainHealthPart2ExtractPayload(payload);
      res.json({ extracted });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to extract MRI findings" });
    }
  }
);

gptRouter.post(
  "/ans-assessment",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createAnsAssessmentHandler(getGptControllerContext)
);

gptRouter.post(
  "/arterial-health",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createArterialHealthHandler(getGptControllerContext)
);

gptRouter.post(
  "/lung-function",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createLungFunctionHandler(getGptControllerContext)
);

gptRouter.post(
  "/liver-health",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createLiverHealthHandler(getGptControllerContext)
);

gptRouter.post(
  "/eye-health",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createEyeHealthHandler(getGptControllerContext)
);

gptRouter.post(
  "/kidney-health",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createKidneyHealthHandler(getGptControllerContext)
);

gptRouter.post(
  "/diabetes-risk",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createDiabetesRiskHandler(getGptControllerContext)
);

gptRouter.post("/diabetes-annual-risk", async (req, res) => {
  try {
    const provider = normalizeAiProvider(req?.body?.provider);
    const body = req.body && typeof req.body === "object" ? req.body : {};

    const hba1c = parseOptionalNumberLoose(body.hba1c);
    const fastingGlucose = parseOptionalNumberLoose(body.fastingGlucoseMgDl);
    const fastingInsulin = parseOptionalNumberLoose(body.fastingInsulinUuMl);
    const ldl = parseOptionalNumberLoose(body.ldlMgDl);
    const homaIr = parseOptionalNumberLoose(body.homaIr);
    const quicki = parseOptionalNumberLoose(body.quicki);
    const idrsTotal = parseOptionalNumberLoose(body.idrsTotal);
    const idrsRiskCategory = typeof body.idrsRiskCategory === "string" ? body.idrsRiskCategory : "";
    const statinRecommendation = typeof body.statinRecommendation === "string" ? body.statinRecommendation : "";
    const diabetes = typeof body.diabetes === "string" ? body.diabetes : "";
    const diabetesYears = typeof body.diabetesSinceHowManyYears === "string" ? body.diabetesSinceHowManyYears : "";
    const age = typeof body.age === "string" ? body.age : "";
    const sex = typeof body.sex === "string" ? body.sex : "";
    const bmi = typeof body.bmi === "string" ? body.bmi : "";
    const hypertension = typeof body.hypertension === "string" ? body.hypertension : "";
    const smoking = typeof body.smoking === "string" ? body.smoking : "";
    const familyDiabetes = typeof body.familyDiabetes === "string" ? body.familyDiabetes : "";
    const waistCm = parseOptionalNumberLoose(body.waistCm);

    const dataLines = [
      `Patient: age=${age}, sex=${sex}, BMI=${bmi}`,
      `HbA1c: ${Number.isFinite(hba1c) ? hba1c + "%" : "not available"}`,
      `Fasting glucose: ${Number.isFinite(fastingGlucose) ? fastingGlucose + " mg/dL" : "not available"}`,
      `Fasting insulin: ${Number.isFinite(fastingInsulin) ? fastingInsulin + " µU/mL" : "not available"}`,
      `LDL: ${Number.isFinite(ldl) ? ldl + " mg/dL" : "not available"}`,
      `HOMA-IR: ${Number.isFinite(homaIr) ? homaIr : "not available"}`,
      `QUICKI: ${Number.isFinite(quicki) ? quicki : "not available"}`,
      `IDRS total score: ${Number.isFinite(idrsTotal) ? idrsTotal : "not available"}, risk category: ${idrsRiskCategory || "not available"}`,
      `Waist circumference: ${Number.isFinite(waistCm) ? waistCm + " cm" : "not available"}`,
      `Diabetes status: ${diabetes || "not available"}`,
      `Diabetes duration: ${diabetesYears || "not available"}`,
      `Hypertension: ${hypertension || "not available"}`,
      `Smoking: ${smoking || "not available"}`,
      `Family history of diabetes (parents): ${familyDiabetes || "not available"}`,
      `Statin recommendation: ${statinRecommendation || "not available"}`
    ].join("\n");

    const systemPrompt = [
      "You are a clinical decision support engine for diabetes risk assessment.",
      "Given the patient's diabetes-related data, provide:",
      "1. Annual risk of developing diabetes (as a concise label, e.g. 'Very low (<0.5%/yr)', '~5-10% per year', '10-25% per year', 'Already diabetic', etc.)",
      "2. Clinical meaning (a brief 1-2 sentence clinical interpretation considering ALL the provided data, not just HbA1c)",
      "",
      "Return ONLY valid JSON. Do not add markdown. Do not add commentary.",
      "JSON format:",
      '{ "annualRisk": "...", "clinicalMeaning": "..." }'
    ].join("\n");

    const userPrompt = `Assess the annual risk of developing diabetes and provide clinical meaning based on these values:\n\n${dataLines}`;

    let raw = "";
    if (provider === "gemini") {
      const response = await geminiGenerateContent({
        parts: [{ text: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}\n\n${userPrompt}` }],
        model: process.env.Gemini_model || getGeminiModel(),
        temperature: 0,
        maxOutputTokens: 1024
      });
      raw = getTextFromGeminiGenerateContentResponse(response);
    } else if (provider === "claude") {
      const response = await anthropicCreateJsonMessage({
        system: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}`,
        messages: [{ role: "user", content: userPrompt }],
        model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
        temperature: 0,
        maxTokens: 1024
      });
      raw = getTextFromAnthropicMessageResponse(response);
    } else {
      const openai = getOpenAIClient();
      if (!openai) return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${systemPrompt}${AI_OUTPUT_JSON_SUFFIX}` },
          { role: "user", content: userPrompt }
        ]
      });
      raw = completion.choices?.[0]?.message?.content ?? "";
    }

    const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(extractFirstJsonObjectText(raw) || "") ?? {};
    const annualRisk = typeof parsed.annualRisk === "string" ? parsed.annualRisk : "";
    const clinicalMeaning = typeof parsed.clinicalMeaning === "string" ? parsed.clinicalMeaning : "";

    res.json({ result: { annualRisk, clinicalMeaning } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

gptRouter.post(
  "/women-health",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createWomenHealthHandler(getGptControllerContext)
);

gptRouter.post(
  "/bone-health",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createBoneHealthHandler(getGptControllerContext)
);

gptRouter.post(
  "/adult-vaccination",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createAdultVaccinationHandler(getGptControllerContext)
);

gptRouter.post(
  "/cancer-screening",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createCancerScreeningHandler(getGptControllerContext)
);

gptRouter.post(
  "/genes-health",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createGenesHealthHandler(getGptControllerContext)
);

gptRouter.post(
  "/allergy-panels",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createAllergyPanelsHandler(getGptControllerContext)
);

gptRouter.post(
  "/brain-health-assessment",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createBrainHealthAssessmentHandler(getGptControllerContext)
);

gptRouter.post(
  "/docs-tests",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createDocsTestsHandler(getGptControllerContext)
);

gptRouter.post("/docs-tests-clean", upload.none(), createDocsTestsCleanHandler(getGptControllerContext));

gptRouter.post("/docs-tests-excel", upload.none(), createDocsTestsExcelHandler(getGptControllerContext));

gptRouter.post(
  "/heart-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createHeartAnalysisHandler(getGptControllerContext)
);

gptRouter.post(
  "/urine-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createUrineAnalysisHandler(getGptControllerContext)
);

gptRouter.post(
  "/blood-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createBloodAnalysisHandler(getGptControllerContext)
);

gptRouter.post(
  "/other-analysis",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  createOtherAnalysisHandler(getGptControllerContext)
);

// ── Cardiac Investigations extraction ─────────────────────────────────────────
gptRouter.post(
  "/cardiac-investigations",
  upload.fields([
    { name: "files", maxCount: MAX_ANALYSIS_FILES },
    { name: "file", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const provider = getAiProviderFromReq(req);
      const openai = provider === "openai" ? getOpenAIClient() : null;
      if (provider === "openai" && !openai) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
      }

      const uploaded = collectUploadedFiles(req);
      if (uploaded.length === 0) {
        return res.status(400).json({ error: "Please upload at least one cardiac document." });
      }

      const pdfFiles = uploaded.filter((f) => f && isPdfMime(f));
      const docxFiles = uploaded.filter((f) => f && isDocxMime(f));
      const imageFiles = uploaded.filter((f) => f && isImageMime(f));

      const pdfText = pdfFiles.length > 0 ? await extractPdfTextRawForPrompt(pdfFiles) : "";
      const docxText = docxFiles.length > 0 ? await extractDocxTextRawForPrompt(docxFiles) : "";
      const extractedText = `${pdfText}${docxText}`.trim();

      const patientAge = typeof req.body?.patientAge === "string" ? req.body.patientAge.trim() : "";
      const patientSex = typeof req.body?.patientSex === "string" ? req.body.patientSex.trim() : "";
      const patientDiabetic = req.body?.patientDiabetic === "yes";

      const systemPrompt = `${CARDIAC_INVESTIGATIONS_SYSTEM_PROMPT}${AI_OUTPUT_JSON_SUFFIX}`;
      const userPrompt = buildCardiacInvestigationsUserPrompt({ extractedText, patientAge, patientSex, patientDiabetic });

      let raw = "";
      const resolvedProvider = normalizeAiProvider(provider);

      if (resolvedProvider === "gemini" && hasGeminiKey()) {
        const parts = [{ text: `${systemPrompt}\n\n${userPrompt}` }];
        for (const f of imageFiles) {
          parts.push({ inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } });
        }
        const response = await geminiGenerateContent({
          parts,
          model: process.env.Gemini_model || getGeminiModel(),
          temperature: 0,
          maxOutputTokens: 8192
        });
        raw = getTextFromGeminiGenerateContentResponse(response);
      } else if (resolvedProvider === "claude" && hasAnthropicKey()) {
        const parts = [{ type: "text", text: userPrompt }];
        for (const f of imageFiles) {
          parts.push({
            type: "image",
            source: { type: "base64", media_type: f.mimetype, data: f.buffer.toString("base64") }
          });
        }
        const response = await anthropicCreateJsonMessage({
          system: systemPrompt,
          messages: [{ role: "user", content: parts }],
          model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
          temperature: 0,
          maxTokens: 8192
        });
        raw = getTextFromAnthropicMessageResponse(response);
      } else {
        if (!openai) throw new Error("OpenAI client is not available");
        const contentParts = [{ type: "text", text: userPrompt }];
        for (const f of imageFiles) {
          const dataUrl = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;
          contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
        }
        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-4o",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: contentParts }
          ]
        });
        raw = completion.choices?.[0]?.message?.content ?? "";
      }

      const parsed = safeParseJsonObject(raw) ?? safeParseJsonObjectLoose(raw) ?? {};
      res.json(parsed);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to extract cardiac investigations" });
    }
  }
);

let _gptControllerContext = null;

function getGptControllerContext() {
  if (_gptControllerContext) return _gptControllerContext;
  _gptControllerContext = {
    requireString,
    getOpenAIClient,
    getAiProviderFromReq,
    hasAnthropicKey,
    hasGeminiKey,
    getGeminiModel,
    getTextFromAnthropicMessageResponse,
    getTextFromGeminiGenerateContentResponse,
    anthropicCreateJsonMessage,
    geminiGenerateContent,
    parseMaybeJson,
    parseMaybeNumber,
    normalizeExerciseAssessmentIncoming,
    computeExerciseAssessment,
    generateExerciseAssessmentSummaryWithAi,
    normalizeDietAssessmentIncoming,
    computeDietAssessment,
    generateDietAssessmentSummaryWithAi,
    normalizeAnsAssessmentIncoming,
    computeOrthostaticVitals,
    generateAnsAssessmentWithAi,
    normalizeArterialHealthIncoming,
    generateArterialHealthWithAi,
    normalizeLungFunctionIncoming,
    generateLungFunctionWithAi,
    normalizeLiverHealthIncoming,
    generateLiverHealthWithAi,
    normalizeEyeHealthIncoming,
    generateEyeHealthWithAi,
    normalizeKidneyHealthIncoming,
    generateKidneyHealthWithAi,
    normalizeDiabetesRiskIncoming,
    generateDiabetesRiskWithAi,
    normalizeWomenHealthIncoming,
    generateWomenHealthWithAi,
    normalizeBoneHealthIncoming,
    generateBoneHealthWithAi,
    normalizeAdultVaccinationIncoming,
    generateAdultVaccinationWithAi,
    normalizeCancerScreeningIncoming,
    generateCancerScreeningWithAi,
    normalizeGenesHealthIncoming,
    generateGenesHealthWithAi,
    normalizeAllergyPanelsIncoming,
    generateAllergyPanelsWithAi,
    normalizeBrainHealthAssessmentIncoming,
    generateBrainHealthAssessmentWithAi,
    getTextFromMessageContent,
    getTextFromResponsesOutput,
    isImageMime,
    isPdfMime,
    isDocxMime,
    collectUploadedFiles,
    extractPdfTextRawForPrompt,
    extractPdfTextForPrompt,
    extractPdfTextForBloodPrompt,
    extractDocxTextForPrompt,
    extractDocxTextForBloodPrompt,
    safeParseJsonObject,
    safeParseJsonObjectLoose,
    safeParseJsonArrayLoose,
    stripBrandingFromAdvancedBodyCompositionPayload,
    toNullOrString,
    canonicalizeTestName,
    PARAMETER_TESTS_PREFERRED,
    normalizeLooseIncomingTests,
    buildDocsTestsExcelBuffer,
    getChunkParams,
    estimateTotalTestsInReportText,
    sliceTextFixedWithOverlap,
    splitTextWindows,
    extractDocsTestsFromImagesAndText,
    extractDocsTestsFromText,
    mergeTestEntries,
    isMissingDocsTestsField,
    filterDocsTestsToMedicalOnly,
    heuristicExtractDocsTestsFromText,
    cleanDocsTestsWithAi,
    extractHeartRelatedTestsFromPdfs,
    extractUrinogramTestsFromPdfs,
    extractUltrasoundFindingsFromPdfs,
    chunkArray,
    mapWithConcurrency,
    PARAMETER_TESTS_FOR_EXTRACTION,
    extractTestsFromPdfs,
    buildCompleteUrinogramTests,
    buildPresentedCategory,
    BLOOD_PARAMETER_TESTS,
    OTHER_PARAMETER_TESTS,
    sliceTextFixed,
    extractAllBloodParametersFromImagesAndText,
    extractAllBloodParametersFromText,
    sliceChunkFixed,
    OTHER_ANALYSIS_EXTRACT_TESTS,
    buildStrictCategory
  };
  return _gptControllerContext;
}
