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
/// <reference path="activity/activityhandler.ts" />
/// <reference path="activity/activity.ts" />
/// <reference path="activity/editor.ts" />
/// <reference path="activity/explorer.ts" />
/// <reference path="activity/verifier.ts" />
/// <reference path="activity/game.ts" />

declare var CCSParser;
declare var TCCSParser;
declare var HMLParser;
import ccs = CCS;
import hml = HML;

module Main {
    declare var Version : string;
    export var activityHandler = new Activity.ActivityHandler();

    $(document).ready(function() {
        activityHandler.addActivity("editor", new Activity.Editor("#editor-container", "#edit-btn"));
        activityHandler.addActivity("explorer", new Activity.Explorer("#explorer-container", "#explore-btn"));
        activityHandler.addActivity("verifier" , new Activity.Verifier("#verifier-container", "#verify-btn"));
        activityHandler.addActivity("game" , new Activity.Game("#game-container", "#game-btn"));
        activityHandler.selectActivity("editor");

        $("#version").append(Version);
        // danger of spam mail; des10Xf15 mails are only temporary mails though.
        $("#bug-report").attr("href", "mailto:caal@cs.aau.dk?Subject=CAAL%20Bug%20(" + Version + ")");

        new New("#new-btn", activityHandler);
        var save = new Save(null, activityHandler);
        new Load(null, activityHandler);
        new Delete(null, activityHandler);
        new Export("#export-pdf-btn", activityHandler);

        new HotkeyHandler().setGlobalHotkeys(activityHandler, save);

        Activity.addTooltips();
    });

    export function showInfoBox(text : string, time : number) : void {
        $('#info-box').html(text);
        $('#info-box').stop().animate({ top: '10%' }, 400);
        
        var timer = setTimeout(() => {
            $('#info-box').stop().animate({ top: -100 }, 400);
            window.clearTimeout(timer);
        }, time);
    }
}
