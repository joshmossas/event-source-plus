# Event Source Plus

A more configurable EventSource implementation that runs in browsers, NodeJS, and workers. The default browser [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) is too limited. Event Source Plus fixes that.

## Features

- Use any HTTP method
- Send custom headers
- Optionally change headers when retrying
- Pass data as body or query params
- Runs in browsers, NodeJS, and workers
- First class typescript support
- Automatic retry with exponential backoff and hooks for customizing behavior
- Multiple [retry strategies](#changing-the-retry-strategy) for use in realtime applications vs LLM applications
- ESM and CommonJS support

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
    - [Basic Request](#basic-request)
    - [The EventSourceController](#the-eventsourcecontroller)
        - [Abort()](#abort)
        - [OnAbort()](#onabort)
        - [Reconnect()](#reconnect)
    - [Additional Options](#additional-options)
    - [Working with Headers](#working-with-headers)
    - [Customizing Retry Behavior](#customizing-retry-behavior)
- [Listen Hooks](#listen-hooks)
- [Supported Browsers and Server Runtimes](#supported-browsers-and-server-runtimes)
- [Contributing](#contributing)

## Installation

```bash
# npm
npm i event-source-plus

# pnpm
pnpm i event-source-plus
```

## Usage

### Basic Request

```ts
import { EventSourcePlus } from "event-source-plus";

const eventSource = new EventSourcePlus("https://example.com");

eventSource.listen({
    onMessage(message) {
        console.log(message);
    },
});
```

#### Usage With LLM Applications

When working with LLMs it may be preferable to set the retry strategy to `on-error`. For details why see [here](#changing-the-retry-strategy-beta)

```ts
const eventSource = new EventSourcePlus("https://example.com", {
    retryStrategy: "on-error",
});
```

### The `EventSourceController`

The `listen()` method returns a controller that you can use to interact with the active event stream.

#### Abort()

Use the `abort()` method to cancel requests

```ts
const controller = eventSource.listen({
    onMessage(message) {
        console.log(message);
    },
});
controller.abort();
```

The abort method can be used inside of listen hooks as well

```ts
let msgCount = 0;
const controller = eventSource.listen({
    onMessage(message) {
        msgCount++;
        if (msgCount >= 20) {
            controller.abort();
            break;
        }
        console.log(message);
    },
    onResponse({ response }) {
        if (response.status === 409) {
            controller.abort();
            return;
        }
    },
});
```

#### OnAbort()

You can register a listener via `onAbort()`. Use this if you want to trigger some logic whenever an event stream is closed

```ts
const controller = eventSource.listen({
    onMessage(message) {
        console.log(message);
    },
});
controller.onAbort((_) => {
    console.log("The event stream was closed");
});
controller.abort();
```

`onAbort()` receives an `EventSourcePlusAbortEvent` which provides more information about the closure of the event stream.

```ts
controller.onAbort((e) => {
    console.log(e.reason);
    switch (e.type) {
        case "manual":
            console.log("the stream was manually closed by the user");
            break;
        case "error":
            console.log("the stream was closed due to an error");
            break;
        // "on-error" retry strategy only
        case "end-of-stream":
            console.log("the stream was closed because it has ended");
            break;
    }
});
```

#### Reconnect()

The `reconnect()` method is used to reset the connection. If a connection is currently open it will forcibly abort the old request and open a new one.

```ts
const controller = eventSource.listen({
    onMessage(message) {
        console.log(message);
    },
});
// close the connection
controller.abort();
// reopen the connection
controller.reconnect();
```

##### Example: Heartbeat Detection

Let's say we expect the server to send a heartbeat message every 20 seconds. With the `reconnect()` method we can force the connection to reopen if we haven't received a message within 20 seconds.

```ts
let timeout = setTimeout(() => controller.reconnect(), 20000);
const controller = eventSource.listen({
    onMessage(message) {
        // cancel the existing timer because we have received a message
        clearTimeout(timeout);
        // set a new timer where we forcibly reopen the connection
        // if we haven't received a message in 20000ms
        timeout = setTimeout(() => controller.reconnect(), 20000);
        console.log(message);
    },
});
```

Just be aware that in this example you will have to call both `abort()` and `clearTimeout()` to permanently close the connection otherwise the timeout will reset the connection even though you aborted it.

```ts
clearTimeout(timeout);
controller.abort();
```

### Additional Options

The `EventSourcePlus` constructor allows you to pass additional fetch options such as `method`, `body`, and `headers`.

```ts
const eventSource = new EventSourcePlus("https://example.com", {
    method: "post",
    body: JSON.stringify({ message: "hello world" }),
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 5000,
});
```

You can also pass in a custom `fetch` implementation, which is useful for environments that don't natively support `fetch`.

```ts
const eventSource = new EventSourcePlus("https://example.com", {
    fetch: myCustomFetch,
});
```

### Working with Headers

Headers can be set by passing an object or a function. The function may return a header object or a promise that resolves to a header object.

```ts
// object syntax //
const eventSource = new EventSourcePlus("https://example.com", {
    // this value will remain the same for every request
    headers: {
        Authorization: "some-token",
    },
});

// function syntax //
function getHeaders() {
    return {
        Authorization: "some-token",
    };
}
const eventSource = new EventSourcePlus("https://example.com", {
    // this function will rerun every time a request is sent
    headers: getHeaders,
});

// async function syntax //
async function getHeaders() {
    const token = await getSomeToken();
    return {
        Authorization: token,
    };
}
const eventSource = new EventSourcePlus("https://example.com", {
    // this function will rerun every time a request is sent
    headers: getHeaders,
});
```

The function syntax is especially useful when dealing with authentication because it allows you to always get a fresh auth token. This usually a pain point when working other SSE client libraries.

### Customizing Retry Behavior

By default this library will automatically retry the request indefinitely with exponential backoff maxing out at 30 seconds. Both those these values can be adjusted when initializing the `EventSourcePlus` class.

```ts
const eventSource = new EventSourcePlus("https://example.com", {
    // automatically retry up to 100 times (default is 'undefined')
    maxRetryCount: 100,
    // set exponential backoff to max out at 10000 ms (default is "30000")
    maxRetryInterval: 10000,
});
```

Additionally, you can abort the request inside listen hooks using the `EventSourceController`

```ts
// abort the request if we receive 10 server errors
let errCount = 0;
const controller = eventSource.listen({
    onMessage(data) {},
    onResponseError({ request, response, options }) {
        errCount++;
        if (errCount >= 10) {
            controller.abort();
        }
    },
});
```

#### Changing the Retry Strategy

This library has two retry strategies. `always` and `on-error`.

`always` is the default. It will always attempt to keep the connection open after it has been closed. This is useful for most realtime applications which need to keep a persistent connection with the backend.

`on-error` will only retry if an error occurred. If an event stream was successfully received by the client it will not reconnect after the connection is closed. This is useful for short lived streams that have a fixed length (For example LLM response streams) since it means you no longer need to listen for a "DONE" event to close the connection.

To change the retry strategy simply update the `retryStrategy` option:

```ts
const eventSource = new EventSourcePlus("https://example.com", {
    retryStrategy: "on-error",
});
```

## Listen Hooks

The `listen()` method has the following hooks:

- `onMessage`
- `onRequest`
- `onRequestError`
- `onResponse`
- `onResponseError`

The only required hook is `onMessage`.

### `onMessage(message)`

`onMessage` is called whenever receiving a new Server Sent Event from the server.

```ts
eventSource.listen({
    onMessage(message) {
        console.log(message);
    },
});
```

### `onRequest({ request, options })`

`onRequest` is called as soon as a request is constructed. This allows you to modify the request or do simple logging.

```ts
eventSource.listen({
    onRequest({ request, options }) {
        console.log(request, options);

        // add current time query search params
        options.query = options.query || {};
        options.query.t = new Date();
    },
});
```

### `onRequestError({request, options, error})`

`onRequestError` will be called when the request fails.

```ts
eventSource.listen({
    async onRequestError({ request, options, error }) {
        console.log(`[request error]`, request, error);
    },
});
```

Some example errors might be `Connection refused` or `Failed to parse URL`

### `onResponse({ request, options, response })`

`onResponse` will be called after receiving a response from the server.

```ts
eventSource.listen({
    async onResponse({ request, response, options }) {
        console.log(`Received status code: ${response.status}`);
    },
});
```

### `onResponseError({ request, options, response })`

`onResponseError` will fire if one of the following conditions have been met

- `response.ok` is not `true` (i.e. server returned an error status code)
- The `Content-Type` header sent by the server doesn't include `text/event-stream`

```ts
eventSource.listen({
    async onResponseError({ request, response, options }) {
        console.log(
            `[response error]`,
            request,
            response.status,
            response.body,
        );
    },
});
```

## Supported Browsers and Server Runtimes

Under the hood, this library uses makes use of the following APIs:

- [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader)
    - _specifically the [getReader()](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader) method_

This means that you can use `EventSourcePlus` in any environment that supports those features including:

- All modern browsers
- NodeJS v16.5.0 or greater
    - _[node-fetch-native](https://www.npmjs.com/package/node-fetch-native) is used to backport `Fetch` to Node v16.5. In other cases the native Node `Fetch` implementation is used._
- Any server runtime that also has support for these APIs

## Contributing

Pull requests and issue reports are welcome.

Before submitting a PR please ensure that you have run the following commands and there are no errors.

```bash
pnpm run lint
pnpm run format
```

(For VSCode users "formatOnSave" is set to true. So the formatting step may be unnecessary)

Integration tests and unit tests get run by CI.
