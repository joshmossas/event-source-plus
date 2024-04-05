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
    const parts = input.split("\n\n");
    let leftoverInput: string | undefined;
    if (!input.endsWith("\n\n")) {
        leftoverInput = parts.pop();
    }
    const messages: SseMessage[] = [];
    for (const part of parts) {
        const message = messageFromString(part);
        if (message !== null) {
            messages.push(message);
        }
    }
    return { messages, leftoverData: leftoverInput };
}

export function messageFromString(input: string): SseMessage | null {
    const lines = input.split("\n");
    let id: string | undefined;
    let event: string | undefined;
    let data = "";
    let retry: number | undefined;
    let hasData = false;
    for (const line of lines) {
        if (line.startsWith("data:")) {
            data = line.substring(5).trim();
            hasData = true;
            continue;
        }
        if (line.startsWith("id:")) {
            id = line.substring(3).trim();
            continue;
        }
        if (line.startsWith("event:")) {
            event = line.substring(6).trim();
            continue;
        }
        if (line.startsWith("retry:")) {
            const val = Number(line.substring(6).trim());
            if (!Number.isNaN(val)) {
                if (Number.isInteger(val)) {
                    retry = val;
                } else {
                    retry = Math.round(val);
                }
            }
        }
    }
    if (!hasData) {
        return null;
    }
    return {
        id,
        event: event ?? "message",
        data,
        retry,
    };
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
