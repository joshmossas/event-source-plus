import {
    type FetchContext,
    type FetchOptions,
    type FetchResponse,
    ofetch,
} from "ofetch";
import { type SseMessage, getBytes, messageListFromString } from "./parse";

export const EventStreamContentType = "text/event-stream";
const LastEventIdHeader = "last-event-id";

interface EventSourceConnectOptions {
    onMessage: (message: SseMessage) => any;
    onRequest?: (context: FetchContext<unknown, "stream">) => any;
    onRequestError?: (
        context: FetchContext<unknown, "stream"> & { error: Error },
    ) => any;
    onResponse?: (
        context: FetchContext<any, "stream"> & {
            response: FetchResponse<"stream">;
        },
    ) => any;
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

export interface EventSourceOptions extends Omit<RequestInit, "method"> {
    method?: HttpMethod;
    headers?: Record<string, string>;
    /**
     * Max retry wait time in MS.
     *
     * Exponential backend will keep increasing the wait interval until this is reached.
     *
     * (Default is 30000)
     */
    maxRetryInterval?: number;
}

export class EventSourcePlus {
    url: string;

    lastEventId: string | undefined;

    options: EventSourceOptions;

    retryCount = 0;

    retryInterval = 0;

    maxRetryInterval: number;

    constructor(
        url: string,
        options: EventSourceOptions = {
            method: "get",
            headers: {},
        },
    ) {
        this.url = url;
        this.options = options;
        this.maxRetryInterval = options.maxRetryInterval ?? 30000;
    }

    private async _handleRetry(
        controller: AbortController,
        options: EventSourceConnectOptions,
    ) {
        this.retryCount++;
        if (this.retryInterval === 0) {
            this.retryInterval = 2;
        } else if (this.retryInterval > 0) {
            this.retryInterval = this.retryInterval * 2;
            if (this.retryInterval >= this.maxRetryInterval) {
                this.retryInterval = this.maxRetryInterval;
            }
        }
        await wait(this.retryInterval);
        await this._handleConnection(controller, options);
    }

    private async _handleConnection(
        controller: AbortController,
        options: EventSourceConnectOptions,
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
            onResponse: options.onResponse,
            onResponseError: (context) => {
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

    listen(options: EventSourceConnectOptions): EventSourceController {
        const controller = new EventSourceController(new AbortController());
        void this._handleConnection(controller, options);
        return controller;
    }
}

export class EventSourceController {
    abortController: AbortController;

    constructor(controller: AbortController) {
        this.abortController = controller;
    }

    abort(reason?: string) {
        this.abortController.abort(reason);
    }

    get signal() {
        return this.abortController.signal;
    }
}

export async function wait(duration: number) {
    return new Promise((res) => {
        setTimeout(() => {
            res(true);
        }, duration);
    });
}
