/*globals svgEditor, svgCanvas*/
/*jslint eqeq: true*/
/*
 * ext-panning.js
 *
 * Licensed under the MIT License
 *
 * Copyright(c) 2013 Luis Aguirre
 *
 */
 
/* 
	This is a very basic SVG-Edit extension to let tablet/mobile devices panning without problem
*/

svgEditor.addExtension('ext-panning', function() {'use strict';
	return {
		name: 'Extension Panning',
		svgicons: null , //svgEditor.curConfig.extPath + 'ext-panning.xml',
		buttons: [{
			id: 'ext-panning',
			type: 'mode',
			title: 'Panning',
			icon : 'images/ext-panning.png',
			iconWidth : '24',
			iconHeight : '24',
            position: 9,
			events: {
				click: function() {
					svgCanvas.setMode('ext-panning');
				}
			}
		}],
		mouseDown: function() {
			if (svgCanvas.getMode() == 'ext-panning') {
				svgEditor.setPanning(true);
				return {started: true};
			}
		},
		mouseUp: function() {
			if (svgCanvas.getMode() == 'ext-panning') {
				svgEditor.setPanning(false);
				return {
					keep: false,
					element: null
				};
			}
		}
	};
});
