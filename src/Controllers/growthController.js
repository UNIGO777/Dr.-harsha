import mongoose from "mongoose";
import { Recommendation, RECOMMENDATION_STAGE_ENUM } from "../Models/Recommendation.js";
import { Enrollment, ENROLLMENT_STATUS_ENUM } from "../Models/Enrollment.js";
import { ReferralRequest, REFERRAL_STATUS_ENUM } from "../Models/ReferralRequest.js";
import { GoogleReview } from "../Models/GoogleReview.js";
import { ServiceCatalog } from "../Models/ServiceCatalog.js";
import { User } from "../Models/User.js";

function normalizeString(value, maxLength = 500) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, maxLength);
}

const STAGE_TIMESTAMP_FIELDS = {
  interested: "interestedAt",
  booked: "bookedAt",
  paid: "paidAt",
  completed: "completedAt",
  declined: "declinedAt"
};

function buildRecommendationResponse(rec) {
  return {
    id: rec._id.toString(),
    patient: rec.patient?._id
      ? { id: rec.patient._id.toString(), name: rec.patient.name || "", userNumber: rec.patient.userNumber ?? null }
      : null,
    service: rec.service?._id
      ? { id: rec.service._id.toString(), name: rec.service.name || "", price: rec.service.price ?? null }
      : null,
    category: rec.category,
    expectedValue: rec.expectedValue || 0,
    recommendedBy: rec.recommendedBy?._id
      ? { id: rec.recommendedBy._id.toString(), name: rec.recommendedBy.name || "" }
      : null,
    stage: rec.stage,
    recommendedAt: rec.recommendedAt,
    interestedAt: rec.interestedAt || null,
    bookedAt: rec.bookedAt || null,
    paidAt: rec.paidAt || null,
    completedAt: rec.completedAt || null,
    declinedAt: rec.declinedAt || null,
    declineReason: rec.declineReason || "",
    note: rec.note || "",
    createdAt: rec.createdAt
  };
}

/* ── Recommendations (service funnel) ──────────────────────────────── */

export async function listRecommendationsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const patientId = normalizeString(req?.query?.patientId, 50);
    const category = normalizeString(req?.query?.category, 50);
    const stage = normalizeString(req?.query?.stage, 50);
    const page = Math.max(1, parseInt(req?.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req?.query?.limit, 10) || 25));

    const query = {};
    if (mongoose.isValidObjectId(patientId)) query.patient = patientId;
    if (category) query.category = category;
    if (stage && RECOMMENDATION_STAGE_ENUM.includes(stage)) query.stage = stage;

    const [recommendations, total] = await Promise.all([
      Recommendation.find(query)
        .populate("patient", "name userNumber")
        .populate("service", "name price")
        .populate("recommendedBy", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Recommendation.countDocuments(query)
    ]);

    return res.json({ recommendations: recommendations.map(buildRecommendationResponse), total, page, limit });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list recommendations" });
  }
}

export async function createRecommendationController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const patientId = normalizeString(req?.body?.patientId, 50);
    const serviceId = normalizeString(req?.body?.serviceId, 50);
    if (!mongoose.isValidObjectId(patientId)) return res.status(400).json({ error: "patientId is required" });
    if (!mongoose.isValidObjectId(serviceId)) return res.status(400).json({ error: "serviceId is required" });

    const [patient, service] = await Promise.all([
      User.findOne({ _id: patientId, role: "patient" }).select("name userNumber").lean(),
      ServiceCatalog.findById(serviceId).lean()
    ]);
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    if (!service) return res.status(404).json({ error: "Service not found" });

    // One open funnel per patient-service; a declined/completed one may be re-opened as new
    const openExisting = await Recommendation.findOne({
      patient: patient._id,
      service: service._id,
      stage: { $in: ["recommended", "interested", "booked", "paid"] }
    }).lean();
    if (openExisting) {
      return res.status(409).json({ error: `An open recommendation for ${service.name} already exists for this patient` });
    }

    const now = new Date();
    const recommendation = await Recommendation.create({
      patient: patient._id,
      service: service._id,
      category: service.category,
      expectedValue: service.price || 0,
      recommendedBy: req?.user?._id || null,
      appointment: mongoose.isValidObjectId(req?.body?.appointmentId) ? req.body.appointmentId : null,
      stage: "recommended",
      recommendedAt: now,
      stageHistory: [{ stage: "recommended", at: now, by: req?.user?._id || null }],
      note: normalizeString(req?.body?.note)
    });

    return res.status(201).json({
      message: `${service.name} recommended to ${patient.name}.`,
      recommendation: buildRecommendationResponse({ ...recommendation.toObject(), patient, service })
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create recommendation" });
  }
}

