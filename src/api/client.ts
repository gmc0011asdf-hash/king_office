import { authStorage } from '@/utils/authStorage';

/** Default API when `VITE_API_URL` is unset (e.g. Vite dev on :5173). */
export const DEFAULT_API_BASE_URL = "https://king-office.onrender.com";

/**
 * قاعدة الـ API للطلبات:
 * 1) `VITE_API_URL` وقت البناء (إلزامي إذا كانت الواجهة على نطاق/مضيف مختلف عن الـ API).
 * 2) أثناء التطوير على Vite (:5173/:5174) → `DEFAULT_API_BASE_URL` ما لم يُضبط غيره.
 * 3) نفس أصل المتصفح (للنشر الذي يُقدّم الواجهة والـ API من نفس الخدمة، مثلاً Render مع `dist` مدمج).
 *
 * إن فتحت في المتصفح رابط الـ API الخام وظهرت رسالة JSON من `/` فهذا طبيعي لخدمة API-only؛
 * الواجهة يجب أن تُفتح من مسار الـ SPA أو من خدمة static منفصلة مع `VITE_API_URL` صحيح.
 */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof envUrl === "string" && envUrl.trim() !== "") {
    return envUrl.trim().replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    const port = window.location.port;
    if (port === "5173" || port === "5174") {
      return DEFAULT_API_BASE_URL;
    }
    return window.location.origin;
  }
  return DEFAULT_API_BASE_URL;
}

/** يُستخدم عند فشل `fetch` (شبكة، CORS، إلخ) — ليس خطأ HTTP من الخادم. */
export const NETWORK_HTTP_STATUS = 0;

export class ApiRequestError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.data = data;
  }
}

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
};

export type TraceResult<T = unknown> = {
  ok: boolean;
  source: "database" | "local" | "unknown";
  action?: string;
  message: string;
  reason?: string;
  table?: string | null;
  column?: string | null;
  detail?: string;
  data?: T;
  trace: string[];
};

/** يعرض detail من FastAPI سواء كان نصاً أو مصفوفة أخطاء تحقق (422). */
function formatHttpErrorMessage(data: unknown, status: number): string {
  if (typeof data === "object" && data !== null && "__html_response" in (data as object)) {
    return `استجابة غير متوقعة (HTML وليس JSON، HTTP ${status}). غالباً عنوان الـ API (VITE_API_URL) يشير إلى خادم واجهة أو مسار خاطئ وليس إلى خادم Maktab Al-Malik API.`;
  }
  if (typeof data === "object" && data !== null && "detail" in data) {
    const d = (data as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((item) => {
          if (typeof item === "object" && item !== null) {
            const o = item as Record<string, unknown>;
            const loc = Array.isArray(o.loc) ? o.loc.join(".") : "";
            const msg = o.msg != null ? String(o.msg) : JSON.stringify(item);
            return loc ? `${loc}: ${msg}` : msg;
          }
          return String(item);
        })
        .join(" — ");
    }
    if (d != null) return String(d);
  }
  if (typeof data === "object" && data !== null && "message" in data) {
    const m = (data as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  if (typeof data === "string") {
    const t = data.trim();
    if (t.length > 400) return `${t.slice(0, 200)}… (${t.length} حرفاً) — استجابة غير متوقعة من الخادم (${status}).`;
    return t;
  }
  return "Request failed";
}

async function parseErrorBody(response: Response): Promise<unknown> {
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      /* fall through */
    }
  }
  if (/^<(!DOCTYPE|html)/i.test(trimmed)) {
    return { __html_response: true };
  }
  return text;
}

function buildUrl(path: string): string {
  const base = getApiBaseUrl();
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("/")) {
    return `${base}${path}`;
  }
  return `${base}/${path}`;
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

export async function fetchApi<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipAuth = false, headers, ...rest } = options;

  const token = !skipAuth ? authStorage.getToken?.() : null;

  const body = (rest as RequestInit).body;
  const hasJsonBody =
    body !== undefined &&
    body !== null &&
    body !== "" &&
    !(typeof FormData !== "undefined" && body instanceof FormData) &&
    !(typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) &&
    !(typeof Blob !== "undefined" && body instanceof Blob);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...rest,
      headers: {
        ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers || {}),
      },
    });
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    throw new ApiRequestError(
      `تعذر إتمام الطلب: لا اتصال بالخادم أو انقطع الاتصال. إن كان الخادم يعمل، قد يكون السبب CORS أو عنوان API خاطئ (${getApiBaseUrl()}). التفاصيل: ${cause}`,
      NETWORK_HTTP_STATUS,
      { kind: "network", cause: e },
    );
  }

  const data = response.ok ? await parseResponse(response) : await parseErrorBody(response);

  if (!response.ok) {
    const message = formatHttpErrorMessage(data, response.status);
    throw new ApiRequestError(message, response.status, data);
  }

  return data as T;
}

