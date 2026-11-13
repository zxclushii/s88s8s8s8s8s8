// @ts-check
// Ход вычисления — как в тетради лабы 9: из чего складывается P + Q, 2P, −P и kP. Только чистые функции.
// Шаг — это строка, у которой ответ лежит отдельно: его можно спрятать и дать посчитать самому, как в
// упражнениях программы FiniteField.

import { add, inverse, mod, negate, subgroup } from "./curve.js";

/** @typedef {import("./curve.js").Curve} Curve */
/** @typedef {import("./curve.js").Point} Point */
/** @typedef {{ x: number, y: number }} Spot */

/**
 * Шаг решения. formula — что считаем; work — промежуточные числа; answer — ответ, его прячут в упражнении;
 * note — пояснение после ответа (в упражнении видно только после проверки); sign — чем ответ присоединяется.
 * Целиком строка читается так: formula work sign answer, note.
 * @typedef {{ formula: string, work?: string, answer?: string, note?: string, sign?: string }} Step
 */

/**
 * Число с настоящим минусом: −8.
 * @param {number} n
 */
export function signed(n) {
    return String(n).replace("-", "−");
}

/**
 * Число в произведении: отрицательное — в скобках, 25 · (−4).
 * @param {number} n
 */
function factor(n) {
    return n < 0 ? `(${signed(n)})` : String(n);
}

/**
 * Слагаемое со знаком: + 2, − 1, а ноль не пишется.
 * @param {number} n
 */
function term(n) {
    if (n === 0) {
        return "";
    }
    return n < 0 ? ` − ${-n}` : ` + ${n}`;
}

/**
 * Точка в тетрадном виде: (8; 10), O — точка на бесконечности.
 * @param {Point} point
 */
export function spot(point) {
    return point === null ? "O" : `(${point.x}; ${point.y})`;
}

/**
 * Обратное число по модулю p с проверкой, как в тетради: 16⁻¹ ≡ 20, потому что 16 · 20 = 320 = 11 · 29 + 1.
 * @param {number} n от 1 до p − 1
 * @param {number} p
 * @returns {Step}
 */
export function inverseStep(n, p) {
    const value = inverse(n, p);
    const product = n * value;
    const times = (product - 1) / p;
    return {
        formula: `${n}⁻¹`,
        answer: String(value),
        note:
            times === 0
                ? `потому что ${n} · ${value} = 1`
                : `потому что ${n} · ${value} = ${product} = ${times} · ${p} + 1`,
    };
}

/**
 * P + Q по шагам: наклон дробью, обратное к знаменателю, наклон по модулю, x₃ и y₃, ответ. P = Q — удвоение
 * через касательную. Вертикаль — Q = −P или касательная при y = 0 — короче: сумма сразу O.
 * @param {Curve} curve
 * @param {Spot} P
 * @param {Spot} Q
 * @returns {Step[]}
 */
