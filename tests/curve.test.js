import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    G,
    LAB,
    add,
    curvePoints,
    discriminant,
    hasse,
    inverse,
    isPrime,
    largestPrimeFactor,
    lineStep,
    mod,
    multiply,
    negate,
    onCurve,
    pointOfOrder,
    slope,
    subgroup,
    wrapDirection,
    wrapSegments,
} from "../curve.js";

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

describe("наклон, −P и подгруппы", () => {
    it("slope — та же дробь, что в тетради лабы 9", () => {
        // 2G: (3 · 10² − 1) / (2 · 8) = 299 / 16 ≡ 6
        assert.deepEqual(slope(LAB, G, G), { num: 299, den: 16, value: 6 });
        // 6G = 4G + 2G: (14 − 22) / (16 − 21) = −8 / −5 ≡ 19
        assert.deepEqual(slope(LAB, { x: 21, y: 22 }, { x: 16, y: 14 }), { num: -8, den: -5, value: 19 });
    });

    it("negate отражает через p/2, а P + (−P) = O", () => {
        assert.deepEqual(negate(LAB, G), { x: 10, y: 21 });
        assert.equal(negate(LAB, null), null);
        assert.equal(add(LAB, G, negate(LAB, G)), null);
        assert.deepEqual(negate(LAB, { x: 25, y: 0 }), { x: 25, y: 0 });
    });

    it("подгруппа G — 30 точек до O, у 6G — 5, у точки с y = 0 — 2", () => {
        const ofG = subgroup(LAB, G);
        assert.equal(ofG.length, 30);
        assert.deepEqual(ofG[1], { x: 16, y: 14 });
        assert.equal(ofG.at(-1), null);
        assert.deepEqual(subgroup(LAB, { x: 5, y: 21 }), [
            { x: 5, y: 21 },
            multiply(LAB, 12, G).result,
            multiply(LAB, 18, G).result,
            multiply(LAB, 24, G).result,
            null,
        ]);
        assert.deepEqual(subgroup(LAB, { x: 25, y: 0 }), [{ x: 25, y: 0 }, null]);
    });
});

describe("параметры кривой для шифра", () => {
    it("isPrime", () => {
        for (const n of [2, 3, 5, 29, 31, 97]) {
            assert.equal(isPrime(n), true, String(n));
        }
        for (const n of [-7, 0, 1, 4, 30, 91, 2.5, Number.NaN]) {
            assert.equal(isPrime(n), false, String(n));
        }
    });

    it("largestPrimeFactor", () => {
        assert.equal(largestPrimeFactor(30), 5);
        assert.equal(largestPrimeFactor(32), 2);
        assert.equal(largestPrimeFactor(31), 31);
        assert.equal(largestPrimeFactor(2), 2);
        assert.equal(largestPrimeFactor(98), 7);
        assert.throws(() => largestPrimeFactor(1), RangeError);
        assert.throws(() => largestPrimeFactor(6.5), RangeError);
    });

    it("discriminant и рамка Хассе для кривой лабы 9", () => {
        assert.deepEqual(discriminant(LAB), { value: 104, residue: 17 });
        const { low, high } = hasse(29);
        assert.ok(Math.abs(low - (30 - 2 * Math.sqrt(29))) < 1e-12);
        assert.ok(low < 30 && 30 < high);
    });

    it("pointOfOrder: у кривой лабы 9 m = 30, точка порядка 5 — это 6G", () => {
        assert.deepEqual(pointOfOrder(LAB, 5, G), { base: G, n: 6, point: { x: 5, y: 21 } });
        const any = pointOfOrder(LAB, 5);
        assert.ok(any);
        assert.equal(subgroup(LAB, any.point).length, 5);
        assert.deepEqual(any.point, multiply(LAB, any.n, any.base).result);
    });

    it("pointOfOrder находит точку порядка 2, даже когда у всех точек 4G = O", () => {
        // y² = x³ − x по модулю 5: восемь точек, группа Z/2 × Z/4
        const curve = { p: 5, a: -1, b: 0 };
        assert.equal(curvePoints(curve).length + 1, 8);
        for (const point of curvePoints(curve)) {
            assert.equal(multiply(curve, 4, point).result, null);
        }
        const found = pointOfOrder(curve, 2);
        assert.ok(found);
        assert.equal(subgroup(curve, found.point).length, 2);
    });

    it("на всех гладких кривых с p до 47: m в рамке Хассе, точка порядка q находится", () => {
        for (const p of [5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]) {
            for (let a = -3; a <= 3; a++) {
                for (let b = -3; b <= 3; b++) {
                    const curve = { p, a, b };
                    if (discriminant(curve).residue === 0) {
                        continue;
                    }
                    const m = curvePoints(curve).length + 1;
                    const { low, high } = hasse(p);
                    assert.ok(low <= m && m <= high, `p = ${p}, a = ${a}, b = ${b}: m = ${m}`);
                    if (m === 1) {
                        continue;
                    }
                    const q = largestPrimeFactor(m);
                    const found = pointOfOrder(curve, q);
                    assert.ok(found, `p = ${p}, a = ${a}, b = ${b}`);
                    assert.equal(subgroup(curve, found.point).length, q, `p = ${p}, a = ${a}, b = ${b}`);
                }
            }
        }
    });
});

