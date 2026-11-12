// @ts-check
// Команды терминала: на входе строка, на выходе строки ответа и, может быть, что сделать странице —
// перейти в папку, включить след или сияние, управлять плеером. Ответы на ошибки — дословно как в русском cmd.

import { folderAt, formatPath, resolve } from "./paths.js";

/** @typedef {import("./paths.js").Folder} Folder */
/** @typedef {import("./paths.js").Path} Path */

/**
 * След за курсором: звёздочки или сердечки.
 * @typedef {"star" | "heart"} Trail
 */
/** @typedef {Record<Trail, boolean>} Trails какие следы сейчас включены */

/**
 * Что сделать с плеером; query — кусок названия трека для play.
 * @typedef {{ action: "play" | "pause" | "next" | "prev" | "np", query?: string }} PlayerAction
 */

/**
 * @typedef {object} Result
 * @property {string[]} lines что напечатать под командой
 * @property {Path} [cd] куда перейти
 * @property {boolean} [clear] очистить экран
 * @property {{ trail: Trail, on: boolean }} [trail] включить или выключить след за курсором
 * @property {boolean} [light] включить или выключить сияние звёзд
 * @property {PlayerAction} [player] команда плееру; что ответить, решает сам плеер
 * @property {true} [exit] показать, что бывает с теми, кто пишет exit
 */

export const MESSAGES = {
    notFound: "Системе не удается найти указанный путь.",
    denied: "Отказано в доступе.",
    noFiles: "Файл не найден",
    notLoaded: "Список треков не загружен.",
    calm: "В системе включено уменьшение движения — ничего сыпаться не будет.",
    /** @param {string} name */
    trailUsage: (name) => `Пиши ${name} on или ${name} off.`,
    lightOn: "Звёзды сияют.",
    lightOff: "Звёзды больше не сияют.",
    whoami: "angel\\гость",
    /** @param {string} name */
    unknown: (name) =>
        `"${name}" не является внутренней или внешней командой, исполняемой программой или пакетным файлом.`,
};

// на экране видно три строки ответа, поэтому справка — ровно в три строки
export const HELP = [
    "cd папка, cd .., dir, cls — ходить по диску (ls и clear тоже)",
    "play [трек], pause, next, prev, np — музыка; date, time, whoami",
    "star_cursive, heart_cursive, light_star — on или off",
];

/** @type {Record<"star_cursive" | "heart_cursive", Trail>} */
const TRAIL_COMMANDS = { star_cursive: "star", heart_cursive: "heart" };
const TRAIL_NAMES = { star: "Звёздочки", heart: "Сердечки" };

// отступы как у dir в cmd: имена папок и файлов начинаются с одной колонки
const DIR_MARK = "  <DIR>  ";
const FILE_MARK = " ".repeat(DIR_MARK.length);

/**
 * @typedef {object} Where
 * @property {Folder} root
 * @property {Path} cwd
 * @property {Trails} [trails] какие следы за курсором уже включены
 * @property {boolean} [calm] в системе просят меньше движения
 * @property {boolean} [light] звёзды уже сияют
 * @property {Date} [now] для date и time; в тестах — своё время
 */

/**
 * @param {string} line что набрали
 * @param {Where} where
 * @returns {Result}
 */
export function run(line, { root, cwd, trails = { star: false, heart: false }, calm = false, light = false, now }) {
    const text = line.trim();
    if (text === "") {
        return { lines: [] };
    }
    let name = text.split(/\s+/, 1)[0];
    let arg = text.slice(name.length).trim();
    // cmd понимает cd.. и cd\ без пробела — так набирают по привычке
    const glued = /^(cd|chdir)([\\/.].*)$/i.exec(name);
    if (glued) {
        name = glued[1];
        arg = `${glued[2]} ${arg}`.trim();
    }

    switch (name.toLowerCase()) {
        case "cd":
        case "chdir":
            return changeDir(root, cwd, arg);
        case "dir":
        case "ls":
            return listDir(root, cwd, arg);
        case "cls":
        case "clear":
            return { lines: [], clear: true };
        case "help":
            return { lines: [...HELP] };
        case "play":
            return { lines: [], player: arg === "" ? { action: "play" } : { action: "play", query: arg } };
        case "pause":
        case "next":
        case "prev":
        case "np":
            return {
                lines: [],
                player: { action: /** @type {"pause" | "next" | "prev" | "np"} */ (name.toLowerCase()) },
            };
        case "date":
            return { lines: [`Текущая дата: ${formatDate(now ?? new Date())}`] };
        case "time":
            return { lines: [`Текущее время: ${formatClock(now ?? new Date())}`] };
        case "whoami":
            return { lines: [MESSAGES.whoami] };
        case "light_star":
            return switchLight(arg, light);
        case "exit":
            return { lines: [], exit: true };
        case "star_cursive":
        case "heart_cursive":
            return switchTrail(/** @type {"star_cursive" | "heart_cursive"} */ (name.toLowerCase()), arg, trails, calm);
        default:
            return { lines: [MESSAGES.unknown(name)] };
    }
}

