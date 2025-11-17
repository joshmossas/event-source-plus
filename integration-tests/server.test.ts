import assert from "node:assert";

import { randomUUID } from "crypto";
import { Fetch, FetchError } from "ofetch";
import { describe, expect, it, test } from "vitest";

import {
    EventSourceController,
    type EventSourceHooks,
    EventSourcePlus,
} from "../src/event-source";
import { wait } from "../src/internal";
import { type SseMessage } from "../src/parse";
import { ServerPaths } from "./server-paths";

const urlHost = "localhost:2020";
const urlProtocol = `http`;
const baseUrl = `${urlProtocol}://${urlHost}`;

function endpoint(path: string) {
    assert(path.startsWith("/"));
    return `${baseUrl}${path}`;
}

test("get requests", async () => {
    let messageCount = 0;
    let reqCount = 0;
    let resCount = 0;
    const eventSource = new EventSourcePlus(endpoint(ServerPaths.SseGet));
    await new Promise((res, rej) => {
        setTimeout(() => rej(), 2000);
        const controller = eventSource.listen({
            onMessage() {
                messageCount++;
                if (messageCount >= 17) controller.abort();
            },
            onRequest() {
                reqCount++;
            },
            onRequestError({ error }) {
                rej(error);
            },
            onResponse(context) {
                expect(context.response.status).toBe(200);
                expect(context.response.headers.get("Content-Type")).toBe(
                    "text/event-stream",
                );
                resCount++;
            },
            onResponseError({ error }) {
                rej(error);
            },
        });
        controller.onAbort(() => res(undefined));
    });
    expect(messageCount > 1).toBe(true);
    expect(reqCount).toBe(1);
    expect(resCount).toBe(1);
});

test("post request", async () => {
    let reqCount = 0;
    let resCount = 0;
    let messageCount = 0;
    const body = '{"message":"hello world"}';
    const eventSource = new EventSourcePlus(endpoint(ServerPaths.SsePost), {
        method: "post",
        headers: {
            "Content-Type": "text/plain",
        },
        body,
    });
    await new Promise((res, rej) => {
        setTimeout(() => rej(), 2000);
        const controller = eventSource.listen({
            onMessage() {
                messageCount++;
                if (messageCount >= 17) controller.abort();
            },
            onRequest() {
                reqCount++;
            },
            onRequestError({ error }) {
                rej(error);
            },
            onResponse(context) {
                expect(context.response.status).toBe(200);
                expect(context.response.headers.get("Content-Type")).toBe(
                    "text/event-stream",
                );
                resCount++;
            },
            onResponseError({ error }) {
                rej(error);
            },
        });
        controller.onAbort(() => res(undefined));
    });
    expect(messageCount).toBe(17);
    expect(reqCount).toBe(1);
    expect(resCount).toBe(1);
});

test("get request auto reconnection", async () => {
    let requestCount = 0;
    let responseCount = 0;
    let messageCount = 0;
    const eventSource = new EventSourcePlus(
        endpoint(ServerPaths.SseSend10ThenClose),
    );
    await new Promise((res, rej) => {
        setTimeout(() => rej("Timeout exceeded"), 2000);
        const controller = eventSource.listen({
            onMessage() {
                messageCount++;
                if (messageCount === 40) controller.abort();
            },
            onRequest() {
                requestCount++;
            },
            onResponse() {
                responseCount++;
            },
            onRequestError({ error }) {
                rej(error);
            },
            onResponseError({ error }) {
                rej(error);
            },
        });
        controller.onAbort(() => res(undefined));
    });
    expect(messageCount).toBe(40);
    expect(requestCount).toBe(4);
    expect(responseCount).toBe(4);
});

test("get request 404", async () => {
    const eventSource = new EventSourcePlus(endpoint("/random-endpoint"), {
        maxRetryInterval: 1000,
    });
    let reqCount = 0;
    let resCount = 0;
    let resErrorCount = 0;
    await new Promise((res, rej) => {
        setTimeout(() => rej(), 2000);
        const controller = eventSource.listen({
            onMessage() {
                rej("Expected no messages");
            },
            onRequest() {
                reqCount++;
            },
            onRequestError() {
                rej("Expected no request errors");
            },
            onResponse() {
                resCount++;
            },
            onResponseError(context) {
                resErrorCount++;
                expect(context.response.status).toBe(404);
                if (resErrorCount >= 4) controller.abort();
            },
        });
        controller.onAbort(() => res(undefined));
    });
    expect(reqCount).toBe(4);
    expect(resCount).toBe(4);
    expect(resErrorCount).toBe(4);
});

