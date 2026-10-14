import { NextRequest, NextResponse } from "next/server";

const ERP_TARGET = "https://12.strategicerpcloud.com";

async function proxyHandler(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path: pathSegments } = await params;
  const path = pathSegments ? pathSegments.join("/") : "";
  const search = req.nextUrl.search;
  
  // Construct the target URL on Strategic ERP cloud
  const targetUrl = `${ERP_TARGET}/strategicerp/${path}${search}`;

  // Forward incoming headers, replacing Host and Origin
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "host") {
      headers.set("host", "12.strategicerpcloud.com");
    } else if (lowerKey === "origin") {
      headers.set("origin", ERP_TARGET);
    } else if (lowerKey === "referer") {
      headers.set("referer", `${ERP_TARGET}/strategicerp/`);
    } else {
      headers.set(key, value);
    }
  });

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
    const upstreamRes = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "manual", // Handle redirects manually so we can rewrite Location headers
    });

    const responseHeaders = new Headers();
    upstreamRes.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Remove framing restrictions
      if (
        lowerKey === "x-frame-options" ||
        lowerKey === "content-security-policy" ||
        lowerKey === "cross-origin-opener-policy" ||
        lowerKey === "content-encoding" ||
        lowerKey === "content-length"
      ) {
        return;
      }

      // Rewrite Location redirects to stay on the portal domain
      if (lowerKey === "location") {
        let location = value;
        if (location.includes("12.strategicerpcloud.com/strategicerp/")) {
          location = location.replace("https://12.strategicerpcloud.com/strategicerp/", "/strategicerp/");
          location = location.replace("http://12.strategicerpcloud.com/strategicerp/", "/strategicerp/");
        } else if (location.startsWith("/strategicerp/")) {
          // already relative to strategicerp
        } else if (location.startsWith("/")) {
          location = `/strategicerp${location}`;
        }
        responseHeaders.set("location", location);
        return;
      }

      // Rewrite Set-Cookie to be first-party on the portal domain
      if (lowerKey === "set-cookie") {
        // Next.js fetch headers may combine or handle set-cookie
        return;
      }

      responseHeaders.set(key, value);
    });

    // Handle Set-Cookie headers properly (can be multiple)
    // In standard fetch, getSetCookie() retrieves all cookies as an array
    const rawCookies = (upstreamRes.headers as any).getSetCookie 
      ? (upstreamRes.headers as any).getSetCookie() 
      : upstreamRes.headers.get("set-cookie") 
        ? [upstreamRes.headers.get("set-cookie")] 
        : [];

    for (const cookieStr of rawCookies) {
      if (!cookieStr) continue;
      // Remove any Domain=12.strategicerpcloud.com
      let rewritten = cookieStr.replace(/;\s*Domain=[^;]+/gi, "");
      // Ensure Path is /strategicerp
      if (!rewritten.toLowerCase().includes("path=")) {
        rewritten += "; Path=/strategicerp";
      }
      // Ensure SameSite=Lax so iframe inside same-origin accepts it
      if (rewritten.toLowerCase().includes("samesite=")) {
        rewritten = rewritten.replace(/;\s*SameSite=[^;]+/gi, "; SameSite=Lax");
      } else {
        rewritten += "; SameSite=Lax";
      }
      responseHeaders.append("set-cookie", rewritten);
    }

    const contentType = responseHeaders.get("content-type") || "";

    // For HTML responses, rewrite any hardcoded absolute links to strategicerpcloud.com
    if (contentType.toLowerCase().includes("text/html")) {
      let html = await upstreamRes.text();
      html = html.replaceAll("https://12.strategicerpcloud.com/strategicerp/", "/strategicerp/");
      html = html.replaceAll("http://12.strategicerpcloud.com/strategicerp/", "/strategicerp/");

      return new Response(html, {
        status: upstreamRes.status,
        statusText: upstreamRes.statusText,
        headers: responseHeaders,
      });
    }

    // Stream other assets (CSS, JS, images, AJAX JSON)
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error(`[Strategic ERP Proxy Error on /strategicerp/${path}]:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PUT = proxyHandler;
export const DELETE = proxyHandler;
export const OPTIONS = proxyHandler;
export const HEAD = proxyHandler;
