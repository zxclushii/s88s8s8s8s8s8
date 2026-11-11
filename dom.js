// @ts-check

/**
 * Элемент из index.html нужного типа. Если разметка и код разошлись — понятная ошибка сразу,
 * а не null, который упадёт где-то дальше.
 * @template {Element} T
 * @param {string} id
 * @param {new (...args: any[]) => T} type конструктор вроде HTMLInputElement; аргументы его не важны, отсюда any
 * @returns {T}
 */
export function byId(id, type) {
    const node = document.getElementById(id);
    if (!(node instanceof type)) {
        throw new Error(`index.html: нет элемента #${id} типа ${type.name}`);
    }
    return node;
}
