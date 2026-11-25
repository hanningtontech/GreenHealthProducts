"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateToSwahili = exports.createMediaUploadUrl = exports.generateWellnessReply = exports.matchContentBankFn = void 0;
/**
 * Cloud Functions for GreenHealthProducts.
 * - Content-bank keyword match (admin)
 * - Backblaze B2 presigned uploads for images / PDFs
 *
 * B2 object layout (bucket root):
 *   media/profiles/{uid}/avatar.jpg
 *   media/products/{productId}/thumbnail.{ext}
 *   media/products/{productId}/gallery/{slot}.{ext}
 *   media/screenings/{screeningId}/source/{stamp}_{filename}
 *   media/screenings/{screeningId}/reports/patient-report.pdf
 *
 * Set B2_* in functions/.env (see .env.example) before deploy.
 */
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const b2_1 = require("./b2");
const generateWellnessReply_1 = require("./generateWellnessReply");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const ALLOWED_PURPOSES = new Set(["profile", "product", "screening", "report"]);
async function assertSignedIn(uid) {
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Sign in required");
}
async function assertAdmin(uid) {
    await assertSignedIn(uid);
    const snap = await db.doc(`admins/${uid}`).get();
    if (!snap.exists)
        throw new https_1.HttpsError("permission-denied", "Admin only");
}
function safeSegment(value) {
    return String(value || "")
        .replace(/[^a-zA-Z0-9._\-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^[._\-]+|[._\-]+$/g, "")
        .slice(0, 120) || "file";
}
function extensionFor(fileName, contentType, fallback) {
    const fromName = (fileName.match(/\.([a-zA-Z0-9]{1,8})$/) || [])[1];
    if (fromName)
        return fromName.toLowerCase();
    const map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "application/pdf": "pdf",
        "text/plain": "txt",
        "text/markdown": "md",
        "text/csv": "csv",
    };
    return map[contentType.toLowerCase()] || fallback;
}
/**
 * Systematic B2 keys so the bucket stays browsable and URLs stay predictable.
 */
function resolveUploadKey(uid, isAdmin, purpose, fileName, contentType, productId, screeningId, productRole, slot) {
    const stamp = Date.now();
    const name = safeSegment(fileName || "file.bin");
    switch (purpose) {
        case "profile": {
            // Stable key — overwrites previous avatar; public URL uses ?v= for cache bust.
            return `media/profiles/${safeSegment(uid)}/avatar.jpg`;
        }
        case "product": {
            if (!isAdmin)
                throw new https_1.HttpsError("permission-denied", "Admin only for product images");
            const ext = extensionFor(fileName, contentType, "jpg");
            const pid = safeSegment(productId || "product");
            const role = String(productRole || "primary").toLowerCase();
            if (role === "thumbnail") {
                return `media/products/${pid}/thumbnail.${ext}`;
            }
            const gallerySlot = safeSegment(slot || name.replace(/\.[^.]+$/, "") || `g${stamp}`);
            return `media/products/${pid}/gallery/${gallerySlot}.${ext}`;
        }
        case "screening": {
            if (!isAdmin)
                throw new https_1.HttpsError("permission-denied", "Admin only for screening source files");
            const sid = safeSegment(screeningId || `screening-${stamp}`);
            return `media/screenings/${sid}/source/${stamp}_${name}`;
        }
        case "report": {
            if (!isAdmin)
                throw new https_1.HttpsError("permission-denied", "Admin only for patient report PDFs");
            const sid = safeSegment(screeningId || `screening-${stamp}`);
            return `media/screenings/${sid}/reports/patient-report.pdf`;
        }
        default:
            throw new https_1.HttpsError("invalid-argument", "Unknown upload purpose");
    }
}
exports.matchContentBankFn = (0, https_1.onCall)(async (request) => {
    await assertAdmin(request.auth?.uid);
    const text = String(request.data?.text || "").toLowerCase();
    if (!text)
        throw new https_1.HttpsError("invalid-argument", "text required");
    const snap = await db.collection("knowledgeBank").get();
    const matches = snap.docs
        .map((docSnap) => {
        const data = docSnap.data();
        if (data.active === false)
            return null;
        if (data.reviewStatus === "quarantined" || data.reviewStatus === "needs_review")
            return null;
        if (data.qualityFlag === "red")
            return null;
        const approved = data.reviewStatus === "approved" || data.qualityFlag === "green" || !data.reviewStatus;
        if (!approved && data.qualityFlag === "yellow")
            return null;
        const triggers = [
            ...(data.triggersEn || []),
            ...(data.triggersSw || []),
            ...(data.keywords || []),
            ...(data.diseases || []),
        ];
        let score = 0;
        for (const t of triggers) {
            const key = String(t).toLowerCase();
            if (key && text.includes(key))
                score += 2;
        }
        return { id: docSnap.id, score, title: data.conditionTitle || data.title || docSnap.id };
    })
        .filter((row) => Boolean(row && row.score >= 4))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
    return { ok: true, mode: "keyword-bank", matches };
});
/**
 * Admin-only Gemini wellness reply + teachable keywords (bank fallback).
 * Set GEMINI_API_KEY in functions/.env (Google AI Studio free tier) and redeploy functions.
 * Patients never call this; bank answers first in the client orchestrator.
 */
