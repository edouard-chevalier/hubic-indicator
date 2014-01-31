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

const Gio = imports.gi.Gio;
/**
 * Comment obtenir les interfaces ?
 * facile: 
 *  dbus-send --session --print-reply --dest=com.hubiC /com/hubic/General org.freedesktop.DBus.Introspectable.Introspect
 *  
 *  and some more info on how to use gjs DBus bindings : https://mail.gnome.org/archives/gnome-shell-list/2013-February/msg00059.html 
 */
const AccountIface = <interface name="com.hubic.account">
<method name="Logout" />
<method name="SynchronizeNow" />
<method name="SetPauseState">
  <arg name="paused" direction="in" type="b" />
</method>
<method name="Publish">
  <arg name="absolutePath" direction="in" type="s" />
</method>
<method name="Unpublish">
  <arg name="absolutePath" direction="in" type="s" />
</method>
<method name="GetPublishUrl">
  <arg name="absolutePath" direction="in" type="s" />
  <arg name="publicUrl" direction="out" type="s" />
</method>
<method name="GetItemStatus">
  <arg name="absolutePath" direction="in" type="s" />
  <arg name="status" direction="out" type="(sbb)" />
</method>
<signal name="ItemChanged">
  <arg name="absolutePath" direction="out" type="s" />
</signal>
<property name="QueueStatus" type="(iiixx)" access="read" />
<property name="RunningOperations" type="a(xsssxx)" access="read" />
<property name="PublishedFiles" type="a(ssx)" access="read" />
<property name="Account" type="s" access="read" />
<property name="SynchronizedDir" type="s" access="readwrite" />
<property name="ExcludedFolders" type="as" access="readwrite" />
<property name="TotalBytes" type="x" access="read" />
<property name="UsedBytes" type="x" access="read" />
</interface>;
const AccountProxy = Gio.DBusProxy.makeProxyWrapper(AccountIface);

const GeneralIface = <interface name="com.hubic.general">
<method name="Login">
<arg name="email" direction="in" type="s" />
<arg name="password" direction="in" type="s" />
<arg name="synchronizedDir" direction="in" type="s" />
</method>
<method name="Reconnect" />
<method name="Stop" />
<signal name="Messages">
<arg name="level" direction="out" type="i" />
<arg name="message" direction="out" type="s" />
<arg name="targetPath" direction="out" type="s" />
</signal>
<signal name="StateChanged">
<arg name="oldState" direction="out" type="s" />
<arg name="newState" direction="out" type="s" />
</signal>
<property name="CurrentState" type="s" access="read" />
<property name="CurrentUploadSpeed" type="x" access="read" />
<property name="CurrentDownloadSpeed" type="x" access="read" />
<property name="LastMessages" type="a(xiss)" access="read" />
</interface>;
const GeneralProxy = Gio.DBusProxy.makeProxyWrapper(GeneralIface);

let hubicindicator, text, button, account, general;

