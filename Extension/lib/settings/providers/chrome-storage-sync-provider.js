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

/**
 * Sync settings provider
 *
 * @type {{load, save}}
 */
adguard.sync.storageSyncProvider = (function () { // jshint ignore:line

    // API
    /**
     * Loads file from chrome syncable storage.
     *
     * @param filePath
     * @param callback
     */
    var load = function (filePath, callback) {
        chrome.storage.sync.get(filePath, function(items) {
            var e = chrome.runtime.lastError;
            if (e) {
                adguard.console.error(e);
                callback(false);
                return;
            }

            if (items) {
                var r = items[filePath];
                if (r) {
                    callback(r);
                    return;
                }
            }

            callback(false);
        });
    };

    /**
     * Saves file to to chrome syncable storage.
     * TODO: The storage has a quota, so we need to split long files.
     *
     * @param filePath
     * @param data
     * @param callback
     */
    var save = function (filePath, data, callback) {
        var save = {};
        save[filePath] = data;

        chrome.storage.sync.set(save, function() {
            var e = chrome.runtime.lastError;
            if (e) {
                adguard.console.error(e);
                callback(false);
                return;
            }

            callback(true);
        });
    };

    // EXPOSE
    return {
        /**
         * Loads data from provider
         */
        load: load,
        /**
         * Saves data to provider
         */
        save: save
    };
})();