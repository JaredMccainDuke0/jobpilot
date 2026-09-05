import { createHash } from "node:crypto";

const normalizePart = (value: unknown) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。、“”‘’'"`·•,.;:：；（）()\[\]{}<>《》/\\|_\-]/g, "");

export function buildJobFingerprint(job: {
  company: string;
  title: string;
  city: string;
  applicationEmail?: string | null;
}) {
  return [job.company, job.title, job.city, job.applicationEmail || ""]
    .map(normalizePart)
    .join("|");
}

export function stableJobId(namespace: string, value: string) {
  return `${namespace}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}
