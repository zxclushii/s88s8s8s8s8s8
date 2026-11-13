// @ts-check
// Вкладка «на плоскости»: кривая y² = x³ + ax + b над обычными числами. P и Q таскаются по кривой, прямая
// через них задевает кривую в третьей точке, её отражение через ось x — сумма. Ещё P + P — касательная —
// и P + (−P): вертикаль уходит вверх, в нимб, это точка O. Построение каждый раз рисуется по шагам.

import { byId } from "./dom.js";
import {
    equation,
    fillRows,
    formatFixed,
    formatNumber,
    halo,
    play,
    pointName,
    stage,
    star,
    svg,
    svgText,
} from "./ec-draw.js";
import { addReal, curveLines, kindOf, nearestPoint, rhs, roots, stepAlong } from "./ec-real.js";

/** @typedef {import("./ec-real.js").RealPoint} RealPoint */
/** @typedef {"add" | "double" | "inverse"} Mode */
/** @typedef {"P" | "Q"} Handle */

// рисунок 600 × 780; сверху полоса под нимб. Масштаб по осям один — иначе касательная выглядела бы кривой
const WIDTH = 600;
const HEIGHT = 780;
const TOP = 64;
const X_MIN = -3.2;
const X_MAX = 3.2;
const SCALE = WIDTH / (X_MAX - X_MIN);
const Y_MAX = (HEIGHT - TOP) / SCALE / 2;
// ветка тянется чуть дальше края, чтобы не обрывалась на виду
const X_FAR = X_MAX + 0.6;
// a и b — от −5 до 5 с шагом 0,1: при таких все корни помещаются на рисунок
const LIMIT = 5;
// сколько вершин ломаной проходит точка за одно нажатие стрелки
const KEY_STEP = 4;
// этапы построения, мс
const GROW = 520;
const EXTEND = 320;
const DROP = 380;

/** @param {number} x */
const toX = (x) => (x - X_MIN) * SCALE;
/** @param {number} y */
const toY = (y) => TOP + (Y_MAX - y) * SCALE;
const EDGES = { right: WIDTH, top: TOP };

// стрелки двигают точку вдоль кривой: вперёд и назад по ломаной
const ARROWS = new Map([
    ["ArrowRight", KEY_STEP],
    ["ArrowUp", KEY_STEP],
    ["ArrowLeft", -KEY_STEP],
    ["ArrowDown", -KEY_STEP],
]);

/**
 * Значение a или b из поля: запятая тоже годится, лишнее обрезается до шага 0,1 и до ±5. Не число — null.
 * @param {string} value
 */
function parseCoefficient(value) {
    const number = Number(value.trim().replace(",", "."));
    if (value.trim() === "" || !Number.isFinite(number)) {
        return null;
    }
    return Math.min(LIMIT, Math.max(-LIMIT, Math.round(number * 10) / 10));
}

/**
 * Где у особой кривой ломается гладкость — для подписи.
 * @param {number} a
 * @param {number} b
 */
function singularPlace(a, b) {
    const { simple, multiple } = roots(a, b);
    const [x] = multiple;
    const where = `(${formatNumber(x)}; 0)`;
    if (simple.length === 0) {
        return `остриё в ${where}`;
    }
    return x > simple[0] ? `петля в ${where}` : `одинокая точка ${where} в стороне от ветки`;
}

