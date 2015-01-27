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
const Mainloop = imports.mainloop;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const Gio = imports.gi.Gio;

/**
 * Hubic uses DBus for communication.
 * Dbus publishes its interface. How to describe it ? with XML.
 * And one can have it with a dbus command:
 * dbus-send --session --print-reply --dest=com.hubiC /com/hubic/General org.freedesktop.DBus.Introspectable.Introspect
 * 
 * and some more info on how to use gjs DBus bindings :
 * https://mail.gnome.org/archives/gnome-shell-list/2013-February/msg00059.html
 */
const AccountIface = '<node>\
    <interface name="com.hubic.account">\
<method name="Logout" />\
<method name="SynchronizeNow" /><method name="SetPauseState">\
  <arg name="paused" direction="in" type="b" />\
</method>\
<method name="Publish">\
  <arg name="absolutePath" direction="in" type="s" />\
</method>\
<method name="Unpublish">\
  <arg name="absolutePath" direction="in" type="s" />\
</method>\
<method name="GetPublishUrl">\
  <arg name="absolutePath" direction="in" type="s" />\
  <arg name="publicUrl" direction="out" type="s" />\
</method>\
<method name="GetItemStatus">\
  <arg name="absolutePath" direction="in" type="s" />\
  <arg name="status" direction="out" type="(sbb)" />\
</method>\
<signal name="ItemChanged">\
  <arg name="absolutePath" direction="out" type="s" />\
</signal>\
<property name="QueueStatus" type="(iiixx)" access="read" />\
<property name="RunningOperations" type="a(xsssxx)" access="read" />\
<property name="PublishedFiles" type="a(ssx)" access="read" />\
<property name="Account" type="s" access="read" />\
<property name="SynchronizedDir" type="s" access="readwrite" />\
<property name="ExcludedFolders" type="as" access="readwrite" />\
<property name="TotalBytes" type="x" access="read" />\
<property name="UsedBytes" type="x" access="read" />\
</interface></node>';
const AccountProxy = Gio.DBusProxy.makeProxyWrapper(AccountIface);

const GeneralIface ='<node>\<interface name="com.hubic.general">\
<method name="Login">\
<arg name="email" direction="in" type="s" />\
<arg name="password" direction="in" type="s" />\
<arg name="synchronizedDir" direction="in" type="s" />\
</method>\
<method name="Reconnect" />\
<method name="Stop" />\
<signal name="Messages">\
<arg name="level" direction="out" type="i" />\
<arg name="message" direction="out" type="s" />\
<arg name="targetPath" direction="out" type="s" />\
</signal>\
<signal name="StateChanged">\
<arg name="oldState" direction="out" type="s" />\
<arg name="newState" direction="out" type="s" />\
</signal>\
<property name="CurrentState" type="s" access="read" />\
<property name="CurrentUploadSpeed" type="x" access="read" />\
<property name="CurrentDownloadSpeed" type="x" access="read" />\
<property name="LastMessages" type="a(xiss)" access="read" />\
</interface></node>';
const GeneralProxy = Gio.DBusProxy.makeProxyWrapper(GeneralIface);
//util
function _log(message){
    //TODO: activate log with a debug flag.
    log(message);
}
/**
 *  Hubic Indicator class  in charge of managing interaction with daemon.
 *  It seems that some properties of DBus object are not updated correctly. so proxies are competely rebuilt at each event.
 */
