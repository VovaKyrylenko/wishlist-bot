import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the public functions are exercised, and nothing here asserts the price
// format: the price rules are being rewritten and are pinned by their own
// fixtures (`verify:scrape`) once those land.
const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => dns);

import { fetchLinkPreview, parseLinkPreview } from "./scrape.js";

const page = (head: string) => `<!doctype html><html><head>${head}</head><body></body></html>`;
const parse = (head: string, url = "https://www.shop.example/p/1") => parseLinkPreview(page(head), new URL(url));

describe("parseLinkPreview", () => {
  it("takes the title from og:title", () => {
    expect(parse(`<meta property="og:title" content="Навушники"><title>Other</title>`)?.title).toBe("Навушники");
  });

  it("falls back to <title>", () => {
    expect(parse(`<title>  Навушники  </title>`)?.title).toBe("Навушники");
  });

  it("resolves a site-relative og:image against the final URL", () => {
    const preview = parse(`<meta property="og:title" content="A"><meta property="og:image" content="/img/a.jpg">`, "https://www.shop.example/p/1");
    expect(preview?.imageUrl).toBe("https://www.shop.example/img/a.jpg");
  });

  it("drops an image Telegram cannot fetch but keeps the card", () => {
    const preview = parse(`<meta property="og:title" content="A"><meta property="og:image" content="javascript:alert(1)">`);
    expect(preview?.imageUrl).toBeNull();
    expect(preview?.title).toBe("A");
  });

  it("names the store after og:site_name, else the host without www", () => {
    expect(parse(`<meta property="og:title" content="A"><meta property="og:site_name" content="Мій магазин">`)?.store).toBe("Мій магазин");
    expect(parse(`<meta property="og:title" content="A">`)?.store).toBe("shop.example");
  });

  it("returns null for a page with nothing to show", () => {
    expect(parse(``)).toBeNull();
  });
});

