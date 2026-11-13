// @ts-check
// Вкладка «по модулю p»: та же кривая, но числа идут по кругу, и вместо линии — точки на сетке p × p.
// Клик по точке ставит P, следующий — Q. Прямая через них по модулю наматывается на сетку змейкой, проходит
// через третью точку, и её отражение через y = p/2 — сумма. Ещё P + P, P + (−P) — вертикаль в нимб, — все
// кратные P до O и таблица сложения всех точек со всеми.

import {
    G,
    add,
    curvePoints,
    discriminant,
    inverse,
    isPrime,
    lineStep,
    mod,
    multiply,
    negate,
    slope,
    subgroup,
    wrapDirection,
    wrapSegments,
} from "./curve.js";
import { byId } from "./dom.js";
import { createSolution } from "./ec-solution.js";
import { additionSteps, inverseSteps, multipleSteps } from "./ec-steps.js";
import {
    drawFieldBase,
    fieldScale,
    fillRows,
    formatNumber,
    formatPoint,
    halo,
    play,
    plural,
    pointName,
    stage,
    star,
    svg,
} from "./ec-draw.js";

/** @typedef {import("./curve.js").Curve} Curve */
/** @typedef {import("./curve.js").Point} Point */
/** @typedef {import("./ec-draw.js").Field} Field */
/** @typedef {import("./ec-store.js").CurveStore} CurveStore */
/** @typedef {{ x: number, y: number }} Spot */
/** @typedef {"add" | "double" | "inverse" | "orbit"} Mode */
/**
 * Что видно на месте рисунка: сам рисунок, ход вычисления, сложение точек и три таблицы поля — сложение,
 * умножение и обратные по модулю p, как на странице Table в программе FiniteField.
 * @typedef {"plot" | "solution" | "points" | "add" | "mul" | "inv"} View
 */

// рисунок 640 × 700: поле 584 × 584, над ним полоса под нимб, слева и снизу цифры
const AREA = { left: 40, top: 70, size: 584 };
const HALO_Y = 34;
const EDGES = { right: AREA.left + AREA.size, top: AREA.top };
// этапы, мс: змейка целиком, отражение в сумму, все кратные P
const SNAKE = 1500;
const DROP = 380;
const ORBIT = 1800;
// сколько кратных подписывать на рисунке и перечислять в заметке
const ORBIT_NAMES = 12;
const ORBIT_LIST = 40;

/**
 * @param {Point} u
 * @param {Point} v
 */
const same = (u, v) => u !== null && v !== null && u.x === v.x && u.y === v.y;

/**
 * Начальные P и Q: G из лабы 9 и 4G, если кривая та же; иначе первые подходящие точки.
 * @param {Curve} curve
 * @param {Spot[]} points
 * @returns {{ P: Spot | null, Q: Spot | null }}
 */
function startingPair(curve, points) {
    const P = points.find((point) => same(point, G)) ?? points.find((point) => point.y !== 0) ?? points[0] ?? null;
    if (P === null || !isPrime(curve.p)) {
        return { P, Q: null };
    }
    const fourP = multiply(curve, 4, P).result;
    const Q = fourP !== null && fourP.x !== P.x ? fourP : (points.find((point) => point.x !== P.x) ?? null);
    return { P, Q };
}

/**
 * Кратные P до O — коротко, если их много.
 * @param {Point[]} multiples
 */
function listMultiples(multiples) {
    const names = multiples.map((point) => formatPoint(point));
    if (names.length <= ORBIT_LIST) {
        return names.join(" → ");
    }
    return `${names.slice(0, ORBIT_LIST - 4).join(" → ")} → … → ${names.slice(-3).join(" → ")}`;
}

/**
 * Подключает вкладку к разметке из index.html.
 * @param {CurveStore} store
 */
