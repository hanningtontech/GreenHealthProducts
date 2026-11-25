import type { ScreeningFlag, ScreeningGroup, ScreeningItem, ScreeningSubject } from "./screeningTypes";

function flagFromToken(token: string): ScreeningFlag {
  const t = token.toLowerCase();
  if (
    t.includes("yellow")
    || t.includes("attention")
    || t.includes("needs attention")
    || t.includes("imbalance")
    || t.includes("outside")
    || t.includes("borderline")
  ) {
    return "yellow";
  }
  if (t.includes("red") || t.includes("urgent") || t.includes("critical")) return "red";
  if (
    t.includes("green")
    || t.includes("within")
    || t.includes("normal")
    || t.includes("mostly within")
    || t.includes("generally within")
  ) {
    return "green";
  }
  return "unknown";
}

function pick(regex: RegExp, text: string): string | undefined {
  const match = text.match(regex);
  return match?.[1]?.trim().replace(/^[:\-–—]\s*/, "");
}

function field(label: string, text: string): string | undefined {
  // Supports "Name: Person Y" and "Subject name Jane Doe"
  return pick(new RegExp(`${label}\\s*[:\\-–—]?\\s*([^\\n]+)`, "i"), text);
}

function mapGroupId(title: string): string {
  const t = title.toLowerCase();
  if (/cardio|circulation|cholesterol/.test(t)) return "circulation";
  if (/digest|gastric|intestin|liver|urinary/.test(t)) return "digestive";
  if (/respir|immune|lung/.test(t)) return "respiratory";
  if (/nutrition|vitamin|mineral|iron|magnesium|antioxidant/.test(t)) return "nutrition";
  if (/bone|joint|energy|sleep|fatigue|stress|skin/.test(t)) return "general";
  if (/reproduct|gender/.test(t)) return "reproductive";
  return "general";
}

function groupTitle(id: string): string {
  const titles: Record<string, string> = {
    circulation: "Cardiovascular and circulation",
    digestive: "Digestive, liver, and urinary",
    respiratory: "Respiratory and immune",
    nutrition: "Nutrition, vitamin, mineral",
    general: "Bone, skin, energy, and general wellness",
    reproductive: "Reproductive profile",
  };
  return titles[id] || id;
}