export async function updateRecommendationStageController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const recommendationId = normalizeString(req?.params?.recommendationId, 50);
    if (!mongoose.isValidObjectId(recommendationId)) return res.status(400).json({ error: "Invalid recommendationId" });

    const stage = normalizeString(req?.body?.stage, 50);
    if (!RECOMMENDATION_STAGE_ENUM.includes(stage)) return res.status(400).json({ error: "Invalid stage" });

    const recommendation = await Recommendation.findById(recommendationId);
    if (!recommendation) return res.status(404).json({ error: "Recommendation not found" });
    if (recommendation.stage === stage) return res.status(409).json({ error: `Already in stage "${stage}"` });

    const now = new Date();
    recommendation.stage = stage;
    recommendation.stageHistory.push({
      stage,
      at: now,
      by: req?.user?._id || null,
      note: normalizeString(req?.body?.note, 300)
    });

    const timestampField = STAGE_TIMESTAMP_FIELDS[stage];
    if (timestampField && !recommendation[timestampField]) recommendation[timestampField] = now;
    if (stage === "declined") recommendation.declineReason = normalizeString(req?.body?.declineReason, 300);

    await recommendation.save();
    const populated = await Recommendation.findById(recommendation._id)
      .populate("patient", "name userNumber")
      .populate("service", "name price")
      .populate("recommendedBy", "name")
      .lean();

    return res.json({ message: `Moved to ${stage}.`, recommendation: buildRecommendationResponse(populated) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update recommendation" });
  }
}

/* ── Enrollments (programmes / renewals) ───────────────────────────── */

function buildEnrollmentResponse(enrollment) {
  return {
    id: enrollment._id.toString(),
    patient: enrollment.patient?._id
      ? { id: enrollment.patient._id.toString(), name: enrollment.patient.name || "", phone: enrollment.patient.phone || "", userNumber: enrollment.patient.userNumber ?? null }
      : null,
    service: enrollment.service?._id
      ? { id: enrollment.service._id.toString(), name: enrollment.service.name || "", price: enrollment.service.price ?? null }
      : null,
    category: enrollment.category,
    startAt: enrollment.startAt,
    endAt: enrollment.endAt || null,
    renewalDueAt: enrollment.renewalDueAt || null,
    status: enrollment.status,
    notes: enrollment.notes || "",
    createdAt: enrollment.createdAt
  };
}

export async function listEnrollmentsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const status = normalizeString(req?.query?.status, 50);
    const patientId = normalizeString(req?.query?.patientId, 50);
    const renewalsDueDays = parseInt(req?.query?.renewalsDueDays, 10);
    const page = Math.max(1, parseInt(req?.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req?.query?.limit, 10) || 25));

    const query = {};
    if (status && ENROLLMENT_STATUS_ENUM.includes(status)) query.status = status;
    if (mongoose.isValidObjectId(patientId)) query.patient = patientId;
    if (Number.isInteger(renewalsDueDays) && renewalsDueDays > 0) {
      query.status = "active";
      query.renewalDueAt = {
        $ne: null,
        $lte: new Date(Date.now() + renewalsDueDays * 24 * 60 * 60 * 1000)
      };
    }

    const [enrollments, total] = await Promise.all([
      Enrollment.find(query)
        .populate("patient", "name phone userNumber")
        .populate("service", "name price")
        .sort({ renewalDueAt: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Enrollment.countDocuments(query)
    ]);

    return res.json({ enrollments: enrollments.map(buildEnrollmentResponse), total, page, limit });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list enrollments" });
  }
}

