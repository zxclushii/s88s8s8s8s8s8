// @ts-check
// Решение по шагам — как Run, Step и Practice в программе FiniteField: показать всё сразу, открывать по одному
// шагу или посчитать самому, а программа проверит. Сами шаги приходят готовыми из ec-steps.js и ec-elgamal.js.

/** @typedef {import("./ec-steps.js").Step} Step */
/** @typedef {"all" | "step" | "self"} Way */

const SVG_NS = "http://www.w3.org/2000/svg";
// как можно написать точку на бесконечности
const INFINITY = new Set(["o", "о", "0", "∞", "inf"]);

/**
 * Совпадает ли ответ с правильным: (16; 14), 16;14, 16 14 и (16, 14) — одно и то же; минус любой.
 * Точку O можно записать как O, о, 0 или ∞.
 * @param {string} typed
 * @param {string} expected
 */
export function sameAnswer(typed, expected) {
    const clean = typed.trim().toLowerCase().replaceAll("−", "-");
    if (expected === "O") {
        return INFINITY.has(clean.replace(/[()\s]/g, ""));
    }
    const numbers = (/** @type {string} */ text) => (text.replaceAll("−", "-").match(/-?\d+/g) ?? []).map(Number);
    const want = numbers(expected);
    const got = numbers(clean);
    // ничего лишнего, кроме цифр, скобок, ; и , — иначе «16 abc 14» засчитался бы
    return (
        want.length > 0 &&
        /^[\d\s();,.-]*$/.test(clean) &&
        got.length === want.length &&
        got.every((n, i) => n === want[i])
    );
}

/**
 * Строка шага целиком: формула, промежуточные числа, ответ, пояснение.
 * @param {HTMLElement} item
 * @param {Step} step
 * @param {{ hideAnswer?: boolean }} [options]
 */
function fillStep(item, step, options = {}) {
    const lead = document.createElement("span");
    lead.className = "ec-line-f";
    lead.textContent = step.formula + (step.work && !options.hideAnswer ? ` ${step.work}` : "");
    item.append(lead);
    if (step.answer !== undefined && !options.hideAnswer) {
        const answer = document.createElement("b");
        answer.className = "ec-line-a";
        answer.textContent = ` ${step.sign ?? "≡"} ${step.answer}`;
        item.append(answer);
    }
    if (step.note && !options.hideAnswer) {
        const note = document.createElement("span");
        note.className = "ec-line-n";
        note.textContent = `, ${step.note}`;
        item.append(note);
    }
}

/**
 * Подключает разбор к пустому контейнеру из index.html.
 * @param {HTMLElement} root
 * @returns {{ show: (title: string, steps: Step[]) => void }}
 */
export function createSolution(root) {
    const bar = document.createElement("div");
    bar.className = "ec-solution-bar";
    const ways = document.createElement("div");
    ways.className = "ec-ways";
    ways.setAttribute("role", "group");
    ways.setAttribute("aria-label", "Как показать решение");
    /** @type {[Way, string][]} */
    const names = [
        ["all", "сразу"],
        ["step", "по шагам"],
        ["self", "посчитать самому"],
    ];
    const wayButtons = names.map(([way, text]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.way = way;
        button.textContent = text;
        ways.append(button);
        return button;
    });
    const action = document.createElement("button");
    action.type = "button";
    action.className = "ec-solution-act";
    bar.append(ways, action);
    const title = document.createElement("p");
    title.className = "ec-solution-title";
    const lines = document.createElement("ol");
    lines.className = "ec-solution-lines";
    const verdict = document.createElement("p");
    verdict.className = "ec-solution-verdict";
    verdict.setAttribute("aria-live", "polite");
    root.replaceChildren(bar, title, lines, verdict);

    const state = {
        /** @type {Way} */
        way: "all",
        /** @type {Step[]} */
        steps: [],
        // сколько шагов открыто в режиме «по шагам»
        shown: 1,
        checked: false,
    };

    function render() {
        for (const button of wayButtons) {
            button.setAttribute("aria-pressed", String(button.dataset.way === state.way));
        }
        lines.replaceChildren();
        verdict.textContent = "";
        const { steps, way } = state;
        steps.forEach((step, i) => {
            if (way === "step" && i >= state.shown) {
                return;
            }
            const item = document.createElement("li");
            if (way === "self" && step.answer !== undefined) {
                // формула — да, ответ — нет: его вписывают сами
                fillStep(item, step, { hideAnswer: true });
                const input = document.createElement("input");
                input.type = "text";
                input.className = "ec-line-input";
                input.autocomplete = "off";
                input.spellcheck = false;
                input.dataset.step = String(i);
                input.setAttribute("aria-label", `${step.formula}: ответ`);
                const sign = document.createElement("span");
                sign.className = "ec-line-f";
                sign.textContent = ` ${step.sign ?? "≡"} `;
                item.append(sign, input);
            } else {
                fillStep(item, step);
            }
            lines.append(item);
        });
        action.hidden = way === "all";
        action.textContent = way === "self" ? "проверить" : state.shown < steps.length ? "дальше" : "сначала";
    }

    function check() {
        let right = 0;
        let total = 0;
        for (const input of lines.querySelectorAll("input")) {
            const step = state.steps[Number(input.dataset.step)];
            if (step.answer === undefined) {
                continue;
            }
            total += 1;
            const item = input.closest("li");
            item?.querySelector(".ec-line-mark")?.remove();
            const mark = document.createElement("span");
            mark.className = "ec-line-mark";
            if (sameAnswer(input.value, step.answer)) {
                right += 1;
                const star = document.createElementNS(SVG_NS, "svg");
                star.setAttribute("class", "ec-ok");
                star.setAttribute("aria-hidden", "true");
                const use = document.createElementNS(SVG_NS, "use");
                use.setAttribute("href", "#star");
                star.append(use);
                mark.append(star);
                mark.append(step.note ? ` ${step.note}` : "");
            } else {
                mark.textContent = ` → ${step.answer}${step.note ? `, ${step.note}` : ""}`;
                mark.classList.add("ec-line-wrong");
            }
            item?.append(mark);
        }
        verdict.textContent =
            total === 0 ? "" : right === total ? `верно всё: ${right} из ${total}` : `верно ${right} из ${total}`;
    }

    for (const button of wayButtons) {
        button.addEventListener("click", () => {
            const way = button.dataset.way;
            if (way !== "all" && way !== "step" && way !== "self") {
                return;
            }
            state.way = way;
            state.shown = 1;
            render();
        });
    }
    action.addEventListener("click", () => {
        if (state.way === "self") {
            check();
            return;
        }
        state.shown = state.shown < state.steps.length ? state.shown + 1 : 1;
        render();
    });
    // Enter в поле ответа — то же, что «проверить»
    lines.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            check();
        }
    });

    return {
        show(text, steps) {
            title.textContent = text;
            state.steps = steps;
            state.shown = 1;
            render();
        },
    };
}