describe("fetchLinkPreview - a pasted link must never make the server call inward", () => {
  const html = () =>
    new Response(page(`<meta property="og:title" content="Ok">`), { headers: { "content-type": "text/html" } });
  const fetchMock = vi.fn();

  // What one link did: did the server connect, and what came back. Every
  // address test compares against this one shape, so a test that forgot to
  // install the fetch stub cannot pass as "blocked": the allow-list rows below
  // would then read connected:false too and go red.
  const probe = async (url: string) => {
    fetchMock.mockClear();
    const result = await fetchLinkPreview(url);
    return { connected: fetchMock.mock.calls.length > 0, title: result.kind === "card" ? result.preview.title : null };
  };
  const BLOCKED = { connected: false, title: null };
  const REACHED = { connected: true, title: "Ok" };

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => html());
    dns.lookup.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // NOT covered by this guard, on purpose or not yet: DNS rebinding (the name is resolved
  // here and again by fetch(), so a hostile resolver can answer differently the second
  // time; see assertPublicUrl), Teredo (2001::/32) and other tunnel prefixes, deprecated
  // fec0::/10 and IPv6 multicast, and no pinning of the connected IP.
  it.each([
    "http://127.0.0.1/", "http://0.0.0.0/", "http://10.1.2.3/", "http://172.16.0.1/", "http://172.31.255.255/",
    "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/", "http://100.64.0.1/", "http://198.18.0.1/",
    "http://224.0.0.1/", "http://255.255.255.255/", "http://[::1]/", "http://[::]/", "http://[fe80::1]/", "http://[fd12::1]/",
    "http://198.19.255.255/", "http://100.127.255.255/", "http://2130706433/", "http://0x7f.1/", "file:///etc/passwd", "ftp://example.com/",
    // IPv6 spellings of an IPv4 address. new URL() rewrites the dotted tail to hex
    // (http://[::ffff:169.254.169.254]/ -> hostname ::ffff:a9fe:a9fe), so the guard
    // has to compare numbers; a text pattern for one spelling misses the others.
    "http://[::ffff:169.254.169.254]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:10.0.0.1]/", "http://[::ffff:172.16.0.1]/",
    "http://[::127.0.0.1]/", "http://[::2]/", "http://[::ffff:0:127.0.0.1]/", "http://[::ffff:0:169.254.169.254]/",
    "http://[64:ff9b::127.0.0.1]/", "http://[64:ff9b::169.254.169.254]/", "http://[64:ff9b:1::1]/",
    "http://[2002:7f00:1::]/", "http://[2002:a9fe:a9fe::1]/", "http://[febf::1]/", "http://[fc00::1]/",
  ])("refuses %s without contacting it", async (url) => {
    expect(await probe(url)).toEqual(BLOCKED);
  });

  it.each([
    "http://172.15.0.1/", "http://172.32.0.1/", "http://100.63.0.1/", "http://100.128.0.1/", "http://198.17.255.255/", "http://198.20.0.1/", "http://223.255.255.255/", "http://93.184.216.34/",
    "http://[2001:4860:4860::8888]/", "http://[2606:4700:4700::1111]/", "http://[::ffff:8.8.8.8]/", "http://[::ffff:172.15.0.1]/",
    "http://[64:ff9b::8.8.8.8]/", "http://[2002:808:808::1]/",
  ])("still allows the public address %s", async (url) => {
    expect(await probe(url)).toEqual(REACHED);
  });

  it("refuses a public name that resolves to a private address", async () => {
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.7", family: 4 }]);
    expect(await fetchLinkPreview("https://shop.example/p")).toEqual({ kind: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-checks every redirect hop", async () => {
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fetchMock.mockImplementation(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    expect(await fetchLinkPreview("https://shop.example/p")).toEqual({ kind: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // A fetch that behaves like the real one. Real fetch follows redirects itself unless it is
  // told `redirect: "manual"`, so anything else (a different value, or no option at all)
  // lands on the final page without the guard seeing that hop, while "manual" hands back the
  // 302. Only then does deleting the option, not just changing it, fail a test.
  const publicName = () => dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  const redirectTo = (location: string) => new Response(null, { status: 302, headers: { location } });

  it("never lets fetch follow a redirect on its own", async () => {
    publicName();
    fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) =>
      init?.redirect === "manual" ? redirectTo("http://169.254.169.254/") : html(),
    );
    expect(await fetchLinkPreview("https://shop.example/p")).toEqual({ kind: "failed" });
  });

  it("gives up on a redirect chain longer than the cap", async () => {
    publicName();
    let hops = 0;
    fetchMock.mockImplementation(async () => (++hops > 6 ? html() : redirectTo(`https://shop.example/${hops}`)));
    expect(await fetchLinkPreview("https://shop.example/start")).toEqual({ kind: "failed" });
  });

  it("follows a short chain of public redirects to the page", async () => {
    publicName();
    let hops = 0;
    fetchMock.mockImplementation(async () => (++hops > 2 ? html() : redirectTo(`https://shop.example/${hops}`)));
    expect(await fetchLinkPreview("https://shop.example/start")).toMatchObject({ kind: "card", preview: { title: "Ok" } });
  });

  it("reads a normal public page", async () => {
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fetchMock.mockImplementation(async () => html());
    expect(await fetchLinkPreview("https://shop.example/p")).toMatchObject({
      kind: "card",
      preview: { title: "Ok", store: "shop.example" },
    });
  });
});

describe("fetchLinkPreview - a wall is not a page (#20)", () => {
  const fetchMock = vi.fn();
  const SHOP = "https://shop.example/p/1";
  const reply = (body: ConstructorParameters<typeof Response>[0], status: number, headers: Record<string, string> = {}) =>
    new Response(body, { status, headers });
  /** A body whose cancel() we can see, to prove early returns release the socket. */
  const watched = () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ pull: (c) => c.enqueue(new TextEncoder().encode("x".repeat(1024))), cancel });
    return { body, cancel };
  };

  beforeEach(() => {
    fetchMock.mockReset();
    dns.lookup.mockReset();
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it.each([
    ["Cloudflare's challenge", reply("<html><title>Just a moment...</title></html>", 403, { "cf-mitigated": "challenge", "content-type": "text/html" }), "cloudflare", 403],
    ["AWS WAF's empty 202 (makeup.com.ua)", reply("", 202, { "x-amzn-waf-action": "challenge", "content-type": "text/html" }), "aws-waf", 202],
    ["a bare 403 (olx.ua's CloudFront wall)", reply("<html>ERROR</html>", 403, { "content-type": "text/html" }), "status", 403],
    ["a 200 with an empty HTML body", reply("", 200, { "content-type": "text/html" }), "empty", 200],
    ["a 200 with only whitespace and a BOM", reply("﻿  \n\t", 200, { "content-type": "text/html" }), "empty", 200],
    ["a 204", reply(null, 204), "empty", 204],
    ["an empty 200 that is not called HTML", reply("", 200, { "content-type": "text/plain" }), "empty", 200],
  ])("reports %s as blocked", async (_name, response, by, status) => {
    fetchMock.mockResolvedValue(response);
    expect(await fetchLinkPreview(SHOP)).toEqual({ kind: "blocked", host: "shop.example", by, status });
  });

  it.each([
    ["404", reply("<html>Not found</html>", 404, { "content-type": "text/html" })],
    ["429 — rate limiting is not a wall", reply("slow down", 429, { "content-type": "text/html" })],
    ["503 — a shop that is down is not a wall", reply("maintenance", 503, { "content-type": "text/html", "retry-after": "30" })],
    ["a non-HTML file with a body", reply("%PDF-1.7", 200, { "content-type": "application/pdf" })],
  ])("reports %s as failed", async (_name, response) => {
    fetchMock.mockResolvedValue(response);
    expect(await fetchLinkPreview(SHOP)).toEqual({ kind: "failed" });
  });

  // Accepted in phase 1 (design log OBJ-8): the person sees the same outcome, and
  // the one known wall of this shape carries x-amzn-waf-action and is caught first.
  it("reports a body that breaks off mid-read as failed, not blocked", async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("<html><head><title>A"));
        c.error(new Error("socket reset"));
      },
    });
    fetchMock.mockResolvedValue(reply(body, 200, { "content-type": "text/html" }));
    expect(await fetchLinkPreview(SHOP)).toEqual({ kind: "failed" });
  });

  it.each([
    ["a wall", 403, { "cf-mitigated": "challenge" }],
    ["a 404", 404, {}],
    ["a redirect with no Location", 302, {}],
  ])("releases the body of %s instead of leaving the socket open", async (_name, status, headers) => {
    const { body, cancel } = watched();
    fetchMock.mockResolvedValue(new Response(body, { status, headers }));
    await fetchLinkPreview(SHOP);
    expect(cancel).toHaveBeenCalled();
  });

  it("logs each wall once with the host, never the path", async () => {
    fetchMock.mockResolvedValue(reply("", 403, { "cf-mitigated": "challenge" }));
    await fetchLinkPreview("https://shop.example/p/secret-gift?for=mom");
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith("scrape: blocked", "shop.example", "cloudflare", 403);
  });

  it("asks like a browser, not like a bot", async () => {
    fetchMock.mockResolvedValue(reply("<html><head><title>Ok</title></head><body>Ok</body></html>", 200, { "content-type": "text/html" }));
    await fetchLinkPreview(SHOP);
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/Chrome\/\d+/);
    expect(headers["User-Agent"]).not.toMatch(/bot/i);
    expect(headers["Accept-Language"]).toMatch(/^uk-UA/);
    // Node rewrites sec-fetch-mode, so none of that group is sent (design log OBJ-4).
    expect(Object.keys(headers).some((name) => name.toLowerCase().startsWith("sec-fetch"))).toBe(false);
  });

  describe("the model and an empty page", () => {
    const modelSays = Response.json({
      choices: [{ message: { content: '{"name":"Made-up Gift","price":"4999","currency":"UAH","description":null,"image":null}' } }],
    });
    const route = (page: string) => async (url: unknown) =>
      String(url).includes("ai-gateway") ? modelSays.clone() : reply(page, 200, { "content-type": "text/html" });
    const gatewayCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("ai-gateway")).length;

    it("is never asked about a page with no visible text; the markup alone decides", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      fetchMock.mockImplementation(route(`<html><head><meta property="og:title" content="Крем для рук"></head><body><div id="app"></div></body></html>`));
      const result = await fetchLinkPreview(SHOP);
      expect(gatewayCalls()).toBe(0);
      expect(result).toMatchObject({ kind: "card", preview: { title: "Крем для рук", price: null } });
    });

    it("is still asked about a page that has text (the gate is not vacuous)", async () => {
      process.env.AI_GATEWAY_API_KEY = "test-key";
      fetchMock.mockImplementation(route(`<html><head><title>Shop</title></head><body><h1>Made-up Gift</h1></body></html>`));
      await fetchLinkPreview(SHOP);
      expect(gatewayCalls()).toBe(1);
    });
  });
});