export async function updateEnrollmentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const enrollmentId = normalizeString(req?.params?.enrollmentId, 50);
    if (!mongoose.isValidObjectId(enrollmentId)) return res.status(400).json({ error: "Invalid enrollmentId" });

    const enrollment = await Enrollment.findById(enrollmentId);
    if (!enrollment) return res.status(404).json({ error: "Enrollment not found" });

    const body = req?.body || {};
    const action = normalizeString(body.action, 50);

    if (action === "renew") {
      if (enrollment.status !== "active" && enrollment.status !== "lapsed") {
        return res.status(409).json({ error: `Cannot renew a ${enrollment.status} enrollment` });
      }
      const service = await ServiceCatalog.findById(enrollment.service).lean();
      const durationDays = service?.durationDays || 30;
      const now = new Date();
      const startAt = enrollment.endAt && enrollment.endAt > now ? enrollment.endAt : now;
      const endAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

      const renewal = await Enrollment.create({
        patient: enrollment.patient,
        service: enrollment.service,
        category: enrollment.category,
        startAt,
        endAt,
        renewalDueAt: service?.renewable ? endAt : null,
        status: "active",
        createdBy: req?.user?._id || null,
        notes: normalizeString(body.notes)
      });

      enrollment.status = "renewed";
      enrollment.renewedTo = renewal._id;
      await enrollment.save();

      return res.json({ message: "Enrollment renewed.", enrollment: buildEnrollmentResponse(renewal.toObject()) });
    }

    const status = normalizeString(body.status, 50);
    if (status) {
      if (!ENROLLMENT_STATUS_ENUM.includes(status)) return res.status(400).json({ error: "Invalid status" });
      enrollment.status = status;
    }
    if (Object.prototype.hasOwnProperty.call(body, "notes")) enrollment.notes = normalizeString(body.notes);
    if (Object.prototype.hasOwnProperty.call(body, "renewalDueAt")) {
      const date = body.renewalDueAt ? new Date(body.renewalDueAt) : null;
      if (date && Number.isNaN(date.getTime())) return res.status(400).json({ error: "Invalid renewalDueAt" });
      enrollment.renewalDueAt = date;
    }

    await enrollment.save();
    const populated = await Enrollment.findById(enrollment._id)
      .populate("patient", "name phone userNumber")
      .populate("service", "name price")
      .lean();

    return res.json({ message: "Enrollment updated.", enrollment: buildEnrollmentResponse(populated) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update enrollment" });
  }
}

/* ── Referral requests ─────────────────────────────────────────────── */

function buildReferralResponse(referral) {
  return {
    id: referral._id.toString(),
    patient: referral.patient?._id
      ? { id: referral.patient._id.toString(), name: referral.patient.name || "", userNumber: referral.patient.userNumber ?? null }
      : null,
    askedBy: referral.askedBy?._id ? { id: referral.askedBy._id.toString(), name: referral.askedBy.name || "" } : null,
    askedAt: referral.askedAt,
    status: referral.status,
    referredName: referral.referredName || "",
    referredPhone: referral.referredPhone || "",
    referredAt: referral.referredAt || null,
    convertedPatient: referral.convertedPatient?._id
      ? { id: referral.convertedPatient._id.toString(), name: referral.convertedPatient.name || "" }
      : null,
    convertedAt: referral.convertedAt || null,
    notes: referral.notes || "",
    createdAt: referral.createdAt
  };
}

export async function listReferralsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const status = normalizeString(req?.query?.status, 50);
    const page = Math.max(1, parseInt(req?.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req?.query?.limit, 10) || 25));

    const query = {};
    if (status && REFERRAL_STATUS_ENUM.includes(status)) query.status = status;

    const [referrals, total, statusCountsRaw] = await Promise.all([
      ReferralRequest.find(query)
        .populate("patient", "name userNumber")
        .populate("askedBy", "name")
        .populate("convertedPatient", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ReferralRequest.countDocuments(query),
      ReferralRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
    ]);

    const statusCounts = Object.fromEntries(REFERRAL_STATUS_ENUM.map((value) => [value, 0]));
    for (const row of statusCountsRaw) {
      if (row._id in statusCounts) statusCounts[row._id] = row.count;
    }

    return res.json({ referrals: referrals.map(buildReferralResponse), total, page, limit, statusCounts });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list referrals" });
  }
}

