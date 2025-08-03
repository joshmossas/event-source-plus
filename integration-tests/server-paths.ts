export const ServerPaths = {
    SseGet: "/sse-get",
    SsePost: "/sse-post",
    SseSend10ThenClose: "/sse-send-10-then-close",
    SseSend10QuickThenSlow: "/sse-send-10-quick-then-slow",
    SseInvalidateHeaders: "/sse-invalidate-headers",
    Send500Error: "/send-500-error",
    TimeoutTest: "/sse-timeout-test",
} as const;
