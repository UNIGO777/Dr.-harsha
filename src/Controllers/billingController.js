import mongoose from "mongoose";
import { ServiceCatalog, SERVICE_CATEGORY_ENUM } from "../Models/ServiceCatalog.js";
import { Invoice, INVOICE_STATUS_ENUM } from "../Models/Invoice.js";
import { Payment, PAYMENT_METHOD_ENUM } from "../Models/Payment.js";
import { Enrollment } from "../Models/Enrollment.js";
import { Recommendation } from "../Models/Recommendation.js";
import { User } from "../Models/User.js";

function normalizeString(value, maxLength = 500) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, maxLength);
}

function toMoney(value) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

function buildServiceResponse(service) {
  return {
    id: service._id.toString(),
    name: service.name,
    category: service.category,
    price: service.price,
    description: service.description || "",
    durationDays: service.durationDays ?? null,
    renewable: Boolean(service.renewable),
    active: Boolean(service.active),
    createdAt: service.createdAt
  };
}

function buildInvoiceResponse(invoice) {
  return {
    id: invoice._id.toString(),
    invoiceNumber: invoice.invoiceNumber,
    patient: invoice.patient?._id
      ? {
          id: invoice.patient._id.toString(),
          name: invoice.patient.name || "",
          userNumber: invoice.patient.userNumber ?? null,
          phone: invoice.patient.phone || ""
        }
      : null,
    items: (invoice.items || []).map((item) => ({
      id: item._id?.toString?.() || "",
      serviceId: item.service ? item.service.toString() : null,
      label: item.label,
      category: item.category,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      lineTotal: item.lineTotal
    })),
    subtotal: invoice.subtotal,
    discountTotal: invoice.discountTotal,
    overallDiscount: invoice.overallDiscount,
    grandTotal: invoice.grandTotal,
    amountPaid: invoice.amountPaid,
    amountDue: Math.max(0, Math.round((invoice.grandTotal - invoice.amountPaid) * 100) / 100),
    status: invoice.status,
    notes: invoice.notes || "",
    createdAt: invoice.createdAt
  };
}

/* ── Service catalogue ─────────────────────────────────────────────── */

export async function listServicesController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const includeInactive = req?.query?.includeInactive === "true";
    const query = includeInactive ? {} : { active: true };
    const services = await ServiceCatalog.find(query).sort({ category: 1, name: 1 }).lean();
    return res.json({ services: services.map(buildServiceResponse) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list services" });
  }
}

export async function createServiceController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const name = normalizeString(req?.body?.name, 200);
    const category = normalizeString(req?.body?.category, 50);
    const price = toMoney(req?.body?.price);
    if (!name) return res.status(400).json({ error: "name is required" });
    if (!SERVICE_CATEGORY_ENUM.includes(category)) return res.status(400).json({ error: "Invalid category" });
    if (price === null || price < 0) return res.status(400).json({ error: "price must be a non-negative number" });

    const durationDaysRaw = req?.body?.durationDays;
    let durationDays = null;
    if (durationDaysRaw !== undefined && durationDaysRaw !== null && durationDaysRaw !== "") {
      durationDays = parseInt(durationDaysRaw, 10);
      if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
        return res.status(400).json({ error: "durationDays must be between 1 and 3650" });
      }
    }

    const service = await ServiceCatalog.create({
      name,
      category,
      price,
      description: normalizeString(req?.body?.description),
      durationDays,
      renewable: Boolean(req?.body?.renewable),
      active: req?.body?.active === undefined ? true : Boolean(req.body.active),
      createdBy: req?.user?._id || null
    });

    return res.status(201).json({ message: "Service created.", service: buildServiceResponse(service.toObject()) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create service" });
  }
}

