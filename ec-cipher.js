// @ts-check
// Вкладка «шифр» — как окно Encryption в программе FiniteField: Эль-Гамаль на кривой из вкладок 2 и 3.
// У получателя закрытый ключ d и открытый Q = dG; сообщение m становится точкой M; отправитель берёт случайное k
// и отправляет C₁ = kG и C₂ = M + kQ; получатель считает C₂ − dC₁ и получает M обратно. На рисунке точки
// появляются в том порядке, в каком их считают; ход вычисления можно открыть по шагам или посчитать самому.

import { G as LAB_G, curvePoints, discriminant, isPrime, largestPrimeFactor, pointOfOrder, subgroup } from "./curve.js";
import { byId } from "./dom.js";
import { drawFieldBase, fieldScale, fillRows, formatPoint, play, pointName, stage, star, svg } from "./ec-draw.js";
import { cipherSteps, maxMessage } from "./ec-elgamal.js";
import { createSolution } from "./ec-solution.js";

/** @typedef {import("./curve.js").Curve} Curve */
/** @typedef {import("./ec-store.js").CurveStore} CurveStore */
/** @typedef {{ x: number, y: number }} Spot */

// сетка — та же, что во вкладке «по модулю p»
const AREA = { left: 40, top: 70, size: 584 };
const EDGES = { right: AREA.left + AREA.size, top: AREA.top };
// точки протокола появляются по очереди: G, Q, M, C₁, C₂, потом расшифровка
const BEAT = 320;

/**
 * Годится ли кривая для шифра и какая у неё базовая точка: G простого порядка q, как во вкладке «параметры».
 * @param {Curve} curve
 * @returns {{ ok: true, G: Spot, q: number } | { ok: false, why: string }}
 */
function basePoint(curve) {
    if (!isPrime(curve.p)) {
        return { ok: false, why: `p = ${curve.p} не простое — поля нет, шифровать не на чем` };
    }
    if (discriminant(curve).residue === 0) {
        return { ok: false, why: "кривая особая: 4a³ + 27b² ≡ 0, для шифра не годится" };
    }
    const m = curvePoints(curve).length + 1;
    const q = largestPrimeFactor(m);
    const found = pointOfOrder(curve, q, LAB_G);
    if (found === null || q < 2) {
        return { ok: false, why: "не нашлось точки простого порядка" };
    }
    return { ok: true, G: found.point, q };
}

/**
 * Целое из поля в пределах; не число — null.
 * @param {string} value
 * @param {number} low
 * @param {number} high
 */
function parseWithin(value, low, high) {
    const number = Number(value.trim());
    if (value.trim() === "" || !Number.isInteger(number)) {
        return null;
    }
    return Math.min(high, Math.max(low, number));
}

/**
 * Подключает вкладку к разметке из index.html.
 * @param {CurveStore} store
 */
