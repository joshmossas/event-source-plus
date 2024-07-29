/* eslint-disable @typescript-eslint/no-misused-promises */
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
} from "h3";

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
    "/sse-get",
    eventHandler((event) => {
        const stream = createEventStream(event);
        void stream.send();
        const interval = setInterval(async () => {
            await stream.push("hello world");
        });
        stream.onClosed(() => {
            clearInterval(interval);
        });
    }),
);

router.post(
    "/sse-post",
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
    "/sse-send-10-then-close",
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

const expiredTokens: Record<string, boolean> = {};

router.delete(
    "/sse-invalidate-headers",
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
    "/send-500-error",
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

export default app;