export async function updateServiceController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const serviceId = normalizeString(req?.params?.serviceId, 50);
    if (!mongoose.isValidObjectId(serviceId)) return res.status(400).json({ error: "Invalid serviceId" });

    const service = await ServiceCatalog.findById(serviceId);
    if (!service) return res.status(404).json({ error: "Service not found" });

    const body = req?.body || {};
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

    if (has("name")) {
      const name = normalizeString(body.name, 200);
      if (!name) return res.status(400).json({ error: "name cannot be empty" });
      service.name = name;
    }
    if (has("category")) {
      const category = normalizeString(body.category, 50);
      if (!SERVICE_CATEGORY_ENUM.includes(category)) return res.status(400).json({ error: "Invalid category" });
      service.category = category;
    }
    if (has("price")) {
      const price = toMoney(body.price);
      if (price === null || price < 0) return res.status(400).json({ error: "price must be a non-negative number" });
      service.price = price;
    }
    if (has("description")) service.description = normalizeString(body.description);
    if (has("durationDays")) {
      if (body.durationDays === null || body.durationDays === "") {
        service.durationDays = null;
      } else {
        const durationDays = parseInt(body.durationDays, 10);
        if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
          return res.status(400).json({ error: "durationDays must be between 1 and 3650" });
        }
        service.durationDays = durationDays;
      }
    }
    if (has("renewable")) service.renewable = Boolean(body.renewable);
    if (has("active")) service.active = Boolean(body.active);

    await service.save();
    return res.json({ message: "Service updated.", service: buildServiceResponse(service.toObject()) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update service" });
  }
}

/* ── Invoices ──────────────────────────────────────────────────────── */

export async function listInvoicesController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const status = normalizeString(req?.query?.status, 50);
    const patientId = normalizeString(req?.query?.patientId, 50);
    const search = normalizeString(req?.query?.search, 100);
    const page = Math.max(1, parseInt(req?.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req?.query?.limit, 10) || 25));

    const query = {};
    if (status && INVOICE_STATUS_ENUM.includes(status)) query.status = status;
    if (mongoose.isValidObjectId(patientId)) query.patient = patientId;
    if (search) query.invoiceNumber = { $regex: search, $options: "i" };

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate("patient", "name userNumber phone")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Invoice.countDocuments(query)
    ]);

    return res.json({ invoices: invoices.map(buildInvoiceResponse), total, page, limit });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to list invoices" });
  }
}

export async function createInvoiceController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const patientId = normalizeString(req?.body?.patientId, 50);
    if (!mongoose.isValidObjectId(patientId)) return res.status(400).json({ error: "patientId is required" });

    const patient = await User.findOne({ _id: patientId, role: "patient" }).select("name userNumber phone").lean();
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    const rawItems = Array.isArray(req?.body?.items) ? req.body.items : [];
    if (rawItems.length === 0) return res.status(400).json({ error: "At least one invoice item is required" });

    const serviceIds = rawItems
      .map((item) => item?.serviceId)
      .filter((id) => mongoose.isValidObjectId(id));
    const services = serviceIds.length
      ? await ServiceCatalog.find({ _id: { $in: serviceIds } }).lean()
      : [];
    const serviceMap = new Map(services.map((service) => [service._id.toString(), service]));

    const items = [];
    for (const raw of rawItems) {
      const service = mongoose.isValidObjectId(raw?.serviceId) ? serviceMap.get(raw.serviceId) : null;
      const label = normalizeString(raw?.label, 200) || service?.name || "";
      const category = normalizeString(raw?.category, 50) || service?.category || "";
      const quantity = Math.max(1, parseInt(raw?.quantity, 10) || 1);
      const unitPrice = toMoney(raw?.unitPrice ?? service?.price);
      const discount = toMoney(raw?.discount) ?? 0;

      if (!label) return res.status(400).json({ error: "Each item needs a label or a valid serviceId" });
      if (!SERVICE_CATEGORY_ENUM.includes(category)) {
        return res.status(400).json({ error: `Invalid category for item "${label}"` });
      }
      if (unitPrice === null || unitPrice < 0) {
        return res.status(400).json({ error: `Invalid unitPrice for item "${label}"` });
      }
      if (discount < 0) return res.status(400).json({ error: `Invalid discount for item "${label}"` });

      const gross = Math.round(quantity * unitPrice * 100) / 100;
      if (discount > gross) {
        return res.status(400).json({ error: `Discount exceeds line amount for item "${label}"` });
      }

      items.push({
        service: service?._id || null,
        label,
        category,
        quantity,
        unitPrice,
        discount,
        lineTotal: Math.round((gross - discount) * 100) / 100
      });
    }

    const subtotal = Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100) / 100;
    const lineDiscounts = Math.round(items.reduce((sum, item) => sum + item.discount, 0) * 100) / 100;
    const overallDiscount = toMoney(req?.body?.overallDiscount) ?? 0;
    if (overallDiscount < 0) return res.status(400).json({ error: "overallDiscount cannot be negative" });

    const grandTotal = Math.round((subtotal - lineDiscounts - overallDiscount) * 100) / 100;
    if (grandTotal < 0) return res.status(400).json({ error: "Discounts exceed the invoice amount" });

    const invoice = await Invoice.create({
      patient: patient._id,
      items,
      subtotal,
      discountTotal: Math.round((lineDiscounts + overallDiscount) * 100) / 100,
      overallDiscount,
      grandTotal,
      status: grandTotal === 0 ? "paid" : "unpaid",
      notes: normalizeString(req?.body?.notes),
      createdBy: req?.user?._id || null
    });

    // Optional funnel link: invoicing a recommendation moves it to "booked"
    const recommendationId = normalizeString(req?.body?.recommendationId, 50);
    if (mongoose.isValidObjectId(recommendationId)) {
      const now = new Date();
      await Recommendation.findOneAndUpdate(
        { _id: recommendationId, stage: { $in: ["recommended", "interested"] } },
        {
          $set: { stage: "booked", bookedAt: now, invoice: invoice._id },
          $push: { stageHistory: { stage: "booked", at: now, by: req?.user?._id || null, note: `Invoice ${invoice.invoiceNumber}` } }
        }
      );
      await Recommendation.updateOne(
        { _id: recommendationId, invoice: null },
        { $set: { invoice: invoice._id } }
      );
    }

    return res.status(201).json({
      message: `Invoice ${invoice.invoiceNumber} created.`,
      invoice: buildInvoiceResponse({ ...invoice.toObject(), patient })
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create invoice" });
  }
}

