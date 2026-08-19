// Builds a polite, personalized application email from the candidate's REAL parsed resume facts and the
// specific job (company + title). Uses only fields present on the resume — it never invents qualifications.
type Candidate = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  education?: string | null;
  school?: string | null;
  major?: string | null;
  skills?: unknown;
};

export function buildApplicationEmail(candidate: Candidate, job: { title?: string; company?: string }) {
  const name = String(candidate.name || "").trim();
  const school = String(candidate.school || "").trim();
  const major = String(candidate.major || "").trim();
  const education = String(candidate.education || "").trim();
  const phone = String(candidate.phone || "").trim();
  const email = String(candidate.email || "").trim();
  const skills = Array.isArray(candidate.skills) ? (candidate.skills as unknown[]).map((s) => String(s).trim()).filter(Boolean) : [];
  const title = String(job.title || "").trim();
  const company = String(job.company || "").trim();

  const who = name ? `我是 ${name}` : "我是一名求职者";
  // Background clause assembled only from resume facts that actually exist.
  const background = [school, major && `${major}专业`, education && `${education}背景`].filter(Boolean).join("");
  const intro = background ? `${who}，${background}` : who;
  const strengthLine = skills.length ? `我在 ${skills.slice(0, 4).join("、")} 等方向有相关经验，希望能为团队贡献价值。` : "";
  const contact = [phone && `电话：${phone}`, email && `邮箱：${email}`].filter(Boolean).join("　");

  const greeting = company ? `尊敬的${company}招聘团队：` : "尊敬的招聘团队：";
  const purpose = title
    ? `我在贵公司的官方招聘渠道看到「${title}」岗位，对该职位很感兴趣，特此投递简历应聘。`
    : "我对贵公司的相关岗位很感兴趣，特此投递简历应聘。";
  const subject = title
    ? (name ? `应聘${title}｜${name}` : `应聘${title}｜求职简历`)
    : (name ? `求职简历投递｜${name}` : "求职简历投递");
  const lines: string[] = [greeting, ``, `您好！${intro}。${purpose}`];
  if (strengthLine) lines.push(``, strengthLine);
  lines.push(
    ``,
    `随信附上我的简历（见附件），期待有机会与您进一步沟通。感谢您的时间与考虑！`,
    ``,
    `此致`,
    `敬礼`,
    ``,
    name || "求职者",
  );
  if (contact) lines.push(contact);

  return { subject, text: lines.join("\n") };
}