export async function createReferralController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const patientId = normalizeString(req?.body?.patientId, 50);
    if (!mongoose.isValidObjectId(patientId)) return res.status(400).json({ error: "patientId is required" });

    const patient = await User.findOne({ _id: patientId, role: "patient" }).select("name userNumber").lean();
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    const referral = await ReferralRequest.create({
      patient: patient._id,
      askedBy: req?.user?._id || null,
      askedAt: new Date(),
      status: "asked",
      notes: normalizeString(req?.body?.notes)
    });

    return res.status(201).json({
      message: `Referral request logged for ${patient.name}.`,
      referral: buildReferralResponse({ ...referral.toObject(), patient })
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create referral" });
  }
}

export async function updateReferralController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const referralId = normalizeString(req?.params?.referralId, 50);
    if (!mongoose.isValidObjectId(referralId)) return res.status(400).json({ error: "Invalid referralId" });

    const referral = await ReferralRequest.findById(referralId);
    if (!referral) return res.status(404).json({ error: "Referral not found" });

    const body = req?.body || {};
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    const now = new Date();

    if (has("status")) {
      const status = normalizeString(body.status, 50);
      if (!REFERRAL_STATUS_ENUM.includes(status)) return res.status(400).json({ error: "Invalid status" });
      referral.status = status;
      if (status === "referred" && !referral.referredAt) referral.referredAt = now;
      if (status === "converted" && !referral.convertedAt) referral.convertedAt = now;
    }
    if (has("referredName")) referral.referredName = normalizeString(body.referredName, 200);
    if (has("referredPhone")) referral.referredPhone = normalizeString(body.referredPhone, 30);
    if (has("notes")) referral.notes = normalizeString(body.notes);
    if (has("convertedPatientId") && mongoose.isValidObjectId(body.convertedPatientId)) {
      referral.convertedPatient = body.convertedPatientId;
      if (!referral.convertedAt) referral.convertedAt = now;
      referral.status = "converted";
    }

    await referral.save();
    const populated = await ReferralRequest.findById(referral._id)
      .populate("patient", "name userNumber")
      .populate("askedBy", "name")
      .populate("convertedPatient", "name")
      .lean();

    return res.json({ message: "Referral updated.", referral: buildReferralResponse(populated) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update referral" });
  }
}

/* ── Google reviews (manual log) ───────────────────────────────────── */

export async function listGoogleReviewsController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const page = Math.max(1, parseInt(req?.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req?.query?.limit, 10) || 25));
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [reviews, total, thisMonthCount] = await Promise.all([
      GoogleReview.find({})
        .populate("patient", "name")
        .sort({ reviewedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      GoogleReview.countDocuments({}),
      GoogleReview.countDocuments({ reviewedAt: { $gte: monthStart } })
    ]);

    return res.json({
      reviews: reviews.map((review) => ({
        id: review._id.toString(),
        reviewedAt: review.reviewedAt,
        rating: review.rating ?? null,
        reviewerName: review.reviewerName || "",
        patient: review.patient?._id ? { id: review.patient._id.toString(), name: review.patient.name || "" } : null,
        notes: review.notes || ""
      })),
      total,
      thisMonthCount,
      page,
      limit
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list reviews" });
  }
}

export async function createGoogleReviewController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const ratingRaw = req?.body?.rating;
    let rating = null;
    if (ratingRaw !== undefined && ratingRaw !== null && ratingRaw !== "") {
      rating = parseInt(ratingRaw, 10);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "rating must be between 1 and 5" });
      }
    }

    const reviewedAt = req?.body?.reviewedAt ? new Date(req.body.reviewedAt) : new Date();
    if (Number.isNaN(reviewedAt.getTime())) return res.status(400).json({ error: "Invalid reviewedAt" });

    const review = await GoogleReview.create({
      reviewedAt,
      rating,
      reviewerName: normalizeString(req?.body?.reviewerName, 200),
      patient: mongoose.isValidObjectId(req?.body?.patientId) ? req.body.patientId : null,
      notes: normalizeString(req?.body?.notes),
      recordedBy: req?.user?._id || null
    });

    return res.status(201).json({
      message: "Google review logged.",
      review: { id: review._id.toString(), reviewedAt: review.reviewedAt, rating: review.rating ?? null }
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to log review" });
  }
}
