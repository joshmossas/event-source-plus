import { SseMessage } from "./parse";

export type EventSourceHooks = {
    onMessage: (
        message: SseMessage,
        context: OnResponseContext,
    ) => Promise<void> | void;
    onRequest?: (context: OnRequestContext) => Promise<void> | void;
    onRequestError?: (context: OnRequestErrorContext) => Promise<void> | void;
    onResponse?: (context: OnResponseContext) => Promise<void> | void;
    onResponseError?: (context: OnResponseErrorContext) => Promise<void> | void;
};

export type Context = {
    request?: Request;
    options: any;
    response?: Response;
    error?: Error;
};

export type OnRequestContext = {
    request?: Request;
    options: any;
};

export type OnRequestErrorContext = {
    request?: Request;
    options: any;
    error: Error;
};

export type OnResponseContext = {
    request: Request;
    options: any;
    response: Response;
};

export type OnResponseErrorContext = {
    request: Request;
    options: any;
    response: Response;
    error: Error;
};