//function _hideHello() {
//    Main.uiGroup.remove_actor(text);
//    text = null;
//}
//Init Weather class //
const HubicBoard = new Lang.Class(
{
Name : "HubicBoard",

Extends: PanelMenu.SystemStatusButton,

	_init : function(){
		this.parent();
		this._initUI();
        this._general = null;
        this._account = null;
        this.itemStatus = [];
        this.refresh();
//        this._onChangedId = this._proxy.connectSignal('Changed',
//            Lang.bind(this, this._updateBrightness));

//        let level = settings.get_string("level");
//        persist = settings.get_boolean("persist");
//        if (persist) {
//            this._proxy.SetPercentageRemote(parseInt(level));
//        }
//
//        this._updateBrightness();

       
       
//        this.newMenuItem = new PopupMenu.PopupMenuItem(_("Extension Settings"));
//        this.menu.addMenuItem(this.newMenuItem);
//        this.newMenuItem.connect("activate", Lang.bind(this, this._launchPrefs));
//
//        this.actor.connect('button-press-event',
//            Lang.bind(this, this._updateBrightness));
//        this.actor.connect('scroll-event',
//            Lang.bind(this, this._onScrollEvent));
        //register timer
        this.timer = Mainloop.timeout_add_seconds(60, Lang.bind(this, function() {
			this.refresh();
			return true;
			}));
    }
	, _initUI: function(){
		this.UI ={};
		log("initialiazing UI hubic board...");

		// Panel icon
//		this.UI.menuIcon = new St.Icon({ icon_name: 'network-transmit-receive',style_class: 'system-status-icon'});

//		this.setIcon('hubic.png');
                this.UI.statusicons= {};
		let icon_stop = Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-stop.svg");
		this.UI.statusicons['Unknown'] = icon_stop;
		this.UI.statusicons['NotConnected'] = icon_stop;
		this.UI.statusicons['Idle'] = Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-idle.svg");
		let icon_updating = Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-updating.svg");
		this.UI.statusicons['Connecting'] = icon_updating;
		this.UI.statusicons['Busy'] = icon_updating;
		this.UI.statusicons['Paused'] = Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-paused.svg");
		



 		
                //this.addIcon(Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-updating.svg"));
 		//this.addIcon();
		//this.addIcon(Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-paused.svg"));
                //this.addIcon(Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-stop.svg"));
		//this.setGIcon(Gio.icon_new_for_string(Me.path + "/icons/scalable/sync-client-idle.svg"));
                //this.setGIcon(Gio.icon_new_for_string(Me.path + "/icons/scalable/cab_extract.png"));
		//this.setIcon('network-transmit-receive');
		// Putting the panel item together
//		let topBox = new St.BoxLayout();
//		topBox.add_actor(this.UI.menuIcon);
//		this.actor.add_actor(topBox);

//		let dummyBox = new St.BoxLayout();
//		this.actor.reparent(dummyBox);
//		dummyBox.remove_actor(this.actor);
//		dummyBox.destroy();
		
//		Main.panel._rightBox.insert_child_at_index(this.actor, 0);		//this.status("Panel icon inserted in left box");
//      this._slider = new PopupMenu.PopupSliderMenuItem(0);
//      this._slider.connect('value-changed', Lang.bind(this, function(item) {
//          this._setBrightness(item._value * 100, 0);
//      }));
//
//      this.menu.addMenuItem(this._slider);
//        let label = new PopupMenu.PopupMenuItem("Hubic Board", {
//            reactive: false
//        });
//
//        this.menu.addMenuItem(label);
//
//        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
//        
        
		this.UI.general= {};
		this.UI.general.statebin = new St.Bin();
		this.UI.general.statebin.add_actor(this.buildStateUIItem());
		this.menu.box.add(this.UI.general.statebin);
		
//		let essai = new PopupMenu.PopupMenuSection("test");
//		essai.addMenuItem(new PopupMenu.PopupMenuItem("ouch 1"));
//		essai.addMenuItem(new PopupMenu.PopupMenuItem("ouch 2"));
//		menuItem.setSensitive(false);
//		this.menu.addMenuItem(essai);
		
		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		
		this.UI.account= {};
		this.UI.account.menu = new PopupMenu.PopupMenuSection("accountmenu");
		this.menu.addMenuItem(this.UI.account.menu);
//		this.UI.account.bin = new St.Bin();
//		this.menu.box.add(this.UI.account.bin);
		
		
		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		this.UI.lastMessages = new PopupMenu.PopupSubMenuMenuItem("Last Messages");
		this.menu.addMenuItem(this.UI.lastMessages);
		
	}
	,
	//returns a box with 
	buildStateUIItem: function(){
		let res = new St.BoxLayout();
		res.add_actor(new St.Label({text: 'Hubic state: '}));
		this.UI.general.state = new St.Label({text: 'Unknown'});
		res.add_actor(this.UI.general.state);
		
//		this.UI.general.downspeed = new St.Label({text: '0'});
//		res.add_actor(this.UI.general.downspeed);
//		
//		this.UI.general.upspeed = new St.Label({text: '0'});
//		res.add_actor(this.UI.general.upspeed);
		
		
		return res;
	}
	,
	refreshAccountUI: function(){
		//bytesToGiga(account.UsedBytes,2) + "/"+ bytesToGiga(account.TotalBytes,0)+" GB";
//		if (this.UI.account.bin.get_child() != null)
//			this.UI.account.bin.get_child().destroy();
		this.UI.account.menu.removeAll();
		let state = this.currentState;

		this.setGIcon(this.UI.statusicons[state]);
		if((state == "NotConnected") || (state == "Connecting") || (state == "Unknown")){
			log("Not showing account stuffs");
			let menuItem = new PopupMenu.PopupMenuItem("No account info available.");
			menuItem.setSensitive(false);
			this.UI.account.menu.addMenuItem(menuItem);
			
			if((state == "NotConnected") || (state == "Unknown")){
			    let item = new PopupMenu.PopupMenuItem("Reconnect...");
			    item.connect('activate', Lang.bind(this, this.reconnect));
			    this.UI.account.menu.addMenuItem(item);
			}
			return;
		}
//		this.UI.account.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		
		let text = bytesToSize(this.account.UsedBytes,2) + " used over "+ bytesToSize(this.account.TotalBytes,0)+".";
		let menuItem = new PopupMenu.PopupMenuItem(text);
		menuItem.setSensitive(false);
		this.UI.account.menu.addMenuItem(menuItem);
		
		
		if(state == "Paused"){
			let item = new PopupMenu.PopupMenuItem("Resume syncing...");
			item.connect('activate', Lang.bind(this, this.resume));
			this.UI.account.menu.addMenuItem(item);
		}
		if((state == "Idle") || (state == "Busy")){
			let item = new PopupMenu.PopupMenuItem("Pause syncing...");
			item.connect('activate', Lang.bind(this, this.pause));
			this.UI.account.menu.addMenuItem(item);
		}
		
//		let res = new St.BoxLayout();
//		res.add_actor(new St.Label({text: text}));
//		this.UI.account.bin.add_actor(res);
	}
	,
	refresh: function(){
		log("Refreshing hubic board data ...");
		log("Refreshing general");
//		this.refreshGeneral(false);
		this.UI.general.state.text = this.currentState;
//		this.UI.general.downspeed.text = this.general.CurrentDownloadSpeed.toString();
//		this.UI.general.upspeed.text =  this.general.CurrentUploadSpeed.toString();
		log("Refreshing account");
		this.refreshAccountUI();
		log("Refreshing last Messages ...");
		this.rebuildLastMessages();
	}
	,
	rebuildLastMessages: function(){
		this.UI.lastMessages.menu.removeAll();

//TODO: trim longmessages ?
		
		for(let messIndex in this.general.LastMessages){
			let aMess = this.general.LastMessages[messIndex];
			let someTime = (new Date(aMess[0] * 1000).toLocaleTimeString());//hubic provides timestamp in seconds and not milliseconds
			let realMess = aMess[2];
			let menuItem = new PopupMenu.PopupMenuItem(someTime + " " + realMess);
			menuItem.setSensitive(false);
			this.UI.lastMessages.menu.addMenuItem(menuItem);
		}
	}
	,
	
	get currentState(){
		if(!this._currentState){
			this._currentState = this.general.CurrentState ? this.general.CurrentState : "Unknown";
		}
		return this._currentState;
		
	}
	,
	set currentState(v){
		//TODO: check param
		this._currentState = v;
	}
	,
	get general(){
		this.refreshGeneral(false);
		return this._general;
	}
	,
	refreshGeneral: function(force){
		//log("General state " + this.general);
		if(!force && (this._general !== null) /*&& (this._general.CurrentState !== null)*/){
//			log("Refreshing general data is useless.");
			return;
		}
		log("Refreshing general data...");
		this._destroyGeneral();
		this._general = new GeneralProxy(Gio.DBus.session, 'com.hubiC','/com/hubic/General');
		this.stateChangedSignalId = this._general.connectSignal('StateChanged',Lang.bind(this,function(proxy,sender,res){
			log("Signal state changed by " + sender + " with state old "+ res[0] + " new state " + res[1]);
			log("original connection :" + this.stateChangedSignalId);
			//disconnect from signal 'StateChanged' no, but should be in _destroyGeneral().
			//this.sender = sender;
			//this._general.disconnectSignal(this.stateChangedSignalId);
			if(this.currentState !== res[0]){
				log("Warning : expected previous state was " + this.currentState);
			}
			this.currentState = res[1];
//			this.refreshGeneral(true);
			this.refresh();
			}));
		
	}
	,
	_destroyGeneral: function(){
		if(this._general !== null){
			if(this.stateChangedSignalId) this._general.disconnectSignal(this.stateChangedSignalId);
			this._general.run_dispose();
		}
		this._general = null;
	}
	,
	get account(){
		this.refreshAccount(false);
		return this._account;
	}
	,
	refreshAccount: function(force){
		if(!force && (this._account !== null) /*&& how to detect need of refresh ?*/){
//			log("Refreshing general data is useless.");
			return;
		} 
		log("Refreshing account data...");
		this._destroyAccount();
		this._account = new AccountProxy(Gio.DBus.session, 'com.hubiC','/com/hubic/Account');
		this.itemChangedSignalId = this._account.connectSignal('ItemChanged',Lang.bind(this,function(proxy,sender,res){
			log("Item state changed by " + sender + " with path "+ res[0] );
			log("original connection :" + this.itemChangedSignalId);
			
			//this.currentState = res[1];
//			this.refreshGeneral(true);
			let status = this._account.GetItemStatusSync(res[0]);
			if(status){
				log("status" + status);
			}
			this.refresh();
			}));
	}
	,
	_destroyAccount: function(){
		if(this._account !== null){
			if(this.itemChangedSignalId) this._account.disconnectSignal(this.itemChangedSignalId);
			this._account.run_dispose();
		}
		this._account = null;
	}
	,
	pause: function(){
		let acc = this.account;
		if(acc){//TODO: do it asynchronous do handle errors.
			acc.SetPauseStateSync(true);
		}
	}
	,
	resume: function(){
		let acc = this.account;
		if(acc){
			acc.SetPauseStateSync(false);
		}
	}
	,
	reconnect: function(){
		let gen = this.general;
		if(gen){
			gen.ReconnectRemote(Lang.bind(this,
			        function (result, error) {
                        if (error) {
                            log("Error reconnecting : " + error.toString());
                        }
                    }));
		}
	}
	,
	stop: function(){
		log("Stopping hubic board ...");
		//remove timers
		if(this.timer) {
			Mainloop.source_remove(this.timer);	
		}
		this._destroyAccount();
		this._destroyGeneral();

	}
	
//,
//    
//    resetProxies: function(){
//    	log("Resetting proxies");
//    	account = new AccountProxy(Gio.DBus.session, 'com.hubiC','/com/hubic/Account');
//    	general = new GeneralProxy(Gio.DBus.session, 'com.hubiC','/com/hubic/General');
//    }
});
//
//
//function resetProxies(){
//	log("Resetting proxies");
//	account = new AccountProxy(Gio.DBus.session, 'com.hubiC','/com/hubic/Account');
//	general = new GeneralProxy(Gio.DBus.session, 'com.hubiC','/com/hubic/General');
//}
/**
 * Convert number of bytes into human readable format
 *
 * @param integer bytes     Number of bytes to convert
 * @param integer precision Number of digits after the decimal separator
 * @return string
 */