export function mountField(store) {
    const plot = byId("field-plot", SVGSVGElement);
    const tableBox = byId("field-table", HTMLElement);
    const out = byId("field-out", HTMLElement);
    const note = byId("field-note", HTMLElement);
    const count = byId("field-count", HTMLElement);
    const viewButtons = byId("field-views", HTMLElement).querySelectorAll("button");
    const solutionBox = byId("field-solution", HTMLElement);
    const solution = createSolution(solutionBox);
    const list = byId("field-points", HTMLElement);
    const modeButtons = byId("field-modes", HTMLElement).querySelectorAll("button");

    let curve = store.get();
    let points = curvePoints(curve);
    const start = startingPair(curve, points);
    const state = {
        /** @type {Mode} */
        mode: "add",
        P: start.P,
        Q: start.Q,
        /** @type {"P" | "Q"} какую точку ставит следующий клик в режиме P + Q */
        next: "P",
        /** @type {View} */
        view: "plot",
    };
    let stop = () => {};
    // таблица строится, только когда её открыли, и заново — только для новой кривой или другого вида
    /** @type {{ curve: Curve, view: View } | null} */
    let tableFor = null;

    /**
     * Что сейчас складываем и что выходит.
     * @returns {{ kind: "none" }
     *     | { kind: "vertical", P: Spot, other: Spot }
     *     | { kind: "line", P: Spot, Q: Spot, tangent: boolean, sum: Spot, third: Spot }
     *     | { kind: "orbit", P: Spot, multiples: Point[] }}
     */
    function construction() {
        const { P, Q, mode } = state;
        if (P === null || !isPrime(curve.p)) {
            return { kind: "none" };
        }
        if (mode === "orbit") {
            return { kind: "orbit", P, multiples: subgroup(curve, P) };
        }
        if (mode === "inverse") {
            return { kind: "vertical", P, other: { x: P.x, y: (curve.p - P.y) % curve.p } };
        }
        const second = mode === "double" || Q === null ? P : Q;
        const sum = add(curve, P, second);
        if (sum === null) {
            return { kind: "vertical", P, other: second };
        }
        const third = /** @type {Spot} */ (negate(curve, sum));
        return { kind: "line", P, Q: second, tangent: same(P, second), sum, third };
    }

    /**
     * Строки под рисунком и заметка.
     * @param {ReturnType<typeof construction>} built
     */
    function describe(built) {
        const { p } = curve;
        const prime = isPrime(p);
        const { residue } = discriminant(curve);
        count.textContent = `${points.length} ${plural(points.length, ["точка", "точки", "точек"])} и O`;
        for (const button of modeButtons) {
            button.disabled = !prime || state.P === null;
        }
        // по составному p нет ни сложения точек, ни разбора: деление ломается
        for (const button of viewButtons) {
            button.disabled = !prime && (button.dataset.view === "solution" || button.dataset.view === "points");
        }

        if (!prime) {
            fillRows(out, []);
            note.textContent = `p = ${p} не простое: по модулю ${p} делить можно не на всё, поэтому сложения нет — только точки.`;
            return;
        }
        if (built.kind === "none") {
            fillRows(out, []);
            note.textContent = `У этой кривой по модулю ${p} нет точек, кроме O.`;
            return;
        }
        const { P } = built;
        const order = subgroup(curve, P).length;
        const minus = formatPoint(negate(curve, P));
        /** @type {[string, string][]} */
        let rows;
        let text;
        if (built.kind === "orbit") {
            rows = [
                ["P", formatPoint(P)],
                ["порядок P", String(order)],
                [`${order - 1}P = −P`, minus],
                [`${order}P`, "O"],
            ];
            text = `P, 2P, 3P … — все кратные P, пока не выйдет O; их ${order}, это и есть порядок P. ${listMultiples(built.multiples)}`;
        } else if (built.kind === "vertical") {
            const name = state.mode === "add" ? "P + Q" : state.mode === "double" ? "2P" : "P + (−P)";
            rows = [
                ["P", formatPoint(P)],
                ["−P", minus],
                ["прямая", "вертикальная"],
                [name, "O"],
                ["порядок P", String(order)],
            ];
            text =
                state.mode === "double"
                    ? "У P y = 0: касательная вертикальная, третьей точки нет — прямая уходит в O. Поэтому 2P = O."
                    : `−P — то же x, а y отражён через p/2: (x; p − y). Прямая через P и −P вертикальная, третьей точки нет — она уходит в O.`;
        } else {
            const lambda = slope(curve, P, built.Q);
            const fraction = `${formatNumber(lambda.num, 0)} / ${formatNumber(lambda.den, 0)} ≡ ${lambda.value}`;
            const name = state.mode === "add" && !built.tangent ? "P + Q" : "2P";
            rows = [["P", formatPoint(P)]];
            rows.push(state.mode === "add" && !built.tangent ? ["Q", formatPoint(built.Q)] : ["−P", minus]);
            rows.push([built.tangent ? "касательная: λ = (3x² + a) / 2y" : "λ = (y₂ − y₁) / (x₂ − x₁)", fraction]);
            rows.push([name, formatPoint(built.sum)]);
            if (state.mode === "add" && !built.tangent) {
                rows.push(["−P", minus]);
            }
            rows.push(["порядок P", String(order)]);
            text = built.tangent
                ? "Вместо прямой — касательная в P, её наклон (3x² + a) / 2y по модулю p. Она тоже наматывается на сетку и задевает третью точку; её отражение через y = p/2 — это 2P."
                : "Прямая через P и Q по модулю ушла за край и вернулась с другого, как змейка. Она проходит через третью точку, а её отражение через y = p/2 — это P + Q.";
        }
        if (state.mode === "add") {
            text += ` Следующий клик по точке ставит ${state.next}.`;
        }
        if (residue === 0) {
            text = `4a³ + 27b² ≡ 0 по модулю ${p}: кривая особая, для шифра не годится. ${text}`;
        }
        fillRows(out, rows);
        note.textContent = text;
    }

    /**
     * Точки, которые сейчас в деле: P, Q и сумма — их видно в списке и в таблице.
     * @param {ReturnType<typeof construction>} built
     * @returns {Spot[]}
     */
    function hotPoints(built) {
        if (built.kind === "line") {
            return state.mode === "add" ? [built.P, built.Q, built.sum] : [built.P, built.sum];
        }
        if (built.kind === "vertical" || built.kind === "orbit") {
            return [built.P];
        }
        return [];
    }

    /** @param {ReturnType<typeof construction>} built */
    function fillList(built) {
        const hot = hotPoints(built);
        list.replaceChildren(
            ...points.map((point) => {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = formatPoint(point);
                button.dataset.x = String(point.x);
                button.dataset.y = String(point.y);
                button.setAttribute("aria-pressed", String(hot.some((other) => same(other, point))));
                return button;
            }),
            "O",
        );
    }

    /**
     * Вертикаль через P: столбец x = P.x от нижней из двух точек вверх и дальше, за край поля, в нимб.
     * @param {Element} layer
     * @param {Element} marks
     * @param {Field} field
     * @param {Spot} P
     * @param {Spot} other
     * @param {number} from с какой миллисекунды
     * @returns {(elapsed: number) => void}
     */
    function verticalFrames(layer, marks, field, P, other, from) {
        const { X, Y, area } = field;
        const x = X(P.x);
        const lowest = Math.max(Y(P.y), Y(other.y));
        const below = svg("line", { class: "ec-wrap", x1: x, y1: area.top + area.size, x2: x, y2: lowest }, layer);
        const column = svg("line", { class: "ec-wrap", x1: x, y1: lowest, x2: x, y2: lowest }, layer);
        const lift = svg("line", { class: "ec-line", x1: x, y1: area.top, x2: x, y2: area.top }, layer);
        const nimbus = halo(marks, x, HALO_Y);
        return (elapsed) => {
            below.setAttribute("opacity", String(stage(elapsed, from, 400)));
            column.setAttribute("y2", String(lowest + (area.top - lowest) * stage(elapsed, from, 600)));
            lift.setAttribute("y2", String(area.top + (HALO_Y + 8 - area.top) * stage(elapsed, from + 600, 300)));
            nimbus.setAttribute("opacity", String(stage(elapsed, from + 820, 260)));
        };
    }

    /**
     * Перерисовать рисунок; animate — по шагам: змейка, третья точка, отражение, сумма.
     * @param {boolean} animate
     */
    function draw(animate) {
        stop();
        // по составному p сложения точек и разбора нет — возвращаемся к рисунку
        if (!isPrime(curve.p) && (state.view === "solution" || state.view === "points")) {
            setView("plot");
        }
        const built = construction();
        describe(built);
        fillList(built);
        if (state.view === "solution") {
            showSolution(built);
            return;
        }
        if (state.view !== "plot") {
            showTable(state.view, built);
            return;
        }

        const { p } = curve;
        const field = fieldScale(p, AREA);
        const { X, Y, cell } = field;
        plot.replaceChildren();
        drawFieldBase(svg("g", {}, plot), p, field, points);
        const layer = svg("g", {}, plot);
        const marks = svg("g", {}, plot);
        const hits = svg("g", {}, plot);
        const hitRadius = Math.max(7, cell / 2);
        for (const point of points) {
            svg(
                "circle",
                { class: "ec-hit", cx: X(point.x), cy: Y(point.y), r: hitRadius, "data-x": point.x, "data-y": point.y },
                hits,
            );
        }
        /** @type {((elapsed: number) => void)[]} */
        const frames = [];
        let duration = 0;

        if (built.kind === "line") {
            const { P, Q, tangent, sum, third } = built;
            let d = tangent ? wrapDirection(p, 1, slope(curve, P, P).value) : wrapDirection(p, Q.x - P.x, Q.y - P.y);
            let toQ = lineStep(p, P, d, Q);
            let toThird = lineStep(p, P, d, third);
            // змейка идёт от P сперва к Q, а потом к третьей точке
            if (!tangent && toThird !== 0 && toQ > toThird) {
                d = { dx: -d.dx, dy: -d.dy };
                toQ = (p - toQ) % p;
                toThird = (p - toThird) % p;
            }
            const segments = wrapSegments(p, P, d).map((segment) => ({
                ...segment,
                line: svg(
                    "line",
                    {
                        class: "ec-wrap",
                        x1: X(segment.from.x),
                        y1: Y(segment.from.y),
                        x2: X(segment.from.x),
                        y2: Y(segment.from.y),
                    },
                    layer,
                ),
            }));
            const lineDots = Array.from({ length: p }, (_, t) =>
                svg(
                    "circle",
                    {
                        class: "ec-linedot",
                        cx: X((((P.x + t * d.dx) % p) + p) % p),
                        cy: Y((((P.y + t * d.dy) % p) + p) % p),
                        r: 1.7,
                    },
                    layer,
                ),
            );
            const drop = svg(
                "line",
                { class: "ec-drop", x1: X(third.x), y1: Y(third.y), x2: X(third.x), y2: Y(third.y) },
                layer,
            );
            const ring = svg("circle", { class: "ec-ring", cx: X(third.x), cy: Y(third.y), r: 6 }, marks);
            const sumMark = star(marks, X(sum.x), Y(sum.y), 30);
            const addition = state.mode === "add" && !tangent;
            const thirdName = pointName(marks, X(third.x), Y(third.y), addition ? "−(P + Q)" : "−2P", "ec-name", EDGES);
            const sumName = pointName(marks, X(sum.x) + 6, Y(sum.y), addition ? "P + Q" : "2P", "ec-name-big", EDGES);
            duration = SNAKE + DROP + 160;
            frames.push((elapsed) => {
                const t = (p * Math.min(SNAKE, elapsed)) / SNAKE;
                for (const segment of segments) {
                    const k = Math.min(1, Math.max(0, (t - segment.t0) / (segment.t1 - segment.t0)));
                    segment.line.setAttribute("x2", String(X(segment.from.x + (segment.to.x - segment.from.x) * k)));
                    segment.line.setAttribute("y2", String(Y(segment.from.y + (segment.to.y - segment.from.y) * k)));
                    segment.line.setAttribute("opacity", k > 0 ? "1" : "0");
                }
                lineDots.forEach((dot, step) => dot.setAttribute("opacity", t >= step ? "1" : "0"));
                const seen = t >= toThird ? "1" : "0";
                ring.setAttribute("opacity", seen);
                thirdName.setAttribute("opacity", seen);
                const k = stage(elapsed, SNAKE, DROP);
                drop.setAttribute("y2", String(Y(third.y) + (Y(sum.y) - Y(third.y)) * k));
                const done = String(stage(elapsed, SNAKE + DROP - 40, 160));
                sumMark.setAttribute("opacity", done);
                sumName.setAttribute("opacity", done);
            });
            if (addition) {
                pointName(marks, X(Q.x), Y(Q.y), "Q", "ec-name-big", EDGES);
            }
        } else if (built.kind === "vertical") {
            const { P, other } = built;
            svg("circle", { class: "ec-ring", cx: X(other.x), cy: Y(other.y), r: 6 }, marks);
            if (state.mode !== "add") {
                pointName(marks, X(other.x), Y(other.y), "−P", "ec-name", EDGES);
            }
            frames.push(verticalFrames(layer, marks, field, P, other, 0));
            duration = 1100;
        } else if (built.kind === "orbit") {
            const path = /** @type {Spot[]} */ (built.multiples.filter((point) => point !== null));
            const each = Math.min(140, ORBIT / path.length);
            // длинная подгруппа — клубок линий: делаем их тише, чтобы точки читались
            const polyline = svg(
                "polyline",
                { class: "ec-path", points: "", "stroke-opacity": path.length > ORBIT_NAMES ? 0.5 : 1 },
                layer,
            );
            const dots = path.map((point, i) => {
                const dot = svg("circle", { class: "ec-hot", cx: X(point.x), cy: Y(point.y), r: 4 }, marks);
                const named = i < 3 || (path.length <= ORBIT_NAMES && i > 0) || i === path.length - 1;
                const name =
                    named && i > 0
                        ? pointName(
                              marks,
                              X(point.x),
                              Y(point.y),
                              i === path.length - 1 && i > 1 ? `${i + 1}P = −P` : `${i + 1}P`,
                              "ec-name",
                              EDGES,
                          )
                        : null;
                return { dot, name };
            });
            const last = path[path.length - 1];
            const lift = verticalFrames(layer, marks, field, built.P, last, each * path.length);
            duration = each * path.length + 1100;
            frames.push((elapsed) => {
                const shown = Math.min(path.length, Math.floor(elapsed / each) + 1);
                polyline.setAttribute(
                    "points",
                    path
                        .slice(0, shown)
                        .map((point) => `${X(point.x)},${Y(point.y)}`)
                        .join(" "),
                );
                dots.forEach(({ dot, name }, i) => {
                    dot.setAttribute("opacity", i < shown ? "1" : "0");
                    name?.setAttribute("opacity", i < shown ? "1" : "0");
                });
                lift(elapsed);
            });
        }

        if (built.kind !== "none") {
            const { P } = built;
            svg("circle", { class: "ec-hot", cx: X(P.x), cy: Y(P.y), r: 5.5 }, marks);
            pointName(marks, X(P.x), Y(P.y), "P", "ec-name-big", EDGES);
            if (built.kind === "line" && state.mode === "add" && !built.tangent) {
                svg("circle", { class: "ec-hot", cx: X(built.Q.x), cy: Y(built.Q.y), r: 5.5 }, marks);
            }
        }
        plot.setAttribute("aria-label", `Точки кривой ${count.textContent} по модулю ${p}; ${note.textContent}`);
        stop = play(
            duration,
            (elapsed) => {
                for (const frame of frames) {
                    frame(elapsed);
                }
            },
            animate,
        );
    }

    /**
     * Ход вычисления того, что сейчас на рисунке.
     * @param {ReturnType<typeof construction>} built
     */
    function showSolution(built) {
        if (built.kind === "none") {
            solution.show("нечего считать: у кривой нет точек, кроме O", []);
        } else if (built.kind === "orbit") {
            solution.show(`все кратные P = ${formatPoint(built.P)}`, multipleSteps(curve, built.P));
        } else if (state.mode === "inverse") {
            solution.show(`P + (−P) для P = ${formatPoint(built.P)}`, inverseSteps(curve, built.P));
        } else {
            const second = built.kind === "line" ? built.Q : built.other;
            const doubling = same(built.P, second);
            const heading = doubling
                ? `2P = 2 · ${formatPoint(built.P)}`
                : `P + Q = ${formatPoint(built.P)} + ${formatPoint(second)}`;
            solution.show(`${heading} по модулю ${curve.p}`, additionSteps(curve, built.P, second));
        }
    }

    /**
     * Таблица поля: сложение или умножение по модулю p — строка с клеткой, или обратные: a и a⁻¹.
     * @param {"add" | "mul" | "inv"} kind
     */
    function buildNumberTable(kind) {
        const { p } = curve;
        const table = document.createElement("table");
        table.className = "ec-numbers";
        const head = table.createTHead().insertRow();
        if (kind === "inv") {
            const label = document.createElement("th");
            label.scope = "row";
            label.textContent = "a";
            head.append(label);
            const row = table.createTBody().insertRow();
            const flipped = document.createElement("th");
            flipped.scope = "row";
            flipped.textContent = "a⁻¹";
            row.append(flipped);
            for (let a = 1; a < p; a++) {
                const th = document.createElement("th");
                th.scope = "col";
                th.textContent = String(a);
                head.append(th);
                const td = row.insertCell();
                // у составного p обратные есть не у всех
                let value = "—";
                try {
                    value = String(inverse(a, p));
                } catch (error) {
                    if (!(error instanceof RangeError)) {
                        throw error;
                    }
                }
                td.textContent = value;
                td.dataset.r = "1";
                td.dataset.c = String(a);
            }
            return table;
        }
        const corner = document.createElement("th");
        corner.textContent = kind === "add" ? "+" : "·";
        head.append(corner);
        for (let c = 0; c < p; c++) {
            const th = document.createElement("th");
            th.scope = "col";
            th.textContent = String(c);
            head.append(th);
        }
        const body = table.createTBody();
        for (let r = 0; r < p; r++) {
            const tr = body.insertRow();
            const th = document.createElement("th");
            th.scope = "row";
            th.textContent = String(r);
            tr.append(th);
            for (let c = 0; c < p; c++) {
                const td = tr.insertCell();
                td.textContent = String(kind === "add" ? (r + c) % p : (r * c) % p);
                td.dataset.r = String(r);
                td.dataset.c = String(c);
            }
        }
        return table;
    }

    /**
     * Таблица на месте рисунка; в таблицах поля подсвечено то, что нужно для наклона λ: обратное к знаменателю
     * и произведение числителя на него.
     * @param {Exclude<View, "plot" | "solution">} view
     * @param {ReturnType<typeof construction>} built
     */
    function showTable(view, built) {
        if (tableFor?.curve !== curve || tableFor.view !== view) {
            if (view === "points") {
                buildTable();
            } else {
                tableBox.replaceChildren(buildNumberTable(view));
            }
            tableFor = { curve, view };
        }
        if (view === "points") {
            markTable(built);
            return;
        }
        /** @type {[number, number][]} */
        const lit = [];
        if (built.kind === "line") {
            const { p } = curve;
            const { num, den } = slope(curve, built.P, built.Q);
            const bottom = mod(den, p);
            const flipped = inverse(bottom, p);
            // на таблице сложения λ не виден — там подсвечивать нечего
            if (view === "mul") {
                lit.push([bottom, flipped], [mod(num, p), flipped]);
            } else if (view === "inv") {
                lit.push([1, bottom]);
            }
        }
        for (const cell of tableBox.querySelectorAll("td")) {
            const r = Number(cell.dataset.r);
            const c = Number(cell.dataset.c);
            cell.classList.toggle(
                "ec-sum",
                lit.some(([row, column]) => row === r && column === c),
            );
        }
    }

    /** Таблица сложения: строка + столбец = клетка. O — в начале, как ноль. */
    function buildTable() {
        /** @type {Point[]} */
        const all = [null, ...points];
        const table = document.createElement("table");
        const head = table.createTHead().insertRow();
        const corner = document.createElement("th");
        corner.scope = "col";
        corner.textContent = "+";
        head.append(corner);
        for (const point of all) {
            const th = document.createElement("th");
            th.scope = "col";
            th.textContent = formatPoint(point);
            head.append(th);
        }
        const body = table.createTBody();
        all.forEach((row, r) => {
            const tr = body.insertRow();
            const th = document.createElement("th");
            th.scope = "row";
            th.textContent = formatPoint(row);
            tr.append(th);
            all.forEach((column, c) => {
                const td = tr.insertCell();
                td.textContent = formatPoint(add(curve, row, column));
                td.dataset.row = String(r);
                td.dataset.column = String(c);
            });
        });
        tableBox.replaceChildren(table);
    }

    /**
     * В таблице видно, где P и Q и куда они складываются.
     * @param {ReturnType<typeof construction>} built
     */
    function markTable(built) {
        const all = [null, ...points];
        const row = built.kind === "none" ? -1 : all.findIndex((point) => same(point, built.P));
        const column =
            built.kind === "line" && state.mode === "add" ? all.findIndex((point) => same(point, built.Q)) : -1;
        for (const cell of tableBox.querySelectorAll("td")) {
            const r = Number(cell.dataset.row);
            const c = Number(cell.dataset.column);
            cell.classList.toggle("ec-cross", r === row || c === column);
            cell.classList.toggle("ec-sum", r === row && c === column);
        }
        // клетка с суммой за краем таблицы — подвинуть её в середину; видную не трогаем, чтобы не прыгало
        const sum = tableBox.querySelector("td.ec-sum");
        if (sum) {
            const box = tableBox.getBoundingClientRect();
            const cell = sum.getBoundingClientRect();
            if (cell.left < box.left || cell.right > box.right || cell.top < box.top || cell.bottom > box.bottom) {
                tableBox.scrollLeft += cell.left - box.left - (box.width - cell.width) / 2;
                tableBox.scrollTop += cell.top - box.top - (box.height - cell.height) / 2;
            }
        }
    }

    /**
     * Клик по точке: в режиме P + Q по очереди ставит P и Q, в остальных — P.
     * @param {Spot} point
     */
    function choose(point) {
        if (state.mode === "add" && state.next === "Q") {
            state.Q = point;
            state.next = "P";
        } else {
            state.P = point;
            state.next = state.mode === "add" ? "Q" : "P";
        }
        draw(true);
    }

    /**
     * Точка по data-x и data-y у элемента, по которому кликнули.
     * @param {EventTarget | null} target
     * @returns {Spot | null}
     */
    function pointFrom(target) {
        const element = target instanceof Element ? target.closest("[data-x]") : null;
        if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
            return null;
        }
        const x = Number(element.dataset.x);
        const y = Number(element.dataset.y);
        return points.find((point) => point.x === x && point.y === y) ?? null;
    }

    plot.addEventListener("click", (event) => {
        const point = pointFrom(event.target);
        if (point && isPrime(curve.p)) {
            choose(point);
        }
    });
    list.addEventListener("click", (event) => {
        const point = pointFrom(event.target);
        if (point && isPrime(curve.p)) {
            choose(point);
        }
    });

    tableBox.addEventListener("click", (event) => {
        const cell = event.target instanceof Element ? event.target.closest("td") : null;
        // клик выбирает P и Q только в таблице сложения точек
        if (!cell || state.view !== "points") {
            return;
        }
        const all = [null, ...points];
        const row = all[Number(cell.dataset.row)];
        const column = all[Number(cell.dataset.column)];
        // с O в строке или столбце складывать нечего показывать: P + O = P
        if (row === null || column === null || row === undefined || column === undefined) {
            return;
        }
        setMode("add");
        state.P = row;
        state.Q = column;
        state.next = "P";
        draw(false);
    });

    /** @param {Mode} mode */
    function setMode(mode) {
        state.mode = mode;
        state.next = "Q";
        for (const button of modeButtons) {
            button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
        }
    }

    for (const button of modeButtons) {
        button.addEventListener("click", () => {
            const mode = button.dataset.mode;
            if (mode !== "add" && mode !== "double" && mode !== "inverse" && mode !== "orbit") {
                throw new Error(`index.html: у кнопки нет режима (data-mode="${mode}")`);
            }
            setMode(mode);
            if (mode === "add" && state.Q === null) {
                state.next = "Q";
            }
            draw(true);
        });
    }

    /** @param {View} view */
    function setView(view) {
        state.view = view;
        // у SVG нет свойства hidden — только атрибут
        plot.toggleAttribute("hidden", view !== "plot");
        solutionBox.hidden = view !== "solution";
        tableBox.hidden = view === "plot" || view === "solution";
        for (const button of viewButtons) {
            button.setAttribute("aria-pressed", String(button.dataset.view === view));
        }
    }

    for (const button of viewButtons) {
        button.addEventListener("click", () => {
            const view = button.dataset.view;
            if (
                view !== "plot" &&
                view !== "solution" &&
                view !== "points" &&
                view !== "add" &&
                view !== "mul" &&
                view !== "inv"
            ) {
                throw new Error(`index.html: у кнопки вида нет имени (data-view="${view}")`);
            }
            setView(view);
            draw(true);
        });
    }

    store.subscribe((next) => {
        curve = next;
        points = curvePoints(curve);
        const keep = (/** @type {Spot | null} */ point) => point !== null && points.some((other) => same(other, point));
        if (!keep(state.P) || (state.Q !== null && !keep(state.Q))) {
            const pair = startingPair(curve, points);
            state.P = pair.P;
            state.Q = pair.Q;
            state.next = "P";
        }
        draw(false);
    });

    draw(false);
    return {
        /** Показать построение заново — когда вкладку открыли. */
        replay() {
            draw(true);
        },
    };
}