/**
 * @param {Folder} root
 * @param {Path} cwd
 * @param {string} arg
 * @returns {Result}
 */
function changeDir(root, cwd, arg) {
    // cd без аргумента в cmd печатает, где ты сейчас
    if (arg === "") {
        return { lines: [formatPath(root, cwd)] };
    }
    const target = resolve(root, cwd, arg);
    if (!target.ok) {
        return { lines: [failure(target.error, MESSAGES.notFound)] };
    }
    return { lines: [], cd: target.path };
}

/**
 * @param {Folder} root
 * @param {Path} cwd
 * @param {string} arg
 * @returns {Result}
 */
function listDir(root, cwd, arg) {
    // ls -la по привычке: ключи не нужны, список и так один
    const where = arg
        .split(/\s+/)
        .filter((word) => word !== "" && !word.startsWith("-"))
        .join(" ");
    let folder = folderAt(root, cwd);
    if (where !== "") {
        const target = resolve(root, cwd, where);
        if (!target.ok) {
            return { lines: [failure(target.error, MESSAGES.noFiles)] };
        }
        folder = target.folder;
    }
    if (!folder) {
        // cwd приходит от терминала и всегда существует; сюда попадаем только из-за ошибки в коде
        throw new Error(`dir: нет папки ${formatPath(root, cwd)}`);
    }

    // папки внутри ещё не пришли с GitHub (или не пришли совсем)
    if (folder.folders === null) {
        return { lines: [MESSAGES.notLoaded] };
    }
    const files = folder.files ? folder.files() : [];
    const lines = [
        ...(folder.folders ?? []).map((child) => DIR_MARK + child.name),
        ...files.map((file) => FILE_MARK + file),
    ];
    return { lines: lines.length > 0 ? lines : [MESSAGES.noFiles] };
}

/**
 * 12.11.2026 — день, месяц, год, как в русской Windows.
 * @param {Date} date
 */
function formatDate(date) {
    const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/**
 * 09:05:03,42 — с сотыми, как time в cmd.
 * @param {Date} date
 */
function formatClock(date) {
    const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
    const hundredths = pad(Math.floor(date.getMilliseconds() / 10));
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())},${hundredths}`;
}

/**
 * light_star on / off — сияние у всех звёзд на сайте. Без аргумента — сказать, сияют ли.
 * @param {string} arg
 * @param {boolean} light
 * @returns {Result}
 */
function switchLight(arg, light) {
    const word = arg.toLowerCase();
    if (word === "") {
        return { lines: [light ? MESSAGES.lightOn : MESSAGES.lightOff] };
    }
    if (word !== "on" && word !== "off") {
        return { lines: [MESSAGES.trailUsage("light_star")] };
    }
    const on = word === "on";
    return { lines: [on ? MESSAGES.lightOn : MESSAGES.lightOff], light: on };
}

/**
 * star_cursive on / off — включить или выключить след. Без аргумента — сказать, включён ли он, как echo в cmd.
 * @param {"star_cursive" | "heart_cursive"} command
 * @param {string} arg
 * @param {Trails} trails
 * @param {boolean} calm
 * @returns {Result}
 */
function switchTrail(command, arg, trails, calm) {
    const trail = TRAIL_COMMANDS[command];
    const word = arg.toLowerCase();
    if (word === "") {
        return { lines: [`${TRAIL_NAMES[trail]} за курсором ${trails[trail] ? "включены" : "выключены"}.`] };
    }
    if (word !== "on" && word !== "off") {
        return { lines: [MESSAGES.trailUsage(command)] };
    }
    const on = word === "on";
    if (on && calm) {
        return { lines: [MESSAGES.calm] };
    }
    return { lines: [`${TRAIL_NAMES[trail]} за курсором ${on ? "включены" : "выключены"}.`], trail: { trail, on } };
}

/**
 * Ответ на путь, который не разобрался.
 * @param {"not-found" | "locked" | "pending"} error
 * @param {string} notFound у cd и dir свои слова для «нет такого»
 */
function failure(error, notFound) {
    if (error === "locked") {
        return MESSAGES.denied;
    }
    return error === "pending" ? MESSAGES.notLoaded : notFound;
}
