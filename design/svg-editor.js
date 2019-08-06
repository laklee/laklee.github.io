// Dependencies:
// 1) units.js
// 2) browser.js
// 3) svgcanvas.js

/*
TODOS
1. JSDoc
*/
(function() {

	if (window.svgEditor) {
		return;
	}
	window.svgEditor = (function($) {
		var editor = {};
		// EDITOR PROPERTIES: (defined below)
		//		curPrefs, curConfig, canvas, storage, uiStrings
		//
		// STATE MAINTENANCE PROPERTIES
		editor.tool_scale = 1; // Dependent on icon size, so any use to making configurable instead? Used by JQuerySpinBtn.js
		editor.exportWindowCt = 0;
		editor.langChanged = false;
		editor.showSaveWarning = false;
		editor.storagePromptClosed = false; // For use with ext-storage.js
		editor.isLoadDataFromServer = false;

		var svgCanvas,
            moveDis = 1,
            objnum = 0,
            num,
		    maxobjnum=10,
			netHelper = new nethelper(),
			urldata,
			Utils = svgedit.utilities,
			isReady = false,
			customExportImage = false,
			customExportPDF = false,
			callbacks = [],
			/**
			* PREFS AND CONFIG
			*/
			// The iteration algorithm for defaultPrefs does not currently support array/objects
			defaultPrefs = {
				// EDITOR OPTIONS (DIALOG)
				lang: '', // Default to "en" if locale.js detection does not detect another language
				iconsize: '', // Will default to 's' if the window height is smaller than the minimum height and 'm' otherwise
				bkgd_color: '#FFF',
				bkgd_url: '',
				// DOCUMENT PROPERTIES (DIALOG)
				img_save: 'embed',
				// ALERT NOTICES
				// Only shows in UI as far as alert notices, but useful to remember, so keeping as pref
				save_notice_done: false,
				export_notice_done: false
			},
			curPrefs = {},
			// Note: The difference between Prefs and Config is that Prefs
			//   can be changed in the UI and are stored in the browser,
			//   while config cannot
			curConfig = {
				// We do not put on defaultConfig to simplify object copying
				//   procedures (we obtain instead from defaultExtensions)
				extensions: [],
				/**
				* Can use window.location.origin to indicate the current
				* origin. Can contain a '*' to allow all domains or 'null' (as
				* a string) to support all file:// URLs. Cannot be set by
				* URL for security reasons (not safe, at least for
				* privacy or data integrity of SVG content).
				* Might have been fairly safe to allow
				*   `new URL(window.location.href).origin` by default but
				*   avoiding it ensures some more security that even third
				*   party apps on the same domain also cannot communicate
				*   with this app by default.
				* For use with ext-xdomain-messaging.js
				* @todo We might instead make as a user-facing preference.
				*/
				allowedOrigins: []
			},
			defaultExtensions = [
				'ext-overview_window.js',
				//'ext-markers.js',
				//'ext-connector.js',
				//'ext-eyedropper.js',
				//'ext-shapes.js',
				//'ext-imagelib.js',
				'ext-grid.js',

				'ext-panning.js',
				'ext-storage.js'
			],
			defaultConfig = {
				// Todo: svgcanvas.js also sets and checks: show_outside_canvas, selectNew; add here?
				// Change the following to preferences and add pref controls to the UI (e.g., initTool, wireframe, showlayers)?
				canvasName: 'default',
				canvas_expansion: 3,
				initFill: {
					color: 'FFFFFF', // solid red
					opacity: 0
				},
				initStroke: {
					width: 1,
					color: '000000', // solid black
					opacity: 1
				},
				initOpacity: 1,
				colorPickerCSS: null, // Defaults to 'left' with a position equal to that of the fill_color or stroke_color element minus 140, and a 'bottom' equal to 40
				initTool: 'select',
				exportWindowType: 'new', // 'same' (todo: also support 'download')
				wireframe: false,
				showlayers: false,
				no_save_warning: false,
				uniformscale : false,
				fixedaspect : true,
				showcrossruler : false,
				showcheckerboard : false,
				isAnchorPoint_Adding : false,
				isAnchorPoint_Removing : false ,
				isSissoringPath : false,
				// PATH CONFIGURATION
				// The following path configuration items are disallowed in the URL (as should any future path configurations)
				imgPath: 'images/',
				langPath: 'locale/',
				extPath: 'extensions/',
				jGraduatePath: 'jgraduate/images/',
				// DOCUMENT PROPERTIES
				// Change the following to a preference (already in the Document Properties dialog)?
				dimensions: [640, 480],
				// EDITOR OPTIONS
				// Change the following to preferences (already in the Editor Options dialog)?
				gridSnapping: false,
				gridColor: '#000',
				baseUnit: 'cm',
				snappingStep: 10,
				showRulers: true,
				// URL BEHAVIOR CONFIGURATION
				preventAllURLConfig: false,
				preventURLContentLoading: false,
				// EXTENSION CONFIGURATION (see also preventAllURLConfig)
				lockExtensions: false, // Disallowed in URL setting
				noDefaultExtensions: false, // noDefaultExtensions can only be meaningfully used in config.js or in the URL
				// EXTENSION-RELATED (GRID)
				showGrid: false, // Set by ext-grid.js
				// EXTENSION-RELATED (STORAGE)
				noStorageOnLoad: false, // Some interaction with ext-storage.js; prevent even the loading of previously saved local storage
				forceStorage: false, // Some interaction with ext-storage.js; strongly discouraged from modification as it bypasses user privacy by preventing them from choosing whether to keep local storage or not
				emptyStorageOnDecline: false // Used by ext-storage.js; empty any prior storage if the user declines to store
			},
			/**
			* LOCALE
			* @todo Can we remove now that we are always loading even English? (unless locale is set to null)
			*/
			uiStrings = editor.uiStrings = {
				common: {
					ok: 'OK',
					cancel: 'Cancel',
					key_up: 'Up',
					key_down: 'Down',
					key_backspace: 'Backspace',
					key_del: 'Del'
				},
				// This is needed if the locale is English, since the locale strings are not read in that instance.
				layers: {
					layer: 'Layer'
				},
				notification: {
					invalidAttrValGiven: 'Invalid value given',
					noContentToFitTo: 'No content to fit to',
					dupeLayerName: 'There is already a layer named that!',
					enterUniqueLayerName: 'Please enter a unique layer name',
					enterNewLayerName: 'Please enter the new layer name',
					layerHasThatName: 'Layer already has that name',
					QmoveElemsToLayer: 'Move selected elements to layer \'%s\'?',
					QwantToClear: 'Do you want to clear the drawing?\nThis will also erase your undo history!',
					QwantToOpen: 'Do you want to open a new file?\nThis will also erase your undo history!',
                    QwantToCheckOut: 'Do you want to open a new file?\nThis will also erase your undo history!',
                    QwantToDeletePart: 'Do you want to delete current part?\nThis part will dismissed!',
                    QwantToRecover: 'Do you want to open a new file?\nThis will also erase your undo history!',
					QerrorsRevertToSource: 'There were parsing errors in your SVG source.\nRevert back to original SVG source?',
					QignoreSourceChanges: 'Ignore changes made to SVG source?',
					featNotSupported: 'Feature not supported',
					enterNewImgURL: 'Enter the new image URL',
					defsFailOnSave: 'NOTE: Due to a bug in your browser, this image may appear wrong (missing gradients or elements). It will however appear correct once actually saved.',
					loadingImage: 'Loading image, please wait...',
					chooseImageTypeToExport: 'Select an image type for export: ',
					saveFromBrowser: 'Select \'Save As...\' in your browser to save this image as a %s file.',
					noteTheseIssues: 'Also note the following issues: ',
					unsavedChanges: 'There are unsaved changes.',
					enterNewLinkURL: 'Enter the new hyperlink URL',
					errorLoadingSVG: 'Error: Unable to load SVG data',
					URLloadFail: 'Unable to load from URL',
					retrieving: 'Retrieving \'%s\' ...' ,
					//QneedRasterSvgToImage:'Layer need to be rasterized to use eraser.\nRaster current Layer?'
                    QneedRasterSvgToImage:'This tool works on Bitmap layer!\nDo you want to raster current layer to bitmap?'
				}
			};


		editor.loadSvgString = loadSvgString = function(str, callback) {
			var success = svgCanvas.setSvgString(str) !== false;
			callback = callback || $.noop;
			if (success) {
				callback(true);
			} else {
				$.alert(uiStrings.notification.errorLoadingSVG, function() {
					callback(false);
				});
			}
		}

		/**
		* EXPORTS
		*/

		/**
		* Store and retrieve preferences
		* @param {string} key The preference name to be retrieved or set
		* @param {string} [val] The value. If the value supplied is missing or falsey, no change to the preference will be made.
		* @returns {string} If val is missing or falsey, the value of the previously stored preference will be returned.
		* @todo Can we change setting on the jQuery namespace (onto editor) to avoid conflicts?
		* @todo Review whether any remaining existing direct references to
		*	getting curPrefs can be changed to use $.pref() getting to ensure
		*	defaultPrefs fallback (also for sake of allowInitialUserOverride); specifically, bkgd_color could be changed so that
		*	the pref dialog has a button to auto-calculate background, but otherwise uses $.pref() to be able to get default prefs
		*	or overridable settings
		*/
		$.pref = function (key, val) {
			if (val) {
				curPrefs[key] = val;
				editor.curPrefs = curPrefs; // Update exported value
				return;
			}
			return (key in curPrefs) ? curPrefs[key] : defaultPrefs[key];
		};

		/**
		* EDITOR PUBLIC METHODS
		* locale.js also adds "putLang" and "readLang" as editor methods
		* @todo Sort these methods per invocation order, ideally with init at the end
		* @todo Prevent execution until init executes if dependent on it?
		*/

		/**
		* Where permitted, sets canvas and/or defaultPrefs based on previous
		*	storage. This will override URL settings (for security reasons) but
		*	not config.js configuration (unless initial user overriding is explicitly
		*	permitted there via allowInitialUserOverride).
		* @todo Split allowInitialUserOverride into allowOverrideByURL and
		*	allowOverrideByUserStorage so config.js can disallow some
		*	individual items for URL setting but allow for user storage AND/OR
		*	change URL setting so that it always uses a different namespace,
		*	so it won't affect pre-existing user storage (but then if users saves
		*	that, it will then be subject to tampering
		*/
		editor.loadContentAndPrefs = function () {
			if (!curConfig.forceStorage && (curConfig.noStorageOnLoad || !document.cookie.match(/(?:^|;\s*)store=(?:prefsAndContent|prefsOnly)/))) {
				return;
			}

			// LOAD CONTENT
			if (editor.storage && // Cookies do not have enough available memory to hold large documents
				(curConfig.forceStorage || (!curConfig.noStorageOnLoad && document.cookie.match(/(?:^|;\s*)store=prefsAndContent/)))
			) {
				var name = 'svgedit-' + curConfig.canvasName;
				var cached = editor.storage.getItem(name);
				if (cached && editor.isLoadDataFromServer == false)
				{
					editor.loadFromString(cached);
				}
			}

			// LOAD PREFS
			var key;
			for (key in defaultPrefs) {
				if (defaultPrefs.hasOwnProperty(key)) { // It's our own config, so we don't need to iterate up the prototype chain
					var storeKey = 'svg-edit-' + key;
					if (editor.storage) {
						var val = editor.storage.getItem(storeKey);
						if (val) {
							defaultPrefs[key] = String(val); // Convert to string for FF (.value fails in Webkit)
						}
					}
					else if (window.widget) {
						defaultPrefs[key] = widget.preferenceForKey(storeKey);
					}
					else {
						var result = document.cookie.match(new RegExp('(?:^|;\\s*)' + Utils.preg_quote(encodeURIComponent(storeKey)) + '=([^;]+)'));
						defaultPrefs[key] = result ? decodeURIComponent(result[1]) : '';
					}
				}
			}
		};

		/**
		* Allows setting of preferences or configuration (including extensions).
		* @param {object} opts The preferences or configuration (including extensions)
		* @param {object} [cfgCfg] Describes configuration which applies to the particular batch of supplied options
		* @param {boolean} [cfgCfg.allowInitialUserOverride=false] Set to true if you wish
		*	to allow initial overriding of settings by the user via the URL
		*	(if permitted) or previously stored preferences (if permitted);
		*	note that it will be too late if you make such calls in extension
		*	code because the URL or preference storage settings will
		*   have already taken place.
		* @param {boolean} [cfgCfg.overwrite=true] Set to false if you wish to
		*	prevent the overwriting of prior-set preferences or configuration
		*	(URL settings will always follow this requirement for security
		*	reasons, so config.js settings cannot be overridden unless it
		*	explicitly permits via "allowInitialUserOverride" but extension config
		*	can be overridden as they will run after URL settings). Should
		*   not be needed in config.js.
		*/
		editor.setConfig = function (opts, cfgCfg) {
			cfgCfg = cfgCfg || {};
			function extendOrAdd (cfgObj, key, val) {
				if (cfgObj[key] && typeof cfgObj[key] === 'object') {
					$.extend(true, cfgObj[key], val);
				}
				else {
					cfgObj[key] = val;
				}
				return;
			}
			$.each(opts, function(key, val) {
				if (opts.hasOwnProperty(key)) {
					// Only allow prefs defined in defaultPrefs
					if (defaultPrefs.hasOwnProperty(key)) {
						if (cfgCfg.overwrite === false && (
							curConfig.preventAllURLConfig ||
							curPrefs.hasOwnProperty(key)
						)) {
							return;
						}
						if (cfgCfg.allowInitialUserOverride === true) {
							defaultPrefs[key] = val;
						}
						else {
							$.pref(key, val);
						}
					}
					else if (['extensions', 'allowedOrigins'].indexOf(key) > -1) {
						if (cfgCfg.overwrite === false &&
							(
								curConfig.preventAllURLConfig ||
								key === 'allowedOrigins' ||
								(key === 'extensions' && curConfig.lockExtensions)
							)
						) {
							return;
						}
						curConfig[key] = curConfig[key].concat(val); // We will handle any dupes later
					}
					// Only allow other curConfig if defined in defaultConfig
					else if (defaultConfig.hasOwnProperty(key)) {
						if (cfgCfg.overwrite === false && (
							curConfig.preventAllURLConfig ||
							curConfig.hasOwnProperty(key)
						)) {
							return;
						}
						// Potentially overwriting of previously set config
						if (curConfig.hasOwnProperty(key)) {
							if (cfgCfg.overwrite === false) {
								return;
							}
							extendOrAdd(curConfig, key, val);
						}
						else {
							if (cfgCfg.allowInitialUserOverride === true) {
								extendOrAdd(defaultConfig, key, val);
							}
							else {
								if (defaultConfig[key] && typeof defaultConfig[key] === 'object') {
									curConfig[key] = {};
									$.extend(true, curConfig[key], val); // Merge properties recursively, e.g., on initFill, initStroke objects
								}
								else {
									curConfig[key] = val;
								}
							}
						}
					}
				}
			});
			editor.curConfig = curConfig; // Update exported value
		};

		/**
		* @param {object} opts Extension mechanisms may call setCustomHandlers with three functions: opts.open, opts.save, and opts.exportImage
		* opts.open's responsibilities are:
		*	- invoke a file chooser dialog in 'open' mode
		*	- let user pick a SVG file
		*	- calls svgCanvas.setSvgString() with the string contents of that file
		*  opts.save's responsibilities are:
		*	- accept the string contents of the current document
		*	- invoke a file chooser dialog in 'save' mode
		*	- save the file to location chosen by the user
		*  opts.exportImage's responsibilities (with regard to the object it is supplied in its 2nd argument) are:
		*	- inform user of any issues supplied via the "issues" property
		*	- convert the "svg" property SVG string into an image for export;
		*		utilize the properties "type" (currently 'PNG', 'JPEG', 'BMP',
		*		'WEBP', 'PDF'), "mimeType", and "quality" (for 'JPEG' and 'WEBP'
		*		types) to determine the proper output.
		*/
		editor.setCustomHandlers = function (opts) {
			editor.ready(function() {
				if (opts.open) {
					$('#tool_open > input[type="file"]').remove();
					$('#tool_open').show();
					svgCanvas.open = opts.open;
				}
				if (opts.save) {
					editor.showSaveWarning = false;
					svgCanvas.bind('saved', opts.save);
				}
				if (opts.exportImage) {
					customExportImage = opts.exportImage;
					svgCanvas.bind('exported', customExportImage); // canvg and our RGBColor will be available to the method
				}
				if (opts.exportPDF) {
					customExportPDF = opts.exportPDF;
					svgCanvas.bind('exportedPDF', customExportPDF); // jsPDF and our RGBColor will be available to the method
				}
			});
		};

		editor.randomizeIds = function () {
			svgCanvas.randomizeIds(arguments);
		};

		editor.getNetHelper = function()
		{
			return netHelper;
		}

		editor.syncProjectToServer = function()
		{
			console.log('=============================== sync project to server');
			svgCanvas.submitToServerTemp();
		}

		editor.init = function ()
		{
            netHelper.parseAllUrlParams();

            var syncInterval = 180; //10s per time
            setInterval(function(){editor.syncProjectToServer();} , 1000 * syncInterval);
			{
				/*
                var data = null;

                var xhr = new XMLHttpRequest();
                //xhr.withCredentials = true;

                xhr.addEventListener("readystatechange", function () {
                    if (this.readyState === 4) {
                        console.log(this.responseText);

                        console.log('========================1111111111111111111111111111');
                    }
                });

                xhr.open("GET", "http://fabric-original.oss-cn-shanghai.aliyuncs.com/design/upload/mzi/201706/testdata.svg?Expires=1497378707&OSSAccessKeyId=TMP.AQEpA8uPb_Z1BYhgafAg09gENk0dmZKj-o3mvd--xlNj65PgffpUAMGtuWbJADAtAhUA5t7WzqI4biHBX0Uat8HtapUj8LMCFCG2lMHqD467Y0AbkTzcRUBRm30g&Signature=yAZ8lldZ8z4vPxaHWWzwoizJPhk%3D");
                xhr.setRequestHeader("cache-control", "no-cache");
                xhr.setRequestHeader("postman-token", "de152974-722f-e831-9241-34f2346b0a1b");

                xhr.send(data);

				/*
                var settings = {
                    "async": true,
                    "crossDomain": true,
                    "url": "http://fabric-original.oss-cn-shanghai.aliyuncs.com/design/upload/mzi/201706/testdata.svg?Expires=1497378707&OSSAccessKeyId=TMP.AQEpA8uPb_Z1BYhgafAg09gENk0dmZKj-o3mvd--xlNj65PgffpUAMGtuWbJADAtAhUA5t7WzqI4biHBX0Uat8HtapUj8LMCFCG2lMHqD467Y0AbkTzcRUBRm30g&Signature=yAZ8lldZ8z4vPxaHWWzwoizJPhk%3D",
                    "method": "GET",
                    "headers": {
                        "cache-control": "no-cache",
                        "postman-token": "a4acb6cb-ccf8-7a8f-5794-ed8f6ca02cc8"
                    }
                }

				 $.ajax(settings).done(function (response)
				 {
				 	console.log(response);

				 	console.log(response.innerText);
				 });
				 */
			}
			//*/

			// var host = location.hostname,
			//	onWeb = host && host.indexOf('.') >= 0;
			// Some FF versions throw security errors here when directly accessing
			try {
				if ('localStorage' in window) { // && onWeb removed so Webkit works locally
					editor.storage = localStorage;
				}
			} catch(err) {}

			// Todo: Avoid var-defined functions and group functions together, etc. where possible
			var good_langs = [];
			$('#lang_select option').each(function() {
				good_langs.push(this.value);
			});

			function setupCurPrefs () {
				curPrefs = $.extend(true, {}, defaultPrefs, curPrefs); // Now safe to merge with priority for curPrefs in the event any are already set
				// Export updated prefs
				editor.curPrefs = curPrefs;
			}
			function setupCurConfig () {
				curConfig = $.extend(true, {}, defaultConfig, curConfig); // Now safe to merge with priority for curConfig in the event any are already set

				// Now deal with extensions and other array config
				if (!curConfig.noDefaultExtensions) {
					curConfig.extensions = curConfig.extensions.concat(defaultExtensions);
				}
				// ...and remove any dupes
				$.each(['extensions', 'allowedOrigins'], function (i, cfg) {
					curConfig[cfg] = $.grep(curConfig[cfg], function (n, i) {
						return i === curConfig[cfg].indexOf(n);
					});
				});
				// Export updated config
				editor.curConfig = curConfig;
			}
			(function() {
				// Load config/data from URL if given
				var src, qstr;
				urldata = $.deparam.querystring(true);
				if (!$.isEmptyObject(urldata)) {
					if (urldata.dimensions) {
						urldata.dimensions = urldata.dimensions.split(',');
					}

					if (urldata.bkgd_color) {
						urldata.bkgd_color = '#' + urldata.bkgd_color;
					}

					if (urldata.extensions) {
						// For security reasons, disallow cross-domain or cross-folder extensions via URL
						urldata.extensions = urldata.extensions.match(/[:\/\\]/) ? '' : urldata.extensions.split(',');
					}

					// Disallowing extension paths via URL for
					// security reasons, even for same-domain
					// ones given potential to interact in undesirable
					// ways with other script resources
					$.each(
						[
							'extPath', 'imgPath',
							'langPath', 'jGraduatePath'
						],
						function (pathConfig) {
							if (urldata[pathConfig]) {
								delete urldata[pathConfig];
							}
						}
					);

					editor.setConfig(urldata, {overwrite: false}); // Note: source and url (as with storagePrompt later) are not set on config but are used below

					setupCurConfig();

					if (!curConfig.preventURLContentLoading) {
						src = urldata.source;
						qstr = $.param.querystring();
						if (!src) { // urldata.source may have been null if it ended with '='
							if (qstr.indexOf('source=data:') >= 0) {
								src = qstr.match(/source=(data:[^&]*)/)[1];
							}
						}
						if (src) {
							if (src.indexOf('data:') === 0) {
								editor.loadFromDataURI(src);
							} else {
								editor.loadFromString(src);
							}
							return;
						}
						if (urldata.url) {
							editor.loadFromURL(urldata.url);
							return;
						}
					}
					if (!urldata.noStorageOnLoad || curConfig.forceStorage) {
						editor.loadContentAndPrefs();
					}
					setupCurPrefs();
				}
				else {
					setupCurConfig();
					editor.loadContentAndPrefs();
					setupCurPrefs();
				}
			}());

			// For external openers
			(function() {
				// let the opener know SVG Edit is ready (now that config is set up)
				var svgEditorReadyEvent,
					w = window.opener;
				if (w) {
					try {
						svgEditorReadyEvent = w.document.createEvent('Event');
						svgEditorReadyEvent.initEvent('svgEditorReady', true, true);
						w.document.documentElement.dispatchEvent(svgEditorReadyEvent);
					}
					catch(e) {}
				}
			}());

			var setIcon = editor.setIcon = function(elem, icon_id, forcedSize) {
				var icon = (typeof icon_id === 'string') ? $.getSvgIcon(icon_id, true) : icon_id.clone();
				if (!icon) {
					console.log('NOTE: Icon image missing: ' + icon_id);
					return;
				}
				$(elem).empty().append(icon);
			};

			var extFunc = function() {
				$.each(curConfig.extensions, function() {
					var extname = this;
					if (!extname.match(/^ext-.*\.js/)) { // Ensure URL cannot specify some other unintended file in the extPath
						return;
					}
					$.getScript(curConfig.extPath + extname, function(d) {
						// Fails locally in Chrome 5
						if (!d) {
							var s = document.createElement('script');
							s.src = curConfig.extPath + extname;
							document.querySelector('head').appendChild(s);
						}
					});
				});

				// var lang = ('lang' in curPrefs) ? curPrefs.lang : null;
				editor.putLocale(null, good_langs);
			};

			// Load extensions
			// Bit of a hack to run extensions in local Opera/IE9
			if (document.location.protocol === 'file:') {
				setTimeout(extFunc, 100);
			} else {
				extFunc();
			}

			///*
			$.svgIcons(curConfig.imgPath + 'svg_edit_icons.svg', {
				w:24, h:24,
				id_match: false,
				no_img: !svgedit.browser.isWebkit(), // Opera & Firefox 4 gives odd behavior w/images
				fallback_path: curConfig.imgPath,
				fallback:
				{
					'logo' : 'logo.png',
					'pngtosvg' : 'pngtosvg.png',
                    'scale' : 'scale.png',
					'fixaspect' : 'fixaspect.png',
					'view_grid' : 'view_grid.png',
					'submit' : 'submit.png' ,
					'checkout' : 'checkout.png' ,
					'importpart' : 'importpart.png' ,
					'exportpart' : 'exportpart.png' ,
					'lasso' : 'magicwand.png' ,
					'quickselect' : 'quickselect.png' ,
					'quickselect_rect' : 'quickselect_rect.png' ,
					'new_image': 'new_image.png',
					'save': 'save.png',
					'open': 'open.png',
					'source': 'source.png',
					'docprops': 'document-properties.png',
					'wireframe': 'wireframe.png',
					'editoroption' : 'layout-option.png',
                    'export' : 'export.png',
					'export_pdf' : 'export.png',
                    'import' : 'import.png',

					'undo': 'undo.png',
					'redo': 'redo.png',

					'select': 'select.png',
					'select_node': 'select_node.png',
					'pencil': 'fhpath.png',
					'pen': 'line.png',
					'square': 'square.png',
					'rect': 'rect.png',
					'fh_rect': 'freehand-square.png',
					'circle': 'circle.png',
					'ellipse': 'ellipse.png',
					'fh_ellipse': 'freehand-circle.png',
					'path': 'path.png',
					'text': 'text.png',
					'image': 'image.png',
					'zoom': 'zoom.png',

					'clone': 'cloneobject.png',
					'node_clone': 'node_clone.png',
					'delete': 'deleteobject.png',
					'node_delete': 'node_delete.png',
					'group': 'shape_group_elements.png',
					'ungroup': 'shape_ungroup.png',
					'move_top': 'move_top.png',
					'move_bottom': 'move_bottom.png',
					'to_path': 'to_path.png',
					'link_controls': 'link_controls.png',
					'reorient': 'reorient.png',

					'align_left': 'align-left.png',
					'align_center': 'align-center.png',
					'align_right': 'align-right.png',
					'align_top': 'align-top.png',
					'align_middle': 'align-middle.png',
					'align_bottom': 'align-bottom.png',
					'layoutautoh' : 'autoposh.png',
                    'layoutautov' : 'autoposv.png',

					'go_up': 'go-up.png',
					'go_down': 'go-down.png',

					'ok': 'save.png',
					'cancel': 'cancel.png',

					'arrow_right': 'flyouth.png',
					'arrow_down': 'dropdown.gif' ,
                    'eraser': 'eraser.png' ,
					'fill' : 'fill.png',
					'stroke' : 'stroke.png',
					'opacity' : 'opacity.png',
					'new_layer' : 'new_layer.png',
                    'delete_layer' : 'delete_layer.png',
                    'rename_layer' : 'rename_layer.png',
                    'up_layer' : 'up_layer.png',
                    'down_layer' : 'down_layer.png' ,
					'lock_layer' : 'lock_layer.png' ,
					'eye' : 'show_layer.png' ,
                    'layer_locked': 'lock_layer.png' ,
					'crossruler' : 'crossruler.png' ,
					'eraser_shape' : 'eraser_shape.png',
					'partpreview' : 'preview.png',
					'partrefresh' : 'refreshparts.png',
                    'edgesmiter' : 'linejoin_round.png',
                    'edgesmitermiter' : 'linejoin_miter.png',
                    'recttopath':'topath.png',
                    'insertobj':'insertobj.png',
                    'intersect':'trim.png',
                    'trim':'Intersect.png',
                    'union':'union.png',
                    'moveLayer':'move_layer.png',
                    'flip_h' : 'flip_h.png' ,
					'flip_v' : 'flip_v.png' ,
					'checkboard' : 'view_checkboard.png' ,
					'colorpicker' : 'tool_eyedropper.png' ,
					'change_image' : 'globe_link.png' ,
					'group_elements' : 'group_elements.png' ,
					'ungroup' : 'ungroup.png' ,
					'open_path' : 'open_path.png' ,
					'add_subpath' : 'add_subpath.png' ,
					'dashstyle' : 'dashstyle.png' ,
					'strokewidth' : 'strokewidth.png' ,
					'fillpattern' : 'fillpattern.png',
					'line_connect' : 'line_connect.png',
					'node_addctrlpoint' : 'ctrlpoint_add.png',
					'node_removectrlpoint_r' : 'ctrlpoint_remove_r.png',
                    'node_removectrlpoint_g' : 'ctrlpoint_remove_g.png',
					'anchor_add' : 'anchor_add.png',
					'anchor_remove' : 'anchor_remove.png',
					'cp_add' : 'cp_add.png',
					'cp_remove' : 'cp_remove.png',
					'cp_connnect' : 'connection.png',
					'cp_openclosepath' : 'open_path.png',
					'cp_pathscissor' : 'pathscissor.png' ,
					'select_node_new' :  'arrownode.png' ,
					'recover' : 'datarecovery.png'
				},
				placement: {
					'#logo': 'logo',
					'#tool_submit':'submit',
					'#tool_checkout':'checkout',
					'#tool_importpart' : 'importpart',
					'#tool_exportpart' : 'exportpart',

					'#layer_new': 'new_layer',
                    '#layer_delete': 'delete_layer',
                    '#layer_rename': 'rename_layer',
                    '#layer_up': 'up_layer',
                    '#layer_down': 'down_layer',
					'#layer_lock' : 'lock_layer',
					'#tool_clear div': 'new_image',
					'#tool_save div': 'save',
					'#tool_export div': 'export',
                    '#tool_export_pdf div': 'export_pdf',
					'#tool_open div div': 'open',
					'#tool_import div div': 'import',
                    '#tool_import_server div div': 'import',
					'#tool_source': 'source',
					'#tool_docprops > div': 'docprops',
					'#tool_wireframe': 'wireframe',
					'#tool_scalemode':'scale',
					'#tool_fixaspect':'fixaspect',
					'#tool_crossruler' : 'crossruler',
					'#tool_checkboard' : 'checkboard',
					'#tool_erasershape':'eraser_shape',
					'#tool_partpreview' : 'partpreview',
                    '#tool_partrefresh' : 'partrefresh',
                    '#tool_edgesmiter' : 'edgesmiter',
                    '#recttopath' : 'recttopath',
                    '#insertobj' : 'insertobj',
                    '#tool_Intersect' : 'intersect',
                    '#tool_Trim' : 'trim',
                    '#tool_Union' : 'union',
                    '#tool_Move' : 'moveLayer',
                    '#tool_prefs_option > div' : 'editoroption',

					'#tool_undo': 'undo',
					'#tool_redo': 'redo',

					'#tool_select': 'select',
					'#tool_selectnode' : 'select_node_new',
					'#tool_lasso' : 'lasso' ,
					'#tool_quickselect,#tools_quickselect_show' : 'quickselect' ,
                    '#tool_quickselect_rect' : 'quickselect_rect' ,
					'#tool_fhpath': 'pencil',
					'#tool_line': 'pen',
					'#tool_rect,#tools_rect_show': 'rect',
					'#tool_square': 'square',
					'#tool_fhrect': 'fh_rect',
					'#tool_ellipse,#tools_ellipse_show': 'ellipse',
					'#tool_circle': 'circle',
					'#tool_fhellipse': 'fh_ellipse',
					'#tool_path': 'path',
					'#tool_text': 'text',
					'#tool_image': 'image',
					'#tool_zoom': 'zoom',
					'#tool_eraser' : 'eraser',
					'#tool_colorpicker' : 'colorpicker',
					'#tool_colorpad' : 'colorpad',
					'#tool_sketchpad' : 'sketchpad',
					'#tool_slice' : 'slice',
					'#tool_pngtosvg' : 'pngtosvg',
					'#tool_flip_h' : 'flip_h' ,
					'#tool_flip_v' : 'flip_v' ,
					'#tool_change_image_button' : 'change_image',

					'#tool_clone,#tool_clone_multi': 'clone',
					'#tool_node_clone': 'node_clone',
					'#tool_add_ctrlpoint' : 'node_addctrlpoint',
					'#tool_remove_ctrlpoint_red' : 'node_removectrlpoint_r' ,
                    '#tool_remove_ctrlpoint_green' : 'node_removectrlpoint_g' ,
                    '#tool_delete,#tool_delete_multi': 'delete',
					'#tool_node_delete': 'node_delete',
					'#tool_add_subpath': 'add_subpath',
					'#tool_openclose_path': 'open_path',
					'#tool_move_top': 'move_top',
					'#tool_move_bottom': 'move_bottom',
					'#tool_topath': 'to_path',
					'#tool_node_link': 'link_controls',
					'#tool_reorient': 'reorient',
					'#tool_group_elements': 'group_elements',
					'#tool_ungroup': 'ungroup',
					'#tool_unlink_use': 'unlink_use',
					'#tool_add_anchorpoint' : 'anchor_add',
					'#tool_remove_anchorpoint' : 'anchor_remove',
					'#tool_add_ctrlpoint' : 'cp_add',
					'#tool_remove_ctrlpoint' : 'cp_remove',
					'#tool_connect_anchors' : 'cp_connnect',
					'#tool_openclose_paths' : 'cp_openclosepath',
					'#tool_path_scissor' : 'cp_pathscissor',

					'#tool_alignleft, #tool_posleft': 'align_left',
					'#tool_aligncenter, #tool_poscenter': 'align_center',
					'#tool_alignright, #tool_posright': 'align_right',
					'#tool_aligntop, #tool_postop': 'align_top',
					'#tool_alignmiddle, #tool_posmiddle': 'align_middle',
					'#tool_alignbottom, #tool_posbottom': 'align_bottom',
					'#cur_position': 'align',
                    '#tool_autoposcenter': 'layoutautoh',
                    '#tool_autoposmiddle': 'layoutautov',

					'#linecap_butt,#cur_linecap': 'linecap_butt',
					'#linecap_round': 'linecap_round',
					'#linecap_square': 'linecap_square',

					'#linejoin_miter,#cur_linejoin': 'linejoin_miter',
					'#linejoin_round': 'linejoin_round',
					'#linejoin_bevel': 'linejoin_bevel',

					'#url_notice': 'warning',

					'#layer_moreopts': 'context_menu',
					'#layerlist td.layervis': 'eye',
                    '#layerlist td.layerlock': 'layer_locked',

					'#tool_source_save,#tool_docprops_save,#tool_prefs_save': 'ok',
					'#tool_source_cancel,#tool_docprops_cancel,#tool_prefs_cancel': 'cancel',
                    '#tool_prefs_recover': 'recover',

					'#rwidthLabel, #iwidthLabel': 'width',
					'#rheightLabel, #iheightLabel': 'height',
					'#cornerRadiusLabel span': 'c_radius',
					'#angleLabel': 'angle',
					'#linkLabel,#tool_make_link,#tool_make_link_multi': 'globe_link',
					'#zoomLabel': 'zoom',
					'#tool_fill label': 'fill',
					'#tool_stroke .icon_label': 'stroke',
					'#group_opacityLabel': 'opacity',
					'#stroke_style_label' : 'dashstyle',
					'#stroke_width_label' : 'strokewidth' ,
					'#fill_pattern_style_label' : 'fillpattern',
					'#blurLabel': 'blur',
					'#lassoLabel' : 'lasso_value',
					'#eraserLabel':'eraser_radius',
					'#font_sizeLabel': 'fontsize',
                    '#palette_pantone':'pantone',

					'.flyout_arrow_horiz': 'arrow_right',
					'.dropdown button, #main_button .dropdown': 'arrow_down',
					'#palette .palette_item:first, #fill_bg, #stroke_bg': 'no_color'
				},
				resize: {
					'#logo .svg_icon': 28,
					'.flyout_arrow_horiz .svg_icon': 5,
					'.layer_button .svg_icon, #layerlist td.layervis td.layerunlock .svg_icon': 14,
					'.dropdown button .svg_icon': 7,
					'#main_button .dropdown .svg_icon': 9,
					'.palette_item:first .svg_icon' : 15,
					'#fill_bg .svg_icon, #stroke_bg .svg_icon': 16,
					'.toolbar_button button .svg_icon': 16,
					'.stroke_tool div div .svg_icon': 20,
					'#tools_bottom label .svg_icon': 18
				},
				callback: function(icons) {
					$('.toolbar_button button > svg, .toolbar_button button > img').each(function() {
						$(this).parent().prepend(this);
					});

					var min_height,
						tleft = $('#tools_left');
					if (tleft.length !== 0) {
						min_height = tleft.offset().top + tleft.outerHeight();
					}

					var size = $.pref('iconsize');
					editor.setIconSize(size || ($(window).height() < min_height ? 's': 'm'));

					// Look for any missing flyout icons from plugins
					$('.tools_flyout').each(function() {
						var shower = $('#' + this.id + '_show');
						var sel = shower.attr('data-curopt');
						// Check if there's an icon here
						if (!shower.children('svg, img').length) {
							var clone = $(sel).children().clone();
							if (clone.length) {
								clone[0].removeAttribute('style'); //Needed for Opera
								shower.append(clone);
							}
						}
					});

					editor.runCallbacks();

                    console.log("============================================ init icons");

					setTimeout(function() {
						$('.flyout_arrow_horiz:empty').each(function() {
							$(this).append($.getSvgIcon('arrow_right').width(5).height(5));
						});
					}, 1);
				}
			});
			//*/
            console.log("============================================ init icons111");

			editor.canvas = svgCanvas = new $.SvgCanvas(document.getElementById('svgcanvas'), curConfig);
			var supportsNonSS, resize_timer, changeZoom, Actions, curScrollPos,
				palette = [ // Todo: Make into configuration item?
					'#000000', '#3f3f3f', '#7f7f7f', '#bfbfbf', '#ffffff',
					'#ff0000', '#ff7f00', '#ffff00', '#7fff00',
					'#00ff00', '#00ff7f', '#00ffff', '#007fff',
					'#0000ff', '#7f00ff', '#ff00ff', '#ff007f',
					'#7f0000', '#7f3f00', '#7f7f00', '#3f7f00',
					'#007f00', '#007f3f', '#007f7f', '#003f7f',
					'#00007f', '#3f007f', '#7f007f', '#7f003f',
					'#ffaaaa', '#ffd4aa', '#ffffaa', '#d4ffaa',
					'#aaffaa', '#aaffd4', '#aaffff', '#aad4ff',
					'#aaaaff', '#d4aaff', '#ffaaff', '#ffaad4'
				],
				modKey = (svgedit.browser.isMac() ? 'meta+' : 'ctrl+'), // ⌘
				path = svgCanvas.pathActions,
				undoMgr = svgCanvas.undoMgr,
				defaultImageURL = curConfig.imgPath + 'logo.png',
				workarea = $('#workarea'),
				canv_menu = $('#cmenu_canvas'),
				// layer_menu = $('#cmenu_layers'), // Unused
				exportWindow = null,
				zoomInIcon = 'default',//crosshair',
				zoomOutIcon = 'default',// 'crosshair',
				ui_context = 'toolbars',
				origSource = '',
				paintBox = {fill: null, stroke:null};

			var paletteFill = [ // Todo: Make into configuration item?
                '',
                '<pattern id="fillpattern_1" patternUnits="userSpaceOnUse" width="11" height="11"><circle cx="5.5" cy="5.5" r="4" style="fill:red; stroke:red; stroke-width:1" /></pattern>',
                '<pattern id="fillpattern_2" patternUnits="userSpaceOnUse" width="11" height="11"><rect x="1" y="1" width="8" height="8" style="fill:green; stroke:green; stroke-width:1" /></pattern>',
                '<pattern id="fillpattern_3" patternUnits="userSpaceOnUse" width="11" height="11"><path d="M0,0 2.75,11 5.5,0 8.25,11 11,0" style="fill:none; stroke:green; stroke-width:2" /></pattern>',
                '<pattern id="fillpattern_4" patternUnits="userSpaceOnUse" width="11" height="11"><path d="M0,11 2.75,0 5.5,11 8.25,0 11,11" style="fill:none; stroke:blue; stroke-width:2" /></pattern>',
                '<pattern id="fillpattern_5" patternUnits="userSpaceOnUse" width="11" height="11"><path d="M0,0 11,5.5 0,11" style="fill:none; stroke:gray; stroke-width:2" /></pattern>',
                '<pattern id="fillpattern_6" patternUnits="userSpaceOnUse" width="11" height="11"><path d="M11,0 0,5.5 11,11" style="fill:none; stroke:#485d78; stroke-width:2" /></pattern>',
                '<pattern id="fillpattern_7" patternUnits="userSpaceOnUse" width="11" height="11"><path d="M0,0 11,11 M0,11 11,0" style="fill:none; stroke:#780e5a; stroke-width:2" /></pattern>',
                '<pattern id="fillpattern_8" patternUnits="userSpaceOnUse" width="11" height="11"><path d="M0,0 11,0 M0,5.5 11,5.5 M2.75,0 2.75,5.5 M8.25,5.5 8.25,11" style="fill:none; stroke:#780e5a; stroke-width:1" /></pattern>',
                '<pattern id="fillpattern_9" patternUnits="userSpaceOnUse" width="11" height="11"><path d="M0,0 0,11 M0,11 11,0 M11,0 11,11" style="fill:none; stroke:#780e5a; stroke-width:1" /></pattern>',
                '<pattern id="fillpattern_10" patternUnits="userSpaceOnUse" width="11" height="11"><path d="M0,5.5 5.5,0 M-2,13 13,-2 M5.5,11 11,5.5" style="stroke:red; stroke-width:1" /></pattern>',
                '<pattern id="fillpattern_11" patternUnits="userSpaceOnUse" width="11" height="11"><path d="M0,11 C0,0 11,11 11,0 Z" style="fill:none; stroke:#780e5a; stroke-width:1" /></pattern>',
            ];

			var paletteStroke = [];

			editor.paintBox = paintBox;

				// This sets up alternative dialog boxes. They mostly work the same way as
			// their UI counterparts, expect instead of returning the result, a callback
			// needs to be included that returns the result as its first parameter.
			// In the future we may want to add additional types of dialog boxes, since
			// they should be easy to handle this way.
			(function() {
				$('#dialog_container').draggable({cancel: '#dialog_content, #dialog_buttons *', containment: 'window'});
				var box = $('#dialog_box'),
					btn_holder = $('#dialog_buttons'),
					dialog_content = $('#dialog_content'),
					dbox = function(type, msg, callback, defaultVal, opts, changeCb, checkbox) {
						var ok, ctrl, chkbx;
						dialog_content.html('<p>'+msg.replace(/\n/g, '</p><p>')+'</p>')
							.toggleClass('prompt', (type == 'prompt'));
						btn_holder.empty();

						ok = $('<input type="button" value="' + uiStrings.common.ok + '">').appendTo(btn_holder);

						if (type !== 'alert') {
							$('<input type="button" value="' + uiStrings.common.cancel + '">')
								.appendTo(btn_holder)
								.click(function() { box.hide(); if (callback) {callback(false);}});
						}

						if (type === 'prompt') {
							ctrl = $('<input type="text">').prependTo(btn_holder);
							ctrl.val(defaultVal || '');
							ctrl.bind('keydown', 'return', function() {ok.click();});
						}
						else if (type === 'select') {
							var div = $('<div style="text-align:center;">');
							ctrl = $('<select>').appendTo(div);
							if (checkbox) {
								var label = $('<label>').text(checkbox.label);
								chkbx = $('<input type="checkbox">').appendTo(label);
								chkbx.val(checkbox.value);
								if (checkbox.tooltip) {
									label.attr('title', checkbox.tooltip);
								}
								chkbx.prop('checked', !!checkbox.checked);
								div.append($('<div>').append(label));
							}
							$.each(opts || [], function (opt, val) {
								if (typeof val === 'object') {
									ctrl.append($('<option>').val(val.value).html(val.text));
								}
								else {
									ctrl.append($('<option>').html(val));
								}
							});
							dialog_content.append(div);
							if (defaultVal) {
								ctrl.val(defaultVal);
							}
							if (changeCb) {
								ctrl.bind('change', 'return', changeCb);
							}
							ctrl.bind('keydown', 'return', function() {ok.click();});
						}
						else if (type === 'process') {
							ok.hide();
						}

						box.show();

						ok.click(function() {
							box.hide();
							var resp = (type === 'prompt' || type === 'select') ? ctrl.val() : true;
							if (callback) {
								if (chkbx) {
									callback(resp, chkbx.prop('checked'));
								}
								else {
									callback(resp);
								}
							}
						}).focus();

						if (type === 'prompt' || type === 'select') {
							ctrl.focus();
						}
					};

				$.alert = function(msg, cb) { dbox('alert', msg, cb);};
				$.confirm = function(msg, cb) {	dbox('confirm', msg, cb);};
				$.process_cancel = function(msg, cb) { dbox('process', msg, cb);};
				$.prompt = function(msg, txt, cb) { dbox('prompt', msg, cb, txt);};
				$.select = function(msg, opts, cb, changeCb, txt, checkbox) { dbox('select', msg, cb, txt, opts, changeCb, checkbox);};
			}());

			var setSelectMode = function(idx) {
				var curr = $('.tool_button_current');
				if (curr.length && curr[0].id !== 'tool_select') {
					curr.removeClass('tool_button_current').addClass('tool_button');
					$('#tool_select').addClass('tool_button_current').removeClass('tool_button');
					$('#styleoverrides').text('#svgcanvas svg *{cursor:default;pointer-events:all} #svgcanvas svg{cursor:default}');
				}
                svgCanvas.setMode("select");
				workarea.css('cursor', 'default');

				// console.log('===================================select mode: ' + idx);
			};

			// used to make the flyouts stay on the screen longer the very first time
			// var flyoutspeed = 1250; // Currently unused
			var textBeingEntered = false;
			var selectedElement = null;
			var multiselected = false;
			var editingsource = false;
			var docprops = false;
			var preferences = false;
			var cur_context = '';
			var origTitle = $('title:first').text();
			// Make [1,2,5] array
			var r_intervals = [];
			var i;
			for (i = 0.1; i < 1E5; i *= 10) {
				r_intervals.push(i);
				r_intervals.push(2 * i);
				r_intervals.push(5 * i);
			}

			// This function highlights the layer passed in (by fading out the other layers)
			// if no layer is passed in, this function restores the other layers
			var toggleHighlightLayer = function(layerNameToHighlight) {
				var i, curNames = [], numLayers = svgCanvas.getCurrentDrawing().getNumLayers();
				for (i = 0; i < numLayers; i++) {
					curNames[i] = svgCanvas.getCurrentDrawing().getLayerName(i);
				}

				if (layerNameToHighlight) {
					for (i = 0; i < numLayers; ++i) {
						if (curNames[i] != layerNameToHighlight) {
							svgCanvas.getCurrentDrawing().setLayerOpacity(curNames[i], 0.5);
						}
					}
				} else {
					for (i = 0; i < numLayers; ++i) {
						svgCanvas.getCurrentDrawing().setLayerOpacity(curNames[i], 1.0);
					}
				}
			};

			var populateLayers = function() {
				svgCanvas.clearSelection();
				var layerlist = $('#layerlist tbody').empty();
				var selLayerNames = $('#selLayerNames').empty();
				var drawing = svgCanvas.getCurrentDrawing();
				var currentLayerName = drawing.getCurrentLayerName();
				var layer = svgCanvas.getCurrentDrawing().getNumLayers();
				var icon = $.getSvgIcon('eye');
				var lockicon = $.getSvgIcon('layer_locked');
				// we get the layers in the reverse z-order (the layer rendered on top is listed first)
				while (layer--) {
					var name = drawing.getLayerName(layer);
					var layerTr = $('<tr class="layer">').toggleClass('layersel', name === currentLayerName);
					var layerVis = $('<td class="layervis">').toggleClass('layerinvis', !drawing.getLayerVisibility(name));
					var layerName = $('<td class="layername">' + name + '</td>');
					var layerColor = $('<td class="layercolor" style="background-color:' + drawing.getLayerColor(layer) + ';">' + '</td>');
					var layerLock = $('<td class="layerlock">').toggleClass('layerunlock' , !drawing.getLayerLocked(name));
					layerlist.append(layerTr.append(layerColor , layerVis, layerName , layerLock));
					selLayerNames.append('<option value="' + name + '">' + name + '</option>');
				}
				if (lockicon !== undefined) {
					var copy = lockicon.clone();
					$('td.layerlock', layerlist).append(copy);
					$.resizeSvgIcons({'td.layerlock .svg_icon': 14});
				}
                if (icon !== undefined) {
                    var copy = icon.clone();
                    $('td.layervis', layerlist).append(copy);
                    $.resizeSvgIcons({'td.layervis .svg_icon': 14});
                }
				// handle selection of layer
				$('#layerlist td.layername')
					.mouseup(function(evt) {
						$('#layerlist tr.layer').removeClass('layersel');
						$(this.parentNode).addClass('layersel');
						svgCanvas.setCurrentLayer(this.textContent);
						evt.preventDefault();

						svgCanvas.selectorManager.setSelectorColor(svgCanvas.getCurrentDrawing().getCurrentLayerColor());

						console.log('========================================== change active layer: ' + svgCanvas.getCurrentDrawing().getCurrentLayerColor());
					})
					.mouseover(function() {
						toggleHighlightLayer(this.textContent);
					})
					.mouseout(function() {
						toggleHighlightLayer();
					});
				$('#layerlist td.layervis').click(function() {
					var row = $(this.parentNode).prevAll().length;
					var name = $('#layerlist tr.layer:eq(' + row + ') td.layername').text();
					var vis = $(this).hasClass('layerinvis');
					svgCanvas.setLayerVisibility(name, vis);
					$(this).toggleClass('layerinvis');
				});

				// if there were too few rows, let's add a few to make it not so lonely
				var num = 5 - $('#layerlist tr.layer').size();
				while (num-- > 0) {
					// FIXME: there must a better way to do this
					layerlist.append('<tr><td style="color:white">_</td><td/></tr>');
				}

                $('#layerlist td.layerlock').click(function() {
                    var row = $(this.parentNode).prevAll().length;
                    var name = $('#layerlist tr.layer:eq(' + row + ') td.layername').text();
                    var locked = $(this).hasClass('layerunlock');
                    svgCanvas.setLayerLocked(name, locked);
                    $(this).toggleClass('layerunlock');
                });
			};

			var showSourceEditor = function(e, forSaving) {
				if (editingsource) {return;}

				editingsource = true;
				origSource = svgCanvas.getSvgString();
				$('#save_output_btns').toggle(!!forSaving);
				$('#tool_source_back').toggle(!forSaving);
				$('#svg_source_textarea').val(origSource);
				$('#svg_source_editor').fadeIn();
				$('#svg_source_textarea').focus();
			};

			var togglePathEditMode = function(editmode, elems) {
				$('#path_node_panel').toggle(editmode);
				$('#tools_bottom_2,#tools_bottom_3').toggle(!editmode);
				if (editmode) {
					// Change select icon
					$('.tool_button_current').removeClass('tool_button_current').addClass('tool_button');
					$('#tool_select').addClass('tool_button_current').removeClass('tool_button');
					setIcon('#tool_select', 'select_node');
					multiselected = false;
					if (elems.length) {
						selectedElement = elems[0];
					}
				} else {
					setTimeout(function () {
						setIcon('#tool_select', 'select');
					}, 1000);
				}
			};

			var saveHandler = function(wind, svg) {
				editor.showSaveWarning = false;

				// by default, we add the XML prolog back, systems integrating SVG-edit (wikis, CMSs)
				// can just provide their own custom save handler and might not want the XML prolog
				svg = '<?xml version="1.0"?>\n' + svg;

				// IE9 doesn't allow standalone Data URLs
				// https://connect.microsoft.com/IE/feedback/details/542600/data-uri-images-fail-when-loaded-by-themselves
				if (svgedit.browser.isIE()) {
					showSourceEditor(0, true);
					return;
				}

				// Opens the SVG in new window
				var win = wind.open('data:image/svg+xml;base64,' + Utils.encode64(svg));

				// Alert will only appear the first time saved OR the first time the bug is encountered
				var done = $.pref('save_notice_done');
				if (done !== 'all') {
					var note = uiStrings.notification.saveFromBrowser.replace('%s', 'SVG');

					// Check if FF and has <defs/>
					if (svgedit.browser.isGecko()) {
						if (svg.indexOf('<defs') !== -1) {
							// warning about Mozilla bug #308590 when applicable (seems to be fixed now in Feb 2013)
							note += '\n\n' + uiStrings.notification.defsFailOnSave;
							$.pref('save_notice_done', 'all');
							done = 'all';
						} else {
							$.pref('save_notice_done', 'part');
						}
					} else {
						$.pref('save_notice_done', 'all');
					}
					if (done !== 'part') {
						win.alert(note);
					}
				}
			};

			var exportHandler = function(win, data) {
				var issues = data.issues,
					exportWindowName = data.exportWindowName;

				if (exportWindowName) {
					exportWindow = window.open('', exportWindowName); // A hack to get the window via JSON-able name without opening a new one
				}

				exportWindow.location.href = data.datauri;
				var done = $.pref('export_notice_done');
				if (done !== 'all') {
					var note = uiStrings.notification.saveFromBrowser.replace('%s', data.type);

					// Check if there's issues
					if (issues.length) {
						var pre = '\n \u2022 ';
						note += ('\n\n' + uiStrings.notification.noteTheseIssues + pre + issues.join(pre));
					}

					// Note that this will also prevent the notice even though new issues may appear later.
					// May want to find a way to deal with that without annoying the user
					$.pref('export_notice_done', 'all');
					exportWindow.alert(note);
				}
			};

			var operaRepaint = function() {
				// Repaints canvas in Opera. Needed for stroke-dasharray change as well as fill change
				if (!window.opera) {
					return;
				}
				$('<p/>').hide().appendTo('body').remove();
			};

			function setStrokeOpt(opt, changeElem) {
				var id = opt.id;
				var bits = id.split('_');
				var pre = bits[0];
				var val = bits[1];

				if (changeElem) {
					svgCanvas.setStrokeAttr('stroke-' + pre, val);
				}
				operaRepaint();
				setIcon('#cur_' + pre, id, 20);
				$(opt).addClass('current').siblings().removeClass('current');
			}

			// This is a common function used when a tool has been clicked (chosen)
			// It does several common things:
			// - removes the tool_button_current class from whatever tool currently has it
			// - hides any flyouts
			// - adds the tool_button_current class to the button passed in
			var toolButtonClick = editor.toolButtonClick = function(button, noHiding) {
				if ($(button).hasClass('disabled')) {return false;}
				if ($(button).parent().hasClass('tools_flyout')) {return true;}
				var fadeFlyouts = 'normal';
				if (!noHiding) {
					$('.tools_flyout').fadeOut(fadeFlyouts);
				}
				$('#styleoverrides').text('');
				//workarea.css('cursor', 'auto');
				$('.tool_button_current').removeClass('tool_button_current').addClass('tool_button');
				$(button).addClass('tool_button_current').removeClass('tool_button');
				return true;
			};

			var clickSelect = editor.clickSelect = function() {
				if (toolButtonClick('#tool_select')) {
					svgCanvas.setMode('select');
					$('#styleoverrides').text('#svgcanvas svg *{cursor:default;pointer-events:all}, #svgcanvas svg{cursor:default}');
				}
			};

			var clickSelectNode = editor.clickSelectNode = function()
			{
				if (toolButtonClick('#tool_selectnode')) {
					svgCanvas.setMode('select');
					svgCanvas.setIsDirectToEditPath(true);
					$('#styleoverrides').text('#svgcanvas svg *{cursor:default;pointer-events:all}, #svgcanvas svg{cursor:default}');
				}
			};

			var clickLasso = editor.clickLasso = function()
			{
				if (toolButtonClick("#tool_lasso"))
				{
					console.log('===================================== magic wand tool');

                    toolButtonClick("#tool_lasso");

                    svgCanvas.setMode('select');

					/*
                    if (isRasterizedLayer())
                    {
                        svgCanvas.setMode('lasso');

                        rasterCurrentLayer();

                        toolButtonClick("#tool_lasso");

						$('#lasso_panel').show();
                    }
                    else
                    {
                        $.confirm(uiStrings.notification.QneedRasterSvgToImage, function(ok)
                        {
                            if (ok)
                            {
                                svgCanvas.setMode('lasso');

                                rasterCurrentLayer();

								toolButtonClick("#tool_lasso");

								$('#lasso_panel').show();
                            }
                            else
                            {
                                clickSelect();

                                console.log("==================================================== quick select bbbbbb");
                            }
                        });
                    }

                    console.log("==================================================== lasso select");
                    */
				}
			}

			var clickQuickSelectRect = editor.clickQuickSelectRect = function()
			{
                svgCanvas.setMode('quickselect');

                toolButtonClick("#tool_quickselect_rect");

                svgCanvas.bitmapUtils.setQSelectMode(false);

                return;

                if (toolButtonClick("#tool_quickselect_rect"))
                {
                	if (svgCanvas.getMode() == 'quickselect')
					{
                        toolButtonClick("#tool_quickselect_rect");

                        svgCanvas.bitmapUtils.setQSelectMode(false);
					}
                    else if (isRasterizedLayer())
                    {
                        svgCanvas.setMode('quickselect');

                        rasterCurrentLayer();

                        toolButtonClick("#tool_quickselect_rect");

                        svgCanvas.bitmapUtils.setQSelectMode(false);
                    }
                    else
                    {
                        $.confirm(uiStrings.notification.QneedRasterSvgToImage, function(ok)
                        {
                            if (ok)
                            {
                                svgCanvas.setMode('quickselect');

                                rasterCurrentLayer();

                                toolButtonClick("#tool_quickselect_rect");

                                svgCanvas.bitmapUtils.setQSelectMode(false);
                            }
                            else
                            {
                                clickSelect();

                                console.log("==================================================== quick select aaaaaaaa");
                            }
                        });
                    }

                    console.log("==================================================== quick select 11111111111111");
                }
			}

			var clickQuickSelect = editor.clickQuickSelect = function()
			{
                svgCanvas.setMode('quickselect');

                toolButtonClick("#tool_quickselect");

                svgCanvas.bitmapUtils.setQSelectMode(true);
                return;

				if (toolButtonClick("#tool_quickselect"))
				{
                    if (svgCanvas.getMode() == 'quickselect')
                    {
                        toolButtonClick("#tool_quickselect");

                        svgCanvas.bitmapUtils.setQSelectMode(true);
                    }
                    else if (isRasterizedLayer())
                    {
                        svgCanvas.setMode('quickselect');

                        rasterCurrentLayer();

                        toolButtonClick("#tool_quickselect");

                        svgCanvas.bitmapUtils.setQSelectMode(true);
                    }
                    else
                    {
                        $.confirm(uiStrings.notification.QneedRasterSvgToImage, function(ok)
                        {
                            if (ok)
                            {
                                svgCanvas.setMode('quickselect');

                                rasterCurrentLayer();

								toolButtonClick("#tool_quickselect");

                                svgCanvas.bitmapUtils.setQSelectMode(true);
                            }
                            else
                            {
                                clickSelect();
                            }
                        });
                    }

					console.log("==================================================== quick select");
				}
			}

			var clickSlice = editor.clickSlice = function()
			{
                if (toolButtonClick("#tool_slice"))
                {
                    svgCanvas.setMode('slice');
                }
			}

			var clickSketchpad = editor.clickSketchpad = function()
			{
                if (toolButtonClick("#tool_sketchpad"))
                {
                    svgCanvas.setMode('sketchpad');
                }
			}

			var clickPngtosvg = editor.clickPngtosvg = function()
			{
				if (selectedElement != null)
				{
                    if (selectedElement.tagName == 'image' || selectedElement.tagName == 'g')
                    {
                        // Need to convert
                        svgCanvas.bitmapUtils.img2svg(selectedElement);
                    }
				}
			}

			var clickFlipH = editor.clickFlipH = function()
			{
                if (selectedElement != null)
				{
					svgCanvas.flipElements(false);
				}
			}

			var clickFlipV = editor.clickFlipV = function()
			{
                if (selectedElement != null)
                {
                	svgCanvas.flipElements(true);
                }
			}

			var isRasterizedLayer = editor.isRasterizedLayer = function()
			{
                var drawing = svgCanvas.getCurrentDrawing();

                for (var i = 0 ; i < drawing.current_layer.childNodes.length ; ++i)
				{
                    if (drawing.current_layer.childNodes[i].tagName != 'title' &&
                        drawing.current_layer.childNodes[i].tagName != 'image' &&
                        drawing.current_layer.childNodes[i].tagName != 'g')
                    {
                        return false;
                    }
				}

                return true;
			}

			var rasterCurrentLayer = editor.rasterCurrentLayer = function()
			{
				svgCanvas.preBitmapRaster();

                saveSvgAsBase64(document.getElementById('svgcontent') , 'test.png' , {scale:4} , function(pngData)
				{
                    var drawing = svgCanvas.getCurrentDrawing();
                    while (drawing.current_layer.firstChild)
					{
                        var ch = drawing.current_layer.firstChild;
                        drawing.current_layer.removeChild(ch);
                    }

                    // Add rasterized image
                    var insertNewImage = function(width, height)
                    {
                        var newImage = svgCanvas.addSvgElementFromJson({
                            element: 'image',
                            attr: {
                                x: 0,
                                y: 0,
                                width: width,
                                height: height,
                                id: svgCanvas.getNextId(),
                                style: 'pointer-events:inherit;cursor:default'
                            }
                        });
                        svgCanvas.setHref(newImage, pngData);

                        //svgCanvas.svgcontent.appendChild(newImage);
                        //svgCanvas.selectOnly([newImage] , true);
                    };
                    // create dummy img so we know the default dimensions
                    var imgWidth = 100;
                    var imgHeight = 100;
                    var img = new Image();
                    img.src = pngData;
                    img.style.opacity = 0;
                    insertNewImage(svgCanvas.contentW , svgCanvas.contentH);

                    updateContextPanel();
                    populateLayers();
                });

                /*
                var imgType = 'PNG';
                var quality = parseInt($('#image-slider').val(), 100)/100;
                svgCanvas.rasterExport(imgType, quality, undefined  , function(pngData)
                {
                    var drawing = svgCanvas.getCurrentDrawing();
                    while (drawing.current_layer.firstChild) {
                        var ch = drawing.current_layer.firstChild;
                        drawing.current_layer.removeChild(ch);
                    }

                    // Add rasterized image
                    var insertNewImage = function(width, height)
                    {
                        var newImage = svgCanvas.addSvgElementFromJson({
                            element: 'image',
                            attr: {
                                x: 0,
                                y: 0,
                                width: width,
                                height: height,
                                id: svgCanvas.getNextId(),
                                style: 'pointer-events:inherit'
                            }
                        });
                        svgCanvas.setHref(newImage, pngData);

                        //svgCanvas.svgcontent.appendChild(newImage);
                        //svgCanvas.selectOnly([newImage] , true);
                    };
                    // create dummy img so we know the default dimensions
                    var imgWidth = 100;
                    var imgHeight = 100;
                    var img = new Image();
                    img.src = pngData;
                    img.style.opacity = 0;
                    insertNewImage(svgCanvas.contentW , svgCanvas.contentH);

                    updateContextPanel();
                    populateLayers();
                });
				*/
			}

			var clickColorPicker = editor.clickColorPicker = function()
			{
				if (toolButtonClick("#tool_colorpicker"))
				{
					svgCanvas.setMode('colorpicker');

					toolButtonClick("#tool_colorpicker");

					svgCanvas.bitmapUtils.prepareColorPickData();
				}
			}

            var clickFillColor = editor.clickFillColor = function()
            {
                console.log("=======================================  click fill color");
                $('#tool_cp_stroke_color').css('z-index' ,2);
                $('#tool_cp_fill_color').css('z-index' ,3);

                colorPicker_new('fill');
                updateToolButtonState();
            }

            var clickStrokeColor = editor.clickStrokeColor = function()
            {
                console.log("=======================================  click stroke color");
                $('#tool_cp_stroke_color').css('z-index' ,3);
                $('#tool_cp_fill_color').css('z-index' ,2);

                colorPicker_new('stroke');
                updateToolButtonState();
            }

            var clickSwitchStrokeFill = editor.clickSwitchStrokeFill = function()
			{
				var fillColor = paintBox['fill'].getColor();
				var fillOpacity = paintBox['fill'].getOpacity();
				var strokeColor = paintBox['stroke'].getColor();
				var strokeOpacity = paintBox['stroke'].getOpacity();

                paintBox['fill'].setPaint(new $.jGraduate.Paint({alpha: parseInt(strokeOpacity), solidColor: strokeColor == 'none' ? 'ffffff':strokeColor}) , true);
                paintBox['stroke'].setPaint(new $.jGraduate.Paint({alpha:  parseInt(fillOpacity), solidColor: fillColor == 'none' ? 'ffffff' : fillColor}) , true);

                paintBox['fill'].update(true);
                paintBox['stroke'].update(true);

                svgCanvas.setPaintOpacity('fill', strokeOpacity * 0.01, true);
                svgCanvas.setColor('fill', strokeColor == 'none' ? 'ffffff':strokeColor);
                svgCanvas.setPaintOpacity('stroke', fillOpacity * 0.01, true);
                svgCanvas.setColor('stroke', fillColor == 'none' ? 'ffffff' : fillColor);

                updateToolButtonState();
			}

			var clickEraser = editor.clickEraser = function()
			{
                if (toolButtonClick("#tool_eraser"))
				{
                    svgCanvas.setMode('eraser');

                    toolButtonClick("#tool_eraser");

                    $('#eraser_panel').show();
				}

				return;


				if (toolButtonClick("#tool_eraser"))
				{
					if (isRasterizedLayer())
					{
                        svgCanvas.setMode('eraser');


						rasterCurrentLayer();



                        toolButtonClick("#tool_eraser");

						$('#eraser_panel').show();


					}
					else
					{
                        $.confirm(uiStrings.notification.QneedRasterSvgToImage, function(ok)
                        {
                            if (ok)
                            {
                                svgCanvas.setMode('eraser');



                                rasterCurrentLayer();



								toolButtonClick("#tool_eraser");

								$('#eraser_panel').show();


                            }
                            else
							{
								clickSelect();
							}
                        });
					}
				}
			}

			var setImageURL = editor.setImageURL = function(url) {
				if (!url) {
					url = defaultImageURL;
				}
				svgCanvas.setImageURL(url);
				//$('#image_url').val(url);

				if (url.indexOf('data:') === 0) {
					// data URI found
					$('#image_url').hide();
					$('#change_image_url').show();
				} else {
					// regular URL
					svgCanvas.embedImage(url, function(dataURI) {
						// Couldn't embed, so show warning
						$('#url_notice').toggle(!dataURI);
						defaultImageURL = url;
					});
					$('#image_url').show();
					$('#change_image_url').hide();
				}
			};

			function setBackground (color, url) {
				// if (color == $.pref('bkgd_color') && url == $.pref('bkgd_url')) {return;}
				$.pref('bkgd_color', color);
				$.pref('bkgd_url', url);

				// This should be done in svgcanvas.js for the borderRect fill
				svgCanvas.setBackground(color, url);
			}

			function promptImgURL() {
				var curhref = svgCanvas.getHref(selectedElement);
				curhref = curhref.indexOf('data:') === 0 ? '' : curhref;
				$.prompt(uiStrings.notification.enterNewImgURL, curhref, function(url) {
					if (url) {setImageURL(url);}
				});
			}

			var setInputWidth = function(elem) {
				var w = Math.min(Math.max(12 + elem.value.length * 6, 50), 300);
				$(elem).width(w);
			};

			var updateRulers = function (scanvas, zoom) {
				if (!zoom) {zoom = svgCanvas.getZoom();}
				if (!scanvas) {scanvas = $('#svgcanvas');}

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
							ctx.fillText(label, ruler_d+2, 8);
						} else {
							// draw label vertically
							var str = String(label).split('');
							for (i = 0; i < str.length; i++) {
								ctx.fillText(str[i], 1, (ruler_d+9) + i*9);
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

			var updateCanvas = editor.updateCanvas = function(center, new_ctr) {
				var w = workarea.width(), h = workarea.height();
				var w_orig = w, h_orig = h;
				var zoom = svgCanvas.getZoom();
				var w_area = workarea;
				var cnvs = $('#svgcanvas');
				var old_ctr = {
					x: w_area[0].scrollLeft + w_orig/2,
					y: w_area[0].scrollTop + h_orig/2
				};
				var multi = curConfig.canvas_expansion;
				w = Math.max(w_orig, svgCanvas.contentW * zoom * multi);
				h = Math.max(h_orig, svgCanvas.contentH * zoom * multi);

				workarea.css('right' , '162px');

				if (w == w_orig && h == h_orig) {
					workarea.css('overflow', 'hidden');
				} else {
					workarea.css('overflow', 'scroll');
				}

				workarea.css('overflow', 'hidden');
				var old_can_y = cnvs.height()/2;
				var old_can_x = cnvs.width()/2;
				cnvs.width(w).height(h);
				var new_can_y = h/2;
				var new_can_x = w/2;
				var offset = svgCanvas.updateCanvas(w, h);

				var ratio = new_can_x / old_can_x;

				var scroll_x = w/2 - w_orig/2;
				var scroll_y = h/2 - h_orig/2;

				if (!new_ctr) {
					var old_dist_x = old_ctr.x - old_can_x;
					var new_x = new_can_x + old_dist_x * ratio;

					var old_dist_y = old_ctr.y - old_can_y;
					var new_y = new_can_y + old_dist_y * ratio;

					new_ctr = {
						x: new_x,
						y: new_y
					};
				} else {
					new_ctr.x += offset.x;
					new_ctr.y += offset.y;
				}

				if (center) {
					// Go to top-left for larger documents
					if (svgCanvas.contentW > w_area.width()) {
						// Top-left
						workarea[0].scrollLeft = offset.x - 10;
						workarea[0].scrollTop = offset.y - 10;
					} else {
						// Center
						w_area[0].scrollLeft = scroll_x;
						w_area[0].scrollTop = scroll_y;
					}
				} else {

					console.log("========================= " + svgCanvas.contentW + "," + w_area.width());
					w_area[0].scrollLeft = new_ctr.x - w_orig/2;
					w_area[0].scrollTop = new_ctr.y - h_orig/2;
				}
				if (curConfig.showRulers) {
					updateRulers(cnvs, zoom);
					workarea.scroll();
				}
				if (urldata.storagePrompt !== true && !editor.storagePromptClosed) {
					$('#dialog_box').hide();
				}

                var width = $('#canvas_width_side').val();
                var height = $('#canvas_height_side').val();

				if (Math.abs(Math.round(svgCanvas.getResolution().w) ,width) > 1 ||
                    Math.abs(Math.round(svgCanvas.getResolution().h) , height) > 1)
				{
                    $('#canvas_width_side').val(Math.round(svgCanvas.getResolution().w));
                    $('#canvas_height_side').val(Math.round(svgCanvas.getResolution().h));
				}
			};

			var updateToolButtonState = function() {
				var index, button;
				var bNoFill = (svgCanvas.getColor('fill') == 'none');
				var bNoStroke = (svgCanvas.getColor('stroke') == 'none');
				var buttonsNeedingStroke = [ '#tool_fhpath', '#tool_line' ];
				var buttonsNeedingFillAndStroke = [ '#tools_rect .tool_button', '#tools_ellipse .tool_button', '#tool_text', '#tool_path'];
				if (bNoStroke) {
					for (index in buttonsNeedingStroke) {
						button = buttonsNeedingStroke[index];
						if ($(button).hasClass('tool_button_current')) {
							clickSelect();
						}
						$(button).addClass('disabled');
					}
				} else {
					for (index in buttonsNeedingStroke) {
						button = buttonsNeedingStroke[index];
						$(button).removeClass('disabled');
					}
				}

				if (bNoStroke && bNoFill) {
					for (index in buttonsNeedingFillAndStroke) {
						button = buttonsNeedingFillAndStroke[index];
						if ($(button).hasClass('tool_button_current')) {
							clickSelect();
						}
						$(button).addClass('disabled');
					}
				} else {
					for (index in buttonsNeedingFillAndStroke) {
						button = buttonsNeedingFillAndStroke[index];
						$(button).removeClass('disabled');
					}
				}

				svgCanvas.runExtensions('toolButtonStateUpdate', {
					nofill: bNoFill,
					nostroke: bNoStroke
				});

				// Disable flyouts if all inside are disabled
				$('.tools_flyout').each(function() {
					var shower = $('#' + this.id + '_show');
					var has_enabled = false;
					$(this).children().each(function() {
						if (!$(this).hasClass('disabled')) {
							has_enabled = true;
						}
					});
					shower.toggleClass('disabled', !has_enabled);
				});

				operaRepaint();
			};

			// Updates the toolbar (colors, opacity, etc) based on the selected element
			// This function also updates the opacity and id elements that are in the context panel
			var updateToolbar = function() {
				var i, len;
				if (selectedElement != null) {
					switch (selectedElement.tagName) {
					case 'use':
					case 'image':
					case 'foreignObject':
						break;
					case 'g':
					case 'a':
						// Look for common styles
						var gWidth = null;
						var childs = selectedElement.getElementsByTagName('*');
						for (i = 0, len = childs.length; i < len; i++) {
							var swidth = childs[i].getAttribute('stroke-width');

							if (i === 0) {
								gWidth = swidth;
							} else if (gWidth !== swidth) {
								gWidth = null;
							}
						}

						$('#stroke_width').val(gWidth === null ? '' : gWidth);

						paintBox.fill.update(true);
						paintBox.stroke.update(true);

						break;
					default:
						paintBox.fill.update(true);
						paintBox.stroke.update(true);

						$('#stroke_width').val(selectedElement.getAttribute('stroke-width') || 1);
						$('#stroke_style').val(selectedElement.getAttribute('stroke-dasharray') || 'none');

						var attr = selectedElement.getAttribute('stroke-linejoin') || 'miter';

						if ($('#linejoin_' + attr).length != 0) {
							setStrokeOpt($('#linejoin_' + attr)[0]);
						}

						attr = selectedElement.getAttribute('stroke-linecap') || 'butt';

						if ($('#linecap_' + attr).length != 0) {
							setStrokeOpt($('#linecap_' + attr)[0]);
						}
					}
				}

				// All elements including image and group have opacity
				if (selectedElement != null) {
					var opac_perc = ((selectedElement.getAttribute('opacity')||1.0)*100);
					$('#group_opacity').val(opac_perc);
					$('#opac_slider').slider('option', 'value', opac_perc);
					$('#elem_id').val(selectedElement.id);
					$('#elem_class').val(selectedElement.getAttribute("class"));
				}

				updateToolButtonState();
			};

			// updates the context panel tools based on the selected element
			var updateContextPanel = function() {
				var elem = selectedElement;
				// If element has just been deleted, consider it null
				if (elem != null && !elem.parentNode) {elem = null;}
				var currentLayerName = svgCanvas.getCurrentDrawing().getCurrentLayerName();
				var currentMode = svgCanvas.getMode();
				var unit = curConfig.baseUnit !== 'px' ? curConfig.baseUnit : null;

				var is_node = currentMode == 'pathedit'; //elem ? (elem.id && elem.id.indexOf('pathpointgrip') == 0) : false;
				var menu_items = $('#cmenu_canvas li');
				$('#selected_panel, #multiselected_panel, #g_panel, #rect_panel, #circle_panel,'+
					'#ellipse_panel, #line_panel, #text_panel, #image_panel, #container_panel,'+
					' #use_panel, #a_panel').hide();

                $('#tool_pngtosvg').toggleClass('disabled', true);
                $('#tool_flip_v').toggleClass('disabled', true);
                $('#tool_flip_h').toggleClass('disabled', true);

				if (elem != null)
				{
                    $('#tool_pngtosvg').toggleClass('disabled', false);
                    $('#tool_flip_v').toggleClass('disabled', false);
                    $('#tool_flip_h').toggleClass('disabled', false);

					var elname = elem.nodeName;
					// If this is a link with no transform and one child, pretend
					// its child is selected
//					if (elname === 'a') { // && !$(elem).attr('transform')) {
//						elem = elem.firstChild;
//					}

					var angle = svgCanvas.getRotationAngle(elem);
					$('#angle').val(angle);

					var blurval = svgCanvas.getBlur(elem);
					$('#blur').val(blurval);
					$('#blur_slider').slider('option', 'value', blurval);

					if (svgCanvas.addedNew) {
						if (elname === 'image') {
							// Prompt for URL if not a data URL
							if (svgCanvas.getHref(elem).indexOf('data:') !== 0)
							{
								//promptImgURL();
							}
						} /*else if (elname == 'text') {
							// TODO: Do something here for new text
						}*/
					}

					if (!is_node && currentMode != 'pathedit') {
						$('#selected_panel').show();
						// Elements in this array already have coord fields
						if (['line', 'circle', 'ellipse'].indexOf(elname) >= 0) {
							$('#xy_panel').hide();
						} else {
							var x, y;

							// Get BBox vals for g, polyline and path
							if (['g', 'polyline', 'path'].indexOf(elname) >= 0) {
								var bb = svgCanvas.getStrokedBBox([elem]);
								if (bb) {
									x = bb.x;
									y = bb.y;
								}
							} else {
								x = elem.getAttribute('x');
								y = elem.getAttribute('y');
							}

							if (unit) {
								x = svgedit.units.convertUnit(x);
								y = svgedit.units.convertUnit(y);
							}

							$('#selected_x').val(x || 0);
							$('#selected_y').val(y || 0);
							$('#xy_panel').show();
						}

						// Elements in this array cannot be converted to a path
						var no_path = ['image', 'text', 'path', 'g', 'use'].indexOf(elname) == -1;
						$('#tool_topath').toggle(no_path);
						$('#tool_reorient').toggle(elname === 'path');
						$('#tool_reorient').toggleClass('disabled', angle === 0);
					} else {
						var point = path.getNodePoint();
						$('#tool_add_subpath').removeClass('push_button_pressed').addClass('tool_button');
						$('#tool_node_delete').toggleClass('disabled', !path.canDeleteNodes);

						// Show open/close button based on selected point
						setIcon('#tool_openclose_path', path.closed_subpath ? 'open_path' : 'close_path');

						if (point) {
							var seg_type = $('#seg_type');
							if (unit) {
								point.x = svgedit.units.convertUnit(point.x);
								point.y = svgedit.units.convertUnit(point.y);
							}
							$('#path_node_x').val(point.x);
							$('#path_node_y').val(point.y);
							if (point.type) {
								seg_type.val(point.type).removeAttr('disabled');
							} else {
								seg_type.val(4).attr('disabled', 'disabled');
							}
						}
						return;
					}

					// update contextual tools here
					var panels = {
						g: [],
						a: [],
						rect: ['rx', 'width', 'height'],
						image: ['width', 'height'],
						circle: ['cx', 'cy', 'r'],
						ellipse: ['cx', 'cy', 'rx', 'ry'],
						line: ['x1', 'y1', 'x2', 'y2'],
						text: [],
						use: []
					};

					var el_name = elem.tagName;

//					if ($(elem).data('gsvg')) {
//						$('#g_panel').show();
//					}

					var link_href = null;
					if (el_name === 'a') {
						link_href = svgCanvas.getHref(elem);
						$('#g_panel').show();
					}

					if (elem.parentNode.tagName === 'a') {
						if (!$(elem).siblings().length) {
							$('#a_panel').show();
							link_href = svgCanvas.getHref(elem.parentNode);
						}
					}

					// Hide/show the make_link buttons
					$('#tool_make_link, #tool_make_link').toggle(!link_href);

					if (link_href) {
						$('#link_url').val(link_href);
					}

					if (panels[el_name]) {
						var cur_panel = panels[el_name];

						$('#' + el_name + '_panel').show();

						$.each(cur_panel, function(i, item) {
							var attrVal = elem.getAttribute(item);
							if (curConfig.baseUnit !== 'px' && elem[item]) {
								var bv = elem[item].baseVal.value;
								attrVal = svgedit.units.convertUnit(bv);
							}
							$('#' + el_name + '_' + item).val(attrVal || 0);
						});

						if (el_name == 'text') {
							$('#text_panel').css('display', 'inline');
							if (svgCanvas.getItalic()) {
								$('#tool_italic').addClass('push_button_pressed').removeClass('tool_button');
							} else {
								$('#tool_italic').removeClass('push_button_pressed').addClass('tool_button');
							}
							if (svgCanvas.getBold()) {
								$('#tool_bold').addClass('push_button_pressed').removeClass('tool_button');
							} else {
								$('#tool_bold').removeClass('push_button_pressed').addClass('tool_button');
							}
							$('#font_family').val(elem.getAttribute('font-family'));
							$('#font_size').val(elem.getAttribute('font-size'));
							$('#text').val(elem.textContent);
							if (svgCanvas.addedNew) {
								// Timeout needed for IE9
								setTimeout(function() {
									$('#text').focus().select();
								}, 100);
							}
						} // text
						else if (el_name == 'image') {
							setImageURL(svgCanvas.getHref(elem));
						} // image
						else if (el_name === 'g' || el_name === 'use') {
							$('#container_panel').show();
							var title = svgCanvas.getTitle();
							var label = $('#g_title')[0];
							label.value = title;
							setInputWidth(label);
							$('#g_title').prop('disabled', el_name == 'use');
						}
					}
					menu_items[(el_name === 'g' ? 'en' : 'dis') + 'ableContextMenuItems']('#ungroup');
					menu_items[((el_name === 'g' || !multiselected) ? 'dis' : 'en') + 'ableContextMenuItems']('#group');

                    var isAllPath = true;
                    if (selectedElement != null)
                    {
                        for (var i = 0 ; i < selectedElement.length ; ++i)
                        {
                            if (selectedElement[i].tagName != 'path')
                            {
                                isAllPath = false;
                                break;
                            }
                        }
                    }
                    else
                    {
                        isAllPath = false;
                    }
                    menu_items[(!isAllPath ? 'dis' : 'en') + 'ableContextMenuItems']('#svggroup');
				} // if (elem != null)
				else if (multiselected) {
					$('#multiselected_panel').show();
                    var isAllPath = true;
                    if (selectedElement != null)
					{
                        for (var i = 0 ; i < selectedElement.length ; ++i)
                        {
                            if (selectedElement[i].tagName != 'path')
                            {
                                isAllPath = false;
                                break;
                            }
                        }
					}
					else
					{
                        isAllPath = false;
					}

                    if (isAllPath)
					{
                        menu_items
                            .enableContextMenuItems('#group')
                            .enableContextMenuItems('#svggroup')
                            .disableContextMenuItems('#ungroup');
					}
					else
					{
                        menu_items
                            .enableContextMenuItems('#group')
                            .disableContextMenuItems('#ungroup');
					}
				} else {
					menu_items.disableContextMenuItems('#delete,#cut,#copy,#group,#ungroup,#svggroup,#move_front,#move_up,#move_down,#move_back');
				}

				// update history buttons
				$('#tool_undo').toggleClass('disabled', undoMgr.getUndoStackSize() === 0);
				$('#tool_redo').toggleClass('disabled', undoMgr.getRedoStackSize() === 0);

				svgCanvas.addedNew = false;

				if ( (elem && !is_node)	|| multiselected) {
					// update the selected elements' layer
					$('#selLayerNames').removeAttr('disabled').val(currentLayerName);

					// Enable regular menu options
					canv_menu.enableContextMenuItems('#delete,#cut,#copy,#move_front,#move_up,#move_down,#move_back');
				} else {
					$('#selLayerNames').attr('disabled', 'disabled');
				}
			};

			var updateWireFrame = function() {
				// Test support
				if (supportsNonSS) {return;}

				var rule = '#workarea.wireframe #svgcontent * { stroke-width: ' + 1/svgCanvas.getZoom() + 'px; }';
				$('#wireframe_rules').text(workarea.hasClass('wireframe') ? rule : '');
			};

			var updateTitle = function(title) {
				title = title || svgCanvas.getDocumentTitle();
				var newTitle = origTitle + (title ? ': ' + title : '');

				// Remove title update with current context info, isn't really necessary
//				if (cur_context) {
//					new_title = new_title + cur_context;
//				}
				$('title:first').text(newTitle);
			};

			// called when we've selected a different element
			var selectedChanged = function(win, elems) {
				var mode = svgCanvas.getMode();
				if (mode === 'select') {
					setSelectMode(1);
				}
				var is_node = (mode == "pathedit");
				// if elems[1] is present, then we have more than one element
				selectedElement = (elems.length === 1 || elems[1] == null ? elems[0] : null);
				multiselected = (elems.length >= 2 && elems[1] != null);
				if (selectedElement != null) {
					// unless we're already in always set the mode of the editor to select because
					// upon creation of a text element the editor is switched into
					// select mode and this event fires - we need our UI to be in sync

					if (!is_node) {
						updateToolbar();
					}
				} // if (elem != null)

				// Deal with pathedit mode
				togglePathEditMode(is_node, elems);
				updateContextPanel();
				svgCanvas.runExtensions('selectedChanged', {
					elems: elems,
					selectedElement: selectedElement,
					multiselected: multiselected
				});
			};

			// Call when part of element is in process of changing, generally
			// on mousemove actions like rotate, move, etc.
			var elementTransition = function(win, elems) {
				var mode = svgCanvas.getMode();
				var elem = elems[0];

				if (!elem) {
					return;
				}

				multiselected = (elems.length >= 2 && elems[1] != null);
				// Only updating fields for single elements for now
				if (!multiselected) {
					switch (mode) {
						case 'rotate':
							var ang = svgCanvas.getRotationAngle(elem);
							$('#angle').val(ang);
							$('#tool_reorient').toggleClass('disabled', ang === 0);
							break;

						// TODO: Update values that change on move/resize, etc
//						case "select":
//						case "resize":
//							break;
					}
				}
				svgCanvas.runExtensions('elementTransition', {
					elems: elems
				});
			};

			// called when any element has changed
			var elementChanged = function(win, elems) {
				var i,
					mode = svgCanvas.getMode();
				if (mode === 'select') {
					setSelectMode(1);
				}

				for (i = 0; i < elems.length; ++i) {
					var elem = elems[i];

					// if the element changed was the svg, then it could be a resolution change
					if (elem && elem.tagName === 'svg') {
						populateLayers();
						updateCanvas();
					}
					// Update selectedElement if element is no longer part of the image.
					// This occurs for the text elements in Firefox
					else if (elem && selectedElement && selectedElement.parentNode == null) {
//						|| elem && elem.tagName == "path" && !multiselected) { // This was added in r1430, but not sure why
						selectedElement = elem;
					}
				}

            editor.showSaveWarning = true;

				// we update the contextual panel with potentially new
                // positional/sizing information (we DON'T want to update the
                // toolbar here as that creates an infinite loop)
                // also this updates the history buttons

                // we tell it to skip focusing the text control if the
                // text element was previously in focus
                updateContextPanel();

				// In the event a gradient was flipped:
				if (selectedElement && mode === 'select') {
					paintBox.fill.update();
					paintBox.stroke.update();
				}

				svgCanvas.runExtensions('elementChanged', {
					elems: elems
				});
			};

			var zoomDone = function() {
				updateWireFrame();
				// updateCanvas(); // necessary?
			};

			var zoomChanged = svgCanvas.zoomChanged = function(win, bbox, autoCenter) {
                if (bbox.isAbsolute)
				{
                    svgCanvas.transformCanvasZoom(bbox.evt , bbox.x , bbox.y , 0 , 0 , bbox.zoom , true , true);
				}
				else
				{
                    svgCanvas.transformCanvasZoom(bbox.evt , bbox.x , bbox.y , 0 , 0 , bbox.width , true , false);
				}
			};

			changeZoom = function(ctl) {
				var zoomlevel = ctl.value / 100;
				if (zoomlevel < 0.001) {
					ctl.value = 0.1;
					return;
				}
				var zoom = svgCanvas.getZoom();
				var w_area = workarea;

				zoomChanged(window, {
					evt : null,
					width: 0,
					height: 0,
					x: 0,
					y: 0,
					factor : true ,
					zoom : zoomlevel,
					isAbsolute : true
				}, true);
			};

			$('#cur_context_panel').delegate('a', 'click', function() {
				var link = $(this);
				if (link.attr('data-root')) {
					svgCanvas.leaveContext();
				} else {
					svgCanvas.setContext(link.text());
				}
				svgCanvas.clearSelection();
				return false;
			});

			var contextChanged = function(win, context) {
				var link_str = '';
				if (context) {
					var str = '';
					link_str = '<a href="#" data-root="y">' + svgCanvas.getCurrentDrawing().getCurrentLayerName() + '</a>';

					$(context).parentsUntil('#svgcontent > g').andSelf().each(function() {
						if (this.id) {
							str += ' > ' + this.id;
							if (this !== context) {
								link_str += ' > <a href="#">' + this.id + '</a>';
							} else {
								link_str += ' > ' + this.id;
							}
						}
					});

					cur_context = str;
				} else {
					cur_context = null;
				}
				$('#cur_context_panel').toggle(!!context).html(link_str);

				updateTitle();
			};

			// Makes sure the current selected paint is available to work with
			var prepPaints = function() {
				paintBox.fill.prep();
				paintBox.stroke.prep();
			};

			var flyout_funcs = {};

			var setFlyoutTitles = function() {
				$('.tools_flyout').each(function() {
					var shower = $('#' + this.id + '_show');
					if (shower.data('isLibrary')) {
						return;
					}

					var tooltips = [];
					$(this).children().each(function() {
						tooltips.push(this.title);
					});
					shower[0].title = tooltips.join(' / ');
				});
			};

			var setFlyoutPositions = function() {
				$('.tools_flyout').each(function() {
					var shower = $('#' + this.id + '_show');
					var pos = shower.offset();
					var w = shower.outerWidth();
					$(this).css({left: (pos.left + w) * editor.tool_scale, top: pos.top});
				});
			};

			var setupFlyouts = function(holders) {
				$.each(holders, function(hold_sel, btn_opts) {
					var buttons = $(hold_sel).children();
					var show_sel = hold_sel + '_show';
					var shower = $(show_sel);
					var def = false;
					buttons.addClass('tool_button')
						.unbind('click mousedown mouseup') // may not be necessary
						.each(function(i) {
							// Get this buttons options
							var opts = btn_opts[i];

							// Remember the function that goes with this ID
							flyout_funcs[opts.sel] = function()
							{
								if (opts.checklock)
								{
									if (svgCanvas.getCurrentDrawing().getCurrentLayerLocked() == false)
									{
										opts.fn();
									}
								}
								else
								{
									opts.fn();
								}
							}

							if (opts.isDefault) {def = i;}

							// Clicking the icon in flyout should set this set's icon
							var func = function(event) {
								var options = opts;
								//find the currently selected tool if comes from keystroke
								if (event.type === 'keydown') {
									var flyoutIsSelected = $(options.parent + '_show').hasClass('tool_button_current');
									var currentOperation = $(options.parent + '_show').attr('data-curopt');
									$.each(holders[opts.parent], function(i, tool) {
										if (tool.sel == currentOperation) {
											if (!event.shiftKey || !flyoutIsSelected) {
												options = tool;
											} else {
												options = holders[opts.parent][i+1] || holders[opts.parent][0];
											}
										}
									});
								}
								if ($(this).hasClass('disabled')) {return false;}
								if (toolButtonClick(show_sel)) {
									options.fn();
								}
								var icon;
								if (options.icon) {
									icon = $.getSvgIcon(options.icon, true);
								} else {
									icon = $(options.sel).children().eq(0).clone();
								}

								if (icon != undefined)
								{
                                    icon[0].setAttribute('width', shower.width());
                                    icon[0].setAttribute('height', shower.height());
								}

								shower.children(':not(.flyout_arrow_horiz)').remove();
								shower.append(icon).attr('data-curopt', options.sel); // This sets the current mode
							};

							$(this).mouseup(func);

							if (opts.key) {
								$(document).bind('keydown', opts.key[0] + ' shift+' + opts.key[0], func);
							}
						});

					if (def) {
						shower.attr('data-curopt', btn_opts[def].sel);
					} else if (!shower.attr('data-curopt')) {
						// Set first as default
						shower.attr('data-curopt', btn_opts[0].sel);
					}

					var timer;
					var pos = $(show_sel).position();

					// Clicking the "show" icon should set the current mode
					shower.mousedown(function(evt) {
						if (shower.hasClass('disabled')) {
							return false;
						}
						var holder = $(hold_sel);
						var l = pos.left + 34;
						var w = holder.width() * -1;
						var time = 0;//holder.data('shown_popop') ? 200 : 0;
						timer = setTimeout(function() {
							// Show corresponding menu
							if (!shower.data('isLibrary')) {
								holder.css('left', w).show().animate({
									left: l
								}, 150);
							} else {
								holder.css('left', l).show();
							}
							holder.data('shown_popop', true);
						},time);
						evt.preventDefault();
					}).mouseup(function(evt)
					{
						/*
						clearTimeout(timer);
						var opt = $(this).attr('data-curopt');
						// Is library and popped up, so do nothing
						if (shower.data('isLibrary') && $(show_sel.replace('_show', '')).is(':visible')) {
							toolButtonClick(show_sel, true);
							return;
						}
						if (toolButtonClick(show_sel) && flyout_funcs[opt]) {
							flyout_funcs[opt]();
						}
						*/
					});
					// $('#tools_rect').mouseleave(function(){$('#tools_rect').fadeOut();});
				});
				setFlyoutTitles();
				setFlyoutPositions();
			};

			var makeFlyoutHolder = function(id, child) {
				var div = $('<div>', {
					'class': 'tools_flyout',
					id: id
				}).appendTo('#svg_editor').append(child);

				return div;
			};

			var uaPrefix = (function() {
				var prop;
				var regex = /^(Moz|Webkit|Khtml|O|ms|Icab)(?=[A-Z])/;
				var someScript = document.getElementsByTagName('script')[0];
				for (prop in someScript.style) {
					if (regex.test(prop)) {
						// test is faster than match, so it's better to perform
						// that on the lot and match only when necessary
						return prop.match(regex)[0];
					}
				}
				// Nothing found so far?
				if ('WebkitOpacity' in someScript.style) {return 'Webkit';}
				if ('KhtmlOpacity' in someScript.style) {return 'Khtml';}

				return '';
			}());

			var scaleElements = function(elems, scale) {
				// var prefix = '-' + uaPrefix.toLowerCase() + '-'; // Currently unused
				var sides = ['top', 'left', 'bottom', 'right'];

				elems.each(function() {
					// Handled in CSS
					// this.style[uaPrefix + 'Transform'] = 'scale(' + scale + ')';
					var i;
					var el = $(this);
					var w = el.outerWidth() * (scale - 1);
					var h = el.outerHeight() * (scale - 1);
					// var margins = {}; // Currently unused

					for (i = 0; i < 4; i++) {
						var s = sides[i];
						var cur = el.data('orig_margin-' + s);
						if (cur == null) {
							cur = parseInt(el.css('margin-' + s), 10);
							// Cache the original margin
							el.data('orig_margin-' + s, cur);
						}
						var val = cur * scale;
						if (s === 'right') {
							val += w;
						} else if (s === 'bottom') {
							val += h;
						}

						el.css('margin-' + s, val);
						// el.css('outline', '1px solid red');
					}
				});
			};

			var setIconSize = editor.setIconSize = function (size) {

//				var elems = $('.tool_button, .push_button, .tool_button_current, .disabled, .icon_label, #url_notice, #tool_open');
				var sel_toscale = '#tools_top .toolset, #editor_panel > *, #history_panel > *,'+
'				#main_button, #tools_left > *, #path_node_panel > *, #multiselected_panel > *,'+
'				#g_panel > *, #tool_font_size > *, .tools_flyout';

				var elems = $(sel_toscale);
				var scale = 1;

				if (typeof size === 'number') {
					scale = size;
				} else {
					var icon_sizes = {s: 0.75, m:1, l: 1.25, xl: 1.5};
					scale = icon_sizes[size];
				}

				editor.tool_scale = scale;

				setFlyoutPositions();
				// $('.tools_flyout').each(function() {
//					var pos = $(this).position();
//					console.log($(this), pos.left+(34 * scale));
//					$(this).css({'left': pos.left+(34 * scale), 'top': pos.top+(77 * scale)});
//					console.log('l', $(this).css('left'));
//				});

//				var scale = .75;

				var hidden_ps = elems.parents(':hidden');
				hidden_ps.css('visibility', 'hidden').show();
				scaleElements(elems, scale);
				hidden_ps.css('visibility', 'visible').hide();
//				return;

				$.pref('iconsize', size);
				$('#iconsize').val(size);

				// Change icon size
//				$('.tool_button, .push_button, .tool_button_current, .disabled, .icon_label, #url_notice, #tool_open')
//				.find('> svg, > img').each(function() {
//					this.setAttribute('width',size_num);
//					this.setAttribute('height',size_num);
//				});
//
//				$.resizeSvgIcons({
//					'.flyout_arrow_horiz > svg, .flyout_arrow_horiz > img': size_num / 5,
//					'#logo > svg, #logo > img': size_num * 1.3,
//					'#tools_bottom .icon_label > *': (size_num === 16 ? 18 : size_num * .75)
//				});
//				if (size != 's') {
//					$.resizeSvgIcons({'#layerbuttons svg, #layerbuttons img': size_num * .6});
//				}

				// Note that all rules will be prefixed with '#svg_editor' when parsed
				var cssResizeRules = {
//					'.tool_button,\
//					.push_button,\
//					.tool_button_current,\
//					.push_button_pressed,\
//					.disabled,\
//					.icon_label,\
//					.tools_flyout .tool_button': {
//						'width': {s: '16px', l: '32px', xl: '48px'},
//						'height': {s: '16px', l: '32px', xl: '48px'},
//						'padding': {s: '1px', l: '2px', xl: '3px'}
//					},
//					'.tool_sep': {
//						'height': {s: '16px', l: '32px', xl: '48px'},
//						'margin': {s: '2px 2px', l: '2px 5px', xl: '2px 8px'}
//					},
//					'#main_icon': {
//						'width': {s: '31px', l: '53px', xl: '75px'},
//						'height': {s: '22px', l: '42px', xl: '64px'}
//					},
					'#tools_top': {
						'left': 50 + $('#main_button').width(),
						'height': 72
					},
					'#tools_left': {
						'width': 31,
						'top': 74
					},
					'div#workarea': {
						'left': 38,
						'top': 74
					}
//					'#tools_bottom': {
//						'left': {s: '27px', l: '46px', xl: '65px'},
//						'height': {s: '58px', l: '98px', xl: '145px'}
//					},
//					'#color_tools': {
//						'border-spacing': {s: '0 1px'},
//						'margin-top': {s: '-1px'}
//					},
//					'#color_tools .icon_label': {
//						'width': {l:'43px', xl: '60px'}
//					},
//					'.color_tool': {
//						'height': {s: '20px'}
//					},
//					'#tool_opacity': {
//						'top': {s: '1px'},
//						'height': {s: 'auto', l:'auto', xl:'auto'}
//					},
//					'#tools_top input, #tools_bottom input': {
//						'margin-top': {s: '2px', l: '4px', xl: '5px'},
//						'height': {s: 'auto', l: 'auto', xl: 'auto'},
//						'border': {s: '1px solid #555', l: 'auto', xl: 'auto'},
//						'font-size': {s: '.9em', l: '1.2em', xl: '1.4em'}
//					},
//					'#zoom_panel': {
//						'margin-top': {s: '3px', l: '4px', xl: '5px'}
//					},
//					'#copyright, #tools_bottom .label': {
//						'font-size': {l: '1.5em', xl: '2em'},
//						'line-height': {s: '15px'}
//					},
//					'#tools_bottom_2': {
//						'width': {l: '295px', xl: '355px'},
//						'top': {s: '4px'}
//					},
//					'#tools_top > div, #tools_top': {
//						'line-height': {s: '17px', l: '34px', xl: '50px'}
//					},
//					'.dropdown button': {
//						'height': {s: '18px', l: '34px', xl: '40px'},
//						'line-height': {s: '18px', l: '34px', xl: '40px'},
//						'margin-top': {s: '3px'}
//					},
//					'#tools_top label, #tools_bottom label': {
//						'font-size': {s: '1em', l: '1.5em', xl: '2em'},
//						'height': {s: '25px', l: '42px', xl: '64px'}
//					},
//					'div.toolset': {
//						'height': {s: '25px', l: '42px', xl: '64px'}
//					},
//					'#tool_bold, #tool_italic': {
//						'font-size': {s: '1.5em', l: '3em', xl: '4.5em'}
//					},
//					'#sidepanels': {
//						'top': {s: '50px', l: '88px', xl: '125px'},
//						'bottom': {s: '51px', l: '68px', xl: '65px'}
//					},
//					'#layerbuttons': {
//						'width': {l: '130px', xl: '175px'},
//						'height': {l: '24px', xl: '30px'}
//					},
//					'#layerlist': {
//						'width': {l: '128px', xl: '150px'}
//					},
//					'.layer_button': {
//						'width': {l: '19px', xl: '28px'},
//						'height': {l: '19px', xl: '28px'}
//					},
//					'input.spin-button': {
//						'background-image': {l: 'url('images/spinbtn_updn_big.png')', xl: 'url('images/spinbtn_updn_big.png')'},
//						'background-position': {l: '100% -5px', xl: '100% -2px'},
//						'padding-right': {l: '24px', xl: '24px' }
//					},
//					'input.spin-button.up': {
//						'background-position': {l: '100% -45px', xl: '100% -42px'}
//					},
//					'input.spin-button.down': {
//						'background-position': {l: '100% -85px', xl: '100% -82px'}
//					},
//					'#position_opts': {
//						'width': {all: (size_num*4) +'px'}
//					}
				};

				var rule_elem = $('#tool_size_rules');
				if (!rule_elem.length) {
					rule_elem = $('<style id="tool_size_rules"></style>').appendTo('head');
				} else {
					rule_elem.empty();
				}

				if (size !== 'm') {
					var styleStr = '';
					$.each(cssResizeRules, function(selector, rules) {
						selector = '#svg_editor ' + selector.replace(/,/g,', #svg_editor');
						styleStr += selector + '{';
						$.each(rules, function(prop, values) {
							var val;
							if (typeof values === 'number') {
								val = (values * scale) + 'px';
							} else if (values[size] || values.all) {
								val = (values[size] || values.all);
							}
							styleStr += (prop + ':' + val + ';');
						});
						styleStr += '}';
					});
					//this.style[uaPrefix + 'Transform'] = 'scale(' + scale + ')';
					var prefix = '-' + uaPrefix.toLowerCase() + '-';
					styleStr += (sel_toscale + '{' + prefix + 'transform: scale(' + scale + ');}'
					+ ' #svg_editor div.toolset .toolset {' + prefix + 'transform: scale(1); margin: 1px !important;}' // Hack for markers
					+ ' #svg_editor .ui-slider {' + prefix + 'transform: scale(' + (1/scale) + ');}' // Hack for sliders
					);
					rule_elem.text(styleStr);
				}

				setFlyoutPositions();
			};

			// TODO: Combine this with addDropDown or find other way to optimize
			var addAltDropDown = function(elem, list, callback, opts) {
				var button = $(elem);
				list = $(list);
				var on_button = false;
				var dropUp = opts.dropUp;
				if (dropUp) {
					$(elem).addClass('dropup');
				}
				list.find('li').bind('mouseup', function() {
					if (opts.seticon) {
						setIcon('#cur_' + button[0].id , $(this).children());
						$(this).addClass('current').siblings().removeClass('current');
					}
					callback.apply(this, arguments);

				});

				$(window).mouseup(function(evt) {
					if (!on_button) {
						button.removeClass('down');
						list.hide();
						list.css({top:0, left:0});
					}
					on_button = false;
				});

				// var height = list.height(); // Currently unused
				button.bind('mousedown',function() {
					var off = button.offset();
					if (dropUp) {
						off.top -= list.height();
						off.left += 8;
					} else {
						off.top += button.height();
					}
					list.offset(off);

					if (!button.hasClass('down')) {
						list.show();
						on_button = true;
					} else {
						// CSS position must be reset for Webkit
						list.hide();
						list.css({top:0, left:0});
					}
					button.toggleClass('down');
				}).hover(function() {
					on_button = true;
				}).mouseout(function() {
					on_button = false;
				});

				if (opts.multiclick) {
					list.mousedown(function() {
						on_button = true;
					});
				}
			};

			var extsPreLang = [];
			var extAdded = function(win, ext) {
				if (!ext) {
					return;
				}
				var cb_called = false;
				var resize_done = false;
				var cb_ready = true; // Set to false to delay callback (e.g. wait for $.svgIcons)

				if (ext.langReady) {
					if (editor.langChanged) { // We check for this since the "lang" pref could have been set by storage
						var lang = $.pref('lang');
						ext.langReady({lang:lang, uiStrings:uiStrings});
					}
					else {
						extsPreLang.push(ext);
					}
				}

				function prepResize() {
					if (resize_timer) {
						clearTimeout(resize_timer);
						resize_timer = null;
					}
					if (!resize_done) {
						resize_timer = setTimeout(function() {
							resize_done = true;
							setIconSize($.pref('iconsize'));
						}, 50);
					}
				}

				var runCallback = function() {
					if (ext.callback && !cb_called && cb_ready) {
						cb_called = true;
						ext.callback();
					}
				};

				var btn_selects = [];

				if (ext.context_tools) {
					$.each(ext.context_tools, function(i, tool) {
						// Add select tool
						var html;
						var cont_id = tool.container_id ? (' id="' + tool.container_id + '"') : '';
						var panel = $('#' + tool.panel);

						// create the panel if it doesn't exist
						if (!panel.length) {
							panel = $('<div>', {id: tool.panel}).appendTo('#tools_top');
						}

						// TODO: Allow support for other types, or adding to existing tool
						switch (tool.type) {
						case 'tool_button':
							html = '<div class="tool_button">' + tool.id + '</div>';
							var div = $(html).appendTo(panel);
							if (tool.events) {
								$.each(tool.events, function(evt, func) {
									$(div).bind(evt, func);
								});
							}
							break;
						case 'select':
							html = '<label' + cont_id + '>'
								+ '<select id="' + tool.id + '">';
							$.each(tool.options, function(val, text) {
								var sel = (val == tool.defval) ? ' selected' : '';
								html += '<option value="'+val+'"' + sel + '>' + text + '</option>';
							});
							html += '</select></label>';
							// Creates the tool, hides & adds it, returns the select element
							var sel = $(html).appendTo(panel).find('select');

							$.each(tool.events, function(evt, func) {
								$(sel).bind(evt, func);
							});
							break;
						case 'button-select':
							html = '<div id="' + tool.id + '" class="dropdown toolset" title="' + tool.title + '">'
								+ '<div id="cur_' + tool.id + '" class="icon_label"></div><button></button></div>';

							var list = $('<ul id="' + tool.id + '_opts"></ul>').appendTo('#option_lists');

							if (tool.colnum) {
								list.addClass('optcols' + tool.colnum);
							}

							// Creates the tool, hides & adds it, returns the select element
							var dropdown = $(html).appendTo(panel).children();

							btn_selects.push({
								elem: ('#' + tool.id),
								list: ('#' + tool.id + '_opts'),
								title: tool.title,
								callback: tool.events.change,
								cur: ('#cur_' + tool.id)
							});

							break;
						case 'input':
							html = '<label' + cont_id + '>'
								+ '<span id="' + tool.id + '_label">'
								+ tool.label + ':</span>'
								+ '<input id="' + tool.id + '" title="' + tool.title
								+ '" size="' + (tool.size || '4') + '" value="' + (tool.defval || '') + '" type="text"/></label>';

							// Creates the tool, hides & adds it, returns the select element

							// Add to given tool.panel
							var inp = $(html).appendTo(panel).find('input');

							if (tool.spindata) {
								inp.SpinButton(tool.spindata);
							}

							if (tool.events) {
								$.each(tool.events, function(evt, func) {
									inp.bind(evt, func);
								});
							}
							break;

						default:
							break;
						}
					});
				}

				if (ext.buttons) {
					var fallback_obj = {},
						placement_obj = {},
						svgicons = ext.svgicons,
						holders = {};

					// Add buttons given by extension
					$.each(ext.buttons, function(i, btn) {
						var icon, svgicon, tls_id;
						var id = btn.id;
						var num = i;

						// Give button a unique ID
						while($('#'+id).length) {
							id = btn.id + '_' + (++num);
						}

						if (btn.icon =='images/tool_shapelib.png')
						{
							console.log(svgicons);
						}

						if (!svgicons) {
							icon = $('<img src="' + btn.icon + '"' + ' width="' + btn.iconWidth + '"' + 'height=' + '"' + btn.iconHeight + '"' + '>');
						} else {
							fallback_obj[id] = btn.icon;
							svgicon = btn.svgicon || btn.id;
							if (btn.type == 'app_menu') {
								placement_obj['#' + id + ' > div'] = svgicon;
							} else {
								placement_obj['#' + id] = svgicon;
							}
						}

						var cls, parent;

						// Set button up according to its type
						switch ( btn.type ) {
						case 'mode_flyout':
						case 'mode':
							cls = 'tool_button';
							parent = '#tools_left';
							break;
						case 'context':
							cls = 'tool_button';
							parent = '#' + btn.panel;
							// create the panel if it doesn't exist
							if (!$(parent).length) {
								$('<div>', {id: btn.panel}).appendTo('#tools_top');
							}
							break;
						case 'app_menu':
							cls = '';
							parent = '#main_menu ul';
							break;
						}
						var flyout_holder, cur_h, show_btn, ref_data, ref_btn;
						var button = $((btn.list || btn.type == 'app_menu') ? '<li/>' : '<div/>')
							.attr('id', id)
							.attr('title', btn.title)
							.addClass(cls);
						if (!btn.includeWith && !btn.list) {
							if ('position' in btn) {
								if ($(parent).children().eq(btn.position).length) {
									$(parent).children().eq(btn.position).before(button);
								}
								else {
									$(parent).children().last().before(button);
								}
							} else {
								button.appendTo(parent);
							}

							if (btn.type =='mode_flyout') {
							// Add to flyout menu / make flyout menu
	//							var opts = btn.includeWith;
	//							// opts.button, default, position
								ref_btn = $(button);



								flyout_holder = ref_btn.parent();
								// Create a flyout menu if there isn't one already
								if (!ref_btn.parent().hasClass('tools_flyout')) {
									// Create flyout placeholder
									tls_id = ref_btn[0].id.replace('tool_', 'tools_');
									show_btn = ref_btn.clone()
										.attr('id', tls_id + '_show')
										.append($('<div>', {'class': 'flyout_arrow_horiz'}))
										.append($('<img>' , {'src':btn.icon,'width':'24','height':'24','alt':'icon'}));

									ref_btn.before(show_btn);

									// Create a flyout div
									flyout_holder = makeFlyoutHolder(tls_id, ref_btn);
									flyout_holder.data('isLibrary', true);
									show_btn.data('isLibrary', true);
								}
	//							ref_data = Actions.getButtonData(opts.button);

								placement_obj['#' + tls_id + '_show'] = btn.id;
								// TODO: Find way to set the current icon using the iconloader if this is not default

								// Include data for extension button as well as ref button
								cur_h = holders['#'+flyout_holder[0].id] = [{
									sel: '#'+id,
									fn: btn.events.click,
									icon: btn.id,
//									key: btn.key,
									isDefault: true
								}, ref_data];
	//
	//							// {sel:'#tool_rect', fn: clickRect, evt: 'mouseup', key: 4, parent: '#tools_rect', icon: 'rect'}
	//
	//							var pos = ('position' in opts)?opts.position:'last';
	//							var len = flyout_holder.children().length;
	//
	//							// Add at given position or end
	//							if (!isNaN(pos) && pos >= 0 && pos < len) {
	//								flyout_holder.children().eq(pos).before(button);
	//							} else {
	//								flyout_holder.append(button);
	//								cur_h.reverse();
	//							}
							} else if (btn.type == 'app_menu') {
								button.append('<div>').append(btn.title);
							}

						}
						else if (btn.list) {
							// Add button to list
							button.addClass('push_button');
							$('#' + btn.list + '_opts').append(button);
							if (btn.isDefault) {
								$('#cur_' + btn.list).append(button.children().clone());
								svgicon = btn.svgicon || btn.id;
								placement_obj['#cur_' + btn.list] = svgicon;
							}
						}
						else if (btn.includeWith) {
							// Add to flyout menu / make flyout menu
							var opts = btn.includeWith;
							// opts.button, default, position
							ref_btn = $(opts.button);

							flyout_holder = ref_btn.parent();
							// Create a flyout menu if there isn't one already
							if (!ref_btn.parent().hasClass('tools_flyout')) {
								// Create flyout placeholder
								tls_id = ref_btn[0].id.replace('tool_', 'tools_');
								show_btn = ref_btn.clone()
									.attr('id',tls_id + '_show')
									.append($('<div>', {'class': 'flyout_arrow_horiz'}));

								ref_btn.before(show_btn);

								// Create a flyout div
								flyout_holder = makeFlyoutHolder(tls_id, ref_btn);
							}

							ref_data = Actions.getButtonData(opts.button);

							if (opts.isDefault) {
								placement_obj['#' + tls_id + '_show'] = btn.id;
							}
							// TODO: Find way to set the current icon using the iconloader if this is not default

							// Include data for extension button as well as ref button
							cur_h = holders['#' + flyout_holder[0].id] = [{
								sel: '#' + id,
								fn: btn.events.click,
								icon: btn.id,
								key: btn.key,
								isDefault: btn.includeWith ? btn.includeWith.isDefault : 0
							}, ref_data];

							// {sel:'#tool_rect', fn: clickRect, evt: 'mouseup', key: 4, parent: '#tools_rect', icon: 'rect'}

							var pos = ('position' in opts) ? opts.position : 'last';
							var len = flyout_holder.children().length;

							// Add at given position or end
							if (!isNaN(pos) && pos >= 0 && pos < len) {
								flyout_holder.children().eq(pos).before(button);
							} else {
								flyout_holder.append(button);
								cur_h.reverse();
							}
						}

						if (!svgicons) {
							button.append(icon);
						}

						if (!btn.list) {
							// Add given events to button
							$.each(btn.events, function(name, func) {
								if (name == 'click' && btn.type == 'mode') {
									if (btn.includeWith) {
										button.bind(name, func);
									} else {
										button.bind(name, function() {
											if (toolButtonClick(button)) {
												func();
											}
										});
									}
									if (btn.key) {
										$(document).bind('keydown', btn.key, func);
										if (btn.title) {
											button.attr('title', btn.title + ' ['+btn.key+']');
										}
									}
								} else {
									button.bind(name, func);
								}
							});
						}

						setupFlyouts(holders);
					});

					$.each(btn_selects, function() {
						addAltDropDown(this.elem, this.list, this.callback, {seticon: true});
					});

					if (svgicons) {
						cb_ready = false; // Delay callback
					}

					/*
					$.svgIcons(svgicons, {
						w: 24, h: 24,
						id_match: false,
						no_img: (!svgedit.browser.isWebkit()),
						fallback: fallback_obj,
						placement: placement_obj,
						callback: function (icons) {
							// Non-ideal hack to make the icon match the current size
							//if (curPrefs.iconsize && curPrefs.iconsize !== 'm') {
							if ($.pref('iconsize') !== 'm') {
								prepResize();
							}
							cb_ready = true; // Ready for callback
							runCallback();
						}
					});
					*/
				}

				runCallback();
			};

			var getPaint = function(color, opac, type) {
				// update the editor's fill paint
				var opts = { alpha: opac };
				if (color.indexOf('url(#') === 0) {
					var refElem = svgCanvas.getRefElem(color);
					if (refElem) {
						refElem = refElem.cloneNode(true);
					} else {
						refElem = $('#' + type + '_color defs *')[0];
					}
					opts[refElem.tagName] = refElem;
				} else if (color.indexOf('#') === 0) {
					opts.solidColor = color.substr(1);
				} else {
					opts.solidColor = 'none';
				}
				return new $.jGraduate.Paint(opts);
			};

			$('#text').focus( function(){ textBeingEntered = true; } );
			$('#text').blur( function(){ textBeingEntered = false; } );

			// bind the selected event to our function that handles updates to the UI
			svgCanvas.bind('selected', selectedChanged);
			svgCanvas.bind('transition', elementTransition);
			svgCanvas.bind('changed', elementChanged);
			svgCanvas.bind('saved', saveHandler);
			svgCanvas.bind('exported', exportHandler);
			svgCanvas.bind('exportedPDF', function (win, data) {
				var exportWindowName = data.exportWindowName;
				if (exportWindowName) {
					exportWindow = window.open('', exportWindowName); // A hack to get the window via JSON-able name without opening a new one
				}
				exportWindow.location.href = data.dataurlstring;
			});
			svgCanvas.bind('zoomed', zoomChanged);
			svgCanvas.bind('contextset', contextChanged);
			svgCanvas.bind('extension_added', extAdded);
			svgCanvas.textActions.setInputElem($('#text')[0]);

			// Setup palette
			var str = '';
			var counter = 0;
			var leftPos = 0;
			var basePos = 6;
			var size = 16;
			var colNums = 9;
			$.each(palette, function(i, item)
			{
				if (counter < (colNums))
				{
					if (counter == 0)
					{
                        str += '<div class="palette_item" data-rgb="none"' + 'style="position:absolute;left:' + (basePos + (counter % colNums) * size) + 'px;top:3px;"' + '><img src="images/no_color.png" style="width:15px;height:15px"></div>'
					}
					else
					{
                        str += '<div class="palette_item" style="background-color: ' + item + ';position:absolute;left:' + (basePos + leftPos * size) + 'px;top:3px;" data-rgb="' + item + '"></div>';
					}

                    leftPos++;
					str += '<span/>';
				}
				else if (counter < (colNums) * 2)
				{
                    str += '<div class="palette_item" style="background-color: ' + item + ';position:absolute;left:' + (basePos + (counter % colNums) * size) + 'px;top:' + (3 + size) + 'px;" data-rgb="' + item + '"></div>';
                    leftPos++;
				}
				else if (counter < (colNums) * 3)
				{
                    str += '<div class="palette_item" style="background-color: ' + item + ';position:absolute;left:' + (basePos + (counter % colNums) * size) + 'px;top:' + (3 + size * 2) + 'px;" data-rgb="' + item + '"></div>';
                    leftPos++;
				}
				counter++;
			});
			$('#palette').append(str);

			///*
			// Setup Fill Mode
			var setupFillStyle = function()
			{
				var str = '';
				var counter = 0;
				var leftPos = 0;
				var basePos = 6;
				var size = 25;
				var colNums = 6;

				var fillItemStr = '';

				$.each(paletteFill, function(i, item)
				{
                    fillItemStr = '<svg xmlns="http://www.w3.org/2000/svg"' + 'id="' + i + '">' +
					'<rect width="22" height="22"'+
                    '					fill="url(#fillpattern_' + i + ')' + '" opacity="' + 1 + '"/>'+
                    '					<defs>' +
                   	item +
                    '</defs></svg>';

                    console.log(fillItemStr);


					if (counter < (colNums))
					{
						if (counter == 0)
						{
							str += '<div class="fillstyle_item" data-rgb="none"' + 'style="position:absolute;left:' + (basePos + (counter % colNums) * size) + 'px;top:3px;"' + '><img src="images/no_color.png" style="width:22px;height:22px"></div>'
						}
						else
						{
							str += '<div class="fillstyle_item" style="position:absolute;left:' + (basePos + leftPos * size) + 'px;top:3px;">' + fillItemStr + '</div>';
						}

						leftPos++;
						str += '<span/>';
					}
					else if (counter < (colNums) * 2)
					{
						str += '<div class="fillstyle_item" style="position:absolute;left:' + (basePos + (counter % colNums) * size) + 'px;top:' + (3 + size) + 'px;">' + fillItemStr + '</div>';
						leftPos++;
					}
					else if (counter < (colNums) * 3)
					{
						str += '<div class="fillstyle_item" style="position:absolute;left:' + (basePos + (counter % colNums) * size) + 'px;top:' + (3 + size * 2) + 'px;">' + fillItemStr + '</div>';
						leftPos++;
					}
					counter++;
				});
				//*/
				$('#fillstyle').append(str);

				/*
				var svgdocbox = new DOMParser().parseFromString(
					'<svg xmlns="http://www.w3.org/2000/svg" ><rect width="22" height="22"'+
					'					fill="url(#diagonalHatch)' + '" opacity="' + 1 + '"/>'+
					'					<defs>' +
					'	<pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="4" height="4">'+
					'	<path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" style="stroke:red; stroke-width:1" />'+
					'	</pattern>'+
					'</defs></svg>',
					'text/xml');
				var docElem = svgdocbox.documentElement;

				$('#fillstyle').append(document.importNode(docElem, true));
				*/
			}

			var setupStokeStyle = function()
			{
				var str = '';
				var counter = 0;
				var leftPos = 0;
				var basePos = 6;
				var size = 25;
				var colNums = 6;

                var paletteStroke = [ // Todo: Make into configuration item?
                    '',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="1"><line x1="2" y1="2" x2="20" y2="20" stroke="#000000" marker-end="url(#stroke_marker_triangle_end)" /><defs><marker id="stroke_marker_triangle_end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path fill="#000000" fill-opacity="1" d="M 0 0 L 10 5 L 0 10 z" /></marker></defs></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="2" ><line x1="2" y1="2" x2="20" y2="20" stroke="#000000" marker-start="url(#stroke_marker_triangle_start)" /><defs><marker id="stroke_marker_triangle_start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path fill="#000000"  fill-opacity="1" d="M 0 5 L 10 10 L 10 0 z" /></marker></defs></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="3" ><line x1="2" y1="2" x2="20" y2="20" stroke="#000000" marker-start="url(#stroke_marker_triangle_start)" marker-end="url(#stroke_marker_triangle_end)" /><defs><marker id="stroke_marker_triangle_end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path fill="#000000"  fill-opacity="1" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs><defs><marker id="stroke_marker_triangle_start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path  fill="#000000" fill-opacity="1" d="M 0 5 L 10 10 L 10 0 z" /></marker></defs></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="4"><line x1="2" y1="2" x2="18" y2="18" stroke="#000000" marker-end="url(#stroke_marker_circle_end)" /><defs><marker id="stroke_marker_circle_end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><circle  fill="#000000" fill-opacity="1"  cx="5" cy="5" r="4" /></marker></defs></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="5" ><line x1="2" y1="2" x2="18" y2="18" stroke="#000000" marker-start="url(#stroke_marker_circle_start)" /><defs><marker id="stroke_marker_circle_start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><circle  fill="#000000" fill-opacity="1"  cx="5" cy="5" r="4" /></marker></defs></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="6" ><line x1="2" y1="2" x2="18" y2="18" stroke="#000000" marker-start="url(#stroke_marker_circle_start)" marker-end="url(#stroke_marker_circle_end)" /><defs><marker id="stroke_marker_circle_end" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><circle  fill="#000000" fill-opacity="1"  cx="5" cy="5" r="4" /></marker></defs><defs><marker id="stroke_marker_circle_start" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><circle  fill="#000000" fill-opacity="1" cx="5" cy="5" r="4" /></marker></defs></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="8" ><line x1="0" y1="0" x2="22" y2="22" stroke="#000000" stroke-dasharray="" /></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="8" ><line x1="0" y1="0" x2="22" y2="22" stroke="#000000" stroke-dasharray="" /></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="9" ><line x1="0" y1="0" x2="22" y2="22" stroke="#000000" stroke-dasharray="" /></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="10" ><line x1="0" y1="0" x2="22" y2="22" stroke="#000000" stroke-dasharray="" /></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="11" ><line x1="0" y1="0" x2="22" y2="22" stroke="#000000" stroke-dasharray="" /></svg>',
                    '<svg xmlns="http://www.w3.org/2000/svg" id="12" ><line x1="0" y1="0" x2="22" y2="22" stroke="#000000" stroke-dasharray="" /></svg>',
                ];

				$.each(paletteStroke, function(i, item)
				{
					if (counter < (colNums))
					{
						if (counter == 0)
						{
							str += '<div class="strokestyle_item" data-rgb="none"' + 'style="position:absolute;left:' + (basePos + (counter % colNums) * size) + 'px;top:3px;"' + '><img src="images/no_color.png" style="width:22px;height:22px"></div>'
						}
						else
						{
							str += '<div class="strokestyle_item" style="position:absolute;left:' + (basePos + leftPos * size) + 'px;top:3px;">' + paletteStroke[i] + '</div>';
						}

						leftPos++;
						str += '<span/>';
					}
					else if (counter < (colNums) * 2)
					{
						str += '<div class="strokestyle_item" style="position:absolute;left:' + (basePos + (counter % colNums) * size) + 'px;top:' + (3 + size) + 'px;">' + paletteStroke[i] + '</div>';
						leftPos++;
					}
					else if (counter < (colNums) * 3)
					{
						str += '<div class="strokestyle_item" style="position:absolute;left:' + (basePos + (counter % colNums) * size) + 'px;top:' + (3 + size * 2) + 'px;">' + paletteStroke[i] + '</div>';
						leftPos++;
					}
					counter++;
				});
				//*/
				$('#strokestyle').append(str);
			}

			setupFillStyle();

			setupStokeStyle();

			// Set up editor background functionality
			// TODO add checkerboard as "pattern"
			var color_blocks = ['#FFF', '#888', '#000']; // ,'url(data:image/gif;base64,R0lGODlhEAAQAIAAAP%2F%2F%2F9bW1iH5BAAAAAAALAAAAAAQABAAAAIfjG%2Bgq4jM3IFLJgpswNly%2FXkcBpIiVaInlLJr9FZWAQA7)'];
			str = '';
			$.each(color_blocks, function() {
				str += '<div class="color_block" style="background-color:' + this + ';"></div>';
			});
			$('#bg_blocks').append(str);
			var blocks = $('#bg_blocks div');
			var cur_bg = 'cur_background';
			blocks.each(function() {
				var blk = $(this);
				blk.click(function() {
					blocks.removeClass(cur_bg);
					$(this).addClass(cur_bg);
				});
			});

			setBackground($.pref('bkgd_color'), $.pref('bkgd_url'));

			$('#image_save_opts input').val([$.pref('img_save')]);

			var changeRectRadius = function(ctl) {
                var selected = svgCanvas.selectedElements[0];
                var box = svgedit.utilities.getBBox(selected);
                var Rwidth = box.width,Rheight = box.height;
                var minLength = Math.min(Rwidth,Rheight);
                switch (minLength){
                    case Rwidth:
                        ctl.value = ctl.value>=Rwidth/2?Rwidth/2:ctl.value;
                        break;
                    case Rheight:
                        ctl.value = ctl.value>=Rheight/2?Rheight/2:ctl.value;
                        break;
                }
				svgCanvas.setRectRadius(ctl.value);
			};

			var changeFontSize = function(ctl) {

				svgCanvas.setFontSize(ctl.value);
			};

			var changeStrokeWidth = function(ctl) {
				var val = ctl.value;

				if (val <= 0.1)// && selectedElement && ['line', 'polyline'].indexOf(selectedElement.nodeName) >= 0)
				{
					val = ctl.value = 0.1;
				}
				svgCanvas.setStrokeWidth(val);
			};

			var changeRotationAngle = function(ctl) {
				svgCanvas.setRotationAngle(ctl.value);
				$('#tool_reorient').toggleClass('disabled', parseInt(ctl.value, 10) === 0);
			};
            var changeRotateAngle = function (ctl) {
                svgCanvas.setPatternAngle(ctl.value,'rotate');
            }
            var changeScaleAngle = function (ctl) {
                svgCanvas.setPatternAngle(ctl.value,'scale');
            }
			var changeOpacity = function(ctl, val) {
				if (val == null) {val = ctl.value;}
				$('#group_opacity').val(val);
				if (!ctl || !ctl.handle) {
					$('#opac_slider').slider('option', 'value', val);
				}
				svgCanvas.setOpacity(val/100);
			};

			var changeBlur = function(ctl, val, noUndo) {
				if (val == null) {val = ctl.value;}
				$('#blur').val(val);
				var complete = false;
				if (!ctl || !ctl.handle) {
					$('#blur_slider').slider('option', 'value', val);
					complete = true;
				}
				if (noUndo) {
					svgCanvas.setBlurNoUndo(val);
				} else {
					svgCanvas.setBlur(val, complete);
				}
			};
            var changeMove = function(ctl, val, noUndo) {
                if (val == null) {val = ctl.value;}
                var dis = val;
                $('#move').val(dis);

                var unit = curConfig.baseUnit !== 'px' ? curConfig.baseUnit : null;
                if (unit) {
                    dis = svgedit.units.convertUnit(dis);
                }
                console.log(dis)
                moveDis=val*(val/dis);
            };
            var changeMultMove = function(ctl, val, noUndo) {
                if (val == null) {val = ctl.value;}
                var dis = val;
                $('#move').val(dis);

                var unit = curConfig.baseUnit !== 'px' ? curConfig.baseUnit : null;
                if (unit) {
                    dis = svgedit.units.convertUnit(dis);
                }
                moveDis=val*(val/dis);
            };
            var changeObjNum = function(ctl, val, noUndo) {
                if (val == null) {val = ctl.value;}
                $('#objnum').val(val);
                objnum = $('#objnum').val();
            };
			var changeEraserSize = function(ctl, val, noUndo) {
				if (val == null) {val = ctl.value;}
				$('#eraserSize').val(val);
				var complete = false;
				if (!ctl || !ctl.handle) {
					$('#eraser_slider').slider('option', 'value', val);
					complete = true;
				}
				if (noUndo) {
					//svgCanvas.setBlurNoUndo(val);
				} else {
					//svgCanvas.setBlur(val, complete);
				}

				svgCanvas.bitmapUtils.setEraserSize(val);
			};

			var changeLassoThreshold = function(ctl, val, noUndo) {
				if (val == null) {val = ctl.value;}
				$('#lassoThreshold').val(val);
				var complete = false;
				if (!ctl || !ctl.handle) {
					$('#lasso_slider').slider('option', 'value', val);
					complete = true;
				}
				if (noUndo) {
					//svgCanvas.setBlurNoUndo(val);
				} else {
					//svgCanvas.setBlur(val, complete);
				}

				svgCanvas.bitmapUtils.setLassoThreshold(val);
			};

			$('#stroke_style').change(function() {
				svgCanvas.setStrokeAttr('stroke-dasharray', $(this).val());
				operaRepaint();
			});

			$('#stroke_linejoin').change(function() {
				svgCanvas.setStrokeAttr('stroke-linejoin', $(this).val());
				operaRepaint();
			});

			// Lose focus for select elements when changed (Allows keyboard shortcuts to work better)
			$('select').change(function(){$(this).blur();});

			// fired when user wants to move elements to another layer
			var promptMoveLayerOnce = false;
			$('#selLayerNames').change(function() {
				var destLayer = this.options[this.selectedIndex].value;
				var confirmStr = uiStrings.notification.QmoveElemsToLayer.replace('%s', destLayer);
				var moveToLayer = function(ok) {
					if (!ok) {return;}
					promptMoveLayerOnce = true;
					svgCanvas.moveSelectedToLayer(destLayer);
					svgCanvas.clearSelection();
					populateLayers();
				};
				if (destLayer) {
					if (promptMoveLayerOnce) {
						moveToLayer(true);
					} else {
						$.confirm(confirmStr, moveToLayer);
					}
				}
			});

			$('#font_family').change(function() {
				svgCanvas.setFontFamily(this.value);
			});

			$('#seg_type').change(function() {
				svgCanvas.setSegType($(this).val());
			});

			$('#text').keyup(function() {
				svgCanvas.setTextContent(this.value);
			});

			$('#image_url').change(function() {
				setImageURL(this.value);
			});

			$('#link_url').change(function() {
				if (this.value.length) {
					svgCanvas.setLinkURL(this.value);
				} else {
					svgCanvas.removeHyperlink();
				}
			});

			$('#g_title').change(function() {
				svgCanvas.setGroupTitle(this.value);
			});

			$('.attr_changer').change(function() {
				var attr = this.getAttribute('data-attr');
				var val = this.value;
				var valid = svgedit.units.isValidUnit(attr, val, selectedElement);

				if (!valid) {
					$.alert(uiStrings.notification.invalidAttrValGiven);
					this.value = selectedElement.getAttribute(attr);
					return false;
				}

				if (attr !== 'id' && attr !== 'class') {
					if (isNaN(val)) {
						val = svgCanvas.convertToNum(attr, val);
					} else if (curConfig.baseUnit !== 'px') {
						// Convert unitless value to one with given unit

						var unitData = svgedit.units.getTypeMap();

						if (selectedElement[attr] || svgCanvas.getMode() === 'pathedit' || attr === 'x' || attr === 'y') {
							val *= unitData[curConfig.baseUnit];
						}
					}
				}

				// if the user is changing the id, then de-select the element first
				// change the ID, then re-select it with the new ID
				if (attr === 'id') {
					var elem = selectedElement;
					svgCanvas.clearSelection();
					elem.id = val;
					svgCanvas.addToSelection([elem],true);
				} else {
					svgCanvas.changeSelectedAttribute(attr, val);
				}
				this.blur();
			});

			// Prevent selection of elements when shift-clicking
			$('#palette').mouseover(function() {
				var inp = $('<input type="hidden">');
				$(this).append(inp);
				inp.focus().remove();
			});

            $('.strokestyle_item').mousedown(function(evt)
            {
                if (evt.button != 0)
                {
                    return;
                }

                ///*
                var id = parseInt(this.childNodes[0].id);

                var defsElem = svgdocbox.createElementNS('', 'defs');

                if (id == 1 || id == 2 || id == 3)
				{
                    if (id == 1)
					{
                        defsElem.innerHTML = '<defs><marker id="stroke_marker_triangle_end" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>';
					}
					else if (id == 2)
					{
                        defsElem.innerHTML = '<defs><marker id="stroke_marker_triangle_start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" /></marker></defs>';
					}
					else if (id == 3)
					{
                        defsElem.innerHTML = '<defs><marker id="stroke_marker_triangle_end" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs><defs><marker id="stroke_marker_triangle_start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" /></marker></defs>';
					}

                    svgCanvas.setStrokePattern(defsElem , id , false);
				}
				else if (id == 4 || id == 5 || id == 6)
				{
                    defsElem.innerHTML = '<defs><marker id="stroke_marker_circle" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto"><circle cx="5" cy="5" r="4" /></marker></defs>';

                    svgCanvas.setStrokePattern(defsElem , id , false);
				}
            });

			$('.fillstyle_item').mousedown(function(evt)
			{
                if (evt.button != 0)
                {
                    return;
                }

                var id = parseInt(this.childNodes[0].id);

                var defsElem = svgdocbox.createElementNS('', 'defs');
				svgCanvas.setPaintOpacity('fill', 1.0, false);

				svgCanvas.setFillPattern(defsElem , id , false , 1);
			});

			$('.palette_item').mousedown(function(evt)
			{
				if(selectedElement == null&&!multiselected){
                    if (evt.button != 0)
                    {
                        return;
                    }
				}
				if(selectedElement!=null){
                    if(evt.button==2){
                        var deaultFillColor =  selectedElement.getAttribute("fill");
                        $('#tool_cp_stroke_color').css('z-index' ,3);
                        $('#tool_cp_fill_color').css('z-index' ,2);
                        selectedElement.setAttribute("stroke",this.dataset.rgb);
                        selectedElement.setAttribute("fill",deaultFillColor);
                    }else if(evt.button==0){
                        $('#tool_cp_stroke_color').css('z-index' ,2);
                        $('#tool_cp_fill_color').css('z-index' ,3);
                        selectedElement.setAttribute("fill",this.dataset.rgb);
                    }
				}
				if(multiselected){
					var select = svgCanvas.selectedElements;
                    if(evt.button==2){
                        $('#tool_cp_stroke_color').css('z-index' ,3);
                        $('#tool_cp_fill_color').css('z-index' ,2);
                        for(var i = 0;i<select.length;i++) {
                        	if(select[i]!=null){
                                var deaultFillColor =  select[i].getAttribute("fill");
                                select[i].setAttribute("stroke",this.dataset.rgb);
                                select[i].setAttribute("fill",deaultFillColor);
							}
                        }
                    }else if(evt.button==0){
                        $('#tool_cp_stroke_color').css('z-index' ,2);
                        $('#tool_cp_fill_color').css('z-index' ,3);
                        for(var i = 0;i<select.length;i++){
                        	if(select[i]!=null){
                                select[i].setAttribute("fill",this.dataset.rgb)
                            }
					  }
                    }
                }


                var strokeZ = parseInt($('#tool_cp_stroke_color').css('z-index'));
                var fillZ = parseInt($('#tool_cp_fill_color').css('z-index'));

				// shift key or right click for stroke
				//var picker = evt.shiftKey || evt.button === 2 ? 'stroke' : 'fill';
                var picker = strokeZ > fillZ ? 'stroke' : 'fill';
				var color = $(this).data('rgb');
				var paint;

				// Webkit-based browsers returned 'initial' here for no stroke
				if (color === 'none' || color === 'transparent' || color === 'initial') {
					color = 'none';
					paint = new $.jGraduate.Paint({alpha: 0, solidColor: 'ffffff'});

                    svgCanvas.setPaintOpacity(picker, 0.0);

				} else {
					paint = new $.jGraduate.Paint({alpha: 100, solidColor: color.substr(1)});

                    svgCanvas.setPaintOpacity(picker, 1.0);
				}

				paintBox[picker].setPaint(paint);
				svgCanvas.setColor(picker, color , false , 1);

				if (color !== 'none' && svgCanvas.getPaintOpacity(picker) !== 1) {
					svgCanvas.setPaintOpacity(picker, 1.0 , false , 2);
				}
				updateToolButtonState();
			}).bind('contextmenu', function(e) {e.preventDefault();});

			$('#toggle_stroke_tools').on('click', function() {
				//$('#tools_bottom').toggleClass('expanded');
			});

            $('#svgcanvas').css('background' , '#FFF');
			(function() {
				var last_x = null, last_y = null, w_area = workarea[0],
					panning = false, keypan = false;

				$('#svgcanvas').bind('mousemove mouseup', function(evt)
				{
					if (panning === false)
					{
						return;
					}

					//w_area.scrollLeft -= (evt.clientX - last_x);
					//w_area.scrollTop -= (evt.clientY - last_y);

					svgCanvas.transformCanvas(evt , (evt.clientX - last_x) , (evt.clientY - last_y) , 0 , false);
					//console.log('===================================' + w_area.scrollLeft + ", " + w_area.scrollTop);

					last_x = evt.clientX;
					last_y = evt.clientY;

					if (evt.type === 'mouseup') {panning = false;}
					return false;
				}).mousedown(function(evt)
				{
					//console.log('=========================== mouse down with: ' + evt.button);
					//if (evt.button === 1 || keypan === true)
					if (keypan === true)
					{
						panning = true;
						last_x = evt.clientX;
						last_y = evt.clientY;
						return false;
					}
				});

				$(window).mouseup(function() {
					panning = false;
				});

				$(document).bind('keydown', 'space', function(evt) {
					svgCanvas.spaceKey = keypan = true;
					evt.preventDefault();
				}).bind('keyup', 'space', function(evt) {
					evt.preventDefault();
					svgCanvas.spaceKey = keypan = false;
				}).bind('keydown', 'shift', function(evt) {
					if (svgCanvas.getMode() === 'zoom') {
						//workarea.css('cursor', zoomOutIcon);
					}
				}).bind('keyup', 'shift', function(evt) {
					if (svgCanvas.getMode() === 'zoom') {
						//workarea.css('cursor', zoomInIcon);
					}
				});

				editor.setPanning = function(active) {
					svgCanvas.spaceKey = keypan = active;
				};
			}());

			(function () {
				var button = $('#main_icon');
				var overlay = $('#main_icon span');
				var list = $('#main_menu');
				var on_button = false;
				var height = 0;
				var js_hover = true;
				var set_click = false;

				/*
				// Currently unused
				var hideMenu = function() {
					list.fadeOut(200);
				};
				*/

				$(window).mouseup(function(evt) {
					if (!on_button) {
						button.removeClass('buttondown');
						// do not hide if it was the file input as that input needs to be visible
						// for its change event to fire
						if (evt.target.tagName != 'INPUT') {
							list.fadeOut(200);
						} else if (!set_click) {
							set_click = true;
							$(evt.target).click(function() {
								list.css('margin-left', '-9999px').show();
							});
						}
					}
					on_button = false;
				}).mousedown(function(evt) {
//					$('.contextMenu').hide();
					var islib = $(evt.target).closest('div.tools_flyout, .contextMenu').length;
					if (!islib) {$('.tools_flyout:visible,.contextMenu').fadeOut(250);}
				});

				overlay.bind('mousedown',function() {
					if (!button.hasClass('buttondown')) {
						// Margin must be reset in case it was changed before;
						list.css('margin-left', 0).show();
						if (!height) {
							height = list.height();
						}
						// Using custom animation as slideDown has annoying 'bounce effect'
						list.css('height',0).animate({
							'height': height
						}, 200);
						on_button = true;
					} else {
						list.fadeOut(200);
					}
					button.toggleClass('buttondown buttonup');
				}).hover(function() {
					on_button = true;
				}).mouseout(function() {
					on_button = false;
				});

				var list_items = $('#main_menu li');

				// Check if JS method of hovering needs to be used (Webkit bug)
				list_items.mouseover(function() {
					js_hover = ($(this).css('background-color') == 'rgba(0, 0, 0, 0)');

					list_items.unbind('mouseover');
					if (js_hover) {
						list_items.mouseover(function() {
							this.style.backgroundColor = '#FFC';
						}).mouseout(function() {
							this.style.backgroundColor = 'transparent';
							return true;
						});
					}
				});
			}());
			// Made public for UI customization.
			// TODO: Group UI functions into a public editor.ui interface.
			editor.addDropDown = function(elem, callback, dropUp) {
				if ($(elem).length == 0) {return;} // Quit if called on non-existant element
				var button = $(elem).find('button');
				var list = $(elem).find('ul').attr('id', $(elem)[0].id + '-list');
				var on_button = false;
				if (dropUp) {
					$(elem).addClass('dropup');
				} else {
					// Move list to place where it can overflow container
					$('#option_lists').append(list);
				}
				list.find('li').bind('mouseup', callback);

				$(window).mouseup(function(evt) {
					if (!on_button) {
						button.removeClass('down');
						list.hide();
					}
					on_button = false;
				});

				button.bind('mousedown',function() {
					if (!button.hasClass('down')) {
						if (!dropUp) {
							var pos = $(elem).position();
							list.css({
								top: pos.top + 24,
								left: pos.left - 10
							});
						}
						list.show();
						on_button = true;
					} else {
						list.hide();
					}
					button.toggleClass('down');
				}).hover(function() {
					on_button = true;
				}).mouseout(function() {
					on_button = false;
				});
			};

			editor.addDropDown('#font_family_dropdown', function() {
				$('#font_family').val($(this).text()).change();
			});

			editor.addDropDown('#opacity_dropdown', function() {
				if ($(this).find('div').length) {return;}
				var perc = parseInt($(this).text().split('%')[0], 10);
				changeOpacity(false, perc);
			}, true);

			// For slider usage, see: http://jqueryui.com/demos/slider/
			$('#opac_slider').slider({
				start: function() {
					$('#opacity_dropdown li:not(.special)').hide();
				},
				stop: function() {
					$('#opacity_dropdown li').show();
					$(window).mouseup();
				},
				slide: function(evt, ui) {
					changeOpacity(ui);
				}
			});

			editor.addDropDown('#blur_dropdown', $.noop);

			var slideStart = false;

			$('#blur_slider').slider({
				max: 10,
				step: 0.1,
				stop: function(evt, ui) {
					slideStart = false;
					changeBlur(ui);
					$('#blur_dropdown li').show();
					$(window).mouseup();
				},
				start: function() {
					slideStart = true;
				},
				slide: function(evt, ui) {
					changeBlur(ui, null, slideStart);
				}
			});

			editor.addDropDown('#eraser_dropdown', $.noop);

			$('#eraser_slider').slider({
				max: 40,
				step: 1,
				stop: function(evt, ui) {
					slideStart = false;
					changeEraserSize(ui);
					$('#eraser_dropdown li').show();
					$(window).mouseup();
				},
				start: function() {
					slideStart = true;
				},
				slide: function(evt, ui) {
					changeEraserSize(ui, null, slideStart);
				}
			});

			editor.addDropDown('#lasso_dropdown', $.noop);

			$('#lasso_slider').slider({
				max: 150,
				step: 8,
				stop: function(evt, ui) {
					slideStart = false;
					changeLassoThreshold(ui);
					$('#eraser_dropdown li').show();
					$(window).mouseup();
				},
				start: function() {
					slideStart = true;
				},
				slide: function(evt, ui) {
					changeLassoThreshold(ui, null, slideStart);
				}
			});

			editor.addDropDown('#zoom_dropdown', function() {
				var item = $(this);
				var val = item.data('val');
				if (val) {
					zoomChanged(window, val);
				} else {
					changeZoom({value: parseFloat(item.text())});
				}
			}, true);

			addAltDropDown('#stroke_linecap', '#linecap_opts', function() {
				setStrokeOpt(this, true);
			}, {dropUp: true});

			addAltDropDown('#stroke_linejoin', '#linejoin_opts', function() {
				setStrokeOpt(this, true);
			}, {dropUp: true});

			addAltDropDown('#tool_position', '#position_opts', function() {
				var letter = this.id.replace('tool_pos', '').charAt(0);
				svgCanvas.alignSelectedElements(letter, 'page');
			}, {multiclick: true});

			/*

			When a flyout icon is selected
				(if flyout) {
				- Change the icon
				- Make pressing the button run its stuff
				}
				- Run its stuff

			When its shortcut key is pressed
				- If not current in list, do as above
				, else:
				- Just run its stuff

			*/

			// Unfocus text input when workarea is mousedowned.
			(function() {
				var inp;
				var unfocus = function() {
					$(inp).blur();
				};

				$('#svg_editor').find('button, select, input:not(#text)').focus(function() {
					inp = this;
					ui_context = 'toolbars';
					workarea.mousedown(unfocus);
				}).blur(function() {
					ui_context = 'canvas';
					workarea.unbind('mousedown', unfocus);
					// Go back to selecting text if in textedit mode
					if (svgCanvas.getMode() == 'textedit') {
						$('#text').focus();
					}
				});
			}());

			var clickFHPath = function() {
				if (toolButtonClick('#tool_fhpath')) {
					svgCanvas.setMode('fhpath');
				}
			};

			var clickLine = function() {
				if (toolButtonClick('#tool_line')) {
					svgCanvas.setMode('line');
				}
			};

			var clickSquare = function() {
				if (toolButtonClick('#tool_square')) {
					svgCanvas.setMode('square');
				}
			};

			var clickRect = function() {
				if (toolButtonClick('#tool_rect')) {
					svgCanvas.setMode('rect');
				}
			};

			var clickFHRect = function() {
				if (toolButtonClick('#tool_fhrect')) {
					svgCanvas.setMode('fhrect');
				}
			};

			var clickCircle = function() {
				if (toolButtonClick('#tool_circle')) {
					svgCanvas.setMode('circle');
				}
			};

			var clickEllipse = function() {
				if (toolButtonClick('#tool_ellipse')) {
					svgCanvas.setMode('ellipse');
				}
			};

			var clickFHEllipse = function() {
				if (toolButtonClick('#tool_fhellipse')) {
					svgCanvas.setMode('fhellipse');
				}
			};

			var clickImage = function() {
				if (toolButtonClick('#tool_image')) {
					svgCanvas.setMode('image');
				}
			};

			var clickZoom = function() {
				if (toolButtonClick('#tool_zoom')) {
					svgCanvas.setMode('zoom');
					//workarea.css('cursor', zoomInIcon);
				}
			};

			var zoomImage = function(multiplier) {
				var res = svgCanvas.getResolution();
				multiplier = multiplier ? res.zoom * multiplier : 1;
				// setResolution(res.w * multiplier, res.h * multiplier, true);
				$('#zoom').val(multiplier * 100);
				svgCanvas.setZoom(multiplier , 0);
				zoomDone();
				updateCanvas(true);
			};

			var dblclickZoom = function() {
				if (toolButtonClick('#tool_zoom')) {
					zoomImage();
					setSelectMode(4);
				}
			};

			var clickText = function() {
				if (toolButtonClick('#tool_text')) {
					svgCanvas.setMode('text');
				}
			};

			var clickPath = function() {
				if (toolButtonClick('#tool_path'))
				{
					svgCanvas.setMode('path');

					// Re-click path button
                    toolButtonClick('#tool_path');
				}
			};

			var isolateObject = function ()
			{
				if (selectedElement != null || multiselected)
				{
                    svgCanvas.isolateSelectedElements(false);
				}
			}

			var isolateObjectInverse = function()
			{
                if (selectedElement != null || multiselected)
                {
                    svgCanvas.isolateSelectedElements(true);
                }
			}

			var unisolateObjects = function()
			{
                svgCanvas.unisolateElementes();
			}

			var escapeCallback = function()
			{
				path.escapeCallback(true);
			}

			// Delete is a contextual tool that only appears in the ribbon if
			// an element has been selected
			var deleteSelected = function() {
				if (selectedElement != null || multiselected) {
					svgCanvas.deleteSelectedElements();
				}
			};

			var cutSelected = function() {
				if (selectedElement != null || multiselected) {
					svgCanvas.cutSelectedElements();
				}
			};

			var copySelected = function() {
				if (selectedElement != null || multiselected) {
					svgCanvas.copySelectedElements();
				}
			};

			var pasteInCenter = function() {
				svgCanvas.pasteElements('round');
			};

			var moveToTopSelected = function() {
				if (selectedElement != null) {
					svgCanvas.moveToTopSelectedElement();
				}
			};

			var moveToBottomSelected = function() {
				if (selectedElement != null) {
					svgCanvas.moveToBottomSelectedElement();
				}
			};

			var moveUpDownSelected = function(dir) {
				if (selectedElement != null) {
					svgCanvas.moveUpDownSelected(dir);
				}
			};

			var convertToPath = function() {
				if (selectedElement != null) {
					svgCanvas.convertToPath();
				}
			};

			var reorientPath = function() {
				if (selectedElement != null) {
					path.reorient();
				}
			};

			var makeHyperlink = function() {
				if (selectedElement != null || multiselected) {
					$.prompt(uiStrings.notification.enterNewLinkURL, 'http://', function(url) {
						if (url) {svgCanvas.makeHyperlink(url);}
					});
				}
			};

			var moveSelected = function(dx,dy)
			{
				if (selectedElement != null || multiselected) {
					if (curConfig.gridSnapping) {
						// Use grid snap value regardless of zoom level
						var multi = svgCanvas.getZoom() * curConfig.snappingStep;
						dx *= multi;
						dy *= multi;
					}
					svgCanvas.moveSelectedElements(dx,dy);
				}
			};

			var clickAddCtrlPoint = function()
			{
				path.addControlPoints();
			}

			var clickRemoveCtrlPoints = function()
			{
				path.removeControlPoints(true);
				path.removeControlPoints(false);
			}

			var clickRemoveCtrlPointsRed = function()
			{
				path.removeControlPoints(true);
			}

			var clickRemoveCtrlPointsGreen = function()
			{
                path.removeControlPoints(false);
			}

			var clickConnectAnchors = function()
			{
				path.connectAnchorPoints();
			}

			var clickOpenClosePaths = function()
			{
                path.openClosePaths();
			}

			var linkControlPoints = function() {
				$('#tool_node_link').toggleClass('push_button_pressed tool_button');
				var linked = $('#tool_node_link').hasClass('push_button_pressed');
				path.linkControlPoints(linked);
			};

			var clonePathNode = function() {
				if (path.getNodePoint()) {
					path.clonePathNode();
				}
			};

			var deletePathNode = function() {
				if (path.getNodePoint()) {
					path.deletePathNode();
				}
			};

			var addSubPath = function() {
				var button = $('#tool_add_subpath');
				var sp = !button.hasClass('push_button_pressed');
				button.toggleClass('push_button_pressed tool_button');
				path.addSubPath(sp);
			};

			var opencloseSubPath = function() {
				path.opencloseSubPath();
			};

			var selectNext = function() {
				svgCanvas.cycleElement(1);
			};

			var selectPrev = function() {
				svgCanvas.cycleElement(0);
			};

			var rotateSelected = function(cw, step) {
				if (selectedElement == null || multiselected) {return;}
				if (!cw) {step *= -1;}
				var angle = parseFloat($('#angle').val()) + step;
				svgCanvas.setRotationAngle(angle);
				updateContextPanel();
			};

			var clickClear = function() {
				var dims = curConfig.dimensions;
				$.confirm(uiStrings.notification.QwantToClear, function(ok) {
					if (!ok) {return;}
					setSelectMode(5);
					svgCanvas.clear();
					svgCanvas.setResolution(dims[0], dims[1]);
                    svgCanvas.leaveContext();
					updateCanvas(true);
					zoomImage();
					populateLayers();
					updateContextPanel();
					prepPaints();
					svgCanvas.runExtensions('onNewDocument');
				});
			};

			var clickBold = function() {
				svgCanvas.setBold( !svgCanvas.getBold() );
				updateContextPanel();
				return false;
			};

			var clickItalic = function() {
				svgCanvas.setItalic( !svgCanvas.getItalic() );
				updateContextPanel();
				return false;
			};

			var clickSave = function() {
				// In the future, more options can be provided here
				var saveOpts = {
					'images': $.pref('img_save'),
					'round_digits': 6
				};
				svgCanvas.save(saveOpts);
			};

			var clickCheckout = editor.clickCheckout = function()
			{
				//if (toolButtonClick('#tool_checkout'))
				{
					//console.log("========================================= Checkout");

                    svgCanvas.checkoutFromServer();
				}
			}

            var clickDataRecover = editor.clickDataRecover = function()
            {
                svgCanvas.recoverFromServer();
            }

            var clickBacktolib = editor.clickBacktolib = function()
			{
				console.log('============================================== backtolib');

				svgCanvas.submitToServer();

				window.history.back();
			}

            var clickSubmit = editor.clickSubmit = function()
            {
                //if (toolButtonClick("#tool_submit"))
                {
                	//return;

					svgCanvas.submitToServer();

                    return;

                    // Open placeholder window (prevents popup)
                    var exportWindowName;
                    function openExportWindow ()
					{
						//var svgContentString = 'data:text/html;charset=utf-8,' + encodeURIComponent('<title>' + str + '</title><h1>' + str + '</h1>');
						//console.log(svgContentString);

						///*
                        var str = uiStrings.notification.loadingImage;
                        if (curConfig.exportWindowType === 'new') {
                            editor.exportWindowCt++;
                        }
                        exportWindowName = curConfig.canvasName + editor.exportWindowCt;
                        exportWindow = window.open('data:text/html;charset=utf-8,' + encodeURIComponent('<title>' + str + '</title><h1>' + str + '</h1>'), exportWindowName);
                        //*/
                    }

                    var imgType = 'PNG';
                    if (imgType === 'PDF')
                    {
                        if (!customExportPDF)
                        {
                            openExportWindow();
                        }
                        svgCanvas.exportPDF(exportWindowName);
                    }
                    else
					{
                        if (!customExportImage)
                        {
                            openExportWindow();
                        }
                        var quality = parseInt($('#image-slider').val(), 10)/100;
                        svgCanvas.rasterExport(imgType, quality, exportWindowName);
                    }
                }
            }

			var clickExport = function()
			{
				/*
				$.select(
                    uiStrings.notification.chooseImageTypeToExport, [
					// See http://kangax.github.io/jstests/toDataUrl_mime_type_test/ for a useful list of MIME types and browser support
					// 'ICO', // Todo: Find a way to preserve transparency in SVG-Edit if not working presently and do full packaging for x-icon; then switch back to position after 'PNG'
					'PNG',
					'JPEG', 'BMP', 'WEBP'//, 'PDF'
				], function (imgType) { // todo: replace hard-coded msg with uiStrings.notification.
					if (!imgType) {
						return;
					}
					// Open placeholder window (prevents popup)
					var exportWindowName;
					function openExportWindow () {
						var str = uiStrings.notification.loadingImage;
						if (curConfig.exportWindowType === 'new') {
							editor.exportWindowCt++;
						}
						exportWindowName = curConfig.canvasName + editor.exportWindowCt;
						exportWindow = window.open(
							'data:text/html;charset=utf-8,' + encodeURIComponent('<title>' + str + '</title><h1>' + str + '</h1>'),
							exportWindowName
						);
					}
					if (imgType === 'PDF') {
						if (!customExportPDF) {
							openExportWindow();
						}
						svgCanvas.exportPDF(exportWindowName);
					}
					else {
						if (!customExportImage) {
							openExportWindow();
						}
						var quality = parseInt($('#image-slider').val(), 10)/100;
						svgCanvas.rasterExport(imgType, quality, exportWindowName);
					}
				}, function () {
					var sel = $(this);
					if (sel.val() === 'JPEG' || sel.val() === 'WEBP') {
						if (!$('#image-slider').length) {
							$('<div><label>Quality: <input id="image-slider" type="range" min="1" max="100" value="92" /></label></div>').appendTo(sel.parent()); // Todo: i18n-ize label
						}
					}
					else {
						$('#image-slider').parent().remove();
					}
				});
				*/

                var currentDate = new Date();
                var imgName = currentDate.getFullYear() + '.' + (currentDate.getMonth() + 1)  + '.' + currentDate.getDate() + '-' + currentDate.getHours() + '.' + currentDate.getMinutes() + '.' + currentDate.getSeconds() + '.png';

                saveSvgAsPng(document.getElementById('svgcontent') , imgName , {scale:1} );
			};

            var clickExport_pdf = function()
            {
                var currentDate = new Date();
                var pdfName = currentDate.getFullYear() + '.' + (currentDate.getMonth() + 1)  + '.' + currentDate.getDate() + '-' + currentDate.getHours() + '.' + currentDate.getMinutes() + '.' + currentDate.getSeconds() + '.pdf';

                saveSvgAsBase64(document.getElementById('svgcontent') , 'test.png' , {scale:1} , function(pngData)
				{
                    var doc = new jsPDF('l', 'pt', [svgCanvas.contentW, svgCanvas.contentH]);

                    //doc.addImage(pngData, 'png', 0, 0, svgCanvas.contentW, svgCanvas.contentH);
					doc.addImage(pngData , 'PNG' , 0 , 0);

                    var pdfString = doc.output('datauristring');

                    download(pdfName , pdfString);
                });
            };

			// by default, svgCanvas.open() is a no-op.
			// it is up to an extension mechanism (opera widget, etc)
			// to call setCustomHandlers() which will make it do something
			var clickOpen = function() {
				svgCanvas.open();
			};

			var clickImport = function() {
			};

			var clickImportFromServer = function()
			{
                svgCanvas.openPartSelectPage();
            };

			var clickExportToServer = function()
			{
				svgCanvas.save();
			}

			var clickUndo = function()
			{
				if(svgCanvas.getMode() == 'path')
				{
                    path.undoPathNodeAdd();
					return;
				}

				if (undoMgr.getUndoStackSize() > 1)
				{
					var prevCmdNums = undoMgr.undo();

					var nextCmdNums = 1;
					// Process all related command
					while(prevCmdNums > 0 && undoMgr.getUndoStackSize() > 0)
					{
                        prevCmdNums = undoMgr.undo(nextCmdNums);
					}
					populateLayers();
				}
			};

			var clickRedo = function() {
				if (undoMgr.getRedoStackSize() > 0)
				{
					//undoMgr.redo();
					//populateLayers();

                    var nextCmdNums = undoMgr.redo();

                    // Process all related command
                    while(nextCmdNums > 0 && undoMgr.getRedoStackSize() > 0)
                    {
                        nextCmdNums = undoMgr.redo();
                    }

                    populateLayers();
				}
			};

			var clickGroup = function() {
				// group
				if (multiselected) {
					svgCanvas.groupSelectedElements();
				}
				// ungroup
				else if (selectedElement) {
					svgCanvas.ungroupSelectedElement();
				}
			};

			var clickClone = function() {
				svgCanvas.cloneSelectedElements(20, 20);
			};

			var clickAlign = function() {
				var letter = this.sel.replace('#tool_align', '').charAt(0);
				svgCanvas.alignSelectedElements(letter, $('#align_relative_to').val());
			};

            var clickAutposV = function() {
                svgCanvas.alignSelectedElements('v', $('#align_relative_to').val());
            };

            var clickAutposH = function() {
                svgCanvas.alignSelectedElements('h', $('#align_relative_to').val());
            };

			var clickFixAspect = function ()
			{
                $('#tool_fixaspect').toggleClass('push_button_pressed tool_button');

                svgCanvas.switchFixAspect();
			}

            var clickPathScissor = function()
            {
                if (svgCanvas.isScissoringPath())
                {
                    svgCanvas.exitScissoringPath();
                }
                else
                {
                	console.log('===========================clickPathScissor');
                    svgCanvas.enterScissoringPath();
                    svgCanvas.exitRemoveAnchorPoint();
                    svgCanvas.exitAddAnchorPoint();
                }
            }

			var clickAddAnchorPoint = editor.clickAddAnchorPoint = function()
			{
				if (svgCanvas.isAnchorPoint_Adding())
				{
                    svgCanvas.exitAddAnchorPoint();
				}
				else
				{
                    svgCanvas.enterAddAnchorPoint();
                    svgCanvas.exitRemoveAnchorPoint();
                    svgCanvas.exitScissoringPath();
				}
			}

			var clickRemoveAnchorPoint = editor.clickRemoveAnchorPoint = function()
			{
                if (svgCanvas.isAnchorPoint_Removing())
				{
                    svgCanvas.exitRemoveAnchorPoint();
				}
				else
				{
                    svgCanvas.enterRemoveAnchorPoint();
                    svgCanvas.exitAddAnchorPoint();
                    svgCanvas.exitScissoringPath();
				}
			}

			var clickCrossRuler = function()
			{
				$('#tool_crossruler').toggleClass('push_button_pressed tool_button');

				svgCanvas.switchCrossRuler();
			}

			var clickPartPreview = function()
			{
                $('#tool_partpreview').toggleClass('push_button_pressed push_button_pressed');

                svgCanvas.switchPreviewPanel();
			}

			var clickPartRefresh = function()
			{
                svgCanvas.refreshPreviewPanel();
			}
			var clickEdgesMiter = function () {
                $('#tool_edgesmiter').toggleClass('push_button_pressed tool_button');
                if($('#tool_edgesmiter').hasClass("push_button_pressed")){
                    setIcon("#tool_edgesmiter","edgesmitermiter");
                    svgCanvas.isToMiter = true;
				}else if($('#tool_edgesmiter').hasClass("tool_button")){
                    svgCanvas.isToMiter = false;
                    setIcon("#tool_edgesmiter","edgesmiter");
                }
            }
            var clickRectToPath = function () {
                svgCanvas.convertToPath(selectedElement);
                $("#temprect_selector").remove();
            }
            var clickInsertObj = function ()
            {
                svgCanvas.insertElemmentObj(objnum,num)
            }
            var clickIntersect = function ()
            {
                svgCanvas.splitNodeRecursively("intersect");
            }
            var clickTrim = function ()
            {
                svgCanvas.splitNodeRecursively("trim");
            }
            var clickUnion = function ()
            {
                svgCanvas.splitNodeRecursively("unite");
            }
            var clickMove = function ()
            {
                svgCanvas.moveLayer();
            }
			var clickCheckBoard = function()
			{
				$('#tool_checkboard').toggleClass('push_button_pressed tool_button');

				svgCanvas.switchCheckerBoard();
			}

			var clickEraserShape = function()
			{
                $('#tool_erasershape').toggleClass('push_button_pressed tool_button');

                svgCanvas.bitmapUtils.switchEraserShape();
			}

			var clickScaleMode = function ()
			{
				$('#tool_scalemode').toggleClass('push_button_pressed tool_button');

                svgCanvas.switchUniformMode();
			}

			var clickWireframe = function() {
				$('#tool_wireframe').toggleClass('push_button_pressed tool_button');
				workarea.toggleClass('wireframe');

				if (supportsNonSS) {return;}
				var wf_rules = $('#wireframe_rules');
				if (!wf_rules.length) {
					wf_rules = $('<style id="wireframe_rules"></style>').appendTo('head');
				} else {
					wf_rules.empty();
				}

				updateWireFrame();
			};

			$('#svg_docprops_container, #svg_prefs_container').draggable({cancel: 'button,fieldset', containment: 'window'});

			var showDocProperties = function() {
				if (docprops) {return;}
				docprops = true;

				// This selects the correct radio button by using the array notation
				$('#image_save_opts input').val([$.pref('img_save')]);

				// update resolution option with actual resolution
				var res = svgCanvas.getResolution();
				if (curConfig.baseUnit !== 'px') {
					res.w = svgedit.units.convertUnit(res.w) + curConfig.baseUnit;
					res.h = svgedit.units.convertUnit(res.h) + curConfig.baseUnit;
				}

				$('#canvas_width,#canvas_width_side').val(parseInt(res.w));
				$('#canvas_height,#canvas_height_side').val(parseInt(res.h));

				$('#canvas_title').val(svgCanvas.getDocumentTitle());

				$('#svg_docprops').show();
			};

			var showPreferences = function() {
				if (preferences) {return;}
				preferences = true;
				$('#main_menu').hide();

				// Update background color with current one
				var blocks = $('#bg_blocks div');
				var cur_bg = 'cur_background';
				var canvas_bg = curPrefs.bkgd_color;
				var url = $.pref('bkgd_url');
				blocks.each(function() {
					var blk = $(this);
					var is_bg = blk.css('background-color') == canvas_bg;
					blk.toggleClass(cur_bg, is_bg);
					if (is_bg) {$('#canvas_bg_url').removeClass(cur_bg);}
				});
				if (!canvas_bg) {blocks.eq(0).addClass(cur_bg);}
				if (url) {
					$('#canvas_bg_url').val(url);
				}
				$('#grid_snapping_on').prop('checked', curConfig.gridSnapping);
				$('#grid_snapping_step').attr('value', curConfig.snappingStep);
				$('#grid_color').attr('value', curConfig.gridColor);

				$('#svg_prefs').show();
			};

			var hideSourceEditor = function() {
				$('#svg_source_editor').hide();
				editingsource = false;
				$('#svg_source_textarea').blur();
			};

			var saveSourceEditor = function() {
				if (!editingsource) {return;}

				var saveChanges = function() {
					svgCanvas.clearSelection();
					hideSourceEditor();
					zoomImage();
					populateLayers();
					updateTitle();
					prepPaints();
				};

				if (!svgCanvas.setSvgString($('#svg_source_textarea').val())) {
					$.confirm(uiStrings.notification.QerrorsRevertToSource, function(ok) {
						if (!ok) {return false;}
						saveChanges();
					});
				} else {
					saveChanges();
				}
				setSelectMode(6);
			};

			var hideDocProperties = function() {
				$('#svg_docprops').hide();
				$('#canvas_width,#canvas_height').removeAttr('disabled');
				$('#resolution')[0].selectedIndex = 0;
				$('#image_save_opts input').val([$.pref('img_save')]);
				docprops = false;
			};

			var hidePreferences = function() {
				$('#svg_prefs').hide();
				preferences = false;
			};

			var saveDocProperties = function() {
				// set title
				var newTitle = $('#canvas_title').val();
				updateTitle(newTitle);
				svgCanvas.setDocumentTitle(newTitle);

				// update resolution
				var width = $('#canvas_width'), w = width.val();
				var height = $('#canvas_height'), h = height.val();

				if (w != 'fit' && !svgedit.units.isValidUnit('width', w)) {
					$.alert(uiStrings.notification.invalidAttrValGiven);
					width.parent().addClass('error');
					return false;
				}

				width.parent().removeClass('error');

				if (h != 'fit' && !svgedit.units.isValidUnit('height', h)) {
					$.alert(uiStrings.notification.invalidAttrValGiven);
					height.parent().addClass('error');
					return false;
				}

				height.parent().removeClass('error');

				if (!svgCanvas.setResolution(w, h)) {
					$.alert(uiStrings.notification.noContentToFitTo);
					return false;
				}

				// Set image save option
				$.pref('img_save', $('#image_save_opts :checked').val());
				updateCanvas();
				hideDocProperties();
			};

			var savePreferences = editor.savePreferences = function() {
				// Set background
				var color = $('#bg_blocks div.cur_background').css('background-color') || '#FFF';
				setBackground(color, $('#canvas_bg_url').val());

				// set language
				var lang = $('#lang_select').val();
				if (lang !== $.pref('lang')) {
					editor.putLocale(lang, good_langs);
				}

				// set icon size
				setIconSize($('#iconsize').val());

				// set grid setting
				curConfig.gridSnapping = $('#grid_snapping_on')[0].checked;
				curConfig.snappingStep = $('#grid_snapping_step').val();
				curConfig.gridColor = $('#grid_color').val();
				curConfig.showRulers = $('#show_rulers')[0].checked;

				$('#rulers').toggle(curConfig.showRulers);
				if (curConfig.showRulers) {updateRulers();}
				curConfig.baseUnit = $('#base_unit').val();

				svgCanvas.setConfig(curConfig);

				updateCanvas();
				hidePreferences();
			};

			var resetScrollPos = $.noop;

			var cancelOverlays = function() {
				$('#dialog_box').hide();
				if (!editingsource && !docprops && !preferences) {
					if (cur_context) {
						svgCanvas.leaveContext();
					}
					return;
				}

				if (editingsource) {
					if (origSource !== $('#svg_source_textarea').val()) {
						$.confirm(uiStrings.notification.QignoreSourceChanges, function(ok) {
							if (ok) {hideSourceEditor();}
						});
					} else {
						hideSourceEditor();
					}
				} else if (docprops) {
					hideDocProperties();
				} else if (preferences) {
					hidePreferences();
				}
				resetScrollPos();
			};

			var win_wh = {width:$(window).width(), height:$(window).height()};

			// Fix for Issue 781: Drawing area jumps to top-left corner on window resize (IE9)
			if (svgedit.browser.isIE()) {
				(function() {
					resetScrollPos = function() {
						if (workarea[0].scrollLeft === 0 && workarea[0].scrollTop === 0) {
							workarea[0].scrollLeft = curScrollPos.left;
							workarea[0].scrollTop = curScrollPos.top;
						}
					};

					curScrollPos = {
						left: workarea[0].scrollLeft,
						top: workarea[0].scrollTop
					};

					$(window).resize(resetScrollPos);
					editor.ready(function() {
						// TODO: Find better way to detect when to do this to minimize
						// flickering effect
						setTimeout(function() {
							resetScrollPos();
						}, 500);
					});

					workarea.scroll(function() {
						curScrollPos = {
							left: workarea[0].scrollLeft,
							top: workarea[0].scrollTop
						};
					});
				}());
			}

			$(window).resize(function(evt) {
				$.each(win_wh, function(type, val) {
					var curval = $(window)[type]();
					workarea[0]['scroll' + (type === 'width' ? 'Left' : 'Top')] -= (curval - val)/2;
					win_wh[type] = curval;
				});
				setFlyoutPositions();
			});

			(function() {
				workarea.scroll(function() {
					// TODO: jQuery's scrollLeft/Top() wouldn't require a null check
					if ($('#ruler_x').length != 0) {
						$('#ruler_x')[0].scrollLeft = workarea[0].scrollLeft;
					}
					if ($('#ruler_y').length != 0) {
						$('#ruler_y')[0].scrollTop = workarea[0].scrollTop;
					}
				});

			}());

			$('#url_notice').click(function() {
				$.alert(this.title);
			});

			$('#change_image_url').click(promptImgURL);

			// added these event handlers for all the push buttons so they
			// behave more like buttons being pressed-in and not images
			(function() {
				var toolnames = ['clear', 'open', 'save', 'source', 'delete', 'delete_multi', 'paste', 'clone', 'clone_multi', 'move_top', 'move_bottom'];
				var all_tools = '';
				var cur_class = 'tool_button_current';

				$.each(toolnames, function(i, item) {
					all_tools += (i ? ',' : '') + '#tool_' + item;
				});

				$(all_tools).mousedown(function() {
					$(this).addClass(cur_class);
				}).bind('mousedown mouseout', function() {
					$(this).removeClass(cur_class);
				});

				$('#tool_undo, #tool_redo').mousedown(function() {
					if (!$(this).hasClass('disabled')) {$(this).addClass(cur_class);}
				}).bind('mousedown mouseout',function() {
					$(this).removeClass(cur_class);}
				);
			}());

			// switch modifier key in tooltips if mac
			// NOTE: This code is not used yet until I can figure out how to successfully bind ctrl/meta
			// in Opera and Chrome
			if (svgedit.browser.isMac() && !window.opera) {
				var shortcutButtons = ['tool_clear', 'tool_save', 'tool_source', 'tool_undo', 'tool_redo', 'tool_clone'];
				i = shortcutButtons.length;
				while (i--) {
					var button = document.getElementById(shortcutButtons[i]);
					if (button) {
						var title = button.title;
						var index = title.indexOf('Ctrl+');
						button.title = [title.substr(0, index), 'Cmd+', title.substr(index + 5)].join('');
					}
				}
			}

			// TODO: go back to the color boxes having white background-color and then setting
			//	background-image to none.png (otherwise partially transparent gradients look weird)
            var colorPicker_new = function(_picker) {
                var picker = _picker;
                var paint = paintBox[picker].paint;
                var title = (picker == 'stroke' ? 'Pick a Stroke Color and Opacity' : 'Pick a Fill Color and Opacity');
                // var was_none = false; // Currently unused
                $('#color_picker')
                    .draggable({cancel: '.jGraduate_tabs, .jGraduate_colPick, .jGraduate_gradPick, .jPicker', containment: 'window'})
                    .css(curConfig.colorPickerCSS || {'left': 50, 'bottom': 100})
                    .jGraduate(
                        {
                            paint: paint,
                            window: { pickerTitle: title },
                            images: { clientPath: curConfig.jGraduatePath },
                            newstop: 'inverse'
                        },
                        function(p) {
                            paint = new $.jGraduate.Paint(p);
                            paintBox[picker].setPaint(paint);
                            svgCanvas.setPaint_New(picker, paint);
                            $('#color_picker').hide();
                            $('#color_picker_background').hide();
                        },
                        function() {
                            $('#color_picker').hide();
                            $('#color_picker_background').hide();
                        },
                        function(p) {
                            paint = new $.jGraduate.Paint(p);
                            paintBox[picker].setPaint(paint);
                            svgCanvas.setPaint_New(picker, paint);
                        }
					);

                $('#color_picker_background').show();
            };

			var colorPicker = function(elem) {
				var picker = elem.attr('id') == 'stroke_color' ? 'stroke' : 'fill';
//				var opacity = (picker == 'stroke' ? $('#stroke_opacity') : $('#fill_opacity'));
				var paint = paintBox[picker].paint;
				var title = (picker == 'stroke' ? 'Pick a Stroke Paint and Opacity' : 'Pick a Fill Paint and Opacity');
				// var was_none = false; // Currently unused
				var pos = elem.offset();
				$('#color_picker')
					.draggable({cancel: '.jGraduate_tabs, .jGraduate_colPick, .jGraduate_gradPick, .jPicker', containment: 'window'})
					.css(curConfig.colorPickerCSS || {'left': pos.left - 140, 'bottom': 40})
					.jGraduate(
					{
						paint: paint,
						window: { pickerTitle: title },
						images: { clientPath: curConfig.jGraduatePath },
						newstop: 'inverse'
					},
					function(p) {
						paint = new $.jGraduate.Paint(p);
						paintBox[picker].setPaint(paint);
						svgCanvas.setPaint(picker, paint);
						$('#color_picker').hide();
                        $('#color_picker_background').hide();
					},
					function() {
						$('#color_picker').hide();
                        $('#color_picker_background').hide();
					});

                $('#color_picker_background').show();
			};

			var PaintBox = function(container, type) {
				var paintColor, paintOpacity,
					cur = curConfig[type === 'fill' ? 'initFill' : 'initStroke'];
				var nocolorid = (type === 'fill' ? 'img_fill_nocolor' : 'img_stroke_nocolor');
				// set up gradients to be used for the buttons
				var svgdocbox = new DOMParser().parseFromString(
					'<svg xmlns="http://www.w3.org/2000/svg"><rect width="22" height="22"'+
'					fill="#' + cur.color + '" opacity="' + cur.opacity + '"/>'+
'					<defs><linearGradient id="gradbox_"/></defs></svg>', 'text/xml');
				var docElem = svgdocbox.documentElement;

				docElem = $(container)[0].appendChild(document.importNode(docElem, true));
				docElem.setAttribute('width',22);

				this.rect = docElem.firstChild;
				this.defs = docElem.getElementsByTagName('defs')[0];
				this.grad = this.defs.firstChild;
				this.paint = new $.jGraduate.Paint({solidColor: cur.color});
				this.type = type;

				this.getColor = function()
				{
					if (paintColor == undefined)
					{
						return this.paint.solidColor;
					}

					return paintColor;
				}

				this.getOpacity = function()
				{
					if (paintOpacity == undefined)
					{
						return this.paint.alpha;
					}

					return paintOpacity;
				}

				this.setPaint = function(paint, apply) {
					this.paint = paint;

					var fillAttr = 'none';
					var ptype = paint.type;
					var opac = paint.alpha / 100;

					switch ( ptype ) {
						case 'solidColor':
							fillAttr = (paint[ptype] != 'none') ? '#' + paint[ptype] : paint[ptype];
							break;
						case 'linearGradient':
						case 'radialGradient':
							this.defs.removeChild(this.grad);
							this.grad = this.defs.appendChild(paint[ptype]);
							var id = this.grad.id = 'gradbox_' + this.type;
							fillAttr = 'url(#' + id + ')';
							break;
					}

					this.rect.setAttribute('fill', fillAttr);
					this.rect.setAttribute('opacity', opac);

					if (opac == 0)
					{
                        $('#' + nocolorid).show();
					}
					else
					{
                        $('#' + nocolorid).hide();
					}

					if (apply) {
						svgCanvas.setColor(this.type, paintColor, true);
						svgCanvas.setPaintOpacity(this.type, paintOpacity, true);
					}
				};

				this.update = function(apply) {
					if (!selectedElement) {return;}
					var i, len;
					var type = this.type;
					switch (selectedElement.tagName) {
					case 'use':
					case 'image':
					case 'foreignObject':
						// These elements don't have fill or stroke, so don't change
						// the current value
						return;
					case 'g':
					case 'a':
						var gPaint = null;

						var childs = selectedElement.getElementsByTagName('*');
						for (i = 0, len = childs.length; i < len; i++) {
							var elem = childs[i];
							var p = elem.getAttribute(type);
							if (i === 0) {
								gPaint = p;
							} else if (gPaint !== p) {
								gPaint = null;
								break;
							}
						}

						if (gPaint === null) {
							// No common color, don't update anything
							paintColor = null;
							return;
						}
						paintColor = gPaint;
						paintOpacity = 1;
						break;
					default:
						paintOpacity = parseFloat(selectedElement.getAttribute(type + '-opacity'));
						if (isNaN(paintOpacity)) {
							paintOpacity = 1.0;
						}

						var defColor = type === 'fill' ? 'black' : 'none';
						paintColor = selectedElement.getAttribute(type) || defColor;
					}

					if (apply) {
						svgCanvas.setColor(type, paintColor, true);
						svgCanvas.setPaintOpacity(type, paintOpacity, true);
					}

					paintOpacity *= 100;

					var paint = getPaint(paintColor, paintOpacity, type);
					// update the rect inside #fill_color/#stroke_color
					this.setPaint(paint);
				};

				this.refreshColor = function(_color)
				{
					svgCanvas.setColor('stroke', _color, true);
					svgCanvas.setPaintOpacity('stroke', 100, true);

					var paint = getPaint(_color, 100, 'stroke');
					// update the rect inside #fill_color/#stroke_color
					this.setPaint(paint);
				}

				this.prep = function() {
					var ptype = this.paint.type;

					switch ( ptype ) {
						case 'linearGradient':
						case 'radialGradient':
							var paint = new $.jGraduate.Paint({copy: this.paint});
							svgCanvas.setPaint(type, paint);
							break;
					}
				};
			};

			paintBox.fill = new PaintBox('#fill_color', 'fill');
			paintBox.stroke = new PaintBox('#stroke_color', 'stroke');

			$('#stroke_width').val(curConfig.initStroke.width);
			$('#group_opacity').val(curConfig.initOpacity * 100);

			// Use this SVG elem to test vectorEffect support
			var testEl = paintBox.fill.rect.cloneNode(false);
			testEl.setAttribute('style', 'vector-effect:non-scaling-stroke');
			supportsNonSS = (testEl.style.vectorEffect === 'non-scaling-stroke');
			testEl.removeAttribute('style');
			var svgdocbox = paintBox.fill.rect.ownerDocument;
			// Use this to test support for blur element. Seems to work to test support in Webkit
			var blurTest = svgdocbox.createElementNS(svgedit.NS.SVG, 'feGaussianBlur');
			if (blurTest.stdDeviationX === undefined) {
				$('#tool_blur').hide();
			}
			$(blurTest).remove();

			// Test for zoom icon support
			(function() {
				var pre = '-' + uaPrefix.toLowerCase() + '-zoom-';
				var zoom = pre + 'in';
				workarea.css('cursor', 'default');
				if (workarea.css('cursor') === zoom) {
					zoomInIcon = zoom;
					zoomOutIcon = pre + 'out';
				}
				workarea.css('cursor', 'default');
			}());

			// Test for embedImage support (use timeout to not interfere with page load)
			setTimeout(function() {
				svgCanvas.embedImage('images/logo.png', function(datauri) {
					if (!datauri) {
						// Disable option
						$('#image_save_opts [value=embed]').attr('disabled', 'disabled');
						$('#image_save_opts input').val(['ref']);
						$.pref('img_save', 'ref');
						$('#image_opt_embed').css('color', '#666').attr('title', uiStrings.notification.featNotSupported);
					}
				});
			}, 1000);

			$('#fill_color, #tool_fill .icon_label').click(function() {
				colorPicker($('#fill_color'));
				updateToolButtonState();
			});

			$('#stroke_color, #tool_stroke .icon_label').click(function() {
				colorPicker($('#stroke_color'));
				updateToolButtonState();
			});

			$('#group_opacityLabel').click(function() {
				$('#opacity_dropdown button').mousedown();
				$(window).mouseup();
			});

			$('#zoomLabel').click(function() {
				//$('#zoom_dropdown button').mousedown();
				//$(window).mouseup();
			});

			$('#tool_move_top').mousedown(function(evt) {
				$('#tools_stacking').show();
				evt.preventDefault();
			});

			$('.layer_button').mousedown(function() {
				$(this).addClass('layer_buttonpressed');
			}).mouseout(function() {
				$(this).removeClass('layer_buttonpressed');
			}).mouseup(function() {
				$(this).removeClass('layer_buttonpressed');
			});

			$('.push_button').mousedown(function() {
				if (!$(this).hasClass('disabled')) {
					$(this).addClass('push_button_pressed').removeClass('push_button');
				}
			}).mouseout(function() {
				$(this).removeClass('push_button_pressed').addClass('push_button');
			}).mouseup(function() {
				$(this).removeClass('push_button_pressed').addClass('push_button');
			});

			// ask for a layer name
			$('#layer_new').click(function() {
				var uniqName,
					i = svgCanvas.getCurrentDrawing().getNumLayers();
				do {
					uniqName = uiStrings.layers.layer + ' ' + (++i);
				} while(svgCanvas.getCurrentDrawing().hasLayer(uniqName));

				$.prompt(uiStrings.notification.enterUniqueLayerName, uniqName, function(newName) {
					if (!newName) {return;}
					if (svgCanvas.getCurrentDrawing().hasLayer(newName)) {
						$.alert(uiStrings.notification.dupeLayerName);
						return;
					}
					svgCanvas.createLayer(newName);
					updateContextPanel();
					populateLayers();
				});
			});

			function deleteLayer() {
				if (svgCanvas.deleteCurrentLayer()) {
					updateContextPanel();
					populateLayers();
					// This matches what SvgCanvas does
					// TODO: make this behavior less brittle (svg-editor should get which
					// layer is selected from the canvas and then select that one in the UI)
					$('#layerlist tr.layer').removeClass('layersel');
					$('#layerlist tr.layer:first').addClass('layersel');
				}
			}

			function cloneLayer() {
				var name = svgCanvas.getCurrentDrawing().getCurrentLayerName() + ' copy';

				$.prompt(uiStrings.notification.enterUniqueLayerName, name, function(newName) {
					if (!newName) {return;}
					if (svgCanvas.getCurrentDrawing().hasLayer(newName)) {
						$.alert(uiStrings.notification.dupeLayerName);
						return;
					}
					svgCanvas.cloneLayer(newName);
					updateContextPanel();
					populateLayers();
				});
			}

			function mergeLayer() {
				if ($('#layerlist tr.layersel').index() == svgCanvas.getCurrentDrawing().getNumLayers()-1) {
					return;
				}
				svgCanvas.mergeLayer();
				updateContextPanel();
				populateLayers();
			}

			function moveLayer(pos) {
				var curIndex = $('#layerlist tr.layersel').index();
				var total = svgCanvas.getCurrentDrawing().getNumLayers();
				if (curIndex > 0 || curIndex < total-1) {
					curIndex += pos;
					svgCanvas.setCurrentLayerPosition(total-curIndex-1);
					populateLayers();
				}
			}

			$('#layer_delete').click(deleteLayer);

			$('#layer_up').click(function() {
				moveLayer(-1);
			});

			$('#layer_down').click(function() {
				moveLayer(1);
			});

			$('#layer_lock').click(function()
			{
                var name =  $('#layerlist tr.layersel td.layername').text();

                // Change lock state of active layer
                svgCanvas.setLayerLocked(name, !svgCanvas.getCurrentDrawing().getLayerLocked(name));

                // Change state of lock icon
                $('#layerlist td.layerlock').toggleClass('layerunlock');
			});

			$('#layer_rename').click(function() {
				// var curIndex = $('#layerlist tr.layersel').prevAll().length; // Currently unused
				var oldName = $('#layerlist tr.layersel td.layername').text();
				$.prompt(uiStrings.notification.enterNewLayerName, '', function(newName) {
					if (!newName) {return;}
					if (oldName == newName || svgCanvas.getCurrentDrawing().hasLayer(newName)) {
						$.alert(uiStrings.notification.layerHasThatName);
						return;
					}

					svgCanvas.renameCurrentLayer(newName);
					populateLayers();
				});
			});

			var SIDEPANEL_MAXWIDTH = 300;
			var SIDEPANEL_OPENWIDTH = 150;
			var sidedrag = -1, sidedragging = false, allowmove = false;

			var changeSidePanelWidth = function(delta)
			{
				//console.log('========================== change side panel width with: ' + delta);

				return;
				///*
				var rulerX = $('#ruler_x');
				$('#sidepanels').width('+=' + delta);
                $('#canvaspanel').width('+=' + delta);
				$('#layerpanel').width('+=' + delta);
				$('#objectpanel').width('+=' + delta);
				$('#colorpanel').width('+=' + delta);
				$('#fillpatternpanel').width('+=' + delta);
				$('#fillstylepanel').width('+=' + delta);
				$('#strokestylepanel').width('+=' + delta);

				rulerX.css('right', parseInt(rulerX.css('right'), 10) + delta);
				workarea.css('right', parseInt(workarea.css('right'), 10) + delta);
				svgCanvas.runExtensions('workareaResized');
				//*/
			};

			var resizeSidePanel = function(evt) {
				if (!allowmove) {return;}
				if (sidedrag == -1) {return;}
				sidedragging = true;
				var deltaX = sidedrag - evt.pageX;
				var sideWidth = $('#sidepanels').width();
				if (sideWidth + deltaX > SIDEPANEL_MAXWIDTH) {
					deltaX = SIDEPANEL_MAXWIDTH - sideWidth;
					sideWidth = SIDEPANEL_MAXWIDTH;
				} else if (sideWidth + deltaX < 2) {
					deltaX = 2 - sideWidth;
					sideWidth = 2;
				}
				if (deltaX == 0) {return;}
				sidedrag -= deltaX;
				changeSidePanelWidth(deltaX);
			};

			// if width is non-zero, then fully close it, otherwise fully open it
			// the optional close argument forces the side panel closed
			var toggleSidePanel = function(close) {
				var w = $('#sidepanels').width();
				var deltaX = (w > 2 || close ? 2 : SIDEPANEL_OPENWIDTH) - w;
				changeSidePanelWidth(deltaX);
			};

            toggleSidePanel();

			$('#sidepanel_handle')
				.mousedown(function(evt) {
					sidedrag = evt.pageX;
					$(window).mousemove(resizeSidePanel);
					allowmove = false;
					// Silly hack for Chrome, which always runs mousemove right after mousedown
					setTimeout(function() {
						allowmove = true;
					}, 20);
				})
				.mouseup(function(evt) {
					if (!sidedragging) {toggleSidePanel();}
					sidedrag = -1;
					sidedragging = false;
				});

			$(window).mouseup(function() {
				sidedrag = -1;
				sidedragging = false;
				$('#svg_editor').unbind('mousemove', resizeSidePanel);
			});

			populateLayers();

		//	function changeResolution(x,y) {
		//		var zoom = svgCanvas.getResolution().zoom;
		//		setResolution(x * zoom, y * zoom);
		//	}

			var centerCanvas = function() {
				// this centers the canvas vertically in the workarea (horizontal handled in CSS)
				workarea.css('line-height', workarea.height() + 'px');
			};

			$(window).bind('load resize', centerCanvas);

			function stepFontSize(elem, step) {
				var orig_val = Number(elem.value);
				var sug_val = orig_val + step;
				var increasing = sug_val >= orig_val;
				if (step === 0) {return orig_val;}

				if (orig_val >= 24) {
					if (increasing) {
						return Math.round(orig_val * 1.1);
					}
					return Math.round(orig_val / 1.1);
				}
				if (orig_val <= 1) {
					if (increasing) {
						return orig_val * 2;
					}
					return orig_val / 2;
				}
				return sug_val;
			}

			function stepZoom(elem, step) {
				var orig_val = Number(elem.value);
				if (orig_val === 0) {return 100;}
				var sug_val = orig_val + step;
				if (step === 0) {return orig_val;}

				if (orig_val >= 100) {
					return sug_val;
				}
				if (sug_val >= orig_val) {
					return orig_val * 2;
				}
				return orig_val / 2;
			}

		//	function setResolution(w, h, center) {
		//		updateCanvas();
		// //		w-=0; h-=0;
		// //		$('#svgcanvas').css( { 'width': w, 'height': h } );
		// //		$('#canvas_width').val(w);
		// //		$('#canvas_height').val(h);
		// //
		// //		if (center) {
		// //			var w_area = workarea;
		// //			var scroll_y = h/2 - w_area.height()/2;
		// //			var scroll_x = w/2 - w_area.width()/2;
		// //			w_area[0].scrollTop = scroll_y;
		// //			w_area[0].scrollLeft = scroll_x;
		// //		}
		//	}

			$('#resolution').change(function() {
				var wh = $('#canvas_width,#canvas_height');
				if (!this.selectedIndex) {
					if ($('#canvas_width').val() == 'fit') {
						wh.removeAttr('disabled').val(100);
					}
				} else if (this.value == 'content') {
					wh.val('fit').attr('disabled', 'disabled');
				} else {
					var dims = this.value.split('x');
					$('#canvas_width,#canvas_width_side').val(parseInt(dims[0]));
					$('#canvas_height,#canvas_height_side').val(parseInt(dims[1]));
					wh.removeAttr('disabled');
				}
			});

            $('#canvas_width_side , #canvas_height_side, #resolution_side').change(function() {
                var wh = $('#canvas_width,#canvas_height');
                if (!this.selectedIndex) {
                    if ($('#canvas_width').val() == 'fit') {
                        wh.removeAttr('disabled').val(100);
                    }
                } else if (this.value == 'content') {
                    wh.val('fit').attr('disabled', 'disabled');
                } else {
                    var dims = this.value.split('x');
                    $('#canvas_width,#canvas_width_side').val(parseInt(dims[0]));
                    $('#canvas_height,#canvas_height_side').val(parseInt(dims[1]));
                    wh.removeAttr('disabled');
                }

                /********************************************************/
                var width = $('#canvas_width_side'), w = parseInt(width.val());
                var height = $('#canvas_height_side'), h = parseInt(height.val());

                if (w != 'fit' && !svgedit.units.isValidUnit('width', w)) {
                    $.alert(uiStrings.notification.invalidAttrValGiven);
                    width.parent().addClass('error');
                    return false;
                }

                width.parent().removeClass('error');

                if (h != 'fit' && !svgedit.units.isValidUnit('height', h)) {
                    $.alert(uiStrings.notification.invalidAttrValGiven);
                    height.parent().addClass('error');
                    return false;
                }

                height.parent().removeClass('error');

                if (!svgCanvas.setResolution(w, h)) {
                    $.alert(uiStrings.notification.noContentToFitTo);
                    return false;
                }

                // Set image save option
                $.pref('img_save', $('#image_save_opts :checked').val());
                updateCanvas();

                clickSelect();
            });

			//Prevent browser from erroneously repopulating fields
			$('input,select').attr('autocomplete', 'off');

			// Associate all button actions as well as non-button keyboard shortcuts
			Actions = (function() {
				// sel:'selector', fn:function, evt:'event', key:[key, preventDefault, NoDisableInInput]
				var tool_buttons = [
                    {sel: '#tool_cp_fill_color' , fn: clickFillColor , evt: 'click'},
                    {sel: '#tool_cp_stroke_color' , fn: clickStrokeColor , evt: 'click'},
                    {sel: '#tool_cp_switch' , fn: clickSwitchStrokeFill , evt: 'click'},
					{sel: '#tool_select', fn: clickSelect, evt: 'click' , checklock:true},
					{sel: '#tool_selectnode', fn: clickSelectNode, evt: 'click' , checklock:true},
                    {sel: '#tool_lasso', fn: clickLasso, evt: 'click' , checklock:true},
                    {sel: '#tool_quickselect', fn: clickQuickSelect, evt: 'mouseup' , checklock:true, parent:'#tools_quickselect', icon:'quickselect'},
                    {sel: '#tool_quickselect_rect', fn: clickQuickSelectRect, evt: 'mouseup' , checklock:true, parent:'#tools_quickselect', icon:'quickselect_rect'},
					{sel: '#tool_fhpath', fn: clickFHPath, evt: 'click' , checklock:true},
					{sel: '#tool_line', fn: clickLine, evt: 'click' , checklock:true},
					{sel: '#tool_rect', fn: clickRect, evt: 'mouseup' , checklock:true, parent: '#tools_rect', icon: 'rect'},
					{sel: '#tool_square', fn: clickSquare, evt: 'mouseup' , checklock:true, parent: '#tools_rect', icon: 'square'},
					{sel: '#tool_fhrect', fn: clickFHRect, evt: 'mouseup' , checklock:true, parent: '#tools_rect', icon: 'fh_rect'},
					{sel: '#tool_ellipse', fn: clickEllipse, evt: 'mouseup' , checklock:true, parent: '#tools_ellipse', icon: 'ellipse'},
					{sel: '#tool_circle', fn: clickCircle, evt: 'mouseup' , checklock:true, parent: '#tools_ellipse', icon: 'circle'},
					{sel: '#tool_fhellipse', fn: clickFHEllipse, evt: 'mouseup' , checklock:true, parent: '#tools_ellipse', icon: 'fh_ellipse'},
					{sel: '#tool_path', fn: clickPath, evt: 'click' , checklock:true},
					{sel: '#tool_text', fn: clickText, evt: 'click' , checklock:true},
					{sel: '#tool_image', fn: clickImage, evt: 'mouseup' , checklock:true},
					{sel: '#tool_zoom', fn: clickZoom, evt: 'mouseup'},
					{sel: '#tool_eraser', fn: clickEraser , evt: 'click' , checklock:true},
					{sel: '#tool_colorpicker', fn: clickColorPicker , evt: 'click' , checklock:true},
					{sel: '#tool_sketchpad' , fn: clickSketchpad , evt: 'click' , checklock:true},
                    {sel: '#tool_slice' , fn: clickSlice , evt: 'click' , checklock:true},
					{sel: '#tool_pngtosvg' , fn: clickPngtosvg , evt: 'click' , checklock:true},
                    {sel: '#tool_flip_h' , fn: clickFlipH , evt: 'click' , checklock:true},
                    {sel: '#tool_flip_v' , fn: clickFlipV , evt: 'click' , checklock:true},
					{sel: '#tool_clear', fn: clickClear, evt: 'mouseup'},
					{sel: '#tool_save', fn: function() {
						if (editingsource) {
							saveSourceEditor();
						}
						else {
							clickSave();
						}
					}, evt: 'mouseup', key: ['S', true]},
                    {sel: '#tool_submit', fn: clickSubmit, evt: 'click'},
                    {sel: '#tool_backtolib', fn: clickBacktolib, evt: 'click'},
					{sel: '#tool_checkout', fn: clickCheckout , evt: 'click'},
					{sel: '#tool_importpart' , fn: clickImportFromServer , evt: 'click'},
                    {sel: '#tool_exportpart' , fn: clickExportToServer , evt: 'click'},
					{sel: '#tool_export', fn: clickExport, evt: 'mouseup'},
                    {sel: '#tool_export_pdf', fn: clickExport_pdf, evt: 'mouseup'},
					{sel: '#tool_open', fn: clickOpen, evt: 'mouseup', key: ['O', true]},
					{sel: '#tool_import', fn: clickImport, evt: 'mouseup'},
                    {sel: '#tool_import_server', fn: clickImportFromServer, evt: 'mouseup'},
					{sel: '#tool_source', fn: showSourceEditor, evt: 'click'},
					{sel: '#tool_wireframe', fn: clickWireframe, evt: 'click'},
                    {sel: '#tool_scalemode', fn: clickScaleMode, evt: 'click'},
					{sel: '#tool_fixaspect', fn: clickFixAspect , evt: 'click'},
					{sel: '#tool_crossruler' , fn: clickCrossRuler , evt: 'click'},
					{sel: '#tool_checkboard' , fn: clickCheckBoard , evt: 'click'},
                    {sel: '#tool_partpreview' , fn: clickPartPreview , evt: 'click'},
                    {sel: '#tool_partrefresh' , fn: clickPartRefresh , evt: 'click'},
                    {sel: '#tool_edgesmiter' , fn: clickEdgesMiter , evt: 'click'},
                    {sel: '#recttopath' , fn: clickRectToPath , evt: 'click'},
                    {sel: '#insertobj' , fn: clickInsertObj , evt: 'click'},
                    {sel: '#tool_Intersect' , fn: clickIntersect , evt: 'click'},
                    {sel: '#tool_Trim' , fn: clickTrim , evt: 'click'},
                    {sel: '#tool_Union' , fn: clickUnion , evt: 'click'},
                    {sel: '#tool_Move' , fn: clickMove , evt: 'click'},
                    {sel: '#tool_erasershape', fn: clickEraserShape , evt: 'click'},
                    {sel: '#tool_add_anchorpoint', fn: clickAddAnchorPoint, evt: 'click'},
                    {sel: '#tool_remove_anchorpoint', fn: clickRemoveAnchorPoint , evt: 'click'},
					{sel: '#tool_source_cancel,.overlay,#tool_docprops_cancel,#tool_prefs_cancel', fn: cancelOverlays, evt: 'click', key: ['esc', false, false], hidekey: true},
                    {sel: '#tool_prefs_recover', fn: clickDataRecover , evt: 'click'},
					{sel: '#tool_source_save', fn: saveSourceEditor, evt: 'click'},
					{sel: '#tool_docprops_save', fn: saveDocProperties, evt: 'click'},
					{sel: '#tool_docprops', fn: showDocProperties, evt: 'mouseup'},
					{sel: '#tool_prefs_save', fn: savePreferences, evt: 'click'},
					{sel: '#tool_prefs_option', fn: function() {showPreferences(); return false;}, evt: 'mouseup'},
					{sel: '#tool_delete,#tool_delete_multi', fn: deleteSelected, evt: 'click', key: ['del/backspace', true]},
					{sel: '#tool_reorient', fn: reorientPath, evt: 'click'},
					{sel: '#tool_node_link', fn: linkControlPoints, evt: 'click'},
					{sel: '#tool_node_clone', fn: clonePathNode, evt: 'click'},
					{sel: '#tool_add_ctrlpoint' , fn: clickAddCtrlPoint , evt: 'click'},
					{sel: '#tool_remove_ctrlpoint' , fn: clickRemoveCtrlPoints , evt: 'click'},
                    {sel: '#tool_remove_ctrlpoint_red' , fn: clickRemoveCtrlPointsRed , evt: 'click'},
					{sel: '#tool_remove_ctrlpoint_green', fn: clickRemoveCtrlPointsGreen, evt: 'click'},
                    {sel: '#tool_connect_anchors', fn: clickConnectAnchors, evt: 'click'},
                    {sel: '#tool_openclose_paths', fn: clickOpenClosePaths, evt: 'click'},
                    {sel: '#tool_path_scissor', fn: clickPathScissor, evt: 'click'},
					{sel: '#tool_openclose_path', fn: opencloseSubPath, evt: 'click'},
					{sel: '#tool_add_subpath', fn: addSubPath, evt: 'click'},
					{sel: '#tool_move_top', fn: moveToTopSelected, evt: 'click', key: 'ctrl+shift+]'},
					{sel: '#tool_move_bottom', fn: moveToBottomSelected, evt: 'click', key: 'ctrl+shift+['},
					{sel: '#tool_topath', fn: convertToPath, evt: 'click'},
					{sel: '#tool_make_link,#tool_make_link_multi', fn: makeHyperlink, evt: 'click'},
					{sel: '#tool_undo', fn: clickUndo, evt: 'click' , checklock:true},
					{sel: '#tool_redo', fn: clickRedo, evt: 'click' , checklock:true},
					{sel: '#tool_clone,#tool_clone_multi', fn: clickClone, evt: 'click', key: ['D', true]},
					{sel: '#tool_group_elements', fn: clickGroup, evt: 'click', key: ['G', true]},
					{sel: '#tool_ungroup', fn: clickGroup, evt: 'click'},
					{sel: '#tool_unlink_use', fn: clickGroup, evt: 'click'},
					{sel: '#tool_alignleft', fn: clickAlign, evt: 'click'},
                    {sel: '#tool_aligncenter', fn: clickAlign, evt: 'click'},
                    {sel: '#tool_autoposcenter', fn: clickAutposV, evt: 'click'},
                    {sel: '#tool_autoposmiddle', fn: clickAutposH, evt: 'click'},
                    {sel: '#tool_alignright', fn: clickAlign, evt: 'click'},
                    {sel: '#tool_aligntop', fn: clickAlign, evt: 'click'},
                    {sel: '#tool_alignmiddle', fn: clickAlign, evt: 'click'},
                    {sel: '#tool_alignbottom', fn: clickAlign, evt: 'click'},

					// these two lines are required to make Opera work properly with the flyout mechanism
		//			{sel: '#tools_rect_show', fn: clickRect, evt: 'click'},
		//			{sel: '#tools_ellipse_show', fn: clickEllipse, evt: 'click'},
					{sel: '#tool_bold', fn: clickBold, evt: 'mousedown'},
					{sel: '#tool_italic', fn: clickItalic, evt: 'mousedown'},
					{sel: '#sidepanel_handle', fn: toggleSidePanel},
					{sel: '#copy_save_done', fn: cancelOverlays, evt: 'click'},

					// Shortcuts not associated with buttons

					{key: 'ctrl+left', fn: function(){rotateSelected(0,1);}},
					{key: 'ctrl+right', fn: function(){rotateSelected(1,1);}},
					{key: 'ctrl+shift+left', fn: function(){rotateSelected(0,5);}},
					{key: 'ctrl+shift+right', fn: function(){rotateSelected(1,5);}},
					{key: 'shift+O', fn: selectPrev},
					{key: 'shift+P', fn: selectNext},

					/*
					{key: [modKey+'up', true], fn: function(){zoomImage(2);}},
					{key: [modKey+'down', true], fn: function(){zoomImage(0.5);}},
					*/

					{key: [modKey+']', true], fn: function(){moveUpDownSelected('Up');}},
					{key: [modKey+'[', true], fn: function(){moveUpDownSelected('Down');}},
					{key: ['up', true], fn: function(){moveSelected(0,-1*moveDis);}},
					{key: ['down', true], fn: function(){moveSelected(0,1*moveDis);}},
					{key: ['left', true], fn: function(){moveSelected(-1*moveDis,0);}},
					{key: ['right', true], fn: function(){moveSelected(1*moveDis,0);}},
					{key: 'shift+up', fn: function(){moveSelected(0,-10);}},
					{key: 'shift+down', fn: function(){moveSelected(0,10);}},
					{key: 'shift+left', fn: function(){moveSelected(-10,0);}},
					{key: 'shift+right', fn: function(){moveSelected(10,0);}},

					/*
					{key: ['alt+up', true], fn: function(){svgCanvas.cloneSelectedElements(0,-1);}},
					{key: ['alt+down', true], fn: function(){svgCanvas.cloneSelectedElements(0,1);}},
					{key: ['alt+left', true], fn: function(){svgCanvas.cloneSelectedElements(-1,0);}},
					{key: ['alt+right', true], fn: function(){svgCanvas.cloneSelectedElements(1,0);}},
					{key: ['alt+shift+up', true], fn: function(){svgCanvas.cloneSelectedElements(0,-10);}},
					{key: ['alt+shift+down', true], fn: function(){svgCanvas.cloneSelectedElements(0,10);}},
					{key: ['alt+shift+left', true], fn: function(){svgCanvas.cloneSelectedElements(-10,0);}},
					{key: ['alt+shift+right', true], fn: function(){svgCanvas.cloneSelectedElements(10,0);}},
					{key: 'A', fn: function(){svgCanvas.selectAllInCurrentLayer();}},
					*/
                    {key: ['alt+down', true], fn: function(){setRectRadian();}},

					// Standard shortcuts
                    {key: modKey+'a', fn: function(){svgCanvas.selectAllInCurrentLayer();}},
					{key: modKey+'z', fn: clickUndo},
					{key: modKey + 'shift+z', fn: clickRedo},
					{key: modKey + 'y', fn: clickRedo},

					{key: modKey+'x', fn: cutSelected},
					{key: modKey+'c', fn: copySelected},
					{key: modKey+'v', fn: pasteInCenter},

                    {key: 'ctrl+2', fn: isolateObject},
                    {key: 'shift+2', fn: isolateObjectInverse},
                    {key: 'alt+ctrl+2', fn: unisolateObjects} ,
					{key: 'esc', fn: escapeCallback} ,
				];

				// Tooltips not directly associated with a single function
				var key_assocs = {
					'4/Shift+4': '#tools_rect_show',
					'5/Shift+5': '#tools_ellipse_show'
				};

				return {
					setAll: function() {
						var flyouts = {};

						$.each(tool_buttons, function(i, opts) {
							// Bind function to button
							var btn;
							if (opts.sel) {
								btn = $(opts.sel);
								if (btn.length == 0) {return true;} // Skip if markup does not exist
								if (opts.evt) {
									if (svgedit.browser.isTouch() && opts.evt === 'click') {
										opts.evt = 'mousedown';
									}
									btn[opts.evt](function()
									{
										if (opts.checklock)
										{
											if (svgCanvas.getCurrentDrawing().getCurrentLayerLocked() == false)
											{
												opts.fn();
											}
										}
										else
										{
											opts.fn();
										}
									});
								}

								// Add to parent flyout menu, if able to be displayed
								if (opts.parent && $(opts.parent + '_show').length != 0) {
									var f_h = $(opts.parent);
									if (!f_h.length) {
										f_h = makeFlyoutHolder(opts.parent.substr(1));
									}

									f_h.append(btn);

									if (!$.isArray(flyouts[opts.parent])) {
										flyouts[opts.parent] = [];
									}
									flyouts[opts.parent].push(opts);
								}
							}

							// Bind function to shortcut key
							if (opts.key) {
								// Set shortcut based on options
								var keyval, disInInp = true, fn = opts.fn, pd = false;
								if ($.isArray(opts.key)) {
									keyval = opts.key[0];
									if (opts.key.length > 1) {pd = opts.key[1];}
									if (opts.key.length > 2) {disInInp = opts.key[2];}
								} else {
									keyval = opts.key;
								}
								keyval += '';

								$.each(keyval.split('/'), function(i, key) {
									$(document).bind('keydown', key, function(e) {
										fn();
										if (pd) {
											e.preventDefault();
										}
										// Prevent default on ALL keys?
										return false;
									});
								});

								// Put shortcut in title
								if (opts.sel && !opts.hidekey && btn.attr('title')) {
									var newTitle = btn.attr('title').split('[')[0] + ' (' + keyval + ')';
									key_assocs[keyval] = opts.sel;
									// Disregard for menu items
									if (!btn.parents('#main_menu').length) {
										btn.attr('title', newTitle);
									}
								}
							}
						});

						// Setup flyouts
						setupFlyouts(flyouts);

						// Misc additional actions

						// Make 'return' keypress trigger the change event
						$('.attr_changer, #image_url').bind('keydown', 'return',
							function(evt) {$(this).change();evt.preventDefault();}
						);

						$(window).bind('keydown', 'tab', function(e) {
							if (ui_context === 'canvas') {
								e.preventDefault();
								selectNext();
							}
						}).bind('keydown', 'shift+tab', function(e) {
							if (ui_context === 'canvas') {
								e.preventDefault();
								selectPrev();
							}
						});

						$('#tool_zoom').dblclick(dblclickZoom);
					},
					setTitles: function() {
						$.each(key_assocs, function(keyval, sel) {
							var menu = ($(sel).parents('#main_menu').length);

							$(sel).each(function() {
								var t;
								if (menu) {
									t = $(this).text().split(' [')[0];
								} else {
									t = this.title.split(' [')[0];
								}
								var key_str = '';
								// Shift+Up
								$.each(keyval.split('/'), function(i, key) {
									var mod_bits = key.split('+'), mod = '';
									if (mod_bits.length > 1) {
										mod = mod_bits[0] + '+';
										key = mod_bits[1];
									}
									key_str += (i?'/':'') + mod + (uiStrings['key_'+key] || key);
								});
								if (menu) {
									this.lastChild.textContent = t +' ['+key_str+']';
								} else {
									this.title = t +' ['+key_str+']';
								}
							});
						});
					},
					getButtonData: function(sel) {
						var b;
						$.each(tool_buttons, function(i, btn) {
							if (btn.sel === sel) {b = btn;}
						});
						return b;
					}
				};
			}());

			Actions.setAll();

			// Select given tool
			editor.ready(function() {
				var tool,
					itool = curConfig.initTool,
					container = $('#tools_left, #svg_editor .tools_flyout'),
					pre_tool = container.find('#tool_' + itool),
					reg_tool = container.find('#' + itool);
				if (pre_tool.length) {
					tool = pre_tool;
				} else if (reg_tool.length) {
					tool = reg_tool;
				} else {
					tool = $('#tool_select');
				}
				tool.click().mouseup();

				if (curConfig.wireframe) {
					$('#tool_wireframe').click();
				}

				if (curConfig.showlayers) {
					toggleSidePanel();
				}

				$('#rulers').toggle(!!curConfig.showRulers);

				if (curConfig.showRulers) {
					$('#show_rulers')[0].checked = true;
				}

				if (curConfig.baseUnit) {
					$('#base_unit').val(curConfig.baseUnit);
				}

				if (curConfig.gridSnapping) {
					$('#grid_snapping_on')[0].checked = true;
				}

				if (curConfig.snappingStep) {
					$('#grid_snapping_step').val(curConfig.snappingStep);
				}

				if (curConfig.gridColor) {
					$('#grid_color').val(curConfig.gridColor);
				}
			});

			// init SpinButtons
			$('#rect_rx').SpinButton({ min: 0, max: 1000, callback: changeRectRadius });
			$('#stroke_width').SpinButton({ min: 0, max: 99, step: 0.1, callback: changeStrokeWidth });
			$('#angle').SpinButton({ min: -180, max: 180, step: 5, callback: changeRotationAngle });
            $('#rotateAngle').SpinButton({ min: -180, max: 180, step: 1, callback: changeRotateAngle });
            $('#scaleAngle').SpinButton({ min: 0, max: 10, step: 0.1, callback: changeScaleAngle });
            $('#font_size').SpinButton({ min: 0.001, stepfunc: stepFontSize, callback: changeFontSize });
			$('#group_opacity').SpinButton({ min: 0, max: 100, step: 5, callback: changeOpacity });
			$('#blur').SpinButton({ min: 0, max: 10, step: 0.1, callback: changeBlur });
            $('#moveLength').SpinButton({ min: 0, max: 10, step: 0.1, callback: changeMove });
            $('#mult_move').SpinButton({ min: 0, max: 10, step: 0.1, callback: changeMultMove });
            $('#objnum').SpinButton({ min: 0, max: 10, step: 1, callback: changeObjNum });
            $('#eraserSize').SpinButton({ min: 1, max: 40, step: 1, callback: changeEraserSize });
			$('#lassoThreshold').SpinButton({ min: 1, max: 150, step: 8, callback: changeLassoThreshold });
			$('#zoom').SpinButton({ min: 0.01, max: 10000, step: 50, stepfunc: stepZoom, callback: changeZoom }).val((svgCanvas.getZoom() * 100));

			$('#workarea').contextMenu({
					menu: 'cmenu_canvas',
					inSpeed: 0
				},
				function(action, el, pos) {
					switch (action) {
                        case 'move':
                            moveOneElements();
                            break;
                        case 'past':
                            pastOneElements();
                            break;
                        case 'pastStroke':
                            var stroke = svgCanvas.selectedOldElements.getAttribute("stroke");
                            var strokeWidth = svgCanvas.selectedOldElements.getAttribute("stroke-width");
                            var strokeDasharray = svgCanvas.selectedOldElements.getAttribute("stroke-dasharray");
                            svgCanvas.thisElem.setAttribute("stroke",stroke);
                            svgCanvas.thisElem.setAttribute("stroke-width",strokeWidth);
                            svgCanvas.thisElem.setAttribute("stroke-dasharray",strokeDasharray);
                            break;
                        case 'pastStrokeColor':
                            var stroke = svgCanvas.selectedOldElements.getAttribute("stroke");
                            svgCanvas.thisElem.setAttribute("stroke",stroke);
                            break;
                        case 'pastFill':
                            var fill = svgCanvas.selectedOldElements.getAttribute("fill");
                            var fillOpac = svgCanvas.selectedOldElements.getAttribute("fill-opacity");
                            svgCanvas.thisElem.setAttribute("fill",fill);
                            svgCanvas.thisElem.setAttribute("fill-opacity",fillOpac);
                            break;
                        case 'pastAll':
                            var stroke = svgCanvas.selectedOldElements.getAttribute("stroke");
                            var strokeWidth = svgCanvas.selectedOldElements.getAttribute("stroke-width");
                            var strokeDasharray = svgCanvas.selectedOldElements.getAttribute("stroke-dasharray");
                            svgCanvas.thisElem.setAttribute("stroke",stroke);
                            svgCanvas.thisElem.setAttribute("stroke-width",strokeWidth);
                            svgCanvas.thisElem.setAttribute("stroke-dasharray",strokeDasharray);
                            var fill = svgCanvas.selectedOldElements.getAttribute("fill");
                            var fillOpac = svgCanvas.selectedOldElements.getAttribute("fill-opacity");
                            svgCanvas.thisElem.setAttribute("fill",fill);
                            svgCanvas.thisElem.setAttribute("fill-opacity",fillOpac);
                            break;
						case 'delete':
							deleteSelected();
							break;
						case 'cut':
							cutSelected();
							break;
						case 'copy':
							copySelected();
							break;
						case 'paste':
							svgCanvas.pasteElements();
							break;
						case 'paste_in_place':
							svgCanvas.pasteElements('in_place');
							break;
						case 'group':
						case 'group_elements':
							svgCanvas.groupSelectedElements();
							break;
						case 'ungroup':
							svgCanvas.ungroupSelectedElement();
							break;
						case 'svggroup':
                            svgCanvas.groupPathElements();
							break;
						case 'deleteruler':
							svgCanvas.deleteSelectedRuler();
							break;
						case 'deleteallrulers':
                            svgCanvas.deleteAllRulers();
							break;
						case 'move_front':
							moveToTopSelected();
							break;
						case 'move_up':
							moveUpDownSelected('Up');
							break;
						case 'move_down':
							moveUpDownSelected('Down');
							break;
						case 'move_back':
							moveToBottomSelected();
							break;
						default:
							if (svgedit.contextmenu && svgedit.contextmenu.hasCustomHandler(action)) {
								svgedit.contextmenu.getCustomHandler(action).call();
							}
							break;
					}
					if (svgCanvas.clipBoard.length) {
						canv_menu.enableContextMenuItems('#paste,#paste_in_place');
					}
				}
			);
            var moveOneElements = function ()
            {
                svgCanvas.selectOnly([svgCanvas.selectedOldElements]);
                svgCanvas.moveOneElements(svgCanvas.moveX,svgCanvas.moveY,svgCanvas.selectedOldElements);
                svgCanvas.moveX = 0;svgCanvas.moveY = 0;
                svgCanvas.clearSelection();
            }
            var pastOneElements = function ()
            {
            	if(!multiselected){
                    svgCanvas.selectOnly([svgCanvas.selectedOldElements]);
                    var cElem = svgCanvas.cloneSelectedElements(0,0);
                    svgCanvas.moveOneElements(svgCanvas.moveX,svgCanvas.moveY,cElem);
                    svgCanvas.moveX = 0;svgCanvas.moveY = 0;
                    svgCanvas.clearSelection();
				}
            }
			$('#ruler_x').mousedown(function(evt)
			{
				svgCanvas.addCrossRulerX();
			});

            $('#ruler_y').mousedown(function(evt)
            {
                svgCanvas.addCrossRulerY();
            });
            
			var lmenu_func = function(action, el, pos) {
				switch ( action ) {
					case 'dupe':
						cloneLayer();
						break;
					case 'delete':
						deleteLayer();
						break;
					case 'merge_down':
						mergeLayer();
						break;
					case 'merge_all':
						svgCanvas.mergeAllLayers();
						updateContextPanel();
						populateLayers();
						break;
				}
			};

			$('#layerlist').contextMenu({
					menu: 'cmenu_layers',
					inSpeed: 0
				},
				lmenu_func
			);

			$('#layer_moreopts').contextMenu({
					menu: 'cmenu_layers',
					inSpeed: 0,
					allowLeft: true
				},
				lmenu_func
			);

			$('.contextMenu li').mousedown(function(ev) {
				ev.preventDefault();
			});

			$('#cmenu_canvas li').disableContextMenu();
			canv_menu.enableContextMenuItems('#delete,#cut,#copy');

			window.addEventListener('beforeunload', function(e) {
				// Suppress warning if page is empty
				if (undoMgr.getUndoStackSize() === 0) {
					editor.showSaveWarning = false;
				}

				// showSaveWarning is set to 'false' when the page is saved.
				if (!curConfig.no_save_warning && editor.showSaveWarning) {
					// Browser already asks question about closing the page
					e.returnValue = uiStrings.notification.unsavedChanges; // Firefox needs this when beforeunload set by addEventListener (even though message is not used)
					return uiStrings.notification.unsavedChanges;
				}
			}, false);

            editor.deletePartPrep = function(func)
            {
                $('#main_menu').hide();
                if (undoMgr.getUndoStackSize() === 0)
                {
                    func(true);
                }
                else
                {
                    $.confirm(uiStrings.notification.QwantToDeletePart, func);
                }
            };

            editor.checkoutPrep = function(func)
			{
                $('#main_menu').hide();
                if (undoMgr.getUndoStackSize() === 0)
                {
                    func(true);
                }
                else 
				{
                    $.confirm(uiStrings.notification.QwantToCheckout, func);
                }
            };

            editor.recoverPrep = function(func)
            {
                $('#main_menu').hide();
                if (undoMgr.getUndoStackSize() === 0)
                {
                    func(true);
                }
                else
                {
                    $.confirm(uiStrings.notification.QwantToRecover, func);
                }
            };

			editor.openPrep = function(func) {
				$('#main_menu').hide();
				if (undoMgr.getUndoStackSize() === 0) {
					func(true);
				} else {
					$.confirm(uiStrings.notification.QwantToOpen, func);
				}
			};

			function onDragEnter(e) {
				e.stopPropagation();
				e.preventDefault();
				// and indicator should be displayed here, such as "drop files here"
			}

			function onDragOver(e) {
				e.stopPropagation();
				e.preventDefault();
			}

			function onDragLeave(e) {
				e.stopPropagation();
				e.preventDefault();
				// hypothetical indicator should be removed here
			}

            var openImageUrl = function ()
            {
                var imageUrl = netHelper.getImageRequestUrl();
                if (imageUrl != undefined)
                {
                    var contains = function(str, suffix)
                    {
                        return str.indexOf(suffix) !== -1;
                    }

                    editor.ready(function()
					{
                        console.log('$$$$image url: ' + imageUrl);

                        if (contains(imageUrl , '.svg'))
                        {
                            var data = null;

                            var xhr = new XMLHttpRequest();
                            //xhr.withCredentials = true;

                            xhr.addEventListener("readystatechange", function ()
							{
                                if (this.readyState === 4)
                                {
                                    svgCanvas.clear();

                                    var svgString = this.responseText;
                                    //console.log(this.responseText);

                                    loadSvgString(svgString , null , 1);
                                    updateCanvas();

                                    updateContextPanel();
                                    populateLayers();

                                    editor.isLoadDataFromServer = true;
                                }
                            });

                            xhr.open("GET", imageUrl);//"http://fabric-original.oss-cn-shanghai.aliyuncs.com/design/upload/mzi/201706/testdata.svg?Expires=1497378707&OSSAccessKeyId=TMP.AQEpA8uPb_Z1BYhgafAg09gENk0dmZKj-o3mvd--xlNj65PgffpUAMGtuWbJADAtAhUA5t7WzqI4biHBX0Uat8HtapUj8LMCFCG2lMHqD467Y0AbkTzcRUBRm30g&Signature=yAZ8lldZ8z4vPxaHWWzwoizJPhk%3D");
                            xhr.setRequestHeader("cache-control", "no-cache");
                            xhr.setRequestHeader("postman-token", "de152974-722f-e831-9241-34f2346b0a1b");

                            xhr.send(data);
                        }
                        else if (contains(imageUrl , '.png') ||
                            	  contains(imageUrl , '.jpg'))
                        {


                            var insertNewImage = function (width, height)
							{
                                var newImage = svgCanvas.addSvgElementFromJson({
                                    element: 'image',
                                    attr: {
                                        x: 0,
                                        y: 0,
                                        width: width,
                                        height: height,
                                        id: svgCanvas.getNextId(),
                                        style: 'pointer-events:inherit;cursor:default'
                                    }
                                });
                                svgCanvas.setHref(newImage, imageUrl);

                                //svgCanvas.svgcontent.appendChild(newImage);
                                //svgCanvas.selectOnly([newImage] , true);

                                editor.isLoadDataFromServer = true;
                            };
                            // create dummy img so we know the default dimensions
                            var imgWidth = 100;
                            var imgHeight = 100;
                            var img = new Image();
                            img.src = imageUrl;
                            img.style.opacity = 0;

                            img.onload = function()
                            {
                                imgWidth = img.width;
                                imgHeight = img.height;

                                svgCanvas.clear();

                                insertNewImage(imgWidth, imgHeight);
                            };

                            updateContextPanel();
                            populateLayers();
                        }
                    });
                }
            }

            openImageUrl();

			var openPartPreview = function()
			{
                svgCanvas.switchPreviewPanel();
			}

			setTimeout(openPartPreview , 100);

			var checkoutProject = function()
			{
                svgCanvas.checkoutFromServerAuto();
			}

            //setTimeout(checkoutProject , 100);

            editor.recoverProjectFromServer = function(projectData)
            {
                svgCanvas.clear();

                loadSvgString(projectData.svgContent);

                updateCanvas();

                $('#dialog_box').hide();
            }

			editor.checkoutProjectFromServer = function(projectData)
			{
                svgCanvas.clear();

                loadSvgString(projectData.svgContent);

                updateCanvas();

                $('#dialog_box').hide();
			}

            editor.insertImageFromUrl = function(_imageUrl)
            {
                var imageUrl = _imageUrl;
                if (imageUrl != undefined)
                {
                    var contains = function(str, suffix)
                    {
                        return str.indexOf(suffix) !== -1;
                    }

                    if (contains(imageUrl , '.svg'))
                    {
                        var data = null;

                        var xhr = new XMLHttpRequest();

                        xhr.addEventListener("readystatechange", function ()
                        {
                            if (this.readyState === 4)
                            {
                                var svgString = this.responseText;
                                svgCanvas.importSvgStringNew(svgString);
                                updateCanvas();
                            }
                        });

                        xhr.open("GET", imageUrl);//"http://fabric-original.oss-cn-shanghai.aliyuncs.com/design/upload/mzi/201706/testdata.svg?Expires=1497378707&OSSAccessKeyId=TMP.AQEpA8uPb_Z1BYhgafAg09gENk0dmZKj-o3mvd--xlNj65PgffpUAMGtuWbJADAtAhUA5t7WzqI4biHBX0Uat8HtapUj8LMCFCG2lMHqD467Y0AbkTzcRUBRm30g&Signature=yAZ8lldZ8z4vPxaHWWzwoizJPhk%3D");
                        xhr.setRequestHeader("cache-control", "no-cache");
                        xhr.setRequestHeader("postman-token", "de152974-722f-e831-9241-34f2346b0a1b");

                        xhr.send(data);
                    }
                    else if (contains(imageUrl , '.png') ||
                        contains(imageUrl , '.jpg'))
                    {
                        var insertNewImage = function (width, height)
                        {
                            var newImage = svgCanvas.addSvgElementFromJson({
                                element: 'image',
                                attr: {
                                    x: 0,
                                    y: 0,
                                    width: width,
                                    height: height,
                                    id: svgCanvas.getNextId(),
                                    style: 'pointer-events:inherit;cursor:default'
                                }
                            });
                            svgCanvas.setHref(newImage, imageUrl);
                        };
                        // create dummy img so we know the default dimensions
                        var imgWidth = 100;
                        var imgHeight = 100;
                        var img = new Image();
                        img.src = imageUrl;
                        img.style.opacity = 0;

                        img.onload = function()
                        {
                            imgWidth = img.width;
                            imgHeight = img.height;

                            insertNewImage(imgWidth, imgHeight);
                        };
                    }
                }else{
                	updateCanvas();
				}
            }

			// Use HTML5 File API: http://www.w3.org/TR/FileAPI/
			// if browser has HTML5 File API support, then we will show the open menu item
			// and provide a file input to click. When that change event fires, it will
			// get the text contents of the file and send it to the canvas
			if (window.FileReader) {
				var importImage = function(e)
				{
					console.log("==============================================================Image loaded");

					$.process_cancel(uiStrings.notification.loadingImage);
					e.stopPropagation();
					e.preventDefault();

					var file = (e.type == 'drop') ? e.dataTransfer.files[0] : this.files[0];
					if (!file) {
						$('#dialog_box').hide();
						return;
					}
					if (file.type.indexOf('image') != -1) {
						// Detected an image
						// svg handling
						var reader;
						if (file.type.indexOf('svg') != -1) {
							reader = new FileReader();
							reader.onloadend = function(e)
							{
								svgCanvas.importSvgStringNew(e.target.result);

                                updateCanvas();
								
								$('#dialog_box').hide();
							};
							reader.readAsText(file);
						}
						else
						{
							//bitmap handling
							reader = new FileReader();
							reader.onloadend = function(e) {
								// let's insert the new image until we know its dimensions
								var insertNewImage = function(width, height)
								{
									var newImage = svgCanvas.addSvgElementFromJson({
										element: 'image',
										attr: {
											x: 0,
											y: 0,
											width: width,
											height: height,
											id: svgCanvas.getNextId(),
											style: 'pointer-events:inherit'
										}
									});
									svgCanvas.setHref(newImage, e.target.result);
									svgCanvas.selectOnly([newImage]);
									//svgCanvas.alignSelectedElements('m', 'page');
									//svgCanvas.alignSelectedElements('c', 'page');
									updateContextPanel();
									$('#dialog_box').hide();
								};
								// create dummy img so we know the default dimensions
								var imgWidth = 100;
								var imgHeight = 100;
								var img = new Image();
								img.src = e.target.result;
								img.style.opacity = 0;
								img.onload = function()
								{
									imgWidth = img.offsetWidth;
									imgHeight = img.offsetHeight;
									insertNewImage(imgWidth, imgHeight);
								};
							};
							reader.readAsDataURL(file);
						}
					}
				};

				workarea[0].addEventListener('dragenter', onDragEnter, false);
				workarea[0].addEventListener('dragover', onDragOver, false);
				workarea[0].addEventListener('dragleave', onDragLeave, false);
				workarea[0].addEventListener('drop', importImage, false);

				var open = $('<input onclick="this.value = null;" type="file">').change(function() {
					var f = this;
					editor.openPrep(function(ok)
					{
						if (!ok) {return;}
						svgCanvas.clear();
						if (f.files.length === 1)
						{
							$.process_cancel(uiStrings.notification.loadingImage);
							var reader = new FileReader();
							reader.onloadend = function(e)
							{
								console.log('==================== load svg with: ' + e.target.result);
								loadSvgString(e.target.result);
								updateCanvas();
								$('#dialog_box').hide();
							};
							reader.onerror = function(e)
							{
								$('#dialog_box').hide();
							}
							reader.readAsText(f.files[0]);
						}
					});
				});
				$('#tool_open').show().prepend(open);

                var changeImage = $('#tool_change_image').change(function()
				{
					console.log('================================ change imaget @@@@@@@@@@@@@@@@@@@@@@@');
                    var f = this;

                    if (f.files.length === 1)
                    {
                        if (f.files[0].type.indexOf('image')  != -1)
                        {
                            if (f.files[0].type.indexOf('svg') != -1)
							{
                                $.process_cancel(uiStrings.notification.loadingImage);
                                var reader = new FileReader();
                                reader.onloadend = function(e)
                                {
                                    svgCanvas.importSvgStringNew(e.target.result);

                                    updateCanvas();
									$('#dialog_box').hide();
                                };
								reader.onerror = function(e)
								{
									$('#dialog_box').hide();
								}

                                reader.readAsText(f.files[0]);
							}
							else
							{
								//bitmap handling
								$.process_cancel(uiStrings.notification.loadingImage);
                                reader = new FileReader();
                                reader.onloadend = function(e)
								{
                                    svgCanvas.setImageURL(e.target.result);

                                    updateCanvas();
									$('#dialog_box').hide();
                                };
								reader.onerror = function(e)
								{
									$('#dialog_box').hide();
								}
                                reader.readAsDataURL(f.files[0]);
							}
						}

                    }

                    $('#tool_change_image').val('');

                });
                $('#tool_change_image_button').prepend(changeImage);

				var imgImport = $('<input type="file">').change(importImage);
				$('#tool_import').show().prepend(imgImport);

                var addPreview = $('#add_preview_input').change(function()
				{
                    var f = this;
                    if (f.files.length === 1)
                    {
                        $.process_cancel(uiStrings.notification.loadingImage);

                        reader = new FileReader();
                        reader.onloadend = function(e)
                        {
                            var img = new Image();
                            img.src = e.target.result;
                            img.onload = function()
                            {
                            	console.log(f.files[0].name);
                            	var id = "preview_item_" + svgCanvas.getNextId();
                                var previewItem = document.createElement('div');
                                previewItem.setAttribute('class', 'add_preview_item');
                                previewItem.setAttribute('title', f.files[0].name);
                                previewItem.setAttribute('style' , "pointer-events:all");
                                previewItem.setAttribute('id' , id);

                                var height = 120;

                                var imgItem = document.createElement('img');
                                imgItem.src = e.target.result;
                                imgItem.setAttribute('width' , this.width / this.height * height) ;
                                imgItem.setAttribute('height' , height);

                                previewItem.setAttribute('width' , this.width / this.height * height) ;
                                previewItem.setAttribute('height' , height);

                                previewItem.appendChild(imgItem);

                                var btnElem = document.getElementById('add_preview_button_idx');
                                btnElem.parentNode.insertBefore(previewItem , btnElem);

                                $("#" + id).dblclick(function()
								{
									this.parentNode.removeChild(this);
								});
                            };

                            $('#dialog_box').hide();
                        };
                        reader.onerror = function(e)
                        {
                            $('#dialog_box').hide();
                        }
                        reader.readAsDataURL(f.files[0]);
                    }
                });
				$('#add_preview').prepend(addPreview);
			}

//			$(function() {
				updateCanvas(true);
//			});

			//	var revnums = "svg-editor.js ($Rev$) ";
			//	revnums += svgCanvas.getVersion();
			//	$('#copyright')[0].setAttribute('title', revnums);

			// For Compatibility with older extensions
			$(function() {
				window.svgCanvas = svgCanvas;
				svgCanvas.ready = editor.ready;
			});

			editor.setLang = function(lang, allStrings) {
				editor.langChanged = true;
				$.pref('lang', lang);
				$('#lang_select').val(lang);
				if (!allStrings) {
					return;
				}
				// var notif = allStrings.notification; // Currently unused
				// $.extend will only replace the given strings
				var oldLayerName = $('#layerlist tr.layersel td.layername').text();
				var rename_layer = (oldLayerName == uiStrings.common.layer + ' 1');

				$.extend(uiStrings, allStrings);
				svgCanvas.setUiStrings(allStrings);
				Actions.setTitles();

				if (rename_layer) {
					svgCanvas.renameCurrentLayer(uiStrings.common.layer + ' 1');
					populateLayers();
				}

				// In case extensions loaded before the locale, now we execute a callback on them
				if (extsPreLang.length) {
					while (extsPreLang.length) {
						var ext = extsPreLang.shift();
						ext.langReady({lang: lang, uiStrings: uiStrings});
					}
				}
				else {
					svgCanvas.runExtensions('langReady', {lang: lang, uiStrings: uiStrings});
				}
				svgCanvas.runExtensions('langChanged', lang);

				// Update flyout tooltips
				setFlyoutTitles();

				// Copy title for certain tool elements
				var elems = {
					'#stroke_color': '#tool_stroke .icon_label, #tool_stroke .color_block',
					'#fill_color': '#tool_fill label, #tool_fill .color_block',
					'#linejoin_miter': '#cur_linejoin',
					'#linecap_butt': '#cur_linecap'
				};

				$.each(elems, function(source, dest) {
					$(dest).attr('title', $(source)[0].title);
				});

				// Copy alignment titles
				$('#multiselected_panel div[id^=tool_align]').each(function() {
					$('#tool_pos' + this.id.substr(10))[0].title = this.title;
				});
			};
		};

		editor.ready = function (cb) {
			if (!isReady) {
				callbacks.push(cb);
			} else {
				cb();
			}
		};

		editor.runCallbacks = function () {
			$.each(callbacks, function() {
				this();
			});
			isReady = true;
		};

		editor.loadFromString = function (str) {
			editor.ready(function() {
				loadSvgString(str);
			});
		};

		editor.disableUI = function (featList) {
//			$(function() {
//				$('#tool_wireframe, #tool_image, #main_button, #tool_source, #sidepanels').remove();
//				$('#tools_top').css('left', 5);
//			});
		};

		editor.loadFromURL = function (url, opts) {
			if (!opts) {opts = {};}

			var cache = opts.cache;
			var cb = opts.callback;

			editor.ready(function() {
				$.ajax({
					'url': url,
					'dataType': 'text',
					cache: !!cache,
					beforeSend:function(){
						$.process_cancel(uiStrings.notification.loadingImage);
					},
					success: function(str) {
						loadSvgString(str, cb);
					},
					error: function(xhr, stat, err) {
						if (xhr.status != 404 && xhr.responseText) {
							loadSvgString(xhr.responseText, cb);
						} else {
							$.alert(uiStrings.notification.URLloadFail + ': \n' + err, cb);
						}
					},
					complete:function(){
						$('#dialog_box').hide();
					}
				});
			});
		};

		editor.loadFromDataURI = function(str) {
			editor.ready(function() {
				var base64 = false;
				var pre = str.match(/^data:image\/svg\+xml;base64,/);
				if (pre) {
					base64 = true;
				}
				else {
					pre = str.match(/^data:image\/svg\+xml(?:;(?:utf8)?)?,/);
				}
				if (pre) {
					pre = pre[0];
				}
				var src = str.slice(pre.length);
				loadSvgString(base64 ? Utils.decode64(src) : decodeURIComponent(src));
			});
		};

		editor.loadDataURI2Img = function(img , str) {
			editor.ready(function() {
				var base64 = false;
				var rawStr = str;
				var pre = str.match(/^data:image\/svg\+xml;base64,/);
				if (pre) {
					base64 = true;
				}
				else {
					pre = str.match(/^data:image\/svg\+xml(?:;(?:utf8)?)?,/);
				}
				if (pre) {
					pre = pre[0];
				}
				var src = str.slice(pre.length);

				console.log('sfd=d=sfs=f=s=fs=f=sdf');
				//img.src = base64 ? Utils.decode64(src) : decodeURIComponent(src);

				console.log(img);

				console.log(rawStr);

				img.onload = function()
				{
					//convertToDataBuffer(image, image.width, image.height , cb);

					console.log('sfdajsalfjsalfjskalfjwre24324324242 324423424243242');
				}

				img.onerror = function()
				{
					//console.error('There was an error loading the data URI as an image on the following SVG\n', window.atob(uri.slice(26)), '\n', "Open the following link to see browser's diagnosis\n", uri);
				}


				img.src = 'images/switch_stroke_fill.png';//rawStr;

				//img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', rawStr);



				console.log('sfd=d=sfs=f=s=fs=f=sdf dsfadfsaf 111111111111111');
			});
		};

		editor.addExtension = function () {
			var args = arguments;

			// Note that we don't want this on editor.ready since some extensions
			// may want to run before then (like server_opensave).
			$(function() {
				if (svgCanvas) {svgCanvas.addExtension.apply(this, args);}
			});
		};

		return editor;
	}(jQuery));

	// Run init once DOM is loaded
	$(svgEditor.init);

}());