test("post request 500", async () => {
    const eventSource = new EventSourcePlus(
        endpoint(ServerPaths.Send500Error),
        {
            method: "post",
            maxRetryCount: 2,
        },
    );
    let resCount = 0;
    let resErrorCount = 0;
    const statusCodes: number[] = [];
    const statusMessages: string[] = [];
    await new Promise((res, rej) => {
        const controller = eventSource.listen({
            onMessage() {},
            onResponse() {
                resCount++;
            },
            async onResponseError(context) {
                resErrorCount++;
                if (!(context.error instanceof FetchError)) {
                    rej("expected context.error to be instance of FetchError");
                    controller.abort();
                    return;
                }
                statusCodes.push(context.response.status);
                statusMessages.push(context.response.statusText);
                const body = await context.response.json();
                if (typeof body !== "object") {
                    rej("expected body to be object");
                    controller.abort();
                }
                if (body.statusCode !== 500) {
                    rej("expected body.statusCode to be 500");
                    controller.abort();
                }
                if (resErrorCount >= 2) {
                    res(undefined);
                    controller.abort();
                }
            },
        });
    });
    expect(resCount).toBe(2);
    expect(resErrorCount).toBe(2);
    expect(statusCodes).toStrictEqual([500, 500]);
    expect(statusMessages).toStrictEqual(["Internal error", "Internal error"]);
});

test("request error(s)", async () => {
    // cspell:disable
    const eventSource = new EventSourcePlus("asldkfjasdflkjafdslkj");
    // cspell:enable
    let reqCount = 0;
    let reqErrorCount = 0;
    let controller: EventSourceController;
    await new Promise((res, rej) => {
        setTimeout(() => rej(), 2000);
        controller = eventSource.listen({
            onMessage() {
                rej("Expected no messages");
            },
            onRequest() {
                reqCount++;
            },
            onRequestError({ error }) {
                reqErrorCount++;
                if (reqErrorCount >= 4) controller.abort();
                if (typeof error !== "object") {
                    rej("expected error to be in context");
                }
            },
            onResponse() {
                rej("Expected no responses");
            },
        });
        controller.onAbort(() => res(undefined));
    });
    if (!controller!.didAbort) controller!.abort();
    expect(reqCount).toBe(reqErrorCount);
    expect(reqErrorCount).toBe(4);
});

