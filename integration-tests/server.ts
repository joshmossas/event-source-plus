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
    setResponseHeader,
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

const port = process.env.PORT || 2020;

createServer(toNodeListener(app)).listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
