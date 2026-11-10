// Сайт: рабочий стол с папками, каждая папка — своё окно.

import { createDesktop } from "./desktop.js";
import { mountPlayer } from "./player.js";

const desktop = createDesktop(document.body);

desktop.addFolder({ label: "mp3", title: "Плеер", window: mountPlayer(document.body) });
// работа ещё не готова — папка стоит на месте, окна у неё пока нет
desktop.addFolder({ label: "work", title: "Работа" });