describe("retry with new headers", () => {
    test("using function syntax", async () => {
        const getHeaders = () => ({
            Authorization: randomUUID(),
            AnotherHeader: undefined,
        });
        const eventSource = new EventSourcePlus(
            endpoint(ServerPaths.SseInvalidateHeaders),
            { method: "delete", headers: getHeaders },
        );
        let msgCount = 0;
        let reqCount = 0;
        let reqErrorCount = 0;
        let resCount = 0;
        let resErrorCount = 0;
        await new Promise((res, rej) => {
            setTimeout(() => rej("Timeout exceeded"), 5000);
            const controller = eventSource.listen({
                onMessage() {
                    msgCount++;
                    if (msgCount >= 40) controller.abort();
                },
                onRequest() {
                    reqCount++;
                },
                onRequestError() {
                    reqErrorCount++;
                },
                onResponse() {
                    resCount++;
                },
                onResponseError(context) {
                    resErrorCount++;
                    expect(context.response.status).toBe(403);
                },
            });
            controller.onAbort(() => res(undefined));
        });
        expect(msgCount > 1).toBe(true);
        expect(reqCount > 1).toBe(true);
        expect(reqErrorCount).toBe(0);
        expect(resCount > 1).toBe(true);
        expect(resErrorCount).toBe(0);
    });
    test("using async function syntax", async () => {
        const getHeaders = async () => {
            await wait(50);
            return {
                Authorization: randomUUID(),
            };
        };
        const eventSource = new EventSourcePlus(
            endpoint(ServerPaths.SseInvalidateHeaders),
            { method: "delete", headers: getHeaders },
        );
        let msgCount = 0;
        let reqCount = 0;
        let reqErrorCount = 0;
        let resCount = 0;
        let resErrorCount = 0;
        await new Promise((res, rej) => {
            setTimeout(() => rej("Timeout exceeded"), 5000);
            const controller = eventSource.listen({
                onMessage() {
                    msgCount++;
                    if (msgCount >= 40) controller.abort();
                },
                onRequest() {
                    reqCount++;
                },
                onRequestError() {
                    reqErrorCount++;
                },
                onResponse() {
                    resCount++;
                },
                onResponseError(context) {
                    resErrorCount++;
                    expect(context.response.status).toBe(403);
                },
            });
            controller.onAbort(() => res(undefined));
        });
        expect(msgCount > 1).toBe(true);
        expect(reqCount > 1).toBe(true);
        expect(reqErrorCount).toBe(0);
        expect(resCount > 1).toBe(true);
        expect(resErrorCount).toBe(0);
    });
    test("using object syntax", { timeout: 5000 }, async () => {
        const usedTokens = [] as string[];
        let authToken = randomUUID();
        const eventSource = new EventSourcePlus(
            endpoint(ServerPaths.SseInvalidateHeaders),
            {
                method: "delete",
                headers: {
                    Authorization: authToken,
                },
            },
        );
        let msgCount = 0;
        let reqCount = 0;
        let reqErrorCount = 0;
        let resCount = 0;
        let resErrorCount = 0;
        const options: EventSourceHooks = {
            onMessage() {
                msgCount++;
            },
            onRequest() {
                usedTokens.push(authToken);
                reqCount++;
            },
            onRequestError() {
                reqErrorCount++;
            },
            onResponse() {
                resCount++;
            },
            onResponseError(context) {
                expect(context.response.status).toBe(403);
                resErrorCount++;
                if (context.response.status === 403) {
                    controller.abort();
                    authToken = randomUUID();
                    controller = eventSource.listen(options);
                }
            },
        };
        let controller = eventSource.listen(options);
        await wait(3000);
        controller.abort();
        expect(msgCount > 1).toBe(true);
        expect(reqCount > 1).toBe(true);
        expect(reqErrorCount).toBe(0);
        expect(resCount > 1).toBe(true);
        expect(reqErrorCount < resCount).toBe(true);
        expect(resErrorCount > 1).toBe(true);
        expect(usedTokens.length > 1).toBe(true);
    });
});

test("Non-SSE endpoint", async () => {
    const eventSource = new EventSourcePlus(endpoint("/"), {
        method: "get",
    });
    let reqCount = 0;
    let resCount = 0;
    let errorCount = 0;
    await new Promise((res, rej) => {
        setTimeout(() => rej("Timeout exceeded"), 2000);
        const controller = eventSource.listen({
            onMessage() {
                rej("Expected no messages");
            },
            onRequest() {
                reqCount++;
            },
            onResponse() {
                resCount++;
            },
            onResponseError() {
                errorCount++;
                if (errorCount >= 6) controller.abort();
            },
        });
        controller.onAbort(() => res(undefined));
    });
    expect(reqCount).toBe(6);
    expect(resCount).toBe(6);
    expect(errorCount).toBe(6);
});

test("Max retry count", async () => {
    const eventSource = new EventSourcePlus(endpoint("/some-random-endpoint"), {
        maxRetryCount: 10,
        maxRetryInterval: 1,
    });
    let msgCount = 0;
    let openCount = 0;
    let errorCount = 0;
    await new Promise((res, rej) => {
        setTimeout(() => rej("Timeout exceeded"), 2000);
        const controller = eventSource.listen({
            onMessage(_) {
                msgCount++;
            },
            onRequest(_) {
                openCount++;
            },
            onResponseError(_) {
                errorCount++;
            },
        });
        controller.onAbort(() => res(undefined));
    });
    expect(msgCount).toBe(0);
    expect(openCount).toBe(10);
    expect(errorCount).toBe(10);
});

