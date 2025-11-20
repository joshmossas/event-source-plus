import {
    $Fetch,
    createFetch,
    Fetch,
    type FetchContext,
    FetchError,
    type FetchOptions,
    type FetchResponse,
    ofetch,
} from "ofetch";

import { wait } from "./internal";
import { getBytes, messageListFromString, type SseMessage } from "./parse";

export const EventStreamContentType = "text/event-stream";
const LastEventIdHeader = "last-event-id";

export class EventSourcePlus {
    url: string;

    lastEventId: string | undefined;

    options: EventSourcePlusOptions;

    retryCount = 0;

    retryInterval = 0;

    maxRetryCount: number | undefined;

    maxRetryInterval: number;

    fetch: $Fetch;

    timeoutDurationMs: number | undefined;
    timeout: any;

    constructor(url: string, options: EventSourcePlusOptions = {}) {
        this.url = url;
        this.options = options;
        this.maxRetryCount = options.maxRetryCount;
        this.maxRetryInterval = options.maxRetryInterval ?? 30000;
        this.fetch = createFetch({ fetch: options.fetch }) ?? ofetch;
        this.timeoutDurationMs = options.timeout;
    }

    private async _handleRetry(
        controller: EventSourceController,
        hooks: EventSourceHooks,
    ) {
        this.retryCount++;
        if (
            typeof this.maxRetryCount === "number" &&
            this.retryCount >= this.maxRetryCount
        ) {
            controller._emitEvent({
                type: "error",
                reason: "max retry count reached",
            });
            return;
        }
        if (this.retryInterval === 0) {
            this.retryInterval = 2;
        } else if (this.retryInterval > 0) {
            this.retryInterval = this.retryInterval * 2;
            if (this.retryInterval >= this.maxRetryInterval) {
                this.retryInterval = this.maxRetryInterval;
            }
        }
        await wait(this.retryInterval);
        controller._abortController.abort();
        controller._abortController = new AbortController();
        await this._handleConnection(controller, hooks);
    }

    private async _handleConnection(
        controller: EventSourceController,
        hooks: EventSourceHooks,
    ): Promise<void> {
        let headers: Headers;
        const abortSignal = controller._abortController.signal;
        if (typeof this.options.headers === "function") {
            const result = this.options.headers();
            if ("then" in result && typeof result.then === "function") {
                headers = new Headers(
                    (await result.then((data) => data)) as Record<
                        string,
                        string
                    >,
                );
            } else {
                headers = new Headers(result as Record<string, string>);
            }
        } else {
            headers = new Headers(
                (this.options.headers as Record<string, string>) ?? {},
            );
        }
        if (typeof headers.get("accept") !== "string") {
            headers.set("accept", EventStreamContentType);
        }
        if (typeof this.lastEventId === "string") {
            headers.set(LastEventIdHeader, this.lastEventId);
        }
        let ctx: OnResponseContext | undefined;
        const finalOptions: FetchOptions<"stream"> = {
            ...this.options,
            method: this.options.method ?? "get",
            responseType: "stream",
            headers,
            signal: abortSignal,
            retry: false,
            onRequest: (context) => {
                if (controller.signal.aborted || abortSignal.aborted) return;
                if (isAbortError(context.error)) return;
                return hooks.onRequest?.(context);
            },
            onRequestError: async (context) => {
                if (controller.signal.aborted || abortSignal.aborted) return;
                if (isAbortError(context.error)) return;
                return hooks.onRequestError?.(context);
            },
            onResponse: async (context) => {
                ctx = context;
                return _handleResponse(context as OnResponseContext, hooks);
            },
            onResponseError: async (context) => {
                if (abortSignal.aborted) return;
                if (isAbortError(context.error)) return;
                if (typeof context.error === "undefined") {
                    context.error = new FetchError(
                        `${context.response.status} ${context.response.statusText}`,
                    );
                }
                await hooks.onResponseError?.(context);
                throw context.error;
            },
        };
        try {
            if (this.timeoutDurationMs) {
                this.timeout = setTimeout(() => {
                    controller._emitEvent({
                        type: "error",
                        reason: `Timeout of ${this.timeoutDurationMs}ms exceeded`,
                    });
                }, this.timeoutDurationMs);
            }
            const response = await this.fetch.raw(this.url, finalOptions);
            clearTimeout(this.timeout);
            this.timeout = undefined;
            this.retryCount = 0;
            this.retryInterval = 0;
            const decoder = new TextDecoder();
            let pendingData = "";
            const stream = response.body;
            if (!stream) {
                const error = new Error(
                    `Expected response body to contain ReadableStream`,
                );
                ctx!.response = response;
                ctx!.error = error;
                await hooks.onResponseError?.(ctx! as OnResponseErrorContext);
                throw error;
            }
            await getBytes(controller, stream, (arr) => {
                const text =
                    pendingData + decoder.decode(arr, { stream: true });
                const result = messageListFromString(text);
                pendingData = result.leftoverData ?? "";
                for (const message of result.messages) {
                    if (
                        typeof message.id === "string" &&
                        message.id.length > 0
                    ) {
                        this.lastEventId = message.id;
                    }
                    hooks.onMessage(message);
                }
            });
        } catch (err) {
            if (
                abortSignal.aborted ||
                controller.signal.aborted ||
                isAbortError(err)
            ) {
                return;
            }
            return this._handleRetry(controller, hooks);
        }
        if (controller.signal.aborted || abortSignal.aborted) {
            return;
        }
        if (this.options.retryStrategy === "on-error") {
            controller._emitEvent({
                type: "end-of-stream",
                reason: "Stream has ended",
            });
            return;
        }
        return this._handleRetry(controller, hooks);
    }

