import {
    createApp,
    createError,
    createEventStream,
    createRouter,
    eventHandler,
    readBody,
    setResponseStatus,
} from "h3";

const app = createApp();
const router = createRouter();
app.use(router);

router.head(
    "/",
    eventHandler((event) => {
        setResponseStatus(event, 200);
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

export default app;
