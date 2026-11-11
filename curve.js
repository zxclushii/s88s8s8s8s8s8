// @ts-check
// Эллиптическая кривая y² = x³ + ax + b по модулю простого p — математика для демки во вкладке work.
// Только чистые функции: точки кривой, сложение, удвоение и умножение точки на число.

/**
 * Точка кривой; null — точка на бесконечности O (ноль группы: P + O = P).
 * @typedef {{ x: number, y: number } | null} Point
 */

/** @typedef {{ p: number, a: number, b: number }} Curve */

/** Кривая из лабы 9, вариант 7: y² = x³ − x + 2 (mod 29). */
export const LAB = Object.freeze({ p: 29, a: -1, b: 2 });
/** Базовая точка варианта 7. */
export const G = Object.freeze({ x: 10, y: 8 });

/**
 * Остаток, который не бывает отрицательным: в JS −3 % 29 даёт −3, а нужно 26.
 * @param {number} n
 * @param {number} p
 */
export function mod(n, p) {
    return ((n % p) + p) % p;
}

/**
 * Обратное число по модулю p — расширенным алгоритмом Евклида, как в лабе.
 * @param {number} n
 * @param {number} p простое
 */
export function inverse(n, p) {
    let [r, nextR] = [p, mod(n, p)];
    let [t, nextT] = [0, 1];
    while (nextR !== 0) {
        const q = Math.floor(r / nextR);
        [r, nextR] = [nextR, r - q * nextR];
        [t, nextT] = [nextT, t - q * nextT];
    }
    if (r !== 1) {
        throw new RangeError(`у ${n} нет обратного по модулю ${p}`);
    }
    return mod(t, p);
}

/**
 * @param {Curve} curve
 * @param {Point} point
 */
export function onCurve({ p, a, b }, point) {
    if (point === null) {
        return true;
    }
    const { x, y } = point;
    return mod(y * y - (x * x * x + a * x + b), p) === 0;
}

/**
 * Все точки кривой, кроме O, — по возрастанию x, потом y.
 * @param {Curve} curve
 * @returns {{ x: number, y: number }[]}
 */
export function curvePoints(curve) {
    const found = [];
    for (let x = 0; x < curve.p; x++) {
        for (let y = 0; y < curve.p; y++) {
            if (onCurve(curve, { x, y })) {
                found.push({ x, y });
            }
        }
    }
    return found;
}

/**
 * P + Q. Одинаковые точки — удвоение (касательная), P и −P дают O.
 * @param {Curve} curve
 * @param {Point} P
 * @param {Point} Q
 * @returns {Point}
 */
export function add({ p, a }, P, Q) {
    if (P === null) {
        return Q;
    }
    if (Q === null) {
        return P;
    }
    // одна вертикаль: либо Q = −P, либо удвоение точки с y = 0 — прямая уходит в бесконечность
    if (P.x === Q.x && mod(P.y + Q.y, p) === 0) {
        return null;
    }
    const lambda =
        P.x === Q.x ? mod((3 * P.x * P.x + a) * inverse(2 * P.y, p), p) : mod((Q.y - P.y) * inverse(Q.x - P.x, p), p);
    const x = mod(lambda * lambda - P.x - Q.x, p);
    return { x, y: mod(lambda * (P.x - x) - P.y, p) };
}

/**
 * kP тем же способом, что в лабе: удвоения P → 2P → 4P…, потом нужные степени двойки
 * складываются от старшей к младшей (7P = 4P + 2P + P). Путь — точки в том порядке,
 * в каком они появлялись: для 7 это P, 2P, 4P, 6P, 7P. Его рисует демка.
 * @param {Curve} curve
 * @param {number} k целое, от 1
 * @param {Point} P
 * @returns {{ result: Point, path: { k: number, point: Point }[] }}
 */
export function multiply(curve, k, P) {
    if (!Number.isInteger(k) || k < 1) {
        throw new RangeError(`умножать можно на целое от 1, а пришло ${k}`);
    }
    /** @type {Point[]} */
    const powers = [P];
    /** @type {{ k: number, point: Point }[]} */
    const path = [{ k: 1, point: P }];
    while (2 ** powers.length <= k) {
        const point = add(curve, powers[powers.length - 1], powers[powers.length - 1]);
        powers.push(point);
        path.push({ k: 2 ** (powers.length - 1), point });
    }
    const top = powers.length - 1;
    let sum = 2 ** top;
    let result = powers[top];
    for (let bit = top - 1; bit >= 0; bit--) {
        if (k & (2 ** bit)) {
            sum += 2 ** bit;
            result = add(curve, result, powers[bit]);
            path.push({ k: sum, point: result });
        }
    }
    return { result, path };
}
