import { test, expect, describe } from "vitest";
import { type SseMessage, messageListFromString } from "./parse";

describe("messagesFromString()", () => {
    test("complete messages", () => {
        const input = `
id:
data: hello world

event: error
data: you suck

id: 1
event: data
data: hello world
retry: 10

`;

        const result = messageListFromString(input);
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
        expect(result.messages).toStrictEqual(expectedResult);
    });

    test("incomplete messages", () => {
        const input = `
id: hello

data: hello world

event: error
data: hello world

event: data`;
        const result = messageListFromString(input);
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
        expect(result.messages).toStrictEqual(expectedResult);
        expect(result.leftoverData).toStrictEqual("event: data");
    });

    test("skip invalid lines", () => {
        const input = `
:
hello world
hi
hi
        
data: hello world

:
:

data: hello world

`;
        const result = messageListFromString(input);
        expect(result.messages).toStrictEqual([
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
        ]);
    });
});
