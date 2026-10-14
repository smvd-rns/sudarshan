import { NextRequest, NextResponse } from "next/server";

const RSD_ORIGIN = "https://radheshyamdas.com";

/**
 * Same-origin reverse proxy handler for Radheshyam Das website.
 * Serves the full pre-rendered HTML with CDN assets while stripping
 * client-side hydration scripts that fail when embedded cross-origin.
 * Rewrites internal links to stay on /rsd so Android Web APK never
 * triggers "external click blocked".
 */
export async function rsdProxyHandler(req: NextRequest, pathSegments: string[]) {
  const path = pathSegments.filter(Boolean).join("/");
  const searchParams = req.nextUrl.search;
  const targetUrl = `${RSD_ORIGIN}/${path}${searchParams}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "host") {
      headers.set("host", "radheshyamdas.com");
    } else if (lowerKey === "user-agent") {
      // Forward actual client user-agent so mobile devices receive mobile layout
      headers.set("user-agent", value || "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
    } else {
      headers.set(key, value);
    }
  });

  headers.set("origin", RSD_ORIGIN);
  headers.set("referer", `${RSD_ORIGIN}/`);

  const method = req.method;
  let body: any = null;
  if (method !== "GET" && method !== "HEAD") {
    try {
      body = await req.arrayBuffer();
    } catch {
      body = null;
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "follow",
    });

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Strip framing restrictions and compression headers
      if (
        lowerKey === "x-frame-options" ||
        lowerKey === "content-security-policy" ||
        lowerKey === "cross-origin-opener-policy" ||
        lowerKey === "content-encoding" ||
        lowerKey === "content-length"
      ) {
        return;
      }
      responseHeaders.set(key, value);
    });

    const contentType = responseHeaders.get("content-type") || "";

    if (contentType.toLowerCase().includes("text/html")) {
      let html = await response.text();

      // 1. Remove external client hydration scripts to avoid Next.js domain mismatch / error boundary crash,
      // but KEEP inline React streaming DOM placement scripts ($RS, $RC) so content is un-hidden
      html = html.replace(/<script\b[^>]*src=[^>]*><\/script>/gi, "");

      // Also ensure streaming content divs are never hidden even if scripts are blocked
      html = html.replaceAll('<div hidden id="S:', '<div id="S:');
      html = html.replaceAll('<div hidden="" id="S:', '<div id="S:');

      // 2. Direct all assets, fonts, CSS and images to canonical CDN
      html = html.replaceAll('href="/_next/', `href="${RSD_ORIGIN}/_next/`);
      html = html.replaceAll('src="/_next/', `src="${RSD_ORIGIN}/_next/`);
      html = html.replaceAll('src="/', `src="${RSD_ORIGIN}/`);
      html = html.replaceAll('url(/', `url(${RSD_ORIGIN}/`);
      html = html.replaceAll('url("/', `url("${RSD_ORIGIN}/`);
      html = html.replaceAll('url(\'/', `url(\'${RSD_ORIGIN}/`);

      // 3. Rewrite internal page links to stay within /rsd
      html = html.replaceAll('href="https://radheshyamdas.com/', 'href="/rsd/');
      html = html.replaceAll('href="https://www.radheshyamdas.com/', 'href="/rsd/');
      html = html.replaceAll('href="/"', 'href="/rsd"');
      html = html.replaceAll('href="/library', 'href="/rsd/library');
      html = html.replaceAll('href="/about', 'href="/rsd/about');
      html = html.replaceAll('href="/contact-us', 'href="/rsd/contact-us');
      html = html.replaceAll('href="/settings', 'href="/rsd/settings');
      html = html.replaceAll('href="/get-involved', 'href="/rsd/get-involved');
      html = html.replaceAll('/rsd/rsd', '/rsd');

      // 4. Inject custom CSS and meta to ensure smooth mobile responsive rendering
      const injectedHead = `
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
        <style>
          html, body { 
            width: 100% !important; 
            max-width: 100vw !important;
            overflow-x: hidden !important; 
            overflow-y: auto !important; 
            -webkit-overflow-scrolling: touch; 
          }
          div[hidden][id^="S:"] { display: block !important; visibility: visible !important; }
        </style>
      `;
      if (html.toLowerCase().includes("<head>")) {
        html = html.replace(/<head>/i, `<head>${injectedHead}`);
      } else if (html.toLowerCase().includes("<html")) {
        html = html.replace(/<html[^>]*>/i, `$&<head>${injectedHead}</head>`);
      }

      return new Response(html, {
        status: 200,
        headers: responseHeaders,
      });
    }

    return new Response(response.body ?? null, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error(`[RSD Proxy Error on /rsd/${path}]:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
