var LibraryWebGLMobileKeyboard = {

$mobile_input: null,
$mobile_input_text: null,
$mobile_input_hide_delay: null,
$mobile_input_ignore_blur_event: false,

JS_MobileKeyboard_Show__proxy: 'sync',
JS_MobileKeyboard_Show__sig: 'viiiiiiii',
JS_MobileKeyboard_Show__deps: ['JS_MobileKeyboard_Hide'],
JS_MobileKeyboard_Show: function(text, keyboardType, autocorrection, multiline, secure, alert,
                                 placeholder, characterLimit)
{
    if (mobile_input_hide_delay) {
        clearTimeout(mobile_input_hide_delay);
        mobile_input_hide_delay = null;
    }

    text = UTF8ToString(text);
    mobile_input_text = text;

    placeholder = UTF8ToString(placeholder);

    var container = document.body;

    var hasExistingMobileInput = !!mobile_input;

    // From KeyboardOnScreen::KeyboardTypes
    var input_type;
    var KEYBOARD_TYPE_NUMBERS_AND_PUNCTUATION = 2;
    var KEYBOARD_TYPE_URL = 3;
    var KEYBOARD_TYPE_NUMBER_PAD = 4;
    var KEYBOARD_TYPE_PHONE_PAD = 5;
    var KEYBOARD_TYPE_EMAIL_ADDRESS = 7;
    if (!secure) {
        switch (keyboardType) {
            case KEYBOARD_TYPE_EMAIL_ADDRESS:
                input_type = "email";
                break;
            case KEYBOARD_TYPE_URL:
                input_type = "url";
                break;
            case KEYBOARD_TYPE_NUMBERS_AND_PUNCTUATION:
            case KEYBOARD_TYPE_NUMBER_PAD:
            case KEYBOARD_TYPE_PHONE_PAD:
                input_type = "number";
                break;
            default:
                input_type = "text";
                break;
        }
    } else {
        input_type = "password";
    }

    if (hasExistingMobileInput) {
        if (mobile_input.multiline != multiline) {
            _JS_MobileKeyboard_Hide(false);
            return;
        }
    }

    var inputContainer = mobile_input || document.createElement("div");
    if (!hasExistingMobileInput) {
        inputContainer.style = "width:100%; position:fixed; bottom:0px; margin:0px; padding:0px; left:0px; border: 1px solid #000; border-radius: 5px; background-color:#fff; font-size:14pt;";
        container.appendChild(inputContainer);
        mobile_input = inputContainer;
    }

    var input = hasExistingMobileInput ?
        mobile_input.input :
        document.createElement(multiline ? "textarea" : "input");

    mobile_input.multiline = multiline;
    mobile_input.secure = secure;
    mobile_input.keyboardType = keyboardType;
    mobile_input.inputType = input_type;

    input.type = input_type;
    input.style = "width:calc(100% - 85px); " + (multiline ? "height:100px;" : "") + "vertical-align:top; border-radius: 5px; outline:none; cursor:default; resize:none; border:0px; padding:10px 0px 10px 10px;";

    input.spellcheck = autocorrection ? true : false;
    input.maxLength = characterLimit > 0 ? characterLimit : 524288;
    input.value = text;
    input.placeholder = placeholder;

    if (!hasExistingMobileInput) {
        inputContainer.appendChild(input);
        inputContainer.input = input;
    }

    if (!hasExistingMobileInput) {
        var okButton = document.createElement("button");
        okButton.innerText = "OK";
        okButton.style = "border:0; position:absolute; left:calc(100% - 75px); top:0px; width:75px; height:100%; margin:0; padding:0; border-radius: 5px; background-color:#fff";
        okButton.addEventListener("touchend", function() {
            _JS_MobileKeyboard_Hide(true);
        });

        inputContainer.appendChild(okButton);
        inputContainer.okButton = okButton;

        // For single-line text input, enter key will close the keyboard.
        input.addEventListener('keyup', function(e) {
            if (input.parentNode.multiline) return;
            if (e.code == 'Enter' || e.which == 13 || e.keyCode == 13) {
                _JS_MobileKeyboard_Hide(true);
            }
        });

        // On iOS, the keyboard has a done button that hides the keyboard. The only way to detect
        // when this happens seems to be when the HTML input looses focus, so we watch for the blur
        // event on the input element and close the element/keybaord when it's gotten.
        input.addEventListener("blur", function(e) {
            _JS_MobileKeyboard_Hide(true);
            e.stopPropagation();
            e.preventDefault();
        });

        input.select();
        input.focus();
    } else {
        input.select();
    }
},

JS_MobileKeybard_GetIgnoreBlurEvent__proxy: 'sync',
JS_MobileKeybard_GetIgnoreBlurEvent__sig: 'i',
JS_MobileKeybard_GetIgnoreBlurEvent__deps: ['$mobile_input_ignore_blur_event'],
JS_MobileKeybard_GetIgnoreBlurEvent: function() {
    // On some platforms, such as iOS15, a blur event is sent to the window after the keyboard
    // is closed. This causes the game to be paused in the blur event handler in ScreenManagerWebGL.
    // It checks this return value to see if it should ignore the blur event.
    return mobile_input_ignore_blur_event;
},

JS_MobileKeyboard_Hide__proxy: 'sync',
JS_MobileKeyboard_Hide__sig: 'vi',
JS_MobileKeyboard_Hide__deps: ['$mobile_input_ignore_blur_event'],
JS_MobileKeyboard_Hide: function(delay)
{
    if (mobile_input_hide_delay) return;
    mobile_input_ignore_blur_event = true;

    function hideMobileKeyboard() {
        if (mobile_input && mobile_input.input) {
            mobile_input_text = mobile_input.input.value;
            mobile_input.input = null;
            if (mobile_input.parentNode && mobile_input.parentNode) {
                mobile_input.parentNode.removeChild(mobile_input);
            }
        }
        mobile_input = null;
        mobile_input_hide_delay = null;

        // mobile_input_ignore_blur_event was set to true so that ScreenManagerWebGL will ignore
        // the blur event it might get from the closing of the keyboard. But it might not get that
        // blur event, too, depending on the browser. So we want to clear the flag, as soon as we
        // can, but some time after the blur event has been potentially fired.
        setTimeout(function() {
            mobile_input_ignore_blur_event = false;
        }, 100);
    }

    if (delay) {
        // Delaying the hide of the input/keyboard allows a new input to be selected and re-use the
        // existing control. This fixes a problem where a quick tap select of a new element would
        // cause it to not be displayed because it tried to be focused before the old keyboard finished
        // sliding away.
        var hideDelay = 200;
        mobile_input_hide_delay = setTimeout(hideMobileKeyboard, hideDelay);
    } else {
        hideMobileKeyboard();
    }
},

JS_MobileKeyboard_GetText__proxy: 'sync',
JS_MobileKeyboard_GetText__sig: 'iii',
JS_MobileKeyboard_GetText: function(buffer, bufferSize)
{
    // If the keyboard was closed, use the cached version of the input's text so that Unity can
    // still ask for it.
    var text = mobile_input && mobile_input.input ? mobile_input.input.value :
        mobile_input_text ? mobile_input_text :
        "";
    if (buffer) stringToUTF8(text, buffer, bufferSize);
    return lengthBytesUTF8(text);
},

JS_MobileKeyboard_SetText__proxy: 'sync',
JS_MobileKeyboard_SetText__sig: 'vi',
JS_MobileKeyboard_SetText: function(text)
{
    if (!mobile_input) return;
    text = UTF8ToString(text);
    mobile_input.input.value = text;
},

JS_MobileKeyboard_GetTextSelection__proxy: 'sync',
JS_MobileKeyboard_GetTextSelection__sig: 'vii',
JS_MobileKeyboard_GetTextSelection: function(outStart, outLength)
{
    if (!mobile_input) {
        HEAP32[outStart >> 2] = 0;
        HEAP32[outLength >> 2] = 0;
        return;
    }
    HEAP32[outStart >> 2] = mobile_input.input.selectionStart;
    HEAP32[outLength >> 2] = mobile_input.input.selectionEnd - mobile_input.input.selectionStart;
},

JS_MobileKeyboard_SetTextSelection__proxy: 'sync',
JS_MobileKeyboard_SetTextSelection__sig: 'vii',
JS_MobileKeyboard_SetTextSelection: function(start, length)
{
    if (!mobile_input) return;
    if(mobile_input.input.type === "number"){ // The type of input field has to be changed to use setSelectionRange
        mobile_input.input.type = "text";
        mobile_input.input.setSelectionRange(start, start + length);
        mobile_input.input.type = "number";
    } else {
        mobile_input.input.setSelectionRange(start, start + length);
    }
},

JS_MobileKeyboard_SetCharacterLimit__proxy: 'sync',
JS_MobileKeyboard_SetCharacterLimit__sig: 'vi',
JS_MobileKeyboard_SetCharacterLimit: function(limit)
{
    if (!mobile_input) return;
    mobile_input.input.maxLength = limit;
},

JS_MobileKeyboard_GetKeyboardStatus__proxy: 'sync',
JS_MobileKeyboard_GetKeyboardStatus__sig: 'i',
JS_MobileKeyboard_GetKeyboardStatus: function()
{
    var kKeyboardStatusVisible = 0;
    var kKeyboardStatusDone = 1;
    //var kKeyboardStatusCanceled = 2;
    //var kKeyboardStatusLostFocus = 3;
    if (!mobile_input) return kKeyboardStatusDone;
    return kKeyboardStatusVisible;
}

};

autoAddDeps(LibraryWebGLMobileKeyboard, '$mobile_input');
autoAddDeps(LibraryWebGLMobileKeyboard, '$mobile_input_text');
autoAddDeps(LibraryWebGLMobileKeyboard, '$mobile_input_hide_delay');
mergeInto(LibraryManager.library, LibraryWebGLMobileKeyboard);
