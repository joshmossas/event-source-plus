import { Context, EventSourceHooks } from "./hooks";

export class FetchError extends Error {
    constructor(statusCode: number, message: string) {
        super(`FetchError [${statusCode}]: ${message}`);
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
    let timeout: NodeJS.Timeout | undefined;
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

    let context: Context = {
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
