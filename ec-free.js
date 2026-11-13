// @ts-check
// Вкладка «любая кривая» — как ffplot: любое уравнение или неравенство с x и y по модулю p. На сетке p × p —
// все пары (x; y), для которых оно верно; при открытии сетка проверяется столбец за столбцом. Клик по точке —
// её координаты и чему в ней равны обе части формулы.

import { isPrime } from "./curve.js";
import { byId } from "./dom.js";
import {
    dotRadius,
    drawFieldBase,
    fieldScale,
    fillRows,
    formatPoint,
    play,
    plural,
    pointName,
    star,
    svg,
} from "./ec-draw.js";
import { evaluate, parseRelation, prettyRelation, scanRelation } from "./ec-relation.js";

/** @typedef {import("./ec-relation.js").Relation} Relation */
/** @typedef {{ x: number, y: number }} Spot */

// сетка — та же, что во вкладке «по модулю p»
const AREA = { left: 40, top: 70, size: 584 };
const EDGES = { right: AREA.left + AREA.size, top: AREA.top };
// p до 127: в примерах ffplot есть 109, а клетки при 127 ещё различимы
const P_MIN = 2;
const P_MAX = 127;
// за сколько миллисекунд проверка проходит все столбцы
const SWEEP = 900;

/**
 * p из поля: целое от 2 до 127, иначе null — пока набирают, кривая остаётся прежней.
 * @param {string} value
 */
function parseModulus(value) {
    const number = Number(value.trim());
    return value.trim() !== "" && Number.isInteger(number) && number >= P_MIN && number <= P_MAX ? number : null;
}

