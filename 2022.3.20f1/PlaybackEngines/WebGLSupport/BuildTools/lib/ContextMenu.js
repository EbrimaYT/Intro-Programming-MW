var LibraryContextMenu = {

    JS_Init_ContextMenuHandler__proxy: 'sync',
    JS_Init_ContextMenuHandler__sig: 'v',
    JS_Init_ContextMenuHandler: function () {
        const _handleContextMenu = function (event){
            if(event.target.localName !== "canvas")
                _ReleaseKeys();
        }

        document.addEventListener("contextmenu", _handleContextMenu);

        Module.deinitializers.push(function() {
            document.removeEventListener("contextmenu", _handleContextMenu);
        });
    }
}

mergeInto(LibraryManager.library, LibraryContextMenu);