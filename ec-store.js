// @ts-check
// Одна кривая по модулю p на две вкладки elept1c curv3ss — «по модулю p» и «параметры»: поменяли a, b или p
// на одной — другая пересчитывается сама.

/** @typedef {import("./curve.js").Curve} Curve */

/**
 * @typedef {object} CurveStore
 * @property {() => Curve} get
 * @property {(curve: Curve) => void} set
 * @property {(listener: (curve: Curve) => void) => void} subscribe
 */

// p такие, чтобы сетка p × p читалась на рисунке; от 5, потому что по модулю 2 и 3 кривые пишут иначе
export const P_MIN = 5;
export const P_MAX = 97;
// a и b берутся по модулю p, так что больших и не нужно
export const COEFFICIENT_LIMIT = 999;

/**
 * @param {Curve} initial
 * @returns {CurveStore}
 */
export function createCurveStore(initial) {
    let curve = initial;
    /** @type {((curve: Curve) => void)[]} */
    const listeners = [];
    return {
        get: () => curve,
        set(next) {
            curve = next;
            for (const listener of listeners) {
                listener(curve);
            }
        },
        subscribe(listener) {
            listeners.push(listener);
        },
    };
}

/**
 * Новое значение из поля a, b или p. Пока набирают — например, «1» на пути к 13 — может прийти то, что
 * ещё не годится: тогда null, и кривая остаётся прежней.
 * @param {Curve} curve
 * @param {"a" | "b" | "p"} name
 * @param {string} value
 * @returns {Curve | null}
 */
export function parseCurveField(curve, name, value) {
    const number = Number(value.trim());
    if (value.trim() === "" || !Number.isInteger(number)) {
        return null;
    }
    if (name === "p") {
        return number >= P_MIN && number <= P_MAX ? { ...curve, p: number } : null;
    }
    if (Math.abs(number) > COEFFICIENT_LIMIT) {
        return null;
    }
    return { ...curve, [name]: number };
}
