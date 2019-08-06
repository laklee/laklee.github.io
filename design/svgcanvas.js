// Dependencies:
// 1) jQuery
// 2) pathseg.js
// 3) browser.js
// 4) svgtransformlist.js
// 5) math.js
// 6) units.js
// 7) svgutils.js
// 8) sanitize.js
// 9) history.js
// 10) select.js
// 11) draw.js
// 12) path.js
// 13) coords.js
// 14) recalculate.js

(function () {

	if (!window.console) {
		window.console = {};
		window.console.log = function(str) {};
		window.console.dir = function(str) {};
	}

	if (window.opera) {
		window.console.log = function(str) { opera.postError(str); };
		window.console.dir = function(str) {};
	}

}());

// Class: SvgCanvas
// The main SvgCanvas class that manages all SVG-related functions
//
// Parameters:
// container - The container HTML element that should hold the SVG root element
// config - An object that contains configuration data
$.SvgCanvas = function(container, config) {
// Alias Namespace constants
	var NS = svgedit.NS;

// Default configuration options
	var curConfig = {
		show_outside_canvas: true,
		selectNew: true,
		dimensions: [640, 480]
	};

// Update config with new one if given
	if (config) {
		$.extend(curConfig, config);
	}

// Array with width/height of canvas
	var dimensions = curConfig.dimensions;

	var canvas = this;

// "document" element associated with the container (same as window.document using default svg-editor.js)
// NOTE: This is not actually a SVG document, but a HTML document.
	var svgdoc = container.ownerDocument;

// This is a container for the document being edited, not the document itself.
	var svgroot = svgdoc.importNode(svgedit.utilities.text2xml(
		'<svg id="svgroot" xmlns="' + NS.SVG + '" xlinkns="' + NS.XLINK + '" ' +
		'width="' + dimensions[0] + '" height="' + dimensions[1] + '" x="' + dimensions[0] + '" y="' + dimensions[1] + '" overflow="visible" text-rendering="geometricPrecision">' +
		'<defs>' +
		'<filter id="canvashadow" filterUnits="objectBoundingBox">' +
		'<feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur"/>'+
		'<feOffset in="blur" dx="5" dy="5" result="offsetBlur"/>'+
		'<feMerge>'+
		'<feMergeNode in="offsetBlur"/>'+
		'<feMergeNode in="SourceGraphic"/>'+
		'</feMerge>'+
		'</filter>'+
		'</defs>'+
		'</svg>').documentElement, true);
	container.appendChild(svgroot);

	var bitmapUtils = this.bitmapUtils = new bitmaputils(svgroot);

// The actual element that represents the final output SVG element
	var svgcontent = svgdoc.createElementNS(NS.SVG, 'svg');

// This function resets the svgcontent element while keeping it in the DOM.
	var clearSvgContentElement = canvas.clearSvgContentElement = function() {
		while (svgcontent.firstChild) { svgcontent.removeChild(svgcontent.firstChild); }

		// TODO: Clear out all other attributes first?
		$(svgcontent).attr({
			id: 'svgcontent',
			width: dimensions[0],
			height: dimensions[1],
			x: dimensions[0],
			y: dimensions[1],
			overflow: curConfig.show_outside_canvas ? 'visible' : 'hidden',
			xmlns: NS.SVG,
			'xmlns:se': NS.SE,
			'xmlns:xlink': NS.XLINK
		}).appendTo(svgroot);

		// TODO: make this string optional and set by the client
		var comment = svgdoc.createComment(" Created with Cloth Designer");
		svgcontent.appendChild(comment);
	};
	clearSvgContentElement();

// Prefix string for element IDs
	var idprefix = 'svg_';

// Function: setIdPrefix
// Changes the ID prefix to the given value
//
// Parameters:
// p - String with the new prefix
	canvas.setIdPrefix = function(p) {
		idprefix = p;
	};

// Current svgedit.draw.Drawing object
// @type {svgedit.draw.Drawing}
	canvas.current_drawing_ = new svgedit.draw.Drawing(svgcontent, idprefix);

// Function: getCurrentDrawing
// Returns the current Drawing.
// @return {svgedit.draw.Drawing}
	var getCurrentDrawing = canvas.getCurrentDrawing = function() {
		return canvas.current_drawing_;
	};

// Float displaying the current zoom level (1 = 100%, .5 = 50%, etc)
	var current_zoom = 1;

	var lastRulerX = 0;
	var lastRulerY = 0;

	var canvasX = 0;
	var canvasY = 0;

	var canvasScale = 1;

	var previewPartsList = new Map();
	var previewPartsListUpdated = new Map();

	var isRequestPartsList = false;

	var pointCheckFuzzDistance = 2;

	var currentMousePos = {x:0 , y:0};

	var isAddingRulerX = false;
	var isAddingRulerY = false;
	var activeRuler = null;
	var selectedRuler = null;
	var activeIndicator = null;

	var activeIndicatorFontSize = 12;

// pointer to current group (for in-group editing)
	var current_group = null;

	var singleMoveFlagDx = Number.MAX_VALUE;
    var singleMoveFlagDy = Number.MAX_VALUE;

    var isNewPath = null;

// Object containing data for the currently selected styles
	var all_properties = {
		shape: {
			fill: (curConfig.initFill.color == 'none' ? '' : '#') + curConfig.initFill.color,
			fill_paint: null,
			fill_opacity: curConfig.initFill.opacity,
			stroke: '#' + curConfig.initStroke.color,
			stroke_paint: null,
			stroke_opacity: curConfig.initStroke.opacity,
			stroke_width: curConfig.initStroke.width,
			stroke_dasharray: 'none',
			stroke_linejoin: "round",
			stroke_linecap: 'round',
			opacity: curConfig.initOpacity
		}
	};

	all_properties.text = $.extend(true, {}, all_properties.shape);
	$.extend(all_properties.text, {
		fill: '#000000',
		stroke_width: 0,
		font_size: 24,
		font_family: 'serif'
	});

// Current shape style properties
	var cur_shape=all_properties.shape;

// Array with all the currently selected elements
// default size of 1 until it needs to grow bigger
	var selectedElements =[];
    this.selectedElements = selectedElements;
    this.isToMiter = false;
// Function: addSvgElementFromJson
// Create a new SVG element based on the given object keys/values and add it to the current layer
// The element will be ran through cleanupElement before being returned
//
// Parameters:
// data - Object with the following keys/values:
// * element - tag name of the SVG element to create
// * attr - Object with attributes key-values to assign to the new element
// * curStyles - Boolean indicating that current style attributes should be applied first
//
// Returns: The new element
	var addSvgElementFromJson = this.addSvgElementFromJson = function(data) {
		var shape = svgedit.utilities.getElem(data.attr.id);
		// if shape is a path but we need to create a rect/ellipse, then remove the path
		var current_layer = getCurrentDrawing().getCurrentLayer();
		if (shape && data.element != shape.tagName) {
			current_layer.removeChild(shape);
			shape = null;
		}
		if (!shape) {
			shape = svgdoc.createElementNS(NS.SVG, data.element);
			if (current_layer) {
				(current_group || current_layer).appendChild(shape);
			}
		}
        cur_shape.stroke_linejoin  = canvas.isToMiter?"miter":cur_shape.stroke_linejoin;
        cur_shape.stroke_linecap  = canvas.isToMiter?"square":cur_shape.stroke_linecap;
		if (data.curStyles) {
			svgedit.utilities.assignAttributes(shape, {
				'fill': cur_shape.fill,
				'stroke': cur_shape.stroke,
				'stroke-width': cur_shape.stroke_width,
				'stroke-dasharray': cur_shape.stroke_dasharray,
				'stroke-linejoin': cur_shape.stroke_linejoin,
				'stroke-linecap': cur_shape.stroke_linecap,
				'stroke-opacity': cur_shape.stroke_opacity,
				'fill-opacity': cur_shape.fill_opacity,
				'opacity': cur_shape.opacity,// / 2,
				'style': 'pointer-events:inherit;cursor:default'
			}, 100);
		}
		svgedit.utilities.assignAttributes(shape, data.attr, 100);
		svgedit.utilities.cleanupElement(shape);
		return shape;
	};

// import svgtransformlist.js
	var getTransformList = canvas.getTransformList = svgedit.transformlist.getTransformList;

// import from math.js.
	var transformPoint = svgedit.math.transformPoint;
	var matrixMultiply = canvas.matrixMultiply = svgedit.math.matrixMultiply;
	var hasMatrixTransform = canvas.hasMatrixTransform = svgedit.math.hasMatrixTransform;
	var transformListToTransform = canvas.transformListToTransform = svgedit.math.transformListToTransform;
	var snapToAngle = svgedit.math.snapToAngle;
	var getMatrix = svgedit.math.getMatrix;

// initialize from units.js
// send in an object implementing the ElementContainer interface (see units.js)
	svgedit.units.init({
		getBaseUnit: function() { return curConfig.baseUnit; },
		getElement: svgedit.utilities.getElem,
		getHeight: function() { return svgcontent.getAttribute('height')/current_zoom; },
		getWidth: function() { return svgcontent.getAttribute('width')/current_zoom; },
		getRoundDigits: function() { return save_options.round_digits; }
	});
// import from units.js
	var convertToNum = canvas.convertToNum = svgedit.units.convertToNum;

// import from svgutils.js
	svgedit.utilities.init({
		getDOMDocument: function() { return svgdoc; },
		getDOMContainer: function() { return container; },
		getSVGRoot: function() { return svgroot; },
		// TODO: replace this mostly with a way to get the current drawing.
		getSelectedElements: function() { return selectedElements; },
		getSVGContent: function() { return svgcontent; },
		getBaseUnit: function() { return curConfig.baseUnit; },
		getSnappingStep: function() { return curConfig.snappingStep; }
	});
	var findDefs = canvas.findDefs = svgedit.utilities.findDefs;
	var getUrlFromAttr = canvas.getUrlFromAttr = svgedit.utilities.getUrlFromAttr;
	var getHref = canvas.getHref = svgedit.utilities.getHref;
	var setHref = canvas.setHref = svgedit.utilities.setHref;
	var getPathBBox = svgedit.utilities.getPathBBox;
	var getBBox = canvas.getBBox = svgedit.utilities.getBBox;
	var getRotationAngle = canvas.getRotationAngle = svgedit.utilities.getRotationAngle;
	var getElem = canvas.getElem = svgedit.utilities.getElem;
	var getRefElem = canvas.getRefElem = svgedit.utilities.getRefElem;
	var assignAttributes = canvas.assignAttributes = svgedit.utilities.assignAttributes;
	var cleanupElement = this.cleanupElement = svgedit.utilities.cleanupElement;

// import from coords.js
	svgedit.coords.init({
		getDrawing: function() { return getCurrentDrawing(); },
		getGridSnapping: function() { return curConfig.gridSnapping; }
	});
	var remapElement = this.remapElement = svgedit.coords.remapElement;

// import from recalculate.js
	svgedit.recalculate.init({
		getSVGRoot: function() { return svgroot; },
		getStartTransform: function() { return startTransform; },
		setStartTransform: function(transform) { startTransform = transform; }
	});
	var recalculateDimensions = this.recalculateDimensions = svgedit.recalculate.recalculateDimensions;

// import from sanitize.js
	var nsMap = svgedit.getReverseNS();
	var sanitizeSvg = canvas.sanitizeSvg = svgedit.sanitize.sanitizeSvg;

// import from history.js
	var MoveElementCommand = svgedit.history.MoveElementCommand;
	var InsertElementCommand = svgedit.history.InsertElementCommand;
	var RemoveElementCommand = svgedit.history.RemoveElementCommand;
	var ChangeElementCommand = svgedit.history.ChangeElementCommand;
	var BatchCommand = svgedit.history.BatchCommand;
	var call;
// Implement the svgedit.history.HistoryEventHandler interface.
	canvas.undoMgr = new svgedit.history.UndoManager({
		handleHistoryEvent: function(eventType, cmd) {
			var EventTypes = svgedit.history.HistoryEventTypes;
			// TODO: handle setBlurOffsets.
			if (eventType == EventTypes.BEFORE_UNAPPLY || eventType == EventTypes.BEFORE_APPLY) {
				canvas.clearSelection();
			} else if (eventType == EventTypes.AFTER_APPLY || eventType == EventTypes.AFTER_UNAPPLY) {
				var elems = cmd.elements();
				canvas.pathActions.clear();
				call('changed', elems);
				var cmdType = cmd.type();
				var isApply = (eventType == EventTypes.AFTER_APPLY);
				if (cmdType == MoveElementCommand.type()) {
					var parent = isApply ? cmd.newParent : cmd.oldParent;
					if (parent == svgcontent) {
						canvas.identifyLayers();
					}
				} else if (cmdType == InsertElementCommand.type() ||
					cmdType == RemoveElementCommand.type()) {
					if (cmd.parent == svgcontent) {
						canvas.identifyLayers();
					}
					if (cmdType == InsertElementCommand.type()) {
						if (isApply) {restoreRefElems(cmd.elem);}
					} else {
						if (!isApply) {restoreRefElems(cmd.elem);}
					}
					if (cmd.elem.tagName === 'use') {
						setUseData(cmd.elem);
					}
				} else if (cmdType == ChangeElementCommand.type()) {
					// if we are changing layer names, re-identify all layers
					if (cmd.elem.tagName == 'title' && cmd.elem.parentNode.parentNode == svgcontent) {
						canvas.identifyLayers();
					}
					var values = isApply ? cmd.newValues : cmd.oldValues;
					// If stdDeviation was changed, update the blur.
					if (values.stdDeviation) {
						canvas.setBlurOffsets(cmd.elem.parentNode, values.stdDeviation);
					}
					// This is resolved in later versions of webkit, perhaps we should
					// have a featured detection for correct 'use' behavior?
					// ——————————
					// Remove & Re-add hack for Webkit (issue 775)
					//if (cmd.elem.tagName === 'use' && svgedit.browser.isWebkit()) {
					//	var elem = cmd.elem;
					//	if (!elem.getAttribute('x') && !elem.getAttribute('y')) {
					//		var parent = elem.parentNode;
					//		var sib = elem.nextSibling;
					//		parent.removeChild(elem);
					//		parent.insertBefore(elem, sib);
					//	}
					//}
				}
			}
		}
	});
	var addCommandToHistory = function(cmd) {
		canvas.undoMgr.addCommandToHistory(cmd);
	};

// import from select.js
	svgedit.select.init(curConfig, {
		createSVGElement: function(jsonMap) { return canvas.addSvgElementFromJson(jsonMap); },
		svgRoot: function() { return svgroot; },
		svgContent: function() { return svgcontent; },
		currentZoom: function() { return current_zoom; },
		// TODO(codedread): Remove when getStrokedBBox() has been put into svgutils.js.
		getStrokedBBox: function(elems) { return canvas.getStrokedBBox([elems]); }
	});
// this object manages selectors for us
	var selectorManager = this.selectorManager = svgedit.select.getSelectorManager();

// Import from path.js
	svgedit.path.init({
		getCurrentZoom: function() { return current_zoom; },
		getSVGRoot: function() { return svgroot; }
	});

// Interface strings, usually for title elements
	var uiStrings = {
		exportNoBlur: "Blurred elements will appear as un-blurred",
		exportNoforeignObject: "foreignObject elements will not appear",
		exportNoDashArray: "Strokes will appear filled",
		exportNoText: "Text may not appear as expected"
	};

	var visElems = 'a,circle,ellipse,foreignObject,g,image,line,path,polygon,polyline,rect,svg,text,tspan,use';
	var ref_attrs = ['clip-path', 'fill', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'stroke'];

	var elData = $.data;

// Animation element to change the opacity of any newly created element
	var opac_ani = document.createElementNS(NS.SVG, 'animate');
	$(opac_ani).attr({
		attributeName: 'opacity',
		begin: 'indefinite',
		dur: 1,
		fill: 'freeze'
	}).appendTo(svgroot);

	var restoreRefElems = function(elem) {
		// Look for missing reference elements, restore any found
		var o, i, l,
			attrs = $(elem).attr(ref_attrs);
		for (o in attrs) {
			var val = attrs[o];
			if (val && val.indexOf('url(') === 0) {
				var id = svgedit.utilities.getUrlFromAttr(val).substr(1);
				var ref = getElem(id);
				if (!ref) {
					svgedit.utilities.findDefs().appendChild(removedElements[id]);
					delete removedElements[id];
				}
			}
		}

		var childs = elem.getElementsByTagName('*');

		if (childs.length) {
			for (i = 0, l = childs.length; i < l; i++) {
				restoreRefElems(childs[i]);
			}
		}
	};

	(function() {
		// TODO For Issue 208: this is a start on a thumbnail
		//	var svgthumb = svgdoc.createElementNS(NS.SVG, 'use');
		//	svgthumb.setAttribute('width', '100');
		//	svgthumb.setAttribute('height', '100');
		//	svgedit.utilities.setHref(svgthumb, '#svgcontent');
		//	svgroot.appendChild(svgthumb);

	}());

// Object to contain image data for raster images that were found encodable
	var encodableImages = {},

	// String with image URL of last loadable image
		last_good_img_url = curConfig.imgPath + 'logo.png',

	// Array with current disabled elements (for in-group editing)
		disabled_elems = [],

	// Object with save options
		save_options = {round_digits: 5},

	// Boolean indicating whether or not a draw action has been started
		started = false,

	// String with an element's initial transform attribute value
		startTransform = null,

	// String indicating the current editor mode
		current_mode = 'select',

		isDirectToEditPath = false ,
		drawPathMouseX = 0 ,
        drawPathMouseY = 0 ,

        drawPathMouseOffsetX = 0 ,
        drawPathMouseOffsetY = 0 ,

        pickIgnoreList = [],

		isPreparedToDrawPath = true,

		currentOverlappedPath = null,

		pathOverlappedCheckSquareDist = 4 ,

		current_editing_path = null ,
		current_editing_path_dbclickcounter = 0,

		pathDrawEdgeCheckIdx = 0 ,
        pathDrawEdgeCheckInterval = 100 ,

		pathDrawCmdStack = [],
		pathDrawPostCmds = [],

		isOverwritePath = false;

	// String with the current direction in which an element is being resized
		current_resize_mode = 'none',

	// Object with IDs for imported files, to see if one was already added
		import_ids = {},

	// Current text style properties
		cur_text = all_properties.text,

	// Current general properties
		cur_properties = cur_shape,

	// Array with selected elements' Bounding box object
//	selectedBBoxes = new Array(1),

	// The DOM element that was just selected
		justSelected = null,

	// DOM element for selection rectangle drawn by the user
		rubberBox = null,

	// Array of current BBoxes, used in getIntersectionList().
		curBBoxes = [],

	// Object to contain all included extensions
		extensions = {},

	// Canvas point for the most recent right click
		lastClickPoint = null,

	// Map of deleted reference elements
		removedElements = {};

// Clipboard for cut, copy&pasted elements
	canvas.clipBoard = [];
    canvas.clipBoard2 = [];


// Should this return an array by default, so extension results aren't overwritten?
	var runExtensions = this.runExtensions = function(action, vars, returnArray) {
		var result = returnArray ? [] : false;
		$.each(extensions, function(name, opts) {
			if (opts && action in opts) {
				if (returnArray) {
					result.push(opts[action](vars));
				} else {
					result = opts[action](vars);
				}
			}
		});
		return result;
	};

// Function: addExtension
// Add an extension to the editor
//
// Parameters:
// name - String with the ID of the extension
// ext_func - Function supplied by the extension with its data
	this.addExtension = function(name, ext_func) {
		var ext;
		if (!(name in extensions)) {
			// Provide private vars/funcs here. Is there a better way to do this?
			if ($.isFunction(ext_func)) {
				ext = ext_func($.extend(canvas.getPrivateMethods(), {
					svgroot: svgroot,
					svgcontent: svgcontent,
					nonce: getCurrentDrawing().getNonce(),
					selectorManager: selectorManager
				}));
			} else {
				ext = ext_func;
			}
			extensions[name] = ext;
			call('extension_added', ext);
		} else {
			console.log('Cannot add extension "' + name + '", an extension by that name already exists.');
		}
	};

// This method rounds the incoming value to the nearest value based on the current_zoom
	var round = this.round = function(val) {
		return parseInt(val*current_zoom, 10)/current_zoom;
	};

// This method sends back an array or a NodeList full of elements that
// intersect the multi-select rubber-band-box on the current_layer only.
//
// We brute-force getIntersectionList for browsers that do not support it (Firefox).
//
// Reference:
// Firefox does not implement getIntersectionList(), see https://bugzilla.mozilla.org/show_bug.cgi?id=501421
	var getIntersectionList = this.getIntersectionList = function(rect) {
		if (rubberBox == null) { return null; }

		var parent = current_group || getCurrentDrawing().getCurrentLayer();

		var rubberBBox;
		if (!rect) {
			rubberBBox = rubberBox.getBBox();
		} else {
			rubberBBox = svgcontent.createSVGRect(rect.x, rect.y, rect.width, rect.height);
		}

		var resultList = null;
		if (typeof(svgroot.getIntersectionList) == 'function') {
			// Offset the bbox of the rubber box by the offset of the svgcontent element.
			//rubberBBox.x += parseInt(svgcontent.getAttribute('x'), 10);
			//rubberBBox.y += parseInt(svgcontent.getAttribute('y'), 10);

            var getCanvasOffset = function()
			{
                var svgcontent = document.getElementById('svgcontent');
                return {x: parseInt(svgcontent.getAttribute('x')), y: parseInt(svgcontent.getAttribute('y'))};
			}

            var tempRect = document.getElementById('temprect_selector');
            if (tempRect == null)
			{
				tempRect = svgCanvas.addSvgElementFromJson({
                    'element': 'rect',
                    'attr': {
                        id:  'temprect_selector',
                        x: (rubberBBox.x + getCanvasOffset().x),
                        y: (rubberBBox.y + getCanvasOffset().y),
                        width: rubberBBox.width,
                        height: rubberBBox.height,
						fill : 'none',
						stroke : 'none',
                    }
                });

                var svgcontent = document.getElementById('svgcontent');
                svgroot.appendChild(tempRect);
			}

			tempRect.setAttribute('x' , rubberBBox.x * svgCanvas.getCanvasScale() + getCanvasOffset().x);
            tempRect.setAttribute('y' , rubberBBox.y * svgCanvas.getCanvasScale() + getCanvasOffset().y);
            tempRect.setAttribute('width' , rubberBBox.width * svgCanvas.getCanvasScale());
            tempRect.setAttribute('height' , rubberBBox.height * svgCanvas.getCanvasScale());

			//console.log(tempRect);
			var tempRectBBox = tempRect.getBBox();

			resultList = svgroot.getIntersectionList(tempRectBBox, parent);

			//tempRect.parentNode.removeChild(tempRect);
		}

		if (resultList == null || typeof(resultList.item) != 'function') {
			resultList = [];

			if (!curBBoxes.length) {
				// Cache all bboxes
				curBBoxes = getVisibleElementsAndBBoxes(parent);
			}
			var i = curBBoxes.length;
			while (i--) {
				if (!rubberBBox.width) {continue;}
				if (svgedit.math.rectsIntersect(rubberBBox, curBBoxes[i].bbox)) {
					resultList.push(curBBoxes[i].elem);
				}
			}
		}

		// addToSelection expects an array, but it's ok to pass a NodeList
		// because using square-bracket notation is allowed:
		// http://www.w3.org/TR/DOM-Level-2-Core/ecma-script-binding.html
		return resultList;
	};

// TODO(codedread): Migrate this into svgutils.js
// Function: getStrokedBBox
// Get the bounding box for one or more stroked and/or transformed elements
//
// Parameters:
// elems - Array with DOM elements to check
//
// Returns:
// A single bounding box object
	getStrokedBBox = this.getStrokedBBox = function(elems) {
		if (!elems) {elems = getVisibleElements();}
		if (!elems.length) {return false;}
		// Make sure the expected BBox is returned if the element is a group
		var getCheckedBBox = function(elem) {
			// TODO: Fix issue with rotated groups. Currently they work
			// fine in FF, but not in other browsers (same problem mentioned
			// in Issue 339 comment #2).

			var bb = svgedit.utilities.getBBox(elem);
			if (!bb) {
				return null;
			}
			var angle = svgedit.utilities.getRotationAngle(elem);

			if ((angle && angle % 90) ||
				svgedit.math.hasMatrixTransform(svgedit.transformlist.getTransformList(elem))) {
				// Accurate way to get BBox of rotated element in Firefox:
				// Put element in group and get its BBox
				var good_bb = false;
				// Get the BBox from the raw path for these elements
				var elemNames = ['ellipse', 'path', 'line', 'polyline', 'polygon'];
				if (elemNames.indexOf(elem.tagName) >= 0) {
					bb = good_bb = canvas.convertToPath(elem, true);
				} else if (elem.tagName == 'rect') {
					// Look for radius
					var rx = elem.getAttribute('rx');
					var ry = elem.getAttribute('ry');
					if (rx || ry) {
						bb = good_bb = canvas.convertToPath(elem, true);
					}
				}

				if (!good_bb) {
					// Must use clone else FF freaks out
					var clone = elem.cloneNode(true);
					var g = document.createElementNS(NS.SVG, 'g');
					var parent = elem.parentNode;
					parent.appendChild(g);
					g.appendChild(clone);
					bb = svgedit.utilities.bboxToObj(g.getBBox());
					parent.removeChild(g);
				}

				// Old method: Works by giving the rotated BBox,
				// this is (unfortunately) what Opera and Safari do
				// natively when getting the BBox of the parent group
//						var angle = angle * Math.PI / 180.0;
//						var rminx = Number.MAX_VALUE, rminy = Number.MAX_VALUE,
//							rmaxx = Number.MIN_VALUE, rmaxy = Number.MIN_VALUE;
//						var cx = round(bb.x + bb.width/2),
//							cy = round(bb.y + bb.height/2);
//						var pts = [ [bb.x - cx, bb.y - cy],
//									[bb.x + bb.width - cx, bb.y - cy],
//									[bb.x + bb.width - cx, bb.y + bb.height - cy],
//									[bb.x - cx, bb.y + bb.height - cy] ];
//						var j = 4;
//						while (j--) {
//							var x = pts[j][0],
//								y = pts[j][1],
//								r = Math.sqrt( x*x + y*y );
//							var theta = Math.atan2(y,x) + angle;
//							x = round(r * Math.cos(theta) + cx);
//							y = round(r * Math.sin(theta) + cy);
//
//							// now set the bbox for the shape after it's been rotated
//							if (x < rminx) rminx = x;
//							if (y < rminy) rminy = y;
//							if (x > rmaxx) rmaxx = x;
//							if (y > rmaxy) rmaxy = y;
//						}
//
//						bb.x = rminx;
//						bb.y = rminy;
//						bb.width = rmaxx - rminx;
//						bb.height = rmaxy - rminy;
			}
			return bb;
		};

		var full_bb;
		$.each(elems, function() {
			if (full_bb) {return;}
			if (!this.parentNode) {return;}
			full_bb = getCheckedBBox(this);
		});

		// This shouldn't ever happen...
		if (full_bb == null) {return null;}

		// full_bb doesn't include the stoke, so this does no good!
//		if (elems.length == 1) return full_bb;

		var max_x = full_bb.x + full_bb.width;
		var max_y = full_bb.y + full_bb.height;
		var min_x = full_bb.x;
		var min_y = full_bb.y;

		// FIXME: same re-creation problem with this function as getCheckedBBox() above
		var getOffset = function(elem) {
			var sw = elem.getAttribute('stroke-width');
			var offset = 0;
			if (elem.getAttribute('stroke') != 'none' && !isNaN(sw)) {
				offset += sw/2;
			}
			return offset;
		};
		var bboxes = [];
		$.each(elems, function(i, elem) {
			var cur_bb = getCheckedBBox(elem);
			if (cur_bb) {
				var offset = getOffset(elem);
				min_x = Math.min(min_x, cur_bb.x - offset);
				min_y = Math.min(min_y, cur_bb.y - offset);
				bboxes.push(cur_bb);
			}
		});

		full_bb.x = min_x;
		full_bb.y = min_y;

		$.each(elems, function(i, elem) {
			var cur_bb = bboxes[i];
			// ensure that elem is really an element node
			if (cur_bb && elem.nodeType == 1) {
				var offset = getOffset(elem);
				max_x = Math.max(max_x, cur_bb.x + cur_bb.width + offset);
				max_y = Math.max(max_y, cur_bb.y + cur_bb.height + offset);
			}
		});

		full_bb.width = max_x - min_x;
		full_bb.height = max_y - min_y;
		return full_bb;
	};

// Function: getVisibleElements
// Get all elements that have a BBox (excludes <defs>, <title>, etc).
// Note that 0-opacity, off-screen etc elements are still considered "visible"
// for this function
//
// Parameters:
// parent - The parent DOM element to search within
//
// Returns:
// An array with all "visible" elements.
	var getVisibleElements = this.getVisibleElements = function(parent) {
		if (!parent) {
			parent = $(svgcontent).children(); // Prevent layers from being included
		}

		var contentElems = [];
		$(parent).children().each(function(i, elem) {
			if (elem.getBBox) {
				contentElems.push(elem);
			}
		});
		return contentElems.reverse();
	};

// Function: getVisibleElementsAndBBoxes
// Get all elements that have a BBox (excludes <defs>, <title>, etc).
// Note that 0-opacity, off-screen etc elements are still considered "visible"
// for this function
//
// Parameters:
// parent - The parent DOM element to search within
//
// Returns:
// An array with objects that include:
// * elem - The element
// * bbox - The element's BBox as retrieved from getStrokedBBox
	var getVisibleElementsAndBBoxes = this.getVisibleElementsAndBBoxes = function(parent) {
		if (!parent) {
			parent = $(svgcontent).children(); // Prevent layers from being included
		}
		var contentElems = [];
		$(parent).children().each(function(i, elem) {
			if (elem.getBBox) {
				contentElems.push({'elem':elem, 'bbox':getStrokedBBox([elem])});
			}
		});
		return contentElems.reverse();
	};

// Function: groupSvgElem
// Wrap an SVG element into a group element, mark the group as 'gsvg'
//
// Parameters:
// elem - SVG element to wrap
	var groupSvgElem = this.groupSvgElem = function(elem) {
		var g = document.createElementNS(NS.SVG, 'g');
		elem.parentNode.replaceChild(g, elem);
		$(g).append(elem).data('gsvg', elem)[0].id = getNextId();
	};

	var makeGroupSvgElem = this.makeGroupSvgElem = function(elem) {
		var g = document.createElementNS(NS.SVG, 'g');
		elem.parentNode.replaceChild(g, elem);
		$(g).append(elem).data('gsvg', elem)[0].id = getNextId();

		return g;
	};

// Function: copyElem
// Create a clone of an element, updating its ID and its children's IDs when needed
//
// Parameters:
// el - DOM element to clone
//
// Returns: The cloned element
	var copyElem = this.copyElem = function(el) {
		// manually create a copy of the element
		var new_el = document.createElementNS(el.namespaceURI, el.nodeName);
		$.each(el.attributes, function(i, attr) {
			if (attr.localName != '-moz-math-font-style') {
				new_el.setAttributeNS(attr.namespaceURI, attr.nodeName, attr.value);
			}
		});
		// set the copied element's new id
		new_el.removeAttribute('id');
		new_el.id = getNextId();

		// Opera's "d" value needs to be reset for Opera/Win/non-EN
		// Also needed for webkit (else does not keep curved segments on clone)
		if (svgedit.browser.isWebkit() && el.nodeName == 'path') {
			var fixed_d = pathActions.convertPath(el);
			new_el.setAttribute('d', fixed_d);
		}

		// now create copies of all children
		$.each(el.childNodes, function(i, child) {
			switch(child.nodeType) {
				case 1: // element node
					new_el.appendChild(copyElem(child));
					break;
				case 3: // text node
					new_el.textContent = child.nodeValue;
					break;
				default:
					break;
			}
		});

		if ($(el).data('gsvg')) {
			$(new_el).data('gsvg', new_el.firstChild);
		} else if ($(el).data('symbol')) {
			var ref = $(el).data('symbol');
			$(new_el).data('ref', ref).data('symbol', ref);
		} else if (new_el.tagName == 'image') {
			preventClickDefault(new_el);
		}
		return new_el;
	};

// Set scope for these functions
	var getId, getNextId;
	var textActions, pathActions;

	(function(c) {

		// Object to contain editor event names and callback functions
		var events = {};

		getId = c.getId = function() { return getCurrentDrawing().getId(); };
		getNextId = c.getNextId = function() { return getCurrentDrawing().getNextId(); };

		// Function: call
		// Run the callback function associated with the given event
		//
		// Parameters:
		// event - String with the event name
		// arg - Argument to pass through to the callback function
		call = c.call = function(event, arg) {
			if (events[event]) {
				return events[event](this, arg);
			}
		};

		// Function: bind
		// Attaches a callback function to an event
		//
		// Parameters:
		// event - String indicating the name of the event
		// f - The callback function to bind to the event
		//
		// Return:
		// The previous event
		c.bind = function(event, f) {
			var old = events[event];
			events[event] = f;
			return old;
		};

	}(canvas));

// Function: canvas.prepareSvg
// Runs the SVG Document through the sanitizer and then updates its paths.
//
// Parameters:
// newDoc - The SVG DOM document
	this.prepareSvg = function(newDoc) {
		this.sanitizeSvg(newDoc.documentElement);

		// convert paths into absolute commands
		var i, path, len,
			paths = newDoc.getElementsByTagNameNS(NS.SVG, 'path');
		for (i = 0, len = paths.length; i < len; ++i) {
			path = paths[i];
			path.setAttribute('d', pathActions.convertPath(path));
			pathActions.fixEnd(path);
		}
	};

// Function: ffClone
// Hack for Firefox bugs where text element features aren't updated or get
// messed up. See issue 136 and issue 137.
// This function clones the element and re-selects it
// TODO: Test for this bug on load and add it to "support" object instead of
// browser sniffing
//
// Parameters:
// elem - The (text) DOM element to clone
	var ffClone = function(elem) {
		if (!svgedit.browser.isGecko()) {return elem;}
		var clone = elem.cloneNode(true);
		elem.parentNode.insertBefore(clone, elem);
		elem.parentNode.removeChild(elem);
		selectorManager.releaseSelector(elem);
		selectedElements[0] = clone;
		selectorManager.requestSelector(clone).showGrips(true);
		return clone;
	};


// this.each is deprecated, if any extension used this it can be recreated by doing this:
// $(canvas.getRootElem()).children().each(...)

// this.each = function(cb) {
//	$(svgroot).children().each(cb);
// };


// Function: setRotationAngle
// Removes any old rotations if present, prepends a new rotation at the
// transformed center
//
// Parameters:
// val - The new rotation angle in degrees
// preventUndo - Boolean indicating whether the action should be undoable or not
	this.setRotationAngle = function(val, preventUndo) {
		// ensure val is the proper type
		val = parseFloat(val);
		var elem = selectedElements[0];
		var oldTransform = elem.getAttribute('transform');
		var bbox = svgedit.utilities.getBBox(elem);
		var cx = bbox.x+bbox.width/2, cy = bbox.y+bbox.height/2;
		var tlist = svgedit.transformlist.getTransformList(elem);

		// only remove the real rotational transform if present (i.e. at index=0)
		if (tlist.numberOfItems > 0) {
			var xform = tlist.getItem(0);
			if (xform.type == 4) {
				tlist.removeItem(0);
			}
		}
		// find R_nc and insert it
		if (val != 0) {
			var center = svgedit.math.transformPoint(cx, cy, svgedit.math.transformListToTransform(tlist).matrix);
			var R_nc = svgroot.createSVGTransform();
			R_nc.setRotate(val, center.x, center.y);
			if (tlist.numberOfItems) {
				tlist.insertItemBefore(R_nc, 0);
			} else {
				tlist.appendItem(R_nc);
			}
		} else if (tlist.numberOfItems == 0) {
			elem.removeAttribute('transform');
		}

		if (!preventUndo) {
			// we need to undo it, then redo it so it can be undo-able! :)
			// TODO: figure out how to make changes to transform list undo-able cross-browser?
			var newTransform = elem.getAttribute('transform');
			if(oldTransform!=null){
                elem.setAttribute('transform', oldTransform);
            }
			changeSelectedAttribute('transform', newTransform, selectedElements);
			call('changed', selectedElements);
		}
		var pointGripContainer = svgedit.utilities.getElem('pathpointgrip_container');
//		if (elem.nodeName == 'path' && pointGripContainer) {
//			pathActions.setPointContainerTransform(elem.getAttribute('transform'));
//		}
		var selector = selectorManager.requestSelector(selectedElements[0]);
		selector.resize(1);
		selector.updateGripCursors(val);
	};
	var updatePathGripSize = this.updatePathGripSize = function()
	{
		// Update control points
        var pointGripContainer = svgedit.utilities.getElem('pathpointgrip_container');

        if (pointGripContainer != null)
		{
            for (var i = 0 ; i < pointGripContainer.childNodes.length ; ++i)
            {
                if (pointGripContainer.childNodes[i].tagName == 'polygon')
                {
                    pointGripContainer.childNodes[i].setAttribute('stroke-width' , 2 / canvasScale);

                    var cxx = parseFloat(pointGripContainer.childNodes[i].getAttribute('cxx'));
                    var cyy = parseFloat(pointGripContainer.childNodes[i].getAttribute('cyy'));
                    var csize = parseFloat(pointGripContainer.childNodes[i].getAttribute('csize')) / canvasScale;

                    var newPoints =  (cxx - csize) + ', ' + cyy + ' ' + (cxx) + ', ' + (cyy - csize) + ' ' +(cxx + csize) + ', ' + cyy + ' ' +(cxx) + ', ' + (cyy + csize);

                    pointGripContainer.childNodes[i].setAttribute('points' , newPoints);
                }
                else if (pointGripContainer.childNodes[i].tagName == 'circle')
                {
                    pointGripContainer.childNodes[i].setAttribute('stroke-width' , 1 / canvasScale);
                    pointGripContainer.childNodes[i].setAttribute('r' , 2 / canvasScale);
                }
                else if (pointGripContainer.childNodes[i].tagName == 'line')
                {
                    pointGripContainer.childNodes[i].setAttribute('stroke-width' , 1 / canvasScale);
                }
            }
		}

		// Update selected rubber
		for (var i = 0; i < selectorManager.selectors.length; ++i)
		{
			for (var j = 0; j < selectorManager.selectors[i].selectorGroup.childNodes.length ; ++j)
			{
				if (selectorManager.selectors[i].selectorGroup.childNodes[j].tagName == 'g')
				{
					for (var k = 0 ; k < selectorManager.selectors[i].selectorGroup.childNodes[j].childNodes.length ; ++k)
					{
						selectorManager.selectors[i].selectorGroup.childNodes[j].childNodes[k].setAttribute('r' , 2 / canvasScale);
						selectorManager.selectors[i].selectorGroup.childNodes[j].childNodes[k].setAttribute('stroke-width' , 1.5 / canvasScale);
					}
				}
				else
				{
					selectorManager.selectors[i].selectorGroup.childNodes[j].setAttribute('stroke-width' , 1 / canvasScale);
					selectorManager.selectors[i].selectorGroup.childNodes[j].setAttribute('stroke-dasharray' , (5 / canvasScale) + ',' + (5 / canvasScale));
				}
			}
		}

		// Update canvas rulers
        var canvasForgeground = selectorManager.canvasForgeground;
        for (var i = 0 ; i < canvasForgeground.childNodes.length ; ++i)
		{
			if (canvasForgeground.childNodes[i].id.indexOf('ruler') >= 0)
			{
                canvasForgeground.childNodes[i].setAttribute('stroke-width' , getRulerWidth());
                canvasForgeground.childNodes[i].setAttribute('stroke-dasharray' , getRulerStyle());
			}
		}

		// Update indicator text
        if (activeIndicator != null)
		{
            activeIndicator.setAttribute('font-size' , activeIndicatorFontSize / svgCanvas.getCanvasScale());
		}
	}

	var getRulerWidth = function()
	{
		return 0.8 / canvasScale;
	}

	var getRulerStyle = function()
	{
		return (10 / canvasScale + ',' + 2 / canvasScale);
	}

	var addCrossRulerX = this.addCrossRulerX = function()
	{
		isAddingRulerX = true;

        addCrossRuler();
	}

    var addCrossRulerY = this.addCrossRulerY = function()
    {
    	isAddingRulerY = true;

        addCrossRuler();
    }

    var deleteSelectedRuler = this.deleteSelectedRuler = function()
	{
		if (selectedRuler != null)
		{
			selectedRuler.parentNode.removeChild(selectedRuler);

			selectedRuler = null;
		}
	}

	var deleteAllRulers = this.deleteAllRulers = function()
	{
        var canvasForgeground = selectorManager.canvasForgeground;

        if (canvasForgeground)
		{
			for (var i = 0 ; i < canvasForgeground.childNodes.length ; ++i)
			{
				if (canvasForgeground.childNodes[i].hasAttribute('crossX'))
				{
					canvasForgeground.removeChild(canvasForgeground.childNodes[i]);
					--i;
				}
			}
		}
	}

	var updateIndicatorInfo = function(_x , _y)
	{
		if (activeIndicator == null)
		{
            activeIndicator = svgCanvas.addSvgElementFromJson({
                'element': 'text',
                'attr': {
                    'id':'overlay_info',
                    'style': 'pointer-events:none' ,
                    'fill': '#ffc733',
					'stroke-width' : 0.1,
					'font-size' : activeIndicatorFontSize / svgCanvas.getCanvasScale(),
                }
            });

            selectorManager.canvasForgeground.appendChild(activeIndicator);
		}

		activeIndicator.setAttribute('x' , _x);
        activeIndicator.setAttribute('y' , _y);
	}

    var addCrossRuler = function()
	{
		var id =  'ruler_' + getNextId();
        activeRuler = svgCanvas.addSvgElementFromJson({
            'element': 'path',
            'attr': {
                'id':id,
                'fill': 'none',
                'stroke': '#22c',
                'stroke-width': getRulerWidth(),
                'stroke-dasharray': getRulerStyle(),
				'crossX' : -10000 ,
				'crossY' : -10000 ,
                'style': 'pointer-events:auto'
            }
        });

        /*
        $('#' + id).mouseenter(function()
        {
            activeRuler = this;

            var menu_items = $('#cmenu_canvas li');
            menu_items['enableContextMenuItems']('#deleteruler');
        });

        $('#' + id).mouseout(function()
        {
            activeRuler = null;

            var menu_items = $('#cmenu_canvas li');
            menu_items['disableContextMenuItems']('#deleteruler');
        });
		*/

        selectorManager.canvasForgeground.appendChild(activeRuler);
	}

	var currentActiveRuler = this.currentActiveRuler = function()
	{
		return activeRuler;
	}

	var hasAnyRulers = this.hasAnyRulers = function()
	{
        var canvasForgeground = selectorManager.canvasForgeground;

        if (canvasForgeground)
		{
			return canvasForgeground.childNodes.length > 0;
		}

		return false;
	}
    this.getTargetRulers = function (x,y)
    {
        var canvasForgeground = selectorManager.canvasForgeground;
        if (canvasForgeground)
        {
           var canvasRulers = canvasForgeground.childNodes;
           var dis = 10;
           var isTrue = false;
           if(canvasRulers.length==1){return false}
            for(var i = 1;i<canvasRulers.length;i++){
                var rulerX = $(canvasRulers[i]).attr("crossX");
                var rulerY = $(canvasRulers[i]).attr("crossY");
                if((rulerY>y-dis&&rulerY<y+dis)||(rulerX>x-dis&&rulerX<x+dis)){
                    return canvasRulers[i];
                    isTrue = true;
                }
            }
            if(isTrue){
                return false;
            }
        }
    }
// Function: recalculateAllSelectedDimensions
// Runs recalculateDimensions on the selected elements,
// adding the changes to a single batch command
	var recalculateAllSelectedDimensions = this.recalculateAllSelectedDimensions = function() {
		var text = (current_resize_mode == 'none' ? 'position' : 'size');
		var batchCmd = new svgedit.history.BatchCommand(text);

		var i = selectedElements.length;
		while (i--) {
			var elem = selectedElements[i];
//			if (svgedit.utilities.getRotationAngle(elem) && !svgedit.math.hasMatrixTransform(getTransformList(elem))) {continue;}
			var cmd = svgedit.recalculate.recalculateDimensions(elem);
			if (cmd) {
				batchCmd.addSubCommand(cmd);
			}
		}

		if (!batchCmd.isEmpty()) {
			addCommandToHistory(batchCmd);
			call('changed', selectedElements);
		}
	};

// this is how we map paths to our preferred relative segment types
	var pathMap = [0, 'z', 'M', 'm', 'L', 'l', 'C', 'c', 'Q', 'q', 'A', 'a',
		'H', 'h', 'V', 'v', 'S', 's', 'T', 't'];

// Debug tool to easily see the current matrix in the browser's console
	var logMatrix = function(m) {
		console.log([m.a, m.b, m.c, m.d, m.e, m.f]);
	};

// Root Current Transformation Matrix in user units
	var root_sctm = null;

// Group: Selection

// Function: clearSelection
// Clears the selection. The 'selected' handler is then called.
// Parameters:
// noCall - Optional boolean that when true does not call the "selected" handler
	var clearSelection = this.clearSelection = function(noCall) {
		if (selectedElements[0] != null) {
			var i, elem,
				len = selectedElements.length;
			for (i = 0; i < len; ++i) {
				elem = selectedElements[i];
				if (elem == null) {break;}
				selectorManager.releaseSelector(elem);
				selectedElements[i] = null;
			}
//		selectedBBoxes[0] = null;
		}
		if (!noCall) {call('selected', selectedElements);}
	};

// TODO: do we need to worry about selectedBBoxes here?


// Function: addToSelection
// Adds a list of elements to the selection. The 'selected' handler is then called.
//
// Parameters:
// elemsToAdd - an array of DOM elements to add to the selection
// showGrips - a boolean flag indicating whether the resize grips should be shown
	var addToSelection = this.addToSelection = function(elemsToAdd, showGrips)
	{
		if (elemsToAdd.length == 0) { return; }

		// if all the object are isolated, then ignore them
		var isolatedNumsTrue = 0;
        var isolatedNumsFalse = 0;

        for (var i = 0 ; i < elemsToAdd.length ; ++i)
		{
			if(elemsToAdd[i]!=null) {
                if (elemsToAdd[i].hasAttribute('isolated')) {
                    if (elemsToAdd[i].getAttribute('isolated') == 'true') {
                        isolatedNumsTrue++;
                    }
                    else {
                        isolatedNumsFalse++;
                    }
                }
            }
		}

        var currentLayer = getCurrentDrawing().getCurrentLayer();
        if (currentLayer['isolatedFlag'] != undefined)
		{
			if (currentLayer['isolatedFlag'] == 'false')
			{
                if(isolatedNumsFalse == elemsToAdd.length)
                {
                    return;
                }
			}
			else
			{
                if(isolatedNumsTrue == 0)
                {
                    return;
                }
			}
		}

		// find the first null in our selectedElements array
		var j = 0;

		while (j < selectedElements.length) {
			if (selectedElements[j] == null) {
				break;
			}
			++j;
		}

		// now add each element consecutively
		var i = elemsToAdd.length;
		while (i--) {
			var elem = elemsToAdd[i];
			if (!elem || !svgedit.utilities.getBBox(elem)) {continue;}

            if (currentLayer['isolatedFlag'] != undefined)
			{
				if (currentLayer['isolatedFlag'] == 'false')
				{
                    if (elem.hasAttribute('isolated') && elem.getAttribute('isolated') == 'false')
                    {
                        continue;
                    }
				}
				else
				{
                    if (elem.hasAttribute('isolated') == false || elem.getAttribute('isolated') == 'false')
                    {
                        continue;
                    }
				}
			}

			if (elem.tagName === 'a' && elem.childNodes.length === 1) {
				// Make "a" element's child be the selected element
				elem = elem.firstChild;
			}

			// if it's not already there, add it
			if (selectedElements.indexOf(elem) == -1) {

                selectedElements[j] = elem;

				// only the first selectedBBoxes element is ever used in the codebase these days
//			if (j == 0) selectedBBoxes[0] = svgedit.utilities.getBBox(elem);
				j++;
				var sel = selectorManager.requestSelector(elem);

				if (selectedElements.length > 1) {
					sel.showGrips(false);
				}
			}
		}
		call('selected', selectedElements);
		if (showGrips || selectedElements.length == 1) {
			if(selectedElements[0]!=null){
                selectorManager.requestSelector(selectedElements[0]).showGrips(true);
            }
		}
		else {
            if(selectedElements[0]!=null){
                selectorManager.requestSelector(selectedElements[0]).showGrips(false);
            }
		}

		// make sure the elements are in the correct order
		// See: http://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-compareDocumentPosition

        selectedElements.sort(function(a, b) {
            if (a && b && a.compareDocumentPosition) {
                return 3 - (b.compareDocumentPosition(a) & 6);
            }
            if (a == null) {
                return 1;
            }
        });

		// Make sure first elements are not null
            while (selectedElements[0] == null) {
                selectedElements.shift(0);
                if(selectedElements.length==0){
					break;
                }
			}

	};

// Function: selectOnly()
// Selects only the given elements, shortcut for clearSelection(); addToSelection()
//
// Parameters:
// elems - an array of DOM elements to be selected
	var selectOnly = this.selectOnly = function(elems, showGrips) {
		clearSelection(true);
		addToSelection(elems, showGrips);
	};

// TODO: could use slice here to make this faster?
// TODO: should the 'selected' handler

// Function: removeFromSelection
// Removes elements from the selection.
//
// Parameters:
// elemsToRemove - an array of elements to remove from selection
	var removeFromSelection = this.removeFromSelection = function(elemsToRemove) {
		if (selectedElements[0] == null) { return; }
		if (elemsToRemove.length == 0) { return; }

		// find every element and remove it from our array copy
		var i,
			j = 0,
			newSelectedItems = [],
			len = selectedElements.length;
		newSelectedItems.length = len;
		for (i = 0; i < len; ++i) {
			var elem = selectedElements[i];
			if (elem) {
				// keep the item
				if (elemsToRemove.indexOf(elem) == -1) {
					newSelectedItems[j] = elem;
					j++;
				} else { // remove the item and its selector
					selectorManager.releaseSelector(elem);
				}
			}
		}
		// the copy becomes the master now
		selectedElements = newSelectedItems;
	};

// Function: selectAllInCurrentLayer
// Clears the selection, then adds all elements in the current layer to the selection.
	this.selectAllInCurrentLayer = function() {
		var current_layer = getCurrentDrawing().getCurrentLayer();
		if (current_layer) {
			current_mode = 'select';
			selectOnly($(current_group || current_layer).children());
		}
	};

// Function: getMouseTarget
// Gets the desired element from a mouse event
//
// Parameters:
// evt - Event object from the mouse event
//
// Returns:
// DOM element we want
	var getIntersectTarget = this.getIntersectTarget = function(evt)
	{
        var getCanvasOffset = function()
        {
            var svgcontent = document.getElementById('svgcontent');
            return {x: parseInt(svgcontent.getAttribute('x')), y: parseInt(svgcontent.getAttribute('y'))};
        }

        var pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, $('#svgcontent g')[0].getScreenCTM().inverse() );
        var size = 1;

        var tempRect = document.getElementById('temprect_intersector');
        if (tempRect == null)
        {
            tempRect = svgCanvas.addSvgElementFromJson({
                'element': 'rect',
                'attr': {
                    id:  'temprect_intersector',
                    x: pt.x,
                    y: pt.y,
                    width: size,
                    height: size,
                    fill : 'none',
                    stroke : 'none',
                }
            });

            var svgcontent = document.getElementById('svgcontent');
            svgroot.appendChild(tempRect);
        }

        tempRect.setAttribute('x' , pt.x * svgCanvas.getCanvasScale() + getCanvasOffset().x);
        tempRect.setAttribute('y' , pt.y * svgCanvas.getCanvasScale() + getCanvasOffset().y);
        tempRect.setAttribute('width' , size * svgCanvas.getCanvasScale());
        tempRect.setAttribute('height' , size * svgCanvas.getCanvasScale());

        //console.log(tempRect);
        var tempRectBBox = tempRect.getBBox();

        var resultList = svgroot.getIntersectionList(tempRectBBox, getCurrentDrawing().getCurrentLayer());

        if (resultList.length == 0)
		{
            return null;
		}
		else 
		{
			// Check all elements
			var epsilon = 1 / svgCanvas.getCanvasScale();

            var mousePathX = 'M' + (pt.x - epsilon) + ',' + pt.y + ' L' + (pt.x + epsilon) + ',' + pt.y;
            var mousePathY = 'M' + (pt.x) + ',' + (pt.y  - epsilon) + ' L' + (pt.x) + ',' + (pt.y + epsilon);

			for (var i = resultList.length - 1 ; i >= 0 ; --i)
			{
                var segPathString = resultList[i].getAttribute('d');

                console.log('======================== obj: ' + resultList[i].id);

                if (segPathString != undefined && segPathString != null)
				{
                    var rt = null;

                    rt = Raphael.pathIntersection(segPathString , mousePathX);
                    if (rt.length > 0)
					{
                        return resultList[i];
					}
					else
					{
						rt = Raphael.pathIntersection(segPathString , mousePathY);
                        if (rt.length > 0)
						{
                            return resultList[i];
						}
						else
						{
                            var fillMode = resultList[i].getAttribute('fill');

                            if (fillMode != undefined && fillMode != 'none' && resultList[i].getAttribute('fill-opacity') != 0)
							{
								if (Raphael.isPointInsidePath(segPathString , pt.x , pt.y))
								{
                                    return resultList[i];
								}
							}

                            pickIgnoreList.push(resultList[i]);
						}
					}
				}
			}

			return null;
        }
	}

	var _getMouseTarget = function(evt)
	{
        pickIgnoreList = [];

        if (current_mode == 'select' || current_mode == 'multiselect')
        {
            // Check all selected elements at first
            var pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, $('#svgcontent g')[0].getScreenCTM().inverse() );

            for (var i = 0 ; i < selectedElements.length ; ++i)
            {
                if (selectedElements[i])
                {
                    var bbox = selectedElements[i].getBBox();

                    if (!(bbox.x > pt.x || (bbox.x + bbox.width) < pt.x ||
                        bbox.y > pt.y || (bbox.y + bbox.height) < pt.y))
                    {
                        return selectedElements[i];
                    }
                }
            }

            // Try to pick new path
            var pickRt = getIntersectTarget(evt);
            if (pickRt != null)
            {
                return pickRt;
            }
        }

        // Normal select mode
        if (evt == null) {
            return null;
        }
        var mouse_target = evt.target;

        for (var i = 0 ; i < pickIgnoreList.length ; ++i)
        {
            if (pickIgnoreList[i] == mouse_target)
            {
                return null;
            }
        }

        // if it was a <use>, Opera and WebKit return the SVGElementInstance
        if (mouse_target.correspondingUseElement) {mouse_target = mouse_target.correspondingUseElement;}

        // for foreign content, go up until we find the foreignObject
        // WebKit browsers set the mouse target to the svgcanvas div
        if ([NS.MATH, NS.HTML].indexOf(mouse_target.namespaceURI) >= 0 &&
            mouse_target.id != 'svgcanvas')
        {
            while (mouse_target.nodeName != 'foreignObject') {
                mouse_target = mouse_target.parentNode;
                if (!mouse_target) {return svgroot;}
            }
        }

        // Get the desired mouse_target with jQuery selector-fu
        // If it's root-like, select the root
        var current_layer = getCurrentDrawing().getCurrentLayer();
        if ([svgroot, container, svgcontent, current_layer].indexOf(mouse_target) >= 0) {
            return svgroot;
        }

        var $target = $(mouse_target);

        // If it's a selection grip, return the grip parent
        if ($target.closest('#selectorParentGroup').length) {
            // While we could instead have just returned mouse_target,
            // this makes it easier to indentify as being a selector grip
            return selectorManager.selectorParentGroup;
        }

        while (mouse_target != null && (mouse_target.parentNode !== (current_group || current_layer)))
        {
            mouse_target = mouse_target.parentNode;
        }

		//
		//	// go up until we hit a child of a layer
		//	while (mouse_target.parentNode.parentNode.tagName == 'g') {
		//		mouse_target = mouse_target.parentNode;
		//	}
				// Webkit bubbles the mouse event all the way up to the div, so we
				// set the mouse_target to the svgroot like the other browsers
		//	if (mouse_target.nodeName.toLowerCase() == 'div') {
		//		mouse_target = svgroot;
		//	}

        return mouse_target;
	}

	var getMagicWandObjects = function(_root , _fill , _fillOpacity , _selectedList)
	{
		if (_root)
		{
			if (_root.tagName == 'path' &&
				((_root.getAttribute('fill-opacity') == _fillOpacity && _fillOpacity == '0') ||
                 (_root.getAttribute('fill-opacity') == _fillOpacity && _root.getAttribute('fill') == _fill)))
			{
                _selectedList.push(_root);
			}
			else
			{
                for (var i = 0 ; i < _root.childNodes.length ; ++i)
                {
                    getMagicWandObjects(_root.childNodes[i] , _fill , _fillOpacity , _selectedList);
                }
			}
		}
	}

	var getMouseTarget = this.getMouseTarget = function(evt)
	{
		var target = _getMouseTarget(evt);

        if ($('#tool_lasso').hasClass('tool_button_current'))
		{
			if (target != null)
			{
				// Filter all objects with same attribute in current layer
				var fill = target.getAttribute('fill');
				var fillOpacity = target.getAttribute('fill-opacity');

				//var stroke = target.getAttribute('stroke');
				//var strokeOpacity = target.getAttribute('stroke-opacity');
				//var strokeWidth = target.getAttribute('stroke-width');

				if (fill != 'none' && fillOpacity != '0')
				{
                    var drawing = svgCanvas.getCurrentDrawing();

                    var newSelectedList = [];
                    getMagicWandObjects(drawing.current_layer , fill , fillOpacity , newSelectedList);

                    if (newSelectedList.length > 0)
					{
						selectOnly(newSelectedList);
					}
				}
			}

			return target;
		}
		else
		{
			if (isDirectToEditPath)
			{
				if (target != null && target.getAttribute('d'))
				{
					setTimeout(function()
					{
						pathActions.toEditMode(target);
					}, 100);
				}

				isDirectToEditPath = false;

				return null;
			}

            return target;
		}
	};

	this.flipElements = function(isVertical)
	{
		var i, xya, c, cx, cy, dx, dy, len, angle, box,
			selected = selectedElements[0],
			shape = svgedit.utilities.getElem(getId());

		if (selected == null)
		{
			return;
		}
		
		console.log(selected);

		var tlist;

		tlist = svgedit.transformlist.getTransformList(selected);
		var hasMatrix = svgedit.math.hasMatrixTransform(tlist);
		box = svgedit.utilities.getBBox(selected);
		var left = box.x, top = box.y, width = box.width, height = box.height;
		dx = (0);
		dy = (0);

		var ts = null,
			tx = 0, ty = 0,
			sy = 1,
			sx = -1;

		tlist.appendItem(svgroot.createSVGTransform());
		tlist.appendItem(svgroot.createSVGTransform());
		tlist.appendItem(svgroot.createSVGTransform());

		// update the transform list with translate,scale,translate
		var translateOrigin = svgroot.createSVGTransform(),
			scale = svgroot.createSVGTransform(),
			translateBack = svgroot.createSVGTransform();

		if (isVertical)
		{
			translateOrigin.setTranslate(-(left), -(top + box.height * 0.5));

			scale.setScale(1.0, -1.0);

			translateBack.setTranslate(left, top + box.height * 0.5);
		}
		else
		{
			translateOrigin.setTranslate(-(left + box.width * 0.5), -(top));

			scale.setScale(-1.0, 1.0);

			translateBack.setTranslate(left+ box.width * 0.5, top);
		}

		{
			var N = tlist.numberOfItems;
			tlist.replaceItem(translateBack, N-3);
			tlist.replaceItem(scale, N-2);
			tlist.replaceItem(translateOrigin, N-1);
		}

		selectorManager.requestSelector(selected).resize(2);

		call('transition', selectedElements);
	};

// Mouse events
	(function() {
		var d_attr = null,
			start_x = null,
			start_y = null,
			r_start_x = null,
			r_start_y = null,
			zoom_start_x = null,
			zoom_start_y = null ,
			init_bbox = {},
			freehand = {
				minx: null,
				miny: null,
				maxx: null,
				maxy: null
			},
			sumDistance = 0,
			controllPoint2 = {x:0, y:0},
			controllPoint1 = {x:0, y:0},
			start = {x:0, y:0},
			end = {x:0, y:0},
			parameter,
			nextParameter,
			bSpline = {x:0, y:0},
			nextPos = {x:0, y:0},
			THRESHOLD_DIST = 0.8,
			STEP_COUNT = 10;

		var getBsplinePoint = function(t) {
			var spline = {x:0, y:0},
				p0 = controllPoint2,
				p1 = controllPoint1,
				p2 = start,
				p3 = end,
				S = 1.0 / 6.0,
				t2 = t * t,
				t3 = t2 * t;

			var m = [
				[-1, 3, -3, 1],
				[3, -6, 3, 0],
				[-3, 0, 3, 0],
				[1, 4, 1, 0]
			];

			spline.x = S * (
					(p0.x * m[0][0] + p1.x * m[0][1] + p2.x * m[0][2] + p3.x * m[0][3] ) * t3 +
					(p0.x * m[1][0] + p1.x * m[1][1] + p2.x * m[1][2] + p3.x * m[1][3] ) * t2 +
					(p0.x * m[2][0] + p1.x * m[2][1] + p2.x * m[2][2] + p3.x * m[2][3] ) * t +
					(p0.x * m[3][0] + p1.x * m[3][1] + p2.x * m[3][2] + p3.x * m[3][3] )
				);
			spline.y = S * (
					(p0.y * m[0][0] + p1.y * m[0][1] + p2.y * m[0][2] + p3.y * m[0][3] ) * t3 +
					(p0.y * m[1][0] + p1.y * m[1][1] + p2.y * m[1][2] + p3.y * m[1][3] ) * t2 +
					(p0.y * m[2][0] + p1.y * m[2][1] + p2.y * m[2][2] + p3.y * m[2][3] ) * t +
					(p0.y * m[3][0] + p1.y * m[3][1] + p2.y * m[3][2] + p3.y * m[3][3] )
				);

			return {
				x:spline.x,
				y:spline.y
			};
		};

		var isModeValidInLockState = function(modeName)
		{
			if (modeName == 'select' ||
				modeName == 'fhellipse' ||
				modeName == 'fhrect' ||
				modeName == 'fhpath' ||
				modeName == 'eraser' ||
				modeName == 'quickselect' ||
				modeName == 'lasso' ||
				modeName == 'image' ||
				modeName == 'square' ||
				modeName == 'rect' ||
				modeName == 'line' ||
				modeName == 'circle' ||
				modeName == 'ellipse' ||
				modeName == 'text' ||
				modeName == 'path' ||
				modeName == 'pathedit' ||
				modeName == 'textedit' ||
				modeName == 'rotate')
			{
				return false;
			}

			return true;
		}

		var isModeOverToSelect = function(modeName)
		{
			return false;

			if (modeName == 'image' ||
				modeName == 'rect' ||
				modeName == 'circle' ||
				modeName == 'ellipse' ||
				modeName == 'square' ||
				modeName == 'fhpath')
			{
				return true;
			}

			return false;
		}

		// - when we are in a create mode, the element is added to the canvas
		// but the action is not recorded until mousing up
		// - when we are in select mode, select the element, remember the position
		// and do nothing else
        var cloneSelect = false;
		var cloneElem = null;
		this.selectedOldElements = null;
        var cloneSelectElem = null;
        var ctrlSelect = false;
        var ctrlSelectElem = null;
        var dix = 0,diy = 0;
        var targetRulers = null;
        var moveRuler = false;
        var isNext = false;
		var mouseDown = function(evt)
		{

			if (canvas.spaceKey || evt.button === 1) {return;}
            cloneSelect = false;
			var right_click = evt.button === 2;

			if (right_click && current_mode == 'path')
			{
				return;
			}
			if (evt.altKey) { // duplicate when dragging
			}

			root_sctm = $('#svgcontent g')[0].getScreenCTM().inverse();

			var pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, root_sctm ),
				mouse_x = pt.x * current_zoom,
				mouse_y = pt.y * current_zoom;
			dix = mouse_x;
			diy = mouse_y;
			evt.preventDefault();
			if (right_click) {
				current_mode = 'select';
				lastClickPoint = pt;
			}
            if(canvas.getTargetRulers(mouse_x,mouse_y ) && (current_mode == 'select'|| current_mode == 'pathedit')){
			    targetRulers = canvas.getTargetRulers(mouse_x,mouse_y);
			    $(targetRulers).attr("stroke","#bf5f00");
			    moveRuler = true;
            }
			// This would seem to be unnecessary...
//		if (['select', 'resize'].indexOf(current_mode) == -1) {
//			setGradient();
//		}

			var x = mouse_x / current_zoom,
				y = mouse_y / current_zoom,
				mouse_target = getMouseTarget(evt);
			if (mouse_target == null)
			{
				return;
			}
            if(right_click){
                var validCounter = 0;
                for (i = 0; i < selectedElements.length; ++i) {
                    if (selectedElements[i] != null)
                    {
                        validCounter++;
                    }
                }
                if(mouse_target==selectedElements[0]&&validCounter==1){
					canvas.selectedOldElements = mouse_target;
					cloneSelect = true;
					cloneElem = canvas.cloneSelectedElements(0,0);
					cloneElem.setAttribute("stroke","#000000");
					cloneElem.setAttribute("stroke-width",1);
					cloneElem.setAttribute("fill-opacity","0");
					cloneElem.setAttribute("stroke-dasharray","none");
					mouse_target = getMouseTarget(evt);
					updateSelectedMove(evt);
				}else{
					return;
				}
            }

			if (mouse_target != null && mouse_target.tagName === 'a' && mouse_target.childNodes.length === 1) {
				mouse_target = mouse_target.firstChild;
			}

			// real_x/y ignores grid-snap value
			var real_x = x;
			r_start_x = start_x = x;
			var real_y = y;
			r_start_y = start_y = y;

            singleMoveFlagDx = Number.MAX_VALUE;
            singleMoveFlagDy = Number.MAX_VALUE;

			if (curConfig.gridSnapping){
				x = svgedit.utilities.snapToGrid(x);
				y = svgedit.utilities.snapToGrid(y);
				start_x = svgedit.utilities.snapToGrid(start_x);
				start_y = svgedit.utilities.snapToGrid(start_y);
			}

			// if it is a selector grip, then it must be a single element selected,
			// set the mouse_target to that and update the mode to rotate/resize

			if (mouse_target == selectorManager.selectorParentGroup && selectedElements[0] != null) {
				var grip = evt.target;
				var griptype = elData(grip, 'type');
				// rotating
				if (griptype == 'rotate') {
					current_mode = 'rotate';
				}
				// resizing
				else if (griptype == 'resize') {
					current_mode = 'resize';
					if(evt.altKey){
						isNext = true;
					}else{
						isNext = false;
					}
					current_resize_mode = elData(grip, 'dir');
				}
				mouse_target = selectedElements[0];
			}

			startTransform = mouse_target.getAttribute('transform');
			var i, stroke_w,
				tlist = svgedit.transformlist.getTransformList(mouse_target);

			// Pre-locked check
			if (isModeValidInLockState(current_mode) == false)
			{
				if (getCurrentDrawing().getCurrentLayerLocked())
				{
					current_mode = '__lockedlayer__';
				}
			}

			switch (current_mode) {
				case 'select':
					started = true;
					current_resize_mode = 'none';
					// if (right_click) {started = tr;}
					if (mouse_target != svgroot) {
						// if this element is not yet selected, clear selection and select it
						if (selectedElements.indexOf(mouse_target) == -1) {
							// only clear selection if shift is not pressed (otherwise, add
							// element to selection)
							if (!evt.shiftKey) {
								// No need to do the call here as it will be done on addToSelection
								clearSelection(true);
							}
							mouse_target = getGroup(mouse_target);
							addToSelection([mouse_target]);
							justSelected = mouse_target;
							pathActions.clear();
						}
						// else if it's a path, go into pathedit mode in mouseup

						if (!right_click) {
							// insert a dummy transform so if the element(s) are moved it will have
							// a transform to use for its translate
                            for (i = 0; i < selectedElements.length; ++i) {
								if (selectedElements[i] == null) {continue;}
								var slist = svgedit.transformlist.getTransformList(selectedElements[i]);
								if (slist.numberOfItems) {
									slist.insertItemBefore(svgroot.createSVGTransform(), 0);
								} else {
									slist.appendItem(svgroot.createSVGTransform());
								}
							}
						}
					} else if (!right_click){
						clearSelection();
						current_mode = 'multiselect';
						if (rubberBox == null) {
							rubberBox = selectorManager.getRubberBandBox(getCurrentDrawing().getCurrentLayerColor());
						}
						r_start_x *= current_zoom;
						r_start_y *= current_zoom;
//					console.log('p',[evt.pageX, evt.pageY]);
//					console.log('c',[evt.clientX, evt.clientY]);
//					console.log('o',[evt.offsetX, evt.offsetY]);
//					console.log('s',[start_x, start_y]);

						svgedit.utilities.assignAttributes(rubberBox, {
							'x': r_start_x,
							'y': r_start_y,
							'width': 0,
							'height': 0,
							'display': 'inline'
						}, 100);
					}
					break;

				case 'colorpicker':
					started = true;


					svgCanvas.bitmapUtils.pickColor(real_x , real_y);//(mouse_x / canvasScale + 640) + canvasX , (mouse_y / canvasScale + 480) + canvasY);

					break;

				case 'zoom':
					started = true;

					zoom_start_x = r_start_x;
					zoom_start_y = r_start_y;

					/*
					 if (rubberBox == null) {
					 rubberBox = selectorManager.getRubberBandBox(getCurrentDrawing().getCurrentLayerColor());
					 }
					 svgedit.utilities.assignAttributes(rubberBox, {
					 'x': real_x * current_zoom,
					 'y': real_x * current_zoom,
					 'width': 0,
					 'height': 0,
					 'display': 'inline'
					 }, 100);
					 */

					break;
				case 'resize':
					started = true;
					start_x = x;
					start_y = y;

					// Getting the BBox from the selection box, since we know we
					// want to orient around it
					init_bbox = svgedit.utilities.getBBox($('#selectedBox0')[0]);
					var bb = {};
					$.each(init_bbox, function(key, val) {
						bb[key] = val/current_zoom;
					});
					init_bbox = bb;

					// append three dummy transforms to the tlist so that
					// we can translate,scale,translate in mousemove
					var pos = svgedit.utilities.getRotationAngle(mouse_target) ? 1 : 0;
                    if(evt.ctrlKey){
                        if((current_resize_mode.indexOf('n')==-1 && current_resize_mode.indexOf('s')==-1)
                            ||(current_resize_mode.indexOf('e')==-1 && current_resize_mode.indexOf('w')==-1)){
                            ctrlSelectElem = selectedElements[0];
                            cloneSelectElem = canvas.cloneSelectedElements(0,0);
                            $(cloneSelectElem).attr({"stroke":"#007fff","fill-opacity":0});
                            ctrlSelect = true;
                            tlist = svgedit.transformlist.getTransformList(cloneSelectElem);
                            pos = svgedit.utilities.getRotationAngle(cloneSelectElem) ? 1 : 0;
                        }
                    }
					if (svgedit.math.hasMatrixTransform(tlist)) {
						tlist.insertItemBefore(svgroot.createSVGTransform(), pos);
						tlist.insertItemBefore(svgroot.createSVGTransform(), pos);
						tlist.insertItemBefore(svgroot.createSVGTransform(), pos);
					} else {
						tlist.appendItem(svgroot.createSVGTransform());
						tlist.appendItem(svgroot.createSVGTransform());
						tlist.appendItem(svgroot.createSVGTransform());

						if (svgedit.browser.supportsNonScalingStroke()) {
							// Handle crash for newer Chrome and Safari 6 (Mobile and Desktop):
							// https://code.google.com/p/svg-edit/issues/detail?id=904
							// Chromium issue: https://code.google.com/p/chromium/issues/detail?id=114625
							// TODO: Remove this workaround once vendor fixes the issue
							var isWebkit = svgedit.browser.isWebkit();

							if (isWebkit) {
								var delayedStroke = function(ele) {
									var _stroke = ele.getAttributeNS(null, 'stroke');
									ele.removeAttributeNS(null, 'stroke');
									//Re-apply stroke after delay. Anything higher than 1 seems to cause flicker
									setTimeout(function() { ele.setAttributeNS(null, 'stroke', _stroke); }, 0);
								};
							}
							mouse_target.style.vectorEffect = 'non-scaling-stroke';
							if (isWebkit) {delayedStroke(mouse_target);}

							var all = mouse_target.getElementsByTagName('*'),
								len = all.length;
							for (i = 0; i < len; i++) {
								all[i].style.vectorEffect = 'non-scaling-stroke';
								if (isWebkit) {delayedStroke(all[i]);}
							}
						}
					}
					break;
				case 'fhellipse':
				case 'fhrect':
				case 'fhpath':
					start.x = real_x;
					start.y = real_y;
					started = true;
					d_attr = real_x + ',' + real_y + ' ';
					stroke_w = cur_shape.stroke_width == 0 ? 1 : cur_shape.stroke_width;
					addSvgElementFromJson({
						element: 'polyline',
						curStyles: true,
						attr: {
							points: d_attr,
							id: getNextId(),
							fill: 'none',
							opacity: cur_shape.opacity,
							'stroke-linecap': 'round',
							style: 'pointer-events:none'
						}
					});
					freehand.minx = real_x;
					freehand.maxx = real_x;
					freehand.miny = real_y;
					freehand.maxy = real_y;
					break;

				case 'eraser':
					started = true;
					bitmapUtils.beginErase(real_x , real_y);
					break;

				case 'quickselect':
					started = true;
					bitmapUtils.beginSelect(real_x , real_y);
					break;

				case 'lasso':
					started = true;
					bitmapUtils.beginLasso(real_x , real_y);
					break;

				case 'image':
					started = true;
					var newImage = addSvgElementFromJson({
						element: 'image',
						attr: {
							x: x,
							y: y,
							width: 0,
							height: 0,
							id: getNextId(),
							opacity: cur_shape.opacity,
							style: 'pointer-events:inherit;cursor:default'
						}
					});
					setHref(newImage, last_good_img_url);
					preventClickDefault(newImage);

					console.log("============================================= mouse down with new image");

					break;
				case 'square':
				// FIXME: once we create the rect, we lose information that this was a square
				// (for resizing purposes this could be important)
				case 'rect':
					started = true;
					start_x = x;
					start_y = y;
					addSvgElementFromJson({
						element: 'rect',
						curStyles: true,
						attr: {
							x: x,
							y: y,
							width: 0,
							height: 0,
							id: getNextId(),
							opacity: cur_shape.opacity
						}
					});
					break;
				case 'line':
					started = true;
					stroke_w = cur_shape.stroke_width == 0 ? 1 : cur_shape.stroke_width;
					addSvgElementFromJson({
						element: 'line',
						curStyles: true,
						attr: {
							x1: x,
							y1: y,
							x2: x,
							y2: y,
							id: getNextId(),
							stroke: cur_shape.stroke,
							'stroke-width': stroke_w,
							'stroke-dasharray': cur_shape.stroke_dasharray,
							'stroke-linejoin': cur_shape.stroke_linejoin,
							'stroke-linecap': cur_shape.stroke_linecap,
							'stroke-opacity': cur_shape.stroke_opacity,
							fill: 'none',
							opacity: cur_shape.opacity,
							style: 'pointer-events:none'
						}
					});
					break;
				case 'circle':
					started = true;
					addSvgElementFromJson({
						element: 'circle',
						curStyles: true,
						attr: {
							cx: x,
							cy: y,
							r: 0,
							id: getNextId(),
							opacity: cur_shape.opacity
						}
					});
					break;
				case 'ellipse':
					started = true;
					addSvgElementFromJson({
						element: 'ellipse',
						curStyles: true,
						attr: {
							cx: x,
							cy: y,
							rx: 0,
							ry: 0,
							id: getNextId(),
							opacity: cur_shape.opacity
						}
					});
					break;
				case 'text':
					started = true;
					var newText = addSvgElementFromJson({
						element: 'text',
						curStyles: true,
						attr: {
							x: x,
							y: y,
							id: getNextId(),
							fill: cur_text.fill,
							'stroke-width': cur_text.stroke_width,
							'font-size': cur_text.font_size,
							'font-family': cur_text.font_family,
							'text-anchor': 'middle',
							'xml:space': 'preserve',
							opacity: cur_shape.opacity
						}
					});
//					newText.textContent = 'text';
					break;
				case 'path':
				// Fall through
				case 'pathedit':
					start_x *= current_zoom;
					start_y *= current_zoom;
					pathActions.mouseDown(evt, mouse_target, start_x, start_y);
					started = true;
					break;
				case 'textedit':
					start_x *= current_zoom;
					start_y *= current_zoom;
					textActions.mouseDown(evt, mouse_target, start_x, start_y);
					started = true;
					break;
				case 'rotate':
					started = true;
					// we are starting an undoable change (a drag-rotation)
					canvas.undoMgr.beginUndoableChange('transform', selectedElements);
					break;

				case '__lockedlayer__':
				{
					console.log('================================ layer is locked');
				}
					break;

				default:
					// This could occur in an extension
					break;
			}

			var ext_result = runExtensions('mouseDown', {
				event: evt,
				start_x: start_x,
				start_y: start_y,
				selectedElements: selectedElements
			}, true);

			$.each(ext_result, function(i, r) {
				if (r && r.started) {
					started = true;
				}
			});
		};

        function getGroup(elem) {
            var nowElem = elem;
            var hasLast = false;
            var parents = $(nowElem).parents('g');
            for(var i = 0;i<parents.length;i++){
                if(parents[i].getAttribute('class')=='group'){
                    hasLast = true;
                    nowElem = parents[i];
                    break;
                }
            }
            if(hasLast){
                return getGroup(nowElem);
            }else{
                return nowElem
            }
        }

        var updateSelectedRuler = function(evt)
        {
            var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, root_sctm);

            var menu_items = $('#cmenu_canvas li');
            menu_items[(!svgCanvas.hasAnyRulers() ? 'dis' : 'en') + 'ableContextMenuItems']('#deleteallrulers');

            selectedRuler = null;
            menu_items['disableContextMenuItems']('#deleteruler');
            var checkThreshold = 10;
            var canvasForgeground = selectorManager.canvasForgeground;
            for (var i = 0 ; i < canvasForgeground.childNodes.length ; ++i)
            {
                var x = parseFloat(canvasForgeground.childNodes[i].getAttribute('crossX'));
                var y = parseFloat(canvasForgeground.childNodes[i].getAttribute('crossY'));

                if (Math.abs(x - pt.x) < checkThreshold ||
					Math.abs(y - pt.y) < checkThreshold)
				{
                    menu_items['enableContextMenuItems']('#deleteruler');
					selectedRuler = canvasForgeground.childNodes[i];
					break;
				}
            }
        }
		var updateSelectedPast = function (evt)
		{
            var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, root_sctm);
            var menu_items = $('#cmenu_canvas li');
            menu_items['enableContextMenuItems']('#pastStroke');
            menu_items['enableContextMenuItems']('#pastStrokeColor');
            menu_items['enableContextMenuItems']('#move');
            menu_items['enableContextMenuItems']('#past');
            menu_items['enableContextMenuItems']('#pastAll');
            menu_items['enableContextMenuItems']('#pastFill');
            var checkThreshold = 10;
            var canvasForgeground = selectorManager.canvasForgeground;
            for (var i = 0 ; i < canvasForgeground.childNodes.length ; ++i)
            {
                var x = parseFloat(canvasForgeground.childNodes[i].getAttribute('crossX'));
                var y = parseFloat(canvasForgeground.childNodes[i].getAttribute('crossY'));

                if (Math.abs(x - pt.x) < checkThreshold ||
                    Math.abs(y - pt.y) < checkThreshold)
                {
                    selectedRuler = canvasForgeground.childNodes[i];
                    break;
                }
            }
        }
        var updateSelectedMove = function (evt)
		{
            var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, root_sctm);
            var menu_items = $('#cmenu_canvas li');
            menu_items['enableContextMenuItems']('#pastAll');
            menu_items['enableContextMenuItems']('#pastFill');
            menu_items['disableContextMenuItems']('#pastStroke');
            menu_items['disableContextMenuItems']('#pastStrokeColor');
            menu_items['disableContextMenuItems']('#pastAll');
            menu_items['disableContextMenuItems']('#pastFill');
            var checkThreshold = 10;
            var canvasForgeground = selectorManager.canvasForgeground;
            for (var i = 0 ; i < canvasForgeground.childNodes.length ; ++i)
            {
                var x = parseFloat(canvasForgeground.childNodes[i].getAttribute('crossX'));
                var y = parseFloat(canvasForgeground.childNodes[i].getAttribute('crossY'));

                if (Math.abs(x - pt.x) < checkThreshold ||
                    Math.abs(y - pt.y) < checkThreshold)
                {
                    selectedRuler = canvasForgeground.childNodes[i];
                    break;
                }
            }
        }
		this.updateCanvasOverlay = function(evt)
		{
			if (curConfig.showcrossruler)
			{
				if (evt != undefined)
				{
					var pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, $('#svgcontent g')[0].getScreenCTM().inverse() );
					lastRulerX = pt.x;// * current_zoom;
					lastRulerY = pt.y;// * current_zoom;

					//console.log('============================aaaaaaaaaaaaaaaaaaaaa: ' + lastRulerX + ", " + lastRulerY);
				}

				var x = lastRulerX * current_zoom;
				var y = lastRulerY * current_zoom;

				console.log('============================aaaaaaaaaaaaaaaaaaaaa: ' + lastRulerX + ", " + lastRulerY + ", " + current_zoom);

				var crossRulerLines = selectorManager.getCrossRulerLines();

				var dstr = 'M' + (-1500) + ',' + y +
					' L' + (x) + ',' + (y) +
					' L' + (x) + ',' + (-1500);// +' z';

				svgedit.utilities.assignAttributes(crossRulerLines, {
					d: dstr,
					'stroke' : 'red',
					'display': 'inline'
				});
			}
			else
			{
				var crossRulerLines = selectorManager.getCrossRulerLines();

				svgedit.utilities.assignAttributes(crossRulerLines, {
					d: '',
					'display': 'none'
				});
			}

			if (current_mode == 'eraser') {
				if (evt != undefined) {
					var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, $('#svgcontent g')[0].getScreenCTM().inverse());
					lastRulerX = pt.x;// * current_zoom;
					lastRulerY = pt.y;// * current_zoom;
				}

				var x = lastRulerX * current_zoom;
				var y = lastRulerY * current_zoom;

				var size = bitmapUtils.getEraserSize() / canvasScale;

				if (bitmapUtils.isSquareEraser())
				{
					svgedit.utilities.assignAttributes(selectorManager.erasorCursorCircle, {
						d: '',
						'display': 'none'
					});

					svgedit.utilities.assignAttributes(selectorManager.erasorCursorRect, {
						'x' : x - size * 0.5 ,
						'y' : y - size * 0.5,
						'width' : size,
						'height' : size,
						'stroke' : '#000000',
						'stroke-width' : 0.5 / svgCanvas.getCanvasScale(),
						//'fill' : '#000000',
						'display': 'inline'
					});
				}
				else
				{
					svgedit.utilities.assignAttributes(selectorManager.erasorCursorRect, {
						d: '',
						'display': 'none'
					});

					svgedit.utilities.assignAttributes(selectorManager.erasorCursorCircle, {
						'cx' : x ,
						'cy' : y,
						'r' : size * 0.5,
						'stroke' : '#000000',
                        'stroke-width' : 0.5 / svgCanvas.getCanvasScale(),
                        //'fill' : '#000000',
						'display': 'inline'
					});
				}
			}
			else
			{
				svgedit.utilities.assignAttributes(selectorManager.erasorCursorRect, {
					d: '',
					'display': 'none'
				});

				svgedit.utilities.assignAttributes(selectorManager.erasorCursorCircle, {
					d: '',
					'display': 'none'
				});
			}

            if ((isAddingRulerX || isAddingRulerY) && activeRuler != null)
            {
                if (evt != undefined)
                {
                    var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, $('#svgcontent g')[0].getScreenCTM().inverse());
                    var mouse_target = evt.target;
                    var rluer_x = pt.x,ruler_y = pt.y,rulerD = 8;
                    var bbox = svgedit.utilities.getBBox(mouse_target);
                    var targetRulerX = $(activeRuler).attr("crossX");
                    var targetRulerY = $(activeRuler).attr("crossY");
                    var dis = 10;
                    var rulers = $(activeRuler).siblings('path');
                    var xNum=0,yNum=0,xArr=[],yArr=[];
                    for(var i = 0;i<rulers.length;i++){
                        var nowX = $(rulers[i]).attr("crossX");
                        var nowY = $(rulers[i]).attr("crossY");
						if (nowY == '-10000' && nowX != '-10000') {
							yNum++;
							xArr.push(rulers[i])
						}
						if (nowX == '-10000' && nowY != '-10000') {
							xNum++;
							yArr.push(rulers[i])
						}
                    }
                    if(mouse_target.tagName =='path'&&mouse_target.id.indexOf('ruler')==-1){
                        var real_x = pt.x, real_y = pt.y,checkDis = 10;
                        var xDir = 'M' + (real_x - checkDis) + ',' + real_y + ' L' + (real_x + checkDis) + ',' + real_y;
                        var yDir = 'M' + (real_x) + ',' + (real_y - checkDis) + ' L' + (real_x) + ',' + (real_y + checkDis);

                        var segPathString = $(mouse_target).attr('d');
                        var rt = Raphael.pathIntersection(segPathString, xDir);
                        if (rt.length == 0) {
                            rt = Raphael.pathIntersection(segPathString, yDir);
                        }
                        if (rt[0] != null) {
                            var points = Raphael.parsePathString(segPathString);
                            var text = "边缘";
                            for(var i = 0;i<points.length-1;i++){
                                var point = points[i];
                                var nextPoint = points[i+1]
                                var newStrStart = 'M'+point[point.length-2]+','+ point[point.length-1];
                                for(var j = 0;j<nextPoint.length;j++){
                                    newStrStart +=" "+nextPoint[j];
                                }
                                var len = Raphael.getTotalLength(newStrStart);
                                var center = Raphael.getPointAtLength(newStrStart,len/2);
                                if((pt.x<center.x+dis)&&(pt.x>center.x-dis)&&(pt.y<center.y+dis)&&(pt.y>center.y-dis)){
                                    text = '中点';
                                    if (targetRulerX == '-10000'){
                                        ruler_y = center.y;
                                    }else if(targetRulerY == '-10000'){
                                        rluer_x = center.x;
                                    }
                                }
                            }
                            for(var i = 0;i<points.length;i++){
                                var point = points[i];
                                var x =point[point.length-2];
                                var y =point[point.length-1];
                                if((pt.x<x+dis)&&(pt.x>x-dis)&&(pt.y<y+dis)&&(pt.y>y-dis)){
                                    text = '节点';
                                    if (targetRulerX == '-10000'){
                                        ruler_y = y;
                                    }else if(targetRulerY == '-10000'){
                                        rluer_x = x;
                                    }
                                }
                            }
                            svgCanvas.showIndicatorInfo(pt.x , pt.y ,text);
                        }else{
                            if((pt.x<(bbox.x+bbox.width/2+dis)&& pt.x>(bbox.x+bbox.width/2-dis))&&(pt.y<(bbox.y+bbox.height/2+dis)&& pt.y>(bbox.y+bbox.height/2-dis))){
                                svgCanvas.showIndicatorInfo(pt.x , pt.y ,'中心');
                                if (targetRulerX == '-10000'){
                                    ruler_y = bbox.y+bbox.height/2;
                                }else if(targetRulerY == '-10000'){
                                    rluer_x = bbox.x+bbox.width/2;
                                }
                            }
                        }
                    }
                    function sortfunctionX(a, b){
                        return ($(a).attr('crossX') - $(b).attr('crossX')); //causes an array to be sorted numerically and ascending
                    }
                    xArr.sort(sortfunctionX);
                    function sortfunctionY(a, b){
                        return ($(a).attr('crossY') - $(b).attr('crossY')); //causes an array to be sorted numerically and ascending
                    }
                    yArr.sort(sortfunctionY);
                    if(xNum>1&&yNum>0) {
                        var centerY;
                        if (targetRulerX == '-10000'){
                            for(var i=0;i<yArr.length-1;i++){
                                centerY = (Number(yArr[i].getAttribute('crossY'))+Number(yArr[i+1].getAttribute('crossY')))/2;
                                if(Math.abs(centerY-pt.y)<dis){
                                    ruler_y = centerY;
                                    svgCanvas.showIndicatorInfo(xArr[0].getAttribute('crossX'),centerY , '中点');
                                }
                            }
                        }
                    }
                    if(yNum>1&&xNum>0) {
                        var centerX;
                        if (targetRulerY == '-10000'){
                            for(var i=0;i<xArr.length-1;i++){
                                centerX = (Number(xArr[i].getAttribute('crossX'))+Number(xArr[i+1].getAttribute('crossX')))/2;
                                if(Math.abs(centerX-rluer_x)<dis){
                                    rluer_x= centerX;
                                    svgCanvas.showIndicatorInfo(centerX,yArr[0].getAttribute('crossY') , '中点');
                                }
                            }
                        }
                    }
					if (isAddingRulerX)
					{
                        activeRuler.setAttribute('d' , 'M -10000,' + ruler_y + ' L 10000 ,' + ruler_y);
                        activeRuler.setAttribute('crossY' , ruler_y);
                        // activeRuler.setAttribute('style' , 'cursor:s-resize');
                    }
					else
					{
                        activeRuler.setAttribute('d' , 'M' + rluer_x + ',-10000 ' + ' L' + rluer_x + ' ,10000');
                        activeRuler.setAttribute('crossX' , rluer_x);
                        // activeRuler.setAttribute('style' , 'cursor:w-resize');
                    }
                }
            }

            // Show indicator information
            //var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, $('#svgcontent g')[0].getScreenCTM().inverse());
            //svgCanvas.showIndicatorInfo(pt.x + ',' + pt.y);

			if (activeIndicator != null && activeIndicator.textContent != '')
			{
                var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, $('#svgcontent g')[0].getScreenCTM().inverse());
                updateIndicatorInfo(pt.x , pt.y);
			}
		}

		// in this function we do not record any state changes yet (but we do update
		// any elements that are still being created, moved or resized on the canvas)
		var mouseMove = function(evt)
		{
            svgCanvas.showIndicatorInfo(0 , 0 , '');
            updateCanvasOverlay(evt);
			if (!started)
			{
                var pt = svgedit.math.transformPoint( evt.pageX, evt.pageY,  $('#svgcontent g')[0].getScreenCTM().inverse());
                if(canvas.getTargetRulers(pt.x,pt.y )){
                    var targetR = canvas.getTargetRulers(pt.x,pt.y);
                	if(current_mode == 'select'||current_mode == 'pathedit'){
                        var targetRulX = $(targetR).attr("crossX");
                        var targetRulY = $(targetR).attr("crossY");
                        if(targetRulX == "-10000"){
                            targetR.setAttribute('style' , 'cursor:s-resize');
                        }
                        if(targetRulY == "-10000"){
                            targetR.setAttribute('style' , 'cursor:w-resize');
                        }
					}else{
                        var canvasForgeground = selectorManager.canvasForgeground;
                        if (canvasForgeground) {
                            var canvasRulers = canvasForgeground.childNodes;
                            if (canvasRulers.length > 1) {
                                for (var i = 1; i < canvasRulers.length; i++) {
                                    canvasRulers[i].setAttribute('style', 'cursor:default;pointer-events:none;');
                                }
                            }
                        }
					}
                }

            /*    if(mouse_target == selectedElements[0]){
                    var targetName = $(mouse_target)[0].tagName;
                    if(mouse_target!=svgroot&&targetName!="rect") {
                        var real_x = pt.x, real_y = pt.y,checkDis = 10;
                        var xDir = 'M' + (real_x - checkDis) + ',' + real_y + ' L' + (real_x + checkDis) + ',' + real_y;
                        var yDir = 'M' + (real_x) + ',' + (real_y - checkDis) + ' L' + (real_x) + ',' + (real_y + checkDis);

                        var segPathString = $(mouse_target).attr('d');
                        var rt = Raphael.pathIntersection(segPathString, xDir);
                        if (rt.length == 0) {
                            rt = Raphael.pathIntersection(segPathString, yDir);
                        }
                        if (rt[0] != null) {
                            var text = "边缘",dis = 5;
                            var points = Raphael.parsePathString(segPathString);
                            for(var i = 0;i<points.length-1;i++){
                            	var point = points[i];
                            	var nextPoint = points[i+1]
                            	var newStrStart = 'M'+point[point.length-2]+','+ point[point.length-1];
                                for(var j = 0;j<nextPoint.length;j++){
                            		newStrStart +=" "+nextPoint[j];
								}
								var len = Raphael.getTotalLength(newStrStart);
								var center = Raphael.getPointAtLength(newStrStart,len/2);
                                if((pt.x<center.x+dis)&&(pt.x>center.x-dis)&&(pt.y<center.y+dis)&&(pt.y>center.y-dis)){
                                    text = "中点";
                                }
                            }
                            for(var i = 0;i<points.length;i++){
                                var point = points[i];
                                var x =point[point.length-2];
                                var y =point[point.length-1];
                                if((pt.x<x+dis)&&(pt.x>x-dis)&&(pt.y<y+dis)&&(pt.y>y-dis)){
                                    text = "节点";
                                }
							}
                            svgCanvas.showIndicatorInfo(pt.x , pt.y ,text);
                        }else{
                            if((pt.x<(bbox.x+bbox.width/2+5)&& pt.x>(bbox.x+bbox.width/2-5))&&(pt.y<(bbox.y+bbox.height/2+5)&& pt.y>(bbox.y+bbox.height/2-5))){
                                svgCanvas.showIndicatorInfo(pt.x , pt.y , '中心');
                            }else {
                                svgCanvas.showIndicatorInfo(pt.x , pt.y , '');
                            }
                        }
                    }
                }else{
                    svgCanvas.showIndicatorInfo(pt.x , pt.y , '');
                }*/
                if(targetRulers&&moveRuler&&(current_mode == 'select'||current_mode == 'pathedit')){
                    var mouse_target = evt.target;
                    var targetRulerX = $(targetRulers).attr("crossX");
                    var targetRulerY = $(targetRulers).attr("crossY");
                    var rluer_x = pt.x,ruler_y = pt.y;
                    var bbox = svgedit.utilities.getBBox(mouse_target);
                    /*if(elements.length>1){
                        for(var i=1;i<elements.length;i++){
                            var bbox = svgedit.utilities.getBBox(elements[i]);
                            if(Math.abs(rluer_x-bbox.x)<rulerD){
                                rluer_x = bbox.x;
                            }
                            if(Math.abs(ruler_y-bbox.y)<rulerD){
                                ruler_y = bbox.y;
                            }
                        }
                    }*/
                    var dis = 10;
                    var rulers = $(targetRulers).siblings('path');
                    var xNum=0,yNum=0,xArr=[],yArr=[];
                    for(var i = 0;i<rulers.length;i++){
                        var nowX = $(rulers[i]).attr("crossX");
                        var nowY = $(rulers[i]).attr("crossY");
						if (nowY == '-10000' && nowX != '-10000') {
							yNum++;
							xArr.push(rulers[i])
						}
						if (nowX == '-10000' && nowY != '-10000') {
							xNum++;
							yArr.push(rulers[i])
						}
                    }
                    if(mouse_target.tagName =='path'&&mouse_target.id.indexOf('ruler')==-1){
                        var real_x = pt.x, real_y = pt.y,checkDis = 10;
                        var xDir = 'M' + (real_x - checkDis) + ',' + real_y + ' L' + (real_x + checkDis) + ',' + real_y;
                        var yDir = 'M' + (real_x) + ',' + (real_y - checkDis) + ' L' + (real_x) + ',' + (real_y + checkDis);

                        var segPathString = $(mouse_target).attr('d');
                        var rt = Raphael.pathIntersection(segPathString, xDir);
                        if (rt.length == 0) {
                            rt = Raphael.pathIntersection(segPathString, yDir);
                        }
                        if (rt[0] != null) {
                            var points = Raphael.parsePathString(segPathString);
                            var text = "边缘";
                            for(var i = 0;i<points.length-1;i++){
                                var point = points[i];
                                var nextPoint = points[i+1]
                                var newStrStart = 'M'+point[point.length-2]+','+ point[point.length-1];
                                for(var j = 0;j<nextPoint.length;j++){
                                    newStrStart +=" "+nextPoint[j];
                                }
                                var len = Raphael.getTotalLength(newStrStart);
                                var center = Raphael.getPointAtLength(newStrStart,len/2);
                                if((pt.x<center.x+dis)&&(pt.x>center.x-dis)&&(pt.y<center.y+dis)&&(pt.y>center.y-dis)){
                                    text = '中点';
                                    if (targetRulerX == '-10000'){
                                        ruler_y = center.y;
                                    }else if(targetRulerY == '-10000'){
                                        rluer_x = center.x;
                                    }
                                }
                            }
                            for(var i = 0;i<points.length;i++){
                                var point = points[i];
                                var x =point[point.length-2];
                                var y =point[point.length-1];
                                if((pt.x<x+dis)&&(pt.x>x-dis)&&(pt.y<y+dis)&&(pt.y>y-dis)){
                                    text = '节点';
                                    if (targetRulerX == '-10000'){
                                        ruler_y = y;
                                    }else if(targetRulerY == '-10000'){
                                        rluer_x = x;
                                    }
                                }
                            }
                            svgCanvas.showIndicatorInfo(pt.x , pt.y ,text);
                        }else{
                            if((pt.x<(bbox.x+bbox.width/2+dis)&& pt.x>(bbox.x+bbox.width/2-dis))&&(pt.y<(bbox.y+bbox.height/2+dis)&& pt.y>(bbox.y+bbox.height/2-dis))){
                                svgCanvas.showIndicatorInfo(pt.x , pt.y ,'中心');
                                if (targetRulerX == '-10000'){
                                    ruler_y = bbox.y+bbox.height/2;
                                }else if(targetRulerY == '-10000'){
                                    rluer_x = bbox.x+bbox.width/2;
                                }
                            }
                        }
                    }
                    function sortfunctionX(a, b){
                        return ($(a).attr('crossX') - $(b).attr('crossX')); //causes an array to be sorted numerically and ascending
                    }
                    xArr.sort(sortfunctionX);
                    function sortfunctionY(a, b){
                        return ($(a).attr('crossY') - $(b).attr('crossY')); //causes an array to be sorted numerically and ascending
                    }
                    yArr.sort(sortfunctionY);
                    if(xNum>1&&yNum>0) {
                        var centerY;
                        if (targetRulerX == '-10000'){
                            for(var i=0;i<yArr.length-1;i++){
                                centerY = (Number(yArr[i].getAttribute('crossY'))+Number(yArr[i+1].getAttribute('crossY')))/2;
                                if(Math.abs(centerY-ruler_y)<dis){
                                    ruler_y = centerY;
									svgCanvas.showIndicatorInfo(xArr[0].getAttribute('crossX'),centerY , '中点');
                                }
                            }
                        }
                    }
                    if(yNum>1&&xNum>0) {
                        var centerX;
                        if (targetRulerY == '-10000'){
                            for(var i=0;i<xArr.length-1;i++){
                                centerX = (Number(xArr[i].getAttribute('crossX'))+Number(xArr[i+1].getAttribute('crossX')))/2;
                                if(Math.abs(centerX-rluer_x)<dis){
                                    rluer_x= centerX;
                                    svgCanvas.showIndicatorInfo(centerX,yArr[0].getAttribute('crossY') , '中点');
                                }
                            }
                        }
                    }
                    if(targetRulerY == "-10000"){
                        targetRulers.setAttribute('d' , 'M' + rluer_x + ',-10000 ' + ' L' + rluer_x + ' ,10000');
                        targetRulers.setAttribute('crossX' , rluer_x);
                    }
                    if(targetRulerX == "-10000"){
                        targetRulers.setAttribute('d' , 'M -10000,' + ruler_y + ' L 10000 ,' + ruler_y);
                        targetRulers.setAttribute('crossY' , ruler_y);
                    }
                }
                if ( current_mode == 'path')
				{
					/***************************************************************/

                    var overlappedPath = pathActions.getOverlapedPath(pt.x , pt.y);
                    if (overlappedPath != null)
                    {
                        svgCanvas.showIndicatorInfo(pt.x , pt.y , '锚点');
                    }else if(canvas.getTargetRulers(pt.x , pt.y)){
                    	var targetR  = canvas.getTargetRulers(pt.x , pt.y);
                        var targetRulerX = $(targetR).attr("crossX");
                        var targetRulerY = $(targetR).attr("crossY");
                        var targetStr = targetR.getAttribute('d');
                        var dis = 10;
                    	if(pt.x-targetRulerX<dis){
                            svgCanvas.showIndicatorInfo(pt.x , pt.y , '边缘点');
                        }
                        if(pt.y-targetRulerY<dis){
                            svgCanvas.showIndicatorInfo(pt.x , pt.y , '边缘点');
                        }
                        var canvasForgeground = selectorManager.canvasForgeground
                        var rulers = canvasForgeground.childNodes;
                        var xNum=0,yNum=0,xArr=[],yArr=[];
                        for(var i = 0;i<rulers.length;i++){
                            var nowX = $(rulers[i]).attr("crossX");
                            var nowY = $(rulers[i]).attr("crossY");
                            if(rulers[i].tagName=='path'&&targetStr!=rulers[i].getAttribute('d')) {
                                if(targetRulerX=='-10000'&&nowY==targetRulerX){
                                    if (Math.abs(targetRulerY - pt.y) < dis && Math.abs(nowX - pt.x) < dis) {
                                        svgCanvas.showIndicatorInfo(pt.x, pt.y, '交集');
                                    }
                                } else if (targetRulerY == '-10000' && nowX == targetRulerY) {
                                    if (Math.abs(targetRulerX - pt.x) < dis && Math.abs(nowY - pt.y) < dis) {
                                        svgCanvas.showIndicatorInfo(pt.x, pt.y, '交集');
                                    }
                                }
                                if (nowY == '-10000' && nowX != '-10000') {
                                    yNum++;
                                    xArr.push(rulers[i])
                                }
                                if (nowX == '-10000' && nowY != '-10000') {
                                    xNum++;
                                    yArr.push(rulers[i])
                                }
                            }
                        }
                        if(xNum>1&&yNum>0) {
                            var centerY;
                            if (targetRulerY == '-10000'){
                                function sortfunction(a, b){
                                    return ($(a).attr('crossY') - $(b).attr('crossY')); //causes an array to be sorted numerically and ascending
                                }
                                yArr.sort(sortfunction);
                                for(var i=0;i<yArr.length-1;i++){
                                    centerY = (Number(yArr[i].getAttribute('crossY'))+Number(yArr[i+1].getAttribute('crossY')))/2;
                                    if(Math.abs(targetRulerX-pt.x)<dis&&Math.abs(centerY-pt.y)<dis){
                                        svgCanvas.showIndicatorInfo(pt.x , pt.y , '中点');
                                    }
                                }
                            }
                        }
                        if(yNum>1&&xNum>0) {
                            var centerX;
                            if (targetRulerX == '-10000'){
                                function sortfunction(a, b){
                                    return ($(a).attr('crossX') - $(b).attr('crossX')); //causes an array to be sorted numerically and ascending
                                }
                                xArr.sort(sortfunction);
                                for(var i=0;i<xArr.length-1;i++){
                                    centerX = (Number(xArr[i].getAttribute('crossX'))+Number(xArr[i+1].getAttribute('crossX')))/2;
                                    if(Math.abs(centerX-pt.x)<dis&&Math.abs(targetRulerY-pt.y)<dis){
                                        svgCanvas.showIndicatorInfo(pt.x , pt.y , '中点');
                                    }
                                }
                            }
                        }
					}
				}

                return;
			}
            svgCanvas.showIndicatorInfo(0 , 0 , '');

            if (evt.button === 1 || canvas.spaceKey) {return;}

			var i, xya, c, cx, cy, dx, dy, len, angle, box,
				selected = selectedElements[0],
				pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, root_sctm ),
				mouse_x = pt.x * current_zoom,
				mouse_y = pt.y * current_zoom,
				shape = svgedit.utilities.getElem(getId());

			var real_x = mouse_x / current_zoom;
			x = real_x;
			var real_y = mouse_y / current_zoom;
			y = real_y;

			if (curConfig.gridSnapping){
				x = svgedit.utilities.snapToGrid(x);
				y = svgedit.utilities.snapToGrid(y);
			}

			evt.preventDefault();
			var tlist;
			switch (current_mode) {
				case 'select':
					// we temporarily use a translate on the element(s) being dragged
					// this transform is removed upon mousing up and the element is
					// relocated to the new location
					if (selectedElements[0] !== null) {
						dx = x - start_x;
						dy = y - start_y;

						/*
						if (evt.ctrlKey)
						{
							if (singleMoveFlagDx == Number.MAX_VALUE)
							{
								singleMoveFlagDx = dx;
							}

							dx = singleMoveFlagDx;
						}
						else
						{
                            singleMoveFlagDx = Number.MAX_VALUE
						}
						*/

                        if (evt.shiftKey)
                        {
                        	if (singleMoveFlagDx == Number.MAX_VALUE && singleMoveFlagDy == Number.MAX_VALUE)
							{
								if (Math.abs(dx) > Math.abs(dy) > 0)
								{
                                    singleMoveFlagDy = dy;
								}
								else if (Math.abs(dy) > Math.abs(dx) > 0)
								{
                                    singleMoveFlagDx = dx;
								}
							}

							/*
                            if (singleMoveFlagDx == Number.MAX_VALUE)
                            {
                                singleMoveFlagDx = dx;
                            }

                            dx = singleMoveFlagDx;

                            if (singleMoveFlagDy == Number.MAX_VALUE)
                            {
                                singleMoveFlagDy = dy;
                            }

                            dy = singleMoveFlagDy;
                            */

							if (singleMoveFlagDx != Number.MAX_VALUE)
							{
								dx = singleMoveFlagDx;
							}

							if (singleMoveFlagDy != Number.MAX_VALUE)
							{
								dy = singleMoveFlagDy;
							}
                        }
                        else
                        {
                            singleMoveFlagDx = Number.MAX_VALUE;
                            singleMoveFlagDy = Number.MAX_VALUE;
                        }

						if (curConfig.gridSnapping){
							dx = svgedit.utilities.snapToGrid(dx);
							dy = svgedit.utilities.snapToGrid(dy);
						}

						if (evt.shiftKey) {
							xya = svgedit.math.snapToAngle(start_x, start_y, x, y);
							x = xya.x;
							y = xya.y;
						}

						if (dx != 0 || dy != 0) {
							len = selectedElements.length;
							for (i = 0; i < len; ++i) {
								selected = selectedElements[i];
								if (selected == null) {break;}
//							if (i==0) {
//								var box = svgedit.utilities.getBBox(selected);
//									selectedBBoxes[i].x = box.x + dx;
//									selectedBBoxes[i].y = box.y + dy;
//							}

								// update the dummy transform in our transform list
								// to be a translate
								var xform = svgroot.createSVGTransform();
								tlist = svgedit.transformlist.getTransformList(selected);
								// Note that if Webkit and there's no ID for this
								// element, the dummy transform may have gotten lost.
								// This results in unexpected behaviour
								canvas.moveX = dx;
                                canvas.moveY = dy;
								xform.setTranslate(dx, dy);
								if (tlist.numberOfItems) {
									tlist.replaceItem(xform, 0);
								} else {
									tlist.appendItem(xform);
								}

								// update our internal bbox that we're tracking while dragging
								selectorManager.requestSelector(selected).resize(2);
							}

							call('transition', selectedElements);
						}
					}

					break;
				case 'multiselect':
					real_x *= current_zoom;
					real_y *= current_zoom;
					svgedit.utilities.assignAttributes(rubberBox, {
						'x': Math.min(r_start_x, real_x),
						'y': Math.min(r_start_y, real_y),
						'width': Math.abs(real_x - r_start_x),
						'height': Math.abs(real_y - r_start_y)
					}, 100);

					// for each selected:
					// - if newList contains selected, do nothing
					// - if newList doesn't contain selected, remove it from selected
					// - for any newList that was not in selectedElements, add it to selected
					var elemsToRemove = selectedElements.slice(), elemsToAdd = [],
						newList = getIntersectionList();

					// For every element in the intersection, add if not present in selectedElements.
					len = newList.length;
					for (i = 0; i < len; ++i) {
						var intElem = newList[i];
                        intElem = getGroup(intElem);
						if(intElem.tagName == 'g'&&intElem.getAttribute('class')=='group' ){
                            if (selectedElements.indexOf(intElem) == -1) {
                                elemsToAdd.push(intElem);
                            }
						}else{
                            if (selectedElements.indexOf(intElem) == -1) {
                                elemsToAdd.push(intElem);
                            }
						}
						// Found an element that was not selected before, so we should add it.

						// Found an element that was already selected, so we shouldn't remove it.
						var foundInd = elemsToRemove.indexOf(intElem);
						if (foundInd != -1) {
							elemsToRemove.splice(foundInd, 1)
						}
					}

					if (elemsToRemove.length > 0) {
						canvas.removeFromSelection(elemsToRemove);
					}

					if (elemsToAdd.length > 0) {
						canvas.addToSelection(elemsToAdd);
					}

					break;
				case 'resize':
					// we track the resize bounding box and translate/scale the selected element
					// while the mouse is down, when mouse goes up, we use this to recalculate
					// the shape's coordinates
                    if(ctrlSelect){
                        selected = cloneSelectElem;
                    }
					tlist = svgedit.transformlist.getTransformList(selected);
					var hasMatrix = svgedit.math.hasMatrixTransform(tlist);
					box = hasMatrix ? init_bbox : svgedit.utilities.getBBox(selected);
					var left = box.x, top = box.y, width = box.width,
						height = box.height;
					dx = (x-start_x);
					dy = (y-start_y);

                    if(evt.altKey){
                        var center_x = left+box.width/2,center_y = top+box.height/2,r = 0,disx,Rwidth = box.width,Rheight = box.height;
                        var minLength = Math.min(Rwidth,Rheight);
                        switch (minLength){
                            case Rwidth:
                                if (current_resize_mode == 'ne') {
                                    disx = pt.x -center_x;
                                    r = -(disx - Rwidth/2);
                                }
                                if (current_resize_mode == 'se') {
                                    disx = pt.x -center_x;
                                    r = Rwidth/2 -disx;
                                }
                                if (current_resize_mode == 'nw'||current_resize_mode == 'sw') {
                                    disx = center_x - pt.x;
                                    r = Rwidth/2 -disx;
                                }
                                r = r>Rwidth/2 ? Rwidth/2:r;
                                if(r <0){
                                    r = 0
                                }
                                break;
                            case Rheight:
                                if (current_resize_mode == 'ne'||current_resize_mode == 'nw' ) {
                                    disx =center_y - pt.y  ;
                                    r = -(disx - Rheight/2);
                                }
                                if (current_resize_mode == 'se'||current_resize_mode == 'sw'){
                                    disx = pt.y-center_y;
                                    r = Rheight/2 -disx;

                                }
                                r = r>Rheight/2?Rheight/2:r;
                                if(r<0){
                                    r = 0;
                                }
                                break;
                            default:return -1;
                        }
                        canvas.setRectRadius(r);
                        break;
                    }else if(isNext == true){break;}
                    if (curConfig.gridSnapping) {
                        dx = svgedit.utilities.snapToGrid(dx);
                        dy = svgedit.utilities.snapToGrid(dy);
                        height = svgedit.utilities.snapToGrid(height);
                        width = svgedit.utilities.snapToGrid(width);
                    }

                    // if rotated, adjust the dx,dy values
                    angle = svgedit.utilities.getRotationAngle(selected);
                    if (angle) {
                        var r = Math.sqrt( dx*dx + dy*dy ),
                            theta = Math.atan2(dy, dx) - angle * Math.PI / 180.0;
                        dx = r * Math.cos(theta);
                        dy = r * Math.sin(theta);
                    }

                    // if not stretching in y direction, set dy to 0
                    // if not stretching in x direction, set dx to 0
                    if (current_resize_mode.indexOf('n')==-1 && current_resize_mode.indexOf('s')==-1) {
                        dy = 0;
                    }
                    if (current_resize_mode.indexOf('e')==-1 && current_resize_mode.indexOf('w')==-1) {
                        dx = 0;
                    }

                    var ts = null,
                        tx = 0, ty = 0,sy = 1,sx = 1;
                    if(ctrlSelect&&evt.ctrlKey){
                            var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, $('#svgcontent g')[0].getScreenCTM().inverse());
                            sx = Math.ceil((pt.x - dix) / width) ? Math.ceil((pt.x - dix) / width) : 1;
                            sy = Math.ceil((pt.y - diy) / height) ? Math.ceil((pt.y - diy) / height) : 1;
                            if (current_resize_mode=="s" || current_resize_mode == "n") {
                                sx = 1;
                            }
                            if (current_resize_mode == "e"||current_resize_mode == "w") {
                                sy = 1;

                            }
                    }else{
                        sy = height ? (height+dy)/height : 1;
                        sx = width ? (width+dx)/width : 1;
                    }
                    if(ctrlSelect&&current_resize_mode =="n"){
                        ty = height;
                        sy = Math.ceil((pt.y - diy) / height) ? -Math.ceil((pt.y - diy) / height) : 1;
                    }
                    if(ctrlSelect&&current_resize_mode =="w"){
                        tx=width;
                        sx = Math.ceil((pt.x - dix) / width) ? -Math.ceil((pt.x - dix) / width) : 1;
                    }
                    // if we are dragging on the north side, then adjust the scale factor and ty
                    if (!ctrlSelect&&current_resize_mode.indexOf('n') >= 0) {
                        sy = height ? (height-dy)/height : 1;
                        ty = height;
                    }
                    // if we dragging on the east side, then adjust the scale factor and tx
                    if (!ctrlSelect&&current_resize_mode.indexOf('w') >= 0) {
                        sx = width ? (width-dx)/width : 1;
                        tx = width;
                    }

                    // update the transform list with translate,scale,translate
                    var translateOrigin = svgroot.createSVGTransform(),
                        scale = svgroot.createSVGTransform(),
                        translateBack = svgroot.createSVGTransform();

					//console.log(svgroot.createSVGTransform());

					if (curConfig.gridSnapping) {
						left = svgedit.utilities.snapToGrid(left);
						tx = svgedit.utilities.snapToGrid(tx);
						top = svgedit.utilities.snapToGrid(top);
						ty = svgedit.utilities.snapToGrid(ty);
					}

					translateOrigin.setTranslate(-(left+tx), -(top+ty));

					if (evt.shiftKey || curConfig.uniformscale) {
						if (sx == 1) {sx = sy;}
						else {sy = sx;}
					}
					scale.setScale(sx, sy);

					translateBack.setTranslate(left+tx, top+ty);
					if (hasMatrix) {
						var diff = angle ? 1 : 0;
						tlist.replaceItem(translateOrigin, 2+diff);
						tlist.replaceItem(scale, 1+diff);
						tlist.replaceItem(translateBack, Number(diff));
					} else {
						var N = tlist.numberOfItems;
						tlist.replaceItem(translateBack, N-3);
						tlist.replaceItem(scale, N-2);
						tlist.replaceItem(translateOrigin, N-1);
					}
                    if(!ctrlSelect){
                        selectorManager.requestSelector(selected).resize(2);
                    }

					call('transition', selectedElements);

					console.log('=========================== resize');

					break;
				case 'zoom':
					real_x *= current_zoom;
					real_y *= current_zoom;

					/*
					 svgedit.utilities.assignAttributes(rubberBox, {
					 'x': Math.min(r_start_x*current_zoom, real_x),
					 'y': Math.min(r_start_y*current_zoom, real_y),
					 'width': (real_x - r_start_x*current_zoom),
					 'height': (real_y - r_start_y*current_zoom)
					 }, 100);
					 */

					var factor = evt.shiftKey;// ? 0.5 : 2;
					call('zoomed', {
						'evt' : evt,
						'x': zoom_start_x,
						'y': zoom_start_y,
						'width': (real_x - r_start_x),
						'height': (real_y - r_start_y),
						'factor': factor
					});

					r_start_x = real_x;
					r_start_y = real_y;

					break;

				case 'colorpicker':
					console.log('=================== color picking');
					break;
				case 'text':
					svgedit.utilities.assignAttributes(shape,{
						'x': x,
						'y': y
					}, 1000);
					break;
				case 'line':
					if (curConfig.gridSnapping) {
						x = svgedit.utilities.snapToGrid(x);
						y = svgedit.utilities.snapToGrid(y);
					}

					var x2 = x;
					var y2 = y;

					if (evt.shiftKey) {
						xya = svgedit.math.snapToAngle(start_x, start_y, x2, y2);
						x2 = xya.x;
						y2 = xya.y;
					}

					shape.setAttributeNS(null, 'x2', x2);
					shape.setAttributeNS(null, 'y2', y2);
					break;
				case 'foreignObject':
				// fall through
				case 'square':
				// fall through
				case 'rect':
				// fall through
				case 'image':
					var newP = pathActions.getadsorption(x,y);
					x = newP.x;
					y = newP.y;
					var square = (current_mode == 'square') || evt.shiftKey,
						w = Math.abs(x - start_x),
						h = Math.abs(y - start_y),
						new_x, new_y;
					if (square) {
						w = h = Math.max(w, h);
						new_x = start_x < x ? start_x : start_x - w;
						new_y = start_y < y ? start_y : start_y - h;
					} else {
						new_x = Math.min(start_x, x);
						new_y = Math.min(start_y, y);
					}

					if (curConfig.gridSnapping) {
						w = svgedit.utilities.snapToGrid(w);
						h = svgedit.utilities.snapToGrid(h);
						new_x = svgedit.utilities.snapToGrid(new_x);
						new_y = svgedit.utilities.snapToGrid(new_y);
					}

					svgedit.utilities.assignAttributes(shape,{
						'width': w,
						'height': h,
						'x': new_x,
						'y': new_y
					},1000);

					break;
				case 'circle':
					c = $(shape).attr(['cx', 'cy']);
					cx = c.cx;
					cy = c.cy;
					var rad = Math.sqrt( (x-cx)*(x-cx) + (y-cy)*(y-cy) );
					if (curConfig.gridSnapping) {
						rad = svgedit.utilities.snapToGrid(rad);
					}
					shape.setAttributeNS(null, 'r', rad);
					break;
				case 'ellipse':
                    var newP = pathActions.getadsorption(x,y);
                    x = newP.x;
                    y = newP.y;
					c = $(shape).attr(['cx', 'cy']);
					cx = c.cx;
					cy = c.cy;
					if (curConfig.gridSnapping) {
						x = svgedit.utilities.snapToGrid(x);
						cx = svgedit.utilities.snapToGrid(cx);
						y = svgedit.utilities.snapToGrid(y);
						cy = svgedit.utilities.snapToGrid(cy);
					}
					shape.setAttributeNS(null, 'rx', Math.abs(x - cx) );
					var ry = Math.abs(evt.shiftKey?(x - cx):(y - cy));
					shape.setAttributeNS(null, 'ry', ry );
					break;
				case 'fhellipse':
				case 'fhrect':
					freehand.minx = Math.min(real_x, freehand.minx);
					freehand.maxx = Math.max(real_x, freehand.maxx);
					freehand.miny = Math.min(real_y, freehand.miny);
					freehand.maxy = Math.max(real_y, freehand.maxy);
				// break; missing on purpose
				case 'fhpath':
//				d_attr += + real_x + ',' + real_y + ' ';
//				shape.setAttributeNS(null, 'points', d_attr);
					end.x = real_x; end.y = real_y;
					if (controllPoint2.x && controllPoint2.y) {
						for (i = 0; i < STEP_COUNT - 1; i++) {
							parameter = i / STEP_COUNT;
							nextParameter = (i + 1) / STEP_COUNT;
							bSpline = getBsplinePoint(nextParameter);
							nextPos = bSpline;
							bSpline = getBsplinePoint(parameter);
							sumDistance += Math.sqrt((nextPos.x - bSpline.x) * (nextPos.x - bSpline.x) + (nextPos.y - bSpline.y) * (nextPos.y - bSpline.y));
							if (sumDistance > THRESHOLD_DIST) {
								d_attr += + bSpline.x + ',' + bSpline.y + ' ';
								shape.setAttributeNS(null, 'points', d_attr);
								sumDistance -= THRESHOLD_DIST;
							}
						}
					}
					controllPoint2 = {x:controllPoint1.x, y:controllPoint1.y};
					controllPoint1 = {x:start.x, y:start.y};
					start = {x:end.x, y:end.y};
					break;

				case 'eraser':
					bitmapUtils.updateErase(real_x , real_y);

					console.log('================================================ eraser 1');
					//*/
					break;

				case 'quickselect':
					bitmapUtils.updateSelect(real_x , real_y);

					break;

				case 'lasso':
					bitmapUtils.updateLasso(real_x , real_y);
					break;
				// update path stretch line coordinates
				case 'path':
				// fall through
				case 'pathedit':
					x *= current_zoom;
					y *= current_zoom;

					if (curConfig.gridSnapping) {
						x = svgedit.utilities.snapToGrid(x);
						y = svgedit.utilities.snapToGrid(y);
						start_x = svgedit.utilities.snapToGrid(start_x);
						start_y = svgedit.utilities.snapToGrid(start_y);
					}
					if (evt.shiftKey) {
						var path = svgedit.path.path;
						var x1, y1;
						if (path) {
							x1 = path.dragging?path.dragging[0]:start_x;
							y1 = path.dragging?path.dragging[1]:start_y;
						} else {
							x1 = start_x;
							y1 = start_y;
						}
						xya = svgedit.math.snapToAngle(x1, y1, x, y);
						x = xya.x;
						y = xya.y;
					}

					if (rubberBox && rubberBox.getAttribute('display') !== 'none') {
						real_x *= current_zoom;
						real_y *= current_zoom;
						svgedit.utilities.assignAttributes(rubberBox, {
							'x': Math.min(r_start_x*current_zoom, real_x),
							'y': Math.min(r_start_y*current_zoom, real_y),
							'width': Math.abs(real_x - r_start_x*current_zoom),
							'height': Math.abs(real_y - r_start_y*current_zoom)
						},100);
					}
					pathActions.mouseMove(x, y , evt);

					break;
				case 'textedit':
					x *= current_zoom;
					y *= current_zoom;
//					if (rubberBox && rubberBox.getAttribute('display') != 'none') {
//						svgedit.utilities.assignAttributes(rubberBox, {
//							'x': Math.min(start_x,x),
//							'y': Math.min(start_y,y),
//							'width': Math.abs(x-start_x),
//							'height': Math.abs(y-start_y)
//						},100);
//					}

					textActions.mouseMove(mouse_x, mouse_y);

					break;
				case 'rotate':
					box = svgedit.utilities.getBBox(selected);
					cx = box.x + box.width/2;
					cy = box.y + box.height/2;
					var m = svgedit.math.getMatrix(selected),
						center = svgedit.math.transformPoint(cx, cy, m);
					cx = center.x;
					cy = center.y;
					angle = ((Math.atan2(cy-y, cx-x) * (180/Math.PI))-90) % 360;
					if (curConfig.gridSnapping) {
						angle = svgedit.utilities.snapToGrid(angle);
					}
					if (evt.shiftKey) { // restrict rotations to nice angles (WRS)
						var snap = 45;
						angle= Math.round(angle/snap)*snap;
					}

					canvas.setRotationAngle(angle<-180?(360+angle):angle, true);
					call('transition', selectedElements);
					break;
				default:
					break;
			}

			runExtensions('mouseMove', {
				event: evt,
				mouse_x: mouse_x,
				mouse_y: mouse_y,
				selected: selected
			});

		}; // mouseMove()

		// - in create mode, the element's opacity is set properly, we create an InsertElementCommand
		// and store it on the Undo stack
		// - in move/resize mode, the element's attributes which were affected by the move/resize are
		// identified, a ChangeElementCommand is created and stored on the stack for those attrs
		// this is done in when we recalculate the selected dimensions()
        this.moveX = 0;
        this.moveY = 0;
        this.thisElem = null;
		var mouseUp = function(evt)
        {
            isAddingRulerX = false;
            isAddingRulerY = false;
            if(moveRuler){
                targetRulers.setAttribute("stroke","#22c");
            }
            targetRulers = null;
            moveRuler = false;
            if ( evt.button == 2)
			{
                updateSelectedPast(evt);
				if(cloneSelect&&cloneElem){
                    var childs = $(cloneElem).parent().children();
                    var pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, $('#svgcontent g')[0].getScreenCTM().inverse() );
                    canvas.deleteCloneElements(cloneElem);
                    var isTargetObj = false;

                    for (var i = 0 ; i < childs.length ; ++i)
                    {
                    	if(childs[i]==null){break;}
                    	if($(childs[i])[0].tagName =="title"){childs.splice(i,1);}
                        var real_x = pt.x, real_y = pt.y,checkDis = 10;
                        var xDir = 'M' + (real_x - checkDis) + ',' + real_y + ' L' + (real_x + checkDis) + ',' + real_y;
                        var yDir = 'M' + (real_x) + ',' + (real_y - checkDis) + ' L' + (real_x) + ',' + (real_y + checkDis);
                        var segPathString = $(childs[i]).attr('d');
                        var rt = Raphael.pathIntersection(segPathString, xDir);
                        if (rt.length == 0) {
                            rt = Raphael.pathIntersection(segPathString, yDir);
                        }
                        if (rt[0] != null) {
							isTargetObj = true;
							canvas.thisElem = childs[i];
							break;
						}
                    }
                    if(isTargetObj){
                        updateSelectedPast(evt);
                    }else{
                        updateSelectedMove(evt);
					}
				}
				updateSelectedRuler(evt)
			}

			if (evt.button === 2)
			{
				return;
			}
			var tempJustSelected = justSelected;
			justSelected = null;
			if (!started) {return;}
			var pt = svgedit.math.transformPoint(evt.pageX, evt.pageY, root_sctm),
				mouse_x = pt.x * current_zoom,
				mouse_y = pt.y * current_zoom,
				x = mouse_x / current_zoom,
				y = mouse_y / current_zoom,
				element = svgedit.utilities.getElem(getId()),
				keep = false;

			var real_x = x;
			var real_y = y;



			// TODO: Make true when in multi-unit mode
			var useUnit = false; // (curConfig.baseUnit !== 'px');
			started = false;
			var attrs, t;
			switch (current_mode) {
				// intentionally fall-through to select here
				case 'resize':
				    if(ctrlSelect&&ctrlSelectElem!=null){
				        var stroke = $(ctrlSelectElem).attr("stroke");
				        canvas.deleteCloneElements(ctrlSelectElem);
				        $(cloneSelectElem).attr({"stroke":stroke,"fill-opacity":1});
				        selectOnly([cloneSelectElem])
                        ctrlSelect = false;
				        ctrlSelectElem = null;
                    }
				case 'multiselect':
					if (rubberBox != null) {
						rubberBox.setAttribute('display', 'none');
						curBBoxes = [];
					}
					current_mode = 'select';
				case 'select':
					if (selectedElements[0] != null) {
						// if we only have one selected element
						if (selectedElements[1] == null) {
							// set our current stroke/fill properties to the element's
							var selected = selectedElements[0];
							switch ( selected.tagName ) {
								case 'g':
								case 'use':
								case 'image':
								case 'foreignObject':
									break;
								default:
									/*cur_properties.fill = selected.getAttribute('fill');
									cur_properties.fill_opacity = selected.getAttribute('fill-opacity');
									cur_properties.stroke = selected.getAttribute('stroke');
									cur_properties.stroke_opacity = selected.getAttribute('stroke-opacity');
									cur_properties.stroke_width = selected.getAttribute('stroke-width');
									cur_properties.stroke_dasharray = selected.getAttribute('stroke-dasharray');
									cur_properties.stroke_linejoin = selected.getAttribute('stroke-linejoin');
									cur_properties.stroke_linecap = selected.getAttribute('stroke-linecap');*/
							}

							if (selected.tagName == 'text') {
								cur_text.font_size = selected.getAttribute('font-size');
								cur_text.font_family = selected.getAttribute('font-family');
							}
							selectorManager.requestSelector(selected).showGrips(true);

							// This shouldn't be necessary as it was done on mouseDown...
//							call('selected', [selected]);
						}
						// always recalculate dimensions to strip off stray identity transforms
						recalculateAllSelectedDimensions();

						/******************************************************************/
						var i = selectedElements.length;
						while (i--) {
							var elem = selectedElements[i];
							if (elem != null && elem.tagName == 'image')
							{
								if (curConfig.fixedaspect)
								{
									elem.setAttribute('preserveAspectRatio' , 'none');
								}
								else
								{
									elem.removeAttribute('preserveAspectRatio');
								}
							}
						}

						// if it was being dragged/resized
						if (real_x != r_start_x || real_y != r_start_y) {
							var i, len = selectedElements.length;
							for (i = 0; i < len; ++i) {
								if (selectedElements[i] == null) {break;}
								if (!selectedElements[i].firstChild) {
									// Not needed for groups (incorrectly resizes elems), possibly not needed at all?
									selectorManager.requestSelector(selectedElements[i]).resize(3);
								}
							}
						}
						// no change in position/size, so maybe we should move to pathedit
						else {
							t = evt.target;
							if (selectedElements[0].nodeName === 'path' && selectedElements[1] == null) {
								pathActions.select(selectedElements[0]);
							} // if it was a path
							// else, if it was selected and this is a shift-click, remove it from selection
							else if (evt.shiftKey) {
								if (tempJustSelected != t) {
									canvas.removeFromSelection([t]);
								}
							}
						} // no change in mouse position

						// Remove non-scaling stroke
						if (svgedit.browser.supportsNonScalingStroke()) {
							var elem = selectedElements[0];
							if (elem) {
								elem.removeAttribute('style');
								svgedit.utilities.walkTree(elem, function(elem) {
									elem.removeAttribute('style');
								});
							}
						}

					}
					return;

				case 'colorpicker':
					keep=true;
					break;

				case 'zoom':

					/*
					 if (rubberBox != null) {
					 rubberBox.setAttribute('display', 'none');
					 }
					 var factor = evt.shiftKey ? 0.5 : 2;
					 call('zoomed', {
					 'x': Math.min(r_start_x, real_x),
					 'y': Math.min(r_start_y, real_y),
					 'width': Math.abs(real_x - r_start_x),
					 'height': Math.abs(real_y - r_start_y),
					 'factor': factor
					 });
					 */

					return;
				case 'fhpath':
					// Check that the path contains at least 2 points; a degenerate one-point path
					// causes problems.
					// Webkit ignores how we set the points attribute with commas and uses space
					// to separate all coordinates, see https://bugs.webkit.org/show_bug.cgi?id=29870
					sumDistance = 0;
					controllPoint2 = {x:0, y:0};
					controllPoint1 = {x:0, y:0};
					start = {x:0, y:0};
					end = {x:0, y:0};
					var coords = element.getAttribute('points');
					var commaIndex = coords.indexOf(',');
					if (commaIndex >= 0) {
						keep = coords.indexOf(',', commaIndex+1) >= 0;
					} else {
						keep = coords.indexOf(' ', coords.indexOf(' ')+1) >= 0;
					}
					if (keep) {
						element = pathActions.smoothPolylineIntoPath(element);
					}
					break;

				case 'eraser':
					bitmapUtils.endErase();
					keep = true;
					element = null;
					break;

				case 'quickselect':
					bitmapUtils.endSelect();
					keep = true;
					element = null;
					break;

				case 'lasso':
					bitmapUtils.endLasso();
					keep = true;
					element = null;
					break;

				case 'line':
					attrs = $(element).attr(['x1', 'x2', 'y1', 'y2']);
					keep = (attrs.x1 != attrs.x2 || attrs.y1 != attrs.y2);
					break;
				case 'foreignObject':
				case 'square':
				case 'rect':
				case 'image':
					attrs = $(element).attr(['width', 'height']);
					// Image should be kept regardless of size (use inherit dimensions later)
					keep = (attrs.width != 0 || attrs.height != 0) || current_mode === 'image';
					break;
				case 'circle':
					keep = (element.getAttribute('r') != 0);
					break;
				case 'ellipse':
					attrs = $(element).attr(['rx', 'ry']);
					keep = (attrs.rx != null || attrs.ry != null);
					break;
				case 'fhellipse':
					if ((freehand.maxx - freehand.minx) > 0 &&
						(freehand.maxy - freehand.miny) > 0) {
						element = addSvgElementFromJson({
							element: 'ellipse',
							curStyles: true,
							attr: {
								cx: (freehand.minx + freehand.maxx) / 2,
								cy: (freehand.miny + freehand.maxy) / 2,
								rx: (freehand.maxx - freehand.minx) / 2,
								ry: (freehand.maxy - freehand.miny) / 2,
								id: getId()
							}
						});
						call('changed',[element]);
						keep = true;
					}
					break;
				case 'fhrect':
					if ((freehand.maxx - freehand.minx) > 0 &&
						(freehand.maxy - freehand.miny) > 0) {
						element = addSvgElementFromJson({
							element: 'rect',
							curStyles: true,
							attr: {
								x: freehand.minx,
								y: freehand.miny,
								width: (freehand.maxx - freehand.minx),
								height: (freehand.maxy - freehand.miny),
								id: getId()
							}
						});
						call('changed',[element]);
						keep = true;
					}
					break;
				case 'text':
					keep = true;
					selectOnly([element]);
					textActions.start(element);
					break;
				case 'path':
					// set element to null here so that it is not removed nor finalized
					element = null;
					// continue to be set to true so that mouseMove happens
					started = true;

					var res = pathActions.mouseUp(evt, element, mouse_x, mouse_y);
					element = res.element;
					keep = res.keep;
					break;
				case 'pathedit':
					keep = true;
					element = null;
					pathActions.mouseUp(evt);
					break;
				case 'textedit':
					keep = false;
					element = null;
					textActions.mouseUp(evt, mouse_x, mouse_y);
					break;
				case 'rotate':
					keep = true;
					element = null;
					current_mode = 'select';
					var batchCmd = canvas.undoMgr.finishUndoableChange();
					if (!batchCmd.isEmpty()) {
						addCommandToHistory(batchCmd);
					}
					// perform recalculation to weed out any stray identity transforms that might get stuck
					recalculateAllSelectedDimensions();
					call('changed', selectedElements);
					break;
				default:
					// This could occur in an extension
					break;
			}

			var ext_result = runExtensions('mouseUp', {
				event: evt,
				mouse_x: mouse_x,
				mouse_y: mouse_y
			}, true);

			$.each(ext_result, function(i, r) {
				if (r) {
					keep = r.keep || keep;
					element = r.element;
					started = r.started || started;
				}
			});

			if (!keep && element != null) {
				getCurrentDrawing().releaseId(getId());
				element.parentNode.removeChild(element);
				element = null;

				t = evt.target;

				// if this element is in a group, go up until we reach the top-level group
				// just below the layer groups
				// TODO: once we implement links, we also would have to check for <a> elements
				while (t != null && t.parentNode != null && t.parentNode.parentNode.tagName == 'g') {
					t = t.parentNode;
				}

				// if we are not in the middle of creating a path, and we've clicked on some shape,
				// then go to Select mode.
				// WebKit returns <div> when the canvas is clicked, Firefox/Opera return <svg>
				if (t != null && t.parentNode != null && (current_mode != 'path' || !drawn_path) &&
					t.parentNode.id != 'selectorParentGroup' &&
					t.id != 'svgcanvas' && t.id != 'svgroot')
				{
					// switch into "select" mode if we've clicked on an element
					canvas.setMode('select');
					selectOnly([t], true);
				}
			} else if (element != null) {
				canvas.addedNew = true;

				if (useUnit) {svgedit.units.convertAttrs(element);}

				var ani_dur = 0.2, c_ani;
				if (opac_ani.beginElement && element.getAttribute('opacity') != cur_shape.opacity) {
					c_ani = $(opac_ani).clone().attr({
						to: cur_shape.opacity,
						dur: ani_dur
					}).appendTo(element);
					try {
						// Fails in FF4 on foreignObject
						c_ani[0].beginElement();
					} catch(e){}
				} else {
					ani_dur = 0;
				}

				// Ideally this would be done on the endEvent of the animation,
				// but that doesn't seem to be supported in Webkit
				setTimeout(function() {
					if (c_ani) {c_ani.remove();}
					element.setAttribute('opacity', cur_shape.opacity);
					element.setAttribute('style', 'pointer-events:inherit;cursor:default');
					cleanupElement(element);
					if (current_mode === 'path') {
						pathActions.toEditMode(element);
					} else if (curConfig.selectNew)
					{
						if (current_mode == 'rect' ||
						    current_mode == 'square'||
								current_mode == 'fhrect' ||
								current_mode == 'circle' ||
								current_mode == 'ellipse' ||
								current_mode == 'fhellipse'
						)
						{
							/*if(current_mode == 'circle' ||
                                current_mode == 'ellipse' ||
                                current_mode == 'fhellipse'){
                                svgCanvas.convertToPath(element);
							}*/
                            svgCanvas.setMode(current_mode);
						}
						else
						{
                            selectOnly([element], true);
						}
					}
					// we create the insert command that is stored on the stack
					// undo means to call cmd.unapply(), redo means to call cmd.apply()

					if (current_mode != 'pathedit')
					{
                        addCommandToHistory(new svgedit.history.InsertElementCommand(element));
					}

					if (current_mode == 'pathedit')
					{
						pathActions.addPostInsertCmds();
						//console.log('===================================== post insert command: ' + current_mode);
					}

					call('changed',[element]);
				}, ani_dur * 1000);
			}

			startTransform = null;

			if (isModeOverToSelect(current_mode))
			{
				svgCanvas.setMode('select');
			}
		};

		var keyDown = function(evt)
		{
			var evt_target = evt.target;
			var parent = evt_target.parentNode;

			// Do nothing if already in current group
			if (parent === current_group) {return;}

			var mouse_target = getMouseTarget(evt);
			if (mouse_target == null){return;}

			var tagName = mouse_target.tagName;

			if (tagName === 'text' && current_mode !== 'textedit') {
				var pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, root_sctm );
				textActions.select(mouse_target, pt.x, pt.y);
			}

			if ((tagName === 'g' || tagName === 'a') && svgedit.utilities.getRotationAngle(mouse_target)) {
				// TODO: Allow method of in-group editing without having to do
				// this (similar to editing rotated paths)

				// Ungroup and regroup
				pushGroupProperties(mouse_target);
				mouse_target = selectedElements[0];
				clearSelection(true);
			}
			// Reset context
			if (current_group) {
				leaveContext();
			}

			if ((parent.tagName !== 'g' && parent.tagName !== 'a') ||
				parent === getCurrentDrawing().getCurrentLayer() ||
				mouse_target === selectorManager.selectorParentGroup)
			{
				switch (current_mode)
				{
					case 'pathedit':
						pathActions.keyDown(evt);
						break;
				}

				// Escape from in-group edit
				return;
			}
		};

		var dblClick = function(evt) {
			console.log('=============================================== dblclick in path');

			var evt_target = evt.target;
			var parent = evt_target.parentNode;

			// Do nothing if already in current group
			if (parent === current_group) {return;}

			var mouse_target = getMouseTarget(evt);
			if (mouse_target == null){return;}

			var tagName = mouse_target.tagName;

			if (tagName === 'text' && current_mode !== 'textedit') {
				var pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, root_sctm );
				textActions.select(mouse_target, pt.x, pt.y);
			}

			if ((tagName === 'g' || tagName === 'a') && svgedit.utilities.getRotationAngle(mouse_target)) {
				// TODO: Allow method of in-group editing without having to do
				// this (similar to editing rotated paths)

				// Ungroup and regroup
				pushGroupProperties(mouse_target);
				mouse_target = selectedElements[0];
				clearSelection(true);
			}
			// Reset context
			if (current_group) {
				leaveContext();
			}

			if ((parent.tagName !== 'g' && parent.tagName !== 'a') ||
				parent === getCurrentDrawing().getCurrentLayer() ||
				mouse_target === selectorManager.selectorParentGroup)
			{
				switch (current_mode)
				{
					case 'pathedit':
						pathActions.dbclick(evt , r_start_x , r_start_y);
						break;
				}

				// Escape from in-group edit
				return;
			}
			setContext(mouse_target);


		};

		// prevent links from being followed in the canvas
		var handleLinkInCanvas = function(evt) {
            var evt_target = evt.target;
            var parent = evt_target.parentNode;

            // Do nothing if already in current group
            if (parent === current_group) {return;}

            var mouse_target = getMouseTarget(evt);
            if (mouse_target == null){return;}

            if ((parent.tagName !== 'g' && parent.tagName !== 'a') ||
                parent === getCurrentDrawing().getCurrentLayer() ||
                mouse_target === selectorManager.selectorParentGroup)
            {
                switch (current_mode)
                {
                    case 'pathedit':
                        pathActions.click(evt , r_start_x , r_start_y);
                        break;
                }

                // Escape from in-group edit
                return;
            }
            //setContext(mouse_target);

            evt.preventDefault();
			return false;
		};

		// Added mouseup to the container here.
		// TODO(codedread): Figure out why after the Closure compiler, the window mouseup is ignored.
		$(container).mousedown(mouseDown).mousemove(mouseMove).click(handleLinkInCanvas).dblclick(dblClick).mouseup(mouseUp);
//	$(window).mouseup(mouseUp);

		//TODO(rafaelcastrocouto): User preference for shift key and zoom factor
		$(container).bind('mousewheel DOMMouseScroll', function(e){
			//if (!e.shiftKey) {return;}
			e.preventDefault();
			var evt = e.originalEvent;

			root_sctm = $('#svgcontent g')[0].getScreenCTM().inverse();
			var pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, root_sctm );

			var bbox = {
				'x': pt.x,
				'y': pt.y,
				'width': 0,
				'height': 0
			};

			var delta = (evt.wheelDelta) ? evt.wheelDelta : (evt.detail) ? -evt.detail : 0;
			if (!delta) {return;}

			bbox.factor = Math.max(9/10, Math.min(10/9, (delta)));

			//call('zoomed', bbox);

			svgCanvas.transformCanvas(evt , 0 , 0 , delta , true);
		});

	}());

// Function: preventClickDefault
// Prevents default browser click behaviour on the given element
//
// Parameters:
// img - The DOM element to prevent the cilck on
	var preventClickDefault = function(img) {
		$(img).click(function(e){e.preventDefault();});
	};

// Group: Text edit functions
// Functions relating to editing text elements
	textActions = canvas.textActions = (function() {
		var curtext;
		var textinput;
		var cursor;
		var selblock;
		var blinker;
		var chardata = [];
		var textbb, transbb;
		var matrix;
		var last_x, last_y;
		var allow_dbl;

		function setCursor(index) {
			var empty = (textinput.value === '');
			$(textinput).focus();

			if (!arguments.length) {
				if (empty) {
					index = 0;
				} else {
					if (textinput.selectionEnd !== textinput.selectionStart) {return;}
					index = textinput.selectionEnd;
				}
			}

			var charbb;
			charbb = chardata[index];
			if (!empty) {
				textinput.setSelectionRange(index, index);
			}
			cursor = svgedit.utilities.getElem('text_cursor');
			if (!cursor) {
				cursor = document.createElementNS(NS.SVG, 'line');
				svgedit.utilities.assignAttributes(cursor, {
					id: 'text_cursor',
					stroke: '#333',
					'stroke-width': 1
				});
				cursor = svgedit.utilities.getElem('selectorParentGroup').appendChild(cursor);
			}

			if (!blinker) {
				blinker = setInterval(function() {
					var show = (cursor.getAttribute('display') === 'none');
					cursor.setAttribute('display', show?'inline':'none');
				}, 600);
			}

			var start_pt = ptToScreen(charbb.x, textbb.y);
			var end_pt = ptToScreen(charbb.x, (textbb.y + textbb.height));

			svgedit.utilities.assignAttributes(cursor, {
				x1: start_pt.x,
				y1: start_pt.y,
				x2: end_pt.x,
				y2: end_pt.y,
				visibility: 'visible',
				display: 'inline'
			});

			if (selblock) {selblock.setAttribute('d', '');}
		}

		function setSelection(start, end, skipInput) {
			if (start === end) {
				setCursor(end);
				return;
			}

			if (!skipInput) {
				textinput.setSelectionRange(start, end);
			}

			selblock = svgedit.utilities.getElem('text_selectblock');
			if (!selblock) {

				selblock = document.createElementNS(NS.SVG, 'path');
				svgedit.utilities.assignAttributes(selblock, {
					id: 'text_selectblock',
					fill: 'green',
					opacity: 0.5,
					style: 'pointer-events:none'
				});
				svgedit.utilities.getElem('selectorParentGroup').appendChild(selblock);
			}

			var startbb = chardata[start];
			var endbb = chardata[end];

			cursor.setAttribute('visibility', 'hidden');

			var tl = ptToScreen(startbb.x, textbb.y),
				tr = ptToScreen(startbb.x + (endbb.x - startbb.x), textbb.y),
				bl = ptToScreen(startbb.x, textbb.y + textbb.height),
				br = ptToScreen(startbb.x + (endbb.x - startbb.x), textbb.y + textbb.height);

			var dstr = 'M' + tl.x + ',' + tl.y
				+ ' L' + tr.x + ',' + tr.y
				+ ' ' + br.x + ',' + br.y
				+ ' ' + bl.x + ',' + bl.y + 'z';

			svgedit.utilities.assignAttributes(selblock, {
				d: dstr,
				'display': 'inline'
			});
		}

		function getIndexFromPoint(mouse_x, mouse_y) {
			// Position cursor here
			var pt = svgroot.createSVGPoint();
			pt.x = mouse_x;
			pt.y = mouse_y;

			// No content, so return 0
			if (chardata.length == 1) {return 0;}
			// Determine if cursor should be on left or right of character
			var charpos = curtext.getCharNumAtPosition(pt);
			if (charpos < 0) {
				// Out of text range, look at mouse coords
				charpos = chardata.length - 2;
				if (mouse_x <= chardata[0].x) {
					charpos = 0;
				}
			} else if (charpos >= chardata.length - 2) {
				charpos = chardata.length - 2;
			}
			var charbb = chardata[charpos];
			var mid = charbb.x + (charbb.width/2);
			if (mouse_x > mid) {
				charpos++;
			}
			return charpos;
		}

		function setCursorFromPoint(mouse_x, mouse_y) {
			setCursor(getIndexFromPoint(mouse_x, mouse_y));
		}

		function setEndSelectionFromPoint(x, y, apply) {
			var i1 = textinput.selectionStart;
			var i2 = getIndexFromPoint(x, y);

			var start = Math.min(i1, i2);
			var end = Math.max(i1, i2);
			setSelection(start, end, !apply);
		}

		function screenToPt(x_in, y_in) {
			var out = {
				x: x_in,
				y: y_in
			};

			out.x /= current_zoom;
			out.y /= current_zoom;

			if (matrix) {
				var pt = svgedit.math.transformPoint(out.x, out.y, matrix.inverse());
				out.x = pt.x;
				out.y = pt.y;
			}

			return out;
		}

		function ptToScreen(x_in, y_in) {
			var out = {
				x: x_in,
				y: y_in
			};

			if (matrix) {
				var pt = svgedit.math.transformPoint(out.x, out.y, matrix);
				out.x = pt.x;
				out.y = pt.y;
			}

			out.x *= current_zoom;
			out.y *= current_zoom;

			return out;
		}

		function hideCursor() {
			if (cursor) {
				cursor.setAttribute('visibility', 'hidden');
			}
		}

		function selectAll(evt) {
			setSelection(0, curtext.textContent.length);
			$(this).unbind(evt);
		}

		function selectWord(evt) {
			if (!allow_dbl || !curtext) {return;}

			var ept = svgedit.math.transformPoint( evt.pageX, evt.pageY, root_sctm ),
				mouse_x = ept.x * current_zoom,
				mouse_y = ept.y * current_zoom;
			var pt = screenToPt(mouse_x, mouse_y);

			var index = getIndexFromPoint(pt.x, pt.y);
			var str = curtext.textContent;
			var first = str.substr(0, index).replace(/[a-z0-9]+$/i, '').length;
			var m = str.substr(index).match(/^[a-z0-9]+/i);
			var last = (m?m[0].length:0) + index;
			setSelection(first, last);

			// Set tripleclick
			$(evt.target).click(selectAll);
			setTimeout(function() {
				$(evt.target).unbind('click', selectAll);
			}, 300);

		}

		return {
			select: function(target, x, y) {
				curtext = target;
				textActions.toEditMode(x, y);
			},
			start: function(elem) {
				curtext = elem;
				textActions.toEditMode();
			},
			mouseDown: function(evt, mouse_target, start_x, start_y) {
				var pt = screenToPt(start_x, start_y);

				textinput.focus();
				setCursorFromPoint(pt.x, pt.y);
				last_x = start_x;
				last_y = start_y;

				// TODO: Find way to block native selection
			},
			mouseMove: function(mouse_x, mouse_y) {
				var pt = screenToPt(mouse_x, mouse_y);
				setEndSelectionFromPoint(pt.x, pt.y);
			},
			mouseUp: function(evt, mouse_x, mouse_y) {
				var pt = screenToPt(mouse_x, mouse_y);

				setEndSelectionFromPoint(pt.x, pt.y, true);

				// TODO: Find a way to make this work: Use transformed BBox instead of evt.target
//				if (last_x === mouse_x && last_y === mouse_y
//					&& !svgedit.math.rectsIntersect(transbb, {x: pt.x, y: pt.y, width:0, height:0})) {
//					textActions.toSelectMode(true);
//				}

				if (
					evt.target !== curtext
					&&	mouse_x < last_x + 2
					&& mouse_x > last_x - 2
					&&	mouse_y < last_y + 2
					&& mouse_y > last_y - 2) {

					textActions.toSelectMode(true);
				}

			},
			setCursor: setCursor,
			toEditMode: function(x, y) {
				allow_dbl = false;
				current_mode = 'textedit';
				selectorManager.requestSelector(curtext).showGrips(false);
				// Make selector group accept clicks
				var sel = selectorManager.requestSelector(curtext).selectorRect;

				textActions.init();

				$(curtext).css('cursor', 'text');

//				if (svgedit.browser.supportsEditableText()) {
//					curtext.setAttribute('editable', 'simple');
//					return;
//				}

				if (!arguments.length) {
					setCursor();
				} else {
					var pt = screenToPt(x, y);
					setCursorFromPoint(pt.x, pt.y);
				}

				setTimeout(function() {
					allow_dbl = true;
				}, 300);
			},
			toSelectMode: function(selectElem) {
				current_mode = 'select';
				clearInterval(blinker);
				blinker = null;
				if (selblock) {$(selblock).attr('display', 'none');}
				if (cursor) {$(cursor).attr('visibility', 'hidden');}
				$(curtext).css('cursor', 'default');

				if (selectElem) {
					clearSelection();
					$(curtext).css('cursor', 'default');

					call('selected', [curtext]);
					addToSelection([curtext], true);
				}
				if (curtext && !curtext.textContent.length) {
					// No content, so delete
					canvas.deleteSelectedElements();
				}

				$(textinput).blur();

				curtext = false;

//				if (svgedit.browser.supportsEditableText()) {
//					curtext.removeAttribute('editable');
//				}
			},
			setInputElem: function(elem) {
				textinput = elem;
//			$(textinput).blur(hideCursor);
			},
			clear: function() {
				if (current_mode == 'textedit') {
					textActions.toSelectMode();
				}
			},
			init: function(inputElem) {
				if (!curtext) {return;}
				var i, end;
//				if (svgedit.browser.supportsEditableText()) {
//					curtext.select();
//					return;
//				}

				if (!curtext.parentNode) {
					// Result of the ffClone, need to get correct element
					curtext = selectedElements[0];
					selectorManager.requestSelector(curtext).showGrips(false);
				}

				var str = curtext.textContent;
				var len = str.length;

				var xform = curtext.getAttribute('transform');

				textbb = svgedit.utilities.getBBox(curtext);

				matrix = xform ? svgedit.math.getMatrix(curtext) : null;

				chardata = [];
				chardata.length = len;
				textinput.focus();

				$(curtext).unbind('dblclick', selectWord).dblclick(selectWord);

				if (!len) {
					end = {x: textbb.x + (textbb.width/2), width: 0};
				}

				for (i=0; i<len; i++) {
					var start = curtext.getStartPositionOfChar(i);
					end = curtext.getEndPositionOfChar(i);

					if (!svgedit.browser.supportsGoodTextCharPos()) {
						var offset = canvas.contentW * current_zoom;
						start.x -= offset;
						end.x -= offset;

						start.x /= current_zoom;
						end.x /= current_zoom;
					}

					// Get a "bbox" equivalent for each character. Uses the
					// bbox data of the actual text for y, height purposes

					// TODO: Decide if y, width and height are actually necessary
					chardata[i] = {
						x: start.x,
						y: textbb.y, // start.y?
						width: end.x - start.x,
						height: textbb.height
					};
				}

				// Add a last bbox for cursor at end of text
				chardata.push({
					x: end.x,
					width: 0
				});
				setSelection(textinput.selectionStart, textinput.selectionEnd, true);
			}
		};
	}());

// TODO: Migrate all of this code into path.js
// Group: Path edit functions
// Functions relating to editing path elements
	pathActions = canvas.pathActions = function() {

		var subpath = false;
		var current_path;
		var newPoint, firstCtrl;

		function resetD(p) {
			p.setAttribute('d', pathActions.convertPath(p));
		}

		// TODO: Move into path.js
		svgedit.path.Path.prototype.endChanges = function(text) {
			if (svgedit.browser.isWebkit()) {resetD(this.elem);}
			var cmd = new svgedit.history.ChangeElementCommand(this.elem, {d: this.last_d}, text);
			addCommandToHistory(cmd);
			call('changed', [this.elem]);
		};

		svgedit.path.Path.prototype.addPtsToSelection = function(indexes) {
			var i, seg;
			if (!$.isArray(indexes)) {indexes = [indexes];}
			for (i = 0; i< indexes.length; i++) {
				var index = indexes[i];
				seg = this.segs[index];
				if (seg && seg.ptgrip) {
					if (this.selected_pts.indexOf(index) == -1 && index >= 0) {
						this.selected_pts.push(index);
					}
				}
			}
			this.selected_pts.sort();
			i = this.selected_pts.length;
			var grips = [];
			grips.length = i;
			// Loop through points to be selected and highlight each
			while (i--) {
				var pt = this.selected_pts[i];
				seg = this.segs[pt];
				seg.select(true);
				grips[i] = seg.ptgrip;
			}
			// TODO: Correct this:
			pathActions.canDeleteNodes = true;

			pathActions.closed_subpath = this.subpathIsClosed(this.selected_pts[0]);

			call('selected', grips);
		};

		current_path = null;
		var drawn_path = null,
			hasMoved = false;

		var path_start_x , path_start_y;
		var path_start_index;

		// This function converts a polyline (created by the fh_path tool) into
		// a path element and coverts every three line segments into a single bezier
		// curve in an attempt to smooth out the free-hand
		function getPointsSquareDist(p1 , p2)
		{
			return (p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y);
		}

		var smoothPolylineIntoPath = function(element)
		{
			var i;
			//var points = element.points;
			//var N = points.numberOfItems;

			var rawPoints = element.points;
			var rawN = rawPoints.numberOfItems;
			
			var points = [];
			var lastIdx = -1;
			var distThreshold = 80;

			for (var j = 0 ; j < rawPoints.numberOfItems ; j += 1)
			{
				if (lastIdx >= 0)
				{
                    if (getPointsSquareDist(rawPoints.getItem(j) , rawPoints.getItem(lastIdx)) > distThreshold)
                    {
                        points.push(rawPoints.getItem(j));
                        lastIdx = j;
					}
				}
				else
				{
                    points.push(rawPoints.getItem(j));
                    lastIdx = j;
				}
			}

			var N = points.length;

			if (N >= 4) {
				// loop through every 3 points and convert to a cubic bezier curve segment
				//
				// NOTE: this is cheating, it means that every 3 points has the potential to
				// be a corner instead of treating each point in an equal manner. In general,
				// this technique does not look that good.
				//
				// I am open to better ideas!
				//
				// Reading:
				// - http://www.efg2.com/Lab/Graphics/Jean-YvesQueinecBezierCurves.htm
				// - http://www.codeproject.com/KB/graphics/BezierSpline.aspx?msg=2956963
				// - http://www.ian-ko.com/ET_GeoWizards/UserGuide/smooth.htm
				// - http://www.cs.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/Bezier/bezier-der.html
				var curpos = points[0], prevCtlPt = null;
				var d = [];
				d.push(['M', curpos.x, ',', curpos.y, ' C'].join(''));
				for (i = 1; i <= (N-4); i += 3) {
					var ct1 = points[i];
					var ct2 = points[i+1];
					var end = points[i+2];

					// if the previous segment had a control point, we want to smooth out
					// the control points on both sides
					if (prevCtlPt) {
						var newpts = svgedit.path.smoothControlPoints( prevCtlPt, ct1, curpos );
						if (newpts && newpts.length == 2) {
							var prevArr = d[d.length-1].split(',');
							prevArr[2] = newpts[0].x;
							prevArr[3] = newpts[0].y;
							d[d.length-1] = prevArr.join(',');
							ct1 = newpts[1];
						}
					}

					d.push([ct1.x, ct1.y, ct2.x, ct2.y, end.x, end.y].join(','));

					curpos = end;
					prevCtlPt = ct2;
				}
				// handle remaining line segments
				d.push('L');
				while (i < N) {
					var pt = points[i];
					d.push([pt.x, pt.y].join(','));
					i++;
				}
				d = d.join(' ');

				// create new path element
				element = addSvgElementFromJson({
					element: 'path',
					curStyles: true,
					attr: {
						id: getId(),
						d: d,
						fill: 'none'
					}
				});
				// No need to call "changed", as this is already done under mouseUp
			}
			return element;
		};

		return {
			click : function(evt , rx , ry)
			{
				if (curConfig.isAnchorPoint_Adding)
				{
					// console.log(svgedit.path.path.elem);
					pathActions.filterPath();

                    //pathActions.clonePathNode();
                   	//return;

                    var xDir = 'M' + (rx - 5) + ',' + ry + ' L' + (rx + 5) + ',' + ry;
					var yDir = 'M' + (rx) + ',' + (ry - 5) + ' L' + (rx) + ',' + (ry + 5);


					var segPathString = svgedit.path.path.elem.getAttribute('d');

					var rt = Raphael.pathIntersection(segPathString , xDir);
					if (rt.length == 0)
					{
						rt = Raphael.pathIntersection(segPathString , yDir);
					}

					if (rt.length > 0)
					{

						svgedit.path.path.storeD();

						svgedit.path.path.insertSeg(rt[0].x , rt[0].y , rt[0].segment1 , rt[0].t1);

						svgedit.path.path.init();
						//pathActions.toEditMode(svgedit.path.path.elem);

						svgedit.path.path.show(true).update();

						svgedit.path.path.clearSelection();
						svgedit.path.path.addPtsToSelection(rt[0].segment1);

						//Reset state
						//$('#tool_add_anchorpoint').toggleClass('push_button_pressed tool_button');
						//svgCanvas.addAnchorPoint();

						return;
					}
				}
				else if (curConfig.isSissoringPath)
				{
                    var xDir = 'M' + (rx - 5) + ',' + ry + ' L' + (rx + 5) + ',' + ry;
                    var yDir = 'M' + (rx) + ',' + (ry - 5) + ' L' + (rx) + ',' + (ry + 5);

                    var segPathString = svgedit.path.path.elem.getAttribute('d');

                    var rt = Raphael.pathIntersection(segPathString , xDir);
                    if (rt.length == 0)
                    {
                        rt = Raphael.pathIntersection(segPathString , yDir);
                    }

                    if (rt.length > 0)
                    {

                        svgedit.path.path.storeD();

                        var newSegElem = svgedit.path.path.scissorSeg(rt[0].x , rt[0].y , rt[0].segment1 , rt[0].t1);

                        element = newSegElem;
                        svgedit.path.path.init();

                        svgedit.path.path.show(true).update();

                        svgedit.path.path.clearSelection();
                        svgedit.path.path.addPtsToSelection(0);

                        svgCanvas.exitScissoringPath();

                        return;
                    }
				}
                if(evt.ctrlKey){
                    var id = evt.target.id;
                    var cur_pt;
                    if (id.substr(0,14) == 'pathpointgrip_')
                    {
                        console.log('=================================== click on point');

                        cur_pt = svgedit.path.path.cur_pt = parseInt(id.substr(14));
                        // svgedit.path.path.dragging = [start_x, start_y];

                        pathActions.deletePathNode([cur_pt]);

                        // Update related segments
                        var seg = svgedit.path.path.segs[cur_pt];
                        if (seg != undefined)
                        {
                            seg.move(0 , 0);
                            if (seg.prev)
                            {
                                seg.prev.move(0 , 0);
                            }
                            if (seg.next)
                            {
                                seg.next.move(0 , 0);
                            }
                        }

                        //$('#tool_remove_anchorpoint').toggleClass('push_button_pressed tool_button');
                        //svgCanvas.removeAnchorPoint();
                    }
                    else{
                        // console.log(svgedit.path.path.elem);
                        pathActions.filterPath();

                        //pathActions.clonePathNode();
                        //return;

                        var xDir = 'M' + (rx - 5) + ',' + ry + ' L' + (rx + 5) + ',' + ry;
                        var yDir = 'M' + (rx) + ',' + (ry - 5) + ' L' + (rx) + ',' + (ry + 5);


                        var segPathString = svgedit.path.path.elem.getAttribute('d');

                        var rt = Raphael.pathIntersection(segPathString , xDir);
                        if (rt.length == 0)
                        {
                            rt = Raphael.pathIntersection(segPathString , yDir);
                        }

                        if (rt.length > 0)
                        {

                            svgedit.path.path.storeD();

                            svgedit.path.path.insertSeg(rt[0].x , rt[0].y , rt[0].segment1 , rt[0].t1);

                            svgedit.path.path.init();
                            //pathActions.toEditMode(svgedit.path.path.elem);

                            svgedit.path.path.show(true).update();

                            svgedit.path.path.clearSelection();
                            svgedit.path.path.addPtsToSelection(rt[0].segment1);

                            //Reset state
                            //$('#tool_add_anchorpoint').toggleClass('push_button_pressed tool_button');
                            //svgCanvas.addAnchorPoint();

                            return;
                        }
                    }
                }
			},
			dbclick : function(evt , rx , ry, start_x, start_y)
			{

			},

			keyDown : function(evt)
			{
				console.log(evt.keyCode);
			},


			getOverlapedPath : function(_x , _y)
			{
				var pathList = [];
                pathActions.getAllPathObjects(svgCanvas.getCurrentDrawing().getCurrentLayer() , pathList);

                var endsWith = function(str, suffix) 
				{
                    return str.indexOf(suffix, str.length - suffix.length) !== -1;
                }

                for (var i = 0 ; i < pathList.length ; ++i)
				{
					// Ignore all closed path
					var pathString = pathList[i].getAttribute('d');
					if (endsWith(pathString , 'z') || endsWith(pathString , 'Z'))
					{
						continue;
					}

					var sItem = pathList[i].pathSegList.getItem(0);
					var eItem = pathList[i].pathSegList.getItem(pathList[i].pathSegList.numberOfItems - 1);

					var sDist = (sItem.x - _x) * (sItem.x - _x) + (sItem.y - _y) * (sItem.y - _y);
                    var eDist = (eItem.x - _x) * (eItem.x - _x) + (eItem.y - _y) * (eItem.y - _y);

                    if (eDist < pathOverlappedCheckSquareDist)
					{
						return {path:pathList[i] , d:pathList[i].getAttribute('d')};
					}
					else if (sDist < pathOverlappedCheckSquareDist)
					{
                        var reversePath = 'M' + SVGPathEditor.reverse(pathList[i].getAttribute('d'));
                        reversePath = reversePath.replace('z', '').replace('Z' , '');

                        return {path: pathList[i], d: reversePath};
					}
				}

				return null;
			},

            getAllPathObjects : function(node , pathList)
			{
				if (node.tagName == 'path' &&
					(node.id != 'lassoAreaChild' &&
					node.id != 'selectedArea')
				)
				{
					if (node.pathSegList.numberOfItems  > 1)
					{
                        pathList.push(node);
					}
				}
				else
				{
					for (var i = 0 ; i < node.childNodes.length ; ++i)
					{
                        pathActions.getAllPathObjects(node.childNodes[i] , pathList);
					}
				}
			},
			edgeCheckCallback : function()
			{
                var edgeCheckCallback = this.edgeCheckCallback = function()
                {
                    var width = "innerWidth" in window
                        ? window.innerWidth
                        : document.documentElement.offsetWidth;

                    var height = "innerHeight" in window
                        ? window.innerHeight
                        : document.documentElement.offsetHeight;

                	//return;
                	var mx = 0 , my = 0;

                    var edgeEpsilon = 3;
                    // Try to move the canvas automatically
                    if (drawPathMouseX < 57 + edgeEpsilon)
                    {
                        mx = 5;
                    }
                    else if (drawPathMouseX > width - edgeEpsilon - 172)
                    {
                        mx = -5;
                    }

                    if (drawPathMouseY < 57 + edgeEpsilon)
                    {
                        my = 5;
                    }
                    else if (drawPathMouseY > height - edgeEpsilon)
                    {
                        my = -5;
                    }

                    ///*
                    if (mx != 0 || my != 0)
					{
                        svgCanvas.transformCanvas(null , mx , my , 0 , false);

                        drawPathMouseOffsetX -= mx;
                        drawPathMouseOffsetY -= my;
					}
					//*/

                    //console.log('mouse: ' + drawPathMouseX + ', ' + drawPathMouseY + ', ' + width + ', ' + height + ', ' + current_mode);
                }
			},
			mouseDown: function(evt, mouse_target, start_x, start_y) {
				var id;

                drawPathMouseOffsetX = 0;
                drawPathMouseOffsetY = 0;
				if (isPreparedToDrawPath == true && current_mode === 'path') {
                    if(canvas.getTargetRulers(start_x,start_y)&&!evt.ctrlKey) {
                    	var newP = pathActions.getadsorption(start_x,start_y);
                    	start_x = newP.x;
                    	start_y = newP.y;
					}
                    mouse_x = start_x;
                    mouse_y = start_y;
                    path_start_x = start_x;
                    path_start_y = start_y;

					var x = mouse_x/current_zoom,
						y = mouse_y/current_zoom,
						stretchy = svgedit.utilities.getElem('path_stretch_line');
					newPoint = [x, y];

					if (curConfig.gridSnapping){
						x = svgedit.utilities.snapToGrid(x);
						y = svgedit.utilities.snapToGrid(y);
						mouse_x = svgedit.utilities.snapToGrid(mouse_x);
						mouse_y = svgedit.utilities.snapToGrid(mouse_y);
					}

					if (!stretchy) {
						stretchy = document.createElementNS(NS.SVG, 'path');
						svgedit.utilities.assignAttributes(stretchy, {
							id: 'path_stretch_line',
							stroke: '#22C',
							'stroke-width': '0.5',
							fill: 'none'
						});
						stretchy = svgedit.utilities.getElem('selectorParentGroup').appendChild(stretchy);
					}
					stretchy.setAttribute('display', 'inline');

					var keep = null;
					var index;
					// if pts array is empty, create path element with M at current point
					if (!drawn_path)
					{
						pathDrawCmdStack = [];

                        var overlappedPath = pathActions.getOverlapedPath(x , y);

                        isOverwritePath = false;

                        if (overlappedPath != null)
						{
                            d_attr = overlappedPath.d;

                            if (overlappedPath.path != null)
							{
                                isOverwritePath = true;

                                canvas.undoMgr.beginUndoableChange('d', [overlappedPath.path]);
                                overlappedPath.path.setAttribute('d' , '');
                                var batchCmd = canvas.undoMgr.finishUndoableChange();
                                batchCmd.prevCmdNums = 0;
                                addCommandToHistory(batchCmd);
							}

							pathDrawCmdStack.push({d:d_attr , prevCmdNums: 0});
						}
						else
						{
                            d_attr = 'M' + x + ',' + y + ' ';

							pathDrawCmdStack.push({d:'' , prevCmdNums: 0});
						}

						//d_attr = 'M' + x + ',' + y + ' ';
						drawn_path = addSvgElementFromJson({
							element: 'path',
							curStyles: true,
							attr: {
								d: d_attr,
								id: getNextId(),
								opacity: cur_shape.opacity
							}
						});
						// set stretchy line to first point
						stretchy.setAttribute('d', ['M', mouse_x, mouse_y, mouse_x, mouse_y].join(' '));
						index = subpath ? svgedit.path.path.segs.length : 0;
						svgedit.path.addPointGrip(index, mouse_x, mouse_y);

						path_start_index = -1;
						if (overlappedPath != null)
						{
                            var seglist = drawn_path.pathSegList;
                            path_start_index = seglist.numberOfItems - 1;
						}

                        pathDrawEdgeCheckIdx = setInterval(function(){pathActions.edgeCheckCallback();} , parseInt(pathDrawEdgeCheckInterval));
					}
					else
					{
						// determine if we clicked on an existing point
						var seglist = drawn_path.pathSegList;
						var i = seglist.numberOfItems;
						var FUZZ = pointCheckFuzzDistance / current_zoom / canvasScale;
						var clickOnPoint = false;
						while (i) {
							i --;
							var item = seglist.getItem(i);
							var px = item.x, py = item.y;
							// found a matching point
							if ( x >= (px-FUZZ) && x <= (px+FUZZ) && y >= (py-FUZZ) && y <= (py+FUZZ) ) {
								clickOnPoint = true;
								break;
							}
						}

						// get path element that we are in the process of creating
						id = getId();

						// Remove previous path object if previously created
						svgedit.path.removePath_(id);

						var newpath = svgedit.utilities.getElem(id);
						var newseg;
						var s_seg;
						var len = seglist.numberOfItems;
						// if we clicked on an existing point, then we are done this path, commit it
						// (i, i+1) are the x,y that were clicked on
						if (clickOnPoint)
						{
							// if clicked on any other point but the first OR
							// the first point was clicked on and there are less than 3 points
							// then leave the path open
							// otherwise, close the path

							///*
							if (i <= 1 && len > 2) {
								// Create end segment
								var abs_x = seglist.getItem(0).x;
								var abs_y = seglist.getItem(0).y;


								s_seg = stretchy.pathSegList.getItem(1);
								if (s_seg.pathSegType === 4) {
									newseg = drawn_path.createSVGPathSegLinetoAbs(abs_x, abs_y);
								} else {
									newseg = drawn_path.createSVGPathSegCurvetoCubicAbs(
										abs_x,
										abs_y,
										s_seg.x1 / current_zoom,
										s_seg.y1 / current_zoom,
										abs_x,
										abs_y
									);
								}

								var endseg = drawn_path.createSVGPathSegClosePath();
								seglist.appendItem(newseg);
								seglist.appendItem(endseg);

								console.log('================================================== length: ' + len);
							}
							/*
							else if (len < 3) {
								keep = false;
								return keep;
							}
							*/

							if (len < 2)
							{
								keep = false;
								return keep;
							}

							$(stretchy).remove();

							// This will signal to commit the path
							element = newpath;
							drawn_path = null;
							started = false;

							/******************************************************************************/
                            var curpath = svgedit.path.getPath_(element);
                            for (var i = 0 ; i < curpath.segs.length ; ++i)
                            {
                                var seg = svgedit.path.path.segs[i];
                                seg.cleanupCPFlag();
                            }
							/******************************************************************************/

							if (subpath)
							{
								if (svgedit.path.path.matrix) {
									svgedit.coords.remapElement(newpath, {}, svgedit.path.path.matrix.inverse());
								}

								var new_d = newpath.getAttribute('d');
								var orig_d = $(svgedit.path.path.elem).attr('d');
								$(svgedit.path.path.elem).attr('d', orig_d + new_d);
								$(newpath).remove();
								if (svgedit.path.path.matrix) {
									svgedit.path.recalcRotatedPath();
								}
								svgedit.path.path.init();
								pathActions.toEditMode(svgedit.path.path.elem);
								svgedit.path.path.selectPt();
								return false;
							}

                            isPreparedToDrawPath = false;
						}
						// else, create a new point, update path element
						else
						{
							// Checks if current target or parents are #svgcontent
							if (!$.contains(container, getMouseTarget(evt))) {
								// Clicked outside canvas, so don't make point
								console.log('Clicked outside canvas');
								return false;
							}

							var num = drawn_path.pathSegList.numberOfItems;
							var last = drawn_path.pathSegList.getItem(num -1);
							var lastx = last.x, lasty = last.y;

							if (evt.shiftKey) {
								var xya = svgedit.math.snapToAngle(lastx, lasty, x, y);
								x = xya.x;
								y = xya.y;
							}

							// Use the segment defined by stretchy
							s_seg = stretchy.pathSegList.getItem(1);

							if (s_seg.pathSegType === 4) {
								//newseg = drawn_path.createSVGPathSegLinetoAbs(round(x), round(y));

                                newseg = drawn_path.createSVGPathSegCurvetoCubicAbs(
                                    x,//round(x),
                                    y,//round(y),
                                    stretchy.pathSegList.getItem(0).x,
                                    stretchy.pathSegList.getItem(0).y,
                                    x,//round(x),
                                    y//round(y)
                                );

							} else {
								newseg = drawn_path.createSVGPathSegCurvetoCubicAbs(
                                    x,//round(x),
                                    y,//round(y),
									s_seg.x1 / current_zoom,
									s_seg.y1 / current_zoom,
									s_seg.x2 / current_zoom,
									s_seg.y2 / current_zoom
								);
							}
							drawn_path.pathSegList.appendItem(newseg);

							x *= current_zoom;
							y *= current_zoom;

							// set stretchy line to latest point
							stretchy.setAttribute('d', ['M', x, y, x, y].join(' '));
							index = num;
							if (subpath) {index += svgedit.path.path.segs.length;}
							svgedit.path.addPointGrip(index, x, y);

                            if (currentOverlappedPath != null)
                            {
                                // Try to connect two path
                                //console.log('================================= Try to connect two path');

                                pathActions.escapeCallback();

                                var newPath = pathActions.connectTwoPath(element.getAttribute('d') , currentOverlappedPath.d , currentOverlappedPath.path);

								pathDrawCmdStack.push({d: newPath , prevCmdNums: 1});
                            }
                        }
						//keep = true;

                        var dString;
						if (drawn_path)
						{
                            dString = drawn_path.getAttribute('d');

                            pathDrawCmdStack.push({d: dString , prevCmdNums: 0});
                            //console.log('=============dString: ' + dString);
                        }
                        else if (element)
						{
							// Push all current command into stack
							/**********************************************************/
                            var dPathString = element.getAttribute('d');
                            if (pathDrawCmdStack.length > 1)
                            {
                                element.setAttribute('d' , pathDrawCmdStack[0].d);

                                for (var i = 1 ; i < pathDrawCmdStack.length ; ++i)
                                {
                                    canvas.undoMgr.beginUndoableChange('d', [element]);
                                    element.setAttribute('d' , pathDrawCmdStack[i].d);
                                    var batchCmd = canvas.undoMgr.finishUndoableChange();
                                    batchCmd.prevCmdNums = pathDrawCmdStack[i].prevCmdNums;

                                    if (!batchCmd.isEmpty())
                                    {
                                        //addCommandToHistory(batchCmd);
                                        //console.log('=========================== add batch command');

                                        pathDrawPostCmds.push(batchCmd);
                                    }
                                }
                            }

                            element.setAttribute('d' , dPathString);

                            pathDrawCmdStack = [];

                            clearInterval(pathDrawEdgeCheckIdx);
						}
					}

					return;
				}

				// TODO: Make sure current_path isn't null at this point
				if (!svgedit.path.path) {return;}

				svgedit.path.path.storeD();

				id = evt.target.id;
				var cur_pt;
				if (id.substr(0,14) == 'pathpointgrip_')
				{
                    console.log('=================================== click on point');

                    if (curConfig.isAnchorPoint_Removing)
					{
                        cur_pt = svgedit.path.path.cur_pt = parseInt(id.substr(14));
                        svgedit.path.path.dragging = [start_x, start_y];

                        pathActions.deletePathNode([cur_pt]);

						// Update related segments
						var seg = svgedit.path.path.segs[cur_pt];
						if (seg != undefined)
						{
                            seg.move(0 , 0);
                            if (seg.prev)
                            {
                                seg.prev.move(0 , 0);
                            }
                            if (seg.next)
                            {
                                seg.next.move(0 , 0);
                            }
						}

                        //$('#tool_remove_anchorpoint').toggleClass('push_button_pressed tool_button');
                        //svgCanvas.removeAnchorPoint();
					}
					else
					{
                        // Select this point
                        cur_pt = svgedit.path.path.cur_pt = parseInt(id.substr(14));
                        svgedit.path.path.dragging = [start_x, start_y];
                        var seg = svgedit.path.path.segs[cur_pt];

                        // only clear selection if shift is not pressed (otherwise, add
                        // node to selection)
                        if (!evt.shiftKey) {
                            if (svgedit.path.path.selected_pts.length <= 1 || !seg.selected) {
                                svgedit.path.path.clearSelection();
                            }
                            svgedit.path.path.addPtsToSelection(cur_pt);
                        } else if (seg.selected) {
                            svgedit.path.path.removePtFromSelection(cur_pt);
                        } else {
                            svgedit.path.path.addPtsToSelection(cur_pt);
                        }
					}
				}
				else if (id.indexOf('ctrlpointgrip_') == 0)
				{
					svgedit.path.path.dragging = [start_x, start_y];

					var parts = id.split('_')[1].split('c');
					cur_pt = Number(parts[0]);
					var ctrl_num = Number(parts[1]);
					svgedit.path.path.selectPt(cur_pt, ctrl_num);
				}

				// Start selection box
				if (!svgedit.path.path.dragging) {
					if (rubberBox == null) {
						rubberBox = selectorManager.getRubberBandBox(getCurrentDrawing().getCurrentLayerColor());
					}
					svgedit.utilities.assignAttributes(rubberBox, {
						'x': start_x * current_zoom,
						'y': start_y * current_zoom,
						'width': 0,
						'height': 0,
						'display': 'inline'
					}, 100);
				}
			},
			getadsorption:function (x,y) {
                if(canvas.getTargetRulers(x,y)){
                    var targetRuler = canvas.getTargetRulers(x,y);
                    var rulerX = targetRuler.getAttribute("crossX");
                    var rulerY = targetRuler.getAttribute("crossY");
                    var targetStr = targetRuler.getAttribute('d');

                    var dis = 8;
                    if(rulerX=="-10000"){
                        if(y-rulerY<dis){
                            y=Number(rulerY);
                        }
                    }
                    if(rulerY=="-10000"){
                        if(x-rulerX<dis){
                            x=Number(rulerX);
                        }
                    }
                    var canvasForgeground = selectorManager.canvasForgeground
                    var rulers = canvasForgeground.childNodes;
                    var xNum=0,yNum=0,xArr=[],yArr=[];
                    for(var i = 0;i<rulers.length;i++){
                        var nowX = $(rulers[i]).attr("crossX");
                        var nowY = $(rulers[i]).attr("crossY");
                        if(rulers[i].tagName=='path'&&targetStr!=rulers[i].getAttribute('d')){
                            // console.log(targetRulerX+','+nowY);
                            if(rulerX=='-10000'&&nowY==rulerX){
                                if(Math.abs(rulerY-y)<dis&&Math.abs(nowX-x)<dis){
                                    y=Number(rulerY);
                                    x=Number(nowX);
                                }
                            }else if(rulerY=='-10000'&&nowX==rulerY){
                                if(Math.abs(rulerX-x)<dis&&Math.abs(nowY-y)<dis){
                                    y=Number(nowY);
                                    x=Number(rulerX);
                                }
                            }
                        }
                        if(nowY=='-10000'&&nowX!='-10000'){
                            yNum++;
                            xArr.push(rulers[i])
                        }
                        if(nowX=='-10000'&&nowY!='-10000'){
                            xNum++;
                            yArr.push(rulers[i])
                        }
                    }
                    if(xNum>1&&yNum>0) {
                        var centerY;
                        if (rulerY == '-10000'){
                            function sortfunction(a, b){
                                return ($(a).attr('crossY') - $(b).attr('crossY')); //causes an array to be sorted numerically and ascending
                            }
                            yArr.sort(sortfunction);
                            for(var i=0;i<yArr.length-1;i++){
                                centerY = (Number(yArr[i].getAttribute('crossY'))+Number(yArr[i+1].getAttribute('crossY')))/2;
                                if(Math.abs(rulerX-x)<dis&&Math.abs(centerY-y)<dis){
                                    y=Number(centerY);
                                    x=Number(rulerX);
                                }
                            }
                        }
                    }
                    if(yNum>1&&xNum>0) {
                        var centerX;
                        if (rulerX == '-10000'){
                            function sortfunction(a, b){
                                return ($(a).attr('crossX') - $(b).attr('crossX')); //causes an array to be sorted numerically and ascending
                            }
                            xArr.sort(sortfunction);
                            for(var i=0;i<xArr.length-1;i++){
                                centerX = (Number(xArr[i].getAttribute('crossX'))+Number(xArr[i+1].getAttribute('crossX')))/2;
                                if(Math.abs(centerX-x)<dis&&Math.abs(rulerY-y)<dis){
                                    y=Number(rulerY);
                                    x=Number(centerX);
                                }
                            }
                        }
                    }
                }
                return {x:x,y:y}
            },
			addPostInsertCmds : function()
			{
				// For some this is no need
				//if (isOverwritePath == false)
				{
                    var insertCmd = new svgedit.history.InsertElementCommand(element);

                    if (isOverwritePath)
					{
						insertCmd.prevCmdNums = 1;
					}
                    addCommandToHistory(insertCmd);
				}


				for (var i = 0; i < pathDrawPostCmds.length; ++i)
				{
                    addCommandToHistory(pathDrawPostCmds[i]);

				}

                pathDrawPostCmds = [];

                isOverwritePath = false;
			},
            undoPathNodeAdd : function()
            {
            	if (drawn_path == null)
				{
					return;
				}

                var num = drawn_path.pathSegList.numberOfItems;

                if (num <= 0)
				{
					return;
				}

                var last = drawn_path.pathSegList.getItem(num -1);

                svgedit.path.removePointGrip(num - 1);
                svgedit.path.removeCtrlGrip('1c1');
                svgedit.path.removeCtrlGrip('0c2');

                svgedit.path.removeCtrlLine('1');

                drawn_path.pathSegList.removeItem(drawn_path.pathSegList.numberOfItems - 1);

                ///*
				if (drawn_path.pathSegList.numberOfItems > 0)
				{
                    index = drawn_path.pathSegList.numberOfItems - 1;

                    x = drawn_path.pathSegList.getItem(drawn_path.pathSegList.numberOfItems - 1).x;
                    y = drawn_path.pathSegList.getItem(drawn_path.pathSegList.numberOfItems - 1).y;

                    index = drawn_path.pathSegList.numberOfItems;

                    stretchy = svgedit.utilities.getElem('path_stretch_line');
                    if (stretchy)
					{
                        stretchy.setAttribute('d', ['M', x, y, x, y].join(' '));
					}
				}
				else
				{
					drawn_path = null;
                    stretchy = svgedit.utilities.getElem('path_stretch_line');
                    if (stretchy)
                    {
                        stretchy.setAttribute('d', '');
                    }
				}
                //*/

				if (pathDrawCmdStack.length > 0)
				{
                    pathDrawCmdStack.length -= 1;
				}
            },
			mouseMove: function(mouse_x, mouse_y , _evt) {

				if (_evt)
				{
                    drawPathMouseX = _evt.pageX;
                    drawPathMouseY = _evt.pageY;
				}

				hasMoved = true;
                if(canvas.getTargetRulers(mouse_x,mouse_y)&&!_evt.ctrlKey){
					var newP = pathActions.getadsorption(mouse_x,mouse_y);
					mouse_x = newP.x;
					mouse_y = newP.y;
                }
                if(canvas.getTargetRulers(mouse_x , mouse_y)){
                    var targetR  = canvas.getTargetRulers(mouse_x , mouse_y);
                    var targetRulerX = $(targetR).attr("crossX");
                    var targetRulerY = $(targetR).attr("crossY");
                    var targetStr = targetR.getAttribute('d');
                    var dis = 8;
                    if(mouse_x-targetRulerX<dis){
                        svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '边缘点');
                    }else if(mouse_y-targetRulerY<dis){
                        svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '边缘点');
                    }
                    var canvasForgeground = selectorManager.canvasForgeground
                    var rulers = canvasForgeground.childNodes;
                    var xNum=0,yNum=0,xArr=[],yArr=[];
                    for(var i = 1;i<rulers.length;i++){
                        var nowX = $(rulers[i]).attr("crossX");
                        var nowY = $(rulers[i]).attr("crossY");
                        if(rulers[i].tagName=='path'&&targetStr!=rulers[i].getAttribute('d')){
                            // console.log(targetRulerX+','+nowY);
                            if(targetRulerX=='-10000'&&nowY==targetRulerX){
                                if(Math.abs(targetRulerY-mouse_y)<dis&&Math.abs(nowX-mouse_x)<dis){
                                    svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '交集');
                                }
                            }else if(targetRulerY=='-10000'&&nowX==targetRulerY){
                                if(Math.abs(targetRulerX-mouse_x)<dis&&Math.abs(nowY-mouse_y)<dis){
                                    svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '交集');
                                }
                            }
                        }
                        if(nowY=='-10000'&&nowX!='-10000'){
                            yNum++;
                            xArr.push(rulers[i])
                        }
                        if(nowX=='-10000'&&nowY!='-10000'){
                            xNum++;
                            yArr.push(rulers[i])
                        }
                    }
                    if(xNum>1&&yNum>0) {
                        var centerY;
                        if (targetRulerY == '-10000'){
                            function sortfunction(a, b){
                                return ($(a).attr('crossY') - $(b).attr('crossY')); //causes an array to be sorted numerically and ascending
                            }
                            yArr.sort(sortfunction);
                            for(var i=0;i<yArr.length-1;i++){
                                centerY = (Number(yArr[i].getAttribute('crossY'))+Number(yArr[i+1].getAttribute('crossY')))/2;
                                if(Math.abs(targetRulerX-mouse_x)<dis&&Math.abs(centerY-mouse_y)<dis){
                                    svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '中点');
                                }
                            }
                        }
                    }
                    if(yNum>1&&xNum>0) {
                        var centerX;
                        if (targetRulerX == '-10000'){
                            function sortfunction(a, b){
                                return ($(a).attr('crossX') - $(b).attr('crossX')); //causes an array to be sorted numerically and ascending
                            }
                            xArr.sort(sortfunction);
                            for(var i=0;i<xArr.length-1;i++){
                                centerX = (Number(xArr[i].getAttribute('crossX'))+Number(xArr[i+1].getAttribute('crossX')))/2;
                                if(Math.abs(centerX-mouse_x)<dis&&Math.abs(targetRulerY-mouse_y)<dis){
                                    svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '中点');
                                }
                            }
                        }
                    }

                }else{
                    svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '');
                }
                if (current_mode === 'path')
				{
					if (!drawn_path) {return;}
					var seglist = drawn_path.pathSegList;
					var index = seglist.numberOfItems - 1;

                    currentOverlappedPath = pathActions.getOverlapedPath(mouse_x , mouse_y);
                    if (currentOverlappedPath != null)
                    {
                        svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '锚点');
                    }
                    /*else if(canvas.getTargetRulers(mouse_x , mouse_y)){
                        var targetR  = canvas.getTargetRulers(mouse_x , mouse_y);
                        var targetRulerX = $(targetR).attr("crossX");
                        var targetRulerY = $(targetR).attr("crossY");
                        var targetStr = targetR.getAttribute('d');
                        var dis = 8;
                        if(mouse_x-targetRulerX<dis){
                            svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '边缘点');
                        }else if(mouse_y-targetRulerY<dis){
                            svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '边缘点');
                        }
                        var canvasForgeground = selectorManager.canvasForgeground
                        var rulers = canvasForgeground.childNodes;
                        var xNum=0,yNum=0,xArr=[],yArr=[];
						for(var i = 1;i<rulers.length;i++){
							var nowX = $(rulers[i]).attr("crossX");
                            var nowY = $(rulers[i]).attr("crossY");
                            if(rulers[i].tagName=='path'&&targetStr!=rulers[i].getAttribute('d')){
                                // console.log(targetRulerX+','+nowY);
								if(targetRulerX=='-10000'&&nowY==targetRulerX){
                                    if(Math.abs(targetRulerY-mouse_y)<dis&&Math.abs(nowX-mouse_x)<dis){
                                        svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '交集');
                                    }
                                }else if(targetRulerY=='-10000'&&nowX==targetRulerY){
									if(Math.abs(targetRulerX-mouse_x)<dis&&Math.abs(nowY-mouse_y)<dis){
                                        svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '交集');
                                    }
                                }
							}
							if(nowY=='-10000'&&nowX!='-10000'){
                            	yNum++;
                                xArr.push(rulers[i])
                            }
							if(nowX=='-10000'&&nowY!='-10000'){
								xNum++;
								yArr.push(rulers[i])
							}
						}
                        if(xNum>1&&yNum>0) {
                            var centerY;
                            if (targetRulerY == '-10000'){
                                function sortfunction(a, b){
                                    return ($(a).attr('crossY') - $(b).attr('crossY')); //causes an array to be sorted numerically and ascending
                                }
                                yArr.sort(sortfunction);
                                for(var i=0;i<yArr.length-1;i++){
                                	centerY = (Number(yArr[i].getAttribute('crossY'))+Number(yArr[i+1].getAttribute('crossY')))/2;
                                    if(Math.abs(targetRulerX-mouse_x)<dis&&Math.abs(centerY-mouse_y)<dis){
                                        svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '中点');
                                    }
								}
							}
                        }
                        if(yNum>1&&xNum>0) {
                            var centerX;
                            if (targetRulerX == '-10000'){
                                function sortfunction(a, b){
                                    return ($(a).attr('crossX') - $(b).attr('crossX')); //causes an array to be sorted numerically and ascending
                                }
                                xArr.sort(sortfunction);
                                for(var i=0;i<xArr.length-1;i++){
                                    centerX = (Number(xArr[i].getAttribute('crossX'))+Number(xArr[i+1].getAttribute('crossX')))/2;
                                    if(Math.abs(centerX-mouse_x)<dis&&Math.abs(targetRulerY-mouse_y)<dis){
                                        svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '中点');
                                    }
                                }
                            }
                        }

                    }else{
                        svgCanvas.showIndicatorInfo(mouse_x , mouse_y , '');
					}*/

					if (newPoint)
					{
						// First point
						//if (!index) {return;}

						// Set control points
						var pointGrip1 = svgedit.path.addCtrlGrip('1c1');
						var pointGrip2 = svgedit.path.addCtrlGrip('0c2');

						// dragging pointGrip1
						pointGrip1.setAttribute('cx', mouse_x);
						pointGrip1.setAttribute('cy', mouse_y);
						pointGrip1.setAttribute('display', 'inline');

						var pt_x = newPoint[0];
						var pt_y = newPoint[1];

						// set curve
						var seg = seglist.getItem(index);
						var cur_x = mouse_x / current_zoom;
						var cur_y = mouse_y / current_zoom;
						var alt_x = (pt_x + (pt_x - cur_x));
						var alt_y = (pt_y + (pt_y - cur_y));

						pointGrip2.setAttribute('cx', alt_x * current_zoom);
						pointGrip2.setAttribute('cy', alt_y * current_zoom);
						pointGrip2.setAttribute('display', 'inline');

						var ctrlLine = svgedit.path.getCtrlLine(1);
						svgedit.utilities.assignAttributes(ctrlLine, {
							x1: mouse_x,
							y1: mouse_y,
							x2: alt_x * current_zoom,
							y2: alt_y * current_zoom,
							display: 'inline'
						});

						if (index === 0) {
							firstCtrl = [mouse_x, mouse_y];
						} else {
							var last = seglist.getItem(index - 1);
							var last_x = last.x;
							var last_y = last.y;

							if (last.pathSegType === 6) {
								last_x += (last_x - last.x2);
								last_y += (last_y - last.y2);
							} else if (firstCtrl) {
								last_x = firstCtrl[0]/current_zoom;
								last_y = firstCtrl[1]/current_zoom;
							}

							if (index != path_start_index)
							{
                                svgedit.path.replacePathSeg(6, index, [pt_x, pt_y, last_x, last_y, alt_x, alt_y], drawn_path);
							}
							//svgedit.path.replacePathSeg(6, index, [pt_x, pt_y, last_x, last_y, alt_x, alt_y], drawn_path);
						}
					} else {
						var stretchy = svgedit.utilities.getElem('path_stretch_line');
						if (stretchy) {
							var prev = seglist.getItem(index);
							if (prev.pathSegType === 6) {
								var prev_x = prev.x + (prev.x - prev.x2);
								var prev_y = prev.y + (prev.y - prev.y2);
								svgedit.path.replacePathSeg(6, 1, [mouse_x + drawPathMouseOffsetX, mouse_y  + drawPathMouseOffsetY, prev_x * current_zoom, prev_y * current_zoom, mouse_x, mouse_y], stretchy);
							} else if (firstCtrl) {
								svgedit.path.replacePathSeg(6, 1, [mouse_x + drawPathMouseOffsetX, mouse_y  + drawPathMouseOffsetY, firstCtrl[0], firstCtrl[1], mouse_x, mouse_y], stretchy);
							} else {
								svgedit.path.replacePathSeg(4, 1, [mouse_x + drawPathMouseOffsetX, mouse_y  + drawPathMouseOffsetY], stretchy);
							}
						}
					}
					return;
				}
				// if we are dragging a point, let's move it
				if (svgedit.path.path.dragging) {
                    var pt = svgedit.path.getPointFromGrip({
						x: svgedit.path.path.dragging[0],
						y: svgedit.path.path.dragging[1]
					}, svgedit.path.path);
					var mpt = svgedit.path.getPointFromGrip({
						x: mouse_x,
						y: mouse_y
					}, svgedit.path.path);
					var diff_x = mpt.x - pt.x;
					var diff_y = mpt.y - pt.y;
					svgedit.path.path.dragging = [mouse_x, mouse_y];

					if (svgedit.path.path.dragctrl)
					{
						svgedit.path.path.moveCtrl(diff_x, diff_y);
					}
					else
					{
						svgedit.path.path.movePts(diff_x, diff_y , true);
					}
				} else {
					svgedit.path.path.selected_pts = [];
					svgedit.path.path.eachSeg(function(i) {
						var seg = this;
						if (!seg.next && !seg.prev) {return;}

						var item = seg.item;
						var rbb = rubberBox.getBBox();

						var pt = svgedit.path.getGripPt(seg);
						var pt_bb = {
							x: pt.x,
							y: pt.y,
							width: 0,
							height: 0
						};

						var sel = svgedit.math.rectsIntersect(rbb, pt_bb);

						this.select(sel);
						//Note that addPtsToSelection is not being run
						if (sel) {svgedit.path.path.selected_pts.push(seg.index);}
					});

				}
			},
			mouseUp: function(evt, element, mouse_x, mouse_y) {

                path_start_index = -1;
				// Create mode
				if (current_mode === 'path') {
					newPoint = null;
					if (!drawn_path) {
						element = svgedit.utilities.getElem(getId());
						started = false;
						firstCtrl = null;
					}

					return {
						keep: true,
						element: element
					};
				}

				// Edit mode
				if (svgedit.path.path.dragging)
				{
					var last_pt = svgedit.path.path.cur_pt;

					svgedit.path.path.dragging = false;
					svgedit.path.path.dragctrl = false;
					svgedit.path.path.update();

					if (hasMoved) {
						svgedit.path.path.endChanges('Move path point(s)');
					}

					if (!evt.shiftKey && !hasMoved) {
						svgedit.path.path.selectPt(last_pt);
					}
				}
				else if (rubberBox && rubberBox.getAttribute('display') != 'none') {
					// Done with multi-node-select
					rubberBox.setAttribute('display', 'none');

					if (rubberBox.getAttribute('width') <= 2 && rubberBox.getAttribute('height') <= 2 && current_editing_path != evt.target) {
						pathActions.toSelectMode(evt.target);
					}

					// else, move back to select mode
				}
				else
				{
					pathActions.toSelectMode(evt.target);
				}
				hasMoved = false;
			},
			filterPath : function()
			{
				var newPathString = svgedit.path.path.elem.getAttribute('d').replace('M 0 0 M' , 'M');
				svgedit.path.path.elem.setAttribute('d' , newPathString);
			},
			toEditMode: function(element) {
				isDirectToEditPath = false;
				svgedit.path.path = svgedit.path.getPath_(element);
				current_mode = 'pathedit';
				clearSelection();

				current_editing_path = element;

				// Remove redundant path points
				pathActions.filterPath();

				svgedit.path.path.show(false).update();

				var curpath = svgedit.path.getPath_(element);
				for (var i = 0 ; i < curpath.segs.length ; ++i)
				{
					var seg = svgedit.path.path.segs[i];
					seg.cleanupCPFlag();
				}

                /*************************************************************************/

                //console.log('================================ to edit mode');

                //console.log('================================ init state');

				/*
                for (var i = 0 ; i < svgedit.path.path.segs.length ; ++i)
                {
                    var seg = svgedit.path.path.segs[i];
                    console.log(seg.ctrlpts);
                }
				*/

				/*
                // Manage the control points
                for (var i = 0 ; i < svgedit.path.path.segs.length ; ++i)
                {
                    var seg = svgedit.path.path.segs[i];

                    var curItem = $.extend({}, seg.item);

                    //console.log(curItem);

                    if (seg.prev)
                    {
                        var prevItem = $.extend({}, seg.prev.item);

                        if (curItem.x1 == prevItem.x &&
                            curItem.y1 == prevItem.y)
                        {
                            //console.log('===============aaaaaaa: ' + i);
                        	//console.log(curItem);
                        	//console.log(prevItem);
							//console.log('===============bbbbbbb');
                            seg.showCtrlPtsC1(false);
                        }
                    }

                    if (curItem.x2 == curItem.x &&
                        curItem.y2 == curItem.y)
                    {
                        //console.log('===============ccccccc: ' + i);
                        //console.log(curItem);
                        //console.log('===============ddddddd');

                        seg.showCtrlPtsC2(false);
                    }
                }
				*/

                for (var i = 0 ; i < svgedit.path.path.segs.length ; ++i)
                {
                    var seg = svgedit.path.path.segs[i];
                    seg.move(0 , 0);

                    seg.moveCtrl(1 , 0 , 0);
                    seg.moveCtrl(2 , 0 , 0);
                }

                /*
                console.log('================================ over state');
                for (var i = 0 ; i < svgedit.path.path.segs.length ; ++i)
                {
                    var seg = svgedit.path.path.segs[i];
                    console.log(seg.ctrlpts);
                }
				*/
				/*************************************************************************/


				current_editing_path_dbclickcounter = 0;

				svgedit.path.path.show(true).update();
				svgedit.path.path.oldbbox = svgedit.utilities.getBBox(svgedit.path.path.elem);
				subpath = false;

				svgCanvas.updatePathGripSize();

                svgCanvas.exitAddAnchorPoint();

                svgCanvas.exitRemoveAnchorPoint();

                svgCanvas.exitScissoringPath();
			},
			toSelectMode: function(elem) {
				var selPath = (elem == svgedit.path.path.elem);
				current_mode = 'select';
				svgedit.path.path.show(false);
				current_path = false;
				clearSelection();

				current_editing_path = null;

				if (svgedit.path.path.matrix) {
					// Rotated, so may need to re-calculate the center
					svgedit.path.recalcRotatedPath();
				}

				if (selPath) {
					call('selected', [elem]);
					addToSelection([elem], true);
				}
			},
			addSubPath: function(on) {
				if (on) {
					// Internally we go into "path" mode, but in the UI it will
					// still appear as if in "pathedit" mode.
					current_mode = 'path';
					subpath = true;
				} else {
					pathActions.clear(true);
					pathActions.toEditMode(svgedit.path.path.elem);
				}
			},
			select: function(target) {
				if (current_path === target) {
					pathActions.toEditMode(target);
					current_mode = 'pathedit';
				} // going into pathedit mode
				else {
					current_path = target;
				}
			},
			reorient: function() {
				var elem = selectedElements[0];
				if (!elem) {return;}
				var angle = svgedit.utilities.getRotationAngle(elem);
				if (angle == 0) {return;}

				var batchCmd = new svgedit.history.BatchCommand('Reorient path');
				var changes = {
					d: elem.getAttribute('d'),
					transform: elem.getAttribute('transform')
				};
				batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, changes));
				clearSelection();
				this.resetOrientation(elem);

				addCommandToHistory(batchCmd);

				// Set matrix to null
				svgedit.path.getPath_(elem).show(false).matrix = null;

				this.clear();

				addToSelection([elem], true);
				call('changed', selectedElements);
			},

			clear: function(remove) {
				current_path = null;
                isPreparedToDrawPath = true;
                
				if (drawn_path) {
					var elem = svgedit.utilities.getElem(getId());
					$(svgedit.utilities.getElem('path_stretch_line')).remove();
					$(elem).remove();
					$(svgedit.utilities.getElem('pathpointgrip_container')).find('*').attr('display', 'none');
					drawn_path = firstCtrl = null;
					started = false;
				}
				else if (current_mode == 'pathedit')
				{
					this.toSelectMode();
				}
				if (svgedit.path.path)
				{
					svgedit.path.path.init().show(false);
				}

			},
			resetOrientation: function(path) {
				if (path == null || path.nodeName != 'path') {return false;}
				var tlist = svgedit.transformlist.getTransformList(path);
				var m = svgedit.math.transformListToTransform(tlist).matrix;
				tlist.clear();
				path.removeAttribute('transform');
				var segList = path.pathSegList;

				// Opera/win/non-EN throws an error here.
				// TODO: Find out why!
				// Presumed fixed in Opera 10.5, so commented out for now

//			try {
				var len = segList.numberOfItems;
//			} catch(err) {
//				var fixed_d = pathActions.convertPath(path);
//				path.setAttribute('d', fixed_d);
//				segList = path.pathSegList;
//				var len = segList.numberOfItems;
//			}
				var i, last_x, last_y;

				for (i = 0; i < len; ++i) {
					var seg = segList.getItem(i);
					var type = seg.pathSegType;
					if (type == 1) {continue;}
					var pts = [];
					$.each(['',1,2], function(j, n) {
						var x = seg['x'+n], y = seg['y'+n];
						if (x !== undefined && y !== undefined) {
							var pt = svgedit.math.transformPoint(x, y, m);
							pts.splice(pts.length, 0, pt.x, pt.y);
						}
					});
					svgedit.path.replacePathSeg(type, i, pts, path);
				}

				reorientGrads(path, m);
			},
			zoomChange: function() {
				if (current_mode == 'pathedit') {
					svgedit.path.path.update();
				}
			},
			getNodePoint: function() {
				var sel_pt = svgedit.path.path.selected_pts.length ? svgedit.path.path.selected_pts[0] : 1;

				var seg = svgedit.path.path.segs[sel_pt];
				return {
					x: seg.item.x,
					y: seg.item.y,
					type: seg.type
				};
			},
			escapeCallback : function(toHistory)
			{
				if (current_mode == 'path' && drawn_path != null)
				{
					var stretchy = svgedit.utilities.getElem('path_stretch_line');

					var seglist = drawn_path.pathSegList;
					var i = seglist.numberOfItems;
					var FUZZ = pointCheckFuzzDistance / current_zoom / canvasScale;


					// get path element that we are in the process of creating
					id = getId();

					// Remove previous path object if previously created
					svgedit.path.removePath_(id);

					var newpath = svgedit.utilities.getElem(id);
					var newseg;
					var s_seg;
					var len = seglist.numberOfItems;

					if (true)
					{
						// if clicked on any other point but the first OR
						// the first point was clicked on and there are less than 3 points
						// then leave the path open
						// otherwise, close the path
						if (i <= 1 && len >= 2) {
							// Create end segment
							var abs_x = seglist.getItem(0).x;
							var abs_y = seglist.getItem(0).y;

							s_seg = stretchy.pathSegList.getItem(1);
							if (s_seg.pathSegType === 4)
							{
								newseg = drawn_path.createSVGPathSegLinetoAbs(abs_x, abs_y);
							}
							else {
								newseg = drawn_path.createSVGPathSegCurvetoCubicAbs(
									abs_x,
									abs_y,
									s_seg.x1 / current_zoom,
									s_seg.y1 / current_zoom,
									abs_x,
									abs_y
								);
							}

							var endseg = drawn_path.createSVGPathSegClosePath();
							seglist.appendItem(newseg);
							seglist.appendItem(endseg);
						}
						else if (len < 2)
						{
							keep = false;
							return keep;
						}
						$(stretchy).remove();

						// This will signal to commit the path
						element = newpath;
						drawn_path = null;
						started = false;

						/******************************************************************************/
						///*
						// Process all the control point of the new generated path
						var curpath = svgedit.path.getPath_(element);

						for (var i = 0 ; i < curpath.segs.length ; ++i)
						{
							var seg = svgedit.path.path.segs[i];

							var curItem = $.extend({}, seg.item);
							
							if (seg.prev)
							{
								var prevItem = $.extend({}, seg.prev.item);

								if (curItem.x1 == prevItem.x &&
									curItem.y1 == prevItem.y)
								{
									seg.showCtrlPtsC1(false);
								}
							}

							if (curItem.x2 == curItem.x &&
								curItem.y2 == curItem.y)
							{
								seg.showCtrlPtsC2(false);
							}

							seg.move(0 , 0);
						}

						var curpath = svgedit.path.getPath_(element);
						for (var i = 0 ; i < curpath.segs.length ; ++i)
						{
							var seg = svgedit.path.path.segs[i];
							seg.cleanupCPFlag();
						}

						//*/
						/******************************************************************************/
						if (subpath)
						{
							if (svgedit.path.path.matrix) {
								svgedit.coords.remapElement(newpath, {}, svgedit.path.path.matrix.inverse());
							}

							var new_d = newpath.getAttribute('d');
							var orig_d = $(svgedit.path.path.elem).attr('d');
							$(svgedit.path.path.elem).attr('d', orig_d + new_d);
							$(newpath).remove();
							if (svgedit.path.path.matrix) {
								svgedit.path.recalcRotatedPath();
							}
							svgedit.path.path.init();
							pathActions.toEditMode(svgedit.path.path.elem);
							svgedit.path.path.selectPt();
							return false;
						}
					}

					newPoint = null;
					if (!drawn_path)
					{
						element = svgedit.utilities.getElem(getId());
						started = false;
						firstCtrl = null;
					}

					//var selPath = (elem == svgedit.path.path.elem);
					//current_mode = 'select';
					svgedit.path.path.show(false);
					current_path = false;
					clearSelection();

					current_editing_path = null;

					if (svgedit.path.path.matrix)
					{
						// Rotated, so may need to re-calculate the center
						svgedit.path.recalcRotatedPath();
					}
				}

				/******************************************************************************************/
                clearInterval(pathDrawEdgeCheckIdx);

				if (toHistory)
				{
                    var dPathString = element.getAttribute('d');
                    if (pathDrawCmdStack.length > 0)
                    {
                        element.setAttribute('d' , '');

                        for (var i = 0 ; i < pathDrawCmdStack.length ; ++i)
                        {
                            canvas.undoMgr.beginUndoableChange('d', [element]);
                            element.setAttribute('d' , pathDrawCmdStack[i].d);
                            var batchCmd = canvas.undoMgr.finishUndoableChange();
                            batchCmd.prevCmdNums =  pathDrawCmdStack[i].prevCmdNums;

                            if (!batchCmd.isEmpty())
                            {
                                pathDrawPostCmds.push(batchCmd);
                            }
                        }
                    }

                    element.setAttribute('d' , dPathString);

                    pathDrawCmdStack = [];

                    addCommandToHistory(new svgedit.history.InsertElementCommand(element));

                    pathActions.addPostInsertCmds();

                    svgedit.path.path.init();
                    pathActions.toEditMode(svgedit.path.path.elem);
				}
			},
            openClosePaths : function()
			{
                pathActions.opencloseSubPath();
			},
			getSDist : function (p0 , p1)
			{
				return (p0.x - p1.x) * (p0.x - p1.x) + (p0.y - p1.y) * (p0.y - p1.y);
			},
			connectTwoPath : function(path0 , path1 , dstPath)
			{
                var tmpPath0 = svgCanvas.addSvgElementFromJson({
                    'element': 'path',
                    'attr': {
                        'fill': 'none',
                        'stroke': 'none',
						'd' : path0,
                    }
                });

                var tmpPath1 = svgCanvas.addSvgElementFromJson({
                    'element': 'path',
                    'attr': {
                        'fill': 'none',
                        'stroke': 'none',
                        'd' : path1,
                    }
                });

                var path0_Start = tmpPath0.pathSegList.getItem(0);
                var path0_End = tmpPath0.pathSegList.getItem(tmpPath0.pathSegList.numberOfItems - 1);

                var path1_Start = tmpPath1.pathSegList.getItem(0);
                var path1_End = tmpPath1.pathSegList.getItem(tmpPath1.pathSegList.numberOfItems - 1);

                var newPath0 , newPath1;
                if (pathActions.getSDist(path0_End , path1_Start) <= pathOverlappedCheckSquareDist)
				{
                    path1_Start.x = path0_End.x;
                    path1_Start.y = path0_End.y;

                    newPath0 = path0;
                    newPath1 = tmpPath1.getAttribute('d');
				}
				else if (pathActions.getSDist(path0_End , path1_End) <= pathOverlappedCheckSquareDist)
				{
                    path1_End.x = path0_End.x;
                    path1_End.y = path0_End.y;

                    newPath0 = path0;
                    newPath1 = SVGPathEditor.reverse(tmpPath1.getAttribute('d')).replace('Z' , ''); // Reverse;
				}
				else if (pathActions.getSDist(path0_Start , path1_Start) <= pathOverlappedCheckSquareDist)
				{
                    path1_Start.x = path0_Start.x;
                    path1_Start.y = path0_Start.y;

                    newPath0 = SVGPathEditor.reverse(path0).replace('Z' , ''); // Reverse;
                    newPath1 = tmpPath1.getAttribute('d');
				}
				else //(pathActions.getSDist(path0_Start , path1_End) <= pathOverlappedCheckSquareDist)
				{
                    path1_End.x = path0_Start.x;
                    path1_End.y = path0_Start.y;

                    newPath0 = SVGPathEditor.reverse(path0).replace('Z' , ''); // Reverse;
                    newPath1 = SVGPathEditor.reverse(tmpPath1.getAttribute('d')).replace('Z' , ''); // Reverse;
				}

				var clipPath = newPath1.substring(newPath1.indexOf('C') , newPath1.length);

				//console.log(newPath0);
                //console.log(newPath1);
                //console.log(clipPath);
                //console.log(newPath0 + clipPath);



				//canvas.undoMgr.beginUndoableChange('d', svgedit.path.path.elem);

                svgedit.path.path.elem.setAttribute('d' , newPath0 + clipPath);
                svgedit.path.path.init();

				//addCommandToHistory(canvas.undoMgr.finishUndoableChange());

                tmpPath0.parentNode.removeChild(tmpPath0);
                tmpPath1.parentNode.removeChild(tmpPath1);

				if (true)
				{
                    canvas.undoMgr.beginUndoableChange('d', [dstPath]);
                    dstPath.setAttribute('d' , '');
                    var batchCmd = canvas.undoMgr.finishUndoableChange();
                    batchCmd.prevCmdNums = 1;
                    addCommandToHistory(batchCmd);
				}
				else
				{
                    if (dstPath)
                    {
                        dstPath.parentNode.removeChild(dstPath);
                    }
				}

				return newPath0 + clipPath;
			},
            connectAnchorPoints : function()
            {
				 if (svgedit.path.path.selected_pts.length != 2)
				 {
				 	$.alert("请选中两个合法的顶点然后做连接操作");
				 }
				 else
				 {
					 console.log(' ' + svgedit.path.path.segs.length + ', ' + svgedit.path.path.selected_pts[0] + ", " + svgedit.path.path.selected_pts[1]);

					 var ptidx0= svgedit.path.path.selected_pts[0];
					 var ptidx1= svgedit.path.path.selected_pts[1];

					 var seg0 = svgedit.path.path.segs[svgedit.path.path.selected_pts[0]];
					 var seg1 = svgedit.path.path.segs[svgedit.path.path.selected_pts[1]];

					 console.log(seg0);
					 console.log(seg1);

					 if ((seg0.prev != null && seg0.next != null) ||
						 (seg1.prev != null && seg1.next != null))
					 {
						 $.alert("请选中两个末端的顶点然后做连接操作");

						 return;
					 }

					 //return;

					 var subPaths = [];

                     var initPath = svgedit.path.path.elem.getAttribute('d');
                     var splitPaths = initPath.split('M');
                     var newPath = '';
					 var counter = 0;
                     for (var i = 0 ; i < splitPaths.length ; ++i)
                     {
                         if (splitPaths[i].length > 0)
                         {
							 console.log('======================' + splitPaths[i]);

							 var tmpPath = svgCanvas.addSvgElementFromJson({
								 'element': 'path',
								 'attr': {
									 'fill': '#fff',
									 'stroke': '#fff'
								 }
							 });

							 svgedit.utilities.assignAttributes(tmpPath, {
								 'd' : 'M' + splitPaths[i] ,
							 });

							 subPaths.push({d: splitPaths[i] , pathSeg: tmpPath.pathSegList , min: counter , max: counter + tmpPath.pathSegList.numberOfItems});

							 console.log(subPaths[subPaths.length - 1]);

							 counter += tmpPath.pathSegList.numberOfItems;

							 tmpPath.parentNode.removeChild(tmpPath);
                         }
                     }

					 var p0seg , p1seg;

					 for (var i = 0 ; i < subPaths.length ; ++i)
					 {
						 if (subPaths[i].min <= ptidx0 && ptidx0 < subPaths[i].max)
						 {
							 p0seg = i;
							 break;
						 }
					 }

					 for (var i = 0 ; i < subPaths.length ; ++i)
					 {
						 if (subPaths[i].min <= ptidx1 && ptidx1 < subPaths[i].max)
						 {
							 p1seg = i;
							 break;
						 }
					 }

					 if (p0seg == p1seg)
					 {
						 newPath = '';

						 for (var i = 0 ; i < subPaths.length ; ++i)
						 {
						 	var connectPath = '';

							if (i == p0seg)
							{
								var openPathString = svgedit.path.path.elem.getAttribute('d');

								var cp0 = subPaths[i].pathSeg.getItem(subPaths[i].pathSeg.numberOfItems - 1);
								var cp1 = subPaths[i].pathSeg.getItem(0);

								connectPath = ' C' + cp0.x + ' ' + cp0.y + ' ' + cp1.x + ' ' + cp1.y + ' ' + cp1.x + ' ' + cp1.y + ' Z';
							}
							else
							{

							}

							newPath += ('M' + subPaths[i].d + (connectPath));
						 }

						 svgedit.path.path.elem.setAttribute('d' , newPath);

						 svgedit.path.path.init();
					 }
					 else
					 {
						 var segPaths = new Array(2);
						 var newPaths = new Array(2);

						 if (Math.abs(ptidx0 - ptidx1) == 1)
						 {
							 newPaths[0] = subPaths[p0seg].d;
							 newPaths[1] = subPaths[p1seg].d;
							 segPaths[0] = subPaths[p0seg];
							 segPaths[1] = subPaths[p1seg];
						 }
						 else if ((ptidx0 == 0 && ptidx1 == svgedit.path.path.segs.length - 1) ||
							 (ptidx1 == 0 && ptidx0 == svgedit.path.path.segs.length - 1))
						 {
							 newPaths[0] = subPaths[p1seg].d;
							 newPaths[1] = subPaths[p0seg].d;

							 segPaths[0] = subPaths[p1seg];
							 segPaths[1] = subPaths[p0seg];
						 }
						 else if (ptidx0 == 0 || ptidx1 == 0)
						 {
							 newPaths[0] = SVGPathEditor.reverse('M' + subPaths[p0seg].d).replace('Z' , ''); // Reverse
							 newPaths[1] = subPaths[p1seg].d;

							 segPaths[0] = subPaths[p0seg];
							 segPaths[1] = subPaths[p1seg];
						 }
						 else if (ptidx0 == svgedit.path.path.segs.length - 1 || ptidx1 == svgedit.path.path.segs.length - 1)
						 {
							 newPaths[0] = subPaths[p0seg].d;
							 newPaths[1] = SVGPathEditor.reverse('M' + subPaths[p1seg].d).replace('Z' , ''); // Reverse

							 segPaths[0] = subPaths[p0seg];
							 segPaths[1] = subPaths[p1seg];
						 }

						 var cp0 = segPaths[0].pathSeg.getItem(segPaths[0].pathSeg.numberOfItems - 1);
						 var cp1 = segPaths[1].pathSeg.getItem(0);
						 newPath = 'M' + newPaths[0] + ' C' + cp0.x + ' ' + cp0.y + ' ' + cp1.x + ' ' + cp1.y + ' ' + newPaths[1];

						 console.log(segPaths[1].pathSeg);

						 for (var i = 0 ; i < subPaths.length ; ++i)
						 {
							 if (i != p1seg && i != p0seg)
							 {
								 newPath += 'M' + subPaths[i].d;
							 }
						 }

						 svgedit.path.path.elem.setAttribute('d' , newPath);

						 svgedit.path.path.init();
					 }
				 }
            },
            groupPathElements : function()
			{
				var pathString = '';

				if (selectedElements.length > 0)
				{
                    for (var i = 0 ; i < selectedElements.length ; ++i)
                    {
                        pathString += selectedElements[i].getAttribute('d');

                        if (i > 0)
                        {
                            //selectedElements[i].remove();
							selectedElements[i].parentNode.removeChild(selectedElements[i]);
                        }
                    }

                    selectedElements[0].setAttribute('d', pathString);
				}

				selectOnly([selectedElements[0]]);

				var curpath = svgedit.path.getPath_(selectedElements[0]);
				for (var i = 0 ; i < curpath.segs.length ; ++i)
				{
					var seg = svgedit.path.path.segs[i];
					seg.cleanupCPFlag();
				}
			},
			addControlPoints: function()
			{
                for (var i = 0 ; i < svgedit.path.path.selected_pts.length ; ++i)
                {
                    var sel_pt = svgedit.path.path.selected_pts[i];
                    var seg = svgedit.path.path.segs[sel_pt];

					var c1 = {x:seg.getPosition().x , y:seg.getPosition().y};
					var c2 = {x:seg.getPosition().x , y:seg.getPosition().y};

					var epsilon = 30.0;

					var vec = {x:0.0 , y:0.0};
					if (seg.prev && seg.next)
					{
						vec.x = seg.prev.getPosition().x - seg.next.getPosition().x;
						vec.y = seg.prev.getPosition().y - seg.next.getPosition().y;

					}
					else if (seg.prev)
					{
						vec.x = seg.getPosition().x1 - seg.getPosition().x;
						vec.y = seg.getPosition().y1 - seg.getPosition().y;
					}
					else if (seg.next)
					{
						vec.x = seg.getPosition().x - seg.next.getPosition().x2;
						vec.y = seg.getPosition().y - seg.next.getPosition().y2;
					}

					var sq = vec.x * vec.x + vec.y * vec.y;

					if (sq > 0.0)
					{
						vec.x /= Math.sqrt(sq);
						vec.y /= Math.sqrt(sq);
					}
					else
					{
						vec.x = 1.0;
						vec.y = 0.0;
					}

					c2.x = vec.x * epsilon + seg.getPosition().x;
					c2.y = vec.y * epsilon + seg.getPosition().y;

					c1.x = -vec.x * epsilon + seg.getPosition().x;
					c1.y = -vec.y * epsilon + seg.getPosition().y;

					seg.setCtrlPtsC2(c2.x , c2.y);
                    seg.showCtrlPtsC2(true);

                    if (seg.next)
                    {
						seg.next.setCtrlPtsC1(c1.x , c1.y);
                        seg.next.showCtrlPtsC1(true);
                    }
                }

				svgCanvas.updatePathGripSize();
			},

			removeControlPoints : function(isPrev)
			{
				for (var i = 0 ; i < svgedit.path.path.selected_pts.length ; ++i)
				{
                    var sel_pt = svgedit.path.path.selected_pts[i];
                    var seg = svgedit.path.path.segs[sel_pt];

					var c1 = {x:seg.getPosition().x , y:seg.getPosition().y};

                    if (isPrev)
                    {
                    	console.log(seg);

                        seg.showCtrlPtsC2(false);
						seg.setCtrlPtsC2(c1.x , c1.y);
                    }
                    else
                    {
                    	if (seg.next)
						{
                            seg.next.showCtrlPtsC1(false);
							seg.next.setCtrlPtsC1(c1.x , c1.y);
						}
                    }

                    seg.move(0 , 0);

                    if (seg.prev)
					{
						seg.prev.move(0 , 0);
					}

					if (seg.next)
					{
						seg.next.move(0 , 0);
					}
				}
			},
			linkControlPoints: function(linkPoints) {
				svgedit.path.setLinkControlPoints(linkPoints);
			},
			insertPathNode: function(nextPt , px , py)
			{
                svgedit.path.path.storeD();

                var sel_pts = [nextPt];
                var segs = svgedit.path.path.segs;

                var i = sel_pts.length;
                var nums = [];

                while (i--) {
                    var pt = sel_pts[i];
                    svgedit.path.path.addSeg(pt);

                    nums.push(pt + i);
                    nums.push(pt + i + 1);
                }
                svgedit.path.path.init().addPtsToSelection(nums);

                svgedit.path.path.endChanges('Clone path node(s)');
			},
			clonePathNode: function() {
				svgedit.path.path.storeD();

				var sel_pts = svgedit.path.path.selected_pts;
				var segs = svgedit.path.path.segs;

				var i = sel_pts.length;
				var nums = [];

				while (i--) {
					var pt = sel_pts[i];
					svgedit.path.path.addSeg(pt);

					nums.push(pt + i);
					nums.push(pt + i + 1);
				}
				svgedit.path.path.init().addPtsToSelection(nums);

				svgedit.path.path.endChanges('Clone path node(s)');
			},
			opencloseSubPath: function() {
				var sel_pts = svgedit.path.path.selected_pts;
				// Only allow one selected node for now
				if (sel_pts.length !== 1) {return;}

				var elem = svgedit.path.path.elem;
				var list = elem.pathSegList;

				var len = list.numberOfItems;

				var index = sel_pts[0];

				var open_pt = null;
				var start_item = null;

				// Check if subpath is already open
				svgedit.path.path.eachSeg(function(i) {
					if (this.type === 2 && i <= index) {
						start_item = this.item;
					}
					if (i <= index) {return true;}
					if (this.type === 2) {
						// Found M first, so open
						open_pt = i;
						return false;
					}
					if (this.type === 1) {
						// Found Z first, so closed
						open_pt = false;
						return false;
					}
				});

				if (open_pt == null) {
					// Single path, so close last seg
					open_pt = svgedit.path.path.segs.length - 1;
				}

				if (open_pt !== false)
				{
					// Close this path
                    var openPathString = svgedit.path.path.elem.getAttribute('d');

                    var cp0 = svgedit.path.path.segs[svgedit.path.path.segs.length - 1].item;
                    var cp1 = svgedit.path.path.segs[0].item;

                    var closePath = ' C' + cp0.x + ' ' + cp0.y + ' ' + cp1.x + ' ' + cp1.y + ' ' + cp1.x + ' ' + cp1.y + ' Z';

                    svgedit.path.path.elem.setAttribute('d' , openPathString + closePath);

                    svgedit.path.path.init();

					/*
					// Create a line going to the previous "M"
					var newseg = elem.createSVGPathSegLinetoAbs(start_item.x, start_item.y);

					var closer = elem.createSVGPathSegClosePath();
					if (open_pt == svgedit.path.path.segs.length - 1) {
						//list.appendItem(newseg);
						list.appendItem(closer);
					}
					else
					{
						svgedit.path.insertItemBefore(elem, closer, open_pt);
						svgedit.path.insertItemBefore(elem, newseg, open_pt);
					}

					svgedit.path.path.init().selectPt(open_pt+1);
					//*/

					return;
				}

				// M 1,1 L 2,2 L 3,3 L 1,1 z // open at 2,2
				// M 2,2 L 3,3 L 1,1

				// M 1,1 L 2,2 L 1,1 z M 4,4 L 5,5 L6,6 L 5,5 z
				// M 1,1 L 2,2 L 1,1 z [M 4,4] L 5,5 L(M)6,6 L 5,5 z

				var seg = svgedit.path.path.segs[index];

				if (seg.mate) {
					list.removeItem(index); // Removes last "L"
					list.removeItem(index); // Removes the "Z"
					svgedit.path.path.init().selectPt(index - 1);
					return;
				}

				var i, last_m, z_seg;

				// Find this sub-path's closing point and remove
				for (i = 0; i<list.numberOfItems; i++) {
					var item = list.getItem(i);

					if (item.pathSegType === 2) {
						// Find the preceding M
						last_m = i;
					} else if (i === index) {
						// Remove it
						list.removeItem(last_m);
//						index--;
					} else if (item.pathSegType === 1 && index < i) {
						// Remove the closing seg of this subpath
						z_seg = i-1;
						list.removeItem(i);
						break;
					}
				}

				var num = (index - last_m) - 1;

				while (num--) {
					svgedit.path.insertItemBefore(elem, list.getItem(last_m), z_seg);
				}

				var pt = list.getItem(last_m);

				// Make this point the new "M"
				svgedit.path.replacePathSeg(2, last_m, [pt.x, pt.y]);

				i = index; // i is local here, so has no effect; what is the reason for this?

				svgedit.path.path.init().selectPt(0);
			},
			deletePathNode: function(_targetNode) {
				if (!pathActions.canDeleteNodes) {return;}
				svgedit.path.path.storeD();

				var sel_pts = _targetNode != null ? _targetNode : svgedit.path.path.selected_pts;
				var i = sel_pts.length;

				while (i--) {
					var pt = sel_pts[i];
					svgedit.path.path.deleteSeg(pt);
				}

				// Cleanup
				var cleanup = function() {
					var segList = svgedit.path.path.elem.pathSegList;
					var len = segList.numberOfItems;

					var remItems = function(pos, count) {
						while (count--) {
							segList.removeItem(pos);
						}
					};

					if (len <= 1) {return true;}

					while (len--) {
						var item = segList.getItem(len);
						if (item.pathSegType === 1) {
							var prev = segList.getItem(len-1);
							var nprev = segList.getItem(len-2);
							if (prev.pathSegType === 2) {
								remItems(len-1, 2);
								cleanup();
								break;
							} else if (nprev.pathSegType === 2) {
								remItems(len-2, 3);
								cleanup();
								break;
							}

						} else if (item.pathSegType === 2) {
							if (len > 0) {
								var prev_type = segList.getItem(len-1).pathSegType;
								// Path has M M
								if (prev_type === 2) {
									remItems(len-1, 1);
									cleanup();
									break;
									// Entire path ends with Z M
								} else if (prev_type === 1 && segList.numberOfItems-1 === len) {
									remItems(len, 1);
									cleanup();
									break;
								}
							}
						}
					}
					return false;
				};

				cleanup();

				// Completely delete a path with 1 or 0 segments
				if (svgedit.path.path.elem.pathSegList.numberOfItems <= 1) {
					pathActions.toSelectMode(svgedit.path.path.elem);
					canvas.deleteSelectedElements();
					return;
				}

				svgedit.path.path.init();
				svgedit.path.path.clearSelection();

				// TODO: Find right way to select point now
				// path.selectPt(sel_pt);
				if (window.opera) { // Opera repaints incorrectly
					var cp = $(svgedit.path.path.elem);
					cp.attr('d', cp.attr('d'));
				}
				svgedit.path.path.endChanges('Delete path node(s)');
			},
			smoothPolylineIntoPath: smoothPolylineIntoPath,
			setSegType: function(v) {
				svgedit.path.path.setSegType(v);
			},
			moveNode: function(attr, newValue) {
				var sel_pts = svgedit.path.path.selected_pts;
				if (!sel_pts.length) {return;}

				svgedit.path.path.storeD();

				// Get first selected point
				var seg = svgedit.path.path.segs[sel_pts[0]];
				var diff = {x:0, y:0};
				diff[attr] = newValue - seg.item[attr];

				seg.move(diff.x, diff.y);
				svgedit.path.path.endChanges('Move path point');
			},
			fixEnd: function(elem) {
				// Adds an extra segment if the last seg before a Z doesn't end
				// at its M point
				// M0,0 L0,100 L100,100 z
				var segList = elem.pathSegList;
				var len = segList.numberOfItems;
				var i, last_m;
				for (i = 0; i < len; ++i) {
					var item = segList.getItem(i);
					if (item.pathSegType === 2) {
						last_m = item;
					}

					if (item.pathSegType === 1) {
						var prev = segList.getItem(i-1);
						if (prev.x != last_m.x || prev.y != last_m.y) {
							// Add an L segment here
							var newseg = elem.createSVGPathSegLinetoAbs(last_m.x, last_m.y);
							svgedit.path.insertItemBefore(elem, newseg, i);
							// Can this be done better?
							pathActions.fixEnd(elem);
							break;
						}

					}
				}
				if (svgedit.browser.isWebkit()) {resetD(elem);}
			},
			// Convert a path to one with only absolute or relative values
			convertPath: function(path, toRel) {
				var i;
				var segList = path.pathSegList;
				var len = segList.numberOfItems;
				var curx = 0, cury = 0;
				var d = '';
				var last_m = null;

				for (i = 0; i < len; ++i) {
					var seg = segList.getItem(i);
					// if these properties are not in the segment, set them to zero
					var x = seg.x || 0,
						y = seg.y || 0,
						x1 = seg.x1 || 0,
						y1 = seg.y1 || 0,
						x2 = seg.x2 || 0,
						y2 = seg.y2 || 0;

					var type = seg.pathSegType;
					var letter = pathMap[type]['to'+(toRel?'Lower':'Upper')+'Case']();

					var addToD = function(pnts, more, last) {
						var str = '';
						more = more ? ' ' + more.join(' ') : '';
						last = last ? ' ' + svgedit.units.shortFloat(last) : '';
						$.each(pnts, function(i, pnt) {
							pnts[i] = svgedit.units.shortFloat(pnt);
						});
						d += letter + pnts.join(' ') + more + last;
					};

					switch (type) {
						case 1: // z,Z closepath (Z/z)
							d += 'z';
							break;
						case 12: // absolute horizontal line (H)
							x -= curx;
						case 13: // relative horizontal line (h)
							if (toRel) {
								curx += x;
								letter = 'l';
							} else {
								x += curx;
								curx = x;
								letter = 'L';
							}
							// Convert to "line" for easier editing
							addToD([[x, cury]]);
							break;
						case 14: // absolute vertical line (V)
							y -= cury;
						case 15: // relative vertical line (v)
							if (toRel) {
								cury += y;
								letter = 'l';
							} else {
								y += cury;
								cury = y;
								letter = 'L';
							}
							// Convert to "line" for easier editing
							addToD([[curx, y]]);
							break;
						case 2: // absolute move (M)
						case 4: // absolute line (L)
						case 18: // absolute smooth quad (T)
							x -= curx;
							y -= cury;
						case 5: // relative line (l)
						case 3: // relative move (m)
							// If the last segment was a "z", this must be relative to
							if (last_m && segList.getItem(i-1).pathSegType === 1 && !toRel) {
								curx = last_m[0];
								cury = last_m[1];
							}

						case 19: // relative smooth quad (t)
							if (toRel) {
								curx += x;
								cury += y;
							} else {
								x += curx;
								y += cury;
								curx = x;
								cury = y;
							}
							if (type === 3) {last_m = [curx, cury];}

							addToD([[x, y]]);
							break;
						case 6: // absolute cubic (C)
							x -= curx; x1 -= curx; x2 -= curx;
							y -= cury; y1 -= cury; y2 -= cury;
						case 7: // relative cubic (c)
							if (toRel) {
								curx += x;
								cury += y;
							} else {
								x += curx; x1 += curx; x2 += curx;
								y += cury; y1 += cury; y2 += cury;
								curx = x;
								cury = y;
							}
							addToD([[x1, y1], [x2, y2], [x, y]]);
							break;
						case 8: // absolute quad (Q)
							x -= curx; x1 -= curx;
							y -= cury; y1 -= cury;
						case 9: // relative quad (q)
							if (toRel) {
								curx += x;
								cury += y;
							} else {
								x += curx; x1 += curx;
								y += cury; y1 += cury;
								curx = x;
								cury = y;
							}
							addToD([[x1, y1],[x, y]]);
							break;
						case 10: // absolute elliptical arc (A)
							x -= curx;
							y -= cury;
						case 11: // relative elliptical arc (a)
							if (toRel) {
								curx += x;
								cury += y;
							} else {
								x += curx;
								y += cury;
								curx = x;
								cury = y;
							}
							addToD([[seg.r1, seg.r2]], [
									seg.angle,
									(seg.largeArcFlag ? 1 : 0),
									(seg.sweepFlag ? 1 : 0)
								], [x, y]
							);
							break;
						case 16: // absolute smooth cubic (S)
							x -= curx; x2 -= curx;
							y -= cury; y2 -= cury;
						case 17: // relative smooth cubic (s)
							if (toRel) {
								curx += x;
								cury += y;
							} else {
								x += curx; x2 += curx;
								y += cury; y2 += cury;
								curx = x;
								cury = y;
							}
							addToD([[x2, y2],[x, y]]);
							break;
					} // switch on path segment type
				} // for each segment
				return d;
			}
		};
	}();
// end pathActions

// Group: Serialization

// Function: removeUnusedDefElems
// Looks at DOM elements inside the <defs> to see if they are referred to,
// removes them from the DOM if they are not.
//
// Returns:
// The amount of elements that were removed
	var removeUnusedDefElems = this.removeUnusedDefElems = function() {
		var defs = svgcontent.getElementsByTagNameNS(NS.SVG, 'defs');
		if (!defs || !defs.length) {return 0;}

//	if (!defs.firstChild) {return;}

		var defelem_uses = [],
			numRemoved = 0;
		var attrs = ['fill', 'stroke', 'filter', 'marker-start', 'marker-mid', 'marker-end'];
		var alen = attrs.length;

		var all_els = svgcontent.getElementsByTagNameNS(NS.SVG, '*');
		var all_len = all_els.length;

		var i, j;
		for (i = 0; i < all_len; i++) {
			var el = all_els[i];
			for (j = 0; j < alen; j++) {
				var ref = svgedit.utilities.getUrlFromAttr(el.getAttribute(attrs[j]));
				if (ref) {
					defelem_uses.push(ref.substr(1));
				}
			}

			// gradients can refer to other gradients
			var href = getHref(el);
			if (href && href.indexOf('#') === 0) {
				defelem_uses.push(href.substr(1));
			}
		}

		var defelems = $(defs).find('linearGradient, radialGradient, filter, marker, svg, symbol');
		i = defelems.length;
		while (i--) {
			var defelem = defelems[i];
			var id = defelem.id;
			if (defelem_uses.indexOf(id) < 0) {
				// Not found, so remove (but remember)
				removedElements[id] = defelem;
				defelem.parentNode.removeChild(defelem);
				numRemoved++;
			}
		}

		return numRemoved;
	};

// Function: svgCanvasToString
// Main function to set up the SVG content for output
//
// Returns:
// String containing the SVG image for output
	this.svgCanvasToString = function(actualSize) {
		// keep calling it until there are none to remove
		while (removeUnusedDefElems() > 0) {}

		pathActions.clear(true);

		// Keep SVG-Edit comment on top
		$.each(svgcontent.childNodes, function(i, node) {
			if (i && node.nodeType === 8 && node.data.indexOf('Created with') >= 0) {
				svgcontent.insertBefore(node, svgcontent.firstChild);
			}
		});

		// Move out of in-group editing mode
		console.log(current_group);
		if (current_group) {
			leaveContext();
			selectOnly([current_group]);
		}

		var naked_svgs = [];

		// Unwrap gsvg if it has no special attributes (only id and style)
		$(svgcontent).find('g:data(gsvg)').each(function() {
			var attrs = this.attributes;
			var len = attrs.length;
			var i;
			for (i = 0; i < len; i++) {
				if (attrs[i].nodeName == 'id' || attrs[i].nodeName == 'style') {
					len--;
				}
			}
			// No significant attributes, so ungroup
			if (len <= 0) {
				var svg = this.firstChild;
				naked_svgs.push(svg);
				$(this).replaceWith(svg);
			}
		});

		var output = this.svgToString(svgcontent, 0 , actualSize);

		// Rewrap gsvg
		if (naked_svgs.length) {
			$(naked_svgs).each(function() {
				groupSvgElem(this);
			});
		}

		return output;
	};

// Function: svgToString
// Sub function ran on each SVG element to convert it to a string as desired
//
// Parameters:
// elem - The SVG element to convert
// indent - Integer with the amount of spaces to indent this tag
//
// Returns:
// String with the given element as an SVG tag
	this.svgToString = function(elem, indent , actualSize) {
		var out = [],
			toXml = svgedit.utilities.toXml;
		var unit = curConfig.baseUnit;
		var unit_re = new RegExp('^-?[\\d\\.]+' + unit + '$');

		if (elem) {
			cleanupElement(elem);
			var attrs = elem.attributes,
				attr,
				i,
				childs = elem.childNodes;

			for (i = 0; i < indent; i++) {out.push(' ');}
			out.push('<'); out.push(elem.nodeName);
			if (elem.id === 'svgcontent') {
				// Process root element separately
				var res = getResolution(actualSize);

                console.log(res);

				var vb = '';
				// TODO: Allow this by dividing all values by current baseVal
				// Note that this also means we should properly deal with this on import
//			if (curConfig.baseUnit !== 'px') {
//				var unit = curConfig.baseUnit;
//				var unit_m = svgedit.units.getTypeMap()[unit];
//				res.w = svgedit.units.shortFloat(res.w / unit_m)
//				res.h = svgedit.units.shortFloat(res.h / unit_m)
//				vb = ' viewBox="' + [0, 0, res.w, res.h].join(' ') + '"';
//				res.w += unit;
//				res.h += unit;
//			}

                vb = ' viewBox="' + [res.x, res.y, res.w, res.h].join(' ') + '"';
				if (unit !== 'px') {
					res.w = svgedit.units.convertUnit(res.w, unit) + unit;
					res.h = svgedit.units.convertUnit(res.h, unit) + unit;
				}

				console.log(res);

				out.push(' width="' + res.w + '" height="' + res.h + '"' + vb + ' xmlns="'+NS.SVG+'"');
                //out.push(' x="' + res.x + '" y="' + res.y + '" width="' + res.w + '" height="' + res.h + '"' + vb + ' xmlns="'+NS.SVG+'"');

				console.log(out);

				var nsuris = {};

				// Check elements for namespaces, add if found
				$(elem).find('*').andSelf().each(function() {
					var el = this;
					// for some elements have no attribute
					var uri = this.namespaceURI;
					if(uri && !nsuris[uri] && nsMap[uri] && nsMap[uri] !== 'xmlns' && nsMap[uri] !== 'xml' ) {
						nsuris[uri] = true;
						out.push(' xmlns:' + nsMap[uri] + '="' + uri +'"');
					}

					$.each(this.attributes, function(i, attr) {
						var uri = attr.namespaceURI;
						if (uri && !nsuris[uri] && nsMap[uri] !== 'xmlns' && nsMap[uri] !== 'xml' ) {
							nsuris[uri] = true;
							out.push(' xmlns:' + nsMap[uri] + '="' + uri +'"');
						}
					});
				});

				i = attrs.length;
				var attr_names = ['width', 'height', 'xmlns', 'x', 'y', 'viewBox', 'id', 'overflow'];
				while (i--) {
					attr = attrs.item(i);
					var attrVal = toXml(attr.value);

					// Namespaces have already been dealt with, so skip
					if (attr.nodeName.indexOf('xmlns:') === 0) {continue;}

					// only serialize attributes we don't use internally
					if (attrVal != '' && attr_names.indexOf(attr.localName) == -1) {

						if (!attr.namespaceURI || nsMap[attr.namespaceURI]) {
							out.push(' ');
							out.push(attr.nodeName); out.push('="');
							out.push(attrVal); out.push('"');
						}
					}
				}

				console.log(out);
			} else {
				// Skip empty defs
				if (elem.nodeName === 'defs' && !elem.firstChild) {return;}

				var moz_attrs = ['-moz-math-font-style', '_moz-math-font-style'];
				for (i = attrs.length - 1; i >= 0; i--) {
					attr = attrs.item(i);
					var attrVal = toXml(attr.value);
					//remove bogus attributes added by Gecko
					if (moz_attrs.indexOf(attr.localName) >= 0) {continue;}
					if (attrVal != '') {
						if (attrVal.indexOf('pointer-events') === 0) {continue;}
						if (attr.localName === 'class' && attrVal.indexOf('se_') === 0) {continue;}
						out.push(' ');
						if (attr.localName === 'd') {attrVal = pathActions.convertPath(elem, true);}
						if (!isNaN(attrVal)) {
							attrVal = svgedit.units.shortFloat(attrVal);
						} else if (unit_re.test(attrVal)) {
							attrVal = svgedit.units.shortFloat(attrVal) + unit;
						}

						// Embed images when saving
						if (save_options.apply
							&& elem.nodeName === 'image'
							&& attr.localName === 'href'
							&& save_options.images
							&& save_options.images === 'embed')
						{
							var img = encodableImages[attrVal];
							if (img) {attrVal = img;}
						}

						// map various namespaces to our fixed namespace prefixes
						// (the default xmlns attribute itself does not get a prefix)
						if (!attr.namespaceURI || attr.namespaceURI == NS.SVG || nsMap[attr.namespaceURI]) {
							out.push(attr.nodeName); out.push('="');
							out.push(attrVal); out.push('"');
						}
					}
				}
			}

			if (elem.hasChildNodes()) {
				out.push('>');
				indent++;
				var bOneLine = false;

				for (i = 0; i < childs.length; i++) {
					var child = childs.item(i);
					switch(child.nodeType) {
						case 1: // element node
							out.push('\n');
							out.push(this.svgToString(childs.item(i), indent));
							break;
						case 3: // text node
							var str = child.nodeValue.replace(/^\s+|\s+$/g, '');
							if (str != '') {
								bOneLine = true;
								out.push(String(toXml(str)));
							}
							break;
						case 4: // cdata node
							out.push('\n');
							out.push(new Array(indent+1).join(' '));
							out.push('<![CDATA[');
							out.push(child.nodeValue);
							out.push(']]>');
							break;
						case 8: // comment
							out.push('\n');
							out.push(new Array(indent+1).join(' '));
							out.push('<!--');
							out.push(child.data);
							out.push('-->');
							break;
					} // switch on node type
				}
				indent--;
				if (!bOneLine) {
					out.push('\n');
					for (i = 0; i < indent; i++) {out.push(' ');}
				}
				out.push('</'); out.push(elem.nodeName); out.push('>');
			} else {
				out.push('/>');
			}
		}
		return out.join('');
	}; // end svgToString()

// Function: embedImage
// Converts a given image file to a data URL when possible, then runs a given callback
//
// Parameters:
// val - String with the path/URL of the image
// callback - Optional function to run when image data is found, supplies the
// result (data URL or false) as first parameter.
	this.embedImage = function(val, callback) {
		// load in the image and once it's loaded, get the dimensions
		$(new Image()).load(function() {
			// create a canvas the same size as the raster image
			var canvas = document.createElement('canvas');
			canvas.width = this.width;
			canvas.height = this.height;
			// load the raster image into the canvas
			canvas.getContext('2d').drawImage(this, 0, 0);
			// retrieve the data: URL
			try {
				var urldata = ';svgedit_url=' + encodeURIComponent(val);
				urldata = canvas.toDataURL().replace(';base64', urldata+';base64');
				encodableImages[val] = urldata;
			} catch(e) {
				encodableImages[val] = false;
			}
			last_good_img_url = val;
			if (callback) {callback(encodableImages[val]);}
		}).attr('src', val);
	};

// Function: setGoodImage
// Sets a given URL to be a "last good image" URL
	this.setGoodImage = function(val) {
		last_good_img_url = val;
	};

	this.open = function() {
		// Nothing by default, handled by optional widget/extension
	};

// Function: save
// Serializes the current drawing into SVG XML text and returns it to the 'saved' handler.
// This function also includes the XML prolog. Clients of the SvgCanvas bind their save
// function to the 'saved' event.
//
// Returns:
// Nothing

    function saveAndDownload(filename, text)
	{
        var pom = document.createElement('a');
        pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        pom.setAttribute('download', filename);

        if (document.createEvent) {
            var event = document.createEvent('MouseEvents');
            event.initEvent('click', true, true);
            pom.dispatchEvent(event);
        }
        else {
            pom.click();
        }
    }
    this.saveImg = function (filename, text)
    {
        var pom = document.createElement('a');
        pom.setAttribute('href', text);
        pom.setAttribute('download',"");

        if (document.createEvent) {
            var event = document.createEvent('MouseEvents');
            event.initEvent('click', true, true);
            pom.dispatchEvent(event);
        }
        else {
            pom.click();
        }
    }
    this.checkoutFromServerAuto = function()
    {
        svgEditor.getNetHelper().downloadProject(function(data)
        {
            if (data != null)
            {
                svgEditor.checkoutProjectFromServer({svgContent : data});
            }
        });
    }

    this.checkoutFromServer = function()
	{
        svgEditor.checkoutPrep(function(ok)
        {
            if (!ok)
            {
            	return;
            }

            svgEditor.getNetHelper().downloadProject(function(data)
            {
            	if (data != null)
				{
                    svgEditor.checkoutProjectFromServer({svgContent : data});
				}
            });
        });
	}

    this.recoverFromServer = function()
    {
    	console.log('-------------------------------');
        svgEditor.recoverPrep(function(ok)
        {
            if (!ok)
            {
                return;
            }

            svgEditor.getNetHelper().downloadProjectTemp(function(data)
            {
                if (data != null)
                {
                    svgEditor.recoverProjectFromServer({svgContent : data});
                }
            });
        });
    }

    this.submitToServerTemp = function()
    {
		// Only synchronize when user do something
		if (canvas.undoMgr.getUndoStackSize() > 1)
		{
            var saveOpts =
                {
                    'images': $.pref('img_save'),
                    'round_digits': 6
                };

            clearSelection();
            // Update save options if provided
            if (saveOpts)
            {
                $.extend(save_options, saveOpts);
            }
            save_options.apply = true;

            // no need for doctype, see http://jwatt.org/svg/authoring/#doctype-declaration
            var svgContentString = this.svgCanvasToString();

            svgEditor.getNetHelper().uploadProjectTemp(svgContentString);
		}
    }

    this.submitToServer = function()
	{
        var saveOpts =
			{
            	'images': $.pref('img_save'),
            	'round_digits': 6
        	};

        clearSelection();
        // Update save options if provided
        if (saveOpts)
        {
        	$.extend(save_options, saveOpts);
        }
        save_options.apply = true;

        // no need for doctype, see http://jwatt.org/svg/authoring/#doctype-declaration
        var svgContentString = this.svgCanvasToString();

		console.log(svgContentString);

        svgEditor.getNetHelper().uploadProject(svgContentString);
	}

	this.save = function(opts) {
		// remove the selected outline before serializing
		clearSelection();
		// Update save options if provided
		if (opts) {$.extend(save_options, opts);}
		save_options.apply = true;

		// no need for doctype, see http://jwatt.org/svg/authoring/#doctype-declaration
		var str = this.svgCanvasToString();
		//call('saved', str);

        var currentDate = new Date();
        var imgName = currentDate.getFullYear() + '.' + (currentDate.getMonth() + 1)  + '.' + currentDate.getDate() + '-' + currentDate.getHours() + '.' + currentDate.getMinutes() + '.' + currentDate.getSeconds() + '.svg';

        saveAndDownload(imgName , str);
	};

	function getIssues () {
		// remove the selected outline before serializing
		clearSelection();

		// Check for known CanVG issues
		var issues = [];

		// Selector and notice
		var issue_list = {
			'feGaussianBlur': uiStrings.exportNoBlur,
			'foreignObject': uiStrings.exportNoforeignObject,
			'[stroke-dasharray]': uiStrings.exportNoDashArray
		};
		var content = $(svgcontent);

		// Add font/text check if Canvas Text API is not implemented
		if (!('font' in $('<canvas>')[0].getContext('2d'))) {
			issue_list.text = uiStrings.exportNoText;
		}

		$.each(issue_list, function(sel, descr) {
			if (content.find(sel).length) {
				issues.push(descr);
			}
		});
		return issues;
	}

	this.preBitmapRaster = function()
	{
		bitmapUtils.preBitmapRaster();
	}

// Function: rasterExport
// Generates a Data URL based on the current image, then calls "exported"
// with an object including the string, image information, and any issues found
	this.rasterExport = function(imgType, quality, exportWindowName, rasterCallback) {
		var mimeType = 'image/' + imgType.toLowerCase();
		var issues = getIssues();
		var str = this.svgCanvasToString();

		svgedit.utilities.buildCanvgCallback(function () {
			var type = imgType || 'PNG';
			if (!$('#export_canvas').length) {
				$('<canvas>', {id: 'export_canvas'}).hide().appendTo('body');
			}
			var c = $('#export_canvas')[0];
			c.width = svgCanvas.contentW;
			c.height = svgCanvas.contentH;

			canvg(c, str, {renderCallback: function() {
				var dataURLType = (type === 'ICO' ? 'BMP' : type).toLowerCase();
				var datauri = quality ? c.toDataURL('image/' + dataURLType, quality) : c.toDataURL('image/' + dataURLType);

				if (exportWindowName != undefined)
				{
					call('exported', {datauri: datauri, svg: str, issues: issues, type: imgType, mimeType: mimeType, quality: quality, exportWindowName: exportWindowName});
				}

				if (rasterCallback != undefined)
				{
					rasterCallback(datauri);
				}
			}});
		})();
	};

	this.exportPDF = function (exportWindowName, outputType) {
		var that = this;
		svgedit.utilities.buildJSPDFCallback(function () {
			var res = getResolution();
			var orientation = res.w > res.h ? 'landscape' : 'portrait';
			var units = 'pt'; // curConfig.baseUnit; // We could use baseUnit, but that is presumably not intended for export purposes
			var doc = jsPDF({
				orientation: orientation,
				unit: units,
				format: [res.w, res.h]
				// , compressPdf: true
			}); // Todo: Give options to use predefined jsPDF formats like "a4", etc. from pull-down (with option to keep customizable)
			var docTitle = getDocumentTitle();
			doc.setProperties({
				title: docTitle/*,
				 subject: '',
				 author: '',
				 keywords: '',
				 creator: ''*/
			});
			var issues = getIssues();
			var str = that.svgCanvasToString();
			doc.addSVG(str, 0, 0);

			// doc.output('save'); // Works to open in a new
			//  window; todo: configure this and other export
			//  options to optionally work in this manner as
			//  opposed to opening a new tab
			var obj = {svg: str, issues: issues, exportWindowName: exportWindowName};
			var method = outputType || 'dataurlstring';
			obj[method] = doc.output(method);
			call('exportedPDF', obj);
		})();
	};

// Function: getSvgString
// Returns the current drawing as raw SVG XML text.
//
// Returns:
// The current drawing as raw SVG XML text.
	this.getSvgString = function() {
		save_options.apply = false;
		return this.svgCanvasToString();
	};

// Function: randomizeIds
// This function determines whether to use a nonce in the prefix, when
// generating IDs for future documents in SVG-Edit.
//
// Parameters:
// an optional boolean, which, if true, adds a nonce to the prefix. Thus
// svgCanvas.randomizeIds() <==> svgCanvas.randomizeIds(true)
//
// if you're controlling SVG-Edit externally, and want randomized IDs, call
// this BEFORE calling svgCanvas.setSvgString
//
	this.randomizeIds = function(enableRandomization) {
		if (arguments.length > 0 && enableRandomization == false) {
			svgedit.draw.randomizeIds(false, getCurrentDrawing());
		} else {
			svgedit.draw.randomizeIds(true, getCurrentDrawing());
		}
	};

// Function: uniquifyElems
// Ensure each element has a unique ID
//
// Parameters:
// g - The parent element of the tree to give unique IDs
	var uniquifyElems = this.uniquifyElems = function(g) {
		var ids = {};
		// TODO: Handle markers and connectors. These are not yet re-identified properly
		// as their referring elements do not get remapped.
		//
		// <marker id='se_marker_end_svg_7'/>
		// <polyline id='svg_7' se:connector='svg_1 svg_6' marker-end='url(#se_marker_end_svg_7)'/>
		//
		// Problem #1: if svg_1 gets renamed, we do not update the polyline's se:connector attribute
		// Problem #2: if the polyline svg_7 gets renamed, we do not update the marker id nor the polyline's marker-end attribute
		var ref_elems = ['filter', 'linearGradient', 'pattern',	'radialGradient', 'symbol', 'textPath', 'use'];

		svgedit.utilities.walkTree(g, function(n) {
			// if it's an element node
			if (n.nodeType == 1) {
				// and the element has an ID
				if (n.id) {
					// and we haven't tracked this ID yet
					if (!(n.id in ids)) {
						// add this id to our map
						ids[n.id] = {elem:null, attrs:[], hrefs:[]};
					}
					ids[n.id].elem = n;
				}

				// now search for all attributes on this element that might refer
				// to other elements
				$.each(ref_attrs, function(i, attr) {
					var attrnode = n.getAttributeNode(attr);
					if (attrnode) {
						// the incoming file has been sanitized, so we should be able to safely just strip off the leading #
						var url = svgedit.utilities.getUrlFromAttr(attrnode.value),
							refid = url ? url.substr(1) : null;
						if (refid) {
							if (!(refid in ids)) {
								// add this id to our map
								ids[refid] = {elem:null, attrs:[], hrefs:[]};
							}
							ids[refid].attrs.push(attrnode);
						}
					}
				});

				// check xlink:href now
				var href = svgedit.utilities.getHref(n);
				// TODO: what if an <image> or <a> element refers to an element internally?
				if (href && ref_elems.indexOf(n.nodeName) >= 0) {
					var refid = href.substr(1);
					if (refid) {
						if (!(refid in ids)) {
							// add this id to our map
							ids[refid] = {elem:null, attrs:[], hrefs:[]};
						}
						ids[refid].hrefs.push(n);
					}
				}
			}
		});

		// in ids, we now have a map of ids, elements and attributes, let's re-identify
		var oldid;
		for (oldid in ids) {
			if (!oldid) {continue;}
			var elem = ids[oldid].elem;
			if (elem) {
				var newid = getNextId();

				// assign element its new id
				elem.id = newid;

				// remap all url() attributes
				var attrs = ids[oldid].attrs;
				var j = attrs.length;
				while (j--) {
					var attr = attrs[j];
					attr.ownerElement.setAttribute(attr.name, 'url(#' + newid + ')');
				}

				// remap all href attributes
				var hreffers = ids[oldid].hrefs;
				var k = hreffers.length;
				while (k--) {
					var hreffer = hreffers[k];
					svgedit.utilities.setHref(hreffer, '#' + newid);
				}
			}
		}
	};

// Function setUseData
// Assigns reference data for each use element
	var setUseData = this.setUseData = function(parent) {
		var elems = $(parent);

		if (parent.tagName !== 'use') {
			elems = elems.find('use');
		}

		elems.each(function() {
			var id = getHref(this).substr(1);
			var ref_elem = svgedit.utilities.getElem(id);
			if (!ref_elem) {return;}
			$(this).data('ref', ref_elem);
			if (ref_elem.tagName == 'symbol' || ref_elem.tagName == 'svg') {
				$(this).data('symbol', ref_elem).data('ref', ref_elem);
			}
		});
	};

// Function convertGradients
// Converts gradients from userSpaceOnUse to objectBoundingBox
	var convertGradients = this.convertGradients = function(elem) {
		var elems = $(elem).find('linearGradient, radialGradient');
		if (!elems.length && svgedit.browser.isWebkit()) {
			// Bug in webkit prevents regular *Gradient selector search
			elems = $(elem).find('*').filter(function() {
				return (this.tagName.indexOf('Gradient') >= 0);
			});
		}

		elems.each(function() {
			var grad = this;
			if ($(grad).attr('gradientUnits') === 'userSpaceOnUse') {
				// TODO: Support more than one element with this ref by duplicating parent grad
				var elems = $(svgcontent).find('[fill="url(#' + grad.id + ')"],[stroke="url(#' + grad.id + ')"]');
				if (!elems.length) {return;}

				// get object's bounding box
				var bb = svgedit.utilities.getBBox(elems[0]);

				// This will occur if the element is inside a <defs> or a <symbol>,
				// in which we shouldn't need to convert anyway.
				if (!bb) {return;}

				if (grad.tagName === 'linearGradient') {
					var g_coords = $(grad).attr(['x1', 'y1', 'x2', 'y2']);

					// If has transform, convert
					var tlist = grad.gradientTransform.baseVal;
					if (tlist && tlist.numberOfItems > 0) {
						var m = svgedit.math.transformListToTransform(tlist).matrix;
						var pt1 = svgedit.math.transformPoint(g_coords.x1, g_coords.y1, m);
						var pt2 = svgedit.math.transformPoint(g_coords.x2, g_coords.y2, m);

						g_coords.x1 = pt1.x;
						g_coords.y1 = pt1.y;
						g_coords.x2 = pt2.x;
						g_coords.y2 = pt2.y;
						grad.removeAttribute('gradientTransform');
					}

					$(grad).attr({
						x1: (g_coords.x1 - bb.x) / bb.width,
						y1: (g_coords.y1 - bb.y) / bb.height,
						x2: (g_coords.x2 - bb.x) / bb.width,
						y2: (g_coords.y2 - bb.y) / bb.height
					});
					grad.removeAttribute('gradientUnits');
				}
				// else {
				// Note: radialGradient elements cannot be easily converted
				// because userSpaceOnUse will keep circular gradients, while
				// objectBoundingBox will x/y scale the gradient according to
				// its bbox.

				// For now we'll do nothing, though we should probably have
				// the gradient be updated as the element is moved, as
				// inkscape/illustrator do.

//						var g_coords = $(grad).attr(['cx', 'cy', 'r']);
//
//						$(grad).attr({
//							cx: (g_coords.cx - bb.x) / bb.width,
//							cy: (g_coords.cy - bb.y) / bb.height,
//							r: g_coords.r
//						});
//
//						grad.removeAttribute('gradientUnits');
				// }
			}
		});
	};

// Function: convertToGroup
// Converts selected/given <use> or child SVG element to a group
	var convertToGroup = this.convertToGroup = function(elem) {
		if (!elem) {
			elem = selectedElements[0];
		}
		var $elem = $(elem);
		var batchCmd = new svgedit.history.BatchCommand();
		var ts;

		if ($elem.data('gsvg')) {
			// Use the gsvg as the new group
			var svg = elem.firstChild;
			var pt = $(svg).attr(['x', 'y']);

			$(elem.firstChild.firstChild).unwrap();
			$(elem).removeData('gsvg');

			var tlist = svgedit.transformlist.getTransformList(elem);
			var xform = svgroot.createSVGTransform();
			xform.setTranslate(pt.x, pt.y);
			tlist.appendItem(xform);
			svgedit.recalculate.recalculateDimensions(elem);
			call('selected', [elem]);
		} else if ($elem.data('symbol')) {
			elem = $elem.data('symbol');

			ts = $elem.attr('transform');
			var pos = $elem.attr(['x', 'y']);

			var vb = elem.getAttribute('viewBox');

			if (vb) {
				var nums = vb.split(' ');
				pos.x -= +nums[0];
				pos.y -= +nums[1];
			}

			// Not ideal, but works
			ts += ' translate(' + (pos.x || 0) + ',' + (pos.y || 0) + ')';

			var prev = $elem.prev();

			// Remove <use> element
			batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand($elem[0], $elem[0].nextSibling, $elem[0].parentNode));
			$elem.remove();

			// See if other elements reference this symbol
			var has_more = $(svgcontent).find('use:data(symbol)').length;

			var g = svgdoc.createElementNS(NS.SVG, 'g');
			var childs = elem.childNodes;

			var i;
			for (i = 0; i < childs.length; i++) {
				g.appendChild(childs[i].cloneNode(true));
			}

			// Duplicate the gradients for Gecko, since they weren't included in the <symbol>
			if (svgedit.browser.isGecko()) {
				var dupeGrads = $(svgedit.utilities.findDefs()).children('linearGradient,radialGradient,pattern').clone();
				$(g).append(dupeGrads);
			}

			if (ts) {
				g.setAttribute('transform', ts);
			}

			var parent = elem.parentNode;

			uniquifyElems(g);

			// Put the dupe gradients back into <defs> (after uniquifying them)
			if (svgedit.browser.isGecko()) {
				$(findDefs()).append( $(g).find('linearGradient,radialGradient,pattern') );
			}

			// now give the g itself a new id
			g.id = getNextId();

			prev.after(g);

			if (parent) {
				if (!has_more) {
					// remove symbol/svg element
					var nextSibling = elem.nextSibling;
					parent.removeChild(elem);
					batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(elem, nextSibling, parent));
				}
				batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(g));
			}

			setUseData(g);

			if (svgedit.browser.isGecko()) {
				convertGradients(svgedit.utilities.findDefs());
			} else {
				convertGradients(g);
			}

			// recalculate dimensions on the top-level children so that unnecessary transforms
			// are removed
			svgedit.utilities.walkTreePost(g, function(n){
				try {
					svgedit.recalculate.recalculateDimensions(n);
				} catch(e) {
					console.log(e);
				}
			});

			// Give ID for any visible element missing one
			$(g).find(visElems).each(function() {
				if (!this.id) {this.id = getNextId();}
			});

			selectOnly([g]);

			var cm = pushGroupProperties(g, true);
			if (cm) {
				batchCmd.addSubCommand(cm);
			}

			addCommandToHistory(batchCmd);

		} else {
			console.log('Unexpected element to ungroup:', elem);
		}
	};

	this.isScissoringPath = function()
	{
		return curConfig.isSissoringPath;
	}

    this.enterScissoringPath = function()
    {
        $('#tool_path_scissor').addClass('push_button_pressed');
        curConfig.isSissoringPath = true;
    }

    this.exitScissoringPath = function()
    {
        $('#tool_path_scissor').removeClass('push_button_pressed');
        curConfig.isSissoringPath = false;
    }

	this.isAnchorPoint_Adding = function()
	{
		return curConfig.isAnchorPoint_Adding;
	}

	this.isAnchorPoint_Removing = function()
	{
		return curConfig.isAnchorPoint_Removing;
	}

	this.enterAddAnchorPoint = function()
	{
        $('#tool_add_anchorpoint').addClass('push_button_pressed');
		curConfig.isAnchorPoint_Adding = true;
	}

	this.enterRemoveAnchorPoint = function()
	{
        $('#tool_remove_anchorpoint').addClass('push_button_pressed');
        curConfig.isAnchorPoint_Removing = true;
	}

    this.exitAddAnchorPoint = function()
    {
        $('#tool_add_anchorpoint').removeClass('push_button_pressed');
        curConfig.isAnchorPoint_Adding = false;
    }

    this.exitRemoveAnchorPoint = function()
    {
        $('#tool_remove_anchorpoint').removeClass('push_button_pressed');
        curConfig.isAnchorPoint_Removing = false;
    }

    this.switchFixAspect = function()
	{
		curConfig.fixedaspect = !curConfig.fixedaspect;
	}

	this.switchCrossRuler = function()
	{
		curConfig.showcrossruler = !curConfig.showcrossruler;
	}

	this.addDesignPart = function(_imageUrl)
	{
		svgEditor.insertImageFromUrl(_imageUrl);
	}

	this.delDesignPart = function(_imageId)
	{
        svgEditor.deletePartPrep(function(ok)
        {
            if (!ok)
            {
                return;
            }

            console.log('del design part: ' + _imageId);

            delPartFromList(parseInt(_imageId));

            refreshPartsPanel();

        });
	}

	this.clickOnPartImg = function(_imageUrl)
	{
        svgCanvas.saveImg("11",_imageUrl);
        svgCanvas.clear();
        if(_imageUrl!=null){
            isNewPath = _imageUrl.split('$')[1];
            _imageUrl = _imageUrl.split('$')[0];
		}else{
        	isNewPath = null;
		}
        svgEditor.insertImageFromUrl(_imageUrl);
        svgEditor.updateCanvas();
	}

	var refreshPartsPanel = function()
	{
		var counter = previewPartsList.size + previewPartsListUpdated.size+1;

        if (counter > 0)
        {
            $('#part_preview').show();

            var btnPreview = document.getElementById('tool_partpreview');
            btnPreview.setAttribute('class' , 'push_button_pressed');

            var panel = document.getElementById('part_preview_panel');

            if (counter > 5)
            {
                panel.setAttribute('style' , 'width:800px');
            }
            else
            {
                panel.setAttribute('style' , 'width: ' + 160 * counter + 'px');
            }

            var root = document.getElementById('part_preview_item_root');
            var slider = document.getElementById('content-slider');

            for (var i = root.childNodes.length - 1 ; i >= 0 ; --i)
            {
                root.removeChild(root.childNodes[i]);
            }

            var slider = document.createElement("ul");
            slider.setAttribute('id' ,"content-slider");
            slider.setAttribute('class' , 'content-slider');

            root.appendChild(slider);

            var combinedArray = [];

            var updateArray = [];
            previewPartsListUpdated.forEach(function(part , key)
            {
                updateArray.push(part);
            });

            for (var i = updateArray.length - 1 ; i >=0 ; --i)
			{
				combinedArray.push(updateArray[i]);
			}

            previewPartsList.forEach(function(part , key)
            {
                combinedArray.push(part);
            });

            for (var i = 0 ; i <= combinedArray.length ; ++i)
			//pictureList.forEach(function(part , key)
            {
                var item = document.createElement("li");
                var divWidth = 150;
                var divHeight = 120;

                var imgDiv = document.createElement("div");
                imgDiv.setAttribute('class', 'container');
                var img = new Image();

                if(i <combinedArray.length){
                    imgDiv.setAttribute('style', 'width:' + divWidth + 'px ; height: ' + divHeight + 'px;');

                    var part = combinedArray[i];
                    imgDiv.setAttribute('id', 'part_container_' + part.id);
                    img.setAttribute('id', 'image_' + part.id);
                    img.onload = function () {
                        //this.setAttribute('style' , 'width:' + divWidth + 'px ; height: ' + divHeight + 'px;');

                        var nWidth = this.width, nHeight = this.height;

                        if (this.width > divWidth || this.height > divHeight) {
                            var wRatio = divWidth / this.width;
                            var hRatio = divHeight / this.height;
                            if (wRatio > hRatio) {
                                nWidth = this.width * hRatio;
                                nHeight = divHeight;
                            }
                            else {
                                nWidth = divWidth;
                                nHeight = this.height * wRatio;
                            }
                        }

                        var offsetTop = (divHeight - nHeight) * 0.5, offsetLeft = (divWidth - nWidth) * 0.0;
                        var svgSrc = this.getAttribute('_attr') + "$" + this.id.split('_')[1];
                        this.setAttribute('style', 'width:' + Math.round(nWidth) + 'px ; height: ' + Math.round(nHeight) + 'px;position:relative; top:' + Math.round(offsetTop) + 'px; left:' + Math.round(offsetLeft) + 'px;');
                        this.setAttribute('ondblclick', 'svgCanvas.clickOnPartImg(\"' + svgSrc + '\")');
                    };

                    img.src = part.pictureKey;
                    img.setAttribute('_attr', part.vectorKey);
                    imgDiv.appendChild(img);

                    var adBtnDiv = document.createElement("div");
                    adBtnDiv.setAttribute('style', 'position:absolute; top:0px;width:32px;height:32px;pointer-events:all;cursor:default');
                    //adBtnDiv.setAttribute('onclick' , 'svgCanvas.addDesignPart(\"' + part.pictureKey + '\")');
                    var addBtnImg = new Image();
                    addBtnImg.src = "images/addpreview.png";
                    addBtnImg.setAttribute('style', 'width:24px;height:24px;');
                    addBtnImg.setAttribute('onclick', 'svgCanvas.addDesignPart(\"' + part.vectorKey + '\")');

                    adBtnDiv.appendChild(addBtnImg);
                    imgDiv.appendChild(adBtnDiv);

                    var deBtnDiv = document.createElement("div");
                    deBtnDiv.setAttribute('style', 'position:relative; top:-28px; left:120px;width;24px;height:24px;pointer-events:all;cursor:default');
                    //deBtnDiv.setAttribute('onclick' , 'svgCanvas.delDesignPart(\"' + part.id + '\")');
                    var deBtnImg = new Image();
                    deBtnImg.src = "images/removepart.png";
                    deBtnImg.setAttribute('style', 'width:24px;height:24px;');
                    deBtnImg.setAttribute('onclick', 'svgCanvas.delDesignPart(\"' + part.id + '\")');
                    deBtnDiv.appendChild(deBtnImg);
                    adBtnDiv.appendChild(deBtnDiv);

                    var spanDiv = document.createElement("div");
                    spanDiv.setAttribute('style', 'position:absolute; bottom:0px;width;32px;height:16px;color: #000;text-align:center;');
                    spanDiv.textContent = part.id;

                    imgDiv.appendChild(spanDiv);
                }else if(i==combinedArray.length){
                    img.onload = function () {
                        //this.setAttribute('style' , 'width:' + divWidth + 'px ; height: ' + divHeight + 'px;');

                        var nWidth = this.width, nHeight = this.height;

                        if (this.width > divWidth || this.height > divHeight) {
                            var wRatio = divWidth / this.width;
                            var hRatio = divHeight / this.height;
                            if (wRatio > hRatio) {
                                nWidth = this.width * hRatio;
                                nHeight = divHeight;
                            }
                            else {
                                nWidth = divWidth;
                                nHeight = this.height * wRatio;
                            }
                        }
                        var offsetTop = (divHeight - nHeight) * 0.5, offsetLeft = (divWidth - nWidth) * 0.0;
                        this.setAttribute('style', 'width:' + Math.round(nWidth) + 'px ; height: ' + Math.round(nHeight) + 'px;position:relative; top:' + Math.round(offsetTop) + 'px; left:' + Math.round(offsetLeft) + 'px;');
                        this.setAttribute('ondblclick', 'svgCanvas.clickOnPartImg(null)');

                    };
                    imgDiv.setAttribute('style','position:relative;height:120px;');
                    var spanDiv = document.createElement("div");
                    spanDiv.setAttribute('style', 'position:absolute;left:40%;font-size:18px;bottom:50%;width;32px;height:18px;color: #000;text-align:center;');
                    spanDiv.textContent = '新增';
                    spanDiv.setAttribute('ondblclick', 'svgCanvas.clickOnPartImg(null)');
                    img.src = "images/newpath.png";
                    imgDiv.appendChild(img);
                    imgDiv.appendChild(spanDiv);

                }
                item.appendChild(imgDiv);

                slider.appendChild(item);

                //console.log(imgDiv);
            }


            //);

            $("#content-slider").lightSlider({
                loop:false,
                keyPress:true,
                item: counter >= 5 ? 5 : counter ,
                autoWidth : false,
                pager: true,
            });

            $("#part_preview").width($("#part_preview_panel").width());
            $("#part_preview").height($("#part_preview_panel").height());

            $("#part_preview_item_root").width($("#part_preview_panel").width());
            $("#part_preview_item_root").height($("#part_preview_panel").height());
        }
        else
		{
			// When there is no parts in list, then close current panel
            var btnPreview = document.getElementById('tool_partpreview');
            btnPreview.setAttribute('class' , 'tool_button');

            $('#part_preview').hide();
		}
	}

	var delPartFromList = function(partId)
	{
		var hasDel = false;
        if (previewPartsList.has(partId))
        {
            hasDel = true;
            previewPartsList.delete(partId);
        }
        else if (previewPartsListUpdated.has(partId))
        {
            hasDel = true;
            previewPartsListUpdated.delete(partId);
        }

        if (hasDel)
		{
			svgEditor.getNetHelper().deletePictureList(partId , function(rt)
			{
				console.log(rt);
			});
		}
    }

    var incPartsList = function(partsList,ispush)
    {
    	if (partsList != null)
		{
            for (var i = 0 ; i < partsList.length ; ++i)
            {
            	if(ispush){
                    if (previewPartsListUpdated.has(partsList[i].id) == false)
                    {
                        previewPartsList.set(partsList[i].id , partsList[i]);
                    }
				}else{
                    if (previewPartsList.has(partsList[i].id) == false && previewPartsListUpdated.has(partsList[i].id) == false)
                    {
                        previewPartsList.set(partsList[i].id , partsList[i]);
                    }
				}

            }
		}
    }

    var incPartsListUpdated = function(partsList,ispush)
    {
        if (partsList != null)
        {
            for (var i = 0 ; i < partsList.length ; ++i)
            {
				if(ispush){
                    if (previewPartsList.has(partsList[i].id) == false )
                    {
                        previewPartsListUpdated.set(partsList[i].id , partsList[i]);
                    }
				}else{
                    if (previewPartsList.has(partsList[i].id) == false && previewPartsListUpdated.has(partsList[i].id) == false)
                    {
                        previewPartsListUpdated.set(partsList[i].id , partsList[i]);
                    }
				}
            }
        }
    }

    var requestPartsAndShow = function(ispush)
	{
		if (isRequestPartsList == false)
		{
            svgEditor.getNetHelper().requestDesignPartsSelected(function(pList1)
            {
                incPartsListUpdated(pList1,ispush);

                console.log('====================================== plist1: ' + (pList1 != null ? pList1.length : 0));

                svgEditor.getNetHelper().requestDesignParts(function(pList2)
                {
                    incPartsList(pList2,ispush);

                    refreshPartsPanel();
                });
            });
		}

	}

	this.refreshPreviewPanel = function(isPush)
	{
        if ($('#part_preview').is(':visible'))
		{
            requestPartsAndShow(isPush);
		}
	}

    this.closePartsSelectPanel = function()
    {
        $('#partselectpanel').hide();

        // Refresh preview panel
        svgCanvas.refreshPreviewPanel();
    }

	this.switchPreviewPanel = function()
	{
		///*
		if ($('#part_preview').is(':visible'))
		{
            var btnPreview = document.getElementById('tool_partpreview');
            btnPreview.setAttribute('class' , 'tool_button');

            $('#part_preview').hide();
		}
		else
		{
            requestPartsAndShow();
		}
	}

	this.switchCheckerBoard = function()
	{
		curConfig.showcheckerboard = !curConfig.showcheckerboard;

		//var cbElem = document.getElementById('canvasCheckboard');
		//cbElem.setAttribute('style' , curConfig.showcheckerboard ? 'display:inline' : 'display:none');

		if (curConfig.showcheckerboard)
		{
            $('#canvasCheckboard').show();
		}
		else
		{
            $('#canvasCheckboard').hide();
		}
	}

	this.openPartSelectPage = function()
	{
        svgEditor.getNetHelper().openPartSelectPage();
    }

    this.uploadPartToServer = function()
	{
        var saveOpts =
            {
                'images': $.pref('img_save'),
                'round_digits': 6
            };

        clearSelection();
        // Update save options if provided
        if (saveOpts)
        {
            $.extend(save_options, saveOpts);
        }
        save_options.apply = true;

        // no need for doctype, see http://jwatt.org/svg/authoring/#doctype-declaration
        var svgContentString = this.svgCanvasToString(true);

        svgEditor.getNetHelper().uploadDesignPart(svgContentString,isNewPath);
	}

	this.switchUniformMode = function()
	{
		curConfig.uniformscale = !curConfig.uniformscale;
	}
//
// Function: setSvgString
// This function sets the current drawing as the input SVG XML.
//
// Parameters:
// xmlString - The SVG as XML text.
//
// Returns:
// This function returns false if the set was unsuccessful, true otherwise.
	this.setSvgString = function(xmlString) {
		try {
			// convert string into XML document
			var newDoc = svgedit.utilities.text2xml(xmlString);

			this.prepareSvg(newDoc);

			var batchCmd = new svgedit.history.BatchCommand('Change Source');

			// remove old svg document
			var nextSibling = svgcontent.nextSibling;
			var oldzoom = svgroot.removeChild(svgcontent);
			batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(oldzoom, nextSibling, svgroot));

			// set new svg document
			// If DOM3 adoptNode() available, use it. Otherwise fall back to DOM2 importNode()
			if (svgdoc.adoptNode) {
				svgcontent = svgdoc.adoptNode(newDoc.documentElement);
			}
			else {
				svgcontent = svgdoc.importNode(newDoc.documentElement, true);
			}

			svgroot.appendChild(svgcontent);
			var content = $(svgcontent);

			canvas.current_drawing_ = new svgedit.draw.Drawing(svgcontent, idprefix);

			// retrieve or set the nonce
			var nonce = getCurrentDrawing().getNonce();
			if (nonce) {
				call('setnonce', nonce);
			} else {
				call('unsetnonce');
			}

			// change image href vals if possible
			content.find('image').each(function() {
				var image = this;
				preventClickDefault(image);
				var val = getHref(this);
				if (val) {
					if (val.indexOf('data:') === 0) {
						// Check if an SVG-edit data URI
						var m = val.match(/svgedit_url=(.*?);/);
						if (m) {
							var url = decodeURIComponent(m[1]);
							$(new Image()).load(function () {
								image.setAttributeNS(NS.XLINK, 'xlink:href', url);
							}).attr('src', url);
						}
					}
					// Add to encodableImages if it loads
					canvas.embedImage(val);
				}
			});

			// Wrap child SVGs in group elements
			content.find('svg').each(function() {
				// Skip if it's in a <defs>
				if ($(this).closest('defs').length) {return;}

				uniquifyElems(this);

				// Check if it already has a gsvg group
				var pa = this.parentNode;
				if (pa.childNodes.length === 1 && pa.nodeName === 'g') {
					$(pa).data('gsvg', this);
					pa.id = pa.id || getNextId();
				} else {
					groupSvgElem(this);
				}
			});

			// For Firefox: Put all paint elems in defs
			if (svgedit.browser.isGecko()) {
				content.find('linearGradient, radialGradient, pattern').appendTo(svgedit.utilities.findDefs());
			}

			// Set ref element for <use> elements

			// TODO: This should also be done if the object is re-added through "redo"
			setUseData(content);

			convertGradients(content[0]);

			// recalculate dimensions on the top-level children so that unnecessary transforms
			// are removed
			svgedit.utilities.walkTreePost(svgcontent, function(n) {
				try {
					svgedit.recalculate.recalculateDimensions(n);
				} catch(e) {
					console.log(e);
				}
			});

			var attrs = {
				id: 'svgcontent',
				overflow: curConfig.show_outside_canvas ? 'visible' : 'hidden'
			};

			var percs = false;

			// determine proper size
			if (content.attr('viewBox')) {
				var vb = content.attr('viewBox').split(' ');
				attrs.width = vb[2];
				attrs.height = vb[3];
			}
			// handle content that doesn't have a viewBox
			else {
				$.each(['width', 'height'], function(i, dim) {
					// Set to 100 if not given
					var val = content.attr(dim);

					if (!val) {val = '100%';}

					if (String(val).substr(-1) === '%') {
						// Use user units if percentage given
						percs = true;
					} else {
						attrs[dim] = svgedit.units.convertToNum(dim, val);
					}
				});
			}

			// identify layers
			identifyLayers();

			// Give ID for any visible layer children missing one
			content.children().find(visElems).each(function() {
				if (!this.id) {this.id = getNextId();}
			});

			// Percentage width/height, so let's base it on visible elements
			if (percs) {
				var bb = getStrokedBBox();
				attrs.width = bb.width + bb.x;
				attrs.height = bb.height + bb.y;
			}

			// Just in case negative numbers are given or
			// result from the percs calculation
			if (attrs.width <= 0) {attrs.width = 100;}
			if (attrs.height <= 0) {attrs.height = 100;}

			content.attr(attrs);
			this.contentW = attrs.width;
			this.contentH = attrs.height;

			batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(svgcontent));
			// update root to the correct size
			var changes = content.attr(['width', 'height']);
			console.log(changes)
			batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(svgroot, changes));

			// reset zoom
			current_zoom = 1;

			// reset transform lists
			svgedit.transformlist.resetListMap();
			clearSelection();
			svgedit.path.clearData();
			svgroot.appendChild(selectorManager.selectorParentGroup);

			addCommandToHistory(batchCmd);
			call('changed', [svgcontent]);
		} catch(e) {
			console.log(e);
			return false;
		}

		return true;
	};

// Function: importSvgString
// This function imports the input SVG XML as a <symbol> in the <defs>, then adds a
// <use> to the current layer.
//
// Parameters:
// xmlString - The SVG as XML text.
//
// Returns:
// This function returns false if the import was unsuccessful, true otherwise.
// TODO:
// * properly handle if namespace is introduced by imported content (must add to svgcontent
// and update all prefixes in the imported node)
// * properly handle recalculating dimensions, recalculateDimensions() doesn't handle
// arbitrary transform lists, but makes some assumptions about how the transform list
// was obtained
// * import should happen in top-left of current zoomed viewport
	this.importSvgString = function(xmlString) {
		var j, ts;
		try {
			// Get unique ID
			var uid = svgedit.utilities.encode64(xmlString.length + xmlString).substr(0,32);

			var useExisting = false;

			// Look for symbol and make sure symbol exists in image
			if (import_ids[uid]) {
				if ( $(import_ids[uid].symbol).parents('#svgroot').length ) {
					useExisting = true;
				}
			}

			var batchCmd = new svgedit.history.BatchCommand('Import Image');
			var symbol;
			if (useExisting) {
				symbol = import_ids[uid].symbol;
				ts = import_ids[uid].xform;
			} else {
				// convert string into XML document
				var newDoc = svgedit.utilities.text2xml(xmlString);

				this.prepareSvg(newDoc);

				// import new svg document into our document
				var svg;
				// If DOM3 adoptNode() available, use it. Otherwise fall back to DOM2 importNode()
				if (svgdoc.adoptNode) {
					svg = svgdoc.adoptNode(newDoc.documentElement);
				} else {
					svg = svgdoc.importNode(newDoc.documentElement, true);
				}

				uniquifyElems(svg);

				var innerw = svgedit.units.convertToNum('width', svg.getAttribute('width')),
					innerh = svgedit.units.convertToNum('height', svg.getAttribute('height')),
					innervb = svg.getAttribute('viewBox'),
				// if no explicit viewbox, create one out of the width and height
					vb = innervb ? innervb.split(' ') : [0, 0, innerw, innerh];
				for (j = 0; j < 4; ++j) {
					vb[j] = +(vb[j]);
				}

				// TODO: properly handle preserveAspectRatio
				var canvasw = +svgcontent.getAttribute('width'),
					canvash = +svgcontent.getAttribute('height');
				// imported content should be 1/3 of the canvas on its largest dimension

				if (innerh > innerw) {
					ts = 'scale(' + (canvash/3)/vb[3] + ')';
				} else {
					ts = 'scale(' + (canvash/3)/vb[2] + ')';
				}

				// Hack to make recalculateDimensions understand how to scale
				ts = 'translate(0) ' + ts + ' translate(0)';

				symbol = svgdoc.createElementNS(NS.SVG, 'symbol');
				var defs = svgedit.utilities.findDefs();

				if (svgedit.browser.isGecko()) {
					// Move all gradients into root for Firefox, workaround for this bug:
					// https://bugzilla.mozilla.org/show_bug.cgi?id=353575
					// TODO: Make this properly undo-able.
					$(svg).find('linearGradient, radialGradient, pattern').appendTo(defs);
				}

				while (svg.firstChild) {
					var first = svg.firstChild;
					symbol.appendChild(first);
				}
				var attrs = svg.attributes;
				var i;
				for (i = 0; i < attrs.length; i++) {
					var attr = attrs[i];
					symbol.setAttribute(attr.nodeName, attr.value);
				}
				symbol.id = getNextId();

				// Store data
				import_ids[uid] = {
					symbol: symbol,
					xform: ts
				};

				svgedit.utilities.findDefs().appendChild(symbol);
				batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(symbol));
			}

			var use_el = svgdoc.createElementNS(NS.SVG, 'use');
			use_el.id = getNextId();
			setHref(use_el, '#' + symbol.id);

			(current_group || getCurrentDrawing().getCurrentLayer()).appendChild(use_el);
			batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(use_el));
			clearSelection();

			use_el.setAttribute('transform', ts);
			svgedit.recalculate.recalculateDimensions(use_el);
			$(use_el).data('symbol', symbol).data('ref', symbol);
			addToSelection([use_el]);

			// TODO: Find way to add this in a recalculateDimensions-parsable way
//				if (vb[0] != 0 || vb[1] != 0)
//					ts = 'translate(' + (-vb[0]) + ',' + (-vb[1]) + ') ' + ts;
			addCommandToHistory(batchCmd);
			call('changed', [svgcontent]);

		} catch(e) {
			console.log(e);
			return false;
		}

		return true;
	};

	this.importSvgStringNew = function(xmlString)
	{
		try {

			// convert string into XML document
			var newDoc = svgedit.utilities.text2xml(xmlString);

			this.prepareSvg(newDoc);

			var batchCmd = new svgedit.history.BatchCommand('Change Source');

			var svg;
			// If DOM3 adoptNode() available, use it. Otherwise fall back to DOM2 importNode()
			if (svgdoc.adoptNode) {
				svg = svgdoc.adoptNode(newDoc.documentElement);
			}
			else {
				svg = svgdoc.importNode(newDoc.documentElement, true);
			}

			svgcontent.appendChild(svg);
			var content = $(svg);

			//canvas.current_drawing_ = new svgedit.draw.Drawing(svg, idprefix);

			// retrieve or set the nonce
			var nonce = getCurrentDrawing().getNonce();
			if (nonce) {
				call('setnonce', nonce);
			} else {
				call('unsetnonce');
			}

			// change image href vals if possible
			content.find('image').each(function() {
				var image = this;
				preventClickDefault(image);
				var val = getHref(this);
				if (val) {
					if (val.indexOf('data:') === 0) {
						// Check if an SVG-edit data URI
						var m = val.match(/svgedit_url=(.*?);/);
						if (m) {
							var url = decodeURIComponent(m[1]);
							$(new Image()).load(function () {
								image.setAttributeNS(NS.XLINK, 'xlink:href', url);
							}).attr('src', url);
						}
					}
					// Add to encodableImages if it loads
					canvas.embedImage(val);
				}
			});

			// Wrap child SVGs in group elements
			content.find('svg').each(function() {
				// Skip if it's in a <defs>
				if ($(this).closest('defs').length) {return;}

				uniquifyElems(this);

				// Check if it already has a gsvg group
				var pa = this.parentNode;
				if (pa.childNodes.length === 1 && pa.nodeName === 'g') {
					$(pa).data('gsvg', this);
					pa.id = pa.id || getNextId();
				} else {
					groupSvgElem(this);
				}
			});

			// For Firefox: Put all paint elems in defs
			if (svgedit.browser.isGecko()) {
				content.find('linearGradient, radialGradient, pattern').appendTo(svgedit.utilities.findDefs());
			}

			// Set ref element for <use> elements

			// TODO: This should also be done if the object is re-added through "redo"
			setUseData(content);

			convertGradients(content[0]);

			// recalculate dimensions on the top-level children so that unnecessary transforms
			// are removed
			svgedit.utilities.walkTreePost(svgcontent, function(n) {
				try {
					svgedit.recalculate.recalculateDimensions(n);
				} catch(e) {
					console.log(e);
				}
			});

			var attrs = {
				id: getNextId(),
				overflow: curConfig.show_outside_canvas ? 'visible' : 'hidden' ,
				style : 'pointer-events:inherit;cursor:default'
			};

			var percs = false;

			// determine proper size
			if (content.attr('viewBox')) {
				var vb = content.attr('viewBox').split(' ');
				attrs.width = vb[2];
				attrs.height = vb[3];
			}
			// handle content that doesn't have a viewBox
			else {
				$.each(['width', 'height'], function(i, dim) {
					// Set to 100 if not given
					var val = content.attr(dim);

					if (!val) {val = '100%';}

					if (String(val).substr(-1) === '%') {
						// Use user units if percentage given
						percs = true;
					} else {
						attrs[dim] = svgedit.units.convertToNum(dim, val);
					}
				});
			}

			// identify layers
			identifyLayers();

			// Give ID for any visible layer children missing one
			content.children().find(visElems).each(function() {
				if (!this.id) {this.id = getNextId();}
			});

			// Percentage width/height, so let's base it on visible elements
			if (percs) {
				var bb = getStrokedBBox();
				attrs.width = bb.width + bb.x;
				attrs.height = bb.height + bb.y;
			}

			// Just in case negative numbers are given or
			// result from the percs calculation
			if (attrs.width <= 0) {attrs.width = 100;}
			if (attrs.height <= 0) {attrs.height = 100;}

			content.attr(attrs);
			this.contentW = attrs.width;
			this.contentH = attrs.height;


			// Recongnize the node

			function clean(node)
			{
				for(var n = 0; n < node.childNodes.length; n ++)
				{
					var child = node.childNodes[n];
					if
					(
						child.nodeType === 8
						||
						(child.nodeType === 3 && !/\S/.test(child.nodeValue))
					)
					{
						node.removeChild(child);
						n --;
					}
					else if(child.nodeType === 1)
					{
						clean(child);
					}
				}
			}

			clean(svg);
            clearSelection();

			var nnode = [];
			while (svg.firstChild) {
				var first = svg.firstChild;

				if (first.parentNode.nodeType !== Node.COMMENT_NODE)
				{
					svg.parentNode.appendChild(first);

					if (selectedElements[0] != null)
					{
                        first.setAttribute('transform', 'translate(' + selectedElements[0].getAttribute('x') + ',' + selectedElements[0].getAttribute('y') + ')');
					}

					nnode.push(first);
				}
			}
			svg.parentNode.removeChild(svg);

			batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(svgcontent));
			// update root to the correct size
			var changes = content.attr(['width', 'height']);
			batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(svgroot, changes));

			// reset zoom
			//current_zoom = 1;

			// reset transform lists
			svgCanvas.deleteSelectedElements();

			svgedit.transformlist.resetListMap();
			// selectOnly(nnode);
            canvas.groupSelected('g',nnode);

			svgedit.path.clearData();
			svgroot.appendChild(selectorManager.selectorParentGroup);

			addCommandToHistory(batchCmd);
			call('changed', [svgcontent]);
		} catch(e) {
			console.log(e);
			return false;
		}

		return true;
	};

// TODO(codedread): Move all layer/context functions in draw.js
// Layer API Functions

// Group: Layers

// Function: identifyLayers
// Updates layer system
	var identifyLayers = canvas.identifyLayers = function() {
		leaveContext();
		getCurrentDrawing().identifyLayers();
	};

// Function: createLayer
// Creates a new top-level layer in the drawing with the given name, sets the current layer
// to it, and then clears the selection. This function then calls the 'changed' handler.
// This is an undoable action.
//
// Parameters:
// name - The given name
	this.createLayer = function(name)
	{
		var batchCmd = new svgedit.history.BatchCommand('Create Layer');
		var new_layer = getCurrentDrawing().createLayer(name , this.fetchLayerColor());
		batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(new_layer));
		addCommandToHistory(batchCmd);
		clearSelection();
		call('changed', [new_layer]);
	};

// Function: cloneLayer
// Creates a new top-level layer in the drawing with the given name, copies all the current layer's contents
// to it, and then clears the selection. This function then calls the 'changed' handler.
// This is an undoable action.
//
// Parameters:
// name - The given name
	this.cloneLayer = function(name) {
		var batchCmd = new svgedit.history.BatchCommand('Duplicate Layer');
		var new_layer = svgdoc.createElementNS(NS.SVG, 'g');
		var layer_title = svgdoc.createElementNS(NS.SVG, 'title');
		layer_title.textContent = name;
		new_layer.appendChild(layer_title);
		var current_layer = getCurrentDrawing().getCurrentLayer();
		$(current_layer).after(new_layer);
		var childs = current_layer.childNodes;
		var i;
		for (i = 0; i < childs.length; i++) {
			var ch = childs[i];
			if (ch.localName == 'title') {continue;}
			new_layer.appendChild(copyElem(ch));
		}

		clearSelection();
		identifyLayers();

		batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(new_layer));
		addCommandToHistory(batchCmd);
		canvas.setCurrentLayer(name);
		call('changed', [new_layer]);
	};

// Function: deleteCurrentLayer
// Deletes the current layer from the drawing and then clears the selection. This function
// then calls the 'changed' handler. This is an undoable action.
	this.deleteCurrentLayer = function() {
		var current_layer = getCurrentDrawing().getCurrentLayer();
		var nextSibling = current_layer.nextSibling;
		var parent = current_layer.parentNode;
		current_layer = getCurrentDrawing().deleteCurrentLayer();
		if (current_layer) {
			var batchCmd = new svgedit.history.BatchCommand('Delete Layer');
			// store in our Undo History
			batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(current_layer, nextSibling, parent));
			addCommandToHistory(batchCmd);
			clearSelection();
			call('changed', [parent]);
			return true;
		}
		return false;
	};

// Function: setCurrentLayer
// Sets the current layer. If the name is not a valid layer name, then this function returns
// false. Otherwise it returns true. This is not an undo-able action.
//
// Parameters:
// name - the name of the layer you want to switch to.
//
// Returns:
// true if the current layer was switched, otherwise false
	this.setCurrentLayer = function(name) {
		var result = getCurrentDrawing().setCurrentLayer(svgedit.utilities.toXml(name));
		if (result) {
			clearSelection();
		}
		return result;
	};

// Function: renameCurrentLayer
// Renames the current layer. If the layer name is not valid (i.e. unique), then this function
// does nothing and returns false, otherwise it returns true. This is an undo-able action.
//
// Parameters:
// newname - the new name you want to give the current layer. This name must be unique
// among all layer names.
//
// Returns:
// true if the rename succeeded, false otherwise.
	this.renameCurrentLayer = function(newname) {
		var i;
		var drawing = getCurrentDrawing();
		if (drawing.current_layer) {
			var oldLayer = drawing.current_layer;
			// setCurrentLayer will return false if the name doesn't already exist
			// this means we are free to rename our oldLayer
			if (!canvas.setCurrentLayer(newname)) {
				var batchCmd = new svgedit.history.BatchCommand('Rename Layer');
				// find the index of the layer
				for (i = 0; i < drawing.getNumLayers(); ++i) {
					if (drawing.all_layers[i][1] == oldLayer) {break;}
				}
				var oldname = drawing.getLayerName(i);
				drawing.all_layers[i][0] = svgedit.utilities.toXml(newname);

				// now change the underlying title element contents
				var len = oldLayer.childNodes.length;
				for (i = 0; i < len; ++i) {
					var child = oldLayer.childNodes.item(i);
					// found the <title> element, now append all the
					if (child && child.tagName == 'title') {
						// wipe out old name
						while (child.firstChild) { child.removeChild(child.firstChild); }
						child.textContent = newname;

						batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(child, {'#text':oldname}));
						addCommandToHistory(batchCmd);
						call('changed', [oldLayer]);
						return true;
					}
				}
			}
			drawing.current_layer = oldLayer;
		}
		return false;
	};

// Function: setCurrentLayerPosition
// Changes the position of the current layer to the new value. If the new index is not valid,
// this function does nothing and returns false, otherwise it returns true. This is an
// undo-able action.
//
// Parameters:
// newpos - The zero-based index of the new position of the layer. This should be between
// 0 and (number of layers - 1)
//
// Returns:
// true if the current layer position was changed, false otherwise.
	this.setCurrentLayerPosition = function(newpos) {
		var oldpos, drawing = getCurrentDrawing();
		if (drawing.current_layer && newpos >= 0 && newpos < drawing.getNumLayers()) {
			for (oldpos = 0; oldpos < drawing.getNumLayers(); ++oldpos) {
				if (drawing.all_layers[oldpos][1] == drawing.current_layer) {break;}
			}
			// some unknown error condition (current_layer not in all_layers)
			if (oldpos == drawing.getNumLayers()) { return false; }

			if (oldpos != newpos) {
				// if our new position is below us, we need to insert before the node after newpos
				var refLayer = null;
				var oldNextSibling = drawing.current_layer.nextSibling;
				if (newpos > oldpos ) {
					if (newpos < drawing.getNumLayers()-1) {
						refLayer = drawing.all_layers[newpos+1][1];
					}
				}
				// if our new position is above us, we need to insert before the node at newpos
				else {
					refLayer = drawing.all_layers[newpos][1];
				}
				svgcontent.insertBefore(drawing.current_layer, refLayer);
				addCommandToHistory(new svgedit.history.MoveElementCommand(drawing.current_layer, oldNextSibling, svgcontent));

				identifyLayers();
				canvas.setCurrentLayer(drawing.getLayerName(newpos));

				return true;
			}
		}

		return false;
	};

// Function: setLayerVisibility
// Sets the visibility of the layer. If the layer name is not valid, this function return
// false, otherwise it returns true. This is an undo-able action.
//
// Parameters:
// layername - the name of the layer to change the visibility
// bVisible - true/false, whether the layer should be visible
//
// Returns:
// true if the layer's visibility was set, false otherwise
	this.setLayerVisibility = function(layername, bVisible) {
		var drawing = getCurrentDrawing();
		var prevVisibility = drawing.getLayerVisibility(layername);
		var layer = drawing.setLayerVisibility(layername, bVisible);
		if (layer) {
			var oldDisplay = prevVisibility ? 'inline' : 'none';
			addCommandToHistory(new svgedit.history.ChangeElementCommand(layer, {'display':oldDisplay}, 'Layer Visibility'));
		} else {
			return false;
		}

		if (layer == drawing.getCurrentLayer()) {
			clearSelection();
			pathActions.clear();
		}
//		call('changed', [selected]);
		return true;
	};

	this.setLayerLocked = function(layername, bLocked) {
		var drawing = getCurrentDrawing();
		var prevVisibility = drawing.getLayerLocked(layername);
		var layer = drawing.setLayerLocked(layername, bLocked);
		if (layer)
		{
			//var oldDisplay = prevVisibility ? 'inline' : 'none';
			//addCommandToHistory(new svgedit.history.ChangeElementCommand(layer, {'display':oldDisplay}, 'Layer Visibility'));
		}
		else
		{
			return false;
		}

		if (layer == drawing.getCurrentLayer()) {
			clearSelection();
			pathActions.clear();
		}
//		call('changed', [selected]);
		return true;
	};

// Function: moveSelectedToLayer
// Moves the selected elements to layername. If the name is not a valid layer name, then false
// is returned. Otherwise it returns true. This is an undo-able action.
//
// Parameters:
// layername - the name of the layer you want to which you want to move the selected elements
//
// Returns:
// true if the selected elements were moved to the layer, false otherwise.
	this.moveSelectedToLayer = function(layername) {
		// find the layer
		var i;
		var layer = null;
		var drawing = getCurrentDrawing();
		for (i = 0; i < drawing.getNumLayers(); ++i) {
			if (drawing.getLayerName(i) == layername) {
				layer = drawing.all_layers[i][1];
				break;
			}
		}
		if (!layer) {return false;}

		var batchCmd = new svgedit.history.BatchCommand('Move Elements to Layer');

		// loop for each selected element and move it
		var selElems = selectedElements;
		i = selElems.length;
		while (i--) {
			var elem = selElems[i];
			if (!elem) {continue;}
			var oldNextSibling = elem.nextSibling;
			// TODO: this is pretty brittle!
			var oldLayer = elem.parentNode;
			layer.appendChild(elem);
			batchCmd.addSubCommand(new svgedit.history.MoveElementCommand(elem, oldNextSibling, oldLayer));
		}

		addCommandToHistory(batchCmd);

		return true;
	};

	this.mergeLayer = function(skipHistory) {
		var batchCmd = new svgedit.history.BatchCommand('Merge Layer');
		var drawing = getCurrentDrawing();
		var prev = $(drawing.current_layer).prev()[0];
		if (!prev) {return;}
		var childs = drawing.current_layer.childNodes;
		var len = childs.length;
		var layerNextSibling = drawing.current_layer.nextSibling;
		batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(drawing.current_layer, layerNextSibling, svgcontent));

		while (drawing.current_layer.firstChild) {
			var ch = drawing.current_layer.firstChild;
			if (ch.localName == 'title') {
				var chNextSibling = ch.nextSibling;
				batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(ch, chNextSibling, drawing.current_layer));
				drawing.current_layer.removeChild(ch);
				continue;
			}
			var oldNextSibling = ch.nextSibling;
			prev.appendChild(ch);
			batchCmd.addSubCommand(new svgedit.history.MoveElementCommand(ch, oldNextSibling, drawing.current_layer));
		}

		// Remove current layer
		svgcontent.removeChild(drawing.current_layer);

		if (!skipHistory) {
			clearSelection();
			identifyLayers();

			call('changed', [svgcontent]);

			addCommandToHistory(batchCmd);
		}

		drawing.current_layer = prev;
		return batchCmd;
	};

	this.mergeAllLayers = function() {
		var batchCmd = new svgedit.history.BatchCommand('Merge all Layers');
		var drawing = getCurrentDrawing();
		drawing.current_layer = drawing.all_layers[drawing.getNumLayers()-1][1];
		while ($(svgcontent).children('g').length > 1) {
			batchCmd.addSubCommand(canvas.mergeLayer(true));
		}

		clearSelection();
		identifyLayers();
		call('changed', [svgcontent]);
		addCommandToHistory(batchCmd);
	};

// Function: leaveContext
// Return from a group context to the regular kind, make any previously
// disabled elements enabled again
	var leaveContext = this.leaveContext = function() {
		var i, len = disabled_elems.length;
		if (len) {
			for (i = 0; i < len; i++) {
				var elem = disabled_elems[i];
				var orig = elData(elem, 'orig_opac');
				if (orig !== 1) {
					elem.setAttribute('opacity', orig);
				} else {
					elem.removeAttribute('opacity');
				}
				elem.setAttribute('style', 'pointer-events: inherit;cursor:default');
			}
			disabled_elems = [];
			clearSelection(true);
			call('contextset', null);
		}
		current_group = null;
	};

// Function: setContext
// Set the current context (for in-group editing)
	var setContext = this.setContext = function(elem) {
		leaveContext();
		if (typeof elem === 'string') {
			elem = svgedit.utilities.getElem(elem);
		}

		// Edit inside this group
		current_group = elem;

		// Disable other elements
		$(elem).parentsUntil('#svgcontent').andSelf().siblings().each(function() {
			var opac = this.getAttribute('opacity') || 1;
			// Store the original's opacity
			elData(this, 'orig_opac', opac);
			this.setAttribute('opacity', opac * 0.33);
			this.setAttribute('style', 'pointer-events: none');
			disabled_elems.push(this);
		});

		clearSelection();
		call('contextset', current_group);
	};

// Group: Document functions

// Function: clear
// Clears the current document. This is not an undoable action.
	this.clear = function() {
		pathActions.clear();

		clearSelection();

		// clear the svgcontent node
		canvas.clearSvgContentElement();

		// create new document
		canvas.current_drawing_ = new svgedit.draw.Drawing(svgcontent);

		// create empty first layer
		canvas.createLayer('Layer 1');

		// clear the undo stack
		canvas.undoMgr.resetUndoStack();

		// reset the selector manager
		selectorManager.initGroup();

		// reset the rubber band box
		rubberBox = selectorManager.getRubberBandBox(getCurrentDrawing().getCurrentLayerColor());

		svgedit.transformlist.resetListMap();

		call('cleared');
	};

// Function: linkControlPoints
// Alias function
	this.linkControlPoints = pathActions.linkControlPoints;

// Function: getContentElem
// Returns the content DOM element
	this.getContentElem = function() { return svgcontent; };

// Function: getRootElem
// Returns the root DOM element
	this.getRootElem = function() { return svgroot; };

// Function: getSelectedElems
// Returns the array with selected DOM elements
	this.getSelectedElems = function() { return selectedElements; };

// Function: getResolution
// Returns the current dimensions and zoom level in an object
	var getResolution = this.getResolution = function(actualSize) {
//		var vb = svgcontent.getAttribute('viewBox').split(' ');
//		return {'w':vb[2], 'h':vb[3], 'zoom': current_zoom};

		var width = svgcontent.getAttribute('width')/current_zoom / canvasScale;
		var height = svgcontent.getAttribute('height')/current_zoom / canvasScale;

		var x = 0;
		var y = 0;

		if (actualSize)
		{
            var bbox = getStrokedBBox([svgcontent]);
            
            width = Math.max(width , Math.round(bbox.width));
            height = Math.max(height , Math.round(bbox.height));

            x = Math.round(bbox.x);
            y = Math.round(bbox.y);
		}

		return {
			'w': width,
			'h': height,
			'zoom': current_zoom,
			'x' : x,
			'y' : y
		};
	};

// Function: getZoom
// Returns the current zoom level
	this.getZoom = function(){return current_zoom;};

// Function: getVersion
// Returns a string which describes the revision number of SvgCanvas.
	this.getVersion = function() {
		return 'svgcanvas.js ($Rev$)';
	};

// Function: setUiStrings
// Update interface strings with given values
//
// Parameters:
// strs - Object with strings (see uiStrings for examples)
	this.setUiStrings = function(strs) {
		$.extend(uiStrings, strs.notification);
	};

// Function: setConfig
// Update configuration options with given values
//
// Parameters:
// opts - Object with options (see curConfig for examples)
	this.setConfig = function(opts) {
		$.extend(curConfig, opts);
	};

// Function: getTitle
// Returns the current group/SVG's title contents
	this.getTitle = function(elem) {
		var i;
		elem = elem || selectedElements[0];
		if (!elem) {return;}
		elem = $(elem).data('gsvg') || $(elem).data('symbol') || elem;
		var childs = elem.childNodes;
		for (i = 0; i < childs.length; i++) {
			if (childs[i].nodeName == 'title') {
				return childs[i].textContent;
			}
		}
		return '';
	};

// Function: setGroupTitle
// Sets the group/SVG's title content
// TODO: Combine this with setDocumentTitle
	this.setGroupTitle = function(val) {
		var elem = selectedElements[0];
		elem = $(elem).data('gsvg') || elem;

		var ts = $(elem).children('title');

		var batchCmd = new svgedit.history.BatchCommand('Set Label');

		if (!val.length) {
			// Remove title element
			var tsNextSibling = ts.nextSibling;
			batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(ts[0], tsNextSibling, elem));
			ts.remove();
		} else if (ts.length) {
			// Change title contents
			var title = ts[0];
			batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(title, {'#text': title.textContent}));
			title.textContent = val;
		} else {
			// Add title element
			title = svgdoc.createElementNS(NS.SVG, 'title');
			title.textContent = val;
			$(elem).prepend(title);
			batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(title));
		}

		addCommandToHistory(batchCmd);
	};

// Function: getDocumentTitle
// Returns the current document title or an empty string if not found
	var getDocumentTitle = this.getDocumentTitle = function() {
		return canvas.getTitle(svgcontent);
	};

// Function: setDocumentTitle
// Adds/updates a title element for the document with the given name.
// This is an undoable action
//
// Parameters:
// newtitle - String with the new title
	this.setDocumentTitle = function(newtitle) {
		var i;
		var childs = svgcontent.childNodes, doc_title = false, old_title = '';

		var batchCmd = new svgedit.history.BatchCommand('Change Image Title');

		for (i = 0; i < childs.length; i++) {
			if (childs[i].nodeName == 'title') {
				doc_title = childs[i];
				old_title = doc_title.textContent;
				break;
			}
		}
		if (!doc_title) {
			doc_title = svgdoc.createElementNS(NS.SVG, 'title');
			svgcontent.insertBefore(doc_title, svgcontent.firstChild);
		}

		if (newtitle.length) {
			doc_title.textContent = newtitle;
		} else {
			// No title given, so element is not necessary
			doc_title.parentNode.removeChild(doc_title);
		}
		batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(doc_title, {'#text': old_title}));
		addCommandToHistory(batchCmd);
	};

// Function: getEditorNS
// Returns the editor's namespace URL, optionally adds it to root element
//
// Parameters:
// add - Boolean to indicate whether or not to add the namespace value
	this.getEditorNS = function(add) {
		if (add) {
			svgcontent.setAttribute('xmlns:se', NS.SE);
		}
		return NS.SE;
	};

// Function: setResolution
// Changes the document's dimensions to the given size
//
// Parameters:
// x - Number with the width of the new dimensions in user units.
// Can also be the string "fit" to indicate "fit to content"
// y - Number with the height of the new dimensions in user units.
//
// Returns:
// Boolean to indicate if resolution change was succesful.
// It will fail on "fit to content" option with no content to fit to.
	this.setResolution = function(x, y) {
		var res = getResolution();
		var w = res.w, h = res.h;
		var batchCmd;

		if (x == 'fit') {
			// Get bounding box
			var bbox = getStrokedBBox();

			if (bbox) {
				batchCmd = new svgedit.history.BatchCommand('Fit Canvas to Content');
				var visEls = getVisibleElements();
				addToSelection(visEls);
				var dx = [], dy = [];
				$.each(visEls, function(i, item) {
					dx.push(bbox.x*-1);
					dy.push(bbox.y*-1);
				});

				var cmd = canvas.moveSelectedElements(dx, dy, true);
				batchCmd.addSubCommand(cmd);
				clearSelection();

				x = Math.round(bbox.width);
				y = Math.round(bbox.height);
			} else {
				return false;
			}
		}
		if (x != w || y != h) {
			if (!batchCmd) {
				batchCmd = new svgedit.history.BatchCommand('Change Image Dimensions');
			}

			x = svgedit.units.convertToNum('width', x);
			y = svgedit.units.convertToNum('height', y);

			svgcontent.setAttribute('width', x);
			svgcontent.setAttribute('height', y);

			this.contentW = x;
			this.contentH = y;
			batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(svgcontent, {'width':w, 'height':h}));

			svgcontent.setAttribute('viewBox', [0, 0, x/current_zoom, y/current_zoom].join(' '));
			batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(svgcontent, {'viewBox': ['0 0', w, h].join(' ')}));

			addCommandToHistory(batchCmd);
			call('changed', [svgcontent]);
		}
		return true;
	};

// Function: getOffset
// Returns an object with x, y values indicating the svgcontent element's
// position in the editor's canvas.
	this.getOffset = function() {
		return $(svgcontent).attr(['x', 'y']);
	};

// Function: setBBoxZoom
// Sets the zoom level on the canvas-side based on the given value
//
// Parameters:
// val - Bounding box object to zoom to or string indicating zoom option
// editor_w - Integer with the editor's workarea box's width
// editor_h - Integer with the editor's workarea box's height
	this.setBBoxZoom = function(val, editor_w, editor_h) {
		var spacer = 0.85;
		var bb;
		var calcZoom = function(bb) {
			if (!bb) {return false;}
			var w_zoom = Math.round((editor_w / bb.width)*100 * spacer)/100;
			var h_zoom = Math.round((editor_h / bb.height)*100 * spacer)/100;
			var zoomlevel = Math.min(w_zoom, h_zoom);
			canvas.setZoom(zoomlevel , 1);
			return {'zoom': zoomlevel, 'bbox': bb};
		};

		if (typeof val == 'object') {
			bb = val;
			if (bb.width == 0 || bb.height == 0) {
				var newzoom = bb.zoom ? bb.zoom : current_zoom * bb.factor;
				canvas.setZoom(newzoom , 2);
				return {'zoom': current_zoom, 'bbox': bb};
			}
			return calcZoom(bb);
		}

		switch (val) {
			case 'selection':
				if (!selectedElements[0]) {return;}
				var sel_elems = $.map(selectedElements, function(n){ if (n) {return n;} });
				bb = getStrokedBBox(sel_elems);
				break;
			case 'canvas':
				var res = getResolution();
				spacer = 0.95;
				bb = {width:res.w, height:res.h , x:0, y:0};
				break;
			case 'content':
				bb = getStrokedBBox();
				break;
			case 'layer':
				bb = getStrokedBBox(getVisibleElements(getCurrentDrawing().getCurrentLayer()));
				break;
			default:
				return;
		}
		return calcZoom(bb);
	};

// Function: setZoom
// Sets the zoom to the given level
//
// Parameters:
// zoomlevel - Float indicating the zoom level to change to
	this.setZoom = function(zoomlevel , idx) {
		//return;
		//var res = getResolution();

		//console.log('=============================== zoom id: ' + svgcontent.getAttribute('viewBox') + ", " + (res.w/zoomlevel) + ' ' + (res.h/zoomlevel));

		//svgcontent.setAttribute('viewBox', '0 0 ' + res.w/zoomlevel + ' ' + res.h/zoomlevel);

		/*
		 //current_zoom = zoomlevel;
		 //$.each(selectedElements, function(i, elem) {
		 if (!elem) {return;}
		 //selectorManager.requestSelector(elem).resize(4);
		 });
		 //pathActions.zoomChange();
		 //runExtensions('zoomChanged', zoomlevel);

		 ///*/

		//updateCrossRuler();
		//this.zoomCanvas(zoomlevel);
	};

	this.recordMouse = function(evt)
	{
		/*
		 var rs = $('#svgcontent g')[0].getScreenCTM().inverse();

		 var pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, rs );
		 currentMousePos.x = pt.x * current_zoom;
		 currentMousePos.y = pt.y * current_zoom;
		 */
	}

	this.resetTransform = function()
	{
		canvasX = 0;
		canvasY = 0;

		canvasScale = 1;

		//if (svgCanvas != null && svgCanvas != undefined)
		//this.transformCanvas(null , 0 , 0 , 0 , true , false);
	}

	this.transformCanvasZoom = function(evt , startX , startY , deltaX , deltaY , deltaS , isS , isAbsolute)
	{
		var rs , pt , x1 , y1 , x2 , y2;

		x1 = startX;
		y1 = startY;

		var old_w = svgcontent.getAttribute('width');
		var old_h = svgcontent.getAttribute('height');

		var old_x = svgcontent.getAttribute('x');
		var old_y = svgcontent.getAttribute('y');

		var init_w = old_w / canvasScale;
		var init_h = old_h / canvasScale;

		var ESCALE = 1.1;
		var zoomDelta = (deltaS == 0 ? 1 : ((deltaS > 0) ? ESCALE : 1 / ESCALE));
		canvasScale = canvasScale * zoomDelta;

		var w = parseFloat(old_w) * zoomDelta;
		var h = parseFloat(old_h) * zoomDelta;

		if (isAbsolute)
		{
			canvasScale = deltaS;

			w = init_w * canvasScale;
			h = init_h * canvasScale;
		}

		canvasX += deltaX;
		canvasY += deltaY;

		var x = parseFloat(old_x) + deltaX;
		var y = parseFloat(old_y) + deltaY;

		svgedit.utilities.assignAttributes(svgcontent, {
			width: w,
			height: h,
			'x': x,
			'y': y,
			'viewBox' : '0 0 ' + this.contentW + ' ' + this.contentH
		});

		var bg = $('#canvasBackground')[0];
		svgedit.utilities.assignAttributes(bg, {
			width: '100%',
			height: '100%',
			x: 0,
			y: 0,
		});
        var bg_wang = $('#gridpattern')[0];
        svgedit.utilities.assignAttributes(bg_wang, {
            width: 100*canvas.getCanvasScale(),
            height: 100*canvas.getCanvasScale(),
            x: 0,
            y: 0
        });
        var bg_w = $('#gridpattern image')[0];
        svgedit.utilities.assignAttributes(bg_w, {
            width: 100*canvas.getCanvasScale(),
            height: 100*canvas.getCanvasScale(),
            x: 0,
            y: 0
        });
		var bg_img = svgedit.utilities.getElem('background_image');
		if (bg_img) {
			svgedit.utilities.assignAttributes(bg_img, {
				'width': '100%',
				'height': '100%'
			});
		}

		//selectorManager.selectorParentGroup.setAttribute('transform', 'translate(' + x + ',' + y + ')' + ' ' + 'scale(' + canvasScale + ')');
        selectorManager.setTransform('translate(' + x + ',' + y + ')' + ' ' + 'scale(' + canvasScale + ')');

		/**************************************************************************************/
		var dashStep = 5 / canvasScale;
		var stokeWidth = 1 / canvasScale;
		selectorManager.crossRulerLines.setAttribute('stroke-dasharray' , dashStep + ',' + dashStep);
		selectorManager.crossRulerLines.setAttribute('stroke-width' ,stokeWidth);

		var oldPathString = selectorManager.crossRulerLines.getAttribute('d');
		var substring = oldPathString.split(',');
		if (substring != null && substring.length == 4)
		{
			var newPathString = 'M' + (-1500) / canvasScale + ',' + substring[1] + ',' + substring[2] + ',' + (-1500) / canvasScale;
			selectorManager.crossRulerLines.setAttribute('d', newPathString);
		}

		if (current_mode == 'eraser')
		{
			var eRectSize = parseFloat(selectorManager.erasorCursorRect.getAttribute('width'));
			var eRectX = parseFloat(selectorManager.erasorCursorRect.getAttribute('x')) + eRectSize;
			var eRectY = parseFloat(selectorManager.erasorCursorRect.getAttribute('y')) + eRectSize;

			var eRectASize = bitmapUtils.getEraserSize() / canvasScale;

			if (bitmapUtils.isSquareEraser())
			{
				svgedit.utilities.assignAttributes(selectorManager.erasorCursorRect, {
					'x' : eRectX - eRectASize * 0.5 ,
					'y' : eRectY - eRectASize * 0.5,
					'width' : eRectASize,
					'height' : eRectASize,
					'stroke' : 'red',
					'display': 'inline'
				});
			}
			else
			{
				svgedit.utilities.assignAttributes(selectorManager.erasorCursorCircle, {
					'cx' : eRectX ,
					'cy' : eRectY,
					'r' : eRectASize * 0.5,
					'stroke' : 'red',
					'display': 'inline'
				});
			}
		}
		/**************************************************************************************/

		this.panRuler(1);

		if (isS && evt != null)
		{
			rs = $('#svgcontent g')[0].getScreenCTM().inverse();
			pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, rs );
			x2 = pt.x * current_zoom;
			y2 = pt.y * current_zoom;

			this.transformCanvasZoom(evt , startX , startY , (x2 - x1) * canvasScale , (y2 - y1) * canvasScale , 0 , false);
		}

		$('#zoom').val((canvasScale * 100).toFixed(0));

        updatePathGripSize();
	}

	this.transformCanvas = function(evt , deltaX , deltaY , deltaS , isS , isAbsolute)
	{
		var rs , pt , x1 , y1 , x2 , y2;

		if (isS && evt != null)
		{
			rs = $('#svgcontent g')[0].getScreenCTM().inverse();
			pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, rs );
			x1 = pt.x * current_zoom;
			y1 = pt.y * current_zoom;
		}

		var ESCALE = 1.1;
		var zoomDelta = (deltaS == 0 ? 1 : ((deltaS > 0) ? ESCALE : 1 / ESCALE));
		if (isAbsolute)
		{
			zoomDelta = deltaS;
		}
		canvasScale = canvasScale * zoomDelta;

		var old_w = svgcontent.getAttribute('width');
		var old_h = svgcontent.getAttribute('height');

		var old_x = svgcontent.getAttribute('x');
		var old_y = svgcontent.getAttribute('y');

		var w = parseFloat(old_w) * zoomDelta;
		var h = parseFloat(old_h) * zoomDelta;

		canvasX += deltaX;
		canvasY += deltaY;

		var x = parseFloat(old_x) + deltaX;
		var y = parseFloat(old_y) + deltaY;

		svgedit.utilities.assignAttributes(svgcontent, {
			width: w,
			height: h,
			'x': x,
			'y': y,
			'viewBox' : '0 0 ' + this.contentW + ' ' + this.contentH
		});

		var bg = $('#canvasBackground')[0];
		svgedit.utilities.assignAttributes(bg, {
			width: '100%',
			height: '100%',
			x: 0,
			y: 0
		});
        var bg_wang = $('#gridpattern')[0];
        svgedit.utilities.assignAttributes(bg_wang, {
            width: 100*canvas.getCanvasScale(),
            height: 100*canvas.getCanvasScale(),
            x: 0,
            y: 0
        });
        var bg_w = $('#gridpattern image')[0];
        svgedit.utilities.assignAttributes(bg_w, {
            width: 100*canvas.getCanvasScale(),
            height: 100*canvas.getCanvasScale(),
            x: 0,
            y: 0
        });

		var bg_img = svgedit.utilities.getElem('background_image');
		if (bg_img) {
			svgedit.utilities.assignAttributes(bg_img, {
				'width': '100%',
				'height': '100%'
			});
		}

		//selectorManager.selectorParentGroup.setAttribute('transform', 'translate(' + x + ',' + y + ')' + ' ' + 'scale(' + canvasScale + ')');
        selectorManager.setTransform('translate(' + x + ',' + y + ')' + ' ' + 'scale(' + canvasScale + ')');

		/**************************************************************************************/
		var dashStep = 5 / canvasScale;
		var stokeWidth = 1 / canvasScale;
		selectorManager.crossRulerLines.setAttribute('stroke-dasharray' , dashStep + ',' + dashStep);
		selectorManager.crossRulerLines.setAttribute('stroke-width' ,stokeWidth);

		var oldPathString = selectorManager.crossRulerLines.getAttribute('d');
		var substring = oldPathString.split(',');
		if (substring != null && substring.length == 4)
		{
			var newPathString = 'M' + (-1500) / canvasScale + ',' + substring[1] + ',' + substring[2] + ',' + (-1500) / canvasScale;
			selectorManager.crossRulerLines.setAttribute('d', newPathString);
		}

		if (current_mode == 'eraser')
		{
			var eRectSize = parseFloat(selectorManager.erasorCursorRect.getAttribute('width'));
			var eRectX = parseFloat(selectorManager.erasorCursorRect.getAttribute('x')) + eRectSize;
			var eRectY = parseFloat(selectorManager.erasorCursorRect.getAttribute('y')) + eRectSize;

			var eRectASize = bitmapUtils.getEraserSize() / canvasScale;

			if (bitmapUtils.isSquareEraser())
			{
				svgedit.utilities.assignAttributes(selectorManager.erasorCursorRect, {
					'x' : eRectX - eRectASize * 0.5 ,
					'y' : eRectY - eRectASize * 0.5,
					'width' : eRectASize,
					'height' : eRectASize,
					'stroke' : 'red',
					'display': 'inline'
				});
			}
			else
			{
				svgedit.utilities.assignAttributes(selectorManager.erasorCursorCircle, {
					'cx' : eRectX ,
					'cy' : eRectY,
					'r' : eRectASize * 0.5,
					'stroke' : 'red',
					'display': 'inline'
				});
			}
		}
		/**************************************************************************************/

		this.panRuler(1);

		if (isS && evt != null)
		{
			rs = $('#svgcontent g')[0].getScreenCTM().inverse();
			pt = svgedit.math.transformPoint( evt.pageX, evt.pageY, rs );
			x2 = pt.x * current_zoom;
			y2 = pt.y * current_zoom;

			this.transformCanvas(evt , (x2 - x1) * canvasScale , (y2 - y1) * canvasScale , false);
		}

		$('#zoom').val((canvasScale * 100).toFixed(0));

       	updatePathGripSize();
	}

	this.showIndicatorInfo = function(_x , _y , _text)
	{
        if (activeIndicator == null)
        {
            activeIndicator = svgCanvas.addSvgElementFromJson({
                'element': 'text',
                'attr': {
                    'id':'overlay_info',
                    'style': 'pointer-events:none' ,
                    'fill': '#ff2a21',
                    'stroke-width' : 0.1,
                    'font-size' : activeIndicatorFontSize / svgCanvas.getCanvasScale(),
                }
            });

            selectorManager.canvasForgeground.appendChild(activeIndicator);
        }

        activeIndicator.setAttribute('x' , _x);
        activeIndicator.setAttribute('y' , _y);

        activeIndicator.textContent = _text;
	}

    this.hideIndicatorInfo = function()
    {
        if (activeIndicator == null)
        {
            activeIndicator = svgCanvas.addSvgElementFromJson({
                'element': 'text',
                'attr': {
                    'id':'overlay_info',
                    'style': 'pointer-events:none' ,
                    'fill': '#ffc733',
                    'stroke-width' : 0.1,
                    'font-size' : activeIndicatorFontSize / svgCanvas.getCanvasScale(),
                }
            });

            selectorManager.canvasForgeground.appendChild(activeIndicator);
        }

        activeIndicator.textContent = '';
    }

	this.getCanvasScale = function ()
	{
		return canvasScale;
	}

	this.getCanvasTranslate = function()
	{
		return {x: canvasX , y : canvasY};
	}

	this.zoomCanvas = function(_zoomDelta)
	{
		var zoomDelta = ((_zoomDelta > 0) ? 1.1 : 0.9);
		canvasScale = canvasScale * zoomDelta;

		var old_w = svgcontent.getAttribute('width');
		var old_h = svgcontent.getAttribute('height');
		var w = parseFloat(old_w) * zoomDelta;
		var h = parseFloat(old_h) * zoomDelta;

		var old_x = svgcontent.getAttribute('x');
		var old_y = svgcontent.getAttribute('y');
		var x = parseInt(old_x);
		var y = parseInt(old_y);

		svgedit.utilities.assignAttributes(svgcontent, {
			width: w,
			height: h
		});

		var bg = $('#canvasBackground')[0];
		svgedit.utilities.assignAttributes(bg, {
			width: '100%',
			height: '100%',
			x: 0,
			y: 0
		});

		var bg_img = svgedit.utilities.getElem('background_image');
		if (bg_img) {
			svgedit.utilities.assignAttributes(bg_img, {
				'width': '100%',
				'height': '100%'
			});
		}

		//selectorManager.selectorParentGroup.setAttribute('transform', 'translate(' + x + ',' + y + ')' + ' ' + 'scale(' + canvasScale + ')');
        selectorManager.setTransform('translate(' + x + ',' + y + ')' + ' ' + 'scale(' + canvasScale + ')');
	}

	this.panCanvas = function(panX , panY)
	{
		this.canvasPanX += panX;
		this.canvasPanY += panY;

		var old_x = svgcontent.getAttribute('x');
		var old_y = svgcontent.getAttribute('y');
		var x = parseInt(old_x) + panX;
		var y = parseInt(old_y) + panY;

		svgedit.utilities.assignAttributes(svgcontent, {
			width: this.contentW*current_zoom,
			height: this.contentH*current_zoom,
			'x': x,
			'y': y,
			'viewBox' : '0 0 ' + this.contentW + ' ' + this.contentH
		});

		var bg = $('#canvasBackground')[0];
		svgedit.utilities.assignAttributes(bg, {
			width: '100%',
			height: '100%',
			x: 0,
			y: 0
		});

		var bg_img = svgedit.utilities.getElem('background_image');
		if (bg_img) {
			svgedit.utilities.assignAttributes(bg_img, {
				'width': '100%',
				'height': '100%'
			});
		}

		//selectorManager.selectorParentGroup.setAttribute('transform', 'translate(' + x + ',' + y + ')');
        selectorManager.setTransform('translate(' + x + ',' + y + ')');

		this.panRuler(1);
	}

	this.panRuler = function(zoom)
	{
		var d, i;
		var limit = 30000;
		var contentElem = svgCanvas.getContentElem();
		var units = svgedit.units.getTypeMap();
		var unit = units[curConfig.baseUnit]; // 1 = 1px

		// draw x ruler then y ruler
		for (d = 0; d < 2; d++) {
			var isX = (d === 0);
			var dim = isX ? 'x' : 'y';
			var lentype = isX ? 'width' : 'height';
			var contentDim = Number(contentElem.getAttribute(dim));

			var $hcanv_orig = $('#ruler_' + dim + ' canvas:first');

			// Bit of a hack to fully clear the canvas in Safari & IE9
			var $hcanv = $hcanv_orig.clone();
			$hcanv_orig.replaceWith($hcanv);

			var hcanv = $hcanv[0];

			// Set the canvas size to the width of the container
			var scanvas = $('#svgcanvas');

			var ruler_len = scanvas[lentype]();
			var total_len = ruler_len;
			hcanv.parentNode.style[lentype] = total_len + 'px';
			var ctx_num = 0;
			var ctx = hcanv.getContext('2d');
			var ctx_arr, num, ctx_arr_num;

			ctx.fillStyle = 'rgb(200,0,0)';
			ctx.fillRect(0, 0, hcanv.width, hcanv.height);

			// Remove any existing canvasses
			$hcanv.siblings().remove();

			// Create multiple canvases when necessary (due to browser limits)
			if (ruler_len >= limit) {
				ctx_arr_num = parseInt(ruler_len / limit, 10) + 1;
				ctx_arr = [];
				ctx_arr[0] = ctx;
				var copy;
				for (i = 1; i < ctx_arr_num; i++) {
					hcanv[lentype] = limit;
					copy = hcanv.cloneNode(true);
					hcanv.parentNode.appendChild(copy);
					ctx_arr[i] = copy.getContext('2d');
				}

				copy[lentype] = ruler_len % limit;

				// set copy width to last
				ruler_len = limit;
			}

			hcanv[lentype] = ruler_len;

			var u_multi = unit * zoom;

			var r_intervals = [];
			var i;
			for (i = 0.1; i < 1E5; i *= 10) {
				r_intervals.push(i);
				r_intervals.push(2 * i);
				r_intervals.push(5 * i);
			}

			// Calculate the main number interval
			var raw_m = 50 / u_multi;
			var multi = 1;
			for (i = 0; i < r_intervals.length; i++) {
				num = r_intervals[i];
				multi = num;
				if (raw_m <= num) {
					break;
				}
			}

			var big_int = multi * u_multi;

			ctx.font = '9px sans-serif';

			var ruler_d = ((contentDim / u_multi) % multi) * u_multi;
			var label_pos = ruler_d - big_int;
			// draw big intervals
			while (ruler_d < total_len) {
				label_pos += big_int;
				// var real_d = ruler_d - contentDim; // Currently unused

				var cur_d = Math.round(ruler_d) + 0.5;
				if (isX) {
					ctx.moveTo(cur_d, 15);
					ctx.lineTo(cur_d, 0);
				}
				else {
					ctx.moveTo(15, cur_d);
					ctx.lineTo(0, cur_d);
				}

				num = (label_pos - contentDim) / u_multi;
				var label;
				if (multi >= 1) {
					label = Math.round(num);
				}
				else {
					var decs = String(multi).split('.')[1].length;
					label = num.toFixed(decs);
				}

				// Change 1000s to Ks
				if (label !== 0 && label !== 1000 && label % 1000 === 0) {
					label = (label / 1000) + 'K';
				}

				if (isX) {
					ctx.fillText(label, ruler_d + 2, 8);
				} else {
					// draw label vertically
					var str = String(label).split('');
					for (i = 0; i < str.length; i++) {
						ctx.fillText(str[i], 1, (ruler_d + 9) + i * 9);
					}
				}

				var part = big_int / 10;
				// draw the small intervals
				for (i = 1; i < 10; i++) {
					var sub_d = Math.round(ruler_d + part * i) + 0.5;
					if (ctx_arr && sub_d > ruler_len) {
						ctx_num++;
						ctx.stroke();
						if (ctx_num >= ctx_arr_num) {
							i = 10;
							ruler_d = total_len;
							continue;
						}
						ctx = ctx_arr[ctx_num];
						ruler_d -= limit;
						sub_d = Math.round(ruler_d + part * i) + 0.5;
					}

					// odd lines are slighly longer
					var line_num = (i % 2) ? 12 : 10;
					if (isX) {
						ctx.moveTo(sub_d, 15);
						ctx.lineTo(sub_d, line_num);
					} else {
						ctx.moveTo(15, sub_d);
						ctx.lineTo(line_num, sub_d);
					}
				}
				ruler_d += big_int;
			}
			ctx.strokeStyle = '#000';
			ctx.stroke();
		}
	}

	this.isContextMenuEnabled = function()
	{
		if (current_mode == 'path')
		{
			if (started)
			{
                return false;
			}
		}

		return true;
	}

	this.setIsMagicWand = function(_isMagicWand)
	{
		console.log('------------------------------ is magic wand: ' + _isMagicWand);
	}

	this.setIsDirectToEditPath = function(_isDirectToEdit)
	{
		isDirectToEditPath = _isDirectToEdit;
	};

// Function: getMode
// Returns the current editor mode string
	this.getMode = function() {
		return current_mode;
	};

// Function: setMode
// Sets the editor's mode to the given string
//
// Parameters:
// name - String with the new mode to change to
	this.setMode = function(name) {
		pathActions.clear(true);
		textActions.clear();
		cur_properties = (selectedElements[0] && selectedElements[0].nodeName == 'text') ? cur_text : cur_shape;

		bitmapUtils.switchMode(current_mode , name);

        current_mode = name;
		var workArea = $('#workarea');
		/*
		switch(current_mode)
		{
			case 'eraser':
				console.log(workArea);
				//workArea[0].style.cursor = "url('none'), auto";
				workArea.css('cursor', 'none');
				break;

			case 'image':
				workArea[0].style.cursor = "url('data:image/png;base64,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AAAA/wAAAMgAAAAA/wAAAF0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADMAAAAHAAAAAAAAAAAAAAAAAAAAAAAAALoAAAD/AAAAPgAAAPIAAADHAAAAAP8AAABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1wAAAP8AAADzAAAAoAAAAAD/AAAAmAAAAD8AAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAAQAAAAEAAAABAAAAANgAAAF0AAAD/AAAA/wAAAJ0AAAAA6gAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAAD/AAAA/wAAAP8AAACaAAAAAHUAAACfAAAArQAAAKwAAACsAAAArAAAAKwAAACsAAAArAAAAKwAAACsAAAArAAAAKwAAACsAAAArAAAAKwAAACsAAAArAAAAKwAAACsAAAAqQAAAI4AAACKAAAATgD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wABAAD//1ZiGRkZzxpGAAAAAElFTkSuQmCC'), auto";
				break;

			case 'lasso':
				workArea[0].style.cursor = "url('data:image/png;base64,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'), auto";
				break;

			case 'zoom':
				workArea[0].style.cursor = "url('data:image/png;base64,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'), auto";
				break;

			case 'ext-panning':
				workArea[0].style.cursor = "url('data:image/png;base64,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'), auto";
				break;

			case 'eyedropper':
			case 'colorpicker':
				workArea[0].style.cursor = "url('data:image/png;base64,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'), auto";
				break;

			case 'quickselect':
				workArea[0].style.cursor = "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAACGUlEQVR42q2VTUhUURSAz9gyTKyFRRHoUI1BBSG1iMRNWNiftXBTUC2rKYwwWkctpJ1G2R9CbUpb9GM/BlqRFgW2DPohIgSxnWgJlfgdzpGG4b2Z+3AOfIt598397rn33PNSIvINBqATPkiJIwXXYROUw6iL7sGfUgk2wANYDdshCxm46ozNV6Dxwlfe67/XwjFogWc+9mY+gv1wEurzxivgEByFCRfdgemkggXwFZol+qD1vUY4DnVwEy7Dj1CBxhlYA0eK/Cft23cQXkGHb3FRwRL4JHbAPwOyXwgHXKZxCW7DVJxA45rYvbgQusceDb4Dm2ELfIwTrIdHUAN/EwiWQx+8FiuWf3ECjUGxA7wbOLku6qHYWVzMH4wS7INW2Bow+Ta4JXY5e6JeiBJoyX4RuxsjBSav923Z4VsTGamY521QC4cLCCrhuVijbEsqWAyfJbpkV4ldsGmX9MNLOJ1EoKGN7jucz3m2UawI3sKeHMlTGIJTSQTr4LFYyWrrTvtKT4i1lCqX/BbrWZrJsFiBBAnE97dLrBXoQbaLXcYy6IZlsDtHopm8E7sLQYK9cFassu7DuZwxlWjTW+GSX7BIrL2/90yLCnRiPewn8r/nSJ7kBqyEXS4p90y0K2eLCTSWwjjMxIyX+bZVu2TKM9FFjYQIQiLlEi2EnZ7JFagtlWAuEy0I/bZr29dvS1MpBXOZaKPMeCaTs+L8bnwocyWFAAAAAElFTkSuQmCC'), auto";
				break;

			case 'text':
				workArea[0].style.cursor = "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAABiElEQVR42rWVTStEURiA7xD+ga+wJ2XJ2LjJDiOlJGGBIraEX2DjY+MHKCkrDQqFbFiYna81G6zsEXne7jmajuvcczCnns2caZ57nvveuamgwCvl+L0y2IZeeCmEoAt2oQd2CiFYhya4giEl63M5jYugFB6hA46gGg5gWYn+LJA8M9AGJ7AKNdACw/8hkDyXEMI+pJXwRp3GmilJINPzAHMwCP1w65MpSaDz3MEFrPlmShLoPAvQGEQ3exJaXTPZBGaeUH1e4ZPJJojLo5dzJptA55lXeZ7y9sxMVfDqI9APVyeMwrixb2Zagj0fgeTZgmPLCdthAGqhGUZ8BJLnOUEQQjnMwrU6zbdMcQI9PRnVuMjYP4dF10xxAj098sfWABvG/r26YlkyTSu2THECyZODMZiCM0smmaa0LZMpKAmicZQ31ybUwYdFoDPJmB7GZTIF0rsb6oPoIZoOkldG/ehEXKafpiin7sOpg0CvSpVJTvNmExRDNojev+8egvzTfGV1fSf/en0CzblkGXI3LEsAAAAASUVORK5CYII='), auto";
				break;

			case 'line':
			case 'fhpath':
				workArea[0].style.cursor = "url('data:image/png;base64,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'), auto";
				break;


			case 'path':
				workArea[0].style.cursor = "url('data:image/png;base64,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') , auto";
				break;

			default:
				workArea.css('cursor', 'auto');
				break;
		}
		//*/
		
	};

// Group: Element Styling

	this.setStrokePattern = function(defsElem , pId , preventUndo)
	{
        var elems = [];
        function addNonG (e)
		{
            if (e.nodeName != 'g')
            {
                elems.push(e);
            }
        }
        var i = selectedElements.length;
        while (i--) {
            var elem = selectedElements[i];
            if (elem)
            {
                if (elem.tagName == 'g')
                {
                    svgedit.utilities.walkTree(elem, addNonG);
                }
                else
				{
                    if (true)
                    {
                        //if (elem.tagName != 'polyline' && elem.tagName != 'line')
                        {
                            elems.push(elem);
                        }
                    }
                }
            }
        }

        if (svgCanvas.getMode() == 'pathedit' && svgedit.path.path.elem)
        {
            elems.push(svgedit.path.path.elem);
        }

        if (elems.length > 0)
        {
            changeSelectedStrokePattern(defsElem , elems, pId);
        }
	}

	this.setFillPattern = function(defsElem , pId, preventUndo , prevCmdNums)
	{
		var elems = [];
		function addNonG (e) {
			if (e.nodeName != 'g') {
				elems.push(e);
			}
		}
		var i = selectedElements.length;
		while (i--) {
			var elem = selectedElements[i];
			if (elem) {
				if (elem.tagName == 'g') {
					svgedit.utilities.walkTree(elem, addNonG);
				} else {
					if (true || type == 'fill')
					{
						if (elem.tagName != 'polyline' && elem.tagName != 'line') {
							elems.push(elem);
						}
					}
				}
			}
		}

		if (svgCanvas.getMode() == 'pathedit' && svgedit.path.path.elem)
		{
            elems.push(svgedit.path.path.elem);
		}

		if (elems.length > 0)
		{
			changeSelectedFillPattern(defsElem , elems, pId , prevCmdNums);
		}

	}

// Function: getColor
// Returns the current fill/stroke option
	this.getColor = function(type) {
		return cur_properties[type];
	};

// Function: setColor
// Change the current stroke/fill color/gradient value
//
// Parameters:
// type - String indicating fill or stroke
// val - The value to set the stroke attribute to
// preventUndo - Boolean indicating whether or not this should be and undoable option
	this.setColor = function(type, val, preventUndo , prevCmdNums) {
		// cur_shape[type] = val;
		cur_properties[type + '_paint'] = {type:'solidColor'};
		var elems = [];
		function addNonG (e) {
			if (e.nodeName != 'g') {
				elems.push(e);
			}
		}
		var i = selectedElements.length;
		while (i--) {
			var elem = selectedElements[i];
			if (elem) {
				if (elem.tagName == 'g') {
					svgedit.utilities.walkTree(elem, addNonG);
				} else {
					if (type == 'fill') {
						if (elem.tagName != 'polyline' && elem.tagName != 'line') {
							elems.push(elem);
						}
					} else {
						elems.push(elem);
					}
				}
			}
		}
		if (elems.length > 0) {
			if (!preventUndo) {
				changeSelectedAttribute(type, val, elems , prevCmdNums);
				call('changed', elems);
			} else {
				changeSelectedAttributeNoUndo(type, val, elems);
			}
		}
	};

// Function: setGradient
// Apply the current gradient to selected element's fill or stroke
//
// Parameters
// type - String indicating "fill" or "stroke" to apply to an element
	var setGradient = this.setGradient = function(type , prevCmdNums) {
		if (!cur_properties[type + '_paint'] || cur_properties[type + '_paint'].type == 'solidColor') {return;}
		var grad = canvas[type + 'Grad'];
		// find out if there is a duplicate gradient already in the defs
		var duplicate_grad = findDuplicateGradient(grad);
		var defs = svgedit.utilities.findDefs();
		// no duplicate found, so import gradient into defs
		if (!duplicate_grad) {
			var orig_grad = grad;
			grad = defs.appendChild( svgdoc.importNode(grad, true) );
			// get next id and set it on the grad
			grad.id = getNextId();
		} else { // use existing gradient
			grad = duplicate_grad;
		}
		canvas.setColor(type, 'url(#' + grad.id + ')' , false , prevCmdNums ? prevCmdNums : 0);
	};

// Function: findDuplicateGradient
// Check if exact gradient already exists
//
// Parameters:
// grad - The gradient DOM element to compare to others
//
// Returns:
// The existing gradient if found, null if not
	var findDuplicateGradient = function(grad) {
		var defs = svgedit.utilities.findDefs();
		var existing_grads = $(defs).find('linearGradient, radialGradient');
		var i = existing_grads.length;
		var rad_attrs = ['r', 'cx', 'cy', 'fx', 'fy'];
		while (i--) {
			var og = existing_grads[i];
			if (grad.tagName == 'linearGradient') {
				if (grad.getAttribute('x1') != og.getAttribute('x1') ||
					grad.getAttribute('y1') != og.getAttribute('y1') ||
					grad.getAttribute('x2') != og.getAttribute('x2') ||
					grad.getAttribute('y2') != og.getAttribute('y2'))
				{
					continue;
				}
			} else {
				var grad_attrs = $(grad).attr(rad_attrs);
				var og_attrs = $(og).attr(rad_attrs);

				var diff = false;
				$.each(rad_attrs, function(i, attr) {
					if (grad_attrs[attr] != og_attrs[attr]) {diff = true;}
				});

				if (diff) {continue;}
			}

			// else could be a duplicate, iterate through stops
			var stops = grad.getElementsByTagNameNS(NS.SVG, 'stop');
			var ostops = og.getElementsByTagNameNS(NS.SVG, 'stop');

			if (stops.length != ostops.length) {
				continue;
			}

			var j = stops.length;
			while (j--) {
				var stop = stops[j];
				var ostop = ostops[j];

				if (stop.getAttribute('offset') != ostop.getAttribute('offset') ||
					stop.getAttribute('stop-opacity') != ostop.getAttribute('stop-opacity') ||
					stop.getAttribute('stop-color') != ostop.getAttribute('stop-color'))
				{
					break;
				}
			}

			if (j == -1) {
				return og;
			}
		} // for each gradient in defs

		return null;
	};

	function reorientGrads(elem, m) {
		var i;
		var bb = svgedit.utilities.getBBox(elem);
		for (i = 0; i < 2; i++) {
			var type = i === 0 ? 'fill' : 'stroke';
			var attrVal = elem.getAttribute(type);
			if (attrVal && attrVal.indexOf('url(') === 0) {
				var grad = svgedit.utilities.getRefElem(attrVal);
				if (grad.tagName === 'linearGradient') {
					var x1 = grad.getAttribute('x1') || 0;
					var y1 = grad.getAttribute('y1') || 0;
					var x2 = grad.getAttribute('x2') || 1;
					var y2 = grad.getAttribute('y2') || 0;

					// Convert to USOU points
					x1 = (bb.width * x1) + bb.x;
					y1 = (bb.height * y1) + bb.y;
					x2 = (bb.width * x2) + bb.x;
					y2 = (bb.height * y2) + bb.y;

					// Transform those points
					var pt1 = svgedit.math.transformPoint(x1, y1, m);
					var pt2 = svgedit.math.transformPoint(x2, y2, m);

					// Convert back to BB points
					var g_coords = {};

					g_coords.x1 = (pt1.x - bb.x) / bb.width;
					g_coords.y1 = (pt1.y - bb.y) / bb.height;
					g_coords.x2 = (pt2.x - bb.x) / bb.width;
					g_coords.y2 = (pt2.y - bb.y) / bb.height;

					var newgrad = grad.cloneNode(true);
					$(newgrad).attr(g_coords);

					newgrad.id = getNextId();
					svgedit.utilities.findDefs().appendChild(newgrad);
					elem.setAttribute(type, 'url(#' + newgrad.id + ')');
				}
			}
		}
	}

// Function: setPaint
// Set a color/gradient to a fill/stroke
//
// Parameters:
// type - String with "fill" or "stroke"
// paint - The jGraduate paint object to apply
	this.setPaint = function(type, paint) {
		// make a copy
		var p = new $.jGraduate.Paint(paint);
		this.setPaintOpacity(type, p.alpha / 100, true);

		// now set the current paint object
		cur_properties[type + '_paint'] = p;
		switch (p.type) {
			case 'solidColor':
				this.setColor(type, p.solidColor != 'none' ? '#' + p.solidColor : 'none');
				break;
			case 'linearGradient':
			case 'radialGradient':
				canvas[type + 'Grad'] = p[p.type];
				setGradient(type);
				break;
		}
	};

	this.setPaint_New = function(type, paint) {
		// make a copy
		var p = new $.jGraduate.Paint(paint);
		this.setPaintOpacity(type, p.alpha / 100, false);

		// now set the current paint object
		cur_properties[type + '_paint'] = p;
		switch (p.type) {
			case 'solidColor':
				this.setColor(type, p.solidColor != 'none' ? '#' + p.solidColor : 'none' , false , 1);
				break;
			case 'linearGradient':
			case 'radialGradient':
				canvas[type + 'Grad'] = p[p.type];
				setGradient(type , 1);
				break;
		}
	};

// alias
	this.setStrokePaint = function(paint) {
		this.setPaint('stroke', paint);
	};

	this.setFillPaint = function(paint) {
		this.setPaint('fill', paint);
	};

// Function: getStrokeWidth
// Returns the current stroke-width value
	this.getStrokeWidth = function() {
		return cur_properties.stroke_width;
	};

// Function: setStrokeWidth
// Sets the stroke width for the current selected elements
// When attempting to set a line's width to 0, this changes it to 1 instead
//
// Parameters:
// val - A Float indicating the new stroke width value
	this.setStrokeWidth = function(val) {
		if (val == 0 && ['line', 'path'].indexOf(current_mode) >= 0) {
			canvas.setStrokeWidth(1);
			return;
		}
		cur_properties.stroke_width = val;

		var elems = [];
		function addNonG (e) {
			if (e.nodeName != 'g') {
				elems.push(e);
			}
		}
		var i = selectedElements.length;
		while (i--) {
			var elem = selectedElements[i];
			if (elem) {
				if (elem.tagName == 'g') {
					svgedit.utilities.walkTree(elem, addNonG);
				}
				else {
					elems.push(elem);
				}
			}
		}
		if (elems.length > 0) {
			changeSelectedAttribute('stroke-width', val, elems);
			call('changed', selectedElements);
		}
	};

// Function: setStrokeAttr
// Set the given stroke-related attribute the given value for selected elements
//
// Parameters:
// attr - String with the attribute name
// val - String or number with the attribute value
	this.setStrokeAttr = function(attr, val) {
		// cur_shape[attr.replace('-', '_')] = val;
		var elems = [];
		function addNonG (e) {
			if (e.nodeName != 'g') {
				elems.push(e);
			}
		}
		var i = selectedElements.length;
		while (i--) {
			var elem = selectedElements[i];
			if (elem) {
				if (elem.tagName == 'g') {
					svgedit.utilities.walkTree(elem, function(e){if (e.nodeName!='g') {elems.push(e);}});
				}
				else {
					elems.push(elem);
				}
			}
		}
		if (elems.length > 0) {
			changeSelectedAttribute(attr, val, elems);
			call('changed', selectedElements);
		}
	};

// Function: getStyle
// Returns current style options
	this.getStyle = function() {
		return cur_shape;
	};

// Function: getOpacity
// Returns the current opacity
	this.getOpacity = function() {
		return cur_shape.opacity;
	};

// Function: setOpacity
// Sets the given opacity to the current selected elements
	this.setOpacity = function(val) {
		cur_shape.opacity = val;
		changeSelectedAttribute('opacity', val);
	};

// Function: getOpacity
// Returns the current fill opacity
	this.getFillOpacity = function() {
		return cur_shape.fill_opacity;
	};

// Function: getStrokeOpacity
// Returns the current stroke opacity
	this.getStrokeOpacity = function() {
		return cur_shape.stroke_opacity;
	};

// Function: setPaintOpacity
// Sets the current fill/stroke opacity
//
// Parameters:
// type - String with "fill" or "stroke"
// val - Float with the new opacity value
// preventUndo - Boolean indicating whether or not this should be an undoable action
	this.setPaintOpacity = function(type, val, preventUndo , prevCmdNums) {
		// cur_shape[type + '_opacity'] = val;
		if (!preventUndo) {
			changeSelectedAttribute(type + '-opacity', val , prevCmdNums);
		}
		else {
			changeSelectedAttributeNoUndo(type + '-opacity', val);
		}

        if (svgCanvas.getMode() == 'pathedit' && svgedit.path.path.elem)
        {
            svgedit.path.path.elem.setAttribute(type + '-opacity', val);
        }
	};

// Function: getPaintOpacity
// Gets the current fill/stroke opacity
//
// Parameters:
// type - String with "fill" or "stroke"
	this.getPaintOpacity = function(type) {
		return type === 'fill' ? this.getFillOpacity() : this.getStrokeOpacity();
	};

// Function: getBlur
// Gets the stdDeviation blur value of the given element
//
// Parameters:
// elem - The element to check the blur value for
	this.getBlur = function(elem) {
		var val = 0;
//	var elem = selectedElements[0];

		if (elem) {
			var filter_url = elem.getAttribute('filter');
			if (filter_url) {
				var blur = svgedit.utilities.getElem(elem.id + '_blur');
				if (blur) {
					val = blur.firstChild.getAttribute('stdDeviation');
				}
			}
		}
		return val;
	};

	(function() {
		var cur_command = null;
		var filter = null;
		var filterHidden = false;

		// Function: setBlurNoUndo
		// Sets the stdDeviation blur value on the selected element without being undoable
		//
		// Parameters:
		// val - The new stdDeviation value
		canvas.setBlurNoUndo = function(val) {
			if (!filter) {
				canvas.setBlur(val);
				return;
			}
			if (val === 0) {
				// Don't change the StdDev, as that will hide the element.
				// Instead, just remove the value for "filter"
				changeSelectedAttributeNoUndo('filter', '');
				filterHidden = true;
			} else {
				var elem = selectedElements[0];
				if (filterHidden) {
					changeSelectedAttributeNoUndo('filter', 'url(#' + elem.id + '_blur)');
				}
				if (svgedit.browser.isWebkit()) {
					console.log('e', elem);
					elem.removeAttribute('filter');
					elem.setAttribute('filter', 'url(#' + elem.id + '_blur)');
				}
				changeSelectedAttributeNoUndo('stdDeviation', val, [filter.firstChild]);
				canvas.setBlurOffsets(filter, val);
			}
		};

		function finishChange() {
			var bCmd = canvas.undoMgr.finishUndoableChange();
			cur_command.addSubCommand(bCmd);
			addCommandToHistory(cur_command);
			cur_command = null;
			filter = null;
		}

		// Function: setBlurOffsets
		// Sets the x, y, with, height values of the filter element in order to
		// make the blur not be clipped. Removes them if not neeeded
		//
		// Parameters:
		// filter - The filter DOM element to update
		// stdDev - The standard deviation value on which to base the offset size
		canvas.setBlurOffsets = function(filter, stdDev) {
			if (stdDev > 3) {
				// TODO: Create algorithm here where size is based on expected blur
				svgedit.utilities.assignAttributes(filter, {
					x: '-50%',
					y: '-50%',
					width: '200%',
					height: '200%'
				}, 100);
			} else {
				// Removing these attributes hides text in Chrome (see Issue 579)
				if (!svgedit.browser.isWebkit()) {
					filter.removeAttribute('x');
					filter.removeAttribute('y');
					filter.removeAttribute('width');
					filter.removeAttribute('height');
				}
			}
		};

		// Function: setBlur
		// Adds/updates the blur filter to the selected element
		//
		// Parameters:
		// val - Float with the new stdDeviation blur value
		// complete - Boolean indicating whether or not the action should be completed (to add to the undo manager)
		canvas.setBlur = function(val, complete) {
			if (cur_command) {
				finishChange();
				return;
			}

			// Looks for associated blur, creates one if not found
			var elem = selectedElements[0];
			var elem_id = elem.id;
			filter = svgedit.utilities.getElem(elem_id + '_blur');

			val -= 0;

			var batchCmd = new svgedit.history.BatchCommand();

			// Blur found!
			if (filter) {
				if (val === 0) {
					filter = null;
				}
			} else {
				// Not found, so create
				var newblur = addSvgElementFromJson({ 'element': 'feGaussianBlur',
					'attr': {
						'in': 'SourceGraphic',
						'stdDeviation': val
					}
				});

				filter = addSvgElementFromJson({ 'element': 'filter',
					'attr': {
						'id': elem_id + '_blur'
					}
				});

				filter.appendChild(newblur);
				svgedit.utilities.findDefs().appendChild(filter);

				batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(filter));
			}

			var changes = {filter: elem.getAttribute('filter')};

			if (val === 0) {
				elem.removeAttribute('filter');
				batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, changes));
				return;
			}

			changeSelectedAttribute('filter', 'url(#' + elem_id + '_blur)');
			batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, changes));
			canvas.setBlurOffsets(filter, val);

			cur_command = batchCmd;
			canvas.undoMgr.beginUndoableChange('stdDeviation', [filter?filter.firstChild:null]);
			if (complete) {
				canvas.setBlurNoUndo(val);
				finishChange();
			}
		};
        canvas.setPatternAngle = function(val,type) {
            // ensure val is the proper type
            val = parseFloat(val);
            var elem = selectedElements[0];
            var fillAttr = elem.getAttribute('fill');
            if(fillAttr.indexOf('pattern')>0){
                var indexF = fillAttr.indexOf('#');
                var indexN = fillAttr.indexOf(')');
                var id = fillAttr.substring(indexF,indexN);
                var patternElem = $('#fillpattern').find(id).get(0);
                var bbox = svgedit.utilities.getBBox(elem);
                var center_x = bbox.x+bbox.width/2;
                var center_y = bbox.y+bbox.height/2;
                var attr = patternElem.getAttribute('patternTransform');
                if(attr == null){
                    if(type == 'rotate'){
                        patternElem.setAttribute('patternTransform','rotate(' + val + ',' + center_x + ',' + center_y + ')');
                    }else if(type == 'scale'){
                        patternElem.setAttribute('patternTransform','scale('+val+')');
                    }
                }else{
                    if(type == 'rotate'){
                        if(attr.indexOf('scale')!=-1) {
                            var scaleF = attr.indexOf('scale(');
                            var scaleN = attr.lastIndexOf(')');
                            var scale = attr.substring(scaleF+6,scaleN);
                            patternElem.setAttribute('patternTransform','rotate('+ val + ',' + center_x + ',' + center_y +') scale('+scale+')');
                        }else if(attr.indexOf('scale')==-1){
                            patternElem.setAttribute('patternTransform','rotate('+ val + ',' + center_x + ',' + center_y + ')');
                        }
                    }else if(type == 'scale'){
                        if(attr.indexOf('rotate')!=-1){
                            var rotateF = attr.indexOf('rotate(');
                            var rotateN = attr.indexOf(')');
                            var rotate = attr.substring(rotateF+7,rotateN);
                            patternElem.setAttribute('patternTransform','rotate('+rotate+') scale('+val+')');
                        }else if(attr.indexOf('rotate')==-1){
                            patternElem.setAttribute('patternTransform', 'scale(' + val +')');
                        }
                    }
                }
                var clonePatter = patternElem.cloneNode(true);
                patternElem.parentNode.appendChild(clonePatter);
                patternElem.parentNode.removeChild(patternElem);
            }
        };

    }());

// Function: getBold
// Check whether selected element is bold or not
//
// Returns:
// Boolean indicating whether or not element is bold
	this.getBold = function() {
		// should only have one element selected
		var selected = selectedElements[0];
		if (selected != null && selected.tagName == 'text' &&
			selectedElements[1] == null)
		{
			return (selected.getAttribute('font-weight') == 'bold');
		}
		return false;
	};

// Function: setBold
// Make the selected element bold or normal
//
// Parameters:
// b - Boolean indicating bold (true) or normal (false)
	this.setBold = function(b) {
		var selected = selectedElements[0];
		if (selected != null && selected.tagName == 'text' &&
			selectedElements[1] == null)
		{
			changeSelectedAttribute('font-weight', b ? 'bold' : 'normal');
		}
		if (!selectedElements[0].textContent) {
			textActions.setCursor();
		}
	};

// Function: getItalic
// Check whether selected element is italic or not
//
// Returns:
// Boolean indicating whether or not element is italic
	this.getItalic = function() {
		var selected = selectedElements[0];
		if (selected != null && selected.tagName == 'text' &&
			selectedElements[1] == null)
		{
			return (selected.getAttribute('font-style') == 'italic');
		}
		return false;
	};

// Function: setItalic
// Make the selected element italic or normal
//
// Parameters:
// b - Boolean indicating italic (true) or normal (false)
	this.setItalic = function(i) {
		var selected = selectedElements[0];
		if (selected != null && selected.tagName == 'text' &&
			selectedElements[1] == null)
		{
			changeSelectedAttribute('font-style', i ? 'italic' : 'normal');
		}
		if (!selectedElements[0].textContent) {
			textActions.setCursor();
		}
	};

// Function: getFontFamily
// Returns the current font family
	this.getFontFamily = function() {
		return cur_text.font_family;
	};

// Function: setFontFamily
// Set the new font family
//
// Parameters:
// val - String with the new font family
	this.setFontFamily = function(val) {
		cur_text.font_family = val;
		changeSelectedAttribute('font-family', val);
		if (selectedElements[0] && !selectedElements[0].textContent) {
			textActions.setCursor();
		}
	};


// Function: setFontColor
// Set the new font color
//
// Parameters:
// val - String with the new font color
	this.setFontColor = function(val) {
		cur_text.fill = val;
		changeSelectedAttribute('fill', val);
	};

// Function: getFontColor
// Returns the current font color
	this.getFontColor = function() {
		return cur_text.fill;
	};

// Function: getFontSize
// Returns the current font size
	this.getFontSize = function() {
		return cur_text.font_size;
	};

// Function: setFontSize
// Applies the given font size to the selected element
//
// Parameters:
// val - Float with the new font size
	this.setFontSize = function(val) {
		cur_text.font_size = val;
		changeSelectedAttribute('font-size', val);
		if (!selectedElements[0].textContent) {
			textActions.setCursor();
		}
	};

// Function: getText
// Returns the current text (textContent) of the selected element
	this.getText = function() {
		var selected = selectedElements[0];
		if (selected == null) { return ''; }
		return selected.textContent;
	};

// Function: setTextContent
// Updates the text element with the given string
//
// Parameters:
// val - String with the new text
	this.setTextContent = function(val) {
		changeSelectedAttribute('#text', val);
		textActions.init(val);
		textActions.setCursor();
	};

// Function: setImageURL
// Sets the new image URL for the selected image element. Updates its size if
// a new URL is given
//
// Parameters:
// val - String with the image URL/path
	this.setImageURL = function(val) {
		var elem = selectedElements[0];
		if (!elem) {return;}

		var attrs = $(elem).attr(['width', 'height']);
		var setsize = (!attrs.width || !attrs.height);

		var cur_href = getHref(elem);

		// Do nothing if no URL change or size change
		if (cur_href !== val) {
			setsize = true;
		} else if (!setsize) {return;}

		var batchCmd = new svgedit.history.BatchCommand('Change Image URL');

		setHref(elem, val);
		batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, {
			'#href': cur_href
		}));

		if (setsize) {
			$(new Image()).load(function() {
				var changes = $(elem).attr(['width', 'height']);

				$(elem).attr({
					width: this.width,
					height: this.height
				});

				selectorManager.requestSelector(elem).resize(5);

				batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, changes));
				addCommandToHistory(batchCmd);
				call('changed', [elem]);
			}).attr('src', val);
		} else {
			addCommandToHistory(batchCmd);
		}
	};

// Function: setLinkURL
// Sets the new link URL for the selected anchor element.
//
// Parameters:
// val - String with the link URL/path
	this.setLinkURL = function(val) {
		var elem = selectedElements[0];
		if (!elem) {return;}
		if (elem.tagName !== 'a') {
			// See if parent is an anchor
			var parents_a = $(elem).parents('a');
			if (parents_a.length) {
				elem = parents_a[0];
			} else {
				return;
			}
		}

		var cur_href = getHref(elem);

		if (cur_href === val) {return;}

		var batchCmd = new svgedit.history.BatchCommand('Change Link URL');

		setHref(elem, val);
		batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(elem, {
			'#href': cur_href
		}));

		addCommandToHistory(batchCmd);
	};


// Function: setRectRadius
// Sets the rx & ry values to the selected rect element to change its corner radius
//
// Parameters:
// val - The new radius
	this.setRectRadius = function(val) {
		var selected = selectedElements[0];
		if (selected != null && selected.tagName == 'rect') {
			var r = selected.getAttribute('rx');
			if (r != val) {
				selected.setAttribute('rx', val);
				selected.setAttribute('ry', val);
				addCommandToHistory(new svgedit.history.ChangeElementCommand(selected, {'rx':r, 'ry':r}, 'Radius'));
				call('changed', [selected]);
			}
		}
	};

// Function: makeHyperlink
// Wraps the selected element(s) in an anchor element or converts group to one
	this.makeHyperlink = function(url) {
		canvas.groupSelectedElements('a', url);

		// TODO: If element is a single "g", convert to "a"
		//	if (selectedElements.length > 1 && selectedElements[1]) {

	};

// Function: removeHyperlink
	this.removeHyperlink = function() {
		canvas.ungroupSelectedElement();
	};

// Group: Element manipulation

// Function: setSegType
// Sets the new segment type to the selected segment(s).
//
// Parameters:
// new_type - Integer with the new segment type
// See http://www.w3.org/TR/SVG/paths.html#InterfaceSVGPathSeg for list
	this.setSegType = function(new_type) {
		pathActions.setSegType(new_type);
	};

// TODO(codedread): Remove the getBBox argument and split this function into two.
// Function: convertToPath
// Convert selected element to a path, or get the BBox of an element-as-path
//
// Parameters:
// elem - The DOM element to be converted
// getBBox - Boolean on whether or not to only return the path's BBox
//
// Returns:
// If the getBBox flag is true, the resulting path's bounding box object.
// Otherwise the resulting path element is returned.
	this.convertToPath = function(elem, getBBox) {
		if (elem == null) {
			var elems = selectedElements;
			$.each(selectedElements, function(i, elem) {
				if (elem) {canvas.convertToPath(elem);}
			});
			return;
		}

		if (!getBBox) {
			var batchCmd = new svgedit.history.BatchCommand('Convert element to Path');
		}
        cur_shape.stroke_linecap  = canvas.isToMiter?"miter":cur_shape.stroke_linecap;
		var attrs = getBBox?{}:{
			'fill': cur_shape.fill,
			'fill-opacity': cur_shape.fill_opacity,
			'stroke': cur_shape.stroke,
			'stroke-width': cur_shape.stroke_width,
			'stroke-dasharray': cur_shape.stroke_dasharray,
			'stroke-linejoin': cur_shape.stroke_linejoin,
			'stroke-linecap': cur_shape.stroke_linecap,
			'stroke-opacity': cur_shape.stroke_opacity,
			'opacity': cur_shape.opacity,
			'visibility':'hidden'
		};

		// any attribute on the element not covered by the above
		// TODO: make this list global so that we can properly maintain it
		// TODO: what about @transform, @clip-rule, @fill-rule, etc?
		$.each(['marker-start', 'marker-end', 'marker-mid', 'filter', 'clip-path'], function() {
			if (elem.getAttribute(this)) {
				attrs[this] = elem.getAttribute(this);
			}
		});

		var path = addSvgElementFromJson({
			'element': 'path',
			'attr': attrs
		});

		var eltrans = elem.getAttribute('transform');
		if (eltrans) {
			path.setAttribute('transform', eltrans);
		}

		var id = elem.id;
		var parent = elem.parentNode;
		if (elem.nextSibling) {
			parent.insertBefore(path, elem);
		} else {
			parent.appendChild(path);
		}

		var d = '';

		var joinSegs = function(segs) {
			$.each(segs, function(j, seg) {
				var i;
				var l = seg[0], pts = seg[1];
				d += l;
				for (i = 0; i < pts.length; i+=2) {
					d += (pts[i] +','+pts[i+1]) + ' ';
				}
			});
		};

		// Possibly the cubed root of 6, but 1.81 works best
		var num = 1.81;
		var a, rx;
		switch (elem.tagName) {
			case 'ellipse':
			case 'circle':
				a = $(elem).attr(['rx', 'ry', 'cx', 'cy']);
				var cx = a.cx, cy = a.cy;
				rx = a.rx;
				ry = a.ry;
				if (elem.tagName == 'circle') {
					rx = ry = $(elem).attr('r');
				}

				joinSegs([
					['M',[(cx-rx),(cy)]],
					['C',[(cx-rx),(cy-ry/num), (cx-rx/num),(cy-ry), (cx),(cy-ry)]],
					['C',[(cx+rx/num),(cy-ry), (cx+rx),(cy-ry/num), (cx+rx),(cy)]],
					['C',[(cx+rx),(cy+ry/num), (cx+rx/num),(cy+ry), (cx),(cy+ry)]],
					['C',[(cx-rx/num),(cy+ry), (cx-rx),(cy+ry/num), (cx-rx),(cy)]],
					['Z',[]]
				]);
				break;
			case 'path':
				d = elem.getAttribute('d');
				break;
			case 'line':
				a = $(elem).attr(['x1', 'y1', 'x2', 'y2']);
				d = 'M'+a.x1+','+a.y1+'L'+a.x2+','+a.y2;
				break;
			case 'polyline':
			case 'polygon':
				d = 'M' + elem.getAttribute('points');
				break;
			case 'rect':
				var r = $(elem).attr(['rx', 'ry']);
				rx = r.rx == null ? 0 : r.rx;
				ry = r.ry == null ? 0 : r.ry;
				var b = elem.getBBox();
				var x = b.x, y = b.y, w = b.width, h = b.height;
				num = 4 - num; // Why? Because!
				
				console.log('============rx ry; ' + rx + ', ' + ry);
				if (false && !rx && !ry) {
					// Regular rect
					joinSegs([
						['M',[x, y]],
						['L',[x+w, y]],
						['L',[x+w, y+h]],
						['L',[x, y+h]],
						['L',[x, y]],
						['Z',[]]
					]);
				}
				else
				{
					/*
					joinSegs([
						['M',[x, y+ry]],
						['C',[x, y+ry/num, x+rx/num, y, x+rx, y]],
						['L',[x+w-rx, y]],
						['C',[x+w-rx/num, y, x+w, y+ry/num, x+w, y+ry]],
						['L',[x+w, y+h-ry]],
						['C',[x+w, y+h-ry/num, x+w-rx/num, y+h, x+w-rx, y+h]],
						['L',[x+rx, y+h]],
						['C',[x+rx/num, y+h, x, y+h-ry/num, x, y+h-ry]],
						['L',[x, y+ry]],
						['Z',[]]
					]);
					*/


                    joinSegs([
                        ['M',[x, y+ry]],
                        ['C',[x, y+ry/num, x+rx/num, y, x+rx, y]],
                        ['C',[x+rx, y, x+w-rx, y , x+w-rx, y]],
                        ['C',[x+w-rx/num, y, x+w, y+ry/num, x+w, y+ry]],
                        ['C',[x+w, y+ry , x+w, y+h-ry , x+w, y+h-ry]],
                        ['C',[x+w, y+h-ry/num, x+w-rx/num, y+h, x+w-rx, y+h]],
                        ['C',[x+w-rx, y+h , x+rx, y+h , x+rx, y+h]],
                        ['C',[x+rx/num, y+h, x, y+h-ry/num, x, y+h-ry]],
                        ['C',[x, y+h-ry , x, y+ry , x, y+ry]],
                        ['Z',[]]
                    ]);

                   /* joinSegs([
                        ['M',[x, y]],
                        ['C',[x, y , x+w, y , x+w, y]],
                        ['C',[x+w, y , x+w, y+h , x+w, y+h]],
                        ['C',[x+w, y+h , x, y+h , x, y+h]],
                        ['C',[x, y+h , x, y , x, y]],
                        ['Z',[]]
                    ]);*/
				}
				break;
			default:
				path.parentNode.removeChild(path);
				break;
		}

		if (d) {
			path.setAttribute('d', d);
		}

		if (!getBBox) {
			// Replace the current element with the converted one

			// Reorient if it has a matrix
			if (eltrans) {
				var tlist = svgedit.transformlist.getTransformList(path);
				if (svgedit.math.hasMatrixTransform(tlist)) {
					pathActions.resetOrientation(path);
				}
			}

			var nextSibling = elem.nextSibling;
			batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(elem, nextSibling, parent));
			batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(path));

			clearSelection();
			elem.parentNode.removeChild(elem);
			path.setAttribute('id', id);
			path.removeAttribute('visibility');
			addToSelection([path], true);

			addCommandToHistory(batchCmd);

		} else {
			// Get the correct BBox of the new path, then discard it
			pathActions.resetOrientation(path);
			var bb = false;
			try {
				bb = path.getBBox();
			} catch(e) {
				// Firefox fails
			}
			path.parentNode.removeChild(path);
			return bb;
		}
	};

    var changeSelectedStrokePattern = function(defsElem , elems, pId)
    {
        elems = elems || selectedElements;
        var i = elems.length;
        var no_xy_elems = ['g', 'polyline', 'path'];
        var good_g_attrs = ['transform', 'opacity', 'filter'];

        console.log("========================================changeSelectedStrokePattern");

        while (i--)
        {
            var elem = elems[i];
            if (elem == null) {continue;}

            // only allow the transform/opacity/filter attribute to change on <g> elements, slightly hacky
            // TODO: FIXME: This doesn't seem right. Where's the body of this if statement?
            if (elem.hasAttribute('stroke'))
            {
                elem.appendChild(defsElem);

                elem.setAttribute('marker-start' , pId == 2 || pId == 3 ? 'url(#stroke_marker_triangle_start)' : (pId == 4 || pId == 6 ? 'url(#stroke_marker_circle_start)' : ''));
                elem.setAttribute('marker-end' , pId == 1 || pId == 3 ? 'url(#stroke_marker_triangle_end)' : (pId == 5 || pId == 6 ? 'url(#stroke_marker_circle_end)' : ''));
            }
        } // for each elem
    }
	var changeSelectedFillPattern = function(defsElem , elems, pId , prevCmdNums)
	{
		elems = elems || selectedElements;

        canvas.undoMgr.beginUndoableChange('fill', elems);
		var i = elems.length;
		var no_xy_elems = ['g', 'polyline', 'path'];
		var good_g_attrs = ['transform', 'opacity', 'filter'];

		while (i--)
		{
			var elem = elems[i];
			if (elem == null) {continue;}
			
			// only allow the transform/opacity/filter attribute to change on <g> elements, slightly hacky
			// TODO: FIXME: This doesn't seem right. Where's the body of this if statement?
			if (elem.hasAttribute('fill'))
			{
			    if(isNaN(pId)){
			        elem.setAttribute('fill','none');
                }else{
                    var ele = $('#pattern_' +pId).get(0).cloneNode(true);
                    ele.id = 'pattern_'+pId+'_'+elem.id;
                    var ele2 = ele.cloneNode(true);
                    $('#pattern_' +pId).after(ele2);
                    elem.setAttribute('fill' , 'url(#pattern_'+pId+'_'+elem.id+')');
                    defsElem.appendChild(ele);
                    elem.appendChild(defsElem);
                }

            }
		} // for each elem

        var batchCmd = canvas.undoMgr.finishUndoableChange();
		batchCmd.prevCmdNums = prevCmdNums;
        if (!batchCmd.isEmpty()) {
            addCommandToHistory(batchCmd);
        }
	}
	
// Function: changeSelectedAttributeNoUndo
// This function makes the changes to the elements. It does not add the change
// to the history stack.
//
// Parameters:
// attr - String with the attribute name
// newValue - String or number with the new attribute value
// elems - The DOM elements to apply the change to
	var changeSelectedAttributeNoUndo = function(attr, newValue, elems) {
		if (current_mode == 'pathedit') {
			// Editing node
			pathActions.moveNode(attr, newValue);
		}
		elems = elems || selectedElements;
		var i = elems.length;
		var no_xy_elems = ['g', 'polyline', 'path'];
		var good_g_attrs = ['transform', 'opacity', 'filter'];

		while (i--) {
			var elem = elems[i];
			if (elem == null) {continue;}

			// Set x,y vals on elements that don't have them
			if ((attr === 'x' || attr === 'y') && no_xy_elems.indexOf(elem.tagName) >= 0) {
				var bbox = getStrokedBBox([elem]);
				var diff_x = attr === 'x' ? newValue - bbox.x : 0;
				var diff_y = attr === 'y' ? newValue - bbox.y : 0;
				canvas.moveSelectedElements(diff_x*current_zoom, diff_y*current_zoom, true);
				continue;
			}

			// only allow the transform/opacity/filter attribute to change on <g> elements, slightly hacky
			// TODO: FIXME: This doesn't seem right. Where's the body of this if statement?
			if (elem.tagName === 'g' && good_g_attrs.indexOf(attr) >= 0) {}
			var oldval = attr === '#text' ? elem.textContent : elem.getAttribute(attr);
			if (oldval == null) {oldval = '';}
			if (oldval !== String(newValue)) {
				if (attr == '#text') {
					var old_w = svgedit.utilities.getBBox(elem).width;
					elem.textContent = newValue;

					// FF bug occurs on on rotated elements
					if (/rotate/.test(elem.getAttribute('transform'))) {
						elem = ffClone(elem);
					}

					// Hoped to solve the issue of moving text with text-anchor="start",
					// but this doesn't actually fix it. Hopefully on the right track, though. -Fyrd

//					var box=getBBox(elem), left=box.x, top=box.y, width=box.width,
//						height=box.height, dx = width - old_w, dy=0;
//					var angle = svgedit.utilities.getRotationAngle(elem, true);
//					if (angle) {
//						var r = Math.sqrt( dx*dx + dy*dy );
//						var theta = Math.atan2(dy,dx) - angle;
//						dx = r * Math.cos(theta);
//						dy = r * Math.sin(theta);
//
//						elem.setAttribute('x', elem.getAttribute('x')-dx);
//						elem.setAttribute('y', elem.getAttribute('y')-dy);
//					}

				} else if (attr == '#href') {
					setHref(elem, newValue);
				}
				else {elem.setAttribute(attr, newValue);}

				// Go into "select" mode for text changes
				// NOTE: Important that this happens AFTER elem.setAttribute() or else attributes like
				// font-size can get reset to their old value, ultimately by svgEditor.updateContextPanel(),
				// after calling textActions.toSelectMode() below
				if (current_mode === 'textedit' && attr !== '#text' && elem.textContent.length) {
					textActions.toSelectMode(elem);
				}

//			if (i==0)
//				selectedBBoxes[0] = svgedit.utilities.getBBox(elem);
				// Use the Firefox ffClone hack for text elements with gradients or
				// where other text attributes are changed.
				if (svgedit.browser.isGecko() && elem.nodeName === 'text' && /rotate/.test(elem.getAttribute('transform'))) {
					if (String(newValue).indexOf('url') === 0 || (['font-size', 'font-family', 'x', 'y'].indexOf(attr) >= 0 && elem.textContent)) {
						elem = ffClone(elem);
					}
				}
				// Timeout needed for Opera & Firefox
				// codedread: it is now possible for this function to be called with elements
				// that are not in the selectedElements array, we need to only request a
				// selector if the element is in that array
				if (selectedElements.indexOf(elem) >= 0) {
					setTimeout(function() {
						// Due to element replacement, this element may no longer
						// be part of the DOM
						if (!elem || !elem.parentNode) {return;}
						selectorManager.requestSelector(elem).resize(6);
					}, 0);
				}
				// if this element was rotated, and we changed the position of this element
				// we need to update the rotational transform attribute
				var angle = svgedit.utilities.getRotationAngle(elem);
				if (angle != 0 && attr != 'transform') {
					var tlist = svgedit.transformlist.getTransformList(elem);
					var n = tlist.numberOfItems;
					while (n--) {
						var xform = tlist.getItem(n);
						if (xform.type == 4) {
							// remove old rotate
							tlist.removeItem(n);

							var box = svgedit.utilities.getBBox(elem);
							var center = svgedit.math.transformPoint(box.x+box.width/2, box.y+box.height/2, svgedit.math.transformListToTransform(tlist).matrix);
							var cx = center.x,
								cy = center.y;
							var newrot = svgroot.createSVGTransform();
							newrot.setRotate(angle, cx, cy);
							tlist.insertItemBefore(newrot, n);
							break;
						}
					}
				}
			} // if oldValue != newValue
		} // for each elem
	};

// Function: changeSelectedAttribute
// Change the given/selected element and add the original value to the history stack
// If you want to change all selectedElements, ignore the elems argument.
// If you want to change only a subset of selectedElements, then send the
// subset to this function in the elems argument.
//
// Parameters:
// attr - String with the attribute name
// newValue - String or number with the new attribute value
// elems - The DOM elements to apply the change to
	var changeSelectedAttribute = this.changeSelectedAttribute = function(attr, val, elems , prevCmdNums) {
		elems = elems || selectedElements;
		canvas.undoMgr.beginUndoableChange(attr, elems);
		var i = elems.length;

		changeSelectedAttributeNoUndo(attr, val, elems);

		var batchCmd = canvas.undoMgr.finishUndoableChange();
		batchCmd.prevCmdNums = prevCmdNums;
		if (!batchCmd.isEmpty()) {
			addCommandToHistory(batchCmd);
		}
	};

	this.isolateSelectedElements = function(isInverse)
	{
        for (var i = 0; i < selectedElements.length; ++i)
        {
            var selected = selectedElements[i];
            if (selected == null) {
                break;
            }

            var currentLayer = getCurrentDrawing().getCurrentLayer();

            // Cleanup old states
            if (currentLayer['isolatedFlag'] != undefined)
			{
				if (currentLayer['isolatedFlag'] != (isInverse ? 'true' : 'false'))
				{
                    this.unisolateElementes();
				}
			}

			// Prepare current selected object
            selected.setAttribute('isolated' , isInverse);

            // Prepare all other objects
            currentLayer['isolatedFlag'] = isInverse ? 'true' : 'false';
            if (currentLayer['isolated'] == undefined)
			{
                currentLayer['isolated'] = [];
			}

            currentLayer['isolated'].push(selected);
        }

        if (isInverse == false)
		{
            clearSelection();
		}
	}

	this.unisolateElementes = function()
	{
        var currentLayer = getCurrentDrawing().getCurrentLayer();
        if (currentLayer['isolated'] != undefined)
        {
            for (var i = 0 ; i < currentLayer['isolated'].length ; ++i)
			{
                currentLayer['isolated'][i].removeAttribute('isolated');
			}

            currentLayer['isolated'] = [];
        }

        currentLayer['isolatedFlag'] = undefined;
	}

// Function: deleteSelectedElements
// Removes all selected elements from the DOM and adds the change to the
// history stack
	this.deleteSelectedElements = function()
	{
		if (current_mode == 'pathedit')
		{
			pathActions.deletePathNode();
			return;
		}

		var i;
		var batchCmd = new svgedit.history.BatchCommand('Delete Elements');
		var len = selectedElements.length;
		var selectedCopy = []; //selectedElements is being deleted
		for (i = 0; i < len; ++i) {
			var selected = selectedElements[i];
			if (selected == null) {break;}

			var parent = selected.parentNode;
			var t = selected;

			// this will unselect the element and remove the selectedOutline
			selectorManager.releaseSelector(t);

			// Remove the path if present.
			svgedit.path.removePath_(t.id);

			// Get the parent if it's a single-child anchor
			if (parent != null && parent.tagName === 'a' && parent.childNodes.length === 1) {
				t = parent;
				parent = parent.parentNode;
			}

			var nextSibling = t.nextSibling;
			var elem = parent.removeChild(t);
			selectedCopy.push(selected); //for the copy
			selectedElements[i] = null;
			batchCmd.addSubCommand(new RemoveElementCommand(elem, nextSibling, parent));
		}
		if (!batchCmd.isEmpty()) {addCommandToHistory(batchCmd);}
		call('changed', selectedCopy);
		clearSelection();
	};
    this.deleteCloneElements = function(elem)
    {
        if (current_mode == 'pathedit')
        {
            pathActions.deletePathNode();
            return;
        }

        var i;
        var batchCmd = new svgedit.history.BatchCommand('Delete Elements');
        var len = selectedElements.length;
        var selectedCopy = []; //selectedElements is being deleted

            var selected = elem;
            if (selected == null) {return ;}

            var parent = selected.parentNode;
            var t = selected;

            // this will unselect the element and remove the selectedOutline
            selectorManager.releaseSelector(t);

            // Remove the path if present.
            svgedit.path.removePath_(t.id);

            // Get the parent if it's a single-child anchor
            if (parent != null && parent.tagName === 'a' && parent.childNodes.length === 1) {
                t = parent;
                parent = parent.parentNode;
            }

            var nextSibling = t.nextSibling;
            var elem = parent.removeChild(t);
            selectedCopy.push(selected); //for the copy
            selectedElements[i] = null;
            batchCmd.addSubCommand(new RemoveElementCommand(elem, nextSibling, parent));

        if (!batchCmd.isEmpty()) {addCommandToHistory(batchCmd);}
        call('changed', selectedCopy);
        clearSelection();
    };
// Function: cutSelectedElements
// Removes all selected elements from the DOM and adds the change to the
// history stack. Remembers removed elements on the clipboard

// TODO: Combine similar code with deleteSelectedElements
	this.cutSelectedElements = function() {
		var i;
        var batchCmd = new svgedit.history.BatchCommand('Cut Elements');
        var len = selectedElements.length;
        var selectedCopy = []; //selectedElements is being deleted
        for (i = 0; i < len; ++i) {
            var selected = selectedElements[i];
            if (selected == null) {break;}

            var parent = selected.parentNode;
            var t = selected;

            // this will unselect the element and remove the selectedOutline
            selectorManager.releaseSelector(t);

            // Remove the path if present.
            svgedit.path.removePath_(t.id);

            var nextSibling = t.nextSibling;
            var elem = parent.removeChild(t);
            selectedCopy.push(selected); //for the copy
            selectedElements[i] = null;
            batchCmd.addSubCommand(new RemoveElementCommand(elem, nextSibling, parent));
        }
        if (!batchCmd.isEmpty()) {addCommandToHistory(batchCmd);}
        call('changed', selectedCopy);
		clearSelection();

		canvas.clipBoard = selectedCopy;
	};

// Function: copySelectedElements
// Remembers the current selected elements on the clipboard
	this.copySelectedElements = function() {
		canvas.clipBoard = $.merge([], selectedElements);
	};
	this.pasteElements = function(type, x, y) {
		var cb = canvas.clipBoard ;
		var len = cb.length;
		if (!len) {return;}

		var pasted = [];
		var batchCmd = new svgedit.history.BatchCommand('Paste elements');

		// Move elements to lastClickPoint

		while (len--) {
			var elem = cb[len];
			if (!elem) {continue;}
			var copy = copyElem(elem);

			// See if elem with elem ID is in the DOM already
			if (!svgedit.utilities.getElem(elem.id)) {copy.id = elem.id;}

			pasted.push(copy);
			(current_group || getCurrentDrawing().getCurrentLayer()).appendChild(copy);
			batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(copy));
		}

		selectOnly(pasted);

		if (type !== 'in_place') {

			var ctr_x, ctr_y;
            var bbox = getStrokedBBox(pasted);
			if (!type) {
				ctr_x = lastClickPoint.x;
				ctr_y = lastClickPoint.y;
			} else if (type === 'point') {
				ctr_x = x;
				ctr_y = y;
			}else if(type=='round'){
                ctr_x =bbox.x+Math.random()*bbox.width;
                ctr_y =bbox.y+Math.random()*bbox.height;
            }

			var cx = ctr_x - (bbox.x + bbox.width/2),
				cy = ctr_y - (bbox.y + bbox.height/2),
				dx = [],
				dy = [];

			$.each(pasted, function(i, item) {
				dx.push(cx);
				dy.push(cy);
			});

			var cmd = canvas.moveSelectedElements(dx, dy, false);
			batchCmd.addSubCommand(cmd);
		}

		addCommandToHistory(batchCmd);
		call('changed', pasted);
	};

// Function: groupSelectedElements
// Wraps all the selected elements in a group (g) element

// Parameters:
// type - type of element to group into, defaults to <g>
	this.groupSelectedElements = function(type, urlArg) {
		if (!type) {type = 'g';}
		var cmd_str = '';

		switch (type) {
			case 'a':
				cmd_str = 'Make hyperlink';
				var url = '';
				if (arguments.length > 1) {
					url = urlArg;
				}
				break;
			default:
				type = 'g';
				cmd_str = 'Group Elements';
				break;
		}

		var batchCmd = new svgedit.history.BatchCommand(cmd_str);

		// create and insert the group element
		var g = addSvgElementFromJson({
			'element': type,
			'attr': {
				'id': getNextId(),
				'class':'group'
			}
		});
		if (type === 'a') {
			setHref(g, url);
		}
		batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(g));

		// now move all children into the group
		var i = selectedElements.length;
		while (i--) {
			var elem = selectedElements[i];
			if (elem == null) {continue;}

			if (elem.parentNode.tagName === 'a' && elem.parentNode.childNodes.length === 1) {
				elem = elem.parentNode;
			}

			var oldNextSibling = elem.nextSibling;
			var oldParent = elem.parentNode;
			g.appendChild(elem);
			batchCmd.addSubCommand(new svgedit.history.MoveElementCommand(elem, oldNextSibling, oldParent));
		}
		if (!batchCmd.isEmpty()) {addCommandToHistory(batchCmd);}

		// update selection
		selectOnly([g], true);
	};
    this.groupSelected = function(type, elems) {
        if (!type) {type = 'g';}
        var cmd_str = '';

        switch (type) {
            case 'a':
                cmd_str = 'Make hyperlink';
                var url = '';
               /* if (arguments.length > 1) {
                    url = urlArg;
                }*/
                break;
            default:
                type = 'g';
                cmd_str = 'Group Elements';
                break;
        }

        var batchCmd = new svgedit.history.BatchCommand(cmd_str);

        // create and insert the group element
        var g = addSvgElementFromJson({
            'element': type,
            'attr': {
                'id': getNextId(),
                'class':'group'
            }
        });
        if (type === 'a') {
            setHref(g, url);
        }
        batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(g));

        // now move all children into the group
        var i = elems.length;
        while (i--) {
            var elem = elems[i];
            if (elem == null) {continue;}

            if (elem.parentNode.tagName === 'a' && elem.parentNode.childNodes.length === 1) {
                elem = elem.parentNode;
            }

            var oldNextSibling = elem.nextSibling;
            var oldParent = elem.parentNode;
            g.appendChild(elem);
            batchCmd.addSubCommand(new svgedit.history.MoveElementCommand(elem, oldNextSibling, oldParent));
        }
        if (!batchCmd.isEmpty()) {addCommandToHistory(batchCmd);}

        // update selection
/*
        selectOnly([g], true);
*/
    };



// Function: pushGroupProperties
// Pushes all appropriate parent group properties down to its children, then
// removes them from the group
	var pushGroupProperties = this.pushGroupProperties = function(g, undoable) {

		var children = g.childNodes;
		var len = children.length;
		var xform = g.getAttribute('transform');

		var glist = svgedit.transformlist.getTransformList(g);
		var m = svgedit.math.transformListToTransform(glist).matrix;

		var batchCmd = new svgedit.history.BatchCommand('Push group properties');

		// TODO: get all fill/stroke properties from the group that we are about to destroy
		// "fill", "fill-opacity", "fill-rule", "stroke", "stroke-dasharray", "stroke-dashoffset",
		// "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity",
		// "stroke-width"
		// and then for each child, if they do not have the attribute (or the value is 'inherit')
		// then set the child's attribute

		var i = 0;
		var gangle = svgedit.utilities.getRotationAngle(g);

		var gattrs = $(g).attr(['filter', 'opacity']);
		var gfilter, gblur, changes;

		for (i = 0; i < len; i++) {
			var elem = children[i];

			if (elem.nodeType !== 1) {continue;}

			if (gattrs.opacity !== null && gattrs.opacity !== 1) {
				var c_opac = elem.getAttribute('opacity') || 1;
				var new_opac = Math.round((elem.getAttribute('opacity') || 1) * gattrs.opacity * 100)/100;
				changeSelectedAttribute('opacity', new_opac, [elem]);
			}

			if (gattrs.filter) {
				var cblur = this.getBlur(elem);
				var orig_cblur = cblur;
				if (!gblur) {gblur = this.getBlur(g);}
				if (cblur) {
					// Is this formula correct?
					cblur = Number(gblur) + Number(cblur);
				} else if (cblur === 0) {
					cblur = gblur;
				}

				// If child has no current filter, get group's filter or clone it.
				if (!orig_cblur) {
					// Set group's filter to use first child's ID
					if (!gfilter) {
						gfilter = svgedit.utilities.getRefElem(gattrs.filter);
					} else {
						// Clone the group's filter
						gfilter = copyElem(gfilter);
						svgedit.utilities.findDefs().appendChild(gfilter);
					}
				} else {
					gfilter = svgedit.utilities.getRefElem(elem.getAttribute('filter'));
				}

				// Change this in future for different filters
				var suffix = (gfilter.firstChild.tagName === 'feGaussianBlur')?'blur':'filter';
				gfilter.id = elem.id + '_' + suffix;
				changeSelectedAttribute('filter', 'url(#' + gfilter.id + ')', [elem]);

				// Update blur value
				if (cblur) {
					changeSelectedAttribute('stdDeviation', cblur, [gfilter.firstChild]);
					canvas.setBlurOffsets(gfilter, cblur);
				}
			}

			var chtlist = svgedit.transformlist.getTransformList(elem);

			// Don't process gradient transforms
			if (~elem.tagName.indexOf('Gradient')) {chtlist = null;}

			// Hopefully not a problem to add this. Necessary for elements like <desc/>
			if (!chtlist) {continue;}

			// Apparently <defs> can get get a transformlist, but we don't want it to have one!
			if (elem.tagName === 'defs') {continue;}

			if (glist.numberOfItems) {
				// TODO: if the group's transform is just a rotate, we can always transfer the
				// rotate() down to the children (collapsing consecutive rotates and factoring
				// out any translates)
				if (gangle && glist.numberOfItems == 1) {
					// [Rg] [Rc] [Mc]
					// we want [Tr] [Rc2] [Mc] where:
					//	- [Rc2] is at the child's current center but has the
					// sum of the group and child's rotation angles
					//	- [Tr] is the equivalent translation that this child
					// undergoes if the group wasn't there

					// [Tr] = [Rg] [Rc] [Rc2_inv]

					// get group's rotation matrix (Rg)
					var rgm = glist.getItem(0).matrix;

					// get child's rotation matrix (Rc)
					var rcm = svgroot.createSVGMatrix();
					var cangle = svgedit.utilities.getRotationAngle(elem);
					if (cangle) {
						rcm = chtlist.getItem(0).matrix;
					}

					// get child's old center of rotation
					var cbox = svgedit.utilities.getBBox(elem);
					var ceqm = svgedit.math.transformListToTransform(chtlist).matrix;
					var coldc = svgedit.math.transformPoint(cbox.x+cbox.width/2, cbox.y+cbox.height/2, ceqm);

					// sum group and child's angles
					var sangle = gangle + cangle;

					// get child's rotation at the old center (Rc2_inv)
					var r2 = svgroot.createSVGTransform();
					r2.setRotate(sangle, coldc.x, coldc.y);

					// calculate equivalent translate
					var trm = svgedit.math.matrixMultiply(rgm, rcm, r2.matrix.inverse());

					// set up tlist
					if (cangle) {
						chtlist.removeItem(0);
					}

					if (sangle) {
						if (chtlist.numberOfItems) {
							chtlist.insertItemBefore(r2, 0);
						} else {
							chtlist.appendItem(r2);
						}
					}

					if (trm.e || trm.f) {
						var tr = svgroot.createSVGTransform();
						tr.setTranslate(trm.e, trm.f);
						if (chtlist.numberOfItems) {
							chtlist.insertItemBefore(tr, 0);
						} else {
							chtlist.appendItem(tr);
						}
					}
				} else { // more complicated than just a rotate

					// transfer the group's transform down to each child and then
					// call svgedit.recalculate.recalculateDimensions()
					var oldxform = elem.getAttribute('transform');
					changes = {};
					changes.transform = oldxform || '';

					var newxform = svgroot.createSVGTransform();

					// [ gm ] [ chm ] = [ chm ] [ gm' ]
					// [ gm' ] = [ chm_inv ] [ gm ] [ chm ]
					var chm = svgedit.math.transformListToTransform(chtlist).matrix,
						chm_inv = chm.inverse();
					var gm = svgedit.math.matrixMultiply( chm_inv, m, chm );
					newxform.setMatrix(gm);
					chtlist.appendItem(newxform);
				}
				var cmd = svgedit.recalculate.recalculateDimensions(elem);
				if (cmd) {batchCmd.addSubCommand(cmd);}
			}
		}


		// remove transform and make it undo-able
		if (xform) {
			changes = {};
			changes.transform = xform;
			g.setAttribute('transform', '');
			g.removeAttribute('transform');
			batchCmd.addSubCommand(new svgedit.history.ChangeElementCommand(g, changes));
		}

		if (undoable && !batchCmd.isEmpty()) {
			return batchCmd;
		}
	};

	this.groupPathElements = function()
	{
		pathActions.groupPathElements();
	};

// Function: ungroupSelectedElement
// Unwraps all the elements in a selected group (g) element. This requires
// significant recalculations to apply group's transforms, etc to its children
	this.ungroupSelectedElement = function() {
		var g = selectedElements[0];
		if (!g) {
			return;
		}
		if ($(g).data('gsvg') || $(g).data('symbol')) {
			// Is svg, so actually convert to group
			convertToGroup(g);
			return;
		}
		if (g.tagName === 'use') {
			// Somehow doesn't have data set, so retrieve
			var symbol = svgedit.utilities.getElem(getHref(g).substr(1));
			$(g).data('symbol', symbol).data('ref', symbol);
			convertToGroup(g);
			return;
		}
		var parents_a = $(g).parents('a');
		if (parents_a.length) {
			g = parents_a[0];
		}

		// Look for parent "a"
		if (g.tagName === 'g' || g.tagName === 'a') {

			var batchCmd = new svgedit.history.BatchCommand('Ungroup Elements');
			var cmd = pushGroupProperties(g, true);
			if (cmd) {batchCmd.addSubCommand(cmd);}

			var parent = g.parentNode;
			var anchor = g.nextSibling;
			var children = new Array(g.childNodes.length);

			var i = 0;

			while (g.firstChild) {
				var elem = g.firstChild;
				var oldNextSibling = elem.nextSibling;
				var oldParent = elem.parentNode;

				// Remove child title elements
				if (elem.tagName === 'title') {
					var nextSibling = elem.nextSibling;
					batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(elem, nextSibling, oldParent));
					oldParent.removeChild(elem);
					continue;
				}

				children[i++] = elem = parent.insertBefore(elem, anchor);
				batchCmd.addSubCommand(new svgedit.history.MoveElementCommand(elem, oldNextSibling, oldParent));
			}

			// remove the group from the selection
			clearSelection();

			// delete the group element (but make undo-able)
			var gNextSibling = g.nextSibling;
			g = parent.removeChild(g);
			batchCmd.addSubCommand(new svgedit.history.RemoveElementCommand(g, gNextSibling, parent));

			if (!batchCmd.isEmpty()) {addCommandToHistory(batchCmd);}

			// update selection
			addToSelection(children);
		}
	};

// Function: moveToTopSelectedElement
// Repositions the selected element to the bottom in the DOM to appear on top of
// other elements
	this.moveToTopSelectedElement = function() {
		var selected = selectedElements[0];
		if (selected != null) {
			var t = selected;
			var oldParent = t.parentNode;
			var oldNextSibling = t.nextSibling;
			t = t.parentNode.appendChild(t);
			// If the element actually moved position, add the command and fire the changed
			// event handler.
			if (oldNextSibling != t.nextSibling) {
				addCommandToHistory(new svgedit.history.MoveElementCommand(t, oldNextSibling, oldParent, 'top'));
				call('changed', [t]);
			}
		}
	};

// Function: moveToBottomSelectedElement
// Repositions the selected element to the top in the DOM to appear under
// other elements
	this.moveToBottomSelectedElement = function() {
		var selected = selectedElements[0];
		if (selected != null) {
			var t = selected;
			var oldParent = t.parentNode;
			var oldNextSibling = t.nextSibling;
			var firstChild = t.parentNode.firstChild;
			if (firstChild.tagName == 'title') {
				firstChild = firstChild.nextSibling;
			}
			// This can probably be removed, as the defs should not ever apppear
			// inside a layer group
			if (firstChild.tagName == 'defs') {
				firstChild = firstChild.nextSibling;
			}
			t = t.parentNode.insertBefore(t, firstChild);
			// If the element actually moved position, add the command and fire the changed
			// event handler.
			if (oldNextSibling != t.nextSibling) {
				addCommandToHistory(new svgedit.history.MoveElementCommand(t, oldNextSibling, oldParent, 'bottom'));
				call('changed', [t]);
			}
		}
	};

// Function: moveUpDownSelected
// Moves the select element up or down the stack, based on the visibly
// intersecting elements
//
// Parameters:
// dir - String that's either 'Up' or 'Down'

	this.moveUpDownSelected = function(dir)
	{
        function insertAfter(parentNode , newNode, referenceNode)
		{
            return parentNode.insertBefore(newNode, referenceNode.nextSibling);
        }

        function insertBefore(parentNode , newNode , referenceNode)
		{
           return parentNode.insertBefore(newNode, referenceNode);
		}

        var selected = selectedElements[0];
        if (selected != null) {
            var t = selected;
            var oldParent = t.parentNode;

            if (dir == 'Up')
			{
				var oldNextSibling = t.nextSibling;
				var nextSibling = t.nextSibling;

				if (nextSibling != null)
				{
                    if (nextSibling.tagName == 'title')
                    {
                        nextSibling = nextSibling.nextSibling;
                    }

                    insertAfter(t.parentNode , t , nextSibling);
				}

                // If the element actually moved position, add the command and fire the changed
                // event handler.
                if (oldNextSibling != t.nextSibling)
                {
                    addCommandToHistory(new svgedit.history.MoveElementCommand(t, oldNextSibling, oldParent, 'bottom'));
                    call('changed', [t]);
                }
			}
			else
			{
                var oldPrevSibling = t.previousSibling;
                var prevSibling = t.previousSibling;

                if (prevSibling != null)
				{
                    if (prevSibling.tagName == 'title')
                    {
                        prevSibling = prevSibling.previousSibling;
                    }

                    insertBefore(t.parentNode , t , prevSibling);
				}

                // If the element actually moved position, add the command and fire the changed
                // event handler.
                if (oldPrevSibling != t.previousSibling)
                {
                    addCommandToHistory(new svgedit.history.MoveElementCommand(t, oldPrevSibling, oldParent, 'up'));
                    call('changed', [t]);
                }
			}
        }
	};

// Function: moveSelectedElements
// Moves selected elements on the X/Y axis
//
// Parameters:
// dx - Float with the distance to move on the x-axis
// dy - Float with the distance to move on the y-axis
// undoable - Boolean indicating whether or not the action should be undoable
//
// Returns:
// Batch command for the move
	this.moveSelectedElements = function(dx, dy, undoable) {
		// if undoable is not sent, default to true
		// if single values, scale them to the zoom
		if (dx.constructor != Array) {
			dx /= current_zoom;
			dy /= current_zoom;
		}
		undoable = undoable || true;
		var batchCmd = new svgedit.history.BatchCommand('position');
		var i = selectedElements.length;
		while (i--) {
			var selected = selectedElements[i];
			if (selected != null) {
//			if (i==0)
//				selectedBBoxes[0] = svgedit.utilities.getBBox(selected);

//			var b = {};
//			for (var j in selectedBBoxes[i]) b[j] = selectedBBoxes[i][j];
//			selectedBBoxes[i] = b;

				var xform = svgroot.createSVGTransform();
				var tlist = svgedit.transformlist.getTransformList(selected);
				// dx and dy could be arrays
				if (dx.constructor == Array) {
//				if (i==0) {
//					selectedBBoxes[0].x += dx[0];
//					selectedBBoxes[0].y += dy[0];
//				}
					xform.setTranslate(dx[i], dy[i]);
				} else {
//				if (i==0) {
//					selectedBBoxes[0].x += dx;
//					selectedBBoxes[0].y += dy;
//				}
					xform.setTranslate(dx, dy);
				}

				if (tlist.numberOfItems) {
					tlist.insertItemBefore(xform, 0);
				} else {
					tlist.appendItem(xform);
				}

				var cmd = svgedit.recalculate.recalculateDimensions(selected);
				if (cmd) {
					batchCmd.addSubCommand(cmd);
				}

				selectorManager.requestSelector(selected).resize(7);
			}
		}
		if (!batchCmd.isEmpty()) {
			if (undoable) {
				addCommandToHistory(batchCmd);
			}
			call('changed', selectedElements);
			return batchCmd;
		}
	};
    this.moveOneElements = function(dx, dy,elem) {
        if (dx.constructor != Array) {
            dx /= current_zoom;
            dy /= current_zoom;
        }
        var batchCmd = new svgedit.history.BatchCommand('position');
            var selected = elem;
            if (selected != null) {


                var xform = svgroot.createSVGTransform();
                var tlist = svgedit.transformlist.getTransformList(selected);
                // dx and dy could be arrays
                if (dx.constructor == Array) {
                    xform.setTranslate(dx[i], dy[i]);
                } else {
                    xform.setTranslate(dx, dy);
                }

                if (tlist.numberOfItems) {
                    tlist.insertItemBefore(xform, 0);
                } else {
                    tlist.appendItem(xform);
                }

                var cmd = svgedit.recalculate.recalculateDimensions(selected);
                if (cmd) {
                    batchCmd.addSubCommand(cmd);
                }

                selectorManager.requestSelector(selected).resize(7);
        }

    };
// Function: cloneSelectedElements
// Create deep DOM copies (clones) of all selected elements and move them slightly
// from their originals
    var cloneSelectedElements = this.cloneSelectedElements = function(x, y,isOne) {
		var i, elem;
		var batchCmd = new svgedit.history.BatchCommand('Clone Elements');
		// find all the elements selected (stop at first null)
		var len = isOne ?  1 : selectedElements.length;
		function sortfunction(a, b){
			return ($(b).index() - $(a).index()); //causes an array to be sorted numerically and ascending
		}
		selectedElements.sort(sortfunction);
		for (i = 0; i < len; ++i) {
			elem = selectedElements[i];
			if (elem == null) {break;}
		}
		// use slice to quickly get the subset of elements we need
		var copiedElements = selectedElements.slice(0, i);
		this.clearSelection(true);
		// note that we loop in the reverse way because of the way elements are added
		// to the selectedElements array (top-first)
		i = copiedElements.length;
		while (i--) {
			// clone each element and replace it within copiedElements
			elem = copiedElements[i] = copyElem(copiedElements[i]);
			(current_group || getCurrentDrawing().getCurrentLayer()).appendChild(elem);
			batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(elem));
		}

		if (!batchCmd.isEmpty()) {
			addToSelection(copiedElements.reverse()); // Need to reverse for correct selection-adding
			this.moveSelectedElements(x, y, false);
			addCommandToHistory(batchCmd);
		}
		return elem;
	};
    var cloneElements = this.cloneElements = function(x, y,elems) {
        var i, elem;
        var batchCmd = new svgedit.history.BatchCommand('Clone Elements');
        // find all the elements selected (stop at first null)
        var len = elems.length;
        function sortfunction(a, b){
            return ($(b).index() - $(a).index()); //causes an array to be sorted numerically and ascending
        }
        elems.sort(sortfunction);
        for (i = 0; i < len; ++i) {
            elem = elems[i];
            if (elem == null) {break;}
        }
        // use slice to quickly get the subset of elements we need
        var copiedElements = elems.slice(0, i);
        this.clearSelection(true);
        // note that we loop in the reverse way because of the way elements are added
        // to the selectedElements array (top-first)
        i = copiedElements.length;
        while (i--) {
            // clone each element and replace it within copiedElements
            elem = copiedElements[i] = copyElem(copiedElements[i]);
            (current_group || getCurrentDrawing().getCurrentLayer()).appendChild(elem);
            batchCmd.addSubCommand(new svgedit.history.InsertElementCommand(elem));
        }

        if (!batchCmd.isEmpty()) {
            addToSelection(copiedElements.reverse()); // Need to reverse for correct selection-adding
            this.moveSelectedElements(x, y, false);
            addCommandToHistory(batchCmd);
        }
        return elem;
    };

// Function: alignSelectedElements
// Aligns selected elements
//
// Parameters:
// type - String with single character indicating the alignment type
// relative_to - String that must be one of the following:
// "selected", "largest", "smallest", "page"
	this.alignSelectedElements = function(type, relative_to) {
		var i, elem;
		var bboxes = [], angles = [];
		var minx = Number.MAX_VALUE, maxx = Number.MIN_VALUE, miny = Number.MAX_VALUE, maxy = Number.MIN_VALUE;
		var curwidth = Number.MIN_VALUE, curheight = Number.MIN_VALUE;
		var len = selectedElements.length;
		if (!len) {return;}

		if (type == 'h' || type == 'v' || len > 1)
		{
			var conter = 0;
            for (i = 0; i < len; ++i)
            {
                if (selectedElements[i] == null) {break;}

                conter++;

                elem = selectedElements[i];
                bboxes[i] = getStrokedBBox([elem]);

                if (minx > bboxes[i].x)
				{
                    minx = bboxes[i].x;
				}
                if (maxx < bboxes[i].x)
                {
                    maxx = bboxes[i].x;
                }

                if (miny > bboxes[i].y)
                {
                    miny = bboxes[i].y;
                }
                if (maxy < bboxes[i].y)
                {
                    maxy = bboxes[i].y;
                }
            } // loop for each element to find the bbox and adjust min/max

            var dx = new Array(len);
            var dy = new Array(len);

            function sortPosH(a , b)
			{
                var boxa = getStrokedBBox([a]);
                var boxb = getStrokedBBox([b]);

                return boxa.x - boxb.x;
			}

            function sortPosV(a , b)
            {
                var boxa = getStrokedBBox([a]);
                var boxb = getStrokedBBox([b]);

                return boxa.y - boxb.y;
            }

            if (type == 'h')
			{
                selectedElements.sort(sortPosH);
			}
            else
			{
                selectedElements.sort(sortPosV);
			}

            var stepX = (maxx - minx) / (conter - 1);
            var stepY = (maxy - miny) / (conter - 1);

			console.log('min: ' + minx + ', max: ' + maxx + ',' + stepX + ' ' + conter);
            for (i = 0; i < len; ++i)
            {
                if (selectedElements[i] == null) {break;}
                elem = selectedElements[i];
                var bbox =getStrokedBBox([elem]);
                dx[i] = 0;
                dy[i] = 0;
                switch (type)
				{
                    case 'h':
                        dx[i] = minx + stepX * i - bbox.x;
                        break;

                    case 'v':
                        dy[i] = miny + stepY * i - bbox.y;
                        break;
                }
            }
            this.moveSelectedElements(dx, dy);

			// return;
		}


		for (i = 0; i < len; ++i) {
			if (selectedElements[i] == null) {break;}
			elem = selectedElements[i];
			bboxes[i] = getStrokedBBox([elem]);

			// now bbox is axis-aligned and handles rotation
			switch (relative_to) {
				case 'smallest':
					if ( (type == 'l' || type == 'c' || type == 'r' || type=='h') && (curwidth == Number.MIN_VALUE || curwidth > bboxes[i].width) ||
						(type == 't' || type == 'm' || type == 'b' || type=='v') && (curheight == Number.MIN_VALUE || curheight > bboxes[i].height) ) {
						minx = bboxes[i].x;
						miny = bboxes[i].y;
						maxx = bboxes[i].x + bboxes[i].width;
						maxy = bboxes[i].y + bboxes[i].height;
						curwidth = bboxes[i].width;
						curheight = bboxes[i].height;
					}
					break;
				case 'largest':
					if ( (type == 'l' || type == 'c' || type == 'r' || type=='h') && (curwidth == Number.MIN_VALUE || curwidth < bboxes[i].width) ||
						(type == 't' || type == 'm' || type == 'b' || type=='v') && (curheight == Number.MIN_VALUE || curheight < bboxes[i].height) ) {
						minx = bboxes[i].x;
						miny = bboxes[i].y;
						maxx = bboxes[i].x + bboxes[i].width;
						maxy = bboxes[i].y + bboxes[i].height;
						curwidth = bboxes[i].width;
						curheight = bboxes[i].height;
					}
					break;
				default: // 'selected'
					if (bboxes[i].x < minx) {minx = bboxes[i].x;}
					if (bboxes[i].y < miny) {miny = bboxes[i].y;}
					if (bboxes[i].x + bboxes[i].width > maxx) {maxx = bboxes[i].x + bboxes[i].width;}
					if (bboxes[i].y + bboxes[i].height > maxy) {maxy = bboxes[i].y + bboxes[i].height;}
					break;
			}
		} // loop for each element to find the bbox and adjust min/max

		if (relative_to == 'page') {
			minx = 0;
			miny = 0;
			maxx = canvas.contentW;
			maxy = canvas.contentH;
		}

		var dx = new Array(len);
		var dy = new Array(len);
		for (i = 0; i < len; ++i) {
			if (selectedElements[i] == null) {break;}
			elem = selectedElements[i];
			var bbox = bboxes[i];
			dx[i] = 0;
			dy[i] = 0;
			switch (type) {
				case 'l': // left (horizontal)
					dx[i] = minx - bbox.x;
					break;
				case 'c': // center (horizontal)
					dx[i] = (minx+maxx)/2 - (bbox.x + bbox.width/2);
					break;
				case 'r': // right (horizontal)
					dx[i] = maxx - (bbox.x + bbox.width);
					break;
				case 't': // top (vertical)
					dy[i] = miny - bbox.y;
					break;
				case 'm': // middle (vertical)
					dy[i] = (miny+maxy)/2 - (bbox.y + bbox.height/2);
					break;
				case 'b': // bottom (vertical)
					dy[i] = maxy - (bbox.y + bbox.height);
					break;
			}
		}
		this.moveSelectedElements(dx, dy);
	};

// Group: Additional editor tools

	this.contentW = getResolution().w;
	this.contentH = getResolution().h;

	this.layerColorPalette = [
		'#FF4FFF' ,
		'#4F4FFF' ,
		'#4FFF4F' ,
		'#FF4F4F' ,
		'#4F80FF'
	];
	this.layerColorIndex = 0;

	this.fetchLayerColor = function()
	{
		var cc = this.layerColorPalette[this.layerColorIndex];
		this.layerColorIndex = (this.layerColorIndex + 1) % this.layerColorPalette.length;
		return cc;
	}

// Function: updateCanvas
// Updates the editor canvas width/height/position after a zoom has occurred
//
// Parameters:
// w - Float with the new width
// h - Float with the new height
//
// Returns:
// Object with the following values:
// * x - The canvas' new x coordinate
// * y - The canvas' new y coordinate
// * old_x - The canvas' old x coordinate
// * old_y - The canvas' old y coordinate
// * d_x - The x position difference
// * d_y - The y position difference

	this.insertElemmentObj = function (objnum,num)
	{
        var validCounter = 0;
        for (i = 0; i < selectedElements.length; ++i) {
            if (selectedElements[i] != null)
            {
                validCounter++;
            }
        }
        if(validCounter == 2){
            var elems = selectedElements;
            var objData = [];
            for(var i = 0;i < elems.length;i++){

                if (elems[i] != null)
                {
                    var bbox = svgedit.utilities.getBBox(elems[i]);
                    objData.push({
                        x:bbox.x,
                        y:bbox.y,
                        width:bbox.width,
                        height:bbox.height,
                    })
                }
            }
            var elem1 = $(elems[0])[0],elem2 = $(elems[1])[0];
            var maxNum = 100000
            if(parseInt(objData[0].width*maxNum)/maxNum!=parseInt(objData[1].width*maxNum)/maxNum
                ||parseInt(objData[0].height*maxNum)/maxNum != parseInt(objData[0].height*maxNum)/maxNum
                || elem1.nodeName !=elem2.nodeName){
                return ;
            }
            var dx =(objData[1].x - objData[0].x);
            var dy =(objData[1].y - objData[0].y);
			var num = objnum;
            var disY = dy / (parseInt(num) + 1);
            var disX = dx / (parseInt(num) + 1);
            var isOne = true;
            for(var i = 0;i < num ;i++)
            {
                canvas.cloneSelectedElements(disX,disY,isOne);
            }
        }
    }
    paper.install(window);
    this.splitNodeRecursively = function(type)
    {
		if(selectedElements!=null){
			var len = 0;
            var isClosed = false;
			for(var i=0;i<selectedElements.length;i++){
				if(selectedElements[i]!=null){
				    if(selectedElements[i].tagName=="rect");
                    len++;
                    var elemStr = selectedElements[i].getAttribute("d").toLowerCase();
                    if(elemStr.indexOf("z")==-1){
                        isClosed = true;
                    }
				}
			}
            function sortfunction(a, b){
                return ($(a).index() - $(b).index()); //causes an array to be sorted numerically and ascending
            }
            // if(type!="subtract"){
                selectedElements.sort(sortfunction);
            // }
			if(len==2){
                paper.setup();
                var elemA = selectedElements[0];
                var elemB = selectedElements[1];
                var pathA = paper.project.importSVG(selectedElements[0]);
                var pathB = paper.project.importSVG(selectedElements[1]);
                var pathAisClosed = elemA.getAttribute("d").toLowerCase().indexOf("z")==-1;
                var pathBisClosed = elemB.getAttribute("d").toLowerCase().indexOf("z")==-1;
                var elem = canvas.cloneElements(0,0,[elemA]);
                var boolPathU,toElem,elemChild,
					elemId = elemA.id,
					elemString = elemA.getAttribute("d");
                if(type == "unite"){
                    if(!isClosed){
                        boolPathU = pathA.unite(pathB);
                        toElem = paper.project.exportSVG(boolPathU);
                        elemChild = $(toElem).find("#"+elemId);
                        for(var i = 0;i<elemChild.length;i++){
                            if(elemChild[i].getAttribute("d")!=elemString){
                                elem.setAttribute("d",elemChild[i].getAttribute("d"));
                            }
                        }
                    }else{
						if(pathBisClosed == true&&pathAisClosed == true){
                            elem.setAttribute("d",elemB.getAttribute("d")+elemA.getAttribute("d"));
                        }else{
                            if(pathAisClosed == true &&pathBisClosed == false){
                                boolPathU = pathA.divide(pathB);
                            }else if(pathAisClosed == false&&pathBisClosed ==true){
                                boolPathU = pathB.divide(pathA);
                            }
                            toElem = paper.project.exportSVG(boolPathU);
                            elemChild = toElem.childNodes[0].childNodes[2].childNodes[0].childNodes;
                            var  addD = pathAisClosed?elemB.getAttribute("d"):elemA.getAttribute("d");
                            for(var i = 0;i<elemChild.length;i++){
								addD += elemChild[i].getAttribute("d");
							}
                            elem.setAttribute("d",addD);
						}
					}
                    canvas.deleteCloneElements(elemA);
                    canvas.deleteCloneElements(elemB);
                }
                if(type == "intersect"){
                    if(!isClosed){
                        boolPathU = pathA.intersect(pathB);
                        toElem = paper.project.exportSVG(boolPathU);
                        elemChild = $(toElem).find("#"+elemId);
                        for(var i = 0;i<elemChild.length;i++){
                            if(elemChild[i].getAttribute("d")!=elemString){
                                elem.setAttribute("d",elemChild[i].getAttribute("d"));
                            }
                        }
                    }else{
                        if(pathBisClosed == true&&pathAisClosed == true){
                        	return;
                        }else{
                            if(pathAisClosed == true &&pathBisClosed == false){
                                boolPathU = pathA.divide(pathB);
                            }else if(pathAisClosed == false&&pathBisClosed ==true){
                                boolPathU = pathB.divide(pathA);
                            }
                            toElem = paper.project.exportSVG(boolPathU);
                            elemChild = toElem.childNodes[0].childNodes[2].childNodes[1].childNodes;
                            var  addD="";
                            for(var i = 0;i<elemChild.length;i++){
                                addD += elemChild[i].getAttribute("d");
                            }
                            elem.setAttribute("d",addD);
                        }
                    }
				}
                if(type == "trim"){
                    if(!isClosed){
                        boolPathU = pathA.subtract(pathB);
                        toElem = paper.project.exportSVG(boolPathU);
                        elemChild = $(toElem).find("#"+elemId);
                        for(var i = 0;i<elemChild.length;i++){
                            if(elemChild[i].getAttribute("d")!=elemString){
                                elem.setAttribute("d",elemChild[i].getAttribute("d"));
                            }
                        }
                        canvas.deleteCloneElements(elemA);
                    }else{
                        if(pathBisClosed == true&&pathAisClosed == true){
                        	return;
                        }else{
                            if(pathAisClosed == true &&pathBisClosed == false){
                                boolPathU = pathA.divide(pathB);
                            }else if(pathAisClosed == false&&pathBisClosed ==true){
                                boolPathU = pathB.divide(pathA);
                            }
                            toElem = paper.project.exportSVG(boolPathU);
                            elemChild = toElem.childNodes[0].childNodes[2].childNodes[1].childNodes;
                            var addD = pathAisClosed?elemB.getAttribute("d"):elemA.getAttribute("d");
                            for(var i = 0;i<elemChild.length;i++){
                                addD += elemChild[i].getAttribute("d");
                            }
							elem.setAttribute("d",addD);
                        }
                        if(pathAisClosed == true &&pathBisClosed == false){
                            canvas.deleteCloneElements(elemB);
                        }else if(pathAisClosed == false&&pathBisClosed ==true){
                            canvas.deleteCloneElements(elemA);
                        }
                    }
                }
                var rt = Raphael.parsePathString(elem.getAttribute('d'));
                var dStr = '';
                for(var i=0;i<rt.length;i++){
                    var points = rt[i];
                    var pointsStr = points.toString();
                    if(pointsStr.indexOf('L')>-1){
                        dStr+=('C'+points[1]+' '+points[2]+' '+points[1]+' '+points[2]+' '+points[1]+' '+points[2]+' ');
                    }else if(pointsStr.indexOf('l')>-1){
                        dStr+=('c'+points[1]+' '+points[2]+' '+points[1]+' '+points[2]+' '+points[1]+' '+points[2]+' ');
                    }else{
                        dStr+=(points.join(' ')+' ');
                    }
                }
                elem.setAttribute('d',dStr);
                var copyElemA = canvas.cloneElements(0,0,[elem]);
                canvas.selectOnly([copyElemA]);
                canvas.deleteCloneElements(elem);
				if(type == 'trim'){
                    var copyElemB = canvas.cloneElements(0,0,[elemB]);
                    canvas.selectOnly([copyElemB],true);
                    canvas.deleteCloneElements(elemB);
				}
            }
        }
		else{
			return;
		}
    }
    this.moveLayer = function ()
	{
		if(selectedElements.length==2){
            if($(selectedElements[0]).index()>$(selectedElements[1]).index()){
            	var elem = selectedElements[1]
            	canvas.cloneElements(0,0,[elem]);
            	canvas.deleteCloneElements(elem);
			}
        }else{
			return;
		}
    }
	this.updateCanvas = function(w, h)
	{
		console.log('======================= update canvase background');

		this.resetTransform();

		svgroot.setAttribute('width', w);
		svgroot.setAttribute('height', h);
		var bg = $('#canvasBackground')[0];
		var old_x = svgcontent.getAttribute('x');
		var old_y = svgcontent.getAttribute('y');
		var x = (w/2 - this.contentW*current_zoom/2);
		var y = (h/2 - this.contentH*current_zoom/2);

		svgedit.utilities.assignAttributes(svgcontent, {
			width: this.contentW*current_zoom,
			height: this.contentH*current_zoom,
			'x': x,
			'y': y,
			'viewBox' : '0 0 ' + this.contentW + ' ' + this.contentH
		});

		svgedit.utilities.assignAttributes(bg, {
			width: '100%',
			height: '100%',
			x: 0,
			y: 0
		});

		var bg_img = svgedit.utilities.getElem('background_image');
		if (bg_img) {
			svgedit.utilities.assignAttributes(bg_img, {
				'width': '100%',
				'height': '100%'
			});
		}


		//selectorManager.selectorParentGroup.setAttribute('transform', 'translate(' + x + ',' + y + ')');
        selectorManager.setTransform('translate(' + x + ',' + y + ')');
		runExtensions('canvasUpdated', {new_x:x, new_y:y, old_x:old_x, old_y:old_y, d_x:x - old_x, d_y:y - old_y});
		return {x:x, y:y, old_x:old_x, old_y:old_y, d_x:x - old_x, d_y:y - old_y};
	};

// Function: setBackground
// Set the background of the editor (NOT the actual document)
//
// Parameters:
// color - String with fill color to apply
// url - URL or path to image to use
	this.setBackground = function(color, url) {
		var bg = svgedit.utilities.getElem('canvasBackground');
		var border = $(bg).find('rect')[0];
		var bg_img = svgedit.utilities.getElem('background_image');
		border.setAttribute('fill', color);
		border.setAttribute('display' , 'none');
		if (url) {
			if (!bg_img) {
				bg_img = svgdoc.createElementNS(NS.SVG, 'image');
				svgedit.utilities.assignAttributes(bg_img, {
					'id': 'background_image',
					'width': '100%',
					'height': '100%',
					'preserveAspectRatio': 'xMinYMin',
					'style':'pointer-events:none'
				});
			}
			setHref(bg_img, url);
			bg.appendChild(bg_img);
		} else if (bg_img) {
			bg_img.parentNode.removeChild(bg_img);
		}
	};

// Function: cycleElement
// Select the next/previous element within the current layer
//
// Parameters:
// next - Boolean where true = next and false = previous element
	this.cycleElement = function(next) {
		var num;
		var cur_elem = selectedElements[0];
		var elem = false;
		var all_elems = getVisibleElements(current_group || getCurrentDrawing().getCurrentLayer());
		if (!all_elems.length) {return;}
		if (cur_elem == null) {
			num = next?all_elems.length-1:0;
			elem = all_elems[num];
		} else {
			var i = all_elems.length;
			while (i--) {
				if (all_elems[i] == cur_elem) {
					num = next ? i - 1 : i + 1;
					if (num >= all_elems.length) {
						num = 0;
					} else if (num < 0) {
						num = all_elems.length-1;
					}
					elem = all_elems[num];
					break;
				}
			}
		}
		selectOnly([elem], true);
		call('selected', selectedElements);
	};

	this.clear();


// DEPRECATED: getPrivateMethods
// Since all methods are/should be public somehow, this function should be removed

// Being able to access private methods publicly seems wrong somehow,
// but currently appears to be the best way to allow testing and provide
// access to them to plugins.
	this.getPrivateMethods = function() {
		var obj = {
			addCommandToHistory: addCommandToHistory,
			setGradient: setGradient,
			addSvgElementFromJson: addSvgElementFromJson,
			assignAttributes: assignAttributes,
			BatchCommand: BatchCommand,
			call: call,
			ChangeElementCommand: ChangeElementCommand,
			copyElem: copyElem,
			ffClone: ffClone,
			findDefs: findDefs,
			findDuplicateGradient: findDuplicateGradient,
			getElem: getElem,
			getId: getId,
			getIntersectionList: getIntersectionList,
			getMouseTarget: getMouseTarget,
			getNextId: getNextId,
			getPathBBox: getPathBBox,
			getUrlFromAttr: getUrlFromAttr,
			hasMatrixTransform: hasMatrixTransform,
			identifyLayers: identifyLayers,
			InsertElementCommand: InsertElementCommand,
			isIdentity: svgedit.math.isIdentity,
			logMatrix: logMatrix,
			matrixMultiply: matrixMultiply,
			MoveElementCommand: MoveElementCommand,
			preventClickDefault: preventClickDefault,
			recalculateAllSelectedDimensions: recalculateAllSelectedDimensions,
			recalculateDimensions: recalculateDimensions,
			remapElement: remapElement,
			RemoveElementCommand: RemoveElementCommand,
			removeUnusedDefElems: removeUnusedDefElems,
			round: round,
			runExtensions: runExtensions,
			sanitizeSvg: sanitizeSvg,
			SVGEditTransformList: svgedit.transformlist.SVGTransformList,
			toString: toString,
			transformBox: svgedit.math.transformBox,
			transformListToTransform: transformListToTransform,
			transformPoint: transformPoint,
			walkTree: svgedit.utilities.walkTree
		};
		return obj;
	};

};
