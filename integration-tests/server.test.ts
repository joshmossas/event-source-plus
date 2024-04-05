import { expect, test } from "vitest";
import { EventSourcePlus, wait } from "../src";
import { type FetchContext } from "ofetch";
import { type SseMessage } from "../src/parse";

const baseUrl = `http://localhost:2020`;

test("get requests", async () => {
    let openCount = 0;
    let messageCount = 0;
    const errorCount = 0;
    const eventSource = new EventSourcePlus(`${baseUrl}/sse-get`);
    const controller = eventSource.listen({
        onMessage() {
            messageCount += 1;
        },
        onRequest() {
            openCount += 1;
        },
    });
    await wait(1000);
    controller.abort();
    expect(openCount).toBe(1);
    expect(messageCount > 1).toBe(true);
    expect(errorCount).toBe(0);
});

test("post request", async () => {
    let openCount = 0;
    let messageCount = 0;
    let errorCount = 0;
    const body = "hello world";
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
        onRequest: function (context: FetchContext<unknown, "stream">) {
            openCount++;
        },
        onRequestError: function (
            context: FetchContext<unknown, "stream"> & { error: Error },
        ) {
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
        onMessage(message) {
            messageCount++;
        },
        onRequest(context) {
            openCount++;
        },
        onResponse() {},
        onRequestError(context) {},
    });
    await wait(1000);
    controller.abort();
    expect(messageCount > 10).toBe(true);
    expect(openCount > 1).toBe(true);
});

test("get request 404", { timeout: 30000 }, async () => {
    const eventSource = new EventSourcePlus(`${baseUrl}/random-endpoint`, {
        maxRetryInterval: 1000,
    });
    const controller = eventSource.listen({
        onMessage(message) {},
        onRequestError(context) {
            console.log("REQUEST_INTERVAL", eventSource.retryInterval);
        },
        onRequest(context) {
            console.log("INTERVAL", eventSource.retryInterval);
        },
    });
    await wait(10000);
    controller.abort();
});