/** Подключает вкладку к разметке из index.html. */
export function mountFree() {
    const formulaInput = byId("free-curve", HTMLInputElement);
    const modulusInput = byId("free-p", HTMLInputElement);
    const plot = byId("free-plot", SVGSVGElement);
    const formula = byId("free-eq", HTMLElement);
    const modulus = byId("free-mod", HTMLElement);
    const out = byId("free-out", HTMLElement);
    const note = byId("free-note", HTMLElement);
    const examples = byId("free-examples", HTMLElement).querySelectorAll("button");

    const state = {
        // последняя формула, которая разобралась: пока набирают с ошибкой, рисунок остаётся от неё
        text: formulaInput.value,
        /** @type {Relation | null} */
        relation: null,
        error: "",
        p: parseModulus(modulusInput.value) ?? 53,
        /** @type {Spot[]} */
        points: [],
        // клетки, которые не проверить: показатель степени в них больше 2⁵³ − 1
        unknown: 0,
        /** @type {Spot | null} */
        picked: null,
    };
    let stop = () => {};

    /**
     * Разобрать формулу из поля; не разобралась — запомнить, что не так, а рисунок оставить прежним.
     * @param {string} text
     */
    function setFormula(text) {
        try {
            state.relation = parseRelation(text);
            state.text = text;
            state.error = "";
        } catch (error) {
            if (!(error instanceof SyntaxError)) {
                throw error;
            }
            state.error = error.message;
        }
    }

    function recount() {
        const scan = state.relation ? scanRelation(state.relation, state.p) : { points: [], unknown: 0 };
        state.points = scan.points;
        state.unknown = scan.unknown;
        const picked = state.picked;
        if (picked && !state.points.some((point) => point.x === picked.x && point.y === picked.y)) {
            state.picked = null;
        }
    }

    function describe() {
        const { p, points, picked, relation } = state;
        formula.textContent = prettyRelation(state.text);
        modulus.textContent = String(p);
        /** @type {[string, string][]} */
        const rows = [["на сетке", `${points.length} ${plural(points.length, ["точка", "точки", "точек"])}`]];
        if (picked && relation) {
            const left = evaluate(relation.left, picked.x, picked.y, p);
            const right = evaluate(relation.right, picked.x, picked.y, p);
            rows.push(
                ["точка", formatPoint(picked)],
                ["левая часть", left === null ? "—" : `≡ ${left}`],
                ["правая часть", right === null ? "—" : `≡ ${right}`],
            );
        }
        fillRows(out, rows);

        let text = state.error
            ? `Не понял формулу: ${state.error}. Рисунок — от последней, что разобралась.`
            : "Это все пары (x; y) от 0 до p − 1, для которых формула верна, если обе её части считать по модулю p. Клик по точке — её координаты.";
        if (state.unknown > 0) {
            const cells = plural(state.unknown, ["клетке", "клетках", "клетках"]);
            text = `В ${state.unknown} ${cells} из ${p * p} показатель степени больше 2⁵³ − 1: его точно не посчитать, и эти клетки пропущены. ${text}`;
        }
        if (!isPrime(p)) {
            text = `p = ${p} не простое: по модулю ${p} делить можно не на всё, и где деления нет, там нет и точки. ${text}`;
        }
        note.textContent = text;
        for (const button of examples) {
            const same = button.dataset.formula === state.text && Number(button.dataset.modulus) === p;
            button.setAttribute("aria-pressed", String(same));
        }
        plot.setAttribute("aria-label", `${formula.textContent} по модулю ${p}: ${rows[0][1]}`);
    }

    /**
     * Перерисовать; animate — сетка проверяется столбец за столбцом, слева направо.
     * @param {boolean} animate
     */
    function draw(animate) {
        stop();
        const { p, points, picked } = state;
        const field = fieldScale(p, AREA);
        const { X, Y, cell } = field;
        plot.replaceChildren();
        drawFieldBase(svg("g", {}, plot), p, field, [], false);
        const columns = Array.from({ length: p }, () => svg("g", {}, plot));
        const radius = dotRadius(cell);
        for (const point of points) {
            svg("circle", { class: "ec-dot ec-dot-free", cx: X(point.x), cy: Y(point.y), r: radius }, columns[point.x]);
        }
        if (picked) {
            const marks = svg("g", {}, plot);
            star(marks, X(picked.x), Y(picked.y), 26);
            pointName(marks, X(picked.x), Y(picked.y), formatPoint(picked), "ec-name-big", EDGES);
        }
        describe();
        stop = play(
            SWEEP,
            (elapsed) => {
                const reached = (p * elapsed) / SWEEP;
                columns.forEach((column, x) => column.setAttribute("opacity", x < reached ? "1" : "0"));
            },
            animate,
        );
    }

    formulaInput.addEventListener("input", () => {
        setFormula(formulaInput.value);
        recount();
        draw(false);
    });
    modulusInput.addEventListener("input", () => {
        const value = parseModulus(modulusInput.value);
        if (value !== null) {
            state.p = value;
            recount();
            draw(false);
        }
    });
    // ушли из поля — показываем то p, с которым считали
    modulusInput.addEventListener("change", () => {
        modulusInput.value = String(state.p);
    });

    for (const button of examples) {
        button.addEventListener("click", () => {
            const text = button.dataset.formula;
            const p = parseModulus(button.dataset.modulus ?? "");
            if (!text || p === null) {
                throw new Error("index.html: у примера нет формулы или p");
            }
            formulaInput.value = text;
            modulusInput.value = String(p);
            state.p = p;
            state.picked = null;
            setFormula(text);
            recount();
            draw(true);
        });
    }

    // клик по клетке: есть в ней точка — показать её, пусто — снять отметку
    plot.addEventListener("click", (event) => {
        const matrix = plot.getScreenCTM();
        if (!matrix) {
            return;
        }
        const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        const { cell } = fieldScale(state.p, AREA);
        const x = Math.floor((local.x - AREA.left) / cell);
        const y = Math.floor((AREA.top + AREA.size - local.y) / cell);
        state.picked = state.points.find((point) => point.x === x && point.y === y) ?? null;
        draw(false);
    });

    setFormula(formulaInput.value);
    if (!state.relation) {
        throw new Error(`index.html: формула по умолчанию не разбирается: ${state.error}`);
    }
    recount();
    draw(false);
    return {
        /** Показать проверку сетки заново — когда вкладку открыли. */
        replay() {
            draw(true);
        },
    };
}
