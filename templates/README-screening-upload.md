# Screening report upload template

## Files
- `screening-report-TEMPLATE.txt` — best for reliable parsing (upload as `.txt` or save as PDF)
- `screening-report-TEMPLATE.html` — open in a browser, edit, then **Print → Save as PDF**

## What the parser expects
Keep these labels (same spelling):

| Field | Example line |
|-------|----------------|
| Name | `Subject name Jane Doe` |
| Sex | `Sex Female` |
| Age | `Age 34 years` |
| Height / weight | `Height 165 cm` / `Weight 68 kg` |
| Date / time | `Test date 21 November 2026` / `Test time 10:20` |
| Email | `Email jane.doe@example.com` |
| Flag row | `Digestive wellness Yellow` |
| Detail row | `Cholesterol 56.749-67.352 69.959 Yellow` |

Flags must be **Green**, **Yellow**, or **Red**.

Section titles should include words like: `Cardiovascular and circulation`, `Digestive`, `Respiratory and immune`, `Nutrition, vitamin, mineral`, `Bone, skin, energy`, `Reproductive`.

## Current flow (local / no media server yet)
1. Fill the TXT or HTML template.
2. In `/admin` → **Upload analyzer PDF** (also accepts `.txt`).
3. Browser parses the file locally.
4. Structured text (subject, flags, values, raw excerpt) is saved to Firestore on the screening document.
5. Admin reviews → Match content bank → Share with patient.

The original PDF/file is **not** stored in Firebase Storage yet (Spark / media server later). When your media server is ready, we will store the file there and keep only the parsed text + file URL in Firestore.

## Tip
If a real device PDF does not parse well, copy results into this TXT layout and upload that — parsing will be consistent.
