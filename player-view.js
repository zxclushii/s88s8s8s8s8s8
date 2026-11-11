// @ts-check
// Экран mp3: плейлист слева, обложка со свечением по центру, название у её угла, панель с кнопками.
// Здесь только DOM. Что показать, решает player.js и зовёт методы show*.

import { byId } from "./dom.js";

/** @typedef {import("./tracks.js").Track} Track */
/** @typedef {"off" | "all" | "one"} RepeatMode */

/**
 * @typedef {object} Handlers
 * @property {() => void} onPlayPause
 * @property {() => void} onPrevious
 * @property {() => void} onNext
 * @property {() => void} onShuffle
 * @property {() => void} onRepeat
 * @property {(seconds: number) => void} onSeek
 * @property {(level: number, final: boolean) => void} onVolume level 0…1; final — ползунок отпустили
 * @property {() => void} onMute
 * @property {(index: number) => void} onSelect номер трека в показанном плейлисте
 */

const SEEK_STEPS = 1000;
const REPEAT_LABELS = { off: "Повтор: выключен", all: "Повтор: весь плейлист", one: "Повтор: один трек" };

/**
 * 0:05, 3:07, 61:40.
 * @param {number} seconds
 */
export function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * 1 трек, 2 трека, 5 треков, 11 треков, 21 трек.
 * @param {number} count
 */
export function tracksLabel(count) {
    const tens = count % 100;
    const ones = count % 10;
    if (ones === 1 && tens !== 11) {
        return `${count} трек`;
    }
    if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) {
        return `${count} трека`;
    }
    return `${count} треков`;
}

/**
 * Заливка полоски до ползунка: в Chrome и Safari её рисует фон дорожки по --fill.
 * @param {HTMLInputElement} range
 */
function paintRange(range) {
    const min = Number(range.min);
    const span = Number(range.max) - min;
    const share = span > 0 ? (Number(range.value) - min) / span : 0;
    range.style.setProperty("--fill", `${share * 100}%`);
}

/**
 * @param {Track} track
 * @param {number} index номер в плейлисте, с нуля
 */
function trackRow(track, index) {
    const number = document.createElement("span");
    number.className = "track-n";
    number.textContent = String(index + 1);

    const star = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    star.setAttribute("class", "track-star");
    star.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#star");
    star.append(use);

    const title = document.createElement("span");
    title.className = "track-title";
    title.textContent = track.title;

    const artist = document.createElement("span");
    artist.className = "track-artist";
    artist.textContent = track.artist;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "track";
    button.dataset.index = String(index);
    // полное имя во всплывающей подсказке: длинное обрезается многоточием
    button.title = track.artist ? `${track.title} — ${track.artist}` : track.title;
    button.append(number, star, title, artist);

    const item = document.createElement("li");
    item.append(button);
    return item;
}

/**
 * Подключается к разметке экрана mp3 из index.html.
 * @param {Handlers} handlers
 * @param {{ volumeControl: boolean }} options volumeControl: false — громкость сайту не подвластна (iPhone)
 */