export async function cancelInvoiceController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const invoiceId = normalizeString(req?.params?.invoiceId, 50);
    if (!mongoose.isValidObjectId(invoiceId)) return res.status(400).json({ error: "Invalid invoiceId" });

    const invoice = await Invoice.findById(invoiceId).populate("patient", "name userNumber phone");
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.status === "cancelled") return res.status(409).json({ error: "Invoice is already cancelled" });
    if (invoice.amountPaid > 0) {
      return res.status(409).json({ error: "Cannot cancel an invoice that has payments recorded" });
    }

    invoice.status = "cancelled";
    invoice.cancelledAt = new Date();
    invoice.cancelledBy = req?.user?._id || null;
    await invoice.save();

    return res.json({ message: `Invoice ${invoice.invoiceNumber} cancelled.`, invoice: buildInvoiceResponse(invoice.toObject()) });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to cancel invoice" });
  }
}

/* ── Payments ──────────────────────────────────────────────────────── */

/** Split a payment across the invoice's item categories, proportionally. */
function buildAllocations(invoice, amount) {
  const totals = new Map();
  for (const item of invoice.items) {
    totals.set(item.category, (totals.get(item.category) || 0) + item.lineTotal);
  }
  const base = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  if (base <= 0) return [{ category: invoice.items[0]?.category || "other", amount }];

  const allocations = [];
  let allocated = 0;
  const entries = Array.from(totals.entries());
  entries.forEach(([category, lineTotal], index) => {
    const share =
      index === entries.length - 1
        ? Math.round((amount - allocated) * 100) / 100 // last line absorbs rounding
        : Math.round(((lineTotal / base) * amount) * 100) / 100;
    allocated = Math.round((allocated + share) * 100) / 100;
    if (share > 0) allocations.push({ category, amount: share });
  });
  return allocations;
}