test("Custom Fetch Injection", async () => {
    let usedCustomFetch = false;
    const customFetch: Fetch = async (
        input: string | URL | globalThis.Request,
        init?: RequestInit,
    ): Promise<Response> => {
        usedCustomFetch = true;
        return fetch(input, init);
    };
    const eventSource = new EventSourcePlus(endpoint(ServerPaths.SseGet), {
        method: "get",
        fetch: customFetch,
    });
    let msgCount = 0;
    await new Promise((res, rej) => {
        setTimeout(() => rej(), 2000);
        const controller = eventSource.listen({
            onMessage(_) {
                msgCount++;
                if (msgCount >= 11) controller.abort();
            },
        });
        controller.onAbort(() => res(undefined));
    });
    expect(usedCustomFetch).toBe(true);
    expect(msgCount).toBe(11);
});

test('"on-error" retry strategy does not retry after successful connection', async () => {
    const eventSource = new EventSourcePlus(
        endpoint(ServerPaths.SseSend10ThenClose),
        {
            retryStrategy: "on-error",
        },
    );
    let msgCount = 0;
    let openCount = 0;
    let errCount = 0;
    await new Promise((res, rej) => {
        setTimeout(() => rej(), 2000);
        const controller = eventSource.listen({
            onRequestError({ error }) {
                errCount++;
                expect(false, error.message);
            },
            onMessage() {
                msgCount++;
            },
            onResponse() {
                openCount++;
            },
            onResponseError({ error }) {
                errCount++;
                expect(
                    false,
                    error?.message ?? `Unexpectedly received response error`,
                );
            },
        });
        controller.onAbort(() => res(undefined));
    });
    expect(msgCount).toBe(10);
    expect(openCount).toBe(1);
    expect(errCount).toBe(0);
});

test('"on-error" retry strategy does retry after error response', async () => {
    const eventSource = new EventSourcePlus(
        endpoint(ServerPaths.Send500Error),
        {
            method: "post",
            maxRetryCount: 2,
            retryStrategy: "on-error",
        },
    );
    let resCount = 0;
    let resErrorCount = 0;
    const statusCodes: number[] = [];
    const statusMessages: string[] = [];
    await new Promise((res, rej) => {
        const controller = eventSource.listen({
            onMessage() {},
            onResponse() {
                resCount++;
            },
            onResponseError(context) {
                statusCodes.push(context.response.status);
                statusMessages.push(context.response.statusText);
                resErrorCount++;
                if (resCount == 2) {
                    controller.abort();
                    res(true);
                }
            },
        });
        setTimeout(() => {
            rej("timeout exceeded");
        }, 1000);
    });
    expect(resCount).toBe(2);
    expect(resErrorCount).toBe(2);
    expect(statusCodes).toStrictEqual([500, 500]);
    expect(statusMessages).toStrictEqual(["Internal error", "Internal error"]);
});

test("get requests -> abort() then reconnect()", async () => {
    let messageCount = 0;
    let reqCount = 0;
    let reqErrorCount = 0;
    let resCount = 0;
    let resErrorCount = 0;
    const errorCount = 0;
    const eventSource = new EventSourcePlus(endpoint(ServerPaths.SseGet));
    let controller: EventSourceController;
    await new Promise((res, rej) => {
        setTimeout(() => {
            rej();
        }, 60000);
        controller = eventSource.listen({
            onMessage() {
                messageCount++;
                if (messageCount === 10) {
                    controller.abort();
                    return;
                }
                if (messageCount === 20) {
                    controller.abort();
                }
            },
            onRequest() {
                reqCount++;
            },
            onRequestError() {
                reqErrorCount++;
            },
            onResponse(context) {
                expect(context.response.status).toBe(200);
                expect(context.response.headers.get("Content-Type")).toBe(
                    "text/event-stream",
                );
                resCount++;
            },
            onResponseError() {
                resErrorCount++;
            },
        });
        controller.onAbort(() => res(undefined));
    });

    expect(messageCount).toBe(10);
    expect(reqCount).toBe(1);
    expect(reqErrorCount).toBe(0);
    expect(resCount).toBe(1);
    expect(resErrorCount).toBe(0);
    expect(errorCount).toBe(0);
    await new Promise((res, rej) => {
        setTimeout(() => {
            rej();
        }, 60000);
        controller.onAbort(() => res(undefined));
        controller.reconnect();
    });
    expect(messageCount).toBe(20);
    expect(reqCount).toBe(2);
    expect(reqErrorCount).toBe(0);
    expect(resCount).toBe(2);
    expect(resErrorCount).toBe(0);
    expect(errorCount).toBe(0);
});

