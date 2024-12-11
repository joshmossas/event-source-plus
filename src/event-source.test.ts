import { randomInt } from "crypto";
import { FetchResponse } from "ofetch";
import { assertType, test } from "vitest";

import {
    _handleResponse,
    EventSourcePlusOptions,
    OnResponseContext,
} from "./event-source";
import { wait } from "./internal";

test("Header Type Inference", () => {
    type HeaderInput = EventSourcePlusOptions["headers"];
    assertType<HeaderInput>(undefined);
    assertType<HeaderInput>({
        Authorization: "test",
    });
    assertType<HeaderInput>({
        Authorization: undefined,
    });
    assertType<HeaderInput>(() => {
        if (randomInt(100) >= 50) {
            return {
                Authorization: "test",
            };
        }
        return {};
    });
    assertType<HeaderInput>(async () => {
        await wait(500);
        if (randomInt(100) >= 50) {
            return {
                Authorization: "test",
            };
        }
        return {};
    });
});

test("onResponse passes with valid response", async () => {
    const headers = new Headers();
    headers.set("Content-Type", "text/event-stream");
    const res: FetchResponse<any> = {
        headers: headers,
        ok: true,
        redirected: false,
        status: 200,
        statusText: "Ok",
        type: "default",
        url: "",
        clone: function (): Response {
            throw new Error("Function not implemented.");
        },
        body: null,
        bodyUsed: false,
        arrayBuffer: function (): Promise<ArrayBuffer> {
            throw new Error("Function not implemented.");
        },
        blob: function (): Promise<Blob> {
            throw new Error("Function not implemented.");
        },
        formData: function (): Promise<FormData> {
            throw new Error("Function not implemented.");
        },
        json: function (): Promise<any> {
            throw new Error("Function not implemented.");
        },
        text: function (): Promise<string> {
            throw new Error("Function not implemented.");
        },
    } as any;
    const context: OnResponseContext = {
        request: {} as any,
        response: res,
        options: {
            headers: new Headers(),
        },
    };
    await _handleResponse(context, {
        onMessage() {},
    });
});

test.fails(
    "onResponse throws when Content-Type header is undefined",
    async () => {
        const res: FetchResponse<any> = {
            headers: new Headers(),
            ok: true,
            redirected: false,
            status: 200,
            statusText: "Ok",
            type: "default",
            url: "",
            clone: function (): Response {
                throw new Error("Function not implemented.");
            },
            body: null,
            bodyUsed: false,
            arrayBuffer: function (): Promise<ArrayBuffer> {
                throw new Error("Function not implemented.");
            },
            blob: function (): Promise<Blob> {
                throw new Error("Function not implemented.");
            },
            formData: function (): Promise<FormData> {
                throw new Error("Function not implemented.");
            },
            json: function (): Promise<any> {
                throw new Error("Function not implemented.");
            },
            text: function (): Promise<string> {
                throw new Error("Function not implemented.");
            },
        } as any;
        const context: OnResponseContext = {
            request: {} as any,
            response: res,
            options: {
                headers: new Headers(),
            },
        };
        await _handleResponse(context, {
            onMessage: () => {},
        });
    },
);
