import { XMLParser } from "fast-xml-parser";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import type { CatalogFeedConfig, RawCatalogItem } from "@/domain/job-catalog";

const feedConfigSchema = z.object({
  id: z.string().trim().min(1).max(120),
  kind: z.enum(["greenhouse", "lever", "json", "rss"]),
  name: z.string().trim().min(2).max(160),
  url: z.string().trim().url().max(2000),
  enabled: z.boolean().optional(),
  official: z.boolean().optional(),
  company: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  itemsPath: z.string().trim().max(160).optional(),
  fields: z.record(z.string(), z.string().trim().min(1).max(160)).optional(),
});

function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return value && typeof value === "object" ? [value as Record<string, unknown>] : [];
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return textValue(object["#text"] ?? object["__cdata"] ?? object.text ?? object.value ?? "");
  }
  return "";
}

function stripMarkup(value: unknown) {
  return textValue(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function valueAt(value: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  return path.split(".").filter(Boolean).reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = stripMarkup(value);
    if (text) return text;
  }
  return "";
}

function emailFrom(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || null;
}

function greenhouseItems(payload: unknown, config: CatalogFeedConfig): RawCatalogItem[] {
  return asArray((payload as { jobs?: unknown })?.jobs).map((item) => {
    const location = valueAt(item, "location.name");
    const description = firstText(item.content, item.description, item.description_html);
    const departments = asArray(item.departments).map((department) => firstText(department.name)).filter(Boolean);
    const applicationUrl = firstText(item.absolute_url, item.url);
    return {
      externalId: firstText(item.id, item.requisition_id, item.job_id, applicationUrl),
      title: firstText(item.title, item.name),
      company: firstText(item.company && (item.company as Record<string, unknown>).name, config.company),
      city: firstText(location, item.city, config.city),
      description,
      applicationUrl,
      sourceUrl: applicationUrl,
      applicationEmail: firstText(item.application_email) || emailFrom(description),
      industry: departments.join(" / ") || null,
      publishedAt: firstText(item.created_at, item.published_at) || null,
      updatedAt: firstText(item.updated_at, item.updatedAt) || null,
      expiresAt: firstText(item.expires_at, item.close_date) || null,
    };
  });
}

function leverItems(payload: unknown, config: CatalogFeedConfig): RawCatalogItem[] {
  return asArray(payload).map((item) => {
    const categories = (item.categories && typeof item.categories === "object")
      ? item.categories as Record<string, unknown>
      : {};
    const description = firstText(item.descriptionPlain, item.description, item.descriptionHtml);
    const applicationUrl = firstText(item.hostedUrl, item.applyUrl, item.url);
    return {
      externalId: firstText(item.id, item.requisitionCode, applicationUrl),
      title: firstText(item.text, item.title, item.name),
      company: firstText(item.company, config.company),
      city: firstText(categories.location, item.location, config.city),
      description,
      applicationUrl,
      sourceUrl: applicationUrl,
      applicationEmail: firstText(item.applicationEmail) || emailFrom(description),
      industry: firstText(categories.team, categories.department, item.industry) || null,
      publishedAt: firstText(item.createdAt, item.publishedAt) || null,
      updatedAt: firstText(item.updatedAt) || null,
      expiresAt: firstText(item.expiresAt) || null,
    };
  });
}

function jsonItems(payload: unknown, config: CatalogFeedConfig) {
  if (Array.isArray(payload)) return asArray(payload);
  const object = payload as Record<string, unknown>;
  const configured = valueAt(payload, config.itemsPath);
  const items = configured ?? object.items ?? object.jobs ?? valueAt(payload, "data.items") ?? valueAt(payload, "data.jobs");
  return asArray(items);
}

function genericItems(payload: unknown, config: CatalogFeedConfig): RawCatalogItem[] {
  const fields = config.fields || {};
  return jsonItems(payload, config).map((item) => {
    const get = (name: keyof NonNullable<CatalogFeedConfig["fields"]>, fallback?: unknown) =>
      valueAt(item, fields[name]) ?? fallback;
    const description = stripMarkup(get("description"));
    const sourceUrl = firstText(get("sourceUrl"), get("applicationUrl"));
    return {
      externalId: firstText(get("id"), sourceUrl),
      title: firstText(get("title")),
      company: firstText(get("company"), config.company),
      city: firstText(get("city"), config.city),
      description,
      applicationUrl: firstText(get("applicationUrl"), sourceUrl),
      sourceUrl,
      applicationEmail: firstText(get("applicationEmail")) || emailFrom(description),
      education: firstText(get("education")) || null,
      graduationYear: firstText(get("graduationYear")) || null,
      workMode: firstText(get("workMode")) || null,
      industry: firstText(get("industry")) || null,
      publishedAt: firstText(get("publishedAt")) || null,
      updatedAt: firstText(get("updatedAt")) || null,
      expiresAt: firstText(get("expiresAt")) || null,
    };
  });
}

function xmlLink(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const alternate = value.find((item) => (item as Record<string, unknown>)?.["@_rel"] === "alternate");
    return xmlLink(alternate || value[0]);
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return firstText(object["@_href"], object["#text"], object.href);
  }
  return "";
}

