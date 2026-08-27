/* Temporary integration test for the growth stack + intake + backup wiring.
   Run: node --env-file=.env scripts/_integration_test.mjs
   Creates TEST-prefixed rows over HTTP against localhost:5599 and deletes them at the end. */

import { connectDb } from "../src/utils/connectDb.js";
import { buildAccessToken } from "../src/utils/tokenService.js";
import { User } from "../src/Models/User.js";
import { Appointment } from "../src/Models/Appointment.js";
import { PatientProfile } from "../src/Models/PatientProfile.js";
import mongoose from "mongoose";

const BASE = "http://localhost:5599";
let pass = 0, fail = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; failures.push(label); console.log(`  FAIL ${label} ${detail}`); }
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { status: res.status, data };
}

const cleanup = { leads: [], services: [], recommendations: [], invoices: [], payments: [], enrollments: [], referrals: [], reviews: [], preconsultNotes: [] };

async function main() {
  const db = await connectDb();
  if (!db.connected) throw new Error("DB connect failed");

  // ── Actors ──
  const admin = await User.findOne({ role: "super_admin", status: "active" }).lean();
  const nurse = await User.findOne({ role: "nurse", status: "active" }).lean();
  const doctor = await User.findOne({ role: "doctor", status: "active" }).lean();
  const patient = await User.findOne({ role: "patient", status: "active" }).lean();
  console.log(`actors: admin=${!!admin} nurse=${!!nurse} doctor=${!!doctor} patient=${!!patient}`);
  if (!admin || !patient) throw new Error("Need at least an admin and a patient in the DB");

  const adminToken = buildAccessToken(admin);
  const nurseToken = nurse ? buildAccessToken(nurse) : null;
  const doctorToken = doctor ? buildAccessToken(doctor) : null;
  const patientToken = buildAccessToken(patient);

  /* ── 1. Auth / role guards ── */
  console.log("\n[1] Role guards");
  check("no token → 401", (await api(null, "GET", "/api/users/leads")).status === 401);
  check("patient on /leads → 403", (await api(patientToken, "GET", "/api/users/leads")).status === 403);
  if (nurseToken) check("nurse on /billing/revenue-summary → 403", (await api(nurseToken, "GET", "/api/users/billing/revenue-summary")).status === 403);
  if (doctorToken) check("doctor can read /leads", (await api(doctorToken, "GET", "/api/users/leads")).status === 200);

  /* ── 2. Leads pipeline ── */
  console.log("\n[2] Leads");
  const leadCreate = await api(adminToken, "POST", "/api/users/leads", { name: "TEST Lead Integration", phone: "+91 99999 00001", source: "google_maps", interestedIn: "Full body check" });
  check("create lead", leadCreate.status === 201 && leadCreate.data?.lead?.stage === "new", JSON.stringify(leadCreate.data).slice(0, 120));
  const leadId = leadCreate.data?.lead?.id;
  if (leadId) cleanup.leads.push(leadId);

  const badLead = await api(adminToken, "POST", "/api/users/leads", { name: "TEST bad", source: "tiktok" });
  check("invalid source → 400", badLead.status === 400);

  const marked = await api(adminToken, "PATCH", `/api/users/leads/${leadId}`, { markContacted: true, note: "TEST call done" });
  check("markContacted moves new→contacted + stamps time", marked.status === 200 && marked.data?.lead?.stage === "contacted" && !!marked.data?.lead?.firstContactedAt);
  check("note recorded", marked.data?.lead?.notes?.some(n => n.content === "TEST call done"));

  const staged = await api(adminToken, "PATCH", `/api/users/leads/${leadId}`, { stage: "interested" });
  check("stage → interested", staged.status === 200 && staged.data?.lead?.stage === "interested");

  const converted = await api(adminToken, "POST", `/api/users/leads/${leadId}/convert`, { patientId: patient._id.toString() });
  check("convert links patient", converted.status === 200 && converted.data?.lead?.convertedPatient?.id === patient._id.toString());
  check("double convert → 409", (await api(adminToken, "POST", `/api/users/leads/${leadId}/convert`, { patientId: patient._id.toString() })).status === 409);

  const leadList = await api(adminToken, "GET", "/api/users/leads?stage=converted&limit=5");
  check("list w/ stage filter + counts", leadList.status === 200 && Array.isArray(leadList.data?.leads) && typeof leadList.data?.stageCounts?.new === "number");

  /* ── 3. Service catalogue ── */
  console.log("\n[3] Service catalogue");
  const svcCreate = await api(adminToken, "POST", "/api/users/billing/services", { name: "TEST LyfInfinity Annual", category: "lyfinfinity", price: 50000, durationDays: 365, renewable: true });
  check("create service", svcCreate.status === 201 && svcCreate.data?.service?.price === 50000);
  const svcId = svcCreate.data?.service?.id;
  if (svcId) cleanup.services.push(svcId);

  const svcConsult = await api(adminToken, "POST", "/api/users/billing/services", { name: "TEST Consultation", category: "consultation", price: 800 });
  const svcConsultId = svcConsult.data?.service?.id;
  if (svcConsultId) cleanup.services.push(svcConsultId);

  check("bad category → 400", (await api(adminToken, "POST", "/api/users/billing/services", { name: "TEST bad", category: "spa", price: 10 })).status === 400);
  if (nurseToken) check("nurse cannot create service → 403", (await api(nurseToken, "POST", "/api/users/billing/services", { name: "TEST x", category: "other", price: 1 })).status === 403);
  const svcList = await api(adminToken, "GET", "/api/users/billing/services");
  check("list services", svcList.status === 200 && svcList.data.services.some(s => s.id === svcId));

  /* ── 4. Recommendation funnel ── */
  console.log("\n[4] Recommendation funnel");
  const recCreate = await api(adminToken, "POST", "/api/users/recommendations", { patientId: patient._id.toString(), serviceId: svcId, note: "TEST rec" });
  check("create recommendation (stage=recommended, price snapshot)", recCreate.status === 201 && recCreate.data?.recommendation?.stage === "recommended" && recCreate.data?.recommendation?.expectedValue === 50000);
  const recId = recCreate.data?.recommendation?.id;
  if (recId) cleanup.recommendations.push(recId);

  check("duplicate open rec → 409", (await api(adminToken, "POST", "/api/users/recommendations", { patientId: patient._id.toString(), serviceId: svcId })).status === 409);

  const recInterested = await api(adminToken, "PATCH", `/api/users/recommendations/${recId}`, { stage: "interested" });
  check("stage → interested + timestamp", recInterested.status === 200 && !!recInterested.data?.recommendation?.interestedAt);

  /* ── 5. Invoice + payment + auto-wiring ── */
  console.log("\n[5] Invoice → payment → enrollment automation");
  const invCreate = await api(adminToken, "POST", "/api/users/billing/invoices", {
    patientId: patient._id.toString(),
    items: [
      { serviceId: svcId, quantity: 1, discount: 5000 },
      { serviceId: svcConsultId, quantity: 2 }
    ],
    overallDiscount: 600,
    recommendationId: recId
  });
  const inv = invCreate.data?.invoice;
  // subtotal 50000 + 1600 = 51600; discounts 5000 + 600 = 5600; grand 46000
  check("invoice math (subtotal/discount/grand)", invCreate.status === 201 && inv?.subtotal === 51600 && inv?.discountTotal === 5600 && inv?.grandTotal === 46000, JSON.stringify(inv).slice(0, 200));
  check("invoice number format", /^INV-\d{6}$/.test(inv?.invoiceNumber || ""));
  if (inv?.id) cleanup.invoices.push(inv.id);

  const recAfterInv = await api(adminToken, "GET", `/api/users/recommendations?patientId=${patient._id.toString()}&limit=5`);
  const recRow = recAfterInv.data?.recommendations?.find(r => r.id === recId);
  check("invoice link auto-moves rec → booked", recRow?.stage === "booked" && !!recRow?.bookedAt);

  check("overpay rejected", (await api(adminToken, "POST", `/api/users/billing/invoices/${inv.id}/payments`, { amount: 99999, method: "upi" })).status === 400);

  const pay1 = await api(adminToken, "POST", `/api/users/billing/invoices/${inv.id}/payments`, { amount: 20000, method: "upi", reference: "TEST-UTR-1" });
  check("partial payment → partially_paid", pay1.status === 201 && pay1.data?.invoice?.status === "partially_paid" && pay1.data?.invoice?.amountDue === 26000);

  const pay2 = await api(adminToken, "POST", `/api/users/billing/invoices/${inv.id}/payments`, { amount: 26000, method: "cash" });
  check("full payment → paid", pay2.status === 201 && pay2.data?.invoice?.status === "paid");
  check("enrollment auto-created for durationDays service", Array.isArray(pay2.data?.enrollmentsCreated) && pay2.data.enrollmentsCreated.length === 1, JSON.stringify(pay2.data?.enrollmentsCreated));
  cleanup.enrollments.push(...(pay2.data?.enrollmentsCreated || []));

  const recAfterPay = await api(adminToken, "GET", `/api/users/recommendations?patientId=${patient._id.toString()}&limit=5`);
  check("full payment auto-moves rec → paid", recAfterPay.data?.recommendations?.find(r => r.id === recId)?.stage === "paid");

  check("cancel paid invoice → 409", (await api(adminToken, "POST", `/api/users/billing/invoices/${inv.id}/cancel`)).status === 409);

  const revenue = await api(adminToken, "GET", "/api/users/billing/revenue-summary");
  const lyfCat = revenue.data?.byCategory?.find(c => c.category === "lyfinfinity");
  const consultCat = revenue.data?.byCategory?.find(c => c.category === "consultation");
  check("revenue summary loads", revenue.status === 200 && revenue.data?.totalRevenue >= 46000);
  check("category allocation (lyf ~45k, consult ~1.4k of 46k)", !!lyfCat && !!consultCat && Math.abs(lyfCat.total + consultCat.total - (revenue.data?.byCategory?.length >= 2 ? lyfCat.total + consultCat.total : 0)) < 0.01 && lyfCat.total > consultCat.total, JSON.stringify(revenue.data?.byCategory));

  /* ── 6. Enrollments / renewals ── */
  console.log("\n[6] Enrollments");
  const enrollList = await api(adminToken, "GET", `/api/users/enrollments?patientId=${patient._id.toString()}`);
  const enrollment = enrollList.data?.enrollments?.find(e => cleanup.enrollments.includes(e.id));
  check("enrollment listed (active, renewalDueAt set)", !!enrollment && enrollment.status === "active" && !!enrollment.renewalDueAt);

  const renewed = await api(adminToken, "PATCH", `/api/users/enrollments/${enrollment.id}`, { action: "renew" });
  check("renew creates fresh enrollment", renewed.status === 200 && renewed.data?.enrollment?.status === "active" && renewed.data?.enrollment?.id !== enrollment.id);
  if (renewed.data?.enrollment?.id) cleanup.enrollments.push(renewed.data.enrollment.id);

  /* ── 7. Referrals ── */
  console.log("\n[7] Referrals");
  const refCreate = await api(adminToken, "POST", "/api/users/referrals", { patientId: patient._id.toString(), notes: "TEST referral" });
  check("create referral (asked)", refCreate.status === 201 && refCreate.data?.referral?.status === "asked");
  const refId = refCreate.data?.referral?.id;
  if (refId) cleanup.referrals.push(refId);

  const refReferred = await api(adminToken, "PATCH", `/api/users/referrals/${refId}`, { status: "referred", referredName: "TEST Friend", referredPhone: "+91 88888 00001" });
  check("asked → referred + timestamp", refReferred.status === 200 && !!refReferred.data?.referral?.referredAt);

  const refConverted = await api(adminToken, "PATCH", `/api/users/referrals/${refId}`, { convertedPatientId: patient._id.toString() });
  check("→ converted with patient link", refConverted.status === 200 && refConverted.data?.referral?.status === "converted");

  /* ── 8. Google reviews ── */
  console.log("\n[8] Google reviews");
  const reviewCreate = await api(adminToken, "POST", "/api/users/google-reviews", { reviewerName: "TEST Reviewer", rating: 5 });
  check("log review", reviewCreate.status === 201);
  if (reviewCreate.data?.review?.id) cleanup.reviews.push(reviewCreate.data.review.id);
  const reviewList = await api(adminToken, "GET", "/api/users/google-reviews");
  check("review counted this month", reviewList.status === 200 && reviewList.data?.thisMonthCount >= 1);
  check("bad rating → 400", (await api(adminToken, "POST", "/api/users/google-reviews", { rating: 9 })).status === 400);

  /* ── 9. Pre-consultation notes ── */
  console.log("\n[9] Pre-consultation notes");
  const appointment = await Appointment.findOne({ status: { $nin: ["cancelled", "no_show"] } }).lean();
  if (appointment && nurseToken && doctorToken) {
    const apptId = appointment._id.toString();
    const draft = await api(nurseToken, "PUT", `/api/users/appointments/${apptId}/preconsultation`, {
      chiefComplaint: "TEST complaint", vitals: { bloodPressure: "120/80", spo2: "98" }, redFlags: "TEST flag"
    });
    check("nurse saves draft", draft.status === 200 && draft.data?.note?.status === "draft");
    if (draft.data?.note?.id) cleanup.preconsultNotes.push(draft.data.note.id);

    // Doctor tokens can't see drafts — but this appointment's doctor may differ from our token's doctor.
    const doctorForAppt = await User.findById(appointment.doctor).lean();
    const apptDoctorToken = doctorForAppt ? buildAccessToken(doctorForAppt) : doctorToken;

    const doctorDraftView = await api(apptDoctorToken, "GET", `/api/users/appointments/${apptId}/preconsultation`);
    check("doctor cannot see draft", doctorDraftView.status === 200 && doctorDraftView.data?.note === null);

    check("admin PUT rejected (nurse only) → 403", (await api(adminToken, "PUT", `/api/users/appointments/${apptId}/preconsultation`, { chiefComplaint: "x" })).status === 403);

    const submitted = await api(nurseToken, "PUT", `/api/users/appointments/${apptId}/preconsultation`, { submit: true });
    check("nurse submits", submitted.status === 200 && submitted.data?.note?.status === "submitted");

    const doctorView = await api(apptDoctorToken, "GET", `/api/users/appointments/${apptId}/preconsultation`);
    check("doctor sees submitted note w/ vitals", doctorView.data?.note?.vitals?.bloodPressure === "120/80");

    const queue = await api(apptDoctorToken, "GET", "/api/users/doctor/preconsultation-notes");
    check("doctor queue lists submitted note", queue.status === 200 && queue.data?.notes?.some(n => n.appointmentId === apptId));

    const ack = await api(apptDoctorToken, "POST", `/api/users/appointments/${apptId}/preconsultation/acknowledge`);
    check("doctor acknowledges", ack.status === 200);
    check("edit after acknowledge → 409", (await api(nurseToken, "PUT", `/api/users/appointments/${apptId}/preconsultation`, { chiefComplaint: "late edit" })).status === 409);
  } else {
    console.log("  SKIP (no usable appointment/nurse/doctor in DB)");
  }

  /* ── 10. Dashboard tiles + alerts ── */
  console.log("\n[10] Dashboard");
  const dash = await api(adminToken, "GET", "/api/users/admin/dashboard");
  const tm = dash.data?.thisMonth;
  const tileKeys = ["leadsReceived","leadsContacted","appointmentsBooked","appointmentsAttended","lyfRecommended","lyfBooked","lyfRevenue","programmeEnrolments","totalRevenue","followUpsOverdue","renewalsDueThisWeek","googleReviews","referralsGenerated"];
  check("all 13 thisMonth tiles present", dash.status === 200 && tileKeys.every(k => typeof tm?.[k] === "number"), JSON.stringify(tm));
  check("alerts array present", Array.isArray(dash.data?.alerts));
  check("backup alert NOT red (backup ran today)", !dash.data.alerts.some(a => ["backup_failed","backup_stale","backup_not_configured"].includes(a.key)), JSON.stringify(dash.data.alerts.map(a => a.key)));
  check("thisMonth counts our test data (lyfRecommended≥1, revenue≥46k, reviews≥1)", tm.lyfRecommended >= 1 && tm.totalRevenue >= 46000 && tm.googleReviews >= 1);

  /* ── 11. Analytics growth block ── */
  console.log("\n[11] Analytics");
  const analytics = await api(adminToken, "GET", "/api/users/admin/analytics");
  const growth = analytics.data?.growth;
  check("growth block present", analytics.status === 200 && !!growth);
  check("patientSources array", Array.isArray(growth?.patientSources));
  check("newVsReturning percentages", typeof growth?.newVsReturning?.newPercent === "number");
  check("funnel counts our rec (recommended≥1, paid≥1)", growth?.funnel?.recommended >= 1 && growth?.funnel?.paid >= 1, JSON.stringify(growth?.funnel));
  check("lyfFunnel present", growth?.lyfFunnel?.recommended >= 1);
  check("appointmentFunnel + showUpRate", typeof growth?.appointmentFunnel?.showUpRate === "number" && typeof growth?.appointmentFunnel?.rescheduled === "number");
  check("leadStages counts", typeof growth?.leadStages?.new === "number");

  /* ── 12. Intake update path (existing patient, then restored) ── */
  console.log("\n[12] Intake partial update");
  const beforeProfile = await PatientProfile.findOne({ user: patient._id }).lean();
  const intakePatch = await api(adminToken, "PATCH", `/api/users/${patient._id.toString()}`, {
    intake: { city: "TESTCITY", discoverySources: ["google_maps", "friend_family"], consent: { serviceCommunication: true, signatureName: "TEST Sign" } }
  });
  check("admin PATCH intake accepted", intakePatch.status === 200, JSON.stringify(intakePatch.data).slice(0, 150));
  const afterProfile = await PatientProfile.findOne({ user: patient._id }).lean();
  check("intake fields written", afterProfile?.intake?.city === "TESTCITY" && afterProfile?.intake?.discoverySources?.includes("google_maps"));
  check("consent timestamp stamped", !!afterProfile?.intake?.consent?.consentedAt);
  check("untouched intake keys preserved (partial update)", (afterProfile?.intake?.visitReasons || []).length === (beforeProfile?.intake?.visitReasons || []).length);
  // restore original intake
  await PatientProfile.updateOne({ user: patient._id }, { $set: { intake: beforeProfile?.intake || {} } });
  console.log("  (patient intake restored to original)");

  const badIntake = await api(adminToken, "PATCH", `/api/users/${patient._id.toString()}`, { intake: { discoverySources: ["tiktok"] } });
  check("invalid intake enum → 400", badIntake.status === 400);

  /* ── Cleanup ── */
  console.log("\n[cleanup] removing TEST rows…");
  const { Lead } = await import("../src/Models/Lead.js");
  const { ServiceCatalog } = await import("../src/Models/ServiceCatalog.js");
  const { Recommendation } = await import("../src/Models/Recommendation.js");
  const { Invoice } = await import("../src/Models/Invoice.js");
  const { Payment } = await import("../src/Models/Payment.js");
  const { Enrollment } = await import("../src/Models/Enrollment.js");
  const { ReferralRequest } = await import("../src/Models/ReferralRequest.js");
  const { GoogleReview } = await import("../src/Models/GoogleReview.js");
  const { PreConsultationNote } = await import("../src/Models/PreConsultationNote.js");

  const results = await Promise.all([
    Lead.deleteMany({ _id: { $in: cleanup.leads } }),
    ServiceCatalog.deleteMany({ _id: { $in: cleanup.services } }),
    Recommendation.deleteMany({ _id: { $in: cleanup.recommendations } }),
    Invoice.deleteMany({ _id: { $in: cleanup.invoices } }),
    Payment.deleteMany({ invoice: { $in: cleanup.invoices } }),
    Enrollment.deleteMany({ _id: { $in: cleanup.enrollments } }),
    ReferralRequest.deleteMany({ _id: { $in: cleanup.referrals } }),
    GoogleReview.deleteMany({ _id: { $in: cleanup.reviews } }),
    PreConsultationNote.deleteMany({ _id: { $in: cleanup.preconsultNotes } })
  ]);
  console.log("  deleted:", results.map(r => r.deletedCount).join(", "));

  console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
  if (fail) console.log("FAILED:", failures.join(" | "));
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (err) => {
  console.error("TEST CRASHED:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