    listen(hooks: EventSourceHooks): EventSourceController {
        const controller = new EventSourceController(
            new AbortController(),
            (newHooks) => {
                if (typeof newHooks === "undefined") {
                    void this._handleConnection(controller, hooks);
                    return;
                }
                void this._handleConnection(controller, {
                    ...hooks,
                    ...newHooks,
                });
            },
        );
        void this._handleConnection(controller, hooks);
        return controller;
    }
}

function isAbortError(input: unknown) {
    return input instanceof DOMException && input.name === "AbortError";
}

export type EventSourcePlusAbortEvent = {
    /**
     * "manual" - controller.abort() was manually called by the user
     *
     * "end-of-stream" - request was aborted because the stream from the server is ended ("on-error" retry strategy only)
     *
     * "error" - request was aborted because of an error
     */
    type: "manual" | "end-of-stream" | "error";
    reason?: string;
};

export class EventSourceController {
    didAbort = false;

    /**
     * Do not modify. For internal use.
     */
    _abortController: AbortController;
    private _connect?: (hooks?: EventSourceHooks) => Promise<void> | void;

    constructor(
        controller?: AbortController,
        connect?: (hooks?: EventSourceHooks) => Promise<void> | void,
    ) {
        this._abortController = controller ?? new AbortController();
        this._connect = connect;
    }

    abort(reason?: string) {
        this._emitEvent({ type: "manual", reason: reason });
    }

    reconnect(hooks?: EventSourceHooks) {
        this.didAbort = false;
        this._abortController.abort();
        this._abortController = new AbortController();
        void this._connect?.(hooks);
    }

    private _abortHook?: (event: EventSourcePlusAbortEvent) => any;

    _emitEvent(e: EventSourcePlusAbortEvent) {
        if (this.didAbort) return;
        this.didAbort = true;
        this._abortHook?.(e);
        this._abortController.abort(e.reason);
    }

    onAbort(fn: (event: EventSourcePlusAbortEvent) => any) {
        this._abortHook = fn;
    }

    get signal() {
        return this._abortController.signal;
    }
}

type HeaderMap = Record<string, string | undefined>;

export interface EventSourcePlusOptions
    extends Omit<RequestInit, "method" | "headers"> {
    /**
     * The request http method
     *
     * (Default is `"get"`)
     */
    method?: HttpMethod;
    /**
     * Headers to be included in the http request, or a function returning headers.
     */
    headers?: HeaderMap | (() => HeaderMap | Promise<HeaderMap>);
    /**
     * Custom fetch implementation if you want to override
     */
    fetch?: Fetch;
    /**
     * Max number of times EventSourcePlus will attempt to retry connecting. Will retry indefinitely when set to `undefined`. The retry count gets reset after successfully connecting.
     *
     * (Default is `undefined`)
     */
    maxRetryCount?: number;
    /**
     * Max retry wait time in MS.
     *
     * Exponential backend will keep increasing the wait interval until this is reached.
     *
     * (Default is 30000)
     */
    maxRetryInterval?: number;
    /**
     * @beta
     * Set the client retry strategy.
     *
     * - `always` - The client will always attempt to reopen the connection after it has been closed. Recommended for realtime applications. (Default)
     * - `on-error` - The client will only attempt to reconnect if it received an error response. Useful for short lived text streams.
     *
     * @default "always"
     */
    retryStrategy?: "always" | "on-error";
    /**
     * Set a duration in milliseconds to expect the server to start sending a response
     */
    timeout?: number;
}

export const HTTP_METHOD_VALS = [
    "get",
    "head",
    "post",
    "put",
    "delete",
    "connect",
    "options",
    "trace",
    "patch",
] as const;
export type HttpMethod = (typeof HTTP_METHOD_VALS)[number];

export interface EventSourceHooks {
    /**
     * Fires every time a new message is received
     */
    onMessage: (message: SseMessage) => any;
    /**
     * Fires when a new request has been created.
     */
    onRequest?: (context: OnRequestContext) => any;
    /**
     * Fires when a there was an error sending a request
     */
    onRequestError?: (context: OnRequestErrorContext) => any;
    /**
     * Fires when receiving a response from the server
     */
    onResponse?: (context: OnResponseContext) => any;
    /**
     * Fires when the server has returned an error status code or the server doesn't return the expected content-type ("text/event-stream")
     */
    onResponseError?: (context: OnResponseErrorContext) => any;
}

export type OnRequestContext = FetchContext<unknown>;
export type OnRequestErrorContext = FetchContext<unknown> & {
    error: Error;
};
export type OnResponseContext = FetchContext<unknown> & {
    response: FetchResponse<any>;
};
export type OnResponseErrorContext = FetchContext<any> & {
    response: FetchResponse<any>;
};

export async function _handleResponse(
    context: OnResponseContext,
    hooks: EventSourceHooks,
) {
    if (typeof hooks.onResponse === "function") {
        await hooks.onResponse(context as OnResponseContext);
    }

    if (!context.response.ok) {
        // do nothing. ofetch will trigger the onResponseError hook
        return;
    }

    // emit an error if we don't receive the expected `text/event-stream` content-type
    const contentType = context.response.headers.get("Content-Type");
    if (
        typeof contentType !== "string" ||
        !contentType.includes(EventStreamContentType)
    ) {
        const error = new Error(
            `Expected server to response with Content-Type: '${EventStreamContentType}'. Got '${contentType}'`,
        );
        context.error = error;
        if (typeof hooks.onResponseError === "function") {
            await hooks.onResponseError(context as OnResponseErrorContext);
        }
        throw error;
    }
}