const HubicIndicator= new Lang.Class({
    Name : "HubicIndicator",

    _init : function(){      
        this._general = null;
        this._account = null;
        this._listener = null;
    },
     
   
    refresh: function(){
        _log("Refreshing hubic indicator data ...");

        this.refreshGeneral(true);
        this.refreshAccount(true);
    },
   
    get currentState(){
        if(!this._currentState){
            this._currentState = this.general.CurrentState ? this.general.CurrentState : "Unknown";
        }
        return this._currentState;
    },
    set currentState(v){
        // TODO: check param
        this._currentState = v;
    },
    get general(){
        this.refreshGeneral(false);
        return this._general;
    },
    
    _sendListenerStateChanged: function(){
        this._listener();
    },
    
    registerListener: function(callback){
        this._listener =  callback;
    },

    refreshGeneral: function(force){
        // log("General state " + this.general);
        if(!force && (this._general !== null) /* && (this._general.CurrentState !== null)   */){
            // log("Refreshing general data is useless.");
            return;
        }
        _log("Refreshing general data...");
        this._destroyGeneral();
        this._general = new GeneralProxy(Gio.DBus.session, 'com.hubiC','/com/hubic/General');
        this.stateChangedSignalId = this._general.connectSignal('StateChanged',Lang.bind(this,function(proxy,sender,res){
            _log("Signal state changed by " + sender + " with state old "+ res[0] + " new state " + res[1]);
            _log("original connection :" + this.stateChangedSignalId);
            // disconnect from signal 'StateChanged' no, but should
            // be in _destroyGeneral().
            // this.sender = sender;
            // this._general.disconnectSignal(this.stateChangedSignalId);
            if(this.currentState !== res[0]){
                _log("Warning : expected previous state was " + this.currentState);
            }
            this.currentState = res[1];
            //this.refreshGeneral(true);
            this.refresh();
            this._sendListenerStateChanged();
        }));
        
        if(this.currentState === 'NotConnected'){
            this._reconnectDaemon();
        }
        else{
            this._disposeReconnectDaemon();
        }
		
    },
    _destroyGeneral: function(){
        if(this._general !== null){
            if(this.stateChangedSignalId) this._general.disconnectSignal(this.stateChangedSignalId);
            this._general.run_dispose();
        }
        this._general = null;
    },
    get account(){
        this.refreshAccount(false);
        return this._account;
    },
    refreshAccount: function(force){
        if(!force && (this._account !== null) /* && how to detect need of refresh ?*/){
            // log("Refreshing general data is useless.");
            return;
        } 
        _log("Refreshing account data...");
        this._destroyAccount();
        this._account = new AccountProxy(Gio.DBus.session, 'com.hubiC','/com/hubic/Account');
//        this.itemChangedSignalId = this._account.connectSignal('ItemChanged',Lang.bind(this,function(proxy,sender,res){
//            _log("Item state changed by " + sender + " with path "+ res[0] );
//            _log("original connection :" + this.itemChangedSignalId);
//            // this.currentState = res[1];
//            // this.refreshGeneral(true);
//            let status = this._account.GetItemStatusSync(res[0]);
//            if(status){
//                _log("status" + status);
//            }
//            //this.refresh();
//        }));
    },
    _destroyAccount: function(){
        if(this._account !== null){
            if(this.itemChangedSignalId){
                this._account.disconnectSignal(this.itemChangedSignalId);
            }
            this._account.run_dispose();
        }
        this._account = null;
    },

    pause: function(){
        let acc = this.account;
        if(acc){// TODO: do it asynchronous to handle errors.
            _log(acc);
            acc.SetPauseStateSync(true);
        }
    },
    resume: function(){
        let acc = this.account;
        if(acc){
            acc.SetPauseStateSync(false);
        }
    },
    reconnect: function(){
        let gen = this.general;
        if(gen){
            gen.ReconnectRemote(Lang.bind(this,function (result, error) {
                if (error) {
                    _log("Error reconnecting : " + error.toString());
                }
            }));
        }
    },
    
    _reconnectDaemon : function(){
        if(!this.timer){
            _log("lauching daemon");
            this.timer = Mainloop.timeout_add_seconds(20, Lang.bind(this, function() {
                _log("try to reconnect...");
                this.reconnect();
                return true;
            })); 
        }
        else{
            _log(" daemon already running.");
        }
    },
    _disposeReconnectDaemon: function(){
        _log("disposing daemon");
      //remove timers
        if(this.timer) {
            Mainloop.source_remove(this.timer);
            this.timer = null;
        }
    },
    start: function(){
        // register timer that refresh properties of general and account
        // properties.
        // once problems with refresh of these properties are solved, can be removed.
      
        this.refresh();
    },
    stop: function(){
        _log("Stopping hubic board ...");
        this._disposeReconnectDaemon();
        this._destroyAccount();
        this._destroyGeneral();
    }
});
