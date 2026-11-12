import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HELP, MESSAGES, run } from "../commands.js";

/**
 * @param {object[] | null} playlists папки внутри mp3; null — ещё грузятся
 */
function makeRoot(
    playlists = [
        { name: "liked", files: () => ["lushii - sushi.mp3", "Yung Angel - SAVE ME.mp3"] },
        { name: "night", files: () => [] },
    ],
) {
    return {
        name: "angel",
        folders: [
            { name: "mp3", folders: playlists },
            { name: "work", locked: true },
        ],
    };
}

const root = makeRoot();
const atRoot = { root, cwd: [] };
const inMp3 = { root, cwd: ["mp3"] };
const inLiked = { root, cwd: ["mp3", "liked"] };

describe("cd", () => {
    it("переходит в папку и ничего не печатает, как cmd", () => {
        assert.deepEqual(run("cd mp3", atRoot), { lines: [], cd: ["mp3"] });
        assert.deepEqual(run("  CD   MP3  ", atRoot), { lines: [], cd: ["mp3"] });
        assert.deepEqual(run("chdir mp3", atRoot), { lines: [], cd: ["mp3"] });
    });

    it("понимает cd.., cd\\ и cd/ без пробела", () => {
        assert.deepEqual(run("cd..", inMp3), { lines: [], cd: [] });
        assert.deepEqual(run("cd\\", inMp3), { lines: [], cd: [] });
        assert.deepEqual(run("cd/", inMp3), { lines: [], cd: [] });
        assert.deepEqual(run("cd..\\mp3", inMp3), { lines: [], cd: ["mp3"] });
    });

    it("без аргумента печатает текущую папку", () => {
        assert.deepEqual(run("cd", inMp3), { lines: ["SS:\\angel\\mp3"] });
    });

    it("отвечает текстом cmd на чужую и на закрытую папку", () => {
        assert.deepEqual(run("cd mp4", atRoot), { lines: [MESSAGES.notFound] });
        assert.deepEqual(run("cd work", atRoot), { lines: [MESSAGES.denied] });
    });
});

describe("dir и ls", () => {
    it("показывают папки корня", () => {
        assert.deepEqual(run("dir", atRoot).lines, ["  <DIR>  mp3", "  <DIR>  work"]);
        assert.deepEqual(run("ls -la", atRoot).lines, ["  <DIR>  mp3", "  <DIR>  work"]);
    });

    it("в mp3 показывают плейлисты, в плейлисте — треки, в той же колонке", () => {
        assert.deepEqual(run("dir", inMp3).lines, ["  <DIR>  liked", "  <DIR>  night"]);
        assert.deepEqual(run("dir", inLiked).lines, [
            "         lushii - sushi.mp3",
            "         Yung Angel - SAVE ME.mp3",
        ]);
        assert.deepEqual(run("dir mp3\\liked", atRoot).lines, run("dir", inLiked).lines);
    });

    it("говорят, если плейлисты ещё не загружены или папка пуста", () => {
        const loading = { root: makeRoot(null), cwd: ["mp3"] };
        assert.deepEqual(run("dir", loading).lines, [MESSAGES.notLoaded]);
        assert.deepEqual(run("dir liked", loading).lines, [MESSAGES.notLoaded]);
        assert.deepEqual(run("cd liked", loading).lines, [MESSAGES.notLoaded]);
        assert.deepEqual(run("dir night", inMp3).lines, [MESSAGES.noFiles]);
    });

    it("cd ходит по плейлистам", () => {
        assert.deepEqual(run("cd liked", inMp3), { lines: [], cd: ["mp3", "liked"] });
        assert.deepEqual(run("cd ..\\night", inLiked), { lines: [], cd: ["mp3", "night"] });
    });

    it("не открывают закрытую папку и не находят чужую", () => {
        assert.deepEqual(run("dir work", atRoot).lines, [MESSAGES.denied]);
        assert.deepEqual(run("dir nope", atRoot).lines, [MESSAGES.noFiles]);
    });

    it("падают с понятной ошибкой, если текущей папки нет — это ошибка в коде, а не ввод", () => {
        assert.throws(() => run("dir", { root, cwd: ["nope"] }), /dir: нет папки SS:\\angel\\nope/);
    });
});

describe("остальное", () => {
    it("cls и clear очищают экран", () => {
        assert.deepEqual(run("cls", atRoot), { lines: [], clear: true });
        assert.deepEqual(run("clear", atRoot), { lines: [], clear: true });
    });

    it("help печатает справку", () => {
        assert.deepEqual(run("help", atRoot), { lines: HELP });
    });

    it("пустая строка — без ответа", () => {
        assert.deepEqual(run("   ", atRoot), { lines: [] });
    });

    it("незнакомая команда — ответ cmd с её именем", () => {
        assert.deepEqual(run("sudo rm -rf", atRoot), {
            lines: ['"sudo" не является внутренней или внешней командой, исполняемой программой или пакетным файлом.'],
        });
        assert.deepEqual(run("mp3", atRoot).lines, [MESSAGES.unknown("mp3")]);
    });
});

