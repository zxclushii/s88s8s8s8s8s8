// @ts-check
// Шифр Эль-Гамаля на кривой — как вкладка Encryption в программе FiniteField: у получателя закрытый ключ d и
// открытый Q = dG; сообщение m переводится в точку M; шифротекст — пара точек C₁ = kG и C₂ = M + kQ со случайным
// k; расшифровка — M = C₂ − dC₁, потому что dC₁ = dkG = kQ. Только чистые функции.

import { add, mod, multiply, negate } from "./curve.js";
import { spot } from "./ec-steps.js";

/** @typedef {import("./curve.js").Curve} Curve */
/** @typedef {import("./curve.js").Point} Point */
/** @typedef {import("./ec-steps.js").Step} Step */
/** @typedef {{ x: number, y: number }} Spot */

/** Сообщение m кладётся в x = 3m, 3m + 1 или 3m + 2 — по Коблицу; обратно m = ⌊x / 3⌋. */
export const KOBLITZ = 3;

/**
 * Самое большое m, для которого есть хотя бы одно x = 3m меньше p.
 * @param {number} p
 */
export function maxMessage(p) {
    return Math.floor((p - 1) / KOBLITZ);
}

/**
 * Сообщение m — в точку кривой: перебираем x = 3m + j, пока x³ + ax + b не окажется квадратом по модулю p.
 * Не нашлось ни одного — точки для этого m нет, нужно другое.
 * @param {Curve} curve
 * @param {number} m
 * @returns {{ tries: { j: number, x: number, value: number, root: number | null }[], point: Spot | null }}
 */
export function messagePoint({ p, a, b }, m) {
    const tries = [];
    for (let j = 0; j < KOBLITZ; j++) {
        const x = KOBLITZ * m + j;
        if (x >= p) {
            break;
        }
        const value = mod(x ** 3 + a * x + b, p);
        let root = null;
        for (let y = 0; y <= p / 2; y++) {
            if ((y * y) % p === value) {
                root = y;
                break;
            }
        }
        tries.push({ j, x, value, root });
        if (root !== null) {
            return { tries, point: { x, y: root } };
        }
    }
    return { tries, point: null };
}

/**
 * Обратно из точки в сообщение: m = ⌊x / 3⌋.
 * @param {Spot} point
 */
export function messageOf(point) {
    return Math.floor(point.x / KOBLITZ);
}

/**
 * Зашифровать M и сразу расшифровать: все точки по дороге.
 * @param {Curve} curve
 * @param {Spot} G базовая точка простого порядка
 * @param {number} d закрытый ключ, целое от 1
 * @param {number} k случайное число отправителя, целое от 1
 * @param {Spot} M сообщение-точка
 */
export function elgamal(curve, G, d, k, M) {
    const Q = multiply(curve, d, G).result;
    const C1 = multiply(curve, k, G).result;
    const kQ = multiply(curve, k, Q).result;
    const C2 = add(curve, M, kQ);
    const dC1 = multiply(curve, d, C1).result;
    const opened = add(curve, C2, negate(curve, dC1));
    return { Q, C1, kQ, C2, dC1, opened };
}

/**
 * Весь шифр по шагам — от ключей до расшифровки, с перебором x для сообщения.
 * @param {Curve} curve
 * @param {{ G: Spot, q: number, d: number, k: number, m: number }} input
 * @returns {{ steps: Step[], M: Spot | null, result: ReturnType<typeof elgamal> | null }}
 */
export function cipherSteps(curve, { G, q, d, k, m }) {
    /** @type {Step[]} */
    const steps = [
        { formula: "G", answer: spot(G), sign: "=", note: `точка порядка q = ${q}: ${q}G = O` },
        {
            formula: `Q = dG = ${d} · ${spot(G)}`,
            answer: spot(multiply(curve, d, G).result),
            sign: "=",
            note: "открытый ключ",
        },
    ];
    const { tries, point: M } = messagePoint(curve, m);
    for (const { j, x, value, root } of tries) {
        steps.push({
            formula: `j = ${j}: x = ${KOBLITZ} · ${m} + ${j} = ${x}; x³ + ax + b ≡ ${value}`,
            note: root === null ? "не квадрат" : `это ${root}², квадрат`,
        });
    }
    if (M === null) {
        steps.push({ formula: "M", note: `для m = ${m} точки нет: ни одно x не дало квадрат — возьми другое m` });
        return { steps, M: null, result: null };
    }
    const result = elgamal(curve, G, d, k, M);
    steps.push(
        { formula: `M`, answer: spot(M), sign: "=", note: `сообщение m = ${m} на кривой` },
        { formula: `C₁ = kG = ${k} · ${spot(G)}`, answer: spot(result.C1), sign: "=" },
        { formula: `kQ = ${k} · ${spot(result.Q)}`, answer: spot(result.kQ), sign: "=" },
        {
            formula: `C₂ = M + kQ = ${spot(M)} + ${spot(result.kQ)}`,
            answer: spot(result.C2),
            sign: "=",
            note: "шифротекст — пара (C₁; C₂)",
        },
        {
            formula: `dC₁ = ${d} · ${spot(result.C1)}`,
            answer: spot(result.dC1),
            sign: "=",
            note: "то же, что kQ: dkG = kdG",
        },
        {
            formula: `M = C₂ − dC₁ = ${spot(result.C2)} + ${spot(negate(curve, result.dC1))}`,
            answer: spot(result.opened),
            sign: "=",
            note: "расшифровано",
        },
        {
            formula: `m = ⌊x / ${KOBLITZ}⌋ = ⌊${result.opened === null ? "?" : result.opened.x} / ${KOBLITZ}⌋`,
            answer: String(result.opened === null ? "?" : messageOf(result.opened)),
            sign: "=",
        },
    );
    return { steps, M, result };
}