/** Подключает вкладку к разметке из index.html. */
export function mountPlane() {
    const plot = byId("plane-plot", SVGSVGElement);
    const formula = byId("plane-eq", HTMLElement);
    const kindNote = byId("plane-kind", HTMLElement);
    const out = byId("plane-out", HTMLElement);
    const note = byId("plane-note", HTMLElement);
    const inputs = {
        a: { number: byId("plane-a", HTMLInputElement), range: byId("plane-a-range", HTMLInputElement) },
        b: { number: byId("plane-b", HTMLInputElement), range: byId("plane-b-range", HTMLInputElement) },
    };
    const kindButtons = byId("plane-kinds", HTMLElement).querySelectorAll("button");
    const modeButtons = byId("plane-modes", HTMLElement).querySelectorAll("button");

    const state = {
        a: -1,
        b: 2,
        /** @type {Mode} */
        mode: "add",
        /** @type {RealPoint} */
        P: { x: 0, y: 0 },
        /** @type {RealPoint} */
        Q: { x: 0, y: 0 },
    };
    let curve = curveLines(state.a, state.b, X_FAR);
    let stop = () => {};

    // слои: кривая и оси; построение; ручки P и Q сверху, чтобы их было удобно хватать
    const defs = svg("defs", {}, plot);
    const clip = svg("clipPath", { id: "plane-clip" }, defs);
    svg("rect", { x: 0, y: TOP, width: WIDTH, height: HEIGHT - TOP }, clip);
    const base = svg("g", { "clip-path": "url(#plane-clip)" }, plot);
    const drawing = svg("g", {}, plot);
    const handles = svg("g", {}, plot);

    /**
     * Точка кривой рядом с данной: вершина ломаной, она лежит на кривой точно.
     * @param {RealPoint} near
     * @returns {RealPoint}
     */
    function snap(near) {
        return nearestPoint(curve.lines, near)?.point ?? near;
    }

    state.P = snap({ x: -1.3, y: Math.sqrt(rhs(state.a, state.b, -1.3)) });
    state.Q = snap({ x: 0.2, y: Math.sqrt(rhs(state.a, state.b, 0.2)) });

    function drawBase() {
        base.replaceChildren();
        // ось x — зеркало: через неё отражают третью точку
        svg("line", { class: "ec-mirror", x1: 0, y1: toY(0), x2: WIDTH, y2: toY(0) }, base);
        svgText(base, WIDTH - 2, toY(0) - 10, "зеркало", "ec-mirror-name", "end");
        for (let tick = -3; tick <= 3; tick++) {
            if (tick !== 0) {
                svgText(base, toX(tick), toY(0) + 22, formatNumber(tick), "ec-tick", "middle");
            }
        }
        for (const line of curve.lines) {
            const d = line.map(
                (point, i) => `${i === 0 ? "M" : "L"}${toX(point.x).toFixed(1)},${toY(point.y).toFixed(1)}`,
            );
            svg("path", { class: "ec-curve", d: d.join("") }, base);
        }
        for (const dot of curve.dots) {
            svg("circle", { class: "ec-hot", cx: toX(dot.x), cy: toY(dot.y), r: 3.4 }, base);
        }
    }

    /**
     * Прямая y = λ(x − P.x) + P.y на рисунке от x = from до x = to.
     * @param {Element} line
     * @param {RealPoint} P
     * @param {number} lambda
     * @param {number} from
     * @param {number} to
     */
    function setSlanted(line, P, lambda, from, to) {
        line.setAttribute("x1", String(toX(from)));
        line.setAttribute("y1", String(toY(lambda * (from - P.x) + P.y)));
        line.setAttribute("x2", String(toX(to)));
        line.setAttribute("y2", String(toY(lambda * (to - P.x) + P.y)));
    }

    /**
     * Отрезок между двумя точками рисунка, показанный на долю k от начала.
     * @param {Element} line
     * @param {{ x: number, y: number }} from в координатах SVG
     * @param {{ x: number, y: number }} to
     * @param {number} k
     */
    function setPartial(line, from, to, k) {
        line.setAttribute("x1", String(from.x));
        line.setAttribute("y1", String(from.y));
        line.setAttribute("x2", String(from.x + (to.x - from.x) * k));
        line.setAttribute("y2", String(from.y + (to.y - from.y) * k));
    }

    /**
     * Что показать: прямая (или касательная) с третьей точкой и суммой, или вертикаль в O.
     * @returns {{ kind: "line", lambda: number, third: RealPoint, sum: RealPoint, tangent: boolean }
     *     | { kind: "vertical", other: RealPoint }}
     */
    function construction() {
        const { P, Q, mode, a } = state;
        if (mode === "inverse") {
            return { kind: "vertical", other: { x: P.x, y: -P.y } };
        }
        const second = mode === "double" ? P : Q;
        const result = addReal(a, P, second);
        if (result === null) {
            return { kind: "vertical", other: second };
        }
        const tangent = mode === "double" || (P.x === Q.x && P.y === Q.y);
        return { kind: "line", ...result, tangent };
    }

    function describe() {
        const { a, b, P, Q, mode } = state;
        formula.textContent = equation(a, b, (value) => formatNumber(value, 1));
        const kind = kindOf(a, b);
        for (const button of kindButtons) {
            button.setAttribute("aria-pressed", String(button.dataset.kind === kind.kind));
        }
        const value = formatNumber(kind.value);
        kindNote.textContent =
            kind.kind === "one"
                ? `4a³ + 27b² = ${value} > 0 — одна ветка`
                : kind.kind === "two"
                  ? `4a³ + 27b² = ${value} < 0 — овал и ветка`
                  : `4a³ + 27b² = 0 — кривая особая: ${singularPlace(a, b)}. Для шифра такая не годится`;

        const built = construction();
        const point = (/** @type {RealPoint} */ p) => `(${formatFixed(p.x)}; ${formatFixed(p.y)})`;
        const name = mode === "add" ? "P + Q" : mode === "double" ? "2P" : "P + (−P)";
        /** @type {[string, string][]} */
        const rows = [["P", point(P)]];
        rows.push(mode === "add" ? ["Q", point(Q)] : ["−P", point({ x: P.x, y: -P.y })]);
        if (built.kind === "line") {
            rows.push([
                built.tangent ? "касательная: λ = (3x² + a) / 2y" : "λ = (y₂ − y₁) / (x₂ − x₁)",
                formatFixed(built.lambda),
            ]);
            rows.push([name, point(built.sum)]);
        } else {
            rows.push(["прямая", "вертикальная"], [name, "O"]);
        }
        fillRows(out, rows);

        let text;
        if (built.kind === "vertical") {
            text =
                mode === "double"
                    ? "У P y = 0: касательная вертикальная, третьей точки нет — она уходит вверх, в O. Поэтому 2P = O."
                    : "−P — отражение P через ось x. Прямая через P и −P вертикальная и третьей точки не находит: она уходит вверх, в O — точку на бесконечности. Поэтому P + (−P) = O.";
        } else if (mode === "double") {
            text =
                "Когда точку складывают саму с собой, прямую заменяет касательная в P. Она задевает кривую ещё в одной точке, её отражение через ось x — это 2P.";
        } else if (built.tangent) {
            text = "P и Q совпали — вместо прямой касательная, и выходит 2P.";
        } else {
            text =
                "P и Q таскаются по кривой. Прямая через них задевает кривую в третьей точке, её отражение через ось x — это P + Q.";
        }
        if (built.kind === "line" && (Math.abs(built.sum.x) > X_MAX || Math.abs(built.sum.y) > Y_MAX)) {
            text += " Сумма — за краем рисунка.";
        }
        note.textContent = text;
        plot.setAttribute(
            "aria-label",
            `Кривая ${formula.textContent}; ${rows.map((row) => row.join(" ")).join("; ")}`,
        );
    }

    /**
     * Ручка точки: видимая точка и круг побольше, за который удобно хватать.
     * @param {Handle} which
     * @param {RealPoint} point
     */
    function drawHandle(which, point) {
        const handle = svg(
            "g",
            {
                class: "ec-handle",
                tabindex: 0,
                role: "slider",
                "aria-label": `точка ${which}: тащите по кривой или двигайте стрелками`,
                "aria-valuetext": `(${formatFixed(point.x)}; ${formatFixed(point.y)})`,
                "data-handle": which,
            },
            handles,
        );
        svg("circle", { class: "ec-hit", cx: toX(point.x), cy: toY(point.y), r: 22 }, handle);
        svg("circle", { class: "ec-hot", cx: toX(point.x), cy: toY(point.y), r: 5.5 }, handle);
    }

    /**
     * Перерисовать построение; animate — по шагам: прямая через P и Q, третья точка, отражение, сумма.
     * @param {boolean} animate
     */
    function draw(animate) {
        stop();
        describe();
        drawing.replaceChildren();
        const focused =
            document.activeElement instanceof SVGElement ? document.activeElement.dataset.handle : undefined;
        handles.replaceChildren();

        const { P, Q, mode } = state;
        const built = construction();
        const clipped = svg("g", { "clip-path": "url(#plane-clip)" }, drawing);
        const marks = svg("g", {}, drawing);
        const at = (/** @type {RealPoint} */ p) => ({ x: toX(p.x), y: toY(p.y) });

        if (built.kind === "vertical") {
            // вертикаль через P и вторую точку: растёт от нижней из них вверх, за край рисунка, в нимб
            const below = svg("line", { class: "ec-line" }, drawing);
            const up = svg("line", { class: "ec-line" }, drawing);
            const other = svg(
                "circle",
                { class: "ec-ring", cx: toX(built.other.x), cy: toY(built.other.y), r: 5.5 },
                marks,
            );
            const nimbus = halo(marks, toX(P.x), 30);
            const lowest = P.y < built.other.y ? at(P) : at(built.other);
            if (mode !== "add") {
                pointName(marks, toX(built.other.x), toY(built.other.y), "−P", "ec-name", EDGES);
            }
            stop = play(
                GROW + EXTEND + DROP,
                (elapsed) => {
                    setPartial(below, { x: lowest.x, y: HEIGHT }, lowest, 1);
                    below.setAttribute("opacity", String(stage(elapsed, 0, GROW)));
                    setPartial(up, lowest, { x: lowest.x, y: 38 }, stage(elapsed, 0, GROW + EXTEND));
                    other.setAttribute("opacity", String(stage(elapsed, GROW * 0.5, 120)));
                    nimbus.setAttribute("opacity", String(stage(elapsed, GROW + EXTEND - 80, DROP)));
                },
                animate,
            );
        } else {
            const { lambda, third, sum } = built;
            const line = svg("line", { class: "ec-line" }, clipped);
            const drop = svg("line", { class: "ec-drop" }, clipped);
            const ring = svg("circle", { class: "ec-ring", cx: toX(third.x), cy: toY(third.y), r: 5.5 }, marks);
            const sumMark = star(marks, toX(sum.x), toY(sum.y), 30);
            // подпись третьей точки — с той стороны, куда не уходит отражение
            const thirdName = pointName(
                marks,
                toX(third.x),
                toY(third.y),
                mode === "add" ? "−(P + Q)" : "−2P",
                "ec-name",
                EDGES,
                { below: third.y > 0 },
            );
            const sumName = pointName(
                marks,
                toX(sum.x) + 6,
                toY(sum.y),
                mode === "add" ? "P + Q" : "2P",
                "ec-name-big",
                EDGES,
            );
            // прямая растёт от P к Q, потом до третьей точки, потом до краёв; у касательной первого шага нет
            const reach = built.tangent ? P.x : Q.x;
            const left = Math.min(P.x, reach, third.x);
            const right = Math.max(P.x, reach, third.x);
            const second = built.tangent ? 0 : GROW;
            const edges = second + GROW;
            stop = play(
                edges + EXTEND + DROP,
                (elapsed) => {
                    const toQ = stage(elapsed, 0, second);
                    const toThird = stage(elapsed, second, GROW);
                    const toEdges = stage(elapsed, edges, EXTEND);
                    let from = Math.min(P.x, P.x + (reach - P.x) * toQ);
                    let to = Math.max(P.x, P.x + (reach - P.x) * toQ);
                    from += (Math.min(from, left) - from) * toThird;
                    to += (Math.max(to, right) - to) * toThird;
                    from += (X_MIN - 1 - from) * toEdges;
                    to += (X_MAX + 1 - to) * toEdges;
                    setSlanted(line, P, lambda, from, to);
                    const seen = String(stage(elapsed, edges - 60, 120));
                    ring.setAttribute("opacity", seen);
                    thirdName.setAttribute("opacity", seen);
                    setPartial(drop, at(third), at(sum), stage(elapsed, edges + EXTEND * 0.4, DROP));
                    const done = String(stage(elapsed, edges + EXTEND + DROP - 80, 120));
                    sumMark.setAttribute("opacity", done);
                    sumName.setAttribute("opacity", done);
                },
                animate,
            );
        }

        // P и Q подписаны с внешних сторон, чтобы подписи не лезли на прямую между ними
        const qOnRight = mode !== "add" || Q.x >= P.x;
        pointName(marks, toX(P.x), toY(P.y), "P", "ec-name-big", EDGES, { left: qOnRight });
        if (mode === "add" && !(P.x === Q.x && P.y === Q.y)) {
            pointName(marks, toX(Q.x), toY(Q.y), "Q", "ec-name-big", EDGES, { left: !qOnRight });
        }
        drawHandle("P", P);
        if (mode === "add") {
            drawHandle("Q", Q);
        }
        // после перерисовки фокус остаётся на той же ручке — стрелками можно двигать дальше
        if (focused) {
            const again = handles.querySelector(`[data-handle="${focused}"]`);
            if (again instanceof SVGElement) {
                again.focus();
            }
        }
    }

    /**
     * Новые a и b: кривая пересчитывается, P и Q прилипают к ней рядом с прежними местами.
     * @param {number} a
     * @param {number} b
     * @param {boolean} animate
     */
    function setCoefficients(a, b, animate) {
        state.a = a;
        state.b = b;
        curve = curveLines(a, b, X_FAR);
        state.P = snap(state.P);
        state.Q = snap(state.Q);
        for (const [name, value] of /** @type {["a" | "b", number][]} */ ([
            ["a", a],
            ["b", b],
        ])) {
            const { number, range } = inputs[name];
            if (document.activeElement !== number) {
                number.value = String(value);
            }
            range.value = String(value);
        }
        drawBase();
        draw(animate);
    }

    for (const [
        name,
        { number, range },
    ] of /** @type {["a" | "b", { number: HTMLInputElement, range: HTMLInputElement }][]} */ (Object.entries(inputs))) {
        /** @param {string} value */
        const take = (value) => {
            const parsed = parseCoefficient(value);
            if (parsed !== null) {
                setCoefficients(name === "a" ? parsed : state.a, name === "b" ? parsed : state.b, false);
            }
        };
        number.addEventListener("input", () => take(number.value));
        range.addEventListener("input", () => take(range.value));
        // ушли из поля — показываем то число, с которым считали: 7 → 5, пусто → прежнее
        number.addEventListener("change", () => {
            number.value = String(state[name]);
        });
    }

    for (const button of kindButtons) {
        button.addEventListener("click", () => {
            const a = parseCoefficient(button.dataset.a ?? "");
            const b = parseCoefficient(button.dataset.b ?? "");
            if (a === null || b === null) {
                throw new Error(`index.html: у кнопки типа кривой нет a или b`);
            }
            setCoefficients(a, b, true);
        });
    }

    for (const button of modeButtons) {
        button.addEventListener("click", () => {
            const mode = button.dataset.mode;
            if (mode !== "add" && mode !== "double" && mode !== "inverse") {
                throw new Error(`index.html: у кнопки нет режима (data-mode="${mode}")`);
            }
            state.mode = mode;
            for (const other of modeButtons) {
                other.setAttribute("aria-pressed", String(other === button));
            }
            draw(true);
        });
    }

    // перетаскивание: точка прилипает к ближайшему месту кривой под курсором
    /** @type {Handle | null} */
    let dragging = null;

    /**
     * @param {PointerEvent} event
     * @returns {RealPoint | null}
     */
    function pointerAt(event) {
        const matrix = plot.getScreenCTM();
        if (!matrix) {
            return null;
        }
        const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        return { x: X_MIN + local.x / SCALE, y: Y_MAX - (local.y - TOP) / SCALE };
    }

    handles.addEventListener("pointerdown", (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-handle]") : null;
        const which = target instanceof SVGElement ? target.dataset.handle : undefined;
        if (which !== "P" && which !== "Q") {
            return;
        }
        event.preventDefault();
        dragging = which;
        plot.setPointerCapture(event.pointerId);
        plot.classList.add("ec-dragging");
    });
    plot.addEventListener("pointermove", (event) => {
        if (!dragging) {
            return;
        }
        const target = pointerAt(event);
        if (target) {
            state[dragging] = snap(target);
            draw(false);
        }
    });
    const release = () => {
        dragging = null;
        plot.classList.remove("ec-dragging");
    };
    plot.addEventListener("pointerup", release);
    plot.addEventListener("pointercancel", release);

    // на телефоне палец на ручке тащит точку, а не листает страницу
    handles.addEventListener(
        "touchstart",
        (event) => {
            if (event.target instanceof Element && event.target.closest("[data-handle]")) {
                event.preventDefault();
            }
        },
        { passive: false },
    );

    handles.addEventListener("keydown", (event) => {
        const which = event.target instanceof SVGElement ? event.target.dataset.handle : undefined;
        const steps = ARROWS.get(event.key);
        if ((which !== "P" && which !== "Q") || steps === undefined) {
            return;
        }
        event.preventDefault();
        const moved = stepAlong(curve.lines, state[which], steps);
        if (moved) {
            state[which] = moved;
            draw(false);
        }
    });

    // маленькие рисунки на кнопках трёх типов
    for (const button of kindButtons) {
        const icon = button.querySelector("svg");
        const a = parseCoefficient(button.dataset.a ?? "");
        const b = parseCoefficient(button.dataset.b ?? "");
        if (!icon || a === null || b === null) {
            throw new Error("index.html: у кнопки типа кривой нет рисунка, a или b");
        }
        const { lines, dots } = curveLines(a, b, 4.6, 120);
        /** @param {RealPoint} p */
        const iconAt = (p) => `${(52 + p.x * 14).toFixed(1)},${(42 - p.y * 14).toFixed(1)}`;
        for (const line of lines) {
            const visible = line.filter((p) => Math.abs(p.y) < 3.1);
            svg("path", { d: `M${visible.map(iconAt).join("L")}` }, icon);
        }
        for (const dot of dots) {
            const [cx, cy] = iconAt(dot).split(",");
            svg("circle", { cx, cy, r: 2.2 }, icon);
        }
    }

    drawBase();
    draw(false);
    return {
        /** Показать построение заново — когда вкладку открыли. */
        replay() {
            draw(true);
        },
    };
}