describe("star_cursive и heart_cursive", () => {
    it("on и off включают и выключают след, регистр не важен", () => {
        assert.deepEqual(run("star_cursive on", atRoot), {
            lines: ["Звёздочки за курсором включены."],
            trail: { trail: "star", on: true },
        });
        assert.deepEqual(run("HEART_CURSIVE OFF", { ...atRoot, trails: { star: false, heart: true } }), {
            lines: ["Сердечки за курсором выключены."],
            trail: { trail: "heart", on: false },
        });
    });

    it("без аргумента говорит, включён ли след, как echo в cmd", () => {
        assert.deepEqual(run("star_cursive", { ...atRoot, trails: { star: true, heart: false } }), {
            lines: ["Звёздочки за курсором включены."],
        });
        assert.deepEqual(run("heart_cursive", atRoot), { lines: ["Сердечки за курсором выключены."] });
    });

    it("на другое слово подсказывает, как писать", () => {
        assert.deepEqual(run("star_cursive maybe", atRoot), { lines: [MESSAGES.trailUsage("star_cursive")] });
    });

    it("при уменьшении движения не включает, а выключить даёт", () => {
        assert.deepEqual(run("star_cursive on", { ...atRoot, calm: true }), { lines: [MESSAGES.calm] });
        assert.deepEqual(run("star_cursive off", { ...atRoot, calm: true }), {
            lines: ["Звёздочки за курсором выключены."],
            trail: { trail: "star", on: false },
        });
    });

    it("есть в справке", () => {
        assert.ok(HELP.some((line) => line.includes("star_cursive")));
        assert.ok(HELP.some((line) => line.includes("heart_cursive")));
    });
});

describe("музыка", () => {
    it("play, pause, next, prev и np уходят плееру, ответ пишет он сам", () => {
        assert.deepEqual(run("play", atRoot), { lines: [], player: { action: "play" } });
        assert.deepEqual(run("PAUSE", atRoot), { lines: [], player: { action: "pause" } });
        assert.deepEqual(run("next", atRoot), { lines: [], player: { action: "next" } });
        assert.deepEqual(run("prev", atRoot), { lines: [], player: { action: "prev" } });
        assert.deepEqual(run("np", atRoot), { lines: [], player: { action: "np" } });
    });

    it("play с названием ищет трек; пробелы внутри названия сохраняются", () => {
        assert.deepEqual(run("play   save that shit ", atRoot), {
            lines: [],
            player: { action: "play", query: "save that shit" },
        });
    });
});

describe("date, time, whoami", () => {
    const now = new Date(2026, 10, 12, 9, 5, 3, 427);

    it("date и time — как в cmd, с сотыми у времени", () => {
        assert.deepEqual(run("date", { ...atRoot, now }), { lines: ["Текущая дата: 12.11.2026"] });
        assert.deepEqual(run("time", { ...atRoot, now }), { lines: ["Текущее время: 09:05:03,42"] });
    });

    it("whoami — гость на диске angel", () => {
        assert.deepEqual(run("whoami", atRoot), { lines: [MESSAGES.whoami] });
    });
});

describe("light_star", () => {
    it("on и off включают и выключают сияние; без аргумента — сказать, сияют ли", () => {
        assert.deepEqual(run("light_star on", atRoot), { lines: [MESSAGES.lightOn], light: true });
        assert.deepEqual(run("light_star OFF", { ...atRoot, light: true }), {
            lines: [MESSAGES.lightOff],
            light: false,
        });
        assert.deepEqual(run("light_star", { ...atRoot, light: true }), { lines: [MESSAGES.lightOn] });
        assert.deepEqual(run("light_star", atRoot), { lines: [MESSAGES.lightOff] });
    });

    it("на другое слово подсказывает, как писать", () => {
        assert.deepEqual(run("light_star please", atRoot), { lines: [MESSAGES.trailUsage("light_star")] });
    });
});

describe("exit", () => {
    it("ничего не печатает, а просит показать надпись", () => {
        assert.deepEqual(run("exit", atRoot), { lines: [], exit: true });
    });

    it("в справке его нет — это сюрприз", () => {
        assert.ok(HELP.every((line) => !line.includes("exit")));
    });
});

describe("справка", () => {
    it("ровно три строки — столько видно на экране, и все команды в ней есть", () => {
        assert.equal(HELP.length, 3);
        const text = HELP.join(" ");
        for (const command of ["cd", "dir", "cls", "play", "pause", "next", "prev", "np", "date", "time", "whoami"]) {
            assert.ok(text.includes(command), command);
        }
        assert.ok(text.includes("light_star"));
    });
});