export async function fetchApiWithTrace<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<TraceResult<T>> {
  const trace: string[] = [];
  trace.push(`بدء الطلب: ${path}`);

  try {
    const { skipAuth = false, headers, ...rest } = options;
    const token = !skipAuth ? authStorage.getToken?.() : null;
    const url = buildUrl(path);

    const resolvedHeaders: Record<string, string> = {
      ...(headers as Record<string, string> | undefined),
    };

    const hasContentType = Object.keys(resolvedHeaders).some(
      (k) => k.toLowerCase() === "content-type",
    );
    const bodyAny: any = (rest as any).body;
    const isForm =
      typeof URLSearchParams !== "undefined" && bodyAny instanceof URLSearchParams;
    const isFormData =
      typeof FormData !== "undefined" && bodyAny instanceof FormData;

    if (!hasContentType && bodyAny != null && !isForm && !isFormData) {
      resolvedHeaders["Content-Type"] = "application/json";
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...rest,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...resolvedHeaders,
        },
      });
    } catch (e) {
      const cause = e instanceof Error ? e.message : String(e);
      trace.push(`فشل الشبكة/المتصفح: ${cause}`);
      return {
        ok: false,
        source: "unknown",
        message: `تعذر إتمام الطلب: لا اتصال بالخادم أو انقطع الاتصال. تحقق من الشبكة وعنوان الـ API (${getApiBaseUrl()}) وإعدادات CORS. (${cause})`,
        reason: cause,
        trace,
      };
    }

    trace.push(`تم استلام الرد: HTTP ${response.status}`);

    const payload = response.ok ? await parseResponse(response) : await parseErrorBody(response);
    const payloadAny: any = payload;

    if (!response.ok) {
      const httpMsg = formatHttpErrorMessage(payload, response.status);
      return {
        ok: false,
        source: (payloadAny?.source as any) || "database",
        action: payloadAny?.action,
        message: payloadAny?.message && typeof payloadAny.message === "string" ? payloadAny.message : httpMsg,
        reason: payloadAny?.reason || httpMsg,
        table: payloadAny?.table ?? null,
        column: payloadAny?.column ?? null,
        detail:
          payloadAny?.detail != null
            ? typeof payloadAny.detail === "string"
              ? payloadAny.detail
              : httpMsg
            : httpMsg,
        trace,
      };
    }

    // If backend already returns a TraceResult-like object, normalize it.
    // Do not use `"data" in payload` alone — many entities could include a `data` field and would break create flows.
    if (
      typeof payload === "object" &&
      payload !== null &&
      ("ok" in (payload as any) || "trace" in (payload as any))
    ) {
      return {
        ok: (payloadAny?.ok ?? true) as boolean,
        source: (payloadAny?.source as any) || "database",
        action: payloadAny?.action,
        message: payloadAny?.message || "تمت العملية بنجاح",
        reason: payloadAny?.reason,
        table: payloadAny?.table ?? null,
        column: payloadAny?.column ?? null,
        detail: payloadAny?.detail,
        data: (payloadAny?.data ?? payload) as T,
        trace: Array.isArray(payloadAny?.trace) ? payloadAny.trace : trace,
      };
    }

    return {
      ok: true,
      source: "database",
      message: "تمت العملية بنجاح",
      data: payload as T,
      trace,
    };
  } catch (err: any) {
    trace.push(`خطأ غير متوقع: ${err?.message || "Unknown error"}`);
    return {
      ok: false,
      source: "unknown",
      message:
        err instanceof Error
          ? `فشل تنفيذ الطلب: ${err.message}`
          : String(err ?? "خطأ غير معروف"),
      reason: err?.message || "Unknown error",
      trace,
    };
  }
}

export const apiClient = {
  fetchApi,
  fetchApiWithTrace,
};