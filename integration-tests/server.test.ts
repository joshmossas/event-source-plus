import { randomUUID } from "crypto";
import { describe, expect, test } from "vitest";

import { type EventSourceHooks, EventSourcePlus } from "../src/event-source";
import { wait } from "../src/internal";
import { type SseMessage } from "../src/parse";

const baseUrl = `http://localhost:2020`;

test("get requests", async () => {
    let messageCount = 0;
    let reqCount = 0;
    let reqErrorCount = 0;
    let resCount = 0;
    let resErrorCount = 0;
    const errorCount = 0;
    const eventSource = new EventSourcePlus(`${baseUrl}/sse-get`);
    const controller = eventSource.listen({
        onMessage() {
            messageCount++;
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
    await wait(1000);
    controller.abort();
    expect(messageCount > 1).toBe(true);
    expect(reqCount).toBe(1);
    expect(reqErrorCount).toBe(0);
    expect(resCount).toBe(1);
    expect(resErrorCount).toBe(0);
    expect(errorCount).toBe(0);
});

test("post request", async () => {
    let openCount = 0;
    let messageCount = 0;
    let errorCount = 0;
    const body = '{"message":"hello world"}';
    const eventSource = new EventSourcePlus(`${baseUrl}/sse-post`, {
        method: "post",
        headers: {
            "Content-Type": "text/plain",
        },
        body,
    });
    const controller = eventSource.listen({
        onMessage: function (message: SseMessage) {
            expect(message.data).toBe(body);
            messageCount++;
        },
        onRequest: function () {
            openCount++;
        },
        onRequestError: function () {
            errorCount++;
        },
    });

    await wait(1000);
    controller.abort();
    expect(messageCount > 1).toBe(true);
    expect(openCount).toBe(1);
    expect(errorCount).toBe(0);
});

test("get request auto reconnection", async () => {
    let openCount = 0;
    let messageCount = 0;
    const eventSource = new EventSourcePlus(
        `${baseUrl}/sse-send-10-then-close`,
    );
    const controller = eventSource.listen({
        onMessage() {
            messageCount++;
        },
        onRequest() {
            openCount++;
        },
        onResponse() {},
        onRequestError() {},
    });
    await wait(1000);
    controller.abort();
    expect(messageCount > 10).toBe(true);
    expect(openCount > 1).toBe(true);
});

test("get request 404", async () => {
    const eventSource = new EventSourcePlus(`${baseUrl}/random-endpoint`, {
        maxRetryInterval: 1000,
    });
    let msgCount = 0;
    let reqCount = 0;
    let reqErrorCount = 0;
    let resCount = 0;
    let resErrorCount = 0;
    const controller = eventSource.listen({
        onMessage() {
            msgCount++;
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
            expect(context.response.status).toBe(404);
        },
    });
    await wait(1000);
    controller.abort();
    expect(msgCount).toBe(0);
    expect(reqCount > 1).toBe(true);
    expect(reqErrorCount).toBe(0);
    expect(resCount > 1).toBe(true);
    expect(resErrorCount > 1).toBe(true);
});

test("request error(s)", async () => {
    // cspell:disable
    const eventSource = new EventSourcePlus("asldkfjasdflkjafdslkj");
    // cspell:enable
    let msgCount = 0;
    let reqCount = 0;
    let reqErrorCount = 0;
    const controller = eventSource.listen({
        onMessage() {
            msgCount++;
        },
        onRequest() {
            reqCount++;
        },
        onRequestError() {
            reqErrorCount++;
        },
    });
    await wait(1000);
    controller.abort();
    expect(msgCount).toBe(0);
    expect(reqCount).toBe(reqErrorCount);
    expect(reqErrorCount > 1).toBe(true);
});

describe("retry with new headers", () => {
    test("using function syntax", async () => {
        const getHeaders = () => ({
            Authorization: randomUUID(),
            AnotherHeader: undefined,
        });
        const eventSource = new EventSourcePlus(
            `${baseUrl}/sse-invalidate-headers`,
            { method: "delete", headers: getHeaders },
        );
        let msgCount = 0;
        let reqCount = 0;
        let reqErrorCount = 0;
        let resCount = 0;
        let resErrorCount = 0;
        const controller = eventSource.listen({
            onMessage() {
                msgCount++;
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
        await wait(3000);
        controller.abort();
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
            `${baseUrl}/sse-invalidate-headers`,
            { method: "delete", headers: getHeaders },
        );
        let msgCount = 0;
        let reqCount = 0;
        let reqErrorCount = 0;
        let resCount = 0;
        let resErrorCount = 0;
        const controller = eventSource.listen({
            onMessage() {
                msgCount++;
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
        await wait(3000);
        controller.abort();
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
            `${baseUrl}/sse-invalidate-headers`,
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
    const eventSource = new EventSourcePlus(`${baseUrl}/`, {
        method: "get",
    });
    let msgCount = 0;
    let openCount = 0;
    let resCount = 0;
    let errorCount = 0;
    const controller = eventSource.listen({
        onMessage() {
            msgCount++;
        },
        onRequest() {
            openCount++;
        },
        onResponse() {
            resCount++;
        },
        onResponseError() {
            errorCount++;
        },
    });
    await wait(1000);
    controller.abort();
    expect(msgCount).toBe(0);
    expect(openCount > 1).toBe(true);
    expect(errorCount > 1).toBe(true);
    expect(resCount).toBe(errorCount);
});

test("Max retry count", async () => {
    const eventSource = new EventSourcePlus(`${baseUrl}/some-random-endpoint`, {
        maxRetryCount: 10,
        maxRetryInterval: 1,
    });
    let msgCount = 0;
    let openCount = 0;
    let errorCount = 0;
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
    await wait(1000);
    controller.abort();
    expect(msgCount).toBe(0);
    expect(openCount).toBe(10);
    expect(errorCount).toBe(10);
});
