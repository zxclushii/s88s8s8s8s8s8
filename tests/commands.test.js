import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HELP, MESSAGES, run } from "../commands.js";

/** @param {string[] | null} files что вернёт mp3 на dir */
function makeRoot(files = ["lushii - sushi.mp3", "Yung Angel - SAVE ME.mp3"]) {
    return {
        name: "angel",
        folders: [
            { name: "mp3", files: () => files },
            { name: "work", locked: true },
        ],
    };
}

const root = makeRoot();
const atRoot = { root, cwd: [] };
const inMp3 = { root, cwd: ["mp3"] };

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

    it("в mp3 показывают треки, в той же колонке, что и папки", () => {
        assert.deepEqual(run("dir", inMp3).lines, ["         lushii - sushi.mp3", "         Yung Angel - SAVE ME.mp3"]);
        assert.deepEqual(run("dir mp3", atRoot).lines, run("dir", inMp3).lines);
    });

    it("говорят, если список треков ещё не загружен или пуст", () => {
        assert.deepEqual(run("dir", { root: makeRoot(null), cwd: ["mp3"] }).lines, [MESSAGES.notLoaded]);
        assert.deepEqual(run("dir", { root: makeRoot([]), cwd: ["mp3"] }).lines, [MESSAGES.noFiles]);
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
