"use client";
import { useEffect, useRef, useState } from "react";
import { EMPTY_MATCH_FILTERS, activeMatchFilterCount, buildMatchesHref, filterMatchResults, paginateMatchResults, parseMatchView, type MatchFilters } from "@/domain/match-filters";
import {
  Home,
  Search,
  Send,
  User,
  ArrowLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  SlidersHorizontal,
} from "lucide-react";
type State = any;
const labels: Record<string, string> = {
  name: "姓名",
  email: "邮箱",
  phone: "手机",
  city: "所在城市",
  education: "学历",
  school: "学校",
  major: "专业",
  graduationYear: "毕业年份",
  skills: "技能",
  summary: "经历摘要",
};
const statusText: any = {
  WAITING: "等待发送",
  PROCESSING: "处理中",
  SUCCESS: "成功",
  FAILED: "失败",
  NEEDS_USER: "需要用户处理",
  CANCELLED: "已取消",
};
const popularCities = [
  "北京",
  "上海",
  "广州",
  "深圳",
  "天津",
  "重庆",
  "杭州",
  "南京",
  "苏州",
  "成都",
  "武汉",
  "西安",
  "长沙",
  "郑州",
  "合肥",
  "济南",
  "青岛",
  "厦门",
  "福州",
  "宁波",
  "无锡",
  "东莞",
  "佛山",
  "珠海",
  "中山",
  "惠州",
  "南昌",
  "昆明",
  "贵阳",
  "南宁",
  "海口",
  "太原",
  "石家庄",
  "沈阳",
  "大连",
  "长春",
  "哈尔滨",
  "兰州",
  "乌鲁木齐",
  "呼和浩特",
  "银川",
  "西宁",
  "拉萨",
];
class RequestFailure extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RequestFailure";
  }
}
function visibleError(error: unknown, fallback = "操作失败，请稍后重试") {
  if (error instanceof RequestFailure) return `${error.message}（HTTP ${error.status}）`;
  if (error instanceof Error && error.message === "fetch failed")
    return "无法连接 JobPilot 服务，公网连接可能暂时中断，请稍后重试。";
  return error instanceof Error && error.message ? error.message : fallback;
}
async function request(url: string, opts?: RequestInit) {
  let r: Response;
  try {
    r = await fetch(url, opts);
  } catch (error) {
    if (error instanceof Error && error.message === "fetch failed")
      throw new Error("无法连接 JobPilot 服务，公网连接可能暂时中断，请稍后重试。");
    throw new Error("网络连接失败，请稍后重试。");
  }
  const text = await r.text();
  let d: any = {};
  try {
    d = text ? JSON.parse(text) : {};
  } catch {
    d = {
      error: r.ok ? "服务返回了无法识别的响应" : "服务暂时不可用，请稍后重试",
    };
  }
  if (r.status === 401) {
    location.href = `/invite?next=${encodeURIComponent(location.pathname)}`;
    throw new Error("登录状态已失效");
  }
  if (!r.ok) throw new RequestFailure(d.error || "操作失败", r.status);
  return d;
}
export default function JobPilot() {
  const [state, setState] = useState<State>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [path, setPath] = useState("/"),
    [routeSearch, setRouteSearch] = useState(""),
    [startMatchSearch, setStartMatchSearch] = useState(false);
  const load = async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      setState(await request("/api/state?matchLimit=30"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  const reload = () => load(false);
  useEffect(() => {
    setPath(location.pathname);
    setRouteSearch(location.search);
    void load(true);
    const onBack = () => {
      setPath(location.pathname);
      setRouteSearch(location.search);
    };
    addEventListener("popstate", onBack);
    return () => removeEventListener("popstate", onBack);
  }, []);
  const go = (href: string) => {
    const target = new URL(href, location.origin);
    if (`${target.pathname}${target.search}` !== `${location.pathname}${location.search}`)
      history.pushState(null, "", `${target.pathname}${target.search}`);
    setPath(target.pathname);
    setRouteSearch(target.search);
    scrollTo({ top: 0, behavior: "instant" });
  };
  if (loading)
    return (
      <main className="center">
        <RefreshCw className="spin" />
        <p>正在载入本地数据…</p>
      </main>
    );
  if (error)
    return (
      <main className="center">
        <AlertCircle />
        <h1>暂时无法载入</h1>
        <p>{error}</p>
        <button onClick={() => load(true)}>重试</button>
      </main>
    );
  const currentPath =
    path === "/" && !state.resume?.confirmed ? "/onboarding/resume" : path;
  const onboarding = currentPath.startsWith("/onboarding");
  let view: React.ReactNode;
  if (currentPath === "/onboarding/resume")
    view = <ImprovedResumeUpload go={go} reload={reload} />;
  else if (currentPath === "/onboarding/confirm")
    view = <ResumeConfirm state={state} go={go} reload={reload} />;
  else if (currentPath === "/onboarding/preferences")
    view = (
      <Preferences
        state={state}
        go={go}
        startSearch={() => {
          setStartMatchSearch(true);
          go("/matches");
        }}
      />
    );
  else if (currentPath === "/matches")
    view = (
      <Matches
        state={state}
        setState={setState}
        reload={reload}
        go={go}
        routeSearch={routeSearch}
        autoStart={startMatchSearch}
        onAutoStartHandled={() => setStartMatchSearch(false)}
      />
    );
  else if (currentPath.startsWith("/matches/"))
    view = (
      <MatchDetail
        state={state}
        id={currentPath.split("/").pop()!}
        go={go}
        backHref={(() => {
          const candidate = new URLSearchParams(routeSearch).get("back") || "";
          return candidate.startsWith("/matches") ? candidate : "/matches";
        })()}
      />
    );
  else if (currentPath === "/applications/confirm")
    view = <ConfirmApplications state={state} go={go} reload={reload} />;
  else if (currentPath === "/applications")
    view = <Applications state={state} reload={reload} />;
  else if (currentPath === "/profile")
    view = <ConnectionSettings state={state} go={go} />;
  else view = <Dashboard state={state} go={go} />;
  return (
    <div className={onboarding ? "app onboarding" : "app"}>
      {onboarding && <Progress path={currentPath} />}
      <main>{view}</main>
      {!onboarding && <Nav path={currentPath} go={go} />}
    </div>
  );
}
function Progress({ path }: { path: string }) {
  const step = path.includes("resume") ? 1 : path.includes("confirm") ? 2 : 3;
  return (
    <header className="progress">
      <b>JobPilot</b>
      <span>第 {step} 步，共 3 步</span>
      <div>
        <i style={{ width: `${(step / 3) * 100}%` }} />
      </div>
    </header>
  );
}
function ResumeUpload({ go }: { go: (p: string) => void }) {
  const [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  return (
    <section>
      <div className="eyebrow">第 1 步</div>
      <h1>上传你的简历</h1>
      <p className="muted">支持 PDF、DOCX 或 TXT，文件不超过 5MB。</p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            await request("/api/resume", {
              method: "POST",
              body: new FormData(e.currentTarget),
            });
            go("/onboarding/confirm");
          } catch (x: any) {
            setErr(x.message);
            setBusy(false);
          }
        }}
      >
        <label className="upload">
          <input required name="file" type="file" accept=".pdf,.docx,.txt" />
          <strong>选择简历文件</strong>
          <span>文件仅保存在本机</span>
        </label>
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "正在解析…" : "上传并解析"}
        </button>
      </form>
    </section>
  );
}
function ResumeConfirm({ state, go, reload }: { state: State; go: any; reload: any }) {
  const v = state.resume?.versions?.[0];
  if (!v)
    return (
      <Empty
        title="还没有可确认的简历"
        action="返回上传"
        onClick={() => go("/onboarding/resume")}
      />
    );
  const parsed = JSON.parse(v.parsedJson);
  return (
    <section>
      <Back onClick={() => go("/onboarding/resume")} />
      <div className="eyebrow">第 2 步</div>
      <h1>确认关键信息</h1>
      <p className="muted">解析可能遗漏内容，请核对后继续。</p>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const obj: any = {};
          Object.keys(labels).forEach((k) => (obj[k] = fd.get(k)));
          obj.graduationYear = Number(obj.graduationYear) || undefined;
          obj.skills = String(obj.skills || "")
            .split(/[，,]/)
            .filter(Boolean);
          await request("/api/resume/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resumeId: state.resume.id, parsed: obj }),
          });
          await reload();
          go("/onboarding/preferences");
        }}
      >
        {Object.entries(labels).map(([k, l]) => (
          <label key={k}>
            {l}
            {!parsed[k] && <em>待补充</em>}
            {k === "summary" ? (
              <textarea name={k} defaultValue={parsed[k]} />
            ) : (
              <input
                name={k}
                defaultValue={
                  Array.isArray(parsed[k]) ? parsed[k].join("，") : parsed[k]
                }
              />
            )}
          </label>
        ))}
        <button className="primary">确认简历信息</button>
      </form>
    </section>
  );
}
function Preferences({ state, go, startSearch }: { state: State; go: any; startSearch: () => void }) {
  const previous = state.preference || {};
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  return (
    <section>
      <Back onClick={() => go("/onboarding/confirm")} />
      <div className="eyebrow">第 3 步</div>
      <h1>你想找什么工作？</h1>
      {previous.rawText && (
        <p className="muted">已填入上次的求职条件，可直接修改后重新匹配。</p>
      )}
      {busy && <p className="inline-notice" role="status">正在从岗位库匹配最新岗位，请稍候。</p>}
      {searchError && <p className="error" role="alert">{searchError} 请检查网络后重新提交。</p>}
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setSearchError("");
          const d = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await request("/api/preferences", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(d),
            });
            startSearch();
          } catch (x: any) {
            setSearchError(visibleError(x, "保存求职条件失败"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          求职描述
          <textarea
            required
            minLength={5}
            name="rawText"
            defaultValue={previous.rawText || ""}
            placeholder="例如：想在深圳找通信与 AI 结合的现场研发岗位"
          />
        </label>
        <div className="two">
          <label>
            城市
            <input
              name="city"
              list="popular-cities"
              defaultValue={previous.city || ""}
              placeholder="不限或输入城市"
            />
            <datalist id="popular-cities">
              {popularCities.map((city) => (
                <option value={city} key={city} />
              ))}
            </datalist>
          </label>
          <label>
            工作方式
            <select name="workMode" defaultValue={previous.workMode || ""}>
              <option value="">不限</option>
              <option>现场</option>
              <option>混合</option>
              <option>远程</option>
            </select>
          </label>
        </div>
        <label>
          岗位方向
          <input
            name="jobType"
            defaultValue={previous.jobType || ""}
            placeholder="例如：算法工程师"
          />
        </label>
        <label>
          行业
          <input
            name="industry"
            defaultValue={previous.industry || ""}
            placeholder="例如：通信、人工智能"
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "正在匹配…" : "保存条件并查看岗位"}
        </button>
      </form>
    </section>
  );
}
function Dashboard({ state, go }: { state: State; go: any }) {
  if (!state.resume?.confirmed)
    return (
      <section>
        <h1>JobPilot</h1>
        <Empty
          title="从简历开始"
          text="上传并确认简历后，系统才能为你匹配职位。"
          action="上传简历"
          onClick={() => go("/onboarding/resume")}
        />
      </section>
    );
  return (
    <section>
      <header className="page-head">
        <div>
          <div className="eyebrow">今日求职进度</div>
          <h1>继续你的求职流程</h1>
        </div>
      </header>
      <div className="summary-band">
        <b>{state.resume.fileName}</b>
        <span>简历已确认</span>
        <button type="button" onClick={() => go("/onboarding/resume")}>
          更换简历
        </button>
      </div>
      <div className="summary-band">
        <b>求职需求</b>
        <span>{state.preference?.rawText || "尚未填写"}</span>
        <button type="button" onClick={() => go("/onboarding/preferences")}>
          {state.preference ? "修改并重新匹配" : "填写求职需求"}
        </button>
      </div>
      <button
        className="primary"
        onClick={() => go(state.run ? "/matches" : "/onboarding/preferences")}
      >
        {state.run ? "查看匹配结果" : "填写求职需求"}
      </button>
    </section>
  );
}
function InlineActionError({
  title,
  message,
  solution,
  onRetry,
  busy = false,
}: {
  title: string;
  message: string;
  solution: string;
  onRetry?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="inline-action-error" role="alert">
      <AlertCircle />
      <div>
        <b>{title}</b>
        <p>{message}</p>
        <small>{solution}</small>
      </div>
      {onRetry && (
        <button type="button" disabled={busy} onClick={onRetry}>
          <span className="loading-label">
            {busy && <RefreshCw className="spin" />}
            {busy ? "正在重试…" : "重试"}
          </span>
        </button>
      )}
    </div>
  );
}
function CatalogStatusNotice({ catalog }: { catalog: any }) {
  if (!catalog?.configured)
    return (
      <p className="error" role="status">
        岗位库正在等待管理员配置公开岗位数据源，当前不会临时联网搜索。
      </p>
    );
  const refreshed = catalog.lastRefreshAt
    ? new Date(catalog.lastRefreshAt).toLocaleString("zh-CN", { hour12: false })
    : "尚未完成首次更新";
  const failed = catalog.lastStatus === "failed" || catalog.lastStatus === "partial";
  return (
    <p className={failed ? "error" : "inline-notice"} role="status">
      岗位库 {catalog.freshJobCount ?? 0} 个最新岗位 · 最近更新：{refreshed} · 每 {catalog.refreshIntervalMinutes || 60} 分钟后台更新
      {failed ? " · 上次更新未全部完成，系统会继续重试" : ""}
    </p>
  );
}
function Matches({ state, setState, reload, go, routeSearch, autoStart, onAutoStartHandled }: {
  state: State; setState: any; reload: any; go: any; routeSearch: string;
  autoStart: boolean; onAutoStartHandled: () => void;
}) {
  const results = state.run?.results || [];
  const view = parseMatchView(routeSearch);
  const filteredResults = filterMatchResults(results, view.filters);
  const pagination = paginateMatchResults(filteredResults, view.page);
  const pageResults = pagination.items as any[];
  const selected = results.filter((item: any) => item.selected).length;
  const selectedOnPage = pageResults.filter((item: any) => item.selected).length;
  const allSelectedOnPage = pageResults.length > 0 && pageResults.every((item: any) => item.selected);
  const filterCount = activeMatchFilterCount(view.filters);
  const [busy, setBusy] = useState(autoStart);
  const autoStartRef = useRef(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [allPending, setAllPending] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(filterCount > 0);
  const [draftFilters, setDraftFilters] = useState<MatchFilters>(view.filters);
  const [confirmSearch, setConfirmSearch] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [searchFailure, setSearchFailure] = useState("");
  const [selectionFailure, setSelectionFailure] = useState<
    | { kind: "one"; id: string; selected: boolean; message: string }
    | { kind: "all"; selected: boolean; clearAll?: boolean; message: string }
    | null
  >(null);
  const catalog = state.catalog || {};

  useEffect(() => {
    setDraftFilters(view.filters);
    if (activeMatchFilterCount(view.filters) > 0) setFiltersOpen(true);
  }, [routeSearch]);

  const patchOne = (resultId: string, next: boolean) => setState((current: any) => ({
    ...current,
    run: { ...current.run, results: (current.run?.results || []).map((item: any) => item.id === resultId ? { ...item, selected: next } : item) },
  }));
  const patchIds = (ids: string[], next: boolean) => setState((current: any) => ({
    ...current,
    run: { ...current.run, results: (current.run?.results || []).map((item: any) => ids.includes(item.id) ? { ...item, selected: next } : item) },
  }));

  const selectOne = async (resultId: string, next: boolean) => {
    const previous = !!results.find((item: any) => item.id === resultId)?.selected;
    setSelectionFailure(null);
    setPendingIds((current) => new Set(current).add(resultId));
    patchOne(resultId, next);
    try {
      await request("/api/matches/select", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resultId, selected: next, visibleIds: pageResults.map((item: any) => item.id) }),
      });
    } catch (error) {
      patchOne(resultId, previous);
      setSelectionFailure({ kind: "one", id: resultId, selected: next, message: visibleError(error) });
    } finally {
      setPendingIds((current) => { const nextSet = new Set(current); nextSet.delete(resultId); return nextSet; });
    }
  };

  const selectPage = async (next: boolean) => {
    if (!pageResults.length) return;
    const ids = pageResults.map((item: any) => item.id);
    const previous = new Map(pageResults.map((item: any) => [item.id, !!item.selected]));
    setSelectionFailure(null); setAllPending(true); patchIds(ids, next);
    try {
      await request("/api/matches/select", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pageResults[0].id, all: next, visibleIds: ids }),
      });
    } catch (error) {
      setState((current: any) => ({
        ...current,
        run: { ...current.run, results: (current.run?.results || []).map((item: any) => previous.has(item.id) ? { ...item, selected: previous.get(item.id) } : item) },
      }));
      setSelectionFailure({ kind: "all", selected: next, message: visibleError(error) });
    } finally { setAllPending(false); }
  };

  const clearSelection = async () => {
    if (!results.length || !selected) return;
    const previous = new Map(results.map((item: any) => [item.id, !!item.selected]));
    setSelectionFailure(null); setAllPending(true); patchIds(results.map((item: any) => item.id), false);
    try {
      await request("/api/matches/select", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: results[0].id, clearAll: true, visibleIds: pageResults.length ? pageResults.map((item: any) => item.id) : [results[0].id] }),
      });
    } catch (error) {
      setState((current: any) => ({
        ...current,
        run: { ...current.run, results: (current.run?.results || []).map((item: any) => ({ ...item, selected: previous.get(item.id) ?? item.selected })) },
      }));
      setSelectionFailure({ kind: "all", selected: false, clearAll: true, message: visibleError(error) });
    } finally { setAllPending(false); }
  };

  const runSearch = async () => {
    setBusy(true); setSearchFailure(""); setSearchMessage("");
    try {
      const matchResponse = await request("/api/matches", { method: "POST" });
      await reload(); go("/matches"); setConfirmSearch(false);
      if (matchResponse.warning) setSearchMessage(matchResponse.warning);
    } catch (error) { setSearchFailure(visibleError(error, "重新匹配失败")); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!autoStart || autoStartRef.current) return;
    autoStartRef.current = true; onAutoStartHandled(); void runSearch();
  }, [autoStart, onAutoStartHandled]);

  return (
    <section className={selected ? "with-action" : ""}>
      <div className="page-head">
        <div><div className="eyebrow">来自后台岗位库</div><h1>匹配结果</h1></div>
        <button className="new-search" disabled={busy} onClick={() => setConfirmSearch(true)}>
          <RefreshCw className={busy ? "spin" : undefined} /> {busy ? "正在匹配" : "重新匹配"}
        </button>
      </div>
      <CatalogStatusNotice catalog={catalog} />
      {confirmSearch && (
        <div className="search-confirm" role="alert">
          <div><b>根据最新岗位库重新匹配？</b><p>岗位库由后台定时更新，本次只读取本地最新岗位，不会临时联网搜索。</p></div>
          <div><button type="button" onClick={() => setConfirmSearch(false)}>取消</button><button className="primary" type="button" onClick={() => void runSearch()}>确认并匹配</button></div>
        </div>
      )}
      {busy && results.length > 0 && <p className="inline-notice" role="status">正在从岗位库重新匹配；当前结果仍然保留。</p>}
      {!busy && !state.run?.consumedAt && state.run?.searchWarning && <p className="error">{state.run.searchWarning}</p>}
      {searchMessage && <p className="inline-notice" role="status">{searchMessage}</p>}
      {searchFailure && <InlineActionError title="岗位库匹配失败" message={searchFailure} solution="请稍后重试；已有匹配结果不会被清除。" onRetry={() => void runSearch()} busy={busy} />}
      {selectionFailure && <InlineActionError title="岗位选择未保存" message={selectionFailure.message} solution="页面已恢复到保存前状态，可以直接重试。" onRetry={() => selectionFailure.kind === "one" ? void selectOne(selectionFailure.id, selectionFailure.selected) : selectionFailure.clearAll ? void clearSelection() : void selectPage(selectionFailure.selected)} busy={allPending || pendingIds.size > 0} />}

      {busy && !results.length ? (
        <div className="empty" role="status" aria-live="polite"><RefreshCw className="spin" aria-hidden="true" /><h2>正在匹配岗位库</h2><p>正在根据已保存的求职条件读取最新岗位，请稍候。</p></div>
      ) : !results.length ? (
        <Empty title={state.run?.consumedAt ? "本轮岗位已处理完成" : "暂无符合条件的最新岗位"} text={state.run?.consumedAt ? "已投递岗位仍保留在投递记录中。重新匹配会从岗位库读取下一批未处理岗位。" : "请先填写求职需求；岗位库由后台定时更新。"} action={state.run?.consumedAt ? "重新匹配" : "填写求职需求"} onClick={() => state.run?.consumedAt ? setConfirmSearch(true) : go("/onboarding/preferences")} />
      ) : (
        <>
          <div className="list-tools">
            <button disabled={allPending || pendingIds.size > 0 || !pageResults.length} onClick={() => void selectPage(!allSelectedOnPage)}><span className="loading-label">{allPending && <RefreshCw className="spin" />}{allPending ? "正在更新…" : allSelectedOnPage ? "取消本页全选" : "全选本页"}</span></button>
            <button onClick={() => setFiltersOpen((current) => !current)}><SlidersHorizontal /> 筛选当前结果{filterCount ? ` (${filterCount})` : ""}</button>
            {selected > 0 && <button disabled={allPending} onClick={() => void clearSelection()}>清空全部选择</button>}
          </div>
          {filtersOpen && (
            <form className="match-filters" onSubmit={(event) => { event.preventDefault(); go(buildMatchesHref(draftFilters, 1)); }}>
              <label>关键词<input value={draftFilters.q} onChange={(event) => setDraftFilters({ ...draftFilters, q: event.target.value })} placeholder="岗位、公司或描述" /></label>
              <label>城市<input value={draftFilters.city} onChange={(event) => setDraftFilters({ ...draftFilters, city: event.target.value })} placeholder="例如：深圳" /></label>
              <label>工作方式<select value={draftFilters.workMode} onChange={(event) => setDraftFilters({ ...draftFilters, workMode: event.target.value })}><option value="">不限</option><option>现场</option><option>混合</option><option>远程</option></select></label>
              <label>行业<input value={draftFilters.industry} onChange={(event) => setDraftFilters({ ...draftFilters, industry: event.target.value })} placeholder="例如：人工智能" /></label>
              <label>匹配状态<select value={draftFilters.eligibility} onChange={(event) => setDraftFilters({ ...draftFilters, eligibility: event.target.value as MatchFilters["eligibility"] })}><option value="all">全部</option><option value="eligible">符合条件</option><option value="ineligible">条件不符</option></select></label>
              <label>申请方式<select value={draftFilters.application} onChange={(event) => setDraftFilters({ ...draftFilters, application: event.target.value as MatchFilters["application"] })}><option value="all">全部</option><option value="automatic">可自动投递</option><option value="manual">手动申请</option></select></label>
              <div className="match-filter-actions"><button type="button" onClick={() => { setDraftFilters(EMPTY_MATCH_FILTERS); go("/matches"); }}>清除筛选</button><button className="primary" type="submit">应用筛选</button></div>
            </form>
          )}
          <div className="result-summary"><span>共 {filteredResults.length} 个结果{filterCount ? `（原始 ${results.length} 个）` : ""}</span><span>{filteredResults.length ? `显示 ${pagination.start + 1}–${pagination.end}` : "没有符合条件的岗位"}</span></div>
          {!filteredResults.length ? (
            <Empty title="没有符合筛选条件的岗位" text="这些筛选只作用于当前匹配结果，不会触发联网搜索。" action="清除筛选" onClick={() => go("/matches")} />
          ) : (
            <div className="job-list">{pageResults.map((result: any) => <JobRow key={result.id} r={result} pending={allPending || pendingIds.has(result.id)} onSelect={selectOne} go={go} backHref={buildMatchesHref(view.filters, pagination.page)} />)}</div>
          )}
          {filteredResults.length > 0 && pagination.totalPages > 1 && (
            <nav className="pagination" aria-label="匹配结果分页"><button disabled={pagination.page === 1} onClick={() => go(buildMatchesHref(view.filters, pagination.page - 1))}>上一页</button><span>第 {pagination.page} / {pagination.totalPages} 页</span><button disabled={pagination.page === pagination.totalPages} onClick={() => go(buildMatchesHref(view.filters, pagination.page + 1))}>下一页</button></nav>
          )}
        </>
      )}
      {selected > 0 && <div className="bulk"><span>已选 <b>{selected}</b> 个职位{selected > selectedOnPage ? `（本页外 ${selected - selectedOnPage} 个）` : ""}</span><button onClick={() => go("/applications/confirm")}>检查并投递 <ChevronRight /></button></div>}
    </section>
  );
}
function JobRow({
  r,
  pending,
  onSelect,
  go,
  backHref,
}: {
  r: any;
  pending: boolean;
  onSelect: (id: string, selected: boolean) => Promise<void>;
  go: any;
  backHref: string;
}) {
  const reasons = JSON.parse(r.reasonsJson);
  const mismatch = JSON.parse(r.mismatchJson);
  const canAutoEmail =
    r.job.applicationType === "verified_email" &&
    !!r.job.applicationEmail &&
    !!r.job.source?.verified;
  return (
    <article className={!r.eligible ? "job excluded" : "job"}>
      <label className="check" aria-label={`选择 ${r.job.title}`}>
        <input
          type="checkbox"
          checked={r.selected}
          disabled={pending}
          onChange={(e) => void onSelect(r.id, e.target.checked)}
        />
        <span />
        {pending && <RefreshCw className="selection-spinner spin" aria-label="正在保存选择" />}
      </label>
      <button className="job-main" onClick={() => go(`/matches/${r.id}?back=${encodeURIComponent(backHref)}`)}>
        <div className="job-top">
          <div>
            <h2>{r.job.title}</h2>
            <p>
              {r.job.company} · {r.job.city}
            </p>
          </div>
          <strong className="score">{r.score}</strong>
        </div>
        <p className="evidence">{reasons[0] || mismatch[0] || "信息待确认"}</p>
        <small>
          {!r.eligible ? "条件不符，仍可手动选择 · " : ""}
          {canAutoEmail
            ? "公开招聘邮箱可自动投递"
            : r.job.applicationType === "verified_email"
              ? "公开邮箱待页面核验，不会自动投递"
              : "申请入口手动投递"} ·{" "}
          {r.job.source.name} ·{" "}
          {r.job.source.verified ? "来源已核验" : "来源待核验"}
        </small>
      </button>
    </article>
  );
}
function MatchDetail({ state, id, go, backHref }: { state: State; id: string; go: any; backHref: string }) {
  const r = state.run?.results?.find((x: any) => x.id === id);
  if (!r)
    return (
      <Empty
        title="职位不存在"
        action="返回匹配"
        onClick={() => go(backHref)}
      /> 
    );
  const sourceEvidence = r.job.sourceEvidence as
    | { checkedAt?: string; excerpt?: string; reason?: string }
    | null
    | undefined;
  const sourceVerified = !!r.job.source?.verified;
  const canAutoEmail =
    r.job.applicationType === "verified_email" &&
    !!r.job.applicationEmail &&
    sourceVerified;
  const groups = [
    ["主要匹配点", r.reasonsJson],
    ["不匹配", r.mismatchJson],
    ["未知信息", r.unknownJson],
    ["风险", r.risksJson],
  ];
  return (
    <section>
      <Back onClick={() => go(backHref)} />
      <div className="detail-head">
        <div>
          <h1>{r.job.title}</h1>
          <p>
            {r.job.company} · {r.job.city} · {r.job.workMode || "工作方式未知"}
          </p>
        </div>
        <strong className="score large">{r.score}</strong>
      </div>
      {groups.map(([title, json]) => (
        <div className="detail-group" key={title}>
          <h2>{title}</h2>
          {JSON.parse(json).length ? (
            <ul>
              {JSON.parse(json).map((x: string) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">无已确认信息</p>
          )}
        </div>
      ))}
      <div className="detail-group">
        <h2>来源和申请方式</h2>
        <p>
          {r.job.source.name} · {sourceVerified ? "已核验" : "待核验"}
        </p>
        {canAutoEmail ? (
          <p>公开招聘邮箱：{r.job.applicationEmail}（确认后可自动邮件投递）</p>
        ) : r.job.applicationType === "verified_email" && r.job.applicationEmail ? (
          <p className="muted">
            已发现公开邮箱线索，但页面尚未完成独立核验；系统不会自动发送邮件。请先查看官方页面后自行决定。
          </p>
        ) : (
          <p className="muted">
            该岗位未提供可直接投递的招聘邮箱，请通过其申请入口手动投递；系统不会自动发送邮件。
          </p>
        )}
        {sourceEvidence?.checkedAt && (
          <p className="muted">最近页面核验：{sourceEvidence.checkedAt.replace("T", " ").slice(0, 16)}</p>
        )}
        {sourceEvidence?.excerpt && <p className="evidence source-excerpt">页面证据摘录：{sourceEvidence.excerpt}</p>}
        {!sourceVerified && sourceEvidence?.reason && <p className="muted">核验说明：{sourceEvidence.reason}</p>}
        {r.job.applicationUrl.includes("example.com") ? (
          <p className="muted">演示职位：官方入口为占位链接，接入实时职位源后会显示真实企业入口。</p>
        ) : (
          <a href={r.job.applicationUrl} target="_blank" rel="noreferrer">
            查看官方申请入口 <ExternalLink />
          </a>
        )}
      </div>
    </section>
  );
}
function ConfirmApplications({ state, go, reload }: { state: State; go: any; reload: any }) {
  const chosen = state.run?.results?.filter((x: any) => x.selected) || [];
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, creating: false });
  const [sendFailure, setSendFailure] = useState("");
  const sendApplications = async () => {
    setSending(true);
    setSendFailure("");
    setProgress({ current: 0, total: 0, creating: true });
    try {
      const created = await request("/api/applications", { method: "POST" });
      const taskIds = Array.isArray(created.taskIds)
        ? created.taskIds.filter((taskId: unknown): taskId is string => typeof taskId === "string")
        : [];
      setProgress({ current: 0, total: taskIds.length, creating: false });
      for (let index = 0; index < taskIds.length; index += 1) {
        setProgress({ current: index + 1, total: taskIds.length, creating: false });
        await request("/api/applications/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: taskIds[index] }),
        });
      }
      await reload();
      go("/applications");
    } catch (error) {
      setSendFailure(visibleError(error, "投递任务处理失败"));
      await reload();
    } finally {
      setSending(false);
    }
  };
  return (
    <section>
      <Back onClick={() => go("/matches")} />
      <div className="eyebrow">最终确认</div>
      <h1>检查投递清单</h1>
      <p className="muted">
        确认后会先建立持久化任务，再逐个发送；未处理完的任务会保留，可在投递记录中继续。
      </p>
      {sendFailure && (
        <InlineActionError
          title="投递没有全部完成"
          message={sendFailure}
          solution="已建立的任务不会丢失。可在当前页重试，或前往投递记录继续发送。"
          onRetry={() => void sendApplications()}
          busy={sending}
        />
      )}
      {chosen.map((r: any) => (
        <div className="check-row" key={r.id}>
          <CheckCircle2 />
          <div>
            <b>{r.job.title}</b>
            <p>
              {r.job.company} ·{" "}
              {r.job.applicationType === "verified_email" && r.job.source?.verified
                ? `公开招聘邮箱投递（${r.job.applicationEmail}）`
                : r.job.applicationType === "verified_email"
                  ? "公开邮箱待页面核验，不会自动发送"
                : r.job.applicationType === "mock"
                  ? "模拟投递"
                  : "手动申请入口"}
            </p>
          </div>
        </div>
      ))}
      <div className="check-row">
        <CheckCircle2 />
        <div>
          <b>简历版本</b>
          <p>{state.resume?.fileName} · 已确认</p>
        </div>
      </div>
      {chosen.length ? (
        <button
          className="primary"
          disabled={sending}
          onClick={() => void sendApplications()}
        >
          <span className="loading-label" aria-live="polite">
            {sending && <RefreshCw className="spin" />}
            {progress.creating
              ? "正在建立投递任务…"
              : sending && progress.total > 0
                ? `正在发送 ${progress.current}/${progress.total}…`
                : "最终确认并开始投递"}
          </span>
        </button>
      ) : (
        <Empty
          title="还没有勾选职位"
          action="返回选择"
          onClick={() => go("/matches")}
        />
      )}
    </section>
  );
}
function failureHint(t: any): string {
  const emailNeedsFix = t.adapter === "email" && ["FAILED", "NEEDS_USER"].includes(t.status);
  if (emailNeedsFix) {
    const s = String(t.errorSummary || "");
    if (t.errorCode === "DELIVERY_UNKNOWN" || /状态未知/.test(s))
      return "请求超时不代表一定没发出。请先检查 Gmail“已发送”或登录邮箱中的密送副本，确认没有邮件后再重试，避免重复投递。";
    if (/平台代发|Resend/i.test(s))
      return "平台代发服务暂时不可用，请稍后重试；如果持续失败，请联系站点管理员。其他邮箱不需要自行设置。";
    if (/Google|Gmail|授权|过期|401|invalid_grant/i.test(s))
      return "Gmail 授权可能已过期。到「我的 → 发信方式」重新连接 Gmail，再点下方「重试发送」。";
    if (/403|额度|quota|limit|rate/i.test(s))
      return "可能触发了发信频率或额度限制。请过几分钟再点「重试发送」。";
    return "请先查看上方失败原因，再稍后重试。Gmail 用户可重新连接 Gmail；其他邮箱由平台代发，无需自行配置。";
  }
  if (
    t.status === "NEEDS_USER" &&
    t.adapter === "manual" &&
    t.applicationType === "verified_email" &&
    !t.sourceVerified
  )
    return "该岗位的招聘页面尚未完成独立核验，系统不会自动发送。请查看官方页面后自行决定是否申请。";
  if (t.status === "NEEDS_USER" && t.adapter === "manual")
    return "该岗位没有公开投递邮箱，点上方「打开官方申请入口」到官网手动投递。";
  return "";
}
function Applications({ state, reload }: { state: State; reload: any }) {
  const [taskBusy, setTaskBusy] = useState<string | null>(null);
  const [taskFailure, setTaskFailure] = useState<{ id: string; message: string } | null>(null);
  const [manualTo, setManualTo] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualConfirmation, setManualConfirmation] = useState<{
    to: string;
    company: string;
    title: string;
  } | null>(null);
  const [manualFeedback, setManualFeedback] = useState<{
    kind: "ok" | "error" | "notice";
    message: string;
  } | null>(null);
  const openManualConfirmation = () => {
    const to = manualTo.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      setManualFeedback({ kind: "error", message: "请填写有效的收件邮箱。" });
      return;
    }
    setManualFeedback(null);
    setManualConfirmation({
      to,
      company: manualCompany.trim(),
      title: manualTitle.trim(),
    });
  };
  const confirmManualSend = async () => {
    const draft = manualConfirmation;
    if (!draft) return;
    setManualBusy(true);
    setManualFeedback(null);
    try {
      const res = await request("/api/applications/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, confirmed: true }),
      });
      await reload();
      setManualConfirmation(null);
      if (res?.status === "SUCCESS") {
        setManualFeedback({
          kind: "ok",
          message: res.created
            ? "邮件服务已接收投递请求，投递记录已更新。"
            : "相同内容已有成功记录，本次未重复发送。",
        });
        setManualTo("");
        setManualCompany("");
        setManualTitle("");
      } else {
        setManualFeedback({
          kind: "notice",
          message: res.created
            ? `投递任务已创建，但尚未发送成功：${res.error || "请在下方投递记录中查看原因后重试。"}`
            : res.error || "相同内容已有投递任务，请在下方投递记录中查看或继续发送。",
        });
      }
    } catch (error) {
      setManualConfirmation(null);
      setManualFeedback({ kind: "error", message: visibleError(error, "手动投递失败") });
    } finally {
      setManualBusy(false);
    }
  };
  const processTask = async (task: any, retryFirst: boolean) => {
    setTaskBusy(task.id);
    setTaskFailure(null);
    try {
      if (retryFirst) {
        await request("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: task.id, action: "retry" }),
        });
      }
      const result = await request("/api/applications/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id }),
      });
      await reload();
      if (result?.ok === false)
        setTaskFailure({ id: task.id, message: result.error || "发送仍未成功，请查看任务原因。" });
    } catch (error) {
      setTaskFailure({ id: task.id, message: visibleError(error, "任务处理失败") });
      await reload();
    } finally {
      setTaskBusy(null);
    }
  };
  const switchToManual = async (task: any) => {
    setTaskBusy(task.id);
    setTaskFailure(null);
    try {
      await request("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, action: "manual" }),
      });
      await reload();
    } catch (error) {
      setTaskFailure({ id: task.id, message: visibleError(error, "切换为手动处理失败") });
    } finally {
      setTaskBusy(null);
    }
  };
  return (
    <section>
      <h1>投递记录</h1>
      <p className="muted">
        Gmail 投递会保存在“已发送”中；平台代发成功后，会把完整邮件密送到你的登录邮箱。
      </p>
      <details className="usage-detail">
        <summary>手动发送简历到指定邮箱</summary>
        <p className="muted">直接把简历发到指定的 HR / 招聘邮箱。企业回复会回到你的登录邮箱；平台代发时，你也会收到密送副本。</p>
        <div className="form-grid">
          <label>
            收件邮箱
            <input type="email" placeholder="hr@company.com" value={manualTo} onChange={(e) => setManualTo(e.target.value)} />
          </label>
          <div className="two">
            <label>
              公司（选填）
              <input value={manualCompany} onChange={(e) => setManualCompany(e.target.value)} placeholder="公司名称" />
            </label>
            <label>
              岗位（选填）
              <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="岗位名称" />
            </label>
          </div>
          <button className="primary" type="button" disabled={manualBusy} onClick={openManualConfirmation}>
            <span className="loading-label">
              {manualBusy && <RefreshCw className="spin" />}
              {manualBusy ? "正在提交…" : "发送简历"}
            </span>
          </button>
          {manualConfirmation && (
            <div className="manual-confirm" role="alertdialog" aria-modal="true" aria-label="确认手动投递">
              <b>确认发送简历</b>
              <p>将向 <strong>{manualConfirmation.to}</strong> 发送当前已确认的简历，并创建可追溯的投递记录。</p>
              <div className="manual-confirm-actions">
                <button type="button" disabled={manualBusy} onClick={() => setManualConfirmation(null)}>取消</button>
                <button className="primary" type="button" disabled={manualBusy} onClick={() => void confirmManualSend()}>
                  <span className="loading-label">
                    {manualBusy && <RefreshCw className="spin" />}
                    {manualBusy ? "正在提交…" : "确认发送"}
                  </span>
                </button>
              </div>
            </div>
          )}
          {manualFeedback?.kind === "ok" && <p className="inline-success" role="status">{manualFeedback.message}</p>}
          {manualFeedback?.kind === "notice" && <p className="inline-notice" role="status">{manualFeedback.message}</p>}
          {manualFeedback?.kind === "error" && (
            <InlineActionError
              title="手动投递失败"
              message={manualFeedback.message}
              solution="请核对收件邮箱和发信连接后重试；失败时不会显示为成功。"
              onRetry={openManualConfirmation}
              busy={manualBusy}
            />
          )}
        </div>
      </details>
      {!state.tasks.length ? (
        <Empty
          title="暂无投递记录"
          text="从匹配结果中勾选职位后，在确认页进入队列。"
        />
      ) : (
        <div className="task-list">
          {state.tasks.map((t: any) => (
            <article className="task" key={t.id}>
              <div>
                <b>{t.jobTitle || `任务 ${t.id.slice(-6)}`}</b>
                <span className={`status ${t.status.toLowerCase()}`}>
                  {statusText[t.status]}
                </span>
              </div>
              <p>
                {t.company && `${t.company} · `}
                {t.manualRecipientEmail
                  ? "用户确认的指定邮箱投递"
                  : t.adapter === "email"
                    ? "公开招聘邮箱投递"
                  : t.adapter === "mock"
                    ? "模拟投递"
                    : "需要在官方入口手动申请"}
              </p>
              <p>
                {t.errorSummary || t.history.at(-1)?.reason || "状态已更新"}
              </p>
              {t.status === "SUCCESS" && t.providerReference && (
                <p className="task-hint">邮件服务回执已保存；“成功”表示服务已接收请求，不代表对方已阅读或回复。</p>
              )}
              {failureHint(t) && <p className="task-hint">{failureHint(t)}</p>}
              {taskFailure?.id === t.id && (
                <InlineActionError
                  title="任务处理失败"
                  message={taskFailure?.message || "任务处理失败"}
                  solution="任务状态已保留。请先按上方提示检查，再决定是否重试。"
                  onRetry={() => void processTask(t, t.status !== "WAITING")}
                  busy={taskBusy === t.id}
                />
              )}
              {t.applicationUrl && t.adapter === "manual" && !t.applicationUrl.includes("example.com") && (
                <a href={t.applicationUrl} target="_blank" rel="noreferrer">
                  打开官方申请入口
                </a>
              )}
              {(["WAITING", "PROCESSING", "FAILED"].includes(t.status) || (t.adapter === "email" && t.status === "NEEDS_USER")) && (
                <div className="task-actions">
                  {t.status === "WAITING" && ["email", "mock"].includes(t.adapter) && (
                    <button
                      className="retry"
                      disabled={taskBusy === t.id}
                      onClick={() => void processTask(t, false)}
                    >
                      <span className="loading-label">
                        {taskBusy === t.id && <RefreshCw className="spin" />}
                        {taskBusy === t.id ? "正在发送…" : "继续发送"}
                      </span>
                    </button>
                  )}
                  {t.adapter === "email" && ["FAILED", "NEEDS_USER"].includes(t.status) && (
                    <button
                      className="retry"
                      disabled={taskBusy === t.id}
                      onClick={() => void processTask(t, true)}
                    >
                      <span className="loading-label">
                        {taskBusy === t.id && <RefreshCw className="spin" />}
                        {taskBusy === t.id ? "正在重试…" : "重试发送"}
                      </span>
                    </button>
                  )}
                  {t.status === "PROCESSING" && (
                    <button type="button" disabled>
                      <span className="loading-label"><RefreshCw className="spin" />正在处理中…</span>
                    </button>
                  )}
                  {["FAILED", "WAITING"].includes(t.status) && (
                    <button
                      disabled={taskBusy === t.id}
                      onClick={() => void switchToManual(t)}
                    >
                      转为手动处理
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function Nav({ path, go }: { path: string; go: (path: string) => void }) {
  const items = [
    [/^\/$/, "/", Home, "首页"],
    [/^\/matches/, "/matches", Search, "匹配"],
    [/^\/applications/, "/applications", Send, "投递"],
    [/^\/profile/, "/profile", User, "我的"],
  ] as any[];
  return (
    <nav className="bottom-nav">
      {items.map(([re, to, Icon, label]) => (
        <a
          key={to}
          className={re.test(path) ? "active" : ""}
          href={to}
          onClick={(event) => {
            event.preventDefault();
            go(to);
          }}
        >
          <Icon />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
function Back({ onClick }: { onClick: () => void }) {
  return (
    <button className="back" onClick={onClick}>
      <ArrowLeft /> 返回
    </button>
  );
}
function Empty({
  title,
  text,
  action,
  onClick,
}: {
  title: string;
  text?: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty">
      <AlertCircle />
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action && <button onClick={onClick}>{action}</button>}
    </div>
  );
}

function ImprovedResumeUpload({ go, reload }: { go: (path: string) => void; reload: any }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fileName, setFileName] = useState("");
  return (
    <section>
      <div className="eyebrow">第 1 步</div>
      <h1>上传你的简历</h1>
      <p className="muted">
        支持可复制文字的 PDF、DOCX 或 TXT，文件不超过 5MB。
      </p>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
          await request("/api/resume", {
            method: "POST",
            body: new FormData(event.currentTarget),
          });
          await reload();
          go("/onboarding/confirm");
          } catch (reason: any) {
            setError(reason.message);
            setBusy(false);
          }
        }}
      >
        <label className="upload">
          <input
            required
            name="file"
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(event) =>
              setFileName(event.target.files?.[0]?.name || "")
            }
          />
          <strong>{fileName || "选择简历文件"}</strong>
          <span>
            {fileName ? "已选择，点击下方按钮开始解析" : "文件仅保存在本机"}
          </span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || !fileName}>
          {busy ? "正在提取和解析…" : "上传并解析"}
        </button>
      </form>
    </section>
  );
}

function ConnectionSettings({ state, go }: { state: State; go: any }) {
  const sender = state.emailSender || {};
  const catalog = state.catalog || {};
  return (
    <section>
      <h1>我的</h1>
      <div className="detail-group">
        <h2>账户</h2>
        <p>{state.user.email}</p>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/invite", { method: "DELETE" });
            location.href = "/invite";
          }}
        >
          退出登录
        </button>
        <p className="muted">
          进站只使用共享访问密码。Gmail 身份通过官方授权验证；其他邮箱以输入的地址建立隔离账户。
        </p>
      </div>
      <div className="detail-group">
        <h2>当前简历</h2>
        <p>{state.resume?.fileName || "尚未上传"}</p>
        <button type="button" onClick={() => go("/onboarding/resume")}>
          {state.resume ? "上传新简历" : "上传简历"}
        </button>
        {state.resume && (
          <p className="muted">
            新简历确认后会成为当前版本；已有投递记录不会被删除。
          </p>
        )}
      </div>
      <div className="detail-group">
        <h2>岗位库</h2>
        <p className="muted">
          岗位由后台按计划从公开数据源更新；匹配时只读取岗位库，不会临时把你的简历发送给搜索服务。
        </p>
        <p>
          {catalog.configured ? `当前有 ${catalog.freshJobCount || 0} 个最新岗位` : "岗位库尚未配置"}
          {catalog.lastRefreshAt ? ` · 最近更新 ${new Date(catalog.lastRefreshAt).toLocaleString("zh-CN", { hour12: false })}` : ""}
        </p>
        {catalog.lastStatus === "failed" || catalog.lastStatus === "partial" ? (
          <p className="error" role="status">上次岗位库更新未全部完成，系统会继续按计划重试。</p>
        ) : null}
      </div>
      <div className="detail-group">
        <h2>发信方式</h2>
        {sender.kind === "gmail_api" ? (
          <>
            <p className="oauth-status">Gmail 已连接</p>
            <p className="muted">
              投递会从 <strong>{state.user.email}</strong> 直接发出，并保存在 Gmail 的“已发送”中，因此不会额外密送给自己。
            </p>
            <div className="oauth-connect">
              <a className="oauth-btn" href="/api/oauth/google/start">重新连接 Gmail</a>
            </div>
          </>
        ) : sender.kind === "resend" ? (
          <>
            <p className="oauth-status">平台统一代发，已就绪</p>
            <p className="muted">
              无需任何邮箱设置。企业回复会直接到 <strong>{state.user.email}</strong>；每封成功发送的完整邮件和附件也会密送一份到该邮箱，企业看不到密送地址。
            </p>
          </>
        ) : (
          <>
            <p className="error" role="alert">{sender.error || "发信服务暂不可用，请联系站点管理员"}</p>
            {state.loginProvider === "google" && (
              <div className="oauth-connect">
                <a className="oauth-btn" href="/api/oauth/google/start">重新连接 Gmail</a>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