function rssItems(xml: string, config: CatalogFeedConfig): RawCatalogItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
    trimValues: true,
  });
  const payload = parser.parse(xml) as Record<string, unknown>;
  const rss = payload.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const items = asArray(channel?.item);
  const feed = payload.feed as Record<string, unknown> | undefined;
  const entries = asArray(feed?.entry);
  return [...items, ...entries].map((item) => {
    const description = firstText(item.description, item.summary, item.content);
    const link = xmlLink(item.link) || firstText(item.guid, item.id);
    return {
      externalId: firstText(item.guid, item.id, link),
      title: firstText(item.title),
      company: firstText(item.company, config.company),
      city: firstText(item.city, config.city),
      description,
      applicationUrl: link,
      sourceUrl: link,
      applicationEmail: firstText(item.applicationEmail) || emailFrom(description),
      publishedAt: firstText(item.pubDate, item.published, item.updated) || null,
      updatedAt: firstText(item.updated) || null,
      expiresAt: firstText(item.expiresAt, item.expiry) || null,
    };
  });
}

export function normalizeFeedConfigs(value: unknown): CatalogFeedConfig[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { feeds?: unknown }).feeds)
      ? (value as { feeds: unknown[] }).feeds
      : [];
  return items
    .map((item) => feedConfigSchema.safeParse(item))
    .filter((result): result is { success: true; data: z.infer<typeof feedConfigSchema> } => result.success)
    .map(({ data }) => ({
      ...data,
      enabled: data.enabled !== false,
      official: data.official === true,
    }));
}

export function parseFeedPayload(config: CatalogFeedConfig, body: string): RawCatalogItem[] {
  if (config.kind === "rss") return rssItems(body, config);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("岗位源返回的 JSON 无效");
  }
  if (config.kind === "greenhouse") return greenhouseItems(payload, config);
  if (config.kind === "lever") return leverItems(payload, config);
  return genericItems(payload, config);
}

export function isSafeConfiguredUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
    if (isIP(hostname) && isPrivateAddress(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function isPrivateAddress(address: string) {
  const value = address.toLowerCase();
  if (value === "::" || value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  const mapped = value.startsWith("::ffff:") ? value.slice(7) : value;
  const octets = mapped.split(".");
  if (octets.length !== 4 || !octets.every((part) => /^\d+$/.test(part))) return false;
  const [a, b] = octets.map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function isPublicConfiguredUrl(rawUrl: string) {
  if (!isSafeConfiguredUrl(rawUrl)) return false;
  const hostname = new URL(rawUrl).hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return !isPrivateAddress(hostname);
  try {
    const resolved = await lookup(hostname, { all: true });
    return resolved.length > 0 && resolved.every((entry) => !isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}

export function parseWebSearchPayload(payload: unknown, sourceName: string): RawCatalogItem[] {
  if (!payload || typeof payload !== "object") return [];
  const output = (payload as { output?: unknown[] }).output;
  const parts = Array.isArray(output)
    ? output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      .filter((part: any) => part?.type === "output_text")
      .map((part: any) => String(part.text || ""))
    : [];
  const text = parts.join("\n");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  return asArray(parsed).map((item) => ({ ...item, sourceName }));
}
