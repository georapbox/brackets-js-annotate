define(function (require, exports, module) {
    'use strict';
    
    var AppInit = brackets.getModule('utils/AppInit'),
        KeyEvent = brackets.getModule('utils/KeyEvent'),
        EditorManager = brackets.getModule('editor/EditorManager'),
        MainViewManager = brackets.getModule('view/MainViewManager'),
        PreferencesManager = brackets.getModule('preferences/PreferencesManager'),
        Menus = brackets.getModule('command/Menus'),
        CommandManager = brackets.getModule('command/CommandManager'),
		Dialogs = brackets.getModule('widgets/Dialogs'),
		Strings = require('strings'),
		PromptDialogTemplate = require('text!html/prompt_dialog.html'),
        
        AcornLoose = require('thirdparty/acorn/acorn_loose'),
        Walker = require('thirdparty/acorn/util/walk'),
        
        annotationSnippet = '/**',
        
        isEnabled = true,
        prefs = PreferencesManager.getExtensionPrefs('georapbox.js-annotate'),
    
        COMMAND_NAME = Strings.COMMAND_NAME,
        COMMAND_ID = 'georapbox.js.annotate';
    
    // Enable the extension by default (user can disable it later if needed).
    prefs.definePreference('enabled', 'boolean', isEnabled);
    
    /**
     * @desc Enables/Disables the extension.
     */
    function toggleExtensionAvailability() {
        isEnabled = !isEnabled;                                  // Toggle between true/false.
        prefs.set('enabled', isEnabled);                         // Set preferences file.
        prefs.save();                                            // Save preferences file.
        CommandManager.get(COMMAND_ID).setChecked(isEnabled);    // Check/Uncheck Edit Menu.
        CommandManager.execute('app.reload');                    // Reload Brackets.
    }
    
	/**
	 * @desc Displays a dialog that prompts user to reload Brackets
	 *       in order to enable or disable the extension.
	 * @returns {Object} promise
	 */
	function showRefreshDialog() {
		var promise;
        
        switch (isEnabled) {
			case true:
				Strings.PROMPT_DIALOG_TITLE = Strings.DISABLE_PROMPT_DIALOG_TITLE;
                Strings.PROMPT_DIALOG_BODY = Strings.DISABLE_PROMPT_DIALOG_BODY;
                Strings.DIALOG_OK = Strings.DISABLE_DIALOG_OK;
				break;
			case false:
                Strings.PROMPT_DIALOG_TITLE = Strings.ENABLE_PROMPT_DIALOG_TITLE;
				Strings.PROMPT_DIALOG_BODY = Strings.ENABLE_PROMPT_DIALOG_BODY;
				Strings.DIALOG_OK = Strings.ENABLE_DIALOG_OK;    
                break;
		}
		
		// Display the prompt dialog.
		promise = Dialogs.showModalDialogUsingTemplate(Mustache.render(PromptDialogTemplate, Strings)).
			done(function (id) {
				// If "OK" button is clicked...
				if (id === Dialogs.DIALOG_BTN_OK) {
					toggleExtensionAvailability();
				}
			});
		
		return promise;
	}
	
    /**
     * @desc Applies preferences.
     */
    function applyPreferences() {
        isEnabled = prefs.get('enabled');                        // Get extension availability from preferences file.
        CommandManager.get(COMMAND_ID).setChecked(isEnabled);    // Check/Uncheck Edit Menu.
    }
    
    /**
     * @desc Creates annotation of the function found in next line
     *       and inserts it one line above.
     * @returns {Boolean}
     */
    function annotate() {
        var editor = EditorManager.getCurrentFullEditor(),
            // Get cursor position and set it to the beginning of the line.
            position = editor.getCursorPos();
    
        position.ch = 0;
        
        // ** IMPORTANT ** 
        // Make sure to remove the "/**" snippet typed by user,
        // so as the parser does not recognise it as open node comment.
        manipulateSnippet(annotationSnippet, '');
        
        // Get the text from the start of the document to the current cursor position and count it's length'.
        var txtTo = editor._codeMirror.getRange({ line: 0, ch: 0 }, position),
            cursorPosition = txtTo.length,
            // Get document text.
            txtFull = editor._codeMirror.getValue(),
            // Parse text.
            // jscs: disable requireCamelCaseOrUpperCaseIdentifiers
            parsed = AcornLoose.parse_dammit(txtFull, {
                locations: true
            }),
            // jscs: enable requireCamelCaseOrUpperCaseIdentifiers
            // Find next function.
            found = new Walker.findNodeAfter(parsed, cursorPosition, 'Function');
        
        // If a result, build annotation.
        if (found && found.node && found.node.loc.start.line === position.line + 2) {
            var annotation = {
                location: found.node.loc,
                prefix: '',
                name: found.node.id ? found.node.id.name : null,
                params: [],
                returnValue: undefined
            };
            
            // Add parameters to the annotation object.
            found.node.params.forEach(function (param) {
                annotation.params.push(param.name);
            });
            
            // Find and add return value.
            var foundReturnValue = new Walker.findNodeAfter(found.node, 0, 'ReturnStatement');
            
            if (foundReturnValue.node && foundReturnValue.node.argument) {
                if (foundReturnValue.node.argument.name) {
                    annotation.returnValue = foundReturnValue.node.argument.name;
                } else if (foundReturnValue.node.argument.raw) {
                    annotation.returnValue = foundReturnValue.node.argument.raw;
                }
            } else {
                annotation.returnValue = undefined;
            }
            
            // Set prefix.
            var codeLine = editor._codeMirror.getLine(annotation.location.start.line - 1);
            annotation.prefix = codeLine.substr(0, codeLine.length - codeLine.trimLeft().length).replace(/[^\s\n]/g, ' ');
            
            // Build annotation string.
            var annotationString = generateString(annotation);

            // Insert annotation string into editor.
            insertAnnotation(annotationString, annotation.location);
            
            return true;
        }
        return false;
    }
    
    /**
     * @desc Generates the string representation of the annotation object. 
     * @param {Object} annotation Annotation object input.
     * @returns {String} Representation of the annotation object.
     */
    function generateString(annotation) {
        var annotationString  = annotation.prefix + '/**\n';
        
        // Add description.
        annotationString += annotation.prefix + ' * @desc \n';
        
        // Add parameters.
        annotation.params.forEach(function (param) {
            annotationString += annotation.prefix + ' * @param {type} ' + param + '\n';
        });
        
        // Add return statement.
        if (annotation.returnValue) {
            annotationString += annotation.prefix + ' * @returns {type}\n';
        }

        annotationString += annotation.prefix + ' */\n';
        
        return annotationString;   
    }
    
    /**
     * @desc Inserts annotation string to document.
     * @param {string} annotationString  Representation of the annotation object.
     * @param {object} loc Location of the function to annotate.
     */
    function insertAnnotation(annotationString, loc) {
        // Get editor instance
        var editor  = EditorManager.getCurrentFullEditor(),
            position = {
                line: loc.start.line - 1,
                ch: 0
            };
        
        // Place annotationString in the editor.
        editor._codeMirror.replaceRange(annotationString, position);
        
        // Move cursor on description (@desc) line to edit.
        editor._codeMirror.setCursor({
            line: position.line + 1,
            ch: editor.document.getLine(position.line + 1).length
        });
        
        // Focus on active pane,
        MainViewManager.focusActivePane();
    }
  
    /**
     * @desc Gets user input snippet and replaces with replacement string.
     * @param {String} snippet Snippet input that triggers annotation.
     * @param {String} replacement The string we want to replace the snippet with.
     */
    function manipulateSnippet(snippet, replacement) {
        var editor  = EditorManager.getCurrentFullEditor(),
            cursorPosition = editor.getCursorPos();
        
        editor.document.replaceRange(replacement, {
            line: cursorPosition.line,
            ch: cursorPosition.ch - snippet.length
        }, cursorPosition);
    }
    
    /**
	 * @desc The event listener that triggers annotation.
	 * @param {Object} $event
	 * @param {Object} editor
	 * @param {Object} event
	 */
	function keyEventListener($event, editor, event) {
        isEnabled = prefs.get('enabled');
        
        if (isEnabled) {
            // Check if event type is "keydown" and key is "RETURN".
            if ((event.type === 'keydown') && (event.keyCode === KeyEvent.DOM_VK_RETURN)) {
                var cursorPosition = editor.getCursorPos(),
                    line = editor.document.getLine(cursorPosition.line),
                    rtrimmedLine = line.replace(/\s+$/, '');

                // Disable annotation if cursor is not exactley after
                // the annotation snippet, with no psace after it.
                if (cursorPosition.ch !== rtrimmedLine.length) {
                    return false;
                }

                // Proceed to annotation and prevent default
                // behaviour of "RETURN" key stroke.
                if ($.trim(line) === annotationSnippet) {
                    annotate() && event.preventDefault();
                }
            }
        }    
    }
    
	/**
	 * @desc Removes key events from lost editor, adds key events to focused editor.
	 * @param {type} $event
	 * @param {type} focusedEditor
	 * @param {type} lostEditor
	 */
	function activeEditorChangeHandler($event, focusedEditor, lostEditor) {
        if (lostEditor) {
            $(lostEditor).off('keyEvent', keyEventListener);
        }

        if (focusedEditor) {
            $(focusedEditor).on('keyEvent', keyEventListener);
        }    
	}
	
    // Initialize extension.
    AppInit.appReady(function () {
        // Register toggle command and add it to Edit menu.
        CommandManager.register(COMMAND_NAME, COMMAND_ID, showRefreshDialog);
        Menus.getMenu(Menus.AppMenuBar.EDIT_MENU).addMenuItem(COMMAND_ID);
        
        // Get extension availability from preferences file.
        isEnabled = prefs.get('enabled');
        
        // Apply preferences.
        applyPreferences();
        
        prefs.on('change', function () {
            applyPreferences();
        });
        
        // Annotate on keystroke.
        if (isEnabled === true) {
            $(EditorManager).on('activeEditorChange', activeEditorChangeHandler);
        }
    });
});