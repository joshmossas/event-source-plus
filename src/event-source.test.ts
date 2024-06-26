import { randomInt } from "crypto";
import { assertType, test } from "vitest";

import { EventSourcePlusOptions } from "./event-source";
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