export function mountCipher(store) {
    const plot = byId("cipher-plot", SVGSVGElement);
    const solutionBox = byId("cipher-solution", HTMLElement);
    const solution = createSolution(solutionBox);
    const viewButtons = byId("cipher-views", HTMLElement).querySelectorAll("button");
    const out = byId("cipher-out", HTMLElement);
    const note = byId("cipher-note", HTMLElement);
    const fields = {
        d: byId("cipher-d", HTMLInputElement),
        k: byId("cipher-k", HTMLInputElement),
        m: byId("cipher-m", HTMLInputElement),
    };
    const ranges = {
        d: byId("cipher-d-range", HTMLElement),
        k: byId("cipher-k-range", HTMLElement),
        m: byId("cipher-m-range", HTMLElement),
    };

    const state = { d: 3, k: 2, m: 5, view: /** @type {"plot" | "solution"} */ ("plot") };
    let stop = () => {};

    /**
     * Пределы полей для текущей кривой: d и k — от 1 до q − 1, m — пока 3m меньше p.
     * @param {number} q
     */
    function limits(q) {
        return { d: [1, q - 1], k: [1, q - 1], m: [0, maxMessage(store.get().p)] };
    }

    /** @param {boolean} animate */
    function draw(animate) {
        stop();
        const curve = store.get();
        const base = basePoint(curve);
        const field = fieldScale(curve.p, AREA);
        const { X, Y } = field;
        plot.replaceChildren();
        const points = curvePoints(curve);
        drawFieldBase(svg("g", {}, plot), curve.p, field, points);

        for (const input of Object.values(fields)) {
            input.disabled = !base.ok;
        }
        if (!base.ok) {
            fillRows(out, []);
            note.textContent = `Кривая ${base.why}. Поменяй a, b или p во вкладке «параметры».`;
            solution.show("шифровать не на чем", []);
            return;
        }

        // пределы полей и сами числа — под новую кривую
        const bounds = limits(base.q);
        for (const name of /** @type {("d" | "k" | "m")[]} */ (["d", "k", "m"])) {
            const [low, high] = bounds[name];
            state[name] = Math.min(high, Math.max(low, state[name]));
            fields[name].min = String(low);
            fields[name].max = String(high);
            if (document.activeElement !== fields[name]) {
                fields[name].value = String(state[name]);
            }
            ranges[name].textContent = `${low} до ${high}`;
        }

        const { G, q } = base;
        const { steps, M, result } = cipherSteps(curve, { G, q, d: state.d, k: state.k, m: state.m });
        solution.show(`шифр: m = ${state.m}, d = ${state.d}, k = ${state.k} по модулю ${curve.p}`, steps);

        // подгруппа G чуть ярче остальных точек: в ней живут ключи
        const group = svg("g", { class: "ec-subgroup" }, plot);
        for (const point of subgroup(curve, G)) {
            if (point !== null) {
                svg("circle", { cx: X(point.x), cy: Y(point.y), r: 3.6 }, group);
            }
        }
        const marks = svg("g", {}, plot);
        /** @type {{ at: number, nodes: Element[] }[]} */
        const beats = [];
        /**
         * Точка протокола с подписью; появится на шаге beat.
         * @param {Spot | null} point
         * @param {string} name
         * @param {"dot" | "ring" | "star"} look
         * @param {number} beat
         */
        const mark = (point, name, look, beat) => {
            if (point === null) {
                return;
            }
            const x = X(point.x);
            const y = Y(point.y);
            const shape =
                look === "star"
                    ? star(marks, x, y, 30)
                    : svg(
                          "circle",
                          { class: look === "ring" ? "ec-ring" : "ec-hot", cx: x, cy: y, r: look === "ring" ? 6 : 5 },
                          marks,
                      );
            const label = pointName(marks, x, y, name, look === "star" ? "ec-name-big" : "ec-name", EDGES);
            beats.push({ at: beat * BEAT, nodes: [shape, label] });
        };

        mark(G, "G", "dot", 0);
        /** @type {[string, string][]} */
        const rows = [["G — точка порядка q", `${formatPoint(G)}, q = ${q}`]];
        if (result === null || M === null) {
            rows.push(["сообщение", `для m = ${state.m} точки нет`]);
            fillRows(out, rows);
            note.textContent = `Сообщение кладётся в x = 3m, 3m + 1 или 3m + 2, но для m = ${state.m} ни одно x не дало квадрат — возьми другое m. Как искали, видно в «как считается».`;
        } else {
            mark(result.Q, "Q = dG", "ring", 1);
            mark(M, "M", "star", 2);
            mark(result.C1, "C₁", "dot", 3);
            mark(result.C2, "C₂", "dot", 4);
            rows.push(
                ["Q = dG — открытый ключ", formatPoint(result.Q)],
                [`M — сообщение m = ${state.m}`, formatPoint(M)],
                ["C₁ = kG", formatPoint(result.C1)],
                ["C₂ = M + kQ", formatPoint(result.C2)],
                ["C₂ − dC₁ — расшифровка", formatPoint(result.opened)],
            );
            fillRows(out, rows);
            note.textContent =
                "Получатель знает только d. Отправитель берёт случайное k и шлёт пару (C₁; C₂). dC₁ = dkG = kQ, поэтому C₂ − dC₁ = M: сообщение вернулось. Подслушавший видит Q, C₁ и C₂, но без d их не открыть.";
        }
        plot.setAttribute("aria-label", rows.map((row) => row.join(": ")).join("; "));

        stop = play(
            beats.length * BEAT + 200,
            (elapsed) => {
                for (const { at, nodes } of beats) {
                    for (const node of nodes) {
                        node.setAttribute("opacity", String(stage(elapsed, at, 200)));
                    }
                }
            },
            animate,
        );
    }

    for (const [name, input] of /** @type {["d" | "k" | "m", HTMLInputElement][]} */ (Object.entries(fields))) {
        input.addEventListener("input", () => {
            const base = basePoint(store.get());
            if (!base.ok) {
                return;
            }
            const [low, high] = limits(base.q)[name];
            const value = parseWithin(input.value, low, high);
            if (value !== null) {
                state[name] = value;
                draw(false);
            }
        });
        // ушли из поля — показываем то число, с которым считали
        input.addEventListener("change", () => {
            input.value = String(state[name]);
        });
    }

    for (const button of viewButtons) {
        button.addEventListener("click", () => {
            const view = button.dataset.view;
            if (view !== "plot" && view !== "solution") {
                throw new Error(`index.html: у кнопки вида нет имени (data-view="${view}")`);
            }
            state.view = view;
            plot.toggleAttribute("hidden", view !== "plot");
            solutionBox.hidden = view !== "solution";
            for (const other of viewButtons) {
                other.setAttribute("aria-pressed", String(other === button));
            }
            draw(true);
        });
    }

    store.subscribe(() => draw(false));
    draw(false);
    return {
        /** Показать протокол заново — когда вкладку открыли. */
        replay() {
            draw(true);
        },
    };
}