describe("прямая по модулю для рисунка", () => {
    /**
     * Где змейка стоит в момент t.
     * @param {ReturnType<typeof wrapSegments>} segments
     * @param {number} t
     */
    function at(segments, t) {
        const segment = segments.find((s) => s.t0 <= t && t <= s.t1);
        assert.ok(segment, `нет куска для t = ${t}`);
        const k = segment.t1 === segment.t0 ? 0 : (t - segment.t0) / (segment.t1 - segment.t0);
        return {
            x: segment.from.x + (segment.to.x - segment.from.x) * k,
            y: segment.from.y + (segment.to.y - segment.from.y) * k,
        };
    }

    it("wrapDirection выбирает самое короткое направление той же прямой", () => {
        // G и 4G: (11; 14) ≡ 8 · (1; −4) по модулю 29
        assert.deepEqual(wrapDirection(29, 11, 14), { dx: 1, dy: -4 });
        assert.equal(mod(-4 * 11 - 1 * 14, 29), 0);
        assert.deepEqual(wrapDirection(29, 0, 5), { dx: 0, dy: 1 });
        assert.throws(() => wrapDirection(29, 29, 58), RangeError);
    });

    it("змейка не выходит за поле, замыкается в P и проходит через все точки прямой", () => {
        const d = wrapDirection(29, 11, 14);
        const segments = wrapSegments(29, G, d);
        assert.equal(segments.length, 6);
        assert.equal(segments[0].t0, 0);
        assert.equal(segments.at(-1)?.t1, 29);
        for (const s of segments) {
            for (const end of [s.from, s.to]) {
                assert.ok(end.x >= -0.5 - 1e-9 && end.x <= 28.5 + 1e-9, JSON.stringify(end));
                assert.ok(end.y >= -0.5 - 1e-9 && end.y <= 28.5 + 1e-9, JSON.stringify(end));
            }
        }
        for (let t = 0; t < 29; t++) {
            const point = at(segments, t);
            assert.ok(Math.abs(point.x - mod(G.x + t * d.dx, 29)) < 1e-9, `t = ${t}`);
            assert.ok(Math.abs(point.y - mod(G.y + t * d.dy, 29)) < 1e-9, `t = ${t}`);
        }
    });

    it("lineStep: когда змейка из G доходит до 4G и до третьей точки", () => {
        const d = wrapDirection(29, 11, 14);
        const segments = wrapSegments(29, G, d);
        for (const R of [
            { x: 21, y: 22 },
            { x: 14, y: 21 },
        ]) {
            const t = lineStep(29, G, d, R);
            const point = at(segments, t);
            assert.ok(Math.abs(point.x - R.x) < 1e-9 && Math.abs(point.y - R.y) < 1e-9, JSON.stringify(R));
        }
        assert.equal(lineStep(29, G, d, G), 0);
        assert.throws(() => lineStep(29, G, d, { x: 21, y: 21 }), RangeError);
    });
});
