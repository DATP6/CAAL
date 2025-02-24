//# sourceMappingURL=main.js.map
/// <reference path="../lib/jquery.d.ts" />
/// <reference path="../lib/bootstrap.d.ts" />
/// <reference path="../lib/ace.d.ts" />
/// <reference path="../lib/ccs.d.ts" />
/// <reference path="gui/project.ts" />
/// <reference path="gui/menu/new.ts" />
/// <reference path="gui/menu/save.ts" />
/// <reference path="gui/menu/load.ts" />
/// <reference path="gui/menu/delete.ts" />
/// <reference path="gui/menu/export.ts" />
/// <reference path="gui/hotkey.ts" />
/// <reference path="gui/autosave.ts" />
/// <reference path="gui/contact.ts" />
/// <reference path="activity/activityhandler.ts" />
/// <reference path="activity/activity.ts" />
/// <reference path="activity/editor.ts" />
/// <reference path="activity/explorer.ts" />
/// <reference path="activity/verifier.ts" />
/// <reference path="activity/game.ts" />
/// <reference path="activity/hmlgame.ts" />

declare var CCSParser;
declare var PCCSParser;
declare var TCCSParser;
declare var HMLParser;
declare var THMLParser;
import ccs = CCS;
import hml = HML;

module Main {
    declare var Version: string;
    export var activityHandler = new Activity.ActivityHandler();
    var timer;

    $(document).ready(function() {
        activityHandler.addActivity("editor", new Activity.Editor("#editor-container", "#edit-btn"));
        activityHandler.addActivity("explorer", new Activity.Explorer("#explorer-container", "#explore-btn"));
        activityHandler.addActivity("verifier", new Activity.Verifier("#verifier-container", "#verify-btn"));
        activityHandler.addActivity("game", new Activity.Game("#game-container", "#game-btn", "#select-game"));
        activityHandler.addActivity("hmlgame", new Activity.HmlGame("#hml-game-container", "#hml-game-btn", "#select-game"));
        activityHandler.selectActivity("editor");

        new New("#new-btn", activityHandler);
        var save = new Save(null, activityHandler);
        new Load(null, activityHandler);
        new Delete("#delete-btn", activityHandler);
        new Export("#export-pdf-btn", activityHandler, {});
        new Export("#export-pdf-with-props", activityHandler, { properties: true });

        new HotkeyHandler().setGlobalHotkeys(activityHandler, save);

        $('[data-toggle="tooltip"]').tooltip();
        Activity.addTooltips();
    });

    $("#aboutModal").load("about.html", () => $("#version").append(getVersion()));
    $("#helpModal").load("help.html");
    $("#contactModal").load("contact.html", () => ContactForm.init());

    export function showNotification(text: string, time: number): void {
        window.clearTimeout(timer);

        var $box = $("#notification-box");
        $box.html(text);
        $box.fadeIn(500);

        timer = setTimeout(() => {
            $box.fadeOut(500);
            window.clearTimeout(timer);
        }, time);
    }

    export function getVersion(): string {
        return Version;
    }
}
