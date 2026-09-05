import { describe, expect, it } from "vitest";
import { isSafeConfiguredUrl, normalizeFeedConfigs, parseFeedPayload } from "./job-catalog-feeds";

describe("job catalog feed adapters", () => {
  it("normalizes Greenhouse jobs into catalog items", () => {
    const [item] = parseFeedPayload(
      {
        id: "greenhouse-acme",
        kind: "greenhouse",
        name: "Acme careers",
        url: "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
        enabled: true,
        official: true,
        company: "Acme",
        city: "深圳",
      },
      JSON.stringify({
        jobs: [{
          id: 42,
          title: "AI Engineer",
          content: "Build machine learning systems and apply to jobs@example.com.",
          location: { name: "深圳" },
          absolute_url: "https://boards.greenhouse.io/acme/jobs/42",
          created_at: "2026-09-01T00:00:00Z",
        }],
      }),
    );
    expect(item).toMatchObject({
      externalId: "42",
      title: "AI Engineer",
      company: "Acme",
      city: "深圳",
      applicationUrl: "https://boards.greenhouse.io/acme/jobs/42",
      applicationEmail: "jobs@example.com",
    });
  });

  it("normalizes Lever jobs and supports generic JSON field mappings", () => {
    const [lever] = parseFeedPayload(
      {
        id: "lever-acme",
        kind: "lever",
        name: "Acme Lever",
        url: "https://api.lever.co/v0/postings/acme?mode=json",
        enabled: true,
        official: true,
        company: "Acme",
      },
      JSON.stringify([{
        id: "lever-1",
        text: "Backend Engineer",
        descriptionPlain: "Build backend services for the hiring team.",
        hostedUrl: "https://jobs.lever.co/acme/lever-1",
        categories: { location: "广州", team: "Engineering" },
      }]),
    );
    const [generic] = parseFeedPayload(
      {
        id: "json-acme",
        kind: "json",
        name: "Acme JSON",
        url: "https://jobs.acme.example/feed.json",
        enabled: true,
        official: false,
        itemsPath: "data.items",
        fields: {
          id: "id",
          title: "role.name",
          company: "employer",
          city: "location.city",
          description: "body",
          applicationUrl: "links.apply",
          publishedAt: "dates.published",
        },
      },
      JSON.stringify({ data: { items: [{
        id: "json-1",
        role: { name: "Data Engineer" },
        employer: "Data Acme",
        location: { city: "东莞" },
        body: "Build data pipelines and production analytics services.",
        links: { apply: "https://jobs.acme.example/apply/1" },
        dates: { published: "2026-09-02" },
      }] } }),
    );
    expect(lever).toMatchObject({ title: "Backend Engineer", company: "Acme", city: "广州" });
    expect(generic).toMatchObject({ externalId: "json-1", title: "Data Engineer", city: "东莞" });
  });

  it("parses RSS and Atom links without executing embedded markup", () => {
    const [item] = parseFeedPayload(
      {
        id: "rss-acme",
        kind: "rss",
        name: "Acme feed",
        url: "https://jobs.acme.example/feed.xml",
        enabled: true,
        official: false,
        company: "Acme",
        city: "广州",
      },
      `<?xml version="1.0"?><rss version="2.0"><channel><item><guid>rss-1</guid><title>平台工程师</title><description><![CDATA[<script>alert(1)</script>负责平台服务和自动化部署。]]></description><link>https://jobs.acme.example/1</link><pubDate>Tue, 02 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>`,
    );
    expect(item).toMatchObject({
      externalId: "rss-1",
      title: "平台工程师",
      company: "Acme",
      city: "广州",
      applicationUrl: "https://jobs.acme.example/1",
    });
    expect(item.description).not.toContain("script");
  });

  it("rejects malformed feed configurations and private URLs", () => {
    expect(normalizeFeedConfigs({ feeds: [{ id: "bad", kind: "json", name: "Bad", url: "not-a-url" }] })).toEqual([]);
    expect(isSafeConfiguredUrl("http://127.0.0.1/jobs")).toBe(false);
    expect(isSafeConfiguredUrl("http://localhost/jobs")).toBe(false);
    expect(isSafeConfiguredUrl("https://jobs.example.com/jobs")).toBe(true);
  });
});
