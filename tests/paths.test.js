import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { folderAt, formatPath, hashFor, pathFromHash, resolve, samePath } from "../paths.js";

const root = {
    name: "angel",
    folders: [
        { name: "mp3", folders: [{ name: "covers" }] },
        { name: "work", locked: true },
    ],
};

/** @param {ReturnType<typeof resolve>} result */
function pathOf(result) {
    assert.equal(result.ok, true, `ожидали путь, а пришло ${JSON.stringify(result)}`);
    return result.ok ? result.path : null;
}

describe("resolve", () => {
    it("находит папку в текущей, без учёта регистра", () => {
        assert.deepEqual(pathOf(resolve(root, [], "mp3")), ["mp3"]);
        assert.deepEqual(pathOf(resolve(root, [], "MP3")), ["mp3"]);
    });

    it("идёт вглубь через \\ и /", () => {
        assert.deepEqual(pathOf(resolve(root, [], "mp3\\covers")), ["mp3", "covers"]);
        assert.deepEqual(pathOf(resolve(root, [], "mp3/covers/")), ["mp3", "covers"]);
    });

    it(".. поднимается на уровень и не выше корня", () => {
        assert.deepEqual(pathOf(resolve(root, ["mp3", "covers"], "..")), ["mp3"]);
        assert.deepEqual(pathOf(resolve(root, ["mp3"], "..\\..\\..")), []);
        assert.deepEqual(pathOf(resolve(root, ["mp3"], "covers\\..\\.")), ["mp3"]);
    });

    it("\\ в начале, SS:\\ и \\angel ведут от корня", () => {
        assert.deepEqual(pathOf(resolve(root, ["mp3"], "\\")), []);
        assert.deepEqual(pathOf(resolve(root, ["mp3"], "/")), []);
        assert.deepEqual(pathOf(resolve(root, ["mp3"], "\\angel\\mp3")), ["mp3"]);
        assert.deepEqual(pathOf(resolve(root, [], "ss:\\angel\\mp3\\covers")), ["mp3", "covers"]);
        assert.deepEqual(pathOf(resolve(root, ["mp3"], "SS:")), []);
    });

    it("снимает кавычки вокруг пути", () => {
        assert.deepEqual(pathOf(resolve(root, [], '"mp3"')), ["mp3"]);
    });

    it("не находит чужие папки и не пускает в закрытые", () => {
        assert.deepEqual(resolve(root, [], "mp4"), { ok: false, error: "not-found" });
        assert.deepEqual(resolve(root, [], "mp3\\nope"), { ok: false, error: "not-found" });
        assert.deepEqual(resolve(root, [], "angel"), { ok: false, error: "not-found" });
        assert.deepEqual(resolve(root, [], "work"), { ok: false, error: "locked" });
        assert.deepEqual(resolve(root, ["mp3"], "..\\WORK"), { ok: false, error: "locked" });
    });

    it("отдаёт саму папку вместе с путём", () => {
        const result = resolve(root, [], "mp3");
        assert.equal(result.ok && result.folder, root.folders[0]);
    });
});

describe("formatPath", () => {
    it("пишет путь как приглашение cmd", () => {
        assert.equal(formatPath(root, []), "SS:\\angel");
        assert.equal(formatPath(root, ["mp3", "covers"]), "SS:\\angel\\mp3\\covers");
    });
});

describe("адрес страницы", () => {
    it("hashFor: у корня адреса нет, у папки — #путь", () => {
        assert.equal(hashFor([]), "");
        assert.equal(hashFor(["mp3"]), "#mp3");
        assert.equal(hashFor(["mp3", "covers"]), "#mp3/covers");
    });

    it("pathFromHash читает то, что пишет hashFor", () => {
        for (const path of [[], ["mp3"], ["mp3", "covers"]]) {
            assert.deepEqual(pathFromHash(root, hashFor(path)), path);
        }
        assert.deepEqual(pathFromHash(root, "#MP3"), ["mp3"]);
        assert.deepEqual(pathFromHash(root, ""), []);
    });

    it("pathFromHash: чужая, закрытая папка или битый адрес — null", () => {
        assert.equal(pathFromHash(root, "#nope"), null);
        assert.equal(pathFromHash(root, "#work"), null);
        assert.equal(pathFromHash(root, "#%E0%A4%A"), null);
    });
});

describe("мелочи", () => {
    it("folderAt", () => {
        assert.equal(folderAt(root, []), root);
        assert.equal(folderAt(root, ["mp3", "covers"]), root.folders[0].folders[0]);
        assert.equal(folderAt(root, ["nope"]), null);
    });

    it("samePath", () => {
        assert.equal(samePath([], []), true);
        assert.equal(samePath(["mp3"], ["mp3"]), true);
        assert.equal(samePath(["mp3"], []), false);
        assert.equal(samePath(["mp3"], ["work"]), false);
    });
});
