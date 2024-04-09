import {
    type FetchContext,
    type FetchOptions,
    type FetchResponse,
    ofetch,
} from "ofetch";
import { type SseMessage, getBytes, messageListFromString } from "./parse";
import { wait } from "./internal";

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
        options: ListenOptions,
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
        controller.__abortController.abort();
        controller.__abortController = new AbortController();
        await this._handleConnection(controller, options);
    }

    private async _handleConnection(
        controller: EventSourceController,
        options: ListenOptions,
    ): Promise<void> {
        const headers = this.options.headers ?? {};
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
            onRequest: options.onRequest,
            onRequestError: options.onRequestError,
            onResponse: async (context) => {
                if (typeof options.onResponse === "function") {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                    await options.onResponse(context as any);
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
                    if (typeof options.onResponseError === "function") {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                        options.onResponseError(context as any);
                    }
                    throw error;
                }
            },
            onResponseError: async (context) => {
                if (typeof options.onResponseError === "function") {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                    await options.onResponseError(context as any);
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
                    options.onMessage(message);
                }
            });
        } catch (_) {
            if (controller.signal.aborted) {
                return;
            }
            return this._handleRetry(controller, options);
        }
        if (controller.signal.aborted) {
            return;
        }
        return this._handleRetry(controller, options);
    }

    listen(options: ListenOptions): EventSourceController {
        const controller = new EventSourceController(new AbortController());
        void this._handleConnection(controller, options);
        return controller;
    }
}

export class EventSourceController {
    __abortController: AbortController;

    constructor(controller?: AbortController) {
        this.__abortController = controller ?? new AbortController();
    }

    abort() {
        this.__abortController.abort();
    }

    get signal() {
        return this.__abortController.signal;
    }
}

export interface EventSourcePlusOptions extends Omit<RequestInit, "method"> {
    method?: HttpMethod;
    headers?: Record<string, string>;
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

export interface ListenOptions {
    /**
     * Fires every time a new message is received
     */
    onMessage: (message: SseMessage) => any;
    /**
     * Fires when a new request has been opened.
     */
    onRequest?: (context: FetchContext<unknown, "stream">) => any;
    /**
     * Fires when a there was an error sending a request
     */
    onRequestError?: (
        context: FetchContext<unknown, "stream"> & { error: Error },
    ) => any;
    /**
     * Fires when receiving a response from the server
     */
    onResponse?: (
        context: FetchContext<any, "stream"> & {
            response: FetchResponse<"stream">;
        },
    ) => any;
    /**
     * Fires when the server has returned an error status code or the server doesn't return the expected content-type ("text/event-stream")
     */
    onResponseError?: (
        context: FetchContext<any, "stream"> & {
            response: FetchResponse<"stream">;
        },
    ) => any;
}