test("post request -> manually trigger reconnect", async () => {
    let openCount = 0;
    let messageCount = 0;
    let errorCount = 0;
    const body = '{"message":"hello world"}';
    const eventSource = new EventSourcePlus(endpoint(ServerPaths.SsePost), {
        method: "post",
        headers: {
            "Content-Type": "text/plain",
        },
        body,
    });
    await new Promise((res, rej) => {
        setTimeout(() => {
            rej();
        }, 60000);
        const controller = eventSource.listen({
            onMessage: function (message: SseMessage) {
                expect(message.data).toBe(body);
                messageCount++;
                if (messageCount >= 20) {
                    controller.abort();
                    res(true);
                }
                if (messageCount === 10) controller.reconnect();
            },
            onResponse: function () {
                openCount++;
            },
            onRequestError: function () {
                errorCount++;
            },
            onResponseError: function () {
                errorCount++;
            },
        });
    });
    expect(errorCount).toBe(0);
    expect(openCount).toBe(2);
    expect(messageCount).toBe(20);
});

test("reconnect() -> override hook(s)", async () => {
    const eventSource = new EventSourcePlus(endpoint(ServerPaths.SseGet));
    let openCount = 0;
    let msgCount = 0;
    let msgCount2 = 0;
    let controller: EventSourceController;
    await new Promise((res, rej) => {
        setTimeout(() => rej(), 60000);
        controller = eventSource.listen({
            onMessage(_) {
                msgCount++;
                if (msgCount === 10) {
                    controller.abort();
                }
            },
            onResponse() {
                openCount++;
            },
        });
        controller.onAbort(() => res(undefined));
    });
    expect(openCount).toBe(1);
    expect(msgCount).toBe(10);
    expect(msgCount2).toBe(0);
    expect(eventSource.lastEventId).toBe("10");
    await new Promise((res, rej) => {
        setTimeout(() => rej(), 60000);
        controller.onAbort(() => res(undefined));
        controller.reconnect({
            onMessage(_) {
                msgCount2++;
                if (msgCount2 === 7) controller.abort();
            },
        });
    });
    expect(openCount).toBe(2);
    expect(msgCount).toBe(10);
    expect(msgCount2).toBe(7);
    expect(eventSource.lastEventId).toBe("17");
    await new Promise((res, rej) => {
        setTimeout(() => rej(), 60000);
        controller.onAbort(() => res(undefined));
        controller.reconnect({
            onMessage(_) {
                msgCount++;
                if (msgCount >= 15) controller.abort();
            },
        });
    });
    expect(openCount).toBe(3);
    expect(msgCount).toBe(15);
    expect(msgCount2).toBe(7);
    expect(eventSource.lastEventId).toBe("22");
});

test(
    "reconnect() -> implement simple heartbeat check",
    { timeout: 30000 },
    async () => {
        const eventStream = new EventSourcePlus(
            endpoint(ServerPaths.SseSend10QuickThenSlow),
        );
        let msgCount = 0;
        let openCount = 0;
        let controller: EventSourceController;
        const timeoutMs = 1000;
        await new Promise((res, rej) => {
            setTimeout(() => rej(), 30000);
            let timeout = setTimeout(() => controller.reconnect(), timeoutMs);
            controller = eventStream.listen({
                onMessage(_msg) {
                    clearTimeout(timeout);
                    timeout = setTimeout(
                        () => controller.reconnect(),
                        timeoutMs,
                    );
                    msgCount++;
                    if (msgCount === 40) {
                        clearTimeout(timeout);
                        res(undefined);
                        controller.abort();
                    }
                },
                onResponse(_context) {
                    openCount++;
                },
                onRequestError({ error }) {
                    clearTimeout(timeout);
                    rej(error);
                },
                onResponseError({ error }) {
                    clearTimeout(timeout);
                    rej(error);
                },
            });
        });
        expect(openCount).toBe(4);
        expect(msgCount).toBe(40);
        expect(eventStream.lastEventId).toBe("40");
    },
);

