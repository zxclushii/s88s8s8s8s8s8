import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { G, LAB, curvePoints, largestPrimeFactor, multiply, onCurve, pointOfOrder } from "../curve.js";
import { cipherSteps, elgamal, maxMessage, messageOf, messagePoint } from "../ec-elgamal.js";

describe("сообщение в точку по Коблицу", () => {
    it("m = 5 на кривой лабы 9: x = 15 не подошёл, x = 16 — да, M = (16; 14)", () => {
        const { tries, point } = messagePoint(LAB, 5);
        assert.deepEqual(point, { x: 16, y: 14 });
        assert.deepEqual(
            tries.map(({ x, root }) => [x, root]),
            [
                [15, null],
                [16, 14],
            ],
        );
        assert.equal(messageOf(point), 5);
        assert.ok(onCurve(LAB, point));
    });

    it("для m = 0 точки нет: x = 0, 1, 2 не на кривой", () => {
        assert.equal(messagePoint(LAB, 0).point, null);
        assert.equal(maxMessage(29), 9);
    });
});

describe("Эль-Гамаль на кривой", () => {
    for (const curve of [LAB, { p: 53, a: 2, b: 1 }, { p: 97, a: 2, b: 3 }]) {
        it(`расшифровка возвращает сообщение: p = ${curve.p}`, () => {
            const m = curvePoints(curve).length + 1;
            const q = largestPrimeFactor(m);
            const found = pointOfOrder(curve, q, G);
            assert.ok(found);
            const base = found.point;
            for (let d = 1; d < Math.min(q, 12); d++) {
                for (let k = 1; k < Math.min(q, 12); k++) {
                    for (let message = 0; message <= maxMessage(curve.p); message++) {
                        const M = messagePoint(curve, message).point;
                        if (M === null) {
                            continue;
                        }
                        const result = elgamal(curve, base, d, k, M);
                        assert.deepEqual(result.opened, M, `d = ${d}, k = ${k}, m = ${message}`);
                        assert.deepEqual(result.dC1, result.kQ);
                        assert.deepEqual(result.Q, multiply(curve, d, base).result);
                    }
                }
            }
        });
    }

    it("шаги шифра: от ключа до m, и ответы сходятся", () => {
        const { steps, M, result } = cipherSteps(LAB, { G: { x: 5, y: 21 }, q: 5, d: 3, k: 2, m: 5 });
        assert.deepEqual(M, { x: 16, y: 14 });
        assert.ok(result);
        assert.equal(steps.at(-1)?.answer, "5");
        assert.ok(steps.some((step) => step.formula === "M" && step.answer === "(16; 14)"));
        const noPoint = cipherSteps(LAB, { G: { x: 5, y: 21 }, q: 5, d: 3, k: 2, m: 0 });
        assert.equal(noPoint.M, null);
        assert.equal(noPoint.result, null);
    });
});
