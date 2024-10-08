# Event Source Plus

A more configurable EventSource implementation that runs in browsers, NodeJS, and workers. The default browser [EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) is too limited. Event Source Plus fixes that.

## Features

-   Use any HTTP method
-   Send custom headers
-   Optionally change headers when retrying
-   Pass data as body or query params
-   Runs in browsers, NodeJS, and workers
-   First class typescript support
-   Automatic retry with exponential backoff and hooks for customizing behavior
-   ESM and CommonJS support

## Table of Contents

-   [Installation](#installation)
-   [Usage](#usage)
    -   [Basic Request](#basic-request)
    -   [Canceling Requests](#canceling-requests)
    -   [Additional Options](#additional-options)
    -   [Working with Headers](#working-with-headers)
    -   [Customizing Retry Behavior](#customizing-retry-behavior)
-   [Listen Hooks](#listen-hooks)
-   [Contributing](#contributing)

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

### Canceling Requests

The `listen()` method returns a controller that you can use to abort the request.

```ts
const controller = eventSource.listen({
    onMessage(message) {
        console.log(message);
    },
});
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

## Listen Hooks

The `listen()` method has the following hooks:

-   `onMessage`
-   `onRequest`
-   `onRequestError`
-   `onResponse`
-   `onResponseError`

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

-   `response.ok` is not `true` (i.e. server returned an error status code)
-   The `Content-Type` header sent by the server doesn't include `text/event-stream`

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

## Contributing

Pull requests and issue reports are welcome.

Before submitting a PR please ensure that you have run the following commands and there are no errors.

```bash
pnpm run lint
pnpm run format
```

(For VSCode users "formatOnSave" is set to true. So the formatting step may be unnecessary)

Integration tests and unit tests get run by CI.