describe("abort event", () => {
    test("abort manually", async () => {
        const eventStream = new EventSourcePlus(endpoint(ServerPaths.SseGet));
        await new Promise((res, rej) => {
            let msgCount = 0;
            const timeout = setTimeout(() => {
                rej();
            }, 2000);
            const controller = eventStream.listen({
                onMessage(_) {
                    msgCount++;
                    if (msgCount >= 5) {
                        controller.abort();
                    }
                },
            });
            controller.onAbort((e) => {
                expect(e.type).toBe("manual");
                clearTimeout(timeout);
                res(true);
            });
        });
    });
    test("abort on error", async () => {
        const eventStream = new EventSourcePlus(
            endpoint(ServerPaths.Send500Error),
            {
                maxRetryCount: 3,
            },
        );
        await new Promise((res, rej) => {
            const timeout = setTimeout(() => {
                rej("timeout exceeded");
            }, 5000);
            const controller = eventStream.listen({
                onMessage(_) {
                    expect(false).toBe(true);
                },
            });
            controller.onAbort((e) => {
                clearTimeout(timeout);
                expect(e.type).toBe("error");
                res(undefined);
            });
        });
    });
    test("abort on stream ended", async () => {
        const eventStream = new EventSourcePlus(
            endpoint(ServerPaths.SseSend10ThenClose),
            {
                retryStrategy: "on-error",
            },
        );
        await new Promise((res, rej) => {
            const timeout = setTimeout(() => {
                rej("timeout exceeded");
                controller.abort();
            }, 2000);
            const controller = eventStream.listen({
                onMessage(_) {},
            });
            controller.onAbort((e) => {
                expect(e.type).toBe("end-of-stream");
                clearTimeout(timeout);
                res(undefined);
            });
        });
    });
});

describe("timeout parameter", { timeout: 10000 }, () => {
    it("should error when timeout exceeded", async () => {
        const eventStream = new EventSourcePlus(
            endpoint(ServerPaths.TimeoutTest),
            {
                timeout: 2000,
            },
        );
        await new Promise((res, rej) => {
            const timeout = setTimeout(() => {
                rej("test timeout exceeded");
                listener.abort();
            }, 10000);
            const listener = eventStream.listen({
                onMessage(_) {
                    listener.abort("received message");
                },
            });
            listener.onAbort((e) => {
                clearTimeout(timeout);
                expect(e.type).toBe("error");
                expect(e.reason?.toLowerCase().includes("timeout")).toBe(true);
                res(undefined);
            });
        });
    });
    it(
        "should not error when timeout not exceeded",
        { timeout: 10000 },
        async () => {
            const eventStream = new EventSourcePlus(
                endpoint(ServerPaths.TimeoutTest),
                {
                    timeout: 6000,
                },
            );
            await new Promise((res, rej) => {
                const timeout = setTimeout(() => {
                    rej("test timeout exceeded");
                    listener.abort();
                }, 10000);
                const listener = eventStream.listen({
                    onMessage(_) {
                        listener.abort("received message");
                    },
                });
                listener.onAbort((e) => {
                    clearTimeout(timeout);
                    expect(e.type).toBe("manual");
                    expect(e.reason).toBe("received message");
                    res(undefined);
                });
            });
        },
    );
    it(
        "should not trigger a duplicate onAbort if abort was previously called",
        { timeout: 2000 },
        async () => {
            const eventStream = new EventSourcePlus(
                endpoint(ServerPaths.Send500Error),
                {
                    method: "post",
                    timeout: 1000,
                },
            );
            let numResponseErr = 0;
            let onAbortCount = 0;
            const controller = eventStream.listen({
                onMessage: function (_) {
                    expect(false, "should not receive a message").toBe(true);
                },
                onResponseError() {
                    numResponseErr++;
                    controller.abort();
                },
            });
            controller.onAbort((event) => {
                onAbortCount++;
                expect(event.reason).toBe(undefined);
                expect(event.type).toBe("manual");
            });
            await wait(1850);
            expect(numResponseErr).toBe(1);
            expect(onAbortCount).toBe(1);
        },
    );
});

// function promiseWithTimeout<T>(input: Promise<T>, timeout: number) {
//     return Promise.race([
//         new Promise((_, rej) => {
//             setTimeout(() => rej(), timeout);
//         }),
//         input,
//     ]) as Promise<T>;
// }
