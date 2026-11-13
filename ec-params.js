// @ts-check
// Вкладка «параметры»: по шагам из методички — годится ли кривая для шифра. Гладкая ли она, сколько у неё
// точек, влезает ли их число в рамку Хассе, какой у него простой делитель q и какая точка P рождает
// подгруппу из q точек: qP = O. Справа эта подгруппа нарисована, и видно, где m в рамке Хассе.

import { G, curvePoints, discriminant, hasse, isPrime, largestPrimeFactor, pointOfOrder, subgroup } from "./curve.js";
import { byId } from "./dom.js";
import {
    drawFieldBase,
    fieldScale,
    formatNumber,
    formatPoint,
    halo,
    play,
    pointName,
    stage,
    star,
    svg,
    svgText,
} from "./ec-draw.js";

/** @typedef {import("./curve.js").Curve} Curve */
/** @typedef {import("./ec-store.js").CurveStore} CurveStore */
/** @typedef {{ x: number, y: number }} Spot */

/**
 * Шаг проверки: формула, пояснение и вышло ли. off — до шага не дошли: предыдущий не прошёл.
 * @typedef {{ formula: string, text: string, ok: boolean, off?: boolean }} Step
 */

// рисунок подгруппы — та же сетка, что во вкладке «по модулю p»
const AREA = { left: 40, top: 70, size: 584 };
const HALO_Y = 34;
const EDGES = { right: AREA.left + AREA.size, top: AREA.top };
// рамка Хассе: ширина рисунка и отступы по краям
const HASSE_WIDTH = 420;
const HASSE_PAD = 24;
// анимация: шаги появляются по очереди, потом подгруппа точка за точкой
const STEP_DELAY = 110;
const ORBIT = 1500;

/**
 * Все пять шагов для кривой и точка порядка q, если до неё дошли.
 * @param {Curve} curve
 * @returns {{ steps: Step[], m: number, found: { base: Spot, n: number, point: Spot } | null, q: number }}
 */
function check(curve) {
    const { p } = curve;
    const points = curvePoints(curve);
    const m = points.length + 1;
    const off = (/** @type {string} */ text) => ({ formula: "—", text, ok: false, off: true });
    const rest = [
        off("столько точек у кривой вместе с O"),
        off("теорема Хассе: m всегда около p + 1"),
        off("m = n · q, q — простое"),
        off("точка порядка q: qP = O"),
    ];

    if (!isPrime(p)) {
        return {
            steps: [
                {
                    formula: `p = ${p} — не простое`,
                    text: "по модулю составного числа делить можно не на всё: поля нет, дальше считать нечего",
                    ok: false,
                },
                ...rest,
            ],
            m,
            found: null,
            q: 0,
        };
    }
    const { value, residue } = discriminant(curve);
    const shown = value === residue ? `4a³ + 27b² = ${value}` : `4a³ + 27b² = ${formatNumber(value, 0)} ≡ ${residue}`;
    if (residue === 0) {
        return {
            // shown уже кончается на «≡ 0» или «= 0»
            steps: [
                { formula: shown, text: "кривая особая: с петлёй или остриём, для шифра не годится", ok: false },
                ...rest,
            ],
            m,
            found: null,
            q: 0,
        };
    }

    const { low, high } = hasse(p);
    const q = largestPrimeFactor(m);
    const n = m / q;
    const found = pointOfOrder(curve, q, G);
    /** @type {Step[]} */
    const steps = [
        { formula: `${shown} ≠ 0`, text: "кривая гладкая: без петель и острых углов", ok: true },
        {
            formula: `m = ${points.length} + O = ${m}`,
            text: "столько точек у кривой вместе с точкой на бесконечности",
            ok: true,
        },
        {
            formula: `${formatNumber(low)} ≤ ${m} ≤ ${formatNumber(high)}`,
            text: "теорема Хассе: m всегда около p + 1, отступ не больше 2√p",
            ok: low <= m && m <= high,
        },
        {
            formula: n === 1 ? `m = ${m} — простое, q = ${q}` : `m = ${n} · ${q}, q = ${q} — простое`,
            text: "в методичке 2²⁵⁴ < q < 2²⁵⁶, у нас числа игрушечные",
            ok: true,
        },
        found === null
            ? off("точка порядка q: qP = O")
            : {
                  formula:
                      found.n === 1
                          ? `P = ${formatPoint(found.point)}, ${q}P = O`
                          : `P = ${found.n} · ${formatPoint(found.base)} = ${formatPoint(found.point)}, ${q}P = O`,
                  text: "точка порядка q: через q шагов возвращается в O",
                  ok: true,
              },
    ];
    return { steps, m, found, q };
}

/**
 * Подпись под подгруппой.
 * @param {number} q
 */
function orbitNote(q) {
    if (q === 2) {
        return "У P y = 0, поэтому P = −P и сразу 2P = O: подгруппа из двух точек, P и O.";
    }
    const chain =
        q <= 6
            ? Array.from({ length: q - 1 }, (_, i) => (i === 0 ? "P" : `${i + 1}P`)).join(" → ")
            : `P → 2P → … → ${q - 1}P`;
    return `${chain} → O: подгруппа из ${q} точек. ${q - 1}P = −P, поэтому следующий шаг — O.`;
}

/**
 * Подключает вкладку к разметке из index.html.
 * @param {CurveStore} store
 */
export function mountParams(store) {
    const list = byId("params-steps", HTMLElement);
    const plot = byId("params-plot", SVGSVGElement);
    const note = byId("params-note", HTMLElement);
    const frame = byId("params-hasse", SVGSVGElement);
    let stop = () => {};

    /** @param {boolean} animate */
    function draw(animate) {
        stop();
        const curve = store.get();
        const { steps, m, found, q } = check(curve);

        const items = steps.map((step, i) => {
            const item = document.createElement("li");
            item.classList.toggle("ec-off", Boolean(step.off));
            const number = document.createElement("span");
            number.className = "ec-step-n";
            number.textContent = String(i + 1);
            const body = document.createElement("div");
            const formula = document.createElement("p");
            formula.className = "ec-step-f";
            formula.textContent = step.formula;
            if (step.ok) {
                const mark = svg("svg", { class: "ec-ok", "aria-hidden": "true" }, formula);
                svg("use", { href: "#star" }, mark);
            }
            const text = document.createElement("p");
            text.className = "ec-step-t";
            text.textContent = step.text;
            body.append(formula, text);
            item.append(number, body);
            return item;
        });
        list.replaceChildren(...items);

        // подгруппа точки P на сетке
        const field = fieldScale(curve.p, AREA);
        const { X, Y } = field;
        plot.replaceChildren();
        drawFieldBase(svg("g", {}, plot), curve.p, field, curvePoints(curve));
        const layer = svg("g", {}, plot);
        const marks = svg("g", {}, plot);
        frame.replaceChildren();
        /** @type {((elapsed: number) => void)[]} */
        const frames = [];
        let duration = steps.length * STEP_DELAY;

        items.forEach((item, i) => {
            frames.push((elapsed) => {
                item.style.opacity = String(stage(elapsed, i * STEP_DELAY, 260));
            });
        });

        if (found === null) {
            note.textContent = "";
        } else {
            const path = /** @type {Spot[]} */ (subgroup(curve, found.point).filter((point) => point !== null));
            const begin = steps.length * STEP_DELAY;
            const each = ORBIT / Math.max(1, path.length);
            const polyline = svg("polyline", { class: "ec-path", points: "" }, layer);
            const dots = path.map((point, i) => {
                const dot =
                    i === 0 ? null : svg("circle", { class: "ec-hot", cx: X(point.x), cy: Y(point.y), r: 4 }, marks);
                const named = i > 0 && (path.length <= 12 || i < 3 || i === path.length - 1);
                const last = i === path.length - 1 && i > 0;
                const name = named
                    ? pointName(marks, X(point.x), Y(point.y), last ? `${i + 1}P = −P` : `${i + 1}P`, "ec-name", EDGES)
                    : null;
                return { dot, name };
            });
            star(marks, X(found.point.x), Y(found.point.y), 28);
            pointName(marks, X(found.point.x), Y(found.point.y), "P", "ec-name-big", EDGES);

            // последний шаг: (q − 1)P = −P, и прямая через P и −P уходит вверх, в O
            const x = X(found.point.x);
            const lowest = Math.max(Y(found.point.y), Y(path[path.length - 1].y));
            const column = svg("line", { class: "ec-wrap", x1: x, y1: lowest, x2: x, y2: lowest }, layer);
            const lift = svg("line", { class: "ec-line", x1: x, y1: AREA.top, x2: x, y2: AREA.top }, layer);
            const nimbus = halo(marks, x, HALO_Y);
            const lifted = begin + each * path.length;
            duration = lifted + 900;
            frames.push((elapsed) => {
                const shown = Math.min(path.length, Math.max(0, Math.floor((elapsed - begin) / each) + 1));
                polyline.setAttribute(
                    "points",
                    path
                        .slice(0, shown)
                        .map((point) => `${X(point.x)},${Y(point.y)}`)
                        .join(" "),
                );
                dots.forEach(({ dot, name }, i) => {
                    dot?.setAttribute("opacity", i < shown ? "1" : "0");
                    name?.setAttribute("opacity", i < shown ? "1" : "0");
                });
                column.setAttribute("y2", String(lowest + (AREA.top - lowest) * stage(elapsed, lifted, 500)));
                lift.setAttribute("y2", String(AREA.top + (HALO_Y + 8 - AREA.top) * stage(elapsed, lifted + 500, 250)));
                nimbus.setAttribute("opacity", String(stage(elapsed, lifted + 700, 200)));
            });
            note.textContent = orbitNote(q);

            // рамка Хассе: отрезок, где может быть m, и звезда там, где оно на самом деле
            const { low, high } = hasse(curve.p);
            /** @param {number} value */
            const at = (value) => HASSE_PAD + ((value - low) / (high - low)) * (HASSE_WIDTH - 2 * HASSE_PAD);
            svg("line", { class: "ec-mirror", x1: at(low), y1: 40, x2: at(high), y2: 40 }, frame);
            for (const value of [low, high]) {
                svg("line", { class: "ec-hasse-end", x1: at(value), y1: 33, x2: at(value), y2: 47 }, frame);
                svgText(frame, at(value), 68, formatNumber(value), "ec-tick", "middle");
            }
            const mark = star(frame, at(m), 40, 24);
            const label = svgText(frame, at(m), 20, `m = ${m}`, "ec-hasse-m", "middle");
            frames.push((elapsed) => {
                const seen = String(stage(elapsed, 2 * STEP_DELAY, 300));
                mark.setAttribute("opacity", seen);
                label.setAttribute("opacity", seen);
            });
        }
        frame.setAttribute(
            "aria-label",
            found === null
                ? ""
                : `Рамка Хассе: m = ${m} между ${formatNumber(hasse(curve.p).low)} и ${formatNumber(hasse(curve.p).high)}`,
        );
        plot.setAttribute(
            "aria-label",
            found === null ? "Точки кривой" : `Подгруппа точки P порядка ${q}: ${note.textContent}`,
        );

        stop = play(
            duration,
            (elapsed) => {
                for (const each of frames) {
                    each(elapsed);
                }
            },
            animate,
        );
    }

    store.subscribe(() => draw(false));
    draw(false);
    return {
        /** Показать построение заново — когда вкладку открыли. */
        replay() {
            draw(true);
        },
    };
}
