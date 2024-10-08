export interface SseMessage {
    id?: string;
    event: string;
    data: string;
    retry?: number;
}

export function messageListFromString(input: string): {
    messages: SseMessage[];
    leftoverData: string | undefined;
} {
    const messages: SseMessage[] = [];
    let line: string = "";
    let ignoreNextNewline = false;
    let data: string | undefined;
    let id: string | undefined;
    let event: string | undefined;
    let retry: number | undefined;
    let previousChar: string | undefined;
    let pendingIndex = 0;
    let isEndOfMessage = false;
    function handleParseLine(pIndex: number) {
        const result = parseLine(line);
        data = result.data ?? data;
        id = result.id ?? id;
        event = result.event ?? event;
        retry = result.retry ?? retry;
        if (isEndOfMessage) {
            if (typeof data === "string") {
                messages.push({
                    id: id,
                    data: data,
                    event: event ?? "message",
                    retry: retry,
                });
            }
            id = undefined;
            data = undefined;
            event = undefined;
            retry = undefined;
            pendingIndex = pIndex;
        }
        line = "";
    }
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        switch (char) {
            case "\r": {
                isEndOfMessage = previousChar === "\n" || previousChar === "\r";
                ignoreNextNewline = true;
                const pIndex = input[i + 1] === "\n" ? i + 2 : i + 1;
                handleParseLine(pIndex);
                break;
            }
            case "\n": {
                if (ignoreNextNewline) {
                    ignoreNextNewline = false;
                    break;
                }
                isEndOfMessage = previousChar === "\n";
                handleParseLine(i + 1);
                break;
            }
            default:
                line += char;
                break;
        }
        previousChar = char;
    }
    return {
        messages,
        leftoverData: input.substring(pendingIndex),
    };
}

export function parseLine(input: string): Partial<SseMessage> {
    if (input.startsWith("data:")) {
        return { data: input.substring(5).trim() };
    }
    if (input.startsWith("id:")) {
        return { id: input.substring(3).trim() };
    }
    if (input.startsWith("event:")) {
        return {
            event: input.substring(6).trim(),
        };
    }
    if (input.startsWith("retry:")) {
        const val = Number(input.substring(6).trim());
        if (!Number.isNaN(val)) {
            if (Number.isInteger(val)) {
                return { retry: val };
            } else {
                return { retry: Math.round(val) };
            }
        }
    }
    return {};
}

export async function getBytes(
    controller: AbortController,
    stream: ReadableStream<Uint8Array>,
    onChunk: (arr: Uint8Array) => void,
) {
    const reader = stream.getReader();
    let result: ReadableStreamReadResult<Uint8Array>;
    while (!controller.signal.aborted && !(result = await reader.read()).done) {
        onChunk(result.value);
    }
}
