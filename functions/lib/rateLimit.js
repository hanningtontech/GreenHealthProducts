"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATE_PRESETS = void 0;
exports.assertRateLimit = assertRateLimit;
exports.rateLimitIdentity = rateLimitIdentity;
/**
 * Lightweight Firestore sliding-window rate limits for callables.
 * Keeps free-tier Gemini / translate / upload spend under control.
 */
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
function safeKey(raw) {
    return String(raw || "anon")
        .replace(/[^a-zA-Z0-9._\-:/]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 180) || "anon";
}
/**
 * Atomically consume one token. Throws `resource-exhausted` when over limit.
 */
async function assertRateLimit(db, spec) {
    const key = safeKey(spec.key);
    const ref = db.collection("rateLimits").doc(key);
    const now = Date.now();
    const windowMs = Math.max(5000, spec.windowMs);
    const limit = Math.max(1, spec.limit);
    const label = spec.label || "requests";
    try {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.exists ? snap.data() || {} : {};
            let windowStart = Number(data.windowStart || 0);
            let count = Number(data.count || 0);
            if (!windowStart || now - windowStart >= windowMs) {
                windowStart = now;
                count = 0;
            }
            if (count >= limit) {
                const retrySec = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
                throw new https_1.HttpsError("resource-exhausted", `Too many ${label}. Try again in about ${retrySec}s.`);
            }
            tx.set(ref, {
                count: count + 1,
                windowStart,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                limit,
                windowMs,
            }, { merge: true });
        });
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        console.warn("rateLimit transaction failed", err instanceof Error ? err.message : err);
        // Fail closed for AI-sensitive buckets so a Firestore blip cannot open the floodgates.
        if (/^ai:/i.test(key)) {
            throw new https_1.HttpsError("resource-exhausted", `Too many ${label}. Try again shortly.`);
        }
    }
}
/** Caller identity for rate buckets: uid preferred, else coarse IP. */
function rateLimitIdentity(uid, rawRequest) {
    if (uid)
        return `uid:${uid}`;
    const forwarded = rawRequest?.headers?.["x-forwarded-for"];
    const fromHeader = Array.isArray(forwarded)
        ? String(forwarded[0] || "")
        : String(forwarded || "");
    const ip = (fromHeader.split(",")[0] || rawRequest?.ip || "anon").trim();
    return `ip:${ip.slice(0, 64) || "anon"}`;
}
/** Presets tuned for free-tier Gemini + modest hosting costs. */
exports.RATE_PRESETS = {
    /** Project-wide Gemini calls (all users). */
    aiGlobal: { limit: 40, windowMs: 60 * 60 * 1000, label: "AI assists" },
    /** Per user/IP store-search AI. */
    aiAssistUser: { limit: 6, windowMs: 60 * 60 * 1000, label: "AI store searches" },
    /** Admin Gemini teach/fallback. */
    aiAdminUser: { limit: 20, windowMs: 60 * 60 * 1000, label: "admin AI drafts" },
    /** Diamond confirm personalization. */
    aiDiamondUser: { limit: 12, windowMs: 60 * 60 * 1000, label: "auto replies" },
    /** General callable volume per identity. */
    callableUser: { limit: 90, windowMs: 60 * 60 * 1000, label: "server requests" },
    /** Media upload URL minting. */
    uploadUser: { limit: 30, windowMs: 60 * 60 * 1000, label: "uploads" },
    /** Translation callable. */
    translateUser: { limit: 25, windowMs: 60 * 60 * 1000, label: "translations" },
    /** Content-bank match callable. */
    matchBankUser: { limit: 40, windowMs: 60 * 60 * 1000, label: "bank matches" },
};
//# sourceMappingURL=rateLimit.js.map