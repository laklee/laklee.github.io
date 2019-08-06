/*globals jQuery*/
/*jslint vars: true, eqeq: true, forin: true*/
/*
 * Localizing script for SVG-edit UI
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2010 Narendra Sisodya
 * Copyright(c) 2010 Alexis Deveria
 *
 */

// Dependencies
// 1) jQuery
// 2) svgcanvas.js
// 3) svg-editor.js

var svgEditor = (function($, editor) {'use strict';

	var lang_param;
	
	function setStrings(type, obj, ids) {
		// Root element to look for element from
		var i, sel, val, $elem, elem, node, parent = $('#svg_editor').parent();
		for (sel in obj) {
			val = obj[sel];
			if (!val) {console.log(sel);}
			
			if (ids) {sel = '#' + sel;}
			$elem = parent.find(sel);
			if ($elem.length) {
				elem = parent.find(sel)[0];
				
				switch ( type ) {
					case 'content':
						for (i = 0; i < elem.childNodes.length; i++) {
							node = elem.childNodes[i];
							if (node.nodeType === 3 && node.textContent.replace(/\s/g,'')) {
								node.textContent = val;
								break;
							}
						}
						break;
					
					case 'title':
						elem.title = val;
						break;
				}
				
				
			} else {
				console.log('Missing: ' + sel);
			}
		}
	}

	editor.readLang = function(langData) {
		var more = editor.canvas.runExtensions('addlangData', lang_param, true);
		$.each(more, function(i, m) {
			if (m.data) {
				langData = $.merge(langData, m.data);
			}
		});
		
		// Old locale file, do nothing for now.
		if (!langData.tools) {return;}

		var tools = langData.tools,
			misc = langData.misc,
			properties = langData.properties,
			config = langData.config,
			layers = langData.layers,
			common = langData.common,
			ui = langData.ui;
		
		setStrings('content', {
			// copyrightLabel: misc.powered_by, // Currently commented out in svg-editor.html
			curve_segments: properties.curve_segments,
			fitToContent: tools.fitToContent,
			fit_to_all: tools.fit_to_all,
			fit_to_canvas: tools.fit_to_canvas,
			fit_to_layer_content: tools.fit_to_layer_content,
			fit_to_sel: tools.fit_to_sel,
			
			icon_large: config.icon_large,
			icon_medium: config.icon_medium,
			icon_small: config.icon_small,
			icon_xlarge: config.icon_xlarge,
			image_opt_embed: config.image_opt_embed,
			image_opt_ref: config.image_opt_ref,
			includedImages: config.included_images,
			
			largest_object: tools.largest_object,
			
			layersLabel: layers.layers,
            strokeLabel : tools.strokelabel ,
            strokestylepanellabel : tools.strokestylepanellabel,
            fillstylepanellabel : tools.fillstylepanellabel,
			fillpatternLabel : tools.fillpatternlabel,
			page: tools.page,
			relativeToLabel: tools.relativeTo,
			selLayerLabel: layers.move_elems_to,
			selectedPredefined: config.select_predefined,
			gs_label : tools.general_setting,
			label_checkout : tools.ll_checkout ,
            label_exportpart : tools.ll_exportpart ,
			lable_importpart : tools.ll_importpart ,
			label_submit : tools.ll_submit ,
            canvasLabel : tools.ll_canvas ,
			
			selected_objects: tools.selected_objects,
			smallest_object: tools.smallest_object,
			straight_segments: properties.straight_segments,
			
			svginfo_bg_url: config.editor_img_url + ":",
			svginfo_bg_note: config.editor_bg_note,
			svginfo_change_background: config.background,
			svginfo_dim: config.doc_dims,
			svginfo_editor_prefs: config.editor_prefs,
			svginfo_height: common.height,
			svginfo_icons: config.icon_size,
			svginfo_image_props: config.image_props,
			svginfo_lang: config.language,
			svginfo_title: config.doc_title,
			svginfo_width: common.width,
			
			tool_docprops_cancel: common.cancel,
			tool_docprops_save: common.ok,

			tool_source_cancel: common.cancel,
			tool_source_save: common.ok,
			
			tool_prefs_cancel: common.cancel,
			tool_prefs_save: common.ok,
            tool_prefs_recover: common.recovery,

			sidepanel_handle: layers.layers.split('').join(' '),

			tool_clear: tools.new_doc,
			tool_docprops: tools.docprops,
            tool_prefs_option : tools.editoroption ,
			tool_export: tools.export_img,
            tool_export_pdf: tools.export_pdf,
			tool_import: tools.import_doc,
            tool_import_server: tools.import_part_server,
			tool_imagelib: tools.imagelib,
			tool_open: tools.open_doc,
			tool_save: tools.save_doc,
			tool_eraser : tools.new_doc,
            selectedPredefined1 : tools.ll_predefinedcanvas ,

            canvas_size_preview_width : tools.ll_canvas_size_width ,
            canvas_size_preview_height : tools.ll_canvas_size_height ,

            svginfo_units_rulers: config.units_and_rulers,
			svginfo_rulers_onoff: config.show_rulers,
			svginfo_unit: config.base_unit,
			
			svginfo_grid_settings: config.grid,
			svginfo_snap_onoff: config.snapping_onoff,
			svginfo_snap_step: config.snapping_stepsize,
			svginfo_grid_color: config.grid_color ,
            colorpanellabel : tools.colorpanellabel
		}, true);
		
		// Shape categories
		var o, cats = {};
		for (o in langData.shape_cats) {
			cats['#shape_cats [data-cat="' + o + '"]'] = langData.shape_cats[o];
		}
		
		// TODO: Find way to make this run after shapelib ext has loaded
		setTimeout(function() {
			setStrings('content', cats);
		}, 2000);
		
		// Context menus
		var opts = {};
		$.each(['cut','copy','paste',"move","past", "pastStroke","pastStrokeColor","pastFill","pastAll", 'paste_in_place', 'delete', 'group', 'ungroup', 'svggroup', 'deleteruler', 'deleteallrulers', 'move_front', 'move_up', 'move_down', 'move_back'], function() {
			opts['#cmenu_canvas a[href="#' + this + '"]'] = tools[this];
		});

		$.each(['dupe','merge_down', 'merge_all'], function() {
			opts['#cmenu_layers a[href="#' + this + '"]'] = layers[this];
		});

		opts['#cmenu_layers a[href="#delete"]'] = layers.del;
		
		setStrings('content', opts);
		
		setStrings('title', {
			align_relative_to: tools.align_relative_to,
			circle_cx: properties.circle_cx,
			circle_cy: properties.circle_cy,
			circle_r: properties.circle_r,
			cornerRadiusLabel: properties.corner_radius,
			ellipse_cx: properties.ellipse_cx,
			ellipse_cy: properties.ellipse_cy,
			ellipse_rx: properties.ellipse_rx,
			ellipse_ry: properties.ellipse_ry,
			fill_color: properties.fill_color,
			font_family: properties.font_family,
			idLabel: properties.id,
			image_height: properties.image_height,
			image_url: properties.image_url,
			image_width: properties.image_width,
			layer_delete: layers.del,
			layer_down: layers.move_down,
			layer_new: layers['new'],
			layer_rename: layers.rename,
			layer_moreopts: common.more_opts,
			layer_up: layers.move_up,
            layer_lock : layers.lock ,
			line_x1: properties.line_x1,
			line_x2: properties.line_x2,
			line_y1: properties.line_y1,
			line_y2: properties.line_y2,
			linecap_butt: properties.linecap_butt,
			linecap_round: properties.linecap_round,
			linecap_square: properties.linecap_square,
			linejoin_bevel: properties.linejoin_bevel,
			linejoin_miter: properties.linejoin_miter,
			linejoin_round: properties.linejoin_round,
			mode_connect: tools.mode_connect,
			tools_shapelib_show: tools.mode_shapelib,
			palette: ui.palette_info,
			zoom_panel: ui.zoom_level,
			path_node_x: properties.node_x,
			path_node_y: properties.node_y,
			rect_height_tool: properties.rect_height,
			rect_width_tool: properties.rect_width,
			seg_type: properties.seg_type,
			selLayerNames: layers.move_selected,
			selected_x: properties.pos_x,
			selected_y: properties.pos_y,
			stroke_color: properties.stroke_color,
			stroke_style: properties.stroke_style,
			stroke_width: properties.stroke_width,
			svginfo_title: config.doc_title,
			text: properties.text_contents,
			toggle_stroke_tools: ui.toggle_stroke_tools,
			tool_add_subpath: tools.add_subpath,
			tool_alignbottom: tools.align_bottom,
			tool_aligncenter: tools.align_center,
			tool_alignleft: tools.align_left,
            tool_autoposcenter: tools.align_center,
            tool_autoposmiddle: tools.align_middle,
			tool_alignmiddle: tools.align_middle,
			tool_alignright: tools.align_right,
			tool_aligntop: tools.align_top,
            insertobj:tools.insertobj,
            mult_movedis:properties.tool_movedis,
            obj:tools.obj,
            tool_Trim:tools.tool_Trim,
            tool_Intersect:tools.tool_Intersect,
            tool_Union:tools.tool_Union,
            tool_Move:tools.tool_Move,
            tool_angle: properties.angle,
			tool_blur: properties.blur,
			tool_bold: properties.bold,
			tool_circle: tools.mode_circle,
			tool_clone: tools.clone,
			tool_clone_multi: tools.clone,
			tool_delete: tools.del,
			tool_delete_multi: tools.del,
			tool_ellipse: tools.mode_ellipse,
			tool_eyedropper: tools.mode_eyedropper,
			tool_fhellipse: tools.mode_fhellipse,
			tool_fhpath: tools.mode_fhpath,
            tool_lasso : tools.mode_lasso,
            tool_quickselect : tools.mode_qs_free,
            tool_quickselect_rect : tools.mode_qs_rect,
            tool_eraser : tools.mode_eraser ,
			'ext-panning' : tools.mode_panning ,
            tool_pngtosvg : tools.mode_pngtosvg ,
			tool_checkboard : tools.mode_checkboard,
			tool_partpreview : tools.mode_partpreview,
            tool_partrefresh : tools.mode_partrefresh ,
            add_preview_button_idx : tools.mode_add_previewparts,
			tool_flip_h : tools.mode_flip_h ,
			tool_flip_v : tools.mode_flip_v ,
            tool_scalemode : tools.mode_scalemode ,
            tool_fixaspect : tools.mode_fixaspect ,
            tool_crossruler : tools.mode_crossruler ,
            tool_checkout : tools.mode_checkwf,
            tool_importpart : tools.mode_importpart ,
			tool_exportpart : tools.mode_exportpart ,
            main_icon : tools.mode_mainicon ,
            gs_label : tools.mode_gelabel ,
			tool_submit : tools.mode_submitwf,
			tool_fhrect: tools.mode_fhrect,
			tool_font_size: properties.font_size,
			tool_group_elements: tools.group_elements,
			tool_make_link: tools.make_link,
			tool_link_url: tools.set_link_url,
			tool_image: tools.mode_image,
			tool_italic: properties.italic,
			tool_line: tools.mode_line,
			tool_move_bottom: tools.move_bottom,
			tool_move_top: tools.move_top,
			tool_node_clone: tools.node_clone,
			tool_node_delete: tools.node_delete,
			tool_node_link: tools.node_link,
			tool_opacity: properties.opacity,
			tool_openclose_path: tools.openclose_path,
			tool_path: tools.mode_path,
			tool_position: tools.align_to_page,
			tool_rect: tools.mode_rect,
			tool_redo: tools.redo,
			tool_reorient: tools.reorient_path,
            recttopath: properties.recttopath,
            tool_movedis:properties.tool_movedis,
            tool_rotate:properties.rotateAngle,
            tool_scale:properties.scaleAngle,
            tool_select: tools.mode_select,
			tool_selectnode: tools.mode_selectnode,
			tool_source: tools.source_save,
			tool_square: tools.mode_square,
			tool_text: tools.mode_text,
			tool_topath: tools.to_path,
			tool_undo: tools.undo,
			tool_ungroup: tools.ungroup,
			tool_wireframe: tools.wireframe_mode,
			view_grid: tools.toggle_grid,
            tool_edgesmiter:tools.tool_edgesmiter,
			tool_zoom: tools.mode_zoom,
			url_notice: tools.no_embed,
		 	canvas_width_side : tools.ll_canvas_width_side ,
			canvas_height_side : tools.ll_canvas_height_side ,
			tool_erasershape : tools.ll_erasershape ,
            changestrokeopacity : tools.changestrokeopacity ,
            tool_add_ctrlpoint : tools.addctrlpoint ,
            tool_remove_ctrlpoint_red : tools.removectrlpoint_red ,
            tool_remove_ctrlpoint_green : tools.removectrlpoint_green ,
            tool_remove_ctrlpoint: tools.removectrlpoint ,
			tool_add_anchorpoint : tools.addanchorpoint ,
			tool_remove_anchorpoint : tools.removeanchorpoint ,
            tool_connect_nodes : tools.connectanchor,
			tool_connect_anchors : tools.connectanchor,
            tool_openclose_paths : tools.openclosepath ,
            tool_path_scissor : tools.scissorpath,
        }, true);
		
		editor.setLang(lang_param, langData);
	};

	editor.putLocale = function (given_param, good_langs) {
	
		if (given_param) {
			lang_param = given_param;
		}
		else
		{
			lang_param = $.pref('lang');

			lang_param = 'zh';
			
			if (!lang_param) {
				if (navigator.userLanguage) { // Explorer
					lang_param = navigator.userLanguage;
				}
				else if (navigator.language) { // FF, Opera, ...
					lang_param = navigator.language;
				}
				if (lang_param == null) { // Todo: Would cause problems if uiStrings removed; remove this?
					return;
				}
			}
			
			console.log('Lang: ' + lang_param);
			
			// Set to English if language is not in list of good langs
			if ($.inArray(lang_param, good_langs) === -1 && lang_param !== 'test') {
				lang_param = "zh";
			}
	
			// don't bother on first run if language is English		
			// The following line prevents setLang from running
			//    extensions which depend on updated uiStrings,
			//    so commenting it out.
			// if (lang_param.indexOf("en") === 0) {return;}

		}
		
		var conf = editor.curConfig;
		
		var url = conf.langPath + "lang." + lang_param + ".js";
		
		$.getScript(url, function(d) {
			// Fails locally in Chrome 5+
			if (!d) {
				var s = document.createElement('script');
				s.src = url;
				document.querySelector('head').appendChild(s);
			}
		});
		
	};
	
	return editor;
}(jQuery, svgEditor));
