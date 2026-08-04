import { Context, EventSourceHooks } from "./hooks";

type Timeout = ReturnType<typeof setTimeout>;

export class FetchError extends Error {
    public statusCode: number;
    public status: number;
    public statusText: string;
    public response?: Response;
    constructor(statusCode: number, message: string, response?: Response) {
        super(`FetchError [${statusCode}]: ${message}`);
        this.name = "FetchError";
        this.statusCode = statusCode;
        this.status = statusCode;
        this.statusText = message;
        this.response = response;
    }
}

export interface FetchWithHooksOptions
    extends RequestInit, Omit<EventSourceHooks, "onMessage"> {
    fetch?: typeof globalThis.fetch;
    timeout?: number;
}

export async function fetchWithHooks(
    url: string,
    options: FetchWithHooksOptions,
): Promise<Response> {
    if (options.method) options.method = options.method.toUpperCase();
    const $fetch = options.fetch ?? fetch;
    let timeout: Timeout | undefined;
    const controller = new AbortController();
    const signal = options.signal;
    if (signal) {
        if (signal.aborted) {
            controller.abort(signal.reason);
        }
        signal.addEventListener("abort", () => {
            controller.abort(signal.reason);
        });
    }

    const context: Context = {
        options: options,
    };

    if (options.timeout) {
        timeout = setTimeout(() => {
            const error = new Error(`Timeout of ${options.timeout}ms exceeded`);
            error.name = "AbortError";
            controller.abort(error);
        }, options.timeout);
    }

    let req: Request;
    try {
        await options.onRequest?.(context as any);
        req = new Request(url, {
            ...context.options,
            signal: controller.signal,
        });
        context.request = req;
    } catch (err) {
        context.error = err instanceof Error ? err : new Error(`${err}`);
        if (timeout) clearTimeout(timeout);
        await options.onRequestError?.(context as any);
        throw context.error;
    }

    let response: Response;
    try {
        response = await $fetch(req, {
            ...context.options,
            signal: controller.signal,
        });
        if (timeout) clearTimeout(timeout);
        context.response = response;
        await options.onResponse?.(context as any);
    } catch (err) {
        context.error = err instanceof Error ? err : new Error(`${err}`);
        if (timeout) clearTimeout(timeout);
        await options.onRequestError?.(context as any);
        throw context.error;
    }
    if (!response.ok) {
        context.error = new FetchError(response.status, response.statusText);
        if (timeout) clearTimeout(timeout);
        await options.onResponseError?.(context as any);
        throw context.error;
    }
    return response;
}
