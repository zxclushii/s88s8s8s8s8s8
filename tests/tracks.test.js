import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPlaylists, splitTrackName } from "../tracks.js";

/** @param {string[]} blobs @param {string[]} [trees] */
function tree(blobs, trees = []) {
    return [...trees.map((path) => ({ path, type: "tree" })), ...blobs.map((path) => ({ path, type: "blob" }))];
}

describe("buildPlaylists", () => {
    it("плейлист — подпапка tracks/, трек — mp3, обложка — jpg с тем же именем", () => {
        const playlists = buildPlaylists(
            tree(["tracks/liked/lushii - sushi.mp3", "tracks/liked/lushii - sushi.JPG", "tracks/liked/notes.txt"]),
        );
        assert.deepEqual(playlists, [
            {
                name: "liked",
                tracks: [
                    {
                        artist: "lushii",
                        title: "sushi",
                        file: "lushii - sushi.mp3",
                        src: "tracks/liked/lushii%20-%20sushi.mp3",
                        cover: "tracks/liked/lushii%20-%20sushi.JPG",
                    },
                ],
            },
        ]);
    });

    it("liked первым, остальные по алфавиту; треки по именам файлов", () => {
        const playlists = buildPlaylists(
            tree(["tracks/old/b.mp3", "tracks/old/a.mp3", "tracks/liked/x.mp3", "tracks/night/y.mp3"]),
        );
        assert.deepEqual(
            playlists.map((p) => p.name),
            ["liked", "night", "old"],
        );
        assert.deepEqual(
            playlists[2].tracks.map((t) => t.file),
            ["a.mp3", "b.mp3"],
        );
    });

    it("без обложки — null; папка без mp3 — пустой плейлист", () => {
        const playlists = buildPlaylists(tree(["tracks/liked/a.mp3", "tracks/empty/.gitkeep"], ["tracks/empty"]));
        assert.equal(playlists[0].tracks[0].cover, null);
        assert.deepEqual(playlists[1], { name: "empty", tracks: [] });
    });

    it("файлы прямо в tracks/, папки глубже и всё вне tracks/ — мимо", () => {
        const playlists = buildPlaylists(
            tree(["tracks/loose.mp3", "tracks/liked/deep/z.mp3", "other/liked/q.mp3", "tracks/liked/a.mp3"]),
        );
        assert.deepEqual(
            playlists.map((p) => [p.name, p.tracks.map((t) => t.file)]),
            [["liked", ["a.mp3"]]],
        );
    });

    it("кодирует пробелы, # и ? в ссылке на файл", () => {
        const [playlist] = buildPlaylists(tree(["tracks/rap #1/a?.mp3"]));
        assert.equal(playlist.tracks[0].src, "tracks/rap%20%231/a%3F.mp3");
    });

    it("пропускает мусор вместо записей дерева", () => {
        assert.deepEqual(buildPlaylists([null, 5, { path: 1, type: "blob" }, { type: "blob" }]), []);
    });
});

describe("splitTrackName", () => {
    it("режет по первому « - »", () => {
        assert.deepEqual(splitTrackName("ClariS - Connect - TV size"), {
            artist: "ClariS",
            title: "Connect - TV size",
        });
        assert.deepEqual(splitTrackName("sushi"), { artist: "", title: "sushi" });
    });
});
