import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LAB, curvePoints, mod } from "../curve.js";
import { evaluate, holds, parseRelation, prettyRelation, relationPoints, scanRelation } from "../ec-relation.js";

/**
 * Все точки поля p × p, для которых верно условие, — перебором, без разбора формулы.
 * @param {number} p
 * @param {(x: number, y: number) => boolean} test
 */
function brute(p, test) {
    const found = [];
    for (let x = 0; x < p; x++) {
        for (let y = 0; y < p; y++) {
            if (test(x, y)) {
                found.push({ x, y });
            }
        }
    }
    return found;
}

/**
 * Степень по модулю — для сверки y = 2^x.
 * @param {number} base
 * @param {number} exponent
 * @param {number} p
 */
function power(base, exponent, p) {
    let result = 1;
    for (let i = 0; i < exponent; i++) {
        result = (result * base) % p;
    }
    return result;
}

describe("примеры из ffplot", () => {
    it("y² = x³ + 2x + 1 mod 53 — та же кривая, что во вкладке «по модулю p»", () => {
        assert.deepEqual(relationPoints(parseRelation("y^2 = x^3 + 2*x + 1"), 53), curvePoints({ p: 53, a: 2, b: 1 }));
        // кривая лабы 9, записанная как в тетради
        assert.deepEqual(relationPoints(parseRelation("y² = x³ − x + 2"), 29), curvePoints(LAB));
    });

    it("x² = y² mod 109 — крест: y = x и y = −x", () => {
        const points = relationPoints(parseRelation("x^2 = y^2"), 109);
        assert.equal(points.length, 1 + 2 * 108);
        assert.ok(points.every(({ x, y }) => y === x || y === mod(-x, 109)));
    });

    it("y = 2^x mod 47 — по точке на каждый x, степень считается точно", () => {
        const points = relationPoints(parseRelation("y = 2^x"), 47);
        assert.deepEqual(
            points,
            Array.from({ length: 47 }, (_, x) => ({ x, y: power(2, x, 47) })),
        );
    });

    it("неравенства и остальные примеры совпадают с перебором", () => {
        assert.deepEqual(
            relationPoints(parseRelation("x^2 + y^2 < 20"), 109),
            brute(109, (x, y) => (x * x + y * y) % 109 < 20),
        );
        assert.deepEqual(
            relationPoints(parseRelation("x * y < 14"), 109),
            brute(109, (x, y) => (x * y) % 109 < 14),
        );
        assert.deepEqual(
            relationPoints(parseRelation("y^2+y = 3*x^3 +2*x^2 + x + 1"), 53),
            brute(53, (x, y) => (y * y + y) % 53 === (3 * x ** 3 + 2 * x * x + x + 1) % 53),
        );
    });
});