exports.generateWellnessReply = (0, https_1.onCall)({ cors: true, maxInstances: 10, timeoutSeconds: 60 }, async (request) => {
    await assertAdmin(request.auth?.uid);
    const input = (0, generateWellnessReply_1.assertGenerateInput)(request.data);
    const result = await (0, generateWellnessReply_1.generateWellnessReplyCore)(input);
    console.info("generateWellnessReply", {
        source: result.source,
        urgency: result.urgency,
        hasProduct: Boolean(result.productCode),
        needsAdminReview: result.needsAdminReview,
        language: result.language,
        refCount: input.references.length,
    });
    return { ok: true, ...result };
});
/** Presign a Backblaze B2 PUT. Client uploads directly; returns public HTTPS URL. */
exports.createMediaUploadUrl = (0, https_1.onCall)({ cors: true }, async (request) => {
    const uid = request.auth?.uid;
    await assertSignedIn(uid);
    const cfg = (0, b2_1.readB2Config)();
    if (!cfg) {
        throw new https_1.HttpsError("failed-precondition", "Backblaze B2 is not configured. Set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, B2_ENDPOINT, and B2_PUBLIC_BASE_URL on Cloud Functions.");
    }
    const purpose = String(request.data?.purpose || "");
    if (!ALLOWED_PURPOSES.has(purpose)) {
        throw new https_1.HttpsError("invalid-argument", "purpose must be profile | product | screening | report");
    }
    const fileName = String(request.data?.fileName || "file.bin");
    const contentType = String(request.data?.contentType || "application/octet-stream");
    const productId = request.data?.productId ? String(request.data.productId) : undefined;
    const screeningId = request.data?.screeningId ? String(request.data.screeningId) : undefined;
    const productRole = request.data?.productRole ? String(request.data.productRole) : undefined;
    const slot = request.data?.slot ? String(request.data.slot) : undefined;
    const adminSnap = await db.doc(`admins/${uid}`).get();
    const isAdmin = adminSnap.exists;
    const key = resolveUploadKey(uid, isAdmin, purpose, fileName, contentType, productId, screeningId, productRole, slot);
    const version = Date.now();
    try {
        const result = await (0, b2_1.createPresignedPut)(key, contentType, 900);
        const basePublic = result.publicUrl || (0, b2_1.publicUrlForKey)(key, cfg);
        // Cache-bust so browsers pick up overwritten avatar/product/report files.
        const publicUrl = `${basePublic}${basePublic.includes("?") ? "&" : "?"}v=${version}`;
        return {
            ok: true,
            uploadUrl: result.uploadUrl,
            publicUrl,
            key: result.key,
            contentType,
            purpose,
            version,
        };
    }
    catch (err) {
        throw new https_1.HttpsError("internal", err instanceof Error ? err.message : "Could not create upload URL");
    }
});
/**
 * Translate English wellness copy → Kiswahili for bank replies / report summaries.
 * Uses google-translate-api-x server-side (avoids browser CORS limits).
 */
exports.translateToSwahili = (0, https_1.onCall)({ cors: true, maxInstances: 10 }, async (request) => {
    await assertSignedIn(request.auth?.uid);
    const text = String(request.data?.text || "").trim();
    if (!text)
        throw new https_1.HttpsError("invalid-argument", "text is required");
    if (text.length > 12000)
        throw new https_1.HttpsError("invalid-argument", "text is too long (max 12000)");
    try {
        const { translate } = await Promise.resolve().then(() => __importStar(require("google-translate-api-x")));
        const chunks = [];
        let rest = text;
        const size = 4500;
        while (rest.length) {
            if (rest.length <= size) {
                chunks.push(rest);
                break;
            }
            let cut = rest.lastIndexOf("\n\n", size);
            if (cut < size * 0.4)
                cut = rest.lastIndexOf("\n", size);
            if (cut < size * 0.4)
                cut = rest.lastIndexOf(" ", size);
            if (cut < size * 0.4)
                cut = size;
            chunks.push(rest.slice(0, cut).trim());
            rest = rest.slice(cut).trim();
        }
        const parts = [];
        for (const chunk of chunks.filter(Boolean)) {
            const res = await translate(chunk, {
                from: "en",
                to: "sw",
                forceBatch: true,
            });
            const translated = Array.isArray(res) ? res.map((r) => r.text).join("\n") : res.text;
            parts.push(String(translated || "").trim());
        }
        const out = parts.filter(Boolean).join("\n\n");
        if (!out)
            throw new Error("Empty translation");
        return { ok: true, text: out, from: "en", to: "sw" };
    }
    catch (err) {
        throw new https_1.HttpsError("internal", err instanceof Error ? err.message : "Translation failed");
    }
});
//# sourceMappingURL=index.js.map