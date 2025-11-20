import { a } from "@arrirpc/schema";
import {
    createApp,
    createError,
    createEventStream,
    createRouter,
    eventHandler,
    getHeader,
    readBody,
    sendError,
    sendStream,
    setResponseHeader,
    setResponseHeaders,
    setResponseStatus,
    toNodeListener,
} from "h3";
import { createServer } from "http";

import { wait } from "../src/internal";
import { ServerPaths } from "./server-paths";

const app = createApp();
const router = createRouter();
app.use(router);

router.head(
    "/",
    eventHandler((event) => {
        setResponseStatus(event, 200);
        setResponseHeader(event, "Content-Type", "text/plain");
        return "";
    }),
);

router.get(
    "/",
    eventHandler((event) => {
        setResponseStatus(event, 200);
        return "ok";
    }),
);

router.get(
    ServerPaths.SseGet,
    eventHandler((event) => {
        const stream = createEventStream(event);
        void stream.send();
        const lastEventId = a.coerce(
            a.uint32(),
            getHeader(event, "Last-Event-ID") ?? "0",
        );
        const eventId = lastEventId.success ? lastEventId.value : 0;
        let numMessages = 0;
        const interval = setInterval(async () => {
            numMessages++;
            await stream.push({
                id: `${numMessages + eventId}`,
                data: "hello world",
            });
        });
        stream.onClosed(() => {
            clearInterval(interval);
        });
    }),
);

router.post(
    ServerPaths.SsePost,
    eventHandler(async (event) => {
        const body = await readBody(event);
        if (typeof body !== "string") {
            throw createError({
                statusCode: 400,
                statusMessage: "Body must be a string",
            });
        }
        const stream = createEventStream(event);
        void stream.send();
        const interval = setInterval(async () => {
            await stream.push(body);
        });
        stream.onClosed(() => {
            clearInterval(interval);
        });
    }),
);

router.get(
    ServerPaths.SseSend10ThenClose,
    eventHandler((event) => {
        const stream = createEventStream(event);
        void stream.send();
        let msgCount = 0;
        const interval = setInterval(async () => {
            await stream.push('{"message":"hello world"}');
            msgCount++;
            if (msgCount >= 10) {
                await stream.close();
            }
        });
        stream.onClosed(() => {
            clearInterval(interval);
        });
    }),
);

router.get(
    ServerPaths.SseSend10QuickThenSlow,
    eventHandler(async (event) => {
        const stream = createEventStream(event);
        void stream.send();
        const parsedEventId = a.coerce(
            a.uint32(),
            getHeader(event, "Last-Event-ID") ?? "0",
        );
        let msgCount = parsedEventId.success ? parsedEventId.value : 0;
        for (let i = 0; i < 10; i++) {
            msgCount++;
            await stream.push({
                id: `${msgCount}`,
                data: "hello world",
            });
        }
        const interval = setInterval(async () => {
            msgCount++;
            await stream.push({ id: `${msgCount}`, data: "hello world" });
        }, 2000);
        stream.onClosed(() => {
            clearInterval(interval);
        });
    }),
);

const expiredTokens: Record<string, boolean> = {};

router.delete(
    ServerPaths.SseInvalidateHeaders,
    eventHandler((event) => {
        const token = getHeader(event, "Authorization") ?? "";
        if (expiredTokens[token] === true) {
            throw createError({
                statusCode: 403,
                statusMessage: "Token has expired",
            });
        }
        expiredTokens[token] = true;
        const stream = createEventStream(event);
        void stream.send();
        let msgCount = 0;
        const interval = setInterval(async () => {
            await stream.push(
                JSON.stringify({
                    message: "hello world",
                }),
            );
            msgCount++;
            if (msgCount >= 10) {
                await stream.close();
            }
        });
        stream.onClosed(() => {
            clearInterval(interval);
        });
    }),
);

router.post(
    ServerPaths.Send500Error,
    eventHandler((event) => {
        sendError(
            event,
            createError({
                status: 500,
                statusCode: 500,
                statusMessage: "Internal error",
                statusText: "Internal error",
            }),
        );
    }),
);

router.get(
    ServerPaths.TimeoutTest,
    eventHandler(async (event) => {
        await wait(5000);
        const stream = createEventStream(event);
        void stream.send();
        const interval = setInterval(() => {
            stream.push("hello world");
        });
        stream.onClosed(() => {
            clearInterval(interval);
        });
    }),
);

router.get(
    ServerPaths.SseSendPartialCharacterChunks,
    eventHandler(async (event) => {
        const { writable, readable } = new TransformStream();
        const writer = writable.getWriter();
        setResponseHeaders(event, {
            "content-type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        setResponseStatus(event, 200);
        sendStream(event, readable);
        const textEncoder = new TextEncoder();
        const fullString = `
data: that's €5

data: that's ¢50

event: message
data: 😀

`;
        const byteArr = textEncoder.encode(fullString);
        const fullLen = byteArr.length;
        const euroStartIndex = byteArr.indexOf(0xe2);
        const chunk1End = euroStartIndex + 1;
        const chunk1 = byteArr.slice(0, chunk1End);
        const grinStartIndex = byteArr.indexOf(0xf0);
        const chunk2End = grinStartIndex + 2;
        const chunk2 = byteArr.slice(chunk1End, chunk2End);
        const chunk3 = byteArr.slice(chunk2End, fullLen);
        await writer.write(chunk1); // send part of the euro
        await new Promise((resolve) => setTimeout(resolve, 50));
        await writer.write(chunk2); // send rest of euro and send part of the emoji
        await new Promise((resolve) => setTimeout(resolve, 50));
        await writer.write(chunk3); // send rest of emoji
        await writer.close();
    }),
);

const port = process.env.PORT || 2020;

createServer(toNodeListener(app)).listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