export function createPlayerView(handlers, { volumeControl }) {
    const screen = byId("mp3", HTMLElement);
    const listName = byId("playlist-name", HTMLElement);
    const listCount = byId("playlist-count", HTMLElement);
    const listNote = byId("playlist-note", HTMLElement);
    const list = byId("playlist-tracks", HTMLOListElement);
    const cover = byId("cover", HTMLImageElement);
    const coverEmpty = byId("cover-empty", SVGSVGElement);
    const glows = [byId("glow-a", HTMLImageElement), byId("glow-b", HTMLImageElement)];
    const title = byId("now-title", HTMLElement);
    const artist = byId("now-artist", HTMLElement);
    const where = byId("now-where", HTMLElement);
    const play = byId("btn-play", HTMLButtonElement);
    const shuffle = byId("btn-shuffle", HTMLButtonElement);
    const repeat = byId("btn-repeat", HTMLButtonElement);
    const mute = byId("btn-mute", HTMLButtonElement);
    const seek = byId("seek", HTMLInputElement);
    const volume = byId("volume", HTMLInputElement);
    const timeNow = byId("time-now", HTMLElement);
    const timeTotal = byId("time-total", HTMLElement);

    let duration = 0;
    // пока тянут ползунок, время показывает, куда перемотаем, а сам он не прыгает за музыкой
    let seeking = false;

    play.addEventListener("click", () => handlers.onPlayPause());
    byId("btn-prev", HTMLButtonElement).addEventListener("click", () => handlers.onPrevious());
    byId("btn-next", HTMLButtonElement).addEventListener("click", () => handlers.onNext());
    shuffle.addEventListener("click", () => handlers.onShuffle());
    repeat.addEventListener("click", () => handlers.onRepeat());
    mute.addEventListener("click", () => handlers.onMute());

    seek.addEventListener("input", () => {
        seeking = true;
        paintRange(seek);
        timeNow.textContent = formatTime((Number(seek.value) / SEEK_STEPS) * duration);
    });
    seek.addEventListener("change", () => {
        seeking = false;
        handlers.onSeek((Number(seek.value) / SEEK_STEPS) * duration);
    });

    volume.addEventListener("input", () => {
        paintRange(volume);
        handlers.onVolume(Number(volume.value) / 100, false);
    });
    volume.addEventListener("change", () => handlers.onVolume(Number(volume.value) / 100, true));
    // на iPhone громкость меняют только кнопками сбоку
    volume.hidden = !volumeControl;

    list.addEventListener("click", (event) => {
        const row = event.target instanceof Element ? event.target.closest(".track") : null;
        if (row instanceof HTMLElement && row.dataset.index !== undefined) {
            handlers.onSelect(Number(row.dataset.index));
        }
    });

    cover.addEventListener("error", () => {
        // обложка есть в списке GitHub, но не грузится — показываем пустую, как у трека без обложки
        showCover(null);
    });

    /** @param {string | null} url */
    function showCover(url) {
        cover.hidden = url === null;
        // у svg нет свойства hidden — только атрибут, его и прячет CSS
        coverEmpty.toggleAttribute("hidden", url !== null);
        for (const image of [cover, ...glows]) {
            if (url === null) {
                image.removeAttribute("src");
            } else if (image.getAttribute("src") !== url) {
                image.src = url;
            }
        }
    }

    /** @param {number} active номер играющего трека в показанном списке или -1 */
    function setActive(active) {
        for (const row of list.querySelectorAll(".track")) {
            if (row instanceof HTMLElement && Number(row.dataset.index) === active) {
                row.setAttribute("aria-current", "true");
            } else {
                row.removeAttribute("aria-current");
            }
        }
    }

    /**
     * @param {number} time
     * @param {number} newDuration NaN, пока длина неизвестна
     */
    function showTime(time, newDuration) {
        duration = Number.isFinite(newDuration) && newDuration > 0 ? newDuration : 0;
        seek.disabled = duration === 0;
        timeTotal.textContent = formatTime(duration);
        seek.setAttribute("aria-valuetext", `${formatTime(time)} из ${formatTime(duration)}`);
        if (!seeking) {
            seek.value = String(duration > 0 ? Math.round((time / duration) * SEEK_STEPS) : 0);
            paintRange(seek);
            timeNow.textContent = formatTime(time);
        }
    }

    return {
        setActive,
        showTime,

        /**
         * @param {string} name
         * @param {Track[]} tracks
         * @param {number} active какой трек играет; -1 — играет другой плейлист
         */
        showPlaylist(name, tracks, active) {
            listName.textContent = name;
            listCount.textContent = tracks.length > 0 ? tracksLabel(tracks.length) : "";
            listNote.hidden = tracks.length > 0;
            listNote.textContent = tracks.length > 0 ? "" : "пусто";
            list.replaceChildren(...tracks.map(trackRow));
            setActive(active);
        },

        /** Вместо списка — «Загрузка…», «Лимит API» и т. п. */
        showStatus(/** @type {string} */ headline, /** @type {string} */ detail) {
            listName.textContent = headline;
            listCount.textContent = "";
            listNote.hidden = detail === "";
            listNote.textContent = detail;
            list.replaceChildren();
        },

        /**
         * @param {Track | null} track null — играть нечего
         * @param {number} number номер в плейлисте, с единицы
         * @param {number} total сколько в нём треков
         */
        showTrack(track, number, total) {
            showCover(track?.cover ?? null);
            title.textContent = track?.title ?? "";
            title.title = track?.title ?? "";
            artist.textContent = track?.artist ?? "";
            where.textContent = track === null ? "" : `${number} из ${total}`;
            showTime(0, NaN);
        },

        /** Пометка вместо номера трека: «не загрузился». */
        showTrackNote(/** @type {string} */ text) {
            where.textContent = text;
        },

        /** Свечение переливается, только пока играет. */
        showPlaying(/** @type {boolean} */ playing) {
            screen.classList.toggle("playing", playing);
            play.setAttribute("aria-label", playing ? "Пауза" : "Играть");
        },

        /**
         * @param {number} level 0…1
         * @param {boolean} muted
         */
        showVolume(level, muted) {
            const audible = muted ? 0 : level;
            volume.value = String(Math.round(audible * 100));
            paintRange(volume);
            mute.dataset.level = audible === 0 ? "mute" : audible < 0.5 ? "low" : "high";
            mute.setAttribute("aria-label", audible === 0 ? "Включить звук" : "Выключить звук");
        },

        showShuffle(/** @type {boolean} */ on) {
            shuffle.setAttribute("aria-pressed", String(on));
        },

        showRepeat(/** @type {RepeatMode} */ mode) {
            repeat.dataset.mode = mode;
            repeat.setAttribute("aria-label", REPEAT_LABELS[mode]);
        },
    };
}
