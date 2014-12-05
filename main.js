define(function (require, exports, module) {
    'use strict';
    
    var KeyEvent = brackets.getModule('utils/KeyEvent'),
        EditorManager = brackets.getModule('editor/EditorManager'),
        MainViewManager = brackets.getModule('view/MainViewManager'),
        AcornLoose = require('thirdparty/acorn/acorn_loose'),
        Walker = require('thirdparty/acorn/util/walk'),
        annotationSnippet = '//';
    
    /**
     * @desc Creates annotation of the function found in next line
     *       and inserts it one line above.
     * @returns {Boolean}
     */
    function annotate() {
        var editor = EditorManager.getCurrentFullEditor(),
            // Get cursor position and set it to the beginning of the line.
            pos = editor.getCursorPos();
    
        pos.ch = 0;
        
        // Get the text from the start of the document to the current cursor position and count it's length'.
        var txtTo = editor._codeMirror.getRange({ line: 0, ch: 0 }, pos),
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
        if (found && found.node && found.node.loc.start.line === pos.line + 2) {
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
            
            // Set prefix (find first none whitespace character).
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
        
        // Remove annotationSnippet from current line.
        removeSnippet(annotationSnippet);
        
        // Place annotationString in the editor.
        editor._codeMirror.replaceRange(annotationString, position);
        
        // Move cursor on description (@desc) line.
        editor._codeMirror.setCursor({
            line: position.line + 1,
            ch: editor.document.getLine(position.line + 1).length
        });
        
        // Focus on active pane,
        MainViewManager.focusActivePane();
    }
    
    /**
     * @desc Removes user input snippet from current line.
     * @param {String} snippet Snippet input that triggers annotation.
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
	 * @desc The event listener that triggers annotation.
	 * @param {Object} $event
	 * @param {Object} editor
	 * @param {Object} event
	 */
	function keyEventListener($event, editor, event) {
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
            $(lostEditor).off('keyEvent', keyEventListener);
        }
        
		if (focusedEditor) {
            $(focusedEditor).on('keyEvent', keyEventListener);
        }
	}
    
    // Annotate on keystroke.
    $(EditorManager).on('activeEditorChange', activeEditorChangeHandler);
});