import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatTime, tracksLabel } from "../player-view.js";
import { identityOrder, positionState, shuffledOrder } from "../player.js";

describe("порядок проигрывания", () => {
    it("identityOrder — подряд", () => {
        assert.deepEqual(identityOrder(4), [0, 1, 2, 3]);
        assert.deepEqual(identityOrder(0), []);
    });

    it("shuffledOrder ставит выбранный трек первым и не теряет ни одного", () => {
        let seed = 7;
        const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
        for (const first of [0, 3, 9]) {
            const order = shuffledOrder(10, first, random);
            assert.equal(order[0], first);
            assert.deepEqual(
                [...order].sort((a, b) => a - b),
                identityOrder(10),
            );
        }
        assert.deepEqual(shuffledOrder(1, 0), [0]);
    });
});

describe("подписи", () => {
    it("tracksLabel склоняет «трек»", () => {
        const cases = [
            [1, "1 трек"],
            [2, "2 трека"],
            [4, "4 трека"],
            [5, "5 треков"],
            [11, "11 треков"],
            [12, "12 треков"],
            [21, "21 трек"],
            [22, "22 трека"],
            [111, "111 треков"],
        ];
        for (const [count, label] of cases) {
            assert.equal(tracksLabel(count), label);
        }
    });

    it("formatTime", () => {
        assert.equal(formatTime(5), "0:05");
        assert.equal(formatTime(187.9), "3:07");
        assert.equal(formatTime(3700), "61:40");
        assert.equal(formatTime(NaN), "0:00");
        assert.equal(formatTime(-1), "0:00");
    });
});

describe("экран блокировки", () => {
    it("positionState: пока длина неизвестна — пусто, позиция не выходит за трек", () => {
        assert.deepEqual(positionState(5, NaN, 1), {});
        assert.deepEqual(positionState(5, 0, 1), {});
        assert.deepEqual(positionState(5, 100, 0), {});
        assert.deepEqual(positionState(5, 100, 1), { duration: 100, playbackRate: 1, position: 5 });
        assert.deepEqual(positionState(101, 100, 1), { duration: 100, playbackRate: 1, position: 100 });
        assert.deepEqual(positionState(-1, 100, 1), { duration: 100, playbackRate: 1, position: 0 });
    });
});
