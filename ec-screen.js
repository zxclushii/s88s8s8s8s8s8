// @ts-check
// Папка elept1c curv3ss в work — программа к лабе 10 про эллиптические кривые. Пять вкладок: на плоскости,
// по модулю p, параметры, любая кривая (как ffplot) и шифр; меню слева переключает их, как цепочка разделов
// в ленте лабы 9. Вкладки 2, 3 и 5 смотрят на одну кривую: поменяли a, b или p на одной — пересчиталось везде.

import { LAB } from "./curve.js";
import { byId } from "./dom.js";
import { mountCipher } from "./ec-cipher.js";
import { equation } from "./ec-draw.js";
import { mountField } from "./ec-field.js";
import { mountFree } from "./ec-free.js";
import { mountParams } from "./ec-params.js";
import { mountPlane } from "./ec-plane.js";
import { createCurveStore, parseCurveField } from "./ec-store.js";

/** Имя папки — как его набирают в cd. */
export const EC_FOLDER = "elept1c curv3ss";

/** @typedef {"plane" | "field" | "params" | "free" | "cipher"} Tab */

/**
 * @param {string | undefined} name
 * @returns {name is Tab}
 */
function isTab(name) {
    return name === "plane" || name === "field" || name === "params" || name === "free" || name === "cipher";
}

/**
 * Подключает экран к разметке из index.html.
 * @returns {{ show: () => void }} show — экран только что открыли: построение на открытой вкладке рисуется заново
 */
export function mountEc() {
    const screen = byId("ec", HTMLElement);
    const store = createCurveStore({ ...LAB });
    const tabs = {
        plane: mountPlane(),
        field: mountField(store),
        params: mountParams(store),
        free: mountFree(),
        cipher: mountCipher(store),
    };
    const panels = {
        plane: byId("ec-plane", HTMLElement),
        field: byId("ec-field", HTMLElement),
        params: byId("ec-params", HTMLElement),
        free: byId("ec-free", HTMLElement),
        cipher: byId("ec-cipher", HTMLElement),
    };
    const buttons = byId("ec-tabs", HTMLElement).querySelectorAll("button");
    /** @type {Tab} */
    let current = "plane";

    /** @param {Tab} tab */
    function open(tab) {
        current = tab;
        for (const button of buttons) {
            if (button.dataset.tab === tab) {
                button.setAttribute("aria-current", "true");
            } else {
                button.removeAttribute("aria-current");
            }
        }
        for (const [name, panel] of Object.entries(panels)) {
            panel.hidden = name !== tab;
        }
        screen.scrollTop = 0;
        tabs[tab].replay();
    }

    for (const button of buttons) {
        button.addEventListener("click", () => {
            const tab = button.dataset.tab;
            if (!isTab(tab)) {
                throw new Error(`index.html: у вкладки нет имени (data-tab="${tab}")`);
            }
            open(tab);
        });
    }

    // поля a, b и p есть на двух вкладках: оба пишут в одну кривую и оба показывают её
    const fields = screen.querySelectorAll("input[data-curve]");
    function syncFields() {
        const curve = store.get();
        for (const input of fields) {
            const name = input instanceof HTMLInputElement ? input.dataset.curve : undefined;
            if ((name === "a" || name === "b" || name === "p") && document.activeElement !== input) {
                /** @type {HTMLInputElement} */ (input).value = String(curve[name]);
            }
        }
        for (const node of screen.querySelectorAll("[data-p]")) {
            node.textContent = String(curve.p);
        }
        for (const node of screen.querySelectorAll("[data-equation]")) {
            node.textContent = equation(curve.a, curve.b);
        }
    }
    for (const input of fields) {
        if (!(input instanceof HTMLInputElement)) {
            continue;
        }
        const name = input.dataset.curve;
        if (name !== "a" && name !== "b" && name !== "p") {
            throw new Error(`index.html: у поля кривой нет имени (data-curve="${name}")`);
        }
        input.addEventListener("input", () => {
            const next = parseCurveField(store.get(), name, input.value);
            if (next) {
                store.set(next);
            }
        });
        // ушли из поля — показываем то число, с которым считали: 3 → 29, если 3 не годится как p
        input.addEventListener("change", () => {
            input.value = String(store.get()[name]);
        });
    }
    store.subscribe(syncFields);
    syncFields();

    return {
        show() {
            tabs[current].replay();
        },
    };
}
