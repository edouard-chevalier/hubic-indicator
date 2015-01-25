/*        Copyright 2014 Edouard Chevalier 
        This program is free software: you can redistribute it and/or modify
        it under the terms of the GNU General Public License as published by
        the Free Software Foundation, either version 3 of the License, or
        (at your option) any later version.

        This program is distributed in the hope that it will be useful,
        but WITHOUT ANY WARRANTY; without even the implied warranty of
        MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
        GNU General Public License for more details.

        You should have received a copy of the GNU General Public License
        along with this program. If not, see <http://www.gnu.org/licenses/>.
*/

const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Mainloop = imports.mainloop;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const HubicIndicator = Me.imports.hubicindicator.HubicIndicator;
const Gio = imports.gi.Gio;

//util
function _log(message){
    //TODO: activate log with a debug flag.
    log(message);
}

let hubicindicator = null;
let hubicBoard = null;


// Hubic Board class //
const HubicBoard = new Lang.Class({
    Name : "HubicBoard",

    Extends: PanelMenu.Button,

    _init : function(hubicindicator){
        this.parent(0.0, "hubicindicator");
        this.hubicindicator = hubicindicator;
        this._initUI();
        this.refresh();
        
        this.hubicindicator.registerListener(Lang.bind(this,function(){
            this.refresh();
        }));

    },
 
    setGIcon: function(gicon) {
        if (this.mainIcon)
            this.mainIcon.gicon = gicon;
        else{
            this.mainIcon = new St.Icon({ gicon: gicon, style_class: 'system-status-icon' });
            this._box.add_actor(this.mainIcon);

            this.emit('icons-changed');//usefull ?
        }
    },
    
    _initUI: function(){
        this._box = new St.BoxLayout({ style_class: 'panel-status-button' });
        this.actor.add_actor(this._box);
        

        _log("initialiazing UI hubic board...");

        // we init & load the different status icons.
        this.statusicons= {};
        let icon_stop = Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-stop.svg");
        this.statusicons['Unknown'] = icon_stop;
        this.statusicons['NotConnected'] = icon_stop;
        this.statusicons['Idle'] = Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-idle.svg");
        let icon_updating = Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-updating.svg");
        this.statusicons['Connecting'] = icon_updating;
        this.statusicons['Busy'] = icon_updating;
        this.statusicons['Paused'] = Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-paused.svg");
		
        // first item in menu display status.
        this.general= {};
        this.general.statebin = new St.Bin();
        let stateUIitem = new St.BoxLayout();
        stateUIitem.add_actor(new St.Label({text: 'Hubic state: '}));
        this.general.state = new St.Label({text: 'Unknown'});//building direct access to state
        stateUIitem.add_actor(this.general.state);
        this.general.statebin.add_actor(stateUIitem);
        
        this.menu.box.add(this.general.statebin);

        // next is a separator.
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Account menu
        this.account= {};
        this.account.menu = new PopupMenu.PopupMenuSection("accountmenu");
        this.menu.addMenuItem(this.account.menu);

        // general messages.
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.lastMessages = new PopupMenu.PopupSubMenuMenuItem("Last Messages");
        this.menu.addMenuItem(this.lastMessages);
        _log("initialiazing UI hubic board done.");
    },

    refreshAccountUI: function(){
        this.account.menu.removeAll();
        let state = this.hubicindicator.currentState;
        this.setGIcon(this.statusicons[state]);
        
        // case not connected, nothing to display but propose to reconnect.
        if((state == 'NotConnected') || (state == 'Connecting') || (state == 'Unknown')){
            _log("Not showing account stuffs");
            let menuItem = new PopupMenu.PopupMenuItem("No account info available.");
            menuItem.setSensitive(false);
            this.account.menu.addMenuItem(menuItem);
            if((state == "NotConnected") || (state == "Unknown")){
                let item = new PopupMenu.PopupMenuItem("Reconnect...");
                item.connect('activate', Lang.bind(this, this.hubicindicator.reconnect));
                this.account.menu.addMenuItem(item);
            }
            return;
        }
        let text = bytesToSize(this.hubicindicator.account.UsedBytes,2) + " used over "+ bytesToSize(this.hubicindicator.account.TotalBytes,0)+".";
        let menuItem = new PopupMenu.PopupMenuItem(text);
        menuItem.setSensitive(false);
        this.account.menu.addMenuItem(menuItem);
        if(state == "Paused"){
            let item = new PopupMenu.PopupMenuItem("Resume syncing...");
            item.connect('activate', Lang.bind(this, this.hubicindicator.resume));
            this.account.menu.addMenuItem(item);
        }
        if((state == "Idle") || (state == "Busy")){
            let item = new PopupMenu.PopupMenuItem("Pause syncing...");
            item.connect('activate', Lang.bind(this, this.hubicindicator.pause));
            this.account.menu.addMenuItem(item);
        }
    },
    refresh: function(){
        _log("Refreshing hubic board ...");
        this.general.state.text = this.currentState;

        this.refreshAccountUI();
        this.rebuildLastMessages();
        _log("Refreshing hubic board done.");
    },
    rebuildLastMessages: function(){
        this.lastMessages.menu.removeAll();
        // TODO: trim longmessages ?
        let messIndex;
        for(messIndex in this.hubicindicator.general.LastMessages){
            let aMess = this.hubicindicator.general.LastMessages[messIndex];
            // hubic provides timestamp in seconds and not milliseconds
            let someTime = (new Date(aMess[0] * 1000).toLocaleTimeString());
            let realMess = aMess[2];
            let menuItem = new PopupMenu.PopupMenuItem(someTime + " " + realMess);
            menuItem.setSensitive(false);
            this.lastMessages.menu.addMenuItem(menuItem);
        }
    }
});

/**
 * Convert number of bytes into human readable format
 * 
 * @param integer
 *                bytes Number of bytes to convert
 * @param integer
 *                precision Number of digits after the decimal separator
 * @return string
 */
function bytesToSize(bytes, precision){  
    var kilobyte = 1024;
    var megabyte = kilobyte * 1024;
    var gigabyte = megabyte * 1024;
    var terabyte = gigabyte * 1024;
   
    if ((bytes >= 0) && (bytes < kilobyte)) {
        return bytes + ' B';
 
    } else if ((bytes >= kilobyte) && (bytes < megabyte)) {
        return (bytes / kilobyte).toFixed(precision) + ' KB';
 
    } else if ((bytes >= megabyte) && (bytes < gigabyte)) {
        return (bytes / megabyte).toFixed(precision) + ' MB';
 
    } else if ((bytes >= gigabyte) && (bytes < terabyte)) {
        return (bytes / gigabyte).toFixed(precision) + ' GB';
 
    } else if (bytes >= terabyte) {
        return (bytes / terabyte).toFixed(precision) + ' TB';
 
    } else {
        return bytes + ' B';
    }
};


function init() {
    hubicindicator = new HubicIndicator();
};

function enable() {
    _log("Enabling hubic board...");
    
    hubicBoard = new HubicBoard(hubicindicator);
    Main.panel.addToStatusArea('hubicboard', hubicBoard);
};

function disable() {   
    if (hubicBoard !== null){
    	hubicBoard.destroy();
    }  
    hubicBoard = null;
};