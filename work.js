// @ts-check
// Вкладка work — лента с лабой 9. Живых частей две: меню слева (какой раздел сейчас читают)
// и демка на кривой. Остальное в ленте — разметка в index.html, математика — в curve.js.

import { G, LAB, curvePoints, multiply } from "./curve.js";
import { byId } from "./dom.js";

/** @typedef {import("./curve.js").Point} Point */
/** @typedef {"a" | "b" | "key"} Mode */

const SVG_NS = "http://www.w3.org/2000/svg";
// рисунок кривой: квадрат PLOT в единицах viewBox, по краям место под цифры осей
const PLOT = 620;
const PAD = 34;
const TICKS = [0, 7, 14, 21, 28];
const STEP = (PLOT - 2 * PAD) / (LAB.p - 1);
// «текущий» раздел — последний, чей верх поднялся выше этой доли экрана
const READING_LINE = 0.3;

/**
 * (8; 10) — как в тетради; O — точка на бесконечности.
 * @param {Point} point
 */
export function formatPoint(point) {
    return point === null ? "O" : `(${point.x}; ${point.y})`;
}

/**
 * Секрет из поля ввода: целое от 1 до p (дальше точки идут по кругу). Не число — null.
 * @param {string} value
 */
export function parseSecret(value) {
    const number = Number(value);
    if (value.trim() === "" || !Number.isFinite(number)) {
        return null;
    }
    return Math.min(LAB.p, Math.max(1, Math.round(number)));
}

/**
 * @param {string} tag
 * @param {Record<string, string | number>} attributes
 */
function svg(tag, attributes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
        node.setAttribute(name, String(value));
    }
    return node;
}

/** @param {number} x */
const plotX = (x) => PAD + x * STEP;
/** @param {number} y */
const plotY = (y) => PLOT - PAD - y * STEP;

/**
 * Подпись у точки. parts — куски текста; второй элемент куска уходит в нижний индекс: [["Y", "B"]] → Y_B.
 * @param {{ x: number, y: number }} point
 * @param {[string, string?][]} parts
 */
function pointLabel(point, parts) {
    const x = plotX(point.x);
    const y = plotY(point.y);
    // у правого и верхнего края подпись встаёт с другой стороны точки, чтобы не обрезалась
    const nearRight = x > PLOT - 90;
    const text = svg("text", {
        class: "plot-label",
        x: nearRight ? x - 13 : x + 13,
        y: y < 40 ? y + 24 : y - 11,
        "text-anchor": nearRight ? "end" : "start",
    });
    for (const [main, sub] of parts) {
        text.append(main);
        if (sub) {
            const index = svg("tspan", { "baseline-shift": "sub", "font-size": "0.72em" });
            index.textContent = sub;
            text.append(index);
        }
    }
    return text;
}

/**
 * Путь умножения: пунктирная линия и точки; O на рисунок не попадает.
 * @param {{ k: number, point: Point }[]} path
 * @param {"solid" | "dotted"} kind
 */
function pathLayer(path, kind) {
    const group = svg("g", { class: `plot-path plot-path-${kind}` });
    const points = path.map((step) => step.point).filter((point) => point !== null);
    group.append(svg("polyline", { points: points.map((point) => `${plotX(point.x)},${plotY(point.y)}`).join(" ") }));
    for (const point of points) {
        group.append(svg("circle", { class: "plot-hot", cx: plotX(point.x), cy: plotY(point.y), r: 4.2 }));
    }
    return group;
}

/** @param {Point} point */
function starAt(point) {
    if (point === null) {
        return svg("g", {});
    }
    return svg("use", {
        href: "#star",
        class: "plot-star",
        x: plotX(point.x) - 12,
        y: plotY(point.y) - 12,
        width: 24,
        height: 24,
    });
}

/** @param {number} k */
const multipleName = (k) => (k === 1 ? "G" : `${k}G`);

/**
 * Текст с нижними индексами: «Y_B» пишется как Y с маленькой B внизу, как в остальной ленте.
 * @param {HTMLElement} element
 * @param {string} text
 */
function writeWithIndexes(element, text) {
    const parts = text.split(/([XYK])_([AB])/);
    element.replaceChildren();
    for (let i = 0; i < parts.length; i += 3) {
        element.append(parts[i]);
        if (i + 2 < parts.length) {
            const index = document.createElement("sub");
            index.textContent = parts[i + 2];
            element.append(parts[i + 1], index);
        }
    }
}

/** Подключает меню и демку к разметке вкладки work из index.html. */
export function mountWork() {
    mountChain();
    mountDemo();
}

/** Меню слева: клик ведёт к разделу, а звезда стоит у того, который сейчас читают. */
function mountChain() {
    const screen = byId("work", HTMLElement);
    /** @type {[HTMLElement, HTMLButtonElement][]} */
    const items = [];
    // пункт, по которому кликнули: держим звезду на нём, пока лента едет к разделу, — иначе короткий
    // шаг 3 проскочил бы и звезда встала на шаг 4, чей верх тоже успел подняться
    /** @type {HTMLButtonElement | null} */
    let pinned = null;
    let release = 0;

    /** @param {HTMLButtonElement | undefined} current */
    function mark(current) {
        for (const [, button] of items) {
            if (button === current) {
                button.setAttribute("aria-current", "true");
            } else {
                button.removeAttribute("aria-current");
            }
        }
    }

    for (const button of byId("work-chain", HTMLElement).querySelectorAll("button")) {
        const target = byId(button.dataset.target ?? "", HTMLElement);
        items.push([target, button]);
        button.addEventListener("click", () => {
            pinned = button;
            mark(button);
            const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
        });
    }

    let frame = 0;
    function update() {
        frame = 0;
        const line = screen.getBoundingClientRect().top + screen.clientHeight * READING_LINE;
        let current = items[0]?.[1];
        for (const [target, button] of items) {
            if (target.getBoundingClientRect().top <= line) {
                current = button;
            }
        }
        mark(current);
    }
    // скролл приходит чаще, чем кадры: пересчитываем не больше раза за кадр
    const schedule = () => {
        if (pinned) {
            // лента ещё едет после клика; отпускаем, когда прокрутка затихнет
            clearTimeout(release);
            release = window.setTimeout(() => {
                pinned = null;
            }, 200);
            return;
        }
        if (frame === 0) {
            frame = requestAnimationFrame(update);
        }
    };
    screen.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
}

/** Демка: все точки кривой, секреты A и B в полях, путь умножения и общий ключ. */
function mountDemo() {
    const root = byId("demo", HTMLElement);
    const plot = byId("curve-plot", SVGSVGElement);
    const note = byId("demo-note", HTMLElement);
    const inputs = { a: byId("secret-a", HTMLInputElement), b: byId("secret-b", HTMLInputElement) };
    const modeButtons = byId("demo-modes", HTMLElement).querySelectorAll("button");

    const secrets = { a: 7, b: 4 };
    /** @type {Mode} */
    let mode = "a";

    // неподвижная часть рисунка: цифры осей и все точки кривой
    const base = svg("g", { class: "plot-base" });
    for (const tick of TICKS) {
        const below = svg("text", { class: "plot-tick", x: plotX(tick), y: PLOT - 6, "text-anchor": "middle" });
        below.textContent = String(tick);
        const aside = svg("text", { class: "plot-tick", x: 4, y: plotY(tick) + 4 });
        aside.textContent = String(tick);
        base.append(below, aside);
    }
    for (const point of curvePoints(LAB)) {
        base.append(svg("circle", { class: "plot-point", cx: plotX(point.x), cy: plotY(point.y), r: 3.2 }));
    }
    const live = svg("g", { class: "plot-live" });
    plot.replaceChildren(base, live);

    function render() {
        const x = secrets.a;
        const y = secrets.b;
        const toXA = multiply(LAB, x, G);
        const toYB = multiply(LAB, y, G);
        const toKA = multiply(LAB, x, toYB.result);
        const toKB = multiply(LAB, y, toXA.result);

        for (const node of root.querySelectorAll("[data-secret]")) {
            node.textContent = String(node.getAttribute("data-secret") === "a" ? x : y);
        }
        /** @type {Record<string, Point>} */
        const results = { xa: toXA.result, yb: toYB.result, ka: toKA.result, kb: toKB.result };
        for (const node of root.querySelectorAll("[data-point]")) {
            node.textContent = formatPoint(results[node.getAttribute("data-point") ?? ""] ?? null);
        }

        const layers = [];
        let text;
        if (mode === "key") {
            layers.push(pathLayer(toKA.path, "solid"), pathLayer(toKB.path, "dotted"));
            for (const [start, name] of /** @type {[Point, [string, string]][]} */ ([
                [toYB.result, ["Y", "B"]],
                [toXA.result, ["X", "A"]],
            ])) {
                if (start !== null) {
                    layers.push(pointLabel(start, [name]));
                }
            }
            if (toKA.result === null) {
                text = `${x} · ${y} делится на 30, а 30G = O: ключ ушёл в точку на бесконечности, такой не годится`;
            } else {
                layers.push(pointLabel(toKA.result, [["K"]]), starAt(toKA.result));
                text = `A умножает Y_B на ${x} (сплошная), B умножает X_A на ${y} (пунктир) — оба приходят в ${formatPoint(toKA.result)}`;
            }
        } else {
            const walk = mode === "a" ? toXA : toYB;
            layers.push(pathLayer(walk.path, mode === "a" ? "solid" : "dotted"));
            for (const step of walk.path) {
                if (step.point !== null) {
                    layers.push(pointLabel(step.point, [[multipleName(step.k)]]));
                }
            }
            layers.push(starAt(walk.result));
            const who = mode === "a" ? "A" : "B";
            text = `путь ${who}: ${walk.path.map((step) => multipleName(step.k)).join(" → ")} = ${formatPoint(walk.result)}`;
        }
        live.replaceChildren(...layers);
        writeWithIndexes(note, text);
        plot.setAttribute("aria-label", `Точки кривой y² = x³ − x + 2 по модулю 29; ${text.replaceAll("_", " ")}`);
    }

    for (const [who, input] of /** @type {["a" | "b", HTMLInputElement][]} */ (Object.entries(inputs))) {
        input.addEventListener("input", () => {
            const value = parseSecret(input.value);
            if (value !== null) {
                secrets[who] = value;
                render();
            }
        });
        // ушли из поля — показываем то число, с которым считали: 0 → 1, 40 → 29, пусто → прежнее
        input.addEventListener("change", () => {
            input.value = String(secrets[who]);
        });
    }

    for (const button of modeButtons) {
        button.addEventListener("click", () => {
            const chosen = button.dataset.mode;
            if (chosen !== "a" && chosen !== "b" && chosen !== "key") {
                throw new Error(`index.html: у кнопки демки нет режима (data-mode="${chosen}")`);
            }
            mode = chosen;
            for (const other of modeButtons) {
                other.setAttribute("aria-pressed", String(other === button));
            }
            render();
        });
    }

    render();
}
