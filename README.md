# Event Source Plus

The [default browser EventSource API](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) has too many restrictions. Event Source Plus fixes that.

## Features

-   Use any HTTP method
-   Send custom headers
-   Pass data as body or query params
-   Runs in browsers, NodeJS, and workers
-   Automatic retry with hooks for customizing behavior
-   ESM and CommonJS support

## Table of Contents

-   [Usage](#usage)
    -   [Basic Request](#basic-request)
    -   [Canceling Requests](#canceling-requests)
    -   [Additional Options](#additional-options)
    -   [Working with Headers](#working-with-headers)
-   [Listen Hooks](#listen-hooks)

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

The `EventSourcePlus` allows you to pass additional fetch options such as `method`, `body`, and `headers`.

```ts
const eventSource = new EventSourcePlus("https://example.com", {
    method: "post",
    body: JSON.stringify({ message: "hello world" }),
    headers: {
        "Content-Type": "application/json",
    },
});
```

### Working with Headers

Headers can be set by passing an object or a function.

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
```

The function syntax is especially useful when dealing with authentication because it allows you to always get a fresh auth token. This usually a pain point when working other SSE client libraries.

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
