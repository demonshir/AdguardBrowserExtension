/**
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Adguard Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global Components, ADDON_INSTALL, APP_SHUTDOWN, ADDON_UNINSTALL, ADDON_DOWNGRADE */
/* exported startup, install, uninstall, shutdown */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

var console = null;
// PaleMoon doesn't support new devtools path
try {
    console = Cu.import('resource://gre/modules/Console.jsm', {}).console;
} catch (ex) {
    console = Cu.import('resource://gre/modules/devtools/Console.jsm', {}).console;
}

var extData;

var windowlessBrowser = null;
var windowlessBrowserPL = null;
var bgProcess = null;

// https://developer.mozilla.org/en-US/Add-ons/Bootstrapped_extensions#startup
function startup(data, reason) {

    console.log('Adguard addon: startup is fired with reason ' + reason);

    if (!data) {
        console.error('Adguard addon: Could not retrieve startup data');
        return;
    }

    if (bgProcess !== null) {
        return;
    }

    extData = data;

    waitForHiddenWindow();
}

// https://developer.mozilla.org/en-US/Add-ons/Bootstrapped_extensions#shutdown
function shutdown(data, reason) {

    console.log('Adguard addon: shutdown is fired with reason ' + reason);

    if (reason === APP_SHUTDOWN) {
        return;
    }

    if (bgProcess !== null) {
        bgProcess.parentNode.removeChild(bgProcess);
        bgProcess = null;
    }

    if (windowlessBrowser !== null) {
        if (typeof windowlessBrowser.close === 'function') {
            windowlessBrowser.close();
        }
        windowlessBrowser = null;
        windowlessBrowserPL = null;
    }

    Cu.unload('chrome://adguard/content/lib/utilsModule.js');
}

// https://developer.mozilla.org/en-US/Add-ons/Bootstrapped_extensions#install
function install(data, reason) {

    console.log('Adguard addon: install is fired with reason ' + reason);

    // https://bugzil.la/719376
    var stringBundleService = Cc['@mozilla.org/intl/stringbundle;1'].getService(Ci.nsIStringBundleService);
    stringBundleService.flushBundles();

    if (reason === ADDON_INSTALL || reason === ADDON_DOWNGRADE) {
        cleanPrefs(data.id);
        cleanAdguardDir();
    }
}

// https://developer.mozilla.org/en-US/Add-ons/Bootstrapped_extensions#uninstall
/* Note: Simply having function install() {} IS NOT ENOUGH because if you have code in uninstall it will not run.
 * You MUST run some code in the install function; at the least you must set parameters for
 * the install function, such as: function install(aData, aReason) {}; then uninstall WILL WORK.
 */
function uninstall(data, reason) {

    console.log('Adguard addon: uninstall is fired with reason ' + reason);

    if (reason !== ADDON_UNINSTALL) {
        return;
    }

    cleanPrefs(data.id);
    cleanAdguardDir();
}

/**
 * Remove adguard preferences on extension uninstall
 */
function cleanPrefs(id) {
    var branch = 'extensions.' + id + '.';
    var Services = Components.utils.import('resource://gre/modules/Services.jsm').Services;
    Services.prefs.getBranch(branch).deleteBranch('');
    console.log('Adguard addon preferences in branch ' + branch + ' were removed.');
}

/**
 * Remove adguard directory on extension uninstall
 */
function cleanAdguardDir() {
    var FileUtils = Cu.import("resource://gre/modules/FileUtils.jsm").FileUtils;
    var adguardDir = FileUtils.getDir('ProfD', ['Adguard']);
    if (adguardDir.exists()) {
        adguardDir.remove(true);
        console.log('Adguard addon directory was removed.');
    }
}

function createBgProcess(parentDocument) {
    bgProcess = parentDocument.documentElement.appendChild(
        parentDocument.createElementNS('http://www.w3.org/1999/xhtml', 'iframe')
    );
    bgProcess.setAttribute(
        'src',
        'chrome://adguard/content/background.html?id=' + encodeURIComponent(extData.id) + '&version=' + encodeURIComponent(extData.version)
    );
}

function waitForHiddenWindow() {

    var appShell = Cc['@mozilla.org/appshell/appShellService;1'].getService(Ci.nsIAppShellService);

    var checkDocumentReady = function () {

        var hiddenDoc;
        try {
            hiddenDoc = appShell.hiddenDOMWindow && appShell.hiddenDOMWindow.document;
        } catch (ex) {
        }

        // Do not test against `loading`: it does appear `readyState` could be
        // undefined if looked up too early.
        if (!hiddenDoc || hiddenDoc.readyState !== 'complete') {
            return false;
        }

        var {Services} = Cu.import('resource://gre/modules/Services.jsm', null);
        if (Services.vc.compare(Services.appinfo.platformVersion, '27') >= 0) {
            getWindowlessBrowserFrame(appShell);
        } else {
            createBgProcess(hiddenDoc);
        }
        return true;
    };

    if (checkDocumentReady()) {
        return;
    }

    var Timers = Cu.import('chrome://adguard/content/lib/utilsModule.js', {}).Timers;

    var timeout = 5;
    var triesCount = 0;
    var triesMax = 600011;

    var setTimeoutCheckDocumentReady = function () {

        if (checkDocumentReady()) {
            Timers.clearTimeout(timerId);
            return;
        }

        triesCount++;
        if (triesCount >= triesMax) {
            Timers.clearTimeout(timerId);
            console.error('Adguard addon: Could not initialize document');
            return;
        }

        timeout *= 2;
        if (timeout > 500) {
            timeout = 500;
        }
        timerId = Timers.setTimeout(setTimeoutCheckDocumentReady, timeout);
    };

    var timerId = Timers.setTimeout(setTimeoutCheckDocumentReady, timeout);
}

function getWindowlessBrowserFrame(appShell) {
    windowlessBrowser = appShell.createWindowlessBrowser(true);
    windowlessBrowser.QueryInterface(Ci.nsIInterfaceRequestor);
    var webProgress = windowlessBrowser.getInterface(Ci.nsIWebProgress);
    var XPCOMUtils = Cu.import('resource://gre/modules/XPCOMUtils.jsm', null).XPCOMUtils;
    windowlessBrowserPL = {
        QueryInterface: XPCOMUtils.generateQI([
            Ci.nsIWebProgressListener,
            Ci.nsIWebProgressListener2,
            Ci.nsISupportsWeakReference
        ]),
        onStateChange: function (wbp, request, stateFlags) {
            if (!request) {
                return;
            }
            if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
                webProgress.removeProgressListener(windowlessBrowserPL);
                windowlessBrowserPL = null;
                createBgProcess(windowlessBrowser.document);
            }
        }
    };
    webProgress.addProgressListener(windowlessBrowserPL, Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
    windowlessBrowser.document.location = "data:application/vnd.mozilla.xul+xml;charset=utf-8,<window%20id='adguard-win'/>";
}