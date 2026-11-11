import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { G, LAB, add, curvePoints, inverse, mod, multiply, onCurve } from "../curve.js";

/**
 * Точки пути kP без номеров — так удобнее сравнивать с тетрадью.
 * @param {number} k
 * @param {import("../curve.js").Point} P
 */
function pathOf(k, P) {
    return multiply(LAB, k, P).path.map((step) => step.point);
}

describe("арифметика по модулю", () => {
    it("mod не уходит в минус", () => {
        assert.equal(mod(-44, 29), 14);
        assert.equal(mod(29, 29), 0);
        assert.equal(mod(5, 29), 5);
    });

    it("inverse — те же обратные, что в тетради", () => {
        assert.equal(inverse(16, 29), 20);
        assert.equal(inverse(28, 29), 28);
        assert.equal(inverse(5, 29), 6);
        assert.equal(inverse(-6, 29), mod(-5, 29));
        assert.equal(inverse(17, 29), 12);
        assert.equal(inverse(21, 29), 18);
    });

    it("inverse бросает, когда обратного нет", () => {
        assert.throws(() => inverse(0, 29), RangeError);
        assert.throws(() => inverse(58, 29), RangeError);
    });
});

describe("кривая варианта 7", () => {
    it("29 точек, и все на кривой; G тоже", () => {
        const points = curvePoints(LAB);
        assert.equal(points.length, 29);
        assert.ok(points.every((point) => onCurve(LAB, point)));
        assert.ok(onCurve(LAB, G));
        assert.equal(onCurve(LAB, { x: 10, y: 9 }), false);
    });

    it("сложение с O ничего не меняет, P + (−P) = O", () => {
        assert.deepEqual(add(LAB, G, null), G);
        assert.deepEqual(add(LAB, null, G), G);
        assert.equal(add(LAB, G, { x: 10, y: 21 }), null);
        assert.equal(add(LAB, null, null), null);
    });

    it("шаги из тетради: 2G, 4G, 6G, 7G", () => {
        const twoG = add(LAB, G, G);
        assert.deepEqual(twoG, { x: 16, y: 14 });
        const fourG = add(LAB, twoG, twoG);
        assert.deepEqual(fourG, { x: 21, y: 22 });
        const sixG = add(LAB, fourG, twoG);
        assert.deepEqual(sixG, { x: 5, y: 21 });
        assert.deepEqual(add(LAB, sixG, G), { x: 8, y: 10 });
    });

    it("удвоение точки с y = 0 — вертикальная касательная, выходит O", () => {
        // y² = x³ − x (mod 5): у точки (1; 0) касательная вертикальная
        assert.equal(add({ p: 5, a: -1, b: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }), null);
    });
});

describe("multiply", () => {
    it("идёт тем же путём, что в тетради", () => {
        assert.deepEqual(pathOf(7, G), [
            { x: 10, y: 8 },
            { x: 16, y: 14 },
            { x: 21, y: 22 },
            { x: 5, y: 21 },
            { x: 8, y: 10 },
        ]);
        assert.deepEqual(pathOf(4, G), [
            { x: 10, y: 8 },
            { x: 16, y: 14 },
            { x: 21, y: 22 },
        ]);
        assert.deepEqual(
            multiply(LAB, 7, G).path.map((step) => step.k),
            [1, 2, 4, 6, 7],
        );
        assert.deepEqual(pathOf(1, G), [G]);
    });

    it("ключ варианта 7: 7 · Y_B = 4 · X_A = (16; 15)", () => {
        const XA = multiply(LAB, 7, G).result;
        const YB = multiply(LAB, 4, G).result;
        assert.deepEqual(pathOf(7, YB), [
            { x: 21, y: 22 },
            { x: 12, y: 23 },
            { x: 18, y: 4 },
            { x: 5, y: 8 },
            { x: 16, y: 15 },
        ]);
        assert.deepEqual(pathOf(4, XA), [
            { x: 8, y: 10 },
            { x: 18, y: 25 },
            { x: 16, y: 15 },
        ]);
    });

    it("у G порядок 30: 30G = O, а раньше O не встречается", () => {
        assert.equal(multiply(LAB, 30, G).result, null);
        for (let k = 1; k < 30; k++) {
            assert.notEqual(multiply(LAB, k, G).result, null, `${k}G не должна быть O`);
        }
    });

    it("при любых секретах у A и B один ключ; O — ровно когда x · y делится на 30", () => {
        for (let x = 1; x <= 29; x++) {
            for (let y = 1; y <= 29; y++) {
                const keyA = multiply(LAB, x, multiply(LAB, y, G).result).result;
                const keyB = multiply(LAB, y, multiply(LAB, x, G).result).result;
                assert.deepEqual(keyA, keyB, `x = ${x}, y = ${y}`);
                assert.equal(keyA === null, (x * y) % 30 === 0, `x = ${x}, y = ${y}`);
            }
        }
    });

    it("на 0, дробь и минус не умножает", () => {
        assert.throws(() => multiply(LAB, 0, G), RangeError);
        assert.throws(() => multiply(LAB, 1.5, G), RangeError);
        assert.throws(() => multiply(LAB, -3, G), RangeError);
    });
});
