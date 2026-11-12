// @ts-check
// Терминал внизу экрана: строка ввода, ответы над ней, история команд стрелками, Tab дописывает имя папки.
// Что делают сами команды — в commands.js; сюда приходят строки ответа и что сделать странице.

import { run } from "./commands.js";
import { byId } from "./dom.js";
import { folderAt, formatPath, resolve } from "./paths.js";

/** @typedef {import("./paths.js").Folder} Folder */
/** @typedef {import("./paths.js").Path} Path */
/** @typedef {import("./trails.js").TrailSwitch} TrailSwitch */
/** @typedef {import("./commands.js").PlayerAction} PlayerAction */

/**
 * Что команды делают со страницей.
 * @typedef {object} Effects
 * @property {TrailSwitch} trails след за курсором: star_cursive и heart_cursive
 * @property {{ state: () => boolean, set: (on: boolean) => void }} light сияние звёзд: light_star
 * @property {() => void} exit красная надпись на весь экран
 * @property {(action: PlayerAction) => string[]} music команда плееру; плеер сам говорит, что вышло
 */

const HISTORY_LIMIT = 50;
// на экране видно три последние строки (это делает CSS), а в памяти держим с запасом
const LOG_LIMIT = 60;
const COMPLETABLE = /^(\s*(?:cd|chdir|dir|ls)\s+)(.*)$/i;

/**
 * Подключает терминал к разметке из index.html.
 * @param {{ root: Folder, onCd: (path: Path) => void, effects: Effects }} options onCd — команда просит
 *     перейти в папку; effects — всё остальное, что команды делают со страницей
 */
export function createTerminal({ root, onCd, effects }) {
    const box = byId("term-box", HTMLElement);
    const log = byId("term-log", HTMLElement);
    const form = byId("term-form", HTMLFormElement);
    const prompt = byId("term-prompt", HTMLElement);
    const input = byId("term-input", HTMLInputElement);

    /** @type {Path} */
    let cwd = [];
    /** @type {string[]} */
    const past = [];
    // где мы в истории: past.length — на новой строке, которую ещё не отправили
    let cursor = 0;
    let draft = "";

    /**
     * @param {string} text
     * @param {"echo" | "out"} kind echo — набранная команда с приглашением, out — ответ
     */
    function print(text, kind) {
        const line = document.createElement("p");
        line.className = `term-${kind}`;
        line.textContent = text;
        log.append(line);
        while (log.childElementCount > LOG_LIMIT) {
            log.firstElementChild?.remove();
        }
    }

    /**
     * Выполняет команду так, будто её набрали: печатает её с приглашением, потом ответ.
     * @param {string} line
     */
    function execute(line) {
        print(`${formatPath(root, cwd)}> ${line}`, "echo");
        const command = line.trim();
        if (command !== "" && past.at(-1) !== command) {
            past.push(command);
            if (past.length > HISTORY_LIMIT) {
                past.shift();
            }
        }
        cursor = past.length;
        draft = "";

        const result = run(line, {
            root,
            cwd,
            trails: effects.trails.state(),
            calm: effects.trails.calm(),
            light: effects.light.state(),
        });
        if (result.clear) {
            log.replaceChildren();
        }
        const answer = result.player ? [...result.lines, ...effects.music(result.player)] : result.lines;
        for (const text of answer) {
            print(text, "out");
        }
        if (result.trail) {
            effects.trails.set(result.trail.trail, result.trail.on);
        }
        if (result.light !== undefined) {
            effects.light.set(result.light);
        }
        if (result.exit) {
            effects.exit();
        }
        if (result.cd) {
            onCd(result.cd);
        }
    }

    /** @param {string} value */
    function setInput(value) {
        input.value = value;
        input.setSelectionRange(value.length, value.length);
    }

    /** Tab после cd, dir или ls дописывает имя папки. false — дописывать нечего, Tab работает как обычно. */
    function complete() {
        const match = COMPLETABLE.exec(input.value);
        if (!match) {
            return false;
        }
        const [, head, typed] = match;
        const cut = Math.max(typed.lastIndexOf("\\"), typed.lastIndexOf("/")) + 1;
        const base = typed.slice(0, cut);
        const start = typed.slice(cut).toLowerCase();
        let folder = folderAt(root, cwd);
        if (base !== "") {
            const target = resolve(root, cwd, base);
            folder = target.ok ? target.folder : null;
        }
        const names = (folder?.folders ?? [])
            .map((child) => child.name)
            .filter((name) => name.toLowerCase().startsWith(start));
        if (names.length === 0) {
            return false;
        }
        const completion = commonPrefix(names);
        if (completion.length <= start.length) {
            return false;
        }
        setInput(head + base + completion);
        return true;
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        execute(input.value);
        input.value = "";
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            if (cursor === past.length) {
                draft = input.value;
            }
            if (cursor > 0) {
                cursor -= 1;
                setInput(past[cursor]);
            }
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            if (cursor < past.length) {
                cursor += 1;
                setInput(cursor === past.length ? draft : past[cursor]);
            }
        } else if (event.key === "Tab" && !event.shiftKey && complete()) {
            event.preventDefault();
        }
    });

    // клик по терминалу — сразу печатать; но если выделяли текст ответа, чтобы скопировать, фокус не трогаем
    box.addEventListener("click", () => {
        if (document.activeElement !== input && !window.getSelection()?.toString()) {
            input.focus();
        }
    });

    // Начал печатать, когда фокус нигде, — буквы идут в терминал. Поля ввода и кнопки не перехватываем:
    // у кнопок свой пробел и Enter.
    document.addEventListener("keydown", (event) => {
        // isComposing — идёт набор через IME (японский и т. п.): букву ещё собирают, отбирать фокус нельзя
        if (
            event.defaultPrevented ||
            event.isComposing ||
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.key.length !== 1
        ) {
            return;
        }
        const active = document.activeElement;
        if (
            active &&
            active !== document.body &&
            active.matches("input, textarea, select, button, a, [contenteditable]")
        ) {
            return;
        }
        input.focus();
    });

    return {
        execute,
        /**
         * Сменить текущую папку: зовёт тот, кто следит за адресом страницы, — в том числе после кнопки «назад».
         * @param {Path} path
         */
        setCwd(path) {
            cwd = [...path];
            prompt.textContent = `${formatPath(root, cwd)}>`;
        },
    };
}

/**
 * Общее начало имён — как bash дописывает до развилки.
 * @param {string[]} names непустой список
 */
function commonPrefix(names) {
    let prefix = names[0];
    for (const name of names.slice(1)) {
        let length = 0;
        while (
            length < prefix.length &&
            length < name.length &&
            prefix[length].toLowerCase() === name[length].toLowerCase()
        ) {
            length += 1;
        }
        prefix = prefix.slice(0, length);
    }
    return prefix;
}