export function additionSteps(curve, P, Q) {
    const { p, a } = curve;
    const doubling = P.x === Q.x && P.y === Q.y;
    const name = doubling ? "2P" : "P + Q";
    const sum = add(curve, P, Q);
    if (sum === null) {
        if (doubling) {
            return [
                {
                    formula: "2y₁",
                    work: `= 2 · ${P.y}`,
                    answer: "0",
                    note: "делить не на что: касательная вертикальная",
                },
                { formula: name, answer: "O", sign: "=" },
            ];
        }
        return [
            {
                formula: "x₂ = x₁",
                work: `= ${P.x}, y₂ = ${Q.y} = ${p} − ${P.y}`,
                note: "Q = −P, и прямая через них вертикальная: третьей точки нет",
            },
            { formula: name, answer: "O", sign: "=" },
        ];
    }

    // наклон — как написали бы в тетради, со знаками и до сокращения по модулю
    let top = doubling ? 3 * P.x ** 2 + a : Q.y - P.y;
    let bottom = doubling ? 2 * P.y : Q.x - P.x;
    const shown = doubling
        ? `= (3 · ${P.x}²${term(a)}) / (2 · ${P.y}) = ${signed(top)} / ${bottom}`
        : `= (${Q.y} − ${P.y}) / (${Q.x} − ${P.x}) = ${signed(top)} / ${signed(bottom)}`;
    /** @type {Step[]} */
    const steps = [];
    let work = shown;
    // минус переносим в числитель, большие числа сокращаем по модулю: 299 / 16 ≡ 9 / 16
    if (bottom < 0) {
        top = -top;
        bottom = -bottom;
        work += ` = ${signed(top)} / ${bottom}`;
    }
    const reducedTop = Math.abs(top) >= p ? mod(top, p) : top;
    const reducedBottom = bottom >= p ? mod(bottom, p) : bottom;
    if (reducedTop !== top || reducedBottom !== bottom) {
        work += ` ≡ ${signed(reducedTop)} / ${reducedBottom}`;
    }
    steps.push({ formula: doubling ? "λ = (3x₁² + a) / 2y₁" : "λ = (y₂ − y₁) / (x₂ − x₁)", work });

    const lambda = mod(reducedTop * inverse(reducedBottom, p), p);
    if (reducedBottom === 1) {
        steps.push({
            formula: "λ",
            work: reducedTop === lambda ? undefined : `= ${signed(reducedTop)}`,
            answer: String(lambda),
        });
    } else {
        const flipped = inverse(reducedBottom, p);
        steps.push(inverseStep(reducedBottom, p));
        const product = reducedTop * flipped;
        steps.push({
            formula: `λ ≡ ${signed(reducedTop)} · ${reducedBottom}⁻¹`,
            work: `= ${factor(reducedTop)} · ${flipped}${product === lambda ? "" : ` = ${signed(product)}`}`,
            answer: String(lambda),
        });
    }

    const xValue = doubling ? lambda ** 2 - 2 * P.x : lambda ** 2 - P.x - Q.x;
    steps.push({
        formula: doubling ? "x₃ ≡ λ² − 2x₁" : "x₃ ≡ λ² − x₁ − x₂",
        work: `= ${lambda ** 2} − ${doubling ? 2 * P.x : `${P.x} − ${Q.x}`}${xValue === sum.x ? "" : ` = ${signed(xValue)}`}`,
        answer: String(sum.x),
    });
    const yValue = lambda * (P.x - sum.x) - P.y;
    steps.push({
        formula: "y₃ ≡ λ(x₁ − x₃) − y₁",
        work: `= ${lambda}(${P.x} − ${sum.x}) − ${P.y}${yValue === sum.y ? "" : ` = ${signed(yValue)}`}`,
        answer: String(sum.y),
    });
    steps.push({ formula: name, answer: spot(sum), sign: "=" });
    return steps;
}

/**
 * −P и P + (−P) = O.
 * @param {Curve} curve
 * @param {Spot} P
 * @returns {Step[]}
 */
export function inverseSteps(curve, P) {
    const minus = negate(curve, P);
    return [
        {
            formula: "−P",
            work: `= (${P.x}; −${P.y}) = (${P.x}; ${curve.p} − ${P.y})`,
            answer: spot(minus),
            sign: "=",
        },
        { formula: "P + (−P)", answer: "O", sign: "=", note: "прямая через P и −P вертикальная, третьей точки нет" },
    ];
}

/**
 * Все кратные P до O: kP = (k − 1)P + P.
 * @param {Curve} curve
 * @param {Spot} P
 * @returns {Step[]}
 */
export function multipleSteps(curve, P) {
    return subgroup(curve, P).map((point, i) => ({
        formula: i === 0 ? "P" : `${i + 1}P`,
        work: i === 0 ? undefined : `= ${i === 1 ? "P" : `${i}P`} + P`,
        answer: spot(point),
        sign: "=",
    }));
}
