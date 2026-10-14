import { NextRequest, NextResponse } from "next/server";

const RSD_ORIGIN = "https://radheshyamdas.com";

/**
 * Reverse proxy handler for Radheshyam Das website.
 * Serves the full pre-rendered HTML with CDN assets while stripping
 * client-side hydration scripts that fail when embedded cross-origin.
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
      // Send desktop user agent so backend serves full desktop layout
      headers.set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
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

      // 1. Remove client hydration scripts to avoid Next.js domain mismatch / error boundary crash
      html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

      // 2. Direct all assets, fonts, CSS and images to canonical CDN
      html = html.replaceAll('href="/_next/', `href="${RSD_ORIGIN}/_next/`);
      html = html.replaceAll('src="/_next/', `src="${RSD_ORIGIN}/_next/`);
      html = html.replaceAll('href="/', `href="${RSD_ORIGIN}/`);
      html = html.replaceAll('src="/', `src="${RSD_ORIGIN}/`);
      html = html.replaceAll('url(/', `url(${RSD_ORIGIN}/`);
      html = html.replaceAll('url("/', `url("${RSD_ORIGIN}/`);
      html = html.replaceAll('url(\'/', `url(\'${RSD_ORIGIN}/`);

      // 3. Add base tag so links open externally
      const baseTag = `<base href="${RSD_ORIGIN}/" target="_blank">`;
      if (html.toLowerCase().includes("<head>")) {
        html = html.replace(/<head>/i, `<head>${baseTag}`);
      } else if (html.toLowerCase().includes("<html")) {
        html = html.replace(/<html[^>]*>/i, `$&<head>${baseTag}</head>`);
      } else {
        html = `<head>${baseTag}</head>` + html;
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