describe("разбор формулы", () => {
    it("умножение без знака: 3x, 2(x + 1)", () => {
        assert.deepEqual(parseRelation("y = 3x"), parseRelation("y = 3*x"));
        assert.deepEqual(parseRelation("y = 2(x + 1)"), parseRelation("y = 2*(x + 1)"));
    });

    it("старшинство: −x² = −(x²), степень правоассоциативна, · раньше +", () => {
        const at = (/** @type {string} */ text, /** @type {number} */ x) =>
            evaluate(parseRelation(text).right, x, 0, 1009);
        assert.equal(at("y = -x^2", 3), mod(-9, 1009));
        assert.equal(at("y = 2^3^2", 0), 512);
        assert.equal(at("y = 1 + 2*3", 0), 7);
        assert.equal(at("y = (1 + 2)*3", 0), 9);
    });

    it("деление и отрицательная степень — через обратное; где его нет, точки нет", () => {
        const inverses = brute(7, (x, y) => x !== 0 && (x * y) % 7 === 1);
        assert.deepEqual(relationPoints(parseRelation("y = 1/x"), 7), inverses);
        assert.deepEqual(relationPoints(parseRelation("y = x^-1"), 7), inverses);
        // по модулю 6 обратные есть только у 1 и 5
        assert.deepEqual(relationPoints(parseRelation("y = 1/x"), 6), [
            { x: 1, y: 1 },
            { x: 5, y: 5 },
        ]);
    });

    it("все знаки сравнения, и как набирают, и как пишут", () => {
        assert.equal(relationPoints(parseRelation("x != y"), 5).length, 20);
        assert.equal(relationPoints(parseRelation("x ≠ y"), 5).length, 20);
        assert.equal(relationPoints(parseRelation("x <= y"), 5).length, 15);
        assert.equal(relationPoints(parseRelation("x ≤ y"), 5).length, 15);
        assert.equal(relationPoints(parseRelation("x >= y"), 5).length, 15);
        assert.equal(relationPoints(parseRelation("x == y"), 5).length, 5);
        assert.equal(holds(parseRelation("x > y"), 3, 1, 5), true);
    });

    it("огромный показатель не вешает страницу: такие точки просто не считаются", () => {
        const relation = parseRelation("y = 2^(x^y^x)");
        assert.ok(Array.isArray(relationPoints(relation, 11)));
    });

    it("показатель до 2⁵³ считается точно: y = 2^(x³) по модулю 127 — по точке в каждом столбце", () => {
        // по малой теореме Ферма 2^n ≡ 2^(n mod 126) по модулю 127 — сверка без огромных чисел
        const expected = brute(127, (x, y) => y === power(2, x ** 3 % 126, 127));
        assert.equal(expected.length, 127);
        assert.deepEqual(relationPoints(parseRelation("y = 2^(x^3)"), 127), expected);
        const big = brute(29, (x, y) => y === (x === 0 ? 0 : power(x, 99999999 % 28, 29)));
        assert.deepEqual(relationPoints(parseRelation("y = x^99999999"), 29), big);
    });

    it("показатель больше 2⁵³ − 1 не теряется молча: такие клетки пересчитаны отдельно", () => {
        // 3³⁰ ≈ 2 · 10¹⁴ ещё точное целое, а 4³⁰ = 2⁶⁰ уже нет: столбцы x от 4 до 10 не проверить
        const { points, unknown } = scanRelation(parseRelation("y = 2^(x^30)"), 11);
        assert.deepEqual(
            points.map((point) => point.x),
            [0, 1, 2, 3],
        );
        assert.equal(unknown, 7 * 11);
        assert.deepEqual(scanRelation(parseRelation("y = 9^9^9^9"), 11), { points: [], unknown: 121 });
        assert.equal(scanRelation(parseRelation("y = x^2"), 11).unknown, 0);
    });

    it("длинная формула в пределах 300 знаков разбирается и считается", () => {
        const text = `y = ${"x+".repeat(147)}x`;
        assert.equal(text.length, 299);
        assert.deepEqual(
            relationPoints(parseRelation(text), 7),
            brute(7, (x, y) => y === (148 * x) % 7),
        );
    });

    it("понятные ошибки вместо падения", () => {
        for (const text of [
            "y^2",
            "y = (x + 1",
            "y = x $ 2",
            "= 3",
            "y = ",
            "y = 10000000000",
            "y = x) + 1",
            "x < y < 3",
            // так глубоко разбор ушёл бы в переполнение стека, а не в понятную ошибку
            `y = ${"(".repeat(5000)}x${")".repeat(5000)}`,
        ]) {
            assert.throws(() => parseRelation(text), SyntaxError, text);
        }
    });
});

describe("prettyRelation", () => {
    it("степени надстрочные, минус настоящий, знаки сравнения как в тетради", () => {
        assert.equal(prettyRelation("y^2 + y = 3*x^3 - 1"), "y² + y = 3 · x³ − 1");
        assert.equal(prettyRelation("x <= y"), "x ≤ y");
        assert.equal(prettyRelation("x != y"), "x ≠ y");
        assert.equal(prettyRelation("  y   =  2^x "), "y = 2^x");
    });
});
