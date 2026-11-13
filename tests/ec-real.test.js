import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addReal, curveLines, kindOf, nearestPoint, rhs, roots, stepAlong } from "../ec-real.js";

/** @typedef {import("../ec-real.js").RealPoint} RealPoint */

/**
 * Точка лежит на кривой: y² совпадает с x³ + ax + b с учётом погрешности.
 * @param {number} a
 * @param {number} b
 * @param {RealPoint} point
 */
function onCurve(a, b, point) {
    const right = rhs(a, b, point.x);
    return Math.abs(point.y ** 2 - right) <= 1e-9 * Math.max(1, Math.abs(right));
}

/**
 * Точка на верхней половине кривой с данным x.
 * @param {number} a
 * @param {number} b
 * @param {number} x
 * @param {1 | -1} [sign]
 */
function at(a, b, x, sign = 1) {
    return { x, y: sign * Math.sqrt(rhs(a, b, x)) };
}

/**
 * @param {RealPoint} u
 * @param {RealPoint} v
 * @param {number} [eps]
 */
function close(u, v, eps = 1e-9) {
    return (
        Math.abs(u.x - v.x) <= eps * Math.max(1, Math.abs(u.x)) &&
        Math.abs(u.y - v.y) <= eps * Math.max(1, Math.abs(u.y))
    );
}

describe("тип кривой и корни", () => {
    it("три типа — по знаку 4a³ + 27b²", () => {
        assert.deepEqual(kindOf(-1, 2), { value: 104, kind: "one" });
        assert.deepEqual(kindOf(-3, 1), { value: -81, kind: "two" });
        assert.equal(kindOf(-3, 2).kind, "singular");
        assert.equal(kindOf(0, 0).kind, "singular");
        // шаги ползунка по 0,1 копят погрешность: −3,0000000000000004 — всё ещё особая
        assert.equal(kindOf(-3.0000000000000004, 2).kind, "singular");
    });

    it("roots: простые корни обнуляют правую часть, кратные — на месте петли и острия", () => {
        for (const [a, b, count] of [
            [-1, 2, 1],
            [-3, 1, 3],
            [2, -1, 1],
            [-5, 0, 3],
        ]) {
            const { simple, multiple } = roots(a, b);
            assert.equal(simple.length, count, `a = ${a}, b = ${b}`);
            assert.deepEqual(multiple, []);
            assert.deepEqual(
                [...simple].sort((u, v) => u - v),
                simple,
            );
            for (const x of simple) {
                assert.ok(Math.abs(rhs(a, b, x)) < 1e-9, `a = ${a}, b = ${b}, x = ${x}`);
            }
        }
        // x³ − 3x + 2 = (x − 1)²(x + 2): петля в 1
        assert.deepEqual(roots(-3, 2), { simple: [-2], multiple: [1] });
        // x³ − 3x − 2 = (x + 1)²(x − 2): одинокая точка в −1
        assert.deepEqual(roots(-3, -2), { simple: [2], multiple: [-1] });
        assert.deepEqual(roots(0, 0), { simple: [], multiple: [0] });
    });
});

describe("curveLines", () => {
    it("все вершины лежат на кривой", () => {
        for (const [a, b] of [
            [-1, 2],
            [-3, 1],
            [-3, 2],
            [0, 0],
            [-3, -2],
            [1.5, -0.3],
        ]) {
            const { lines, dots } = curveLines(a, b, 3.2);
            for (const point of [...lines.flat(), ...dots]) {
                assert.ok(onCurve(a, b, point), `a = ${a}, b = ${b}: ${JSON.stringify(point)}`);
            }
        }
    });

    it("одна ветка, овал и ветка, петля через точку на оси, одинокая точка", () => {
        assert.equal(curveLines(-1, 2, 3).lines.length, 1);

        const two = curveLines(-3, 1, 3).lines;
        assert.equal(two.length, 2);
        // овал замкнут: начинается и кончается на оси в одной точке
        const oval = two[0];
        assert.equal(oval[0].x, oval.at(-1)?.x);
        assert.ok(Math.abs(oval[0].y) < 1e-9);

        const loop = curveLines(-3, 2, 3);
        assert.equal(loop.lines.length, 1);
        assert.ok(loop.lines[0].some((point) => point.x === 1 && point.y === 0));

        const lonely = curveLines(-3, -2, 3);
        assert.deepEqual(lonely.dots, [{ x: -1, y: 0 }]);
        assert.equal(lonely.lines.length, 1);
    });

    it("ветка правее края рисунка не рисуется", () => {
        // x³ − 3x − 30: единственный корень около 3,5
        assert.deepEqual(curveLines(-3, -30, 3).lines, []);
    });
});

describe("addReal", () => {
    const a = -1;
    const b = 2;
    const P = at(a, b, -1.3);
    const Q = at(a, b, 0.2);

    it("третья точка — на кривой и на прямой через P и Q, сумма — её отражение", () => {
        const result = addReal(a, P, Q);
        assert.ok(result);
        assert.ok(onCurve(a, b, result.third));
        assert.ok(Math.abs(result.third.y - P.y - result.lambda * (result.third.x - P.x)) < 1e-9);
        assert.ok(Math.abs(Q.y - P.y - result.lambda * (Q.x - P.x)) < 1e-9);
        assert.deepEqual(result.sum, { x: result.third.x, y: -result.third.y });
        assert.ok(Math.abs(result.lambda - 0.1966) < 1e-3);
    });

    it("P + P — касательная, 2P на кривой", () => {
        const result = addReal(a, P, P);
        assert.ok(result);
        assert.equal(result.lambda, (3 * P.x * P.x + a) / (2 * P.y));
        assert.ok(onCurve(a, b, result.sum));
    });

    it("вертикаль даёт O: Q = −P и касательная в точке на оси", () => {
        assert.equal(addReal(a, P, { x: P.x, y: -P.y }), null);
        const [root] = roots(a, b).simple;
        assert.equal(addReal(a, { x: root, y: 0 }, { x: root, y: 0 }), null);
    });

    it("сложение не зависит от порядка и от расстановки скобок", () => {
        const R = at(a, b, 1.7, -1);
        const pq = addReal(a, P, Q);
        const qp = addReal(a, Q, P);
        assert.ok(pq && qp && close(pq.sum, qp.sum));
        const qr = addReal(a, Q, R);
        assert.ok(qr);
        const left = addReal(a, pq.sum, R);
        const right = addReal(a, P, qr.sum);
        assert.ok(left && right && close(left.sum, right.sum, 1e-7));
    });
});

describe("nearestPoint и stepAlong", () => {
    const { lines } = curveLines(-1, 2, 3.2);

    it("ближайшая вершина — на кривой и рядом с курсором", () => {
        const found = nearestPoint(lines, { x: 0.5, y: 1.4 });
        assert.ok(found);
        assert.ok(onCurve(-1, 2, found.point));
        assert.ok(Math.hypot(found.point.x - 0.5, found.point.y - Math.sqrt(rhs(-1, 2, 0.5))) < 0.05);
        assert.equal(nearestPoint([], { x: 0, y: 0 }), null);
    });

    it("шаг вдоль кривой не выходит за концы ломаной", () => {
        const start = lines[0][10];
        assert.deepEqual(stepAlong(lines, start, 5), lines[0][15]);
        assert.deepEqual(stepAlong(lines, start, -50), lines[0][0]);
        assert.deepEqual(stepAlong(lines, start, 1e6), lines[0].at(-1));
        assert.equal(stepAlong([], start, 1), null);
    });
});
