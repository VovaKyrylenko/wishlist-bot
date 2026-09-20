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
    const preview = await fetchLinkPreview(url);
    return { connected: fetchMock.mock.calls.length > 0, title: preview?.title ?? null };
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
    expect(await fetchLinkPreview("https://shop.example/p")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-checks every redirect hop", async () => {
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fetchMock.mockImplementation(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    expect(await fetchLinkPreview("https://shop.example/p")).toBeNull();
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
    expect(await fetchLinkPreview("https://shop.example/p")).toBeNull();
  });

  it("gives up on a redirect chain longer than the cap", async () => {
    publicName();
    let hops = 0;
    fetchMock.mockImplementation(async () => (++hops > 6 ? html() : redirectTo(`https://shop.example/${hops}`)));
    expect(await fetchLinkPreview("https://shop.example/start")).toBeNull();
  });

  it("follows a short chain of public redirects to the page", async () => {
    publicName();
    let hops = 0;
    fetchMock.mockImplementation(async () => (++hops > 2 ? html() : redirectTo(`https://shop.example/${hops}`)));
    expect(await fetchLinkPreview("https://shop.example/start")).toMatchObject({ title: "Ok" });
  });

  it("reads a normal public page", async () => {
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    fetchMock.mockImplementation(async () => html());
    expect(await fetchLinkPreview("https://shop.example/p")).toMatchObject({ title: "Ok", store: "shop.example" });
  });
});
