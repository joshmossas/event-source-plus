import { describe, expect, test } from "vitest";

import { messageListFromString, type SseMessage } from "./parse";

describe("messagesFromString()", () => {
    describe("complete messages", () => {
        const lines = [
            "id:",
            "data: hello world",
            "",
            "event: error",
            "data: you suck",
            "",
            "id: 1",
            "event: data",
            "data: hello world",
            "retry: 10",
            "",
            "id: 2",
            "event: data",
        ];
        const expectedResult: SseMessage[] = [
            {
                id: "",
                event: "message",
                data: "hello world",
                retry: undefined,
            },
            {
                id: undefined,
                event: "error",
                data: "you suck",
                retry: undefined,
            },
            {
                id: "1",
                event: "data",
                data: "hello world",
                retry: 10,
            },
        ];
        test("LF delimiter", () => {
            const input = lines.join("\n");
            const result = messageListFromString(input);
            expect(result.messages).toStrictEqual(expectedResult);
            expect(result.leftoverData).toBe("id: 2\nevent: data");
        });
        test("CRLF delimiter", () => {
            const input = lines.join("\r\n");
            const result = messageListFromString(input);
            expect(result.messages).toStrictEqual(expectedResult);
            expect(result.leftoverData).toBe("id: 2\r\nevent: data");
        });
        test("CR delimiter", () => {
            let input = ``;
            for (const line of lines) {
                if (input.length) input += "\r";
                input += line;
            }
            const result = messageListFromString(input);
            expect(result.messages).toStrictEqual(expectedResult);
            expect(result.leftoverData).toBe("id: 2\revent: data");
        });
    });
    describe("incomplete messages", () => {
        const lines = [
            "id: hello",
            "",
            "data: hello world",
            "",
            "event: error",
            "data: hello world",
            "",
            "event: data",
        ];
        const expectedResult: SseMessage[] = [
            {
                id: undefined,
                event: "message",
                data: "hello world",
                retry: undefined,
            },
            {
                id: undefined,
                event: "error",
                data: "hello world",
                retry: undefined,
            },
        ];
        const expectedLeftoverData = `event: data`;
        test("LF delimiter", () => {
            const result = messageListFromString(lines.join("\n"));
            expect(result.messages).toStrictEqual(expectedResult);
            expect(result.leftoverData).toBe(expectedLeftoverData);
        });
        test("CRLF delimiter", () => {
            const result = messageListFromString(lines.join("\r\n"));
            expect(result.messages).toStrictEqual(expectedResult);
            expect(result.leftoverData).toBe(expectedLeftoverData);
        });
        test("CR delimiter", () => {
            const result = messageListFromString(lines.join("\r"));
            expect(result.messages).toStrictEqual(expectedResult);
            expect(result.leftoverData).toBe(expectedLeftoverData);
        });
    });
    describe("skip invalid lines", () => {
        const lines = [
            "",
            ":",
            "hello world",
            "hi",
            "hi",
            "",
            "data: hello world",
            "",
            ":",
            ":",
            "",
            "data: hello world",
            "",
            "",
        ];
        const expectedOutput: SseMessage[] = [
            {
                id: undefined,
                event: "message",
                data: "hello world",
                retry: undefined,
            },
            {
                id: undefined,
                event: "message",
                data: "hello world",
                retry: undefined,
            },
        ];
        test("LF delimiter", () => {
            const result = messageListFromString(lines.join("\n"));
            expect(result.messages).toStrictEqual(expectedOutput);
        });
        test("CRLF delimiter", () => {
            const result = messageListFromString(lines.join("\r\n"));
            expect(result.messages).toStrictEqual(expectedOutput);
        });
        test("CR delimiter", () => {
            const result = messageListFromString(lines.join("\r"));
            expect(result.messages).toStrictEqual(expectedOutput);
        });
    });
});
