define(function (require, exports, module) {
    'use strict';
    
    var KeyEvent = brackets.getModule('utils/KeyEvent'),
        EditorManager = brackets.getModule('editor/EditorManager'),
        MainViewManager = brackets.getModule('view/MainViewManager'),
        Acorn_loose = require('thirdparty/acorn/acorn_loose'),
        Walker = require('thirdparty/acorn/util/walk'),
        annotationSnippet = '//';
    
    /**
     * @desc Create a jsdoc annotation of the next function
     *       found (using a js parser) an insert it one line above.
     * @returns {Boolean}
     */
    function annotate() {
        var editor = EditorManager.getCurrentFullEditor(),
            // Get cursor position and set it to the beginning of the line.
            pos = editor.getCursorPos();
    
        pos.ch = 0;
        
        // Get the text from the start of the document to the current cursor position and count it's length'.
        var txtTo = editor._codeMirror.getRange({ line: 0, ch:0 }, pos),
            cursorPosition = txtTo.length,
            // Get document text.
            txtFull = editor._codeMirror.getValue(),
            // Parse text.
            acornTxtFull = Acorn_loose.parse_dammit(txtFull, {
                locations: true
            }),
            // Find next function.
            found = new Walker.findNodeAfter(acornTxtFull, cursorPosition, 'Function');
        
        if (found && found.node && found.node.loc.start.line === pos.line + 2) {
            // There was a result, so build js annotation.
            var annotation = {};
            
            annotation.location = found.node.loc;
            annotation.prefix = '';
            annotation.name = found.node.id ? found.node.id.name : null;
            annotation.params = [];
            annotation.returnValue = undefined;
            
            // Add parameters to the jsdoc object.
            found.node.params.forEach(function (param) {
                annotation.params.push(param.name);
            });
            
            // FIXME: Take into account case where return undefined.
            // FIXME: Take into account case where return true or false.
            // Find and add return value.
            var foundReturnValue = new Walker.findNodeAfter(found.node, 0, 'ReturnStatement');
            annotation.returnValue = foundReturnValue.node ? foundReturnValue.node.argument.name : undefined;
            
            // Set prefix (find first none whitespace character).
            var codeLine = editor._codeMirror.getLine(annotation.location.start.line - 1);
            annotation.prefix = codeLine.substr(0, codeLine.length - codeLine.trimLeft().length).replace(/[^\s\n]/g, ' ');
            
            // Build annotation string.
            var jsdocString = generateString(annotation);

            // Insert annotation string into editor.
            insertAnnotation(jsdocString, annotation.location);
            
            return true;
        }
        return false;
    }
    
    /**
     * @desc Create the string representation of the jsdoc object. 
     * @param {object} jsdoc input
     * @returns {string} representation of the jsdoc object
     */
    function generateString(annotation) {
        var annotationString  = annotation.prefix + '/**\n';
        
        // Add description.
        annotationString += annotation.prefix + ' * @desc\n';
        
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
     * @desc Inserts jsdoc to document.
     * @param {string} jsdocString
     * @param {object} loc location of the function
     */
    function insertAnnotation(annotationString, loc) {
        // Get editor instance
        var editor  = EditorManager.getCurrentFullEditor(),
            position = {
                line: loc.start.line - 1,
                ch: 0
            };
        
        // Remove annotationSnippet from current line.
        removeSnippet(annotationSnippet);
        
        // Place jsdocString in the editor.
        editor._codeMirror.replaceRange(annotationString, position);
        
        // Jumb to line of jsdocString.
        editor._codeMirror.setCursor(position);
        
        // Focus on active pane,
        MainViewManager.focusActivePane();
    }
    
    /**
     * @desc Removes user input snippet from current line.
     * @param {String} snippet
     */
    function removeSnippet(snippet) {
        var editor  = EditorManager.getCurrentFullEditor(),
            cursorPosition = editor.getCursorPos();
        
         editor.document.replaceRange('', {
            line: cursorPosition.line,
            ch: cursorPosition.ch - snippet.length
        }, cursorPosition);
    }
    
    /**
	 * @desc
	 * @param {Object} $event
	 * @param {Object} editor
	 * @param {Object} event
	 */
	function keyEventHandler($event, editor, event) {
        // Check if event type is "keydown" and key is "Tab".
        if ((event.type === 'keydown') && (event.keyCode === KeyEvent.DOM_VK_TAB)) {
			var cursorPosition = editor.getCursorPos(),
            	line = editor.document.getLine(cursorPosition.line);
			
			if ($.trim(line) === annotationSnippet) {
				if (annotate()) {
                    event.preventDefault();   
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
            $(lostEditor).off('keyEvent', keyEventHandler);
        }
        
		if (focusedEditor) {
            $(focusedEditor).on('keyEvent', keyEventHandler);
        }
	}
    
    // Annotate on keystroke.
    $(EditorManager).on('activeEditorChange', activeEditorChangeHandler);
});