# Content bank hygiene review (pre-clean)

Generated for GreenHealth bank approval / matching fixes. **Curated edits are preserved** — this list is for admin review before any cleanup of polluted keywords or duplicated reply text.

## How to refresh

1. Open Admin → Content bank.
2. Click **Hygiene review** to download a JSON report from the live local/Firestore bank.
3. Or run: `pnpm test -- client/src/lib/__tests__/bankApprovalMatching.test.ts`

## Suspected approval-added keywords

Old Green · approve flows appended words from the test question into `keywords` / triggers. These standalone tokens are especially risky:

| Token | Why review |
| --- | --- |
| `blood`, `high`, `home`, `keeps`, `running` | Can make a diabetes entry match blood-pressure questions |
| Other short generics (`pain`, `bad`, `feel`, …) | Broad false positives across EN/SW |

**Action:** keep curated phrases (`blood sugar`, `blood pressure`, `light sensitivity`, …). Remove standalone generics from `keywords` only after confirming they were not intentional.

## Duplicated reply text

Look for entries where:

- `replyConcerns` starts with the same text as `replyOpening`
- `replyConcerns` ends with the same text as `replyClosing`
- `replyOpening === replyClosing`

**Action:** keep a single opening, body, product intro, and closing. Approvals must not re-stitch the full assembled answer into one field.

## Product codes needing catalog resolve

Unresolved codes should be omitted from patient replies and flagged in bank testing. Confirm each recommendation code exists in the GreenHealth catalog (e.g. W38 → Super Co-Q10 Capsule, W68 → Vitamin B9 Capsule).

## Urgent combinations (do not treat as routine product matches)

- Sudden severe headache + slurred speech / trouble speaking
- Very high blood pressure + chest pain
- Pregnancy + severe headache + vision changes
- Inability to swallow saliva

These show immediate action first and suppress product cards.