export async function recordPaymentController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const invoiceId = normalizeString(req?.params?.invoiceId, 50);
    if (!mongoose.isValidObjectId(invoiceId)) return res.status(400).json({ error: "Invalid invoiceId" });

    const invoice = await Invoice.findById(invoiceId).populate("patient", "name userNumber phone");
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.status === "cancelled") return res.status(409).json({ error: "Invoice is cancelled" });

    const amount = toMoney(req?.body?.amount);
    const method = normalizeString(req?.body?.method, 50);
    if (amount === null || amount <= 0) return res.status(400).json({ error: "amount must be greater than 0" });
    if (!PAYMENT_METHOD_ENUM.includes(method)) return res.status(400).json({ error: "Invalid payment method" });

    const due = Math.round((invoice.grandTotal - invoice.amountPaid) * 100) / 100;
    if (amount > due) return res.status(400).json({ error: `Amount exceeds due balance of ${due}` });

    const paidAt = req?.body?.paidAt ? new Date(req.body.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) return res.status(400).json({ error: "Invalid paidAt date" });

    const payment = await Payment.create({
      invoice: invoice._id,
      patient: invoice.patient._id,
      amount,
      method,
      reference: normalizeString(req?.body?.reference, 200),
      paidAt,
      allocations: buildAllocations(invoice, amount),
      notes: normalizeString(req?.body?.notes),
      recordedBy: req?.user?._id || null
    });

    invoice.amountPaid = Math.round((invoice.amountPaid + amount) * 100) / 100;
    invoice.status = invoice.amountPaid >= invoice.grandTotal ? "paid" : "partially_paid";
    await invoice.save();

    const enrollmentsCreated = [];
    if (invoice.status === "paid") {
      // Funnel: fully paid invoice moves its linked recommendations to "paid"
      await Recommendation.updateMany(
        { invoice: invoice._id, stage: { $in: ["recommended", "interested", "booked"] } },
        {
          $set: { stage: "paid", paidAt },
          $push: { stageHistory: { stage: "paid", at: paidAt, by: req?.user?._id || null } }
        }
      );

      // Auto-enrol: paid items whose service has a duration become enrollments
      // (this is what powers "renewals due" and programme follow-up alerts)
      const serviceIds = invoice.items.map((item) => item.service).filter(Boolean);
      if (serviceIds.length) {
        const services = await ServiceCatalog.find({ _id: { $in: serviceIds }, durationDays: { $gt: 0 } }).lean();
        for (const service of services) {
          const existing = await Enrollment.findOne({
            patient: invoice.patient._id,
            service: service._id,
            invoice: invoice._id
          }).lean();
          if (existing) continue;

          const endAt = new Date(paidAt.getTime() + service.durationDays * 24 * 60 * 60 * 1000);
          const enrollment = await Enrollment.create({
            patient: invoice.patient._id,
            service: service._id,
            category: service.category,
            startAt: paidAt,
            endAt,
            renewalDueAt: service.renewable ? endAt : null,
            status: "active",
            invoice: invoice._id,
            createdBy: req?.user?._id || null
          });
          enrollmentsCreated.push(enrollment._id.toString());

          await Recommendation.updateOne(
            { invoice: invoice._id, service: service._id, enrollment: null },
            { $set: { enrollment: enrollment._id } }
          );
        }
      }
    }

    return res.status(201).json({
      message: `Payment of ${amount} recorded. Invoice is now ${invoice.status.replace("_", " ")}.`,
      payment: {
        id: payment._id.toString(),
        amount: payment.amount,
        method: payment.method,
        paidAt: payment.paidAt
      },
      invoice: buildInvoiceResponse(invoice.toObject()),
      enrollmentsCreated
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to record payment" });
  }
}

/* ── Revenue summary ───────────────────────────────────────────────── */

export async function revenueSummaryController(req, res) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = req?.query?.from ? new Date(req.query.from) : defaultFrom;
    const to = req?.query?.to ? new Date(req.query.to) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ error: "Invalid from/to date" });
    }

    const paidWindow = { paidAt: { $gte: from, $lte: to } };

    const [totalRow, byCategoryRaw, byMethodRaw, invoiceStatusRaw, outstandingRow] = await Promise.all([
      Payment.aggregate([{ $match: paidWindow }, { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }]),
      Payment.aggregate([
        { $match: paidWindow },
        { $unwind: "$allocations" },
        { $group: { _id: "$allocations.category", total: { $sum: "$allocations.amount" } } },
        { $sort: { total: -1 } }
      ]),
      Payment.aggregate([
        { $match: paidWindow },
        { $group: { _id: "$method", total: { $sum: "$amount" }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]),
      Invoice.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$grandTotal" } } }
      ]),
      Invoice.aggregate([
        { $match: { status: { $in: ["unpaid", "partially_paid"] } } },
        { $group: { _id: null, outstanding: { $sum: { $subtract: ["$grandTotal", "$amountPaid"] } }, count: { $sum: 1 } } }
      ])
    ]);

    return res.json({
      window: { from, to },
      totalRevenue: totalRow[0]?.total || 0,
      paymentCount: totalRow[0]?.count || 0,
      byCategory: byCategoryRaw.map((row) => ({ category: row._id, total: Math.round(row.total * 100) / 100 })),
      byMethod: byMethodRaw.map((row) => ({ method: row._id, total: Math.round(row.total * 100) / 100, count: row.count })),
      invoicesByStatus: invoiceStatusRaw.map((row) => ({ status: row._id, count: row.count, total: Math.round(row.total * 100) / 100 })),
      outstanding: {
        amount: Math.round((outstandingRow[0]?.outstanding || 0) * 100) / 100,
        invoiceCount: outstandingRow[0]?.count || 0
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to build revenue summary" });
  }
}
