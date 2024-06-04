import {
    type FetchContext,
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

    constructor(
        url: string,
        options: EventSourcePlusOptions = {
            method: "get",
            headers: {},
        },
    ) {
        this.url = url;
        this.options = options;
        this.maxRetryCount = options.maxRetryCount;
        this.maxRetryInterval = options.maxRetryInterval ?? 30000;
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
        let headers: Record<string, string> = {};
        if (typeof this.options.headers === "function") {
            const result = this.options.headers();
            if ("then" in result && typeof result.then === "function") {
                headers = (await result.then((data) => data)) as Record<
                    string,
                    string
                >;
            } else {
                headers = result as Record<string, string>;
            }
        } else {
            headers = (this.options.headers as Record<string, string>) ?? {};
        }
        if (typeof headers.accept !== "string") {
            headers.accept = EventStreamContentType;
        }
        if (
            typeof this.lastEventId === "string" &&
            typeof headers[LastEventIdHeader] !== "string"
        ) {
            headers[LastEventIdHeader] = this.lastEventId;
        }

        const finalOptions: FetchOptions<"stream"> = {
            ...this.options,
            method: this.options.method ?? "get",
            responseType: "stream",
            headers,
            signal: controller.signal,
            retry: false,
            onRequest: hooks.onRequest,
            onRequestError: hooks.onRequestError,
            onResponse: async (context) => {
                if (typeof hooks.onResponse === "function") {
                    await hooks.onResponse(context as OnResponseContext);
                }
                const contentType =
                    context.response.headers.get("Content-Type");
                if (
                    typeof contentType === "string" &&
                    !contentType.includes(EventStreamContentType)
                ) {
                    const error = new Error(
                        `Expected server to response with Content-Type: '${EventStreamContentType}'. Got '${contentType}'`,
                    );
                    context.error = error;
                    if (typeof hooks.onResponseError === "function") {
                        hooks.onResponseError(
                            context as OnResponseErrorContext,
                        );
                    }
                    throw error;
                }
            },
            onResponseError: async (context) => {
                if (typeof hooks.onResponseError === "function") {
                    await hooks.onResponseError(
                        context as OnResponseErrorContext,
                    );
                }
                if (context.error instanceof Error) {
                    throw context.error;
                }
                throw new Error(
                    `Received { STATUS_CODE: ${context.response.status} STATUS_TEXT: ${context.response.statusText} }`,
                );
            },
        };
        try {
            const result = await ofetch(this.url, finalOptions);
            this.retryCount = 0;
            this.retryInterval = 0;
            const decoder = new TextDecoder();
            let pendingData = "";
            await getBytes(controller, result, (arr) => {
                const text = pendingData + decoder.decode(arr);
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
        } catch (_) {
            if (controller.signal.aborted) {
                return;
            }
            return this._handleRetry(controller, hooks);
        }
        if (controller.signal.aborted) {
            return;
        }
        return this._handleRetry(controller, hooks);
    }

    listen(options: EventSourceHooks): EventSourceController {
        const controller = new EventSourceController(new AbortController());
        void this._handleConnection(controller, options);
        return controller;
    }
}

export class EventSourceController {
    /**
     * Do not modify. For internal use.
     */
    _abortController: AbortController;

    constructor(controller?: AbortController) {
        this._abortController = controller ?? new AbortController();
    }

    abort(reason?: string) {
        this._abortController.abort(reason);
    }

    get signal() {
        return this._abortController.signal;
    }
}

type HeaderMap = Record<string, string | undefined>;

export interface EventSourcePlusOptions
    extends Omit<RequestInit, "method" | "headers"> {
    method?: HttpMethod;
    headers?: HeaderMap | (() => HeaderMap | Promise<HeaderMap>);
    maxRetryCount?: number;
    /**
     * Max retry wait time in MS.
     *
     * Exponential backend will keep increasing the wait interval until this is reached.
     *
     * (Default is 30000)
     */
    maxRetryInterval?: number;
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

export type OnRequestContext = FetchContext<unknown, "stream">;
export type OnRequestErrorContext = FetchContext<unknown, "stream"> & {
    error: Error;
};
export type OnResponseContext = FetchContext<unknown, "stream"> & {
    response: FetchResponse<"stream">;
};
export type OnResponseErrorContext = FetchContext<any, "stream"> & {
    response: FetchResponse<"stream">;
};