/** Extract plain text subject + flagged rows from analyzer-style / Person Y narrative reports. */
export function parseScreeningText(raw: string): {
  subject: ScreeningSubject;
  groups: ScreeningGroup[];
  rawTextExcerpt: string;
  simpleConclusionHint?: string;
  recommendationsHint?: string;
} {
  const text = raw.replace(/\r/g, "\n");

  const name =
    field("Subject name", text)
    || field("Name", text)
    || pick(/Subject:\s*([^\n—\-]+)/i, text)
    || pick(/\bPerson\s+([A-Za-z0-9][^\n,]*)/i, text)
    || "Unknown";

  const subject: ScreeningSubject = {
    name: name.replace(/\s+PROFILE$/i, "").trim(),
    sex: pick(/\bSex\s*[:\-]?\s*(Female|Male|Other)\b/i, text),
    age: pick(/\bAge\s*[:\-]?\s*(\d+)\s*years?/i, text) || pick(/\bAge\s*[:\-]?\s*(\d+)/i, text),
    height: pick(/\bHeight\s*[:\-]?\s*([\d.]+\s*cm)/i, text),
    weight: pick(/\bWeight\s*[:\-]?\s*([\d.]+\s*kg)/i, text),
    testDate:
      field("Test date", text)
      || field("Report date", text),
    testTime:
      field("Test time", text)
      || field("Report time", text),
    email: pick(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/, text),
    phone: pick(/\bPhone\s*[:\-]?\s*([+\d][\d\s\-]+)/i, text),
  };

  const bucket = new Map<string, ScreeningItem[]>();
  for (const id of ["circulation", "digestive", "respiratory", "nutrition", "general", "reproductive"]) {
    bucket.set(id, []);
  }

  // Person Y blocks: "Profile group: … Result: … Flagged item(s): … Illustrative value(s): …"
  const profileBlock = /Profile group:\s*([^\n]+)\nResult:\s*([^\n]+)\nFlagged items?:\s*([^\n]+)(?:\nIllustrative values?:\s*([^\n]+))?/gi;
  let block: RegExpExecArray | null;
  while ((block = profileBlock.exec(text))) {
    const title = block[1].trim();
    const result = block[2].trim();
    const flagged = block[3].trim();
    const values = (block[4] || "").split(/,|and/i).map((v) => v.trim()).filter(Boolean);
    const names = flagged.split(/,|and/i).map((v) => v.trim()).filter(Boolean);
    const id = mapGroupId(title);
    const flag = flagFromToken(result);
    if (!names.length) {
      bucket.get(id)?.push({
        name: title,
        flag,
        followUp: result,
      });
    } else {
      names.forEach((itemName, index) => {
        bucket.get(id)?.push({
          name: itemName,
          value: values[index] || values[0],
          flag,
          followUp: result,
        });
      });
    }
  }

  // Template-style lines: "Item  range  value  Flag"
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const itemRegex = /^([A-Za-z][A-Za-z0-9 \/\-]{2,40}?)\s+([\d.]+(?:\s*[–\-]\s*[\d.]+)?)\s+([\d.]+)\s+(Green|Yellow|Red)\b/i;
  const looseFlagRegex = /^(.{3,50}?)\s+(Green|Yellow|Red)\b/i;

  let currentGroup = "general";
  for (const line of lines) {
    if (/cardiovascular|circulation|digestive|respiratory|nutrition|bone|joint|energy|sleep|reproductive/i.test(line) && line.length < 90) {
      currentGroup = mapGroupId(line);
    }

    const strict = line.match(itemRegex);
    if (strict) {
      bucket.get(currentGroup)?.push({
        name: strict[1].trim(),
        normalRange: strict[2].trim(),
        value: strict[3].trim(),
        flag: flagFromToken(strict[4]),
      });
      continue;
    }

    const loose = line.match(looseFlagRegex);
    if (loose && !/illustrative|sample|report|testing item|profile group/i.test(loose[1])) {
      bucket.get(currentGroup)?.push({
        name: loose[1].trim(),
        flag: flagFromToken(loose[2]),
      });
    }
  }

  const summaryRegex = /^(Circulation|Digestive wellness|Liver-related profile|Mineral profile|Sleep and fatigue)\s+(Green|Yellow|Red)\b/gim;
  let summaryMatch: RegExpExecArray | null;
  while ((summaryMatch = summaryRegex.exec(text))) {
    bucket.get(mapGroupId(summaryMatch[1]))?.push({
      name: summaryMatch[1],
      flag: flagFromToken(summaryMatch[2]),
      followUp: "From summary table",
    });
  }

  // Pull simple conclusion section if present
  const simpleConclusionHint =
    pick(/4\.\s*ILLUSTRATIVE CONCLUSION\s*-+\s*([\s\S]*?)(?=\n5\.|\nILLUSTRATIVE GREENWORLD|$)/i, text)
    || pick(/Simple conclusion:\s*([^\n]+)/i, text);

  const recommendationsHint = pick(
    /5\.\s*ILLUSTRATIVE GREENWORLD PRODUCT OPTIONS\s*-+\s*([\s\S]*?)(?=\n6\.|\nSUGGESTED STARTING|$)/i,
    text,
  );

  // Product codes mentioned in the report (W41, etc.)
  if (recommendationsHint) {
    const codes = [...recommendationsHint.matchAll(/\b(W\d{2})\b/gi)].map((m) => m[1].toUpperCase());
    // stored only as hint text; admin UI / content bank applies products
    void codes;
  }

  const groups: ScreeningGroup[] = [];
  for (const id of ["circulation", "digestive", "respiratory", "nutrition", "general", "reproductive"]) {
    const items = bucket.get(id) || [];
    if (items.length) groups.push({ id, title: groupTitle(id), items });
  }

  if (!groups.length) {
    groups.push({
      id: "unparsed",
      title: "Extracted flags (review needed)",
      items: lines
        .filter((line) => /yellow|red|green|attention|within the displayed/i.test(line))
        .slice(0, 40)
        .map((line) => ({
          name: line.slice(0, 100),
          flag: flagFromToken(line),
        })),
    });
  }

  return {
    subject,
    groups,
    rawTextExcerpt: text.slice(0, 14000),
    simpleConclusionHint: simpleConclusionHint?.trim().slice(0, 4000),
    recommendationsHint: recommendationsHint?.trim().slice(0, 4000),
  };
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(pageText);
  }
  return parts.join("\n");
}