function bytesToSize(bytes, precision)
{  
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
}
/**
 * Convert number of bytes into human readable format in gigabytes
 *
 * @param integer bytes     Number of bytes to convert
 * @param integer precision Number of digits after the decimal separator
 * @return string
 */
//function bytesToGiga(bytes, precision)
//{  
//    var gigabyte = 1073741824;
//    return (bytes / gigabyte).toFixed(precision);
//}
//
//
//function _showHello() {
//    if (!text) {
//    	log("computing text...");
//    	if(!general.CurrentState){
//    		log("Proxies seems unstable, recovering...");
//    		resetProxies();
//    	}
//    	let str = account.SynchronizedDir;
//    	str = str + '\n';
//    	str = str + bytesToGiga(account.UsedBytes,2) + "/"+ bytesToGiga(account.TotalBytes,0)+" GB";
//    	str = str + '\n';
//    	str = str + general.CurrentState;
//        text = new St.Label({ style_class: 'helloworld-label', text: str });
//        Main.uiGroup.add_actor(text);
//    }
//
//    text.opacity = 255;
//
//    let monitor = Main.layoutManager.primaryMonitor;
//
//    text.set_position(Math.floor(monitor.width / 2 - text.width / 2),
//                      Math.floor(monitor.height / 2 - text.height / 2));
//
//    Tweener.addTween(text,
//                     { opacity: 0,
//                       time: 5,
//                       transition: 'easeOutQuad',
//                       onComplete: _hideHello });
//}

function init() {
//    button = new St.Bin({ style_class: 'panel-button',
//                          reactive: true,
//                          can_focus: true,
//                          x_fill: true,
//                          y_fill: false,
//                          track_hover: true });
//    let icon = new St.Icon({ icon_name: 'network-transmit-receive',style_class: 'system-status-icon'});
//
//    button.set_child(icon);
//    button.connect('button-press-event', _showHello);
}

function enable() {
//    Main.panel._rightBox.insert_child_at_index(button, 0);
//    resetProxies();
	log("Enabling hubic board...");
	hubicindicator = new HubicBoard();
	Main.panel.addToStatusArea('hubicboard', hubicindicator);
}

function disable() {
//    Main.panel._rightBox.remove_child(button);
    
    if (hubicindicator !== null){
    	hubicindicator.stop();
    	hubicindicator.destroy();
    }
    hubicindicator = null;
}