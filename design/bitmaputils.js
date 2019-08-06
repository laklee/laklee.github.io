var bitmaputils = function(_svgRoot)
{
    var svgRoot = _svgRoot;

    var srcLayerImage = null;

    var eraseCanvas = null;
    var eraseContext = null;

    var maskCanvas = null;
    var maskContext = null;

    var maskRoot = null;

    var workCanvas = null;
    var workContext = null;

    var selectedArea = null;
    var selectedAreaProxy = null;
    var selectedAreaBg = null;

    var selectedAreaPathString = '';

    var qselectFreeMode = true;
    var selectOrigin = {x:0 , y:0};

    var funcAnimateSelectAreaIdx = 0;
    var animateSelectAreaTimer = 0;

    var lastMousePos = {x:0 , y:0};

    var colorPickDataBuffer = null;

    var isShiftKeyDown = false;

    var diffElems = [];
    var interElems = [];

    var rawPathPoints = [];

    this.shiftKeyDown = function()
    {
        return isShiftKeyDown;
    }

    window.onmousemove = function (e)
    {
        if (!e) e = window.event;

        isShiftKeyDown = false;
        if (e.shiftKey)
        {
            isShiftKeyDown = true;
        }

        if (e.altKey) {/*alt is down*/}
        if (e.ctrlKey) {/*ctrl is down*/}
        if (e.metaKey) {/*cmd is down*/}
    }

    function animateSelectArea() {
        if (selectedArea != null) {
            animateSelectAreaTimer += 3;

            selectedArea.setAttribute('stroke-dashoffset', animateSelectAreaTimer);
        }
        else {
            console.log('=================================== dtest111');

            clearInterval(funcAnimateSelectAreaIdx);
        }
    }

    var selectedAreaMin =
        {
            x : 9999,
            y : 9999
        };

    var selectedAreaMax =
        {
            x : -9999,
            y : -9999
        };

    var eraserSize = 8;

    var isSquareEraser = true;
    var isStrictEraser = true;
    var eraserAlpha = 255;

    var lassoThreshold = 120;

    this.setShiftKeyState = function (_shiftKey)
    {
        isShiftKeyDown = _shiftKey;

        console.log('================================== is shift key down: ' + isShiftKeyDown);
    }

    this.getEraserSize = function()
    {
        return eraserSize;
    }

    this.isSquareEraser = function()
    {
        return isSquareEraser;
    }

    this.beginErase = function(realX , realY)
    {
        var drawing = svgCanvas.getCurrentDrawing();

        selectedAreaBg = null;
        selectedAreaBg = drawing.current_layer.appendChild(
            svgCanvas.addSvgElementFromJson({
                'element': 'path',
                'attr': {
                    'id': 'lassoAreaChild',
                    'fill': 'none',
                    'stroke': '#fff',
                    'stroke-width': 1 / svgCanvas.getCanvasScale(),
                    //'stroke-dasharray': '5,5',
                    // need to specify this so that the rect is not selectable
                    'style': 'pointer-events:none'
                }
            })
        );

        selectedArea = null;
        selectedArea = drawing.current_layer.appendChild(
            svgCanvas.addSvgElementFromJson({
                'element': 'path',
                'attr': {
                    'id': 'selectedArea',
                    'fill': 'none',
                    'stroke': '#22C',
                    'stroke-width':1 / svgCanvas.getCanvasScale(),
                    'stroke-dasharray': '5,5',
                    // need to specify this so that the rect is not selectable
                    'style': 'pointer-events:none'
                }
            })
        );

        selectedAreaPathString = 'M ' + realX + ' ' + realY;
        selectOrigin.x = realX;
        selectOrigin.y = realY;

        if (maskCanvas == null)
        {
            maskCanvas = document.createElement('canvas');
            maskCanvas.id = "MaskCanvas";
            maskCanvas.zIndex = 10;

            maskContext = maskCanvas.getContext('2d');

            maskRoot = svgedit.utilities.text2xml(
                '<svg id="maskroot" xmlns="' + svgedit.NS.SVG + '" xlinkns="' + svgedit.NS.XLINK + '" ' +
                'width="' + svgCanvas.getResolution().w + '" height="' + svgCanvas.getResolution().h + '" x="' + svgCanvas.getResolution().w + '" y="' + svgCanvas.getResolution().h + '" overflow="visible">' +
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
                '</svg>').documentElement;

            maskCanvas.appendChild(maskRoot);

            document.body.appendChild(maskCanvas);
        }
        maskCanvas.width  = svgCanvas.getResolution().w;
        maskCanvas.height = svgCanvas.getResolution().h;
        maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        selectedAreaProxy = null;
        selectedAreaProxy = maskRoot.appendChild(
            svgCanvas.addSvgElementFromJson({
                'element': 'path',
                'attr': {
                    'id': 'selectedAreaProxy',
                    'fill': 'purple',
                    'stroke': '#22C',
                    'stroke-width': 2 / svgCanvas.getCanvasScale(),
                    //'stroke-dasharray': '',
                    'style': 'pointer-events:none'
                }
            })
        );

        selectedAreaMin = {x : 9999, y : 9999};
        selectedAreaMax = {x : -9999, y : -9999};

        clearInterval(funcAnimateSelectAreaIdx);

        rawPathPoints = [];
    }

    this.updateErase = function(realX , realY)
    {
        rawPathPoints.push({x: realX , y: realY});

        // Update bounding box of selected area
        if (realX < selectedAreaMin.x)
        {
            selectedAreaMin.x = realX;
        }
        if (realY < selectedAreaMin.y)
        {
            selectedAreaMin.y = realY;
        }

        if (realX > selectedAreaMax.x)
        {
            selectedAreaMax.x = realX;
        }
        if (realY > selectedAreaMax.y)
        {
            selectedAreaMax.y = realY;
        }

        if (qselectFreeMode)
        {
            selectedAreaPathString += ' L ' + realX + ' ' + realY;
        }
        else
        {
            selectedAreaPathString = 'M ' + selectOrigin.x + ' ' + selectOrigin.y;
            selectedAreaPathString += ' L ' + selectOrigin.x + ' ' + realY;
            selectedAreaPathString += ' L ' + realX + ' ' + realY;
            selectedAreaPathString += ' L ' + realX + ' ' + selectOrigin.y;
            selectedAreaPathString += ' L ' + selectOrigin.x + ' ' + selectOrigin.y;
        }

        selectedArea.setAttribute('d', selectedAreaPathString);// + ' Z');
        if (selectedAreaBg != null)
        {
            selectedAreaBg.setAttribute('d', selectedAreaPathString);// + ' Z');
        }
        selectedAreaProxy.setAttribute('d', selectedAreaPathString);// + ' Z');
    }

    this.endErase = function()
    {
        selectedAreaPathString = smoothPolylineIntoPath(rawPathPoints);

        selectedArea.setAttribute('d', selectedAreaPathString);

        if (selectedAreaBg != null)
        {
            selectedAreaBg.setAttribute('d', selectedAreaPathString);
        }
        selectedAreaProxy.setAttribute('d', selectedAreaPathString);

        funcAnimateSelectAreaIdx = setInterval( function() {animateSelectArea();}, 100 );

        var opRt = this.splitSvgElementsForCurrentLayer();

        this.reset();
    }

    function getPointsSquareDist(p1 , p2)
    {
        return (p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y);
    }

    function smoothPolylineIntoPath(points)
    {
        var i;

        var rawPoints = points;
        var rawN = rawPoints.length;

        var points = [];
        var lastIdx = -1;
        var distThreshold = 80;

        for (var j = 0 ; j < rawPoints.length ; j += 1)
        {
            if (lastIdx >= 0)
            {
                if (getPointsSquareDist(rawPoints[j] , rawPoints[lastIdx]) > distThreshold)
                {
                    points.push(rawPoints[j]);
                    lastIdx = j;
                }
            }
            else
            {
                points.push(rawPoints[j]);
                lastIdx = j;
            }
        }

        ///*
        // Use raw points to make side path points
        var leftPoints = [];
        var rightPoints = [];

        var radius = 3.0;

        if (points.length > 1)
        {
            for (var i = 0 ; i < points.length ; ++i)
            {
                if (i == 0)
                {
                    var vx = points[1].x - points[0].x;
                    var vy = points[1].y - points[0].y;

                    var normalEpsilon = 1.0 / Math.sqrt(vx * vx + vy * vy);

                    var hx = -vy * normalEpsilon;
                    var hy = vx * normalEpsilon;
                    
                    leftPoints.push({x: points[i].x - hx * radius , y : points[i].y - hy * radius});
                    rightPoints.push({x: points[i].x + hx * radius , y : points[i].y + hy * radius});
                }
                else if (i == points.length - 1)
                {
                    var vx = points[i].x - points[i - 1].x;
                    var vy = points[i].y - points[i - 1].y;

                    var normalEpsilon = 1.0 / Math.sqrt(vx * vx + vy * vy);

                    var hx = -vy * normalEpsilon;
                    var hy = vx * normalEpsilon;

                    leftPoints.push({x: points[i].x - hx * radius , y : points[i].y - hy * radius});
                    rightPoints.push({x: points[i].x + hx * radius , y : points[i].y + hy * radius});
                }
                else
                {
                    var vx1 = points[i].x - points[i - 1].x;
                    var vy1 = points[i].y - points[i - 1].y;

                    var normalEpsilon1 = 1.0 / Math.sqrt(vx1 * vx1 + vy1 * vy1);

                    var hx1 = -vy1 * normalEpsilon1;
                    var hy1 = vx1 * normalEpsilon1;

                    var vx2 = points[i + 1].x - points[i].x;
                    var vy2 = points[i + 1].y - points[i].y;

                    var normalEpsilon2 = 1.0 / Math.sqrt(vx2 * vx2 + vy2 * vy2);

                    var hx2 = -vy2 * normalEpsilon2;
                    var hy2 = vx2 * normalEpsilon2;

                    var hx = (hx1 + hx2) * 0.5;
                    var hy = (hy1 + hy2) * 0.5;

                    leftPoints.push({x: points[i].x - hx * radius , y : points[i].y - hy * radius});
                    rightPoints.push({x: points[i].x + hx * radius , y : points[i].y + hy * radius});
                }
            }

            var allPoints = [];

            for (var i = 0 ; i < leftPoints.length ; ++i)
            {
                allPoints.push({x: leftPoints[i].x , y : leftPoints[i].y});
            }
            for (var i = rightPoints.length - 1 ; i >= 0 ; --i)
            {
                allPoints.push({x: rightPoints[i].x , y : rightPoints[i].y});
            }
            allPoints.push({x: leftPoints[0].x , y : leftPoints[0].y});

            points = allPoints;

            var N = points.length;

            if (N >= 4)
            {
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

                return d;
            }
        }

        return "";
    }

    function syncEraseCanvas()
    {
        srcLayerImage.setAttribute('xlink:href', eraseCanvas.toDataURL());
    }

    this.switchEraserShape = function()
    {
        isSquareEraser = !isSquareEraser;

        console.log('========================================= eraser shape: ' + isSquareEraser);
    }

    this.setEraserSize = function(size)
    {
        eraserSize = size;

        console.log("===================e size: " + eraserSize);
    }

    this.setQSelectMode = function(isFreeMode)
    {
        qselectFreeMode = isFreeMode;
    }

    this.beginSelect = function(realX , realY)
    {
        var drawing = svgCanvas.getCurrentDrawing();

        selectedAreaBg = null;
        selectedAreaBg = drawing.current_layer.appendChild(
            svgCanvas.addSvgElementFromJson({
                'element': 'path',
                'attr': {
                    'id': 'lassoAreaChild',
                    'fill': 'none',
                    'stroke': '#fff',
                    'stroke-width': 1 / svgCanvas.getCanvasScale(),
                    //'stroke-dasharray': '5,5',
                    // need to specify this so that the rect is not selectable
                    'style': 'pointer-events:none'
                }
            })
        );

        selectedArea = null;
        selectedArea = drawing.current_layer.appendChild(
            svgCanvas.addSvgElementFromJson({
                'element': 'path',
                'attr': {
                    'id': 'selectedArea',
                    'fill': 'none',
                    'stroke': '#22C',
                    'stroke-width':1 / svgCanvas.getCanvasScale(),
                    'stroke-dasharray': '5,5',
                    // need to specify this so that the rect is not selectable
                    'style': 'pointer-events:none'
                }
            })
        );

        selectedAreaPathString = 'M ' + realX + ' ' + realY;
        selectOrigin.x = realX;
        selectOrigin.y = realY;

        if (maskCanvas == null)
        {
            maskCanvas = document.createElement('canvas');
            maskCanvas.id = "MaskCanvas";
            maskCanvas.zIndex = 10;

            maskContext = maskCanvas.getContext('2d');

            maskRoot = svgedit.utilities.text2xml(
                '<svg id="maskroot" xmlns="' + svgedit.NS.SVG + '" xlinkns="' + svgedit.NS.XLINK + '" ' +
                'width="' + svgCanvas.getResolution().w + '" height="' + svgCanvas.getResolution().h + '" x="' + svgCanvas.getResolution().w + '" y="' + svgCanvas.getResolution().h + '" overflow="visible">' +
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
                '</svg>').documentElement;

            maskCanvas.appendChild(maskRoot);

            document.body.appendChild(maskCanvas);
        }
        maskCanvas.width  = svgCanvas.getResolution().w;
        maskCanvas.height = svgCanvas.getResolution().h;
        maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        selectedAreaProxy = null;
        selectedAreaProxy = maskRoot.appendChild(
            svgCanvas.addSvgElementFromJson({
                'element': 'path',
                'attr': {
                    'id': 'selectedAreaProxy',
                    'fill': 'purple',
                    'stroke': '#22C',
                    'stroke-width': 2 / svgCanvas.getCanvasScale(),
                    //'stroke-dasharray': '',
                    'style': 'pointer-events:none'
                }
            })
        );

        selectedAreaMin = {x : 9999, y : 9999};
        selectedAreaMax = {x : -9999, y : -9999};

        clearInterval(funcAnimateSelectAreaIdx);
    }

    this.updateSelect = function(realX , realY)
    {
        // Update bounding box of selected area
        if (realX < selectedAreaMin.x)
        {
            selectedAreaMin.x = realX;
        }
        if (realY < selectedAreaMin.y)
        {
            selectedAreaMin.y = realY;
        }

        if (realX > selectedAreaMax.x)
        {
            selectedAreaMax.x = realX;
        }
        if (realY > selectedAreaMax.y)
        {
            selectedAreaMax.y = realY;
        }

        if (qselectFreeMode)
        {
            selectedAreaPathString += ' L ' + realX + ' ' + realY;
        }
        else
        {
            selectedAreaPathString = 'M ' + selectOrigin.x + ' ' + selectOrigin.y;
            selectedAreaPathString += ' L ' + selectOrigin.x + ' ' + realY;
            selectedAreaPathString += ' L ' + realX + ' ' + realY;
            selectedAreaPathString += ' L ' + realX + ' ' + selectOrigin.y;
            selectedAreaPathString += ' L ' + selectOrigin.x + ' ' + selectOrigin.y;
        }

        selectedArea.setAttribute('d', selectedAreaPathString);// + ' Z');
        if (selectedAreaBg != null)
        {
            selectedAreaBg.setAttribute('d', selectedAreaPathString);// + ' Z');
        }
        selectedAreaProxy.setAttribute('d', selectedAreaPathString);// + ' Z');
    }

    this.endSelect = function()
    {
        selectedArea.setAttribute('d', selectedAreaPathString + ' Z');
        if (selectedAreaBg != null)
        {
            selectedAreaBg.setAttribute('d', selectedAreaPathString + ' Z');
        }
        selectedAreaProxy.setAttribute('d', selectedAreaPathString + ' Z');

        funcAnimateSelectAreaIdx = setInterval( function() {animateSelectArea();}, 100 );
    }

    function toppestSelectArea()
    {
        svgCanvas.getCurrentDrawing().current_layer.removeChild(selectedAreaBg);
        svgCanvas.getCurrentDrawing().current_layer.appendChild(selectedAreaBg);

        svgCanvas.getCurrentDrawing().current_layer.removeChild(selectedArea);
        svgCanvas.getCurrentDrawing().current_layer.appendChild(selectedArea);
    }

    function image_SrcSubMask(maskData)
    {
        var layerImg = null;
        var drawing = svgCanvas.getCurrentDrawing();
        for (var i = 0 ; i < drawing.current_layer.childNodes.length ; ++i)
        {
            if (drawing.current_layer.childNodes[i].tagName == 'image')
            {
                layerImg = drawing.current_layer.childNodes[i];
                break;
            }
            else if (drawing.current_layer.childNodes[i].tagName == 'g')
            {
                layerImg = drawing.current_layer.childNodes[i].childNodes[0];
                break;
            }
        }

        var img = new Image();
        img.src = layerImg.getAttribute('xlink:href');
        img.style.opacity = 0;
        var posx = layerImg.getAttribute('x');
        var posy = layerImg.getAttribute('y');

        if (workCanvas == null)
        {
            workCanvas = document.createElement('canvas');
            workCanvas.id = "WorkCanvas";

            workContext = workCanvas.getContext('2d');
        }

        workCanvas.width  = svgCanvas.getResolution().w;
        workCanvas.height = svgCanvas.getResolution().h;

        workContext.drawImage(img, posx, posy);

        var srcImgData0 = workContext.getImageData(0, 0, workCanvas.width, workCanvas.height);
        var srcImgData1 = workContext.getImageData(0, 0, workCanvas.width, workCanvas.height);

        console.log('================================================1111111111111: ' + srcImgData0.data.length);
        var srcData = null;

        // Extract new image
        srcData = srcImgData0.data;
        for (var i = 0 ; i < srcData.length ; i += 4)
        {
            if (maskData[i + 3] == 0)
            {
                srcData[i + 3] = 0;
            }
        }
        workContext.putImageData(srcImgData0, 0, 0);

        selectedAreaMin.x -= 1;
        selectedAreaMin.y -= 1;
        selectedAreaMax.x += 1;
        selectedAreaMax.y += 1;
        console.log('================================================22222222222222222222');
        //var newImgUrl = workCanvas.toDataURL();
        var newImgUrl = getSubCanvasDataUrl(workCanvas , selectedAreaMin.x , selectedAreaMin.y , selectedAreaMax.x - selectedAreaMin.x , selectedAreaMax.y - selectedAreaMin.y);
        var insertNewImage = function(posx , posy , width, height)
        {
            var newImage = svgCanvas.addSvgElementFromJson({
                element: 'image',
                attr: {
                    x: posx,
                    y: posy,
                    width: width,
                    height: height,
                    id: svgCanvas.getNextId(),
                    style: 'pointer-events:inherit'
                }
            });
            svgCanvas.setHref(newImage, newImgUrl);

            if (isShiftKeyDown == false)
            {
                svgCanvas.selectOnly([newImage]);
            }
            else
            {
                svgCanvas.selectOnly([layerImg]);
            }
        };
        // create dummy img so we know the default dimensions
        var imgWidth = 100;
        var imgHeight = 100;
        var img = new Image();
        img.src = newImgUrl;
        img.style.opacity = 0;
        insertNewImage(selectedAreaMin.x , selectedAreaMin.y , selectedAreaMax.x - selectedAreaMin.x , selectedAreaMax.y - selectedAreaMin.y);

        // Sub the src image
        srcData = srcImgData1.data;
        for (var i = 0 ; i < srcData.length ; i += 4)
        {
            if (maskData[i + 3] > 0)
            {
                srcData[i + 3] = 0;
            }
        }
        workContext.putImageData(srcImgData1, 0, 0);
        layerImg.setAttribute('xlink:href', workCanvas.toDataURL());
    }

    function getSubCanvasDataUrl(srcCanvas , x , y , w , h)
    {
        var can = document.createElement("canvas");
        can.width = w;
        can.height = h;
        var ctx = can.getContext("2d");
        ctx.drawImage(srcCanvas,-x,-y);
        return can.toDataURL();
    }

    this.preBitmapRaster = function()
    {
        if (selectedArea != null)
        {
            selectedArea.setAttribute('d' , '');
        }

        if (selectedAreaBg != null)
        {
            selectedAreaBg.setAttribute('d' , '');
        }

        if (selectedAreaProxy != null)
        {
            selectedAreaProxy.setAttribute('d' , '');
            selectedAreaProxy = null;
        }

        $('#lasso_panel').hide();

        $('#eraser_panel').hide();
    }

    this.switchMode = function(lastMode , curMode)
    {
        if (selectedAreaProxy != null &&
            ((lastMode == 'quickselect' && curMode != 'quickselect' && curMode == 'select') ||
            (lastMode == 'lasso' && curMode != 'lasso' && curMode == 'select')))
        {
            /*
            var p = new Path2D(selectedAreaPathString + ' Z');
            maskContext.stroke(p);
            maskContext.fill(p);
            //*/

            maskContext.beginPath();
            var pathNode = selectedAreaPathString.split(' ');
            for (var i = 0 ; i < pathNode.length ; )
            {
                if (pathNode[i] == 'M' || pathNode[i] == 'm')
                {
                    maskContext.moveTo(parseInt(pathNode[i + 1]) , parseInt(pathNode[i + 2]));
                    i += 3;
                }
                else if (pathNode[i] == 'L' || pathNode[i] == 'l')
                {
                    maskContext.lineTo(parseInt(pathNode[i + 1]) , parseInt(pathNode[i + 2]));
                    i += 3;
                }
                else
                {
                    i++;
                }
            }
            maskContext.stroke();
            maskContext.fillStyle="black";
            maskContext.fill();

            if (lastMode == 'quickselect')
            {
                var opRt = this.splitSvgElementsForCurrentLayer();

                //var opRt = this.eraseSvgElementsForCurrentLayer();
            }
            else
            {
                // Extract the selected area to mask image
                var imageData = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
                var data = imageData.data;

                image_SrcSubMask(data);

                toppestSelectArea();
            }
        }

        this.reset();

        $('#eraser_panel').hide();

        $('#lasso_panel').hide();
    }

    this.reset = function()
    {
        if (selectedArea != null)
        {
            selectedArea.setAttribute('d' , '');
            selectedArea = null;
        }

        if (selectedAreaBg != null)
        {
            selectedAreaBg.setAttribute('d' , '');
            selectedAreaBg = null;
        }

        if (selectedAreaProxy != null)
        {
            selectedAreaProxy.setAttribute('d' , '');
            selectedAreaProxy = null;
        }
    }

    this.eraseSvgElementsForCurrentLayer = function()
    {
        var paths = erase(paths , erase_path.data , 3);
    }

    this.splitSvgElementsForCurrentLayer = function()
    {
        diffElems = [];
        interElems = [];

        var divDiff = document.body.appendChild(document.createElement("div"));
        divDiff.id = 'difference';

        var divInter = document.body.appendChild(document.createElement("div"));
        divInter.id = 'intersection';

        // Select svg path
        var diffPaper = Raphael('difference', 1000, 1000);
        var interPaper = Raphael('intersection', 1000, 1000);

        var sarea = diffPaper.path(selectedAreaPathString);
        sarea.attr({fill: "#a00", stroke: "none"});

        var curLayer = svgCanvas.getCurrentDrawing().getCurrentLayer();

        this.splitNodeRecursively(curLayer ,diffPaper , interPaper, sarea);

        document.body.removeChild(divDiff);
        document.body.removeChild(divInter);
    }

    this.splitNodeRecursively = function(node , _diffPaper , _interPaper,  _sarea)
    {
        if (node.tagName == 'path' &&
            (node.id != 'lassoAreaChild' &&
             node.id != 'selectedArea')
            )
        {
            //console.log('============================d: ' + node.getAttribute('d'));

            var obj = _diffPaper.path(node.getAttribute('d'));
            obj.attr({fill: "a00", stroke: "none"});

            var diffStr = _diffPaper['difference'](obj, _sarea);
            diffElems.push(diffStr);

            //console.log(diffStr);

            node.setAttribute('d' , diffStr);
        }
        else
        {
            for (var i = 0 ; i < node.childNodes.length ; ++i)
            {
                this.splitNodeRecursively(node.childNodes[i] , _diffPaper , _interPaper , _sarea);
            }
        }
    }

    this.beginLasso = function(realX ,realY)
    {
        //console.log('============================begin lasso');
        var rtLasso = lassoImage(Math.round(realX) , Math.round(realY));

        if (rtLasso)
        {
            //console.log('================================== lasso success');
            selectedArea.setAttribute('d', selectedAreaPathString + ' Z');
            if (selectedAreaBg != null)
            {
                selectedAreaBg.setAttribute('d', selectedAreaPathString + ' Z');
            }
            selectedAreaProxy.setAttribute('d', selectedAreaPathString + ' Z');

            clearInterval(funcAnimateSelectAreaIdx);
            funcAnimateSelectAreaIdx = setInterval( function() {animateSelectArea();}, 100 );
        }
        else
        {
            if (selectedArea != null)
            {
                selectedArea.setAttribute('d', '');
            }

            selectedAreaProxy = null;

            if (selectedAreaBg != null)
            {
                selectedAreaBg.setAttribute('d', '');
            }

            clearInterval(funcAnimateSelectAreaIdx);
        }
    }

    this.updateLasso = function(realX ,realY)
    {
        console.log('============================ update lasso');
    }

    this.endLasso = function()
    {
        console.log('================================ end lasso');

    }

    this.setLassoThreshold = function(threshold)
    {
        lassoThreshold = threshold;
    }

    function lassoImage(x , y)
    {
        console.log('========================= lasso with: ' + x + ', ' + y);
        var layerImg = null;
        var drawing = svgCanvas.getCurrentDrawing();
        for (var i = 0 ; i < drawing.current_layer.childNodes.length ; ++i)
        {
            if (drawing.current_layer.childNodes[i].tagName == 'image')
            {
                layerImg = drawing.current_layer.childNodes[i];
                break;
            }
            else if (drawing.current_layer.childNodes[i].tagName == 'g')
            {
                layerImg = drawing.current_layer.childNodes[i].childNodes[0];
                break;
            }
        }

        var img = new Image();
        img.src = layerImg.getAttribute('xlink:href');
        img.style.opacity = 0;
        var posx = layerImg.getAttribute('x');
        var posy = layerImg.getAttribute('y');

        if (workCanvas == null)
        {
            workCanvas = document.createElement('canvas');
            workCanvas.id = "WorkCanvas";

            workContext = workCanvas.getContext('2d');
        }

        workCanvas.width  = svgCanvas.getResolution().w;
        workCanvas.height = svgCanvas.getResolution().h;

        workContext.drawImage(img, posx, posy);

        var img_tmp = workContext.getImageData(0, 0, workCanvas.width, workCanvas.height);
        var imgData_tmp = img_tmp.data;
        for (var i = 0 ; i < imgData_tmp.length ; i += 4)
        {
            //imgData_tmp[i + 3] = 0;
        }

        var img_mask = workContext.getImageData(0, 0, workCanvas.width, workCanvas.height);
        var imgData_mask = img_mask.data;
        for (var i = 0 ; i < imgData_mask.length ; i += 4)
        {
            imgData_mask[i + 3] = 0;
        }

        var img = workContext.getImageData(0, 0, workCanvas.width, workCanvas.height);
        var imgData = img.data;
        var k = ((y * (img.width * 4)) + (x * 4));
        var dx = [0, -1, +1, 0];
        var dy = [-1, 0, 0, +1];
        var color_to = {
            r: 128,
            g: 255,
            b: 0,
            a: 255
        };
        var color_from = {
            r: imgData[k + 0],
            g: imgData[k + 1],
            b: imgData[k + 2],
            a: imgData[k + 3]
        };

        /*
        if (color_from.r == color_to.r &&
            color_from.g == color_to.g &&
            color_from.b == color_to.b &&
            color_from.a == 0) {
            return false;
        }
        */

        if (color_from.a == 0) {
            return false;
        }
        ///*
        selectedAreaBg = null;
        selectedAreaBg = drawing.current_layer.appendChild(
            svgCanvas.addSvgElementFromJson({
                'element': 'path',
                'attr': {
                    'id': 'lassoAreaChild',
                    'fill': 'none',
                    'stroke': '#fff',
                    'stroke-width': 2 / svgCanvas.getCanvasScale(),
                    //'stroke-dasharray': '5,5',
                    // need to specify this so that the rect is not selectable
                    'style': 'pointer-events:none'
                }
            })
        );

        selectedArea = null;
        selectedArea = drawing.current_layer.appendChild(
            svgCanvas.addSvgElementFromJson({
                'element': 'path',
                'attr': {
                    'id': 'lassoArea',
                    'fill': 'none',
                    'stroke': '#22C',
                    'stroke-width': 2 / svgCanvas.getCanvasScale(),
                    'stroke-dasharray': '4,3',
                    // need to specify this so that the rect is not selectable
                    'style': 'pointer-events:none'
                }
            })
        );
        //*/

        if (maskCanvas == null)
        {
            maskCanvas = document.createElement('canvas');
            maskCanvas.id = "MaskCanvas";
            maskCanvas.zIndex = 10;

            maskContext = maskCanvas.getContext('2d');

            maskRoot = svgedit.utilities.text2xml(
                '<svg id="maskroot" xmlns="' + svgedit.NS.SVG + '" xlinkns="' + svgedit.NS.XLINK + '" ' +
                'width="' + svgCanvas.getResolution().w + '" height="' + svgCanvas.getResolution().h + '" x="' + svgCanvas.getResolution().w + '" y="' + svgCanvas.getResolution().h + '" overflow="visible">' +
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
                '</svg>').documentElement;

            maskCanvas.appendChild(maskRoot);

            document.body.appendChild(maskCanvas);
        }
        maskCanvas.width  = svgCanvas.getResolution().w;
        maskCanvas.height = svgCanvas.getResolution().h;
        maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        selectedAreaProxy = null;
        selectedAreaProxy = maskRoot.appendChild(
            svgCanvas.addSvgElementFromJson({
                'element': 'path',
                'attr': {
                    'id': 'selectedAreaProxy',
                    'fill': 'purple',
                    'stroke': '#22C',
                    'stroke-width': '0',
                    //'stroke-dasharray': '',
                    'style': 'pointer-events:none'
                }
            })
        );

        var sensitivity = lassoThreshold;
        var stack = [];
        stack.push([x, y]);
        while (stack.length > 0) {
            var curPoint = stack.pop();
            for (var i = 0; i < 4; i++) {
                var nextPointX = curPoint[0] + dx[i];
                var nextPointY = curPoint[1] + dy[i];
                if (nextPointX < 0 || nextPointY < 0 || nextPointX >= workCanvas.width || nextPointY >= workCanvas.height)
                    continue;
                var k = (nextPointY * workCanvas.width + nextPointX) * 4;
                if (imgData_tmp[k + 3] == 0)
                {
                    continue; //already parsed
                }

                if (Math.abs(imgData[k + 0] - color_from.r) <= sensitivity &&
                    Math.abs(imgData[k + 1] - color_from.g) <= sensitivity &&
                    Math.abs(imgData[k + 2] - color_from.b) <= sensitivity
                    //&& Math.abs(imgData[k + 3] - color_from.a) <= sensitivity
                )
                {
                    imgData_tmp[k + 0] = color_to.r; //r
                    imgData_tmp[k + 1] = color_to.g; //g
                    imgData_tmp[k + 2] = color_to.b; //b
                    imgData_tmp[k + 3] = 0;

                    imgData_mask[k + 3] = 255;

                    stack.push([nextPointX, nextPointY]);
                }
                else
                {

                }
            }
        }

        // Find the edge of lassoed area
        var edgeVertices = [];
        var startX = -1 , startY;
        for (var y = 0 ; y < workCanvas.height ; ++y)
        {
            for (var x = 0 ;x < workCanvas.width ; ++x)
            {
                //var red = data[((width * y) + x) * 4];
                //var green = data[((width * y) + x) * 4 + 1];
                //var blue = data[((width * y) + x) * 4 + 2];
                var alpha = imgData_mask[((workCanvas.width * y) + x) * 4 + 3];

                if (alpha == 255 && startX == -1)
                {
                    startX = x;
                    startY = y;

                    edgeVertices.push([x , y]);

                    //console.log('=============================== start: ' + x + ', ' + y);
                }
            }
        }

        var posMode =
            [
              [1 , 0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]
            ];

        ///*
        var counter = 0;
        var curX = startX , curY = startY;
        var sMode = 0;
        do
        {
            var px , py;

            for (var pidx = 0 ; pidx < posMode.length ; ++pidx)
            {
                var ssMode = (sMode + pidx) % posMode.length;

                px = curX + posMode[ssMode][0];
                py = curY + posMode[ssMode][1];

                //console.log('=========================== px: ' + px + ', ' + py);
                if (imgData_mask[((workCanvas.width * py) + px) * 4 + 3] == 255)
                {
                    //console.log('=========================== px: ' + px + ', ' + py + ', ' + sMode);

                    curX = px;
                    curY = py;

                    sMode = (ssMode + 5) % 8;
                    edgeVertices.push([curX , curY]);

                    break;
                }
            }

            counter++;
        }
        while((curX != startX || curY != startY))// && counter < 100)//(workCanvas.width * workCanvas.height))
        //*/

        //console.log('=================================== edges: ' + edgeVertices.length);

        selectedAreaMin = {x : 9999, y : 9999};
        selectedAreaMax = {x : -9999, y : -9999};

        if (edgeVertices.length > 1)
        {
            for (var i = 0 ; i < edgeVertices.length ; ++i)
            {
                if (i == 0)
                {
                    selectedAreaPathString = 'M ' + edgeVertices[i][0] + ' ' + edgeVertices[i][1];
                }
                else
                {
                    selectedAreaPathString += ' L ' + edgeVertices[i][0] + ' ' + edgeVertices[i][1];
                }

                if (edgeVertices[i][0] < selectedAreaMin.x)
                {
                    selectedAreaMin.x = edgeVertices[i][0];
                }
                if (edgeVertices[i][1] < selectedAreaMin.y)
                {
                    selectedAreaMin.y = edgeVertices[i][1];
                }

                if (edgeVertices[i][0] > selectedAreaMax.x)
                {
                    selectedAreaMax.x = edgeVertices[i][0];
                }
                if (edgeVertices[i][1] > selectedAreaMax.y)
                {
                    selectedAreaMax.y = edgeVertices[i][1];
                }
            }

            selectedArea.setAttribute('d', selectedAreaPathString + ' Z');
            if (selectedAreaBg != null)
            {
                selectedAreaBg.setAttribute('d', selectedAreaPathString + ' Z');
            }

            selectedAreaProxy.setAttribute('d', selectedAreaPathString + ' Z');
        }


        //destination-out + blur = anti-aliasing
        //if (anti_aliasing == true)
            //img_tmp = ImageFilters.StackBlur(img_tmp, 2);

        // Don't apply
        //workContext.putImageData(img_tmp, 0, 0);
        //layerImg.setAttribute('xlink:href', workCanvas.toDataURL());

        return (edgeVertices.length > 1);
    }

    this.img2svg = function(selectedElement)
    {
        var img = new Image();
        img.src = selectedElement.getAttribute('xlink:href');
        var posx = selectedElement.getAttribute('x');
        var posy = selectedElement.getAttribute('y');
        var width = selectedElement.getAttribute('width');
        var height = selectedElement.getAttribute('height');

        if (workCanvas == null)
        {
            workCanvas = document.createElement('canvas');
            workCanvas.id = "WorkCanvas";

            workContext = workCanvas.getContext('2d');
        }

        workCanvas.width  = width;//svgCanvas.getResolution().w;
        workCanvas.height = height;//svgCanvas.getResolution().h;

        workContext.drawImage(img, 0, 0 , width , height);
        console.log(workContext)
        setupNetwork(function (result) {
            var svgString = result;
            var svgElem = svgedit.utilities.text2xml(svgString).documentElement;
                svgElem.setAttribute('x' , posx);
                svgElem.setAttribute('y' , posy);
                svgElem.removeAttribute('version');
                svgElem.removeAttribute('desc');
                console.log(svgElem);
                var gElem = svgCanvas.makeGroupSvgElem(svgElem);
                // // Append new element into current laye
                selectedElement.parentNode.appendChild(gElem);
                // // Remove old element
                selectedElement.parentNode.removeChild(selectedElement);

            svgCanvas.selectOnly([gElem]);
        });

        reqQuery(workCanvas);
    }

    this.prepareColorPickData = function()
    {
        /*
        saveSvgAsDataBuffer(document.getElementById('svgroot') , "test.png" , {scale:1} , function(dataBuffer , w , h)
        {
            colorPickDataBuffer = dataBuffer;
            console.log(dataBuffer);
        });

        saveSvgAsPng(document.getElementById('svgroot') , "test.png" , {scale:1} );
        */
    }

    this.getCanvasOffset = function()
    {
        var svgcontent = document.getElementById('svgcontent');

        return {x: parseInt(svgcontent.getAttribute('x')), y: parseInt(svgcontent.getAttribute('y'))};
    }

    this.pickColor = function (absX , absY)
    {
        /*
        var tempRect = svgCanvas.addSvgElementFromJson({
            'element': 'rect',
            'attr': {
                id: 'testrect',
                x: absX,
                y: absY,
                width: 4,
                height: 4,
            }
        });
        //saveSvgAsPng(document.getElementById('svgroot') , "11111.png" , {scale:1} );

        var svgRoot = document.getElementById('svgroot');
        svgRoot.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/2000/svg');
        svgRoot.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', 'http://www.w3.org/1999/xlink');
        var dataString = '';
        svgAsDataUri(svgRoot , {scale:1} , function(data)
        {
            console.log(data);

            dataString = data;

        });

        var image = new Image();

        image.src = dataString + 'asdfksaf';

        return;
        //*/

        var canvasOffset = this.getCanvasOffset();
        var realX = absX * svgCanvas.getCanvasScale() + (canvasOffset.x);
        var realY = absY * svgCanvas.getCanvasScale() + (canvasOffset.y);


        console.log('pos2: ' + realX + ',' + realY);

        ///*
        svgAsRawDataUri(document.getElementById('svgroot') , {scale:1} , function(pngData)
        {
            var dataBuffer = base64js.toByteArray(pngData);
            //decode(pngData);


            colorPickDataBuffer = dataBuffer;
            //console.log(dataBuffer);

            console.log(dataBuffer.length + ', ' + dataBuffer);

            var width = 1920;

            //console.log('==================================== png data: ' + colorPickDataBuffer.width);

            var x = Math.round(realX);
            var y = Math.round(realY);


            var red = colorPickDataBuffer[((width * y) + x) * 4 + 0];
            var green = colorPickDataBuffer[((width * y) + x) * 4 + 1];
            var blue = colorPickDataBuffer[((width * y) + x) * 4 + 2];
            var alpha = colorPickDataBuffer[((width * y) + x) * 4 + 3];

            console.log('============================= color: ' + red + ', ' + green + ', ' + blue + ', ' + ("#" + HELPER.hex(red) + HELPER.hex(green) + HELPER.hex(blue)));
        });
        //*/

        ///*
        saveSvgAsDataBuffer(document.getElementById('svgroot') , "test.png" , {scale:1} , function(dataBuffer , w , h , src)
        {
            var newData = src.getAttribute('src');
            newData = newData.replace('data:image/svg+xml;base64,' , '');
            //console.log('w: ' + w + ', h: ' + h);
            console.log(newData);
            var tempDataBuffer = base64js.toByteArray(newData);

            console.log(tempDataBuffer);

            //return;

            colorPickDataBuffer = dataBuffer;
            console.log(dataBuffer);

            return;
            
            var x = Math.round(realX);
            var y = Math.round(realY);

            var red = colorPickDataBuffer.data[((colorPickDataBuffer.width * y) + x) * 4 + 0];
            var green = colorPickDataBuffer.data[((colorPickDataBuffer.width * y) + x) * 4 + 1];
            var blue = colorPickDataBuffer.data[((colorPickDataBuffer.width * y) + x) * 4 + 2];
            var alpha = colorPickDataBuffer.data[((colorPickDataBuffer.width * y) + x) * 4 + 3];

            console.log('============================= color: ' + red + ', ' + green + ', ' + blue + ', ' + ("#" + HELPER.hex(red) + HELPER.hex(green) + HELPER.hex(blue)));

            var pickedColor = ("#" + HELPER.hex(red) + HELPER.hex(green) + HELPER.hex(blue));

            var opacity = (alpha / 255) * 100;

            // Apply color to target place
            var strokeZ = parseInt($('#tool_cp_stroke_color').css('z-index'));
            var fillZ = parseInt($('#tool_cp_fill_color').css('z-index'));

            if (strokeZ > fillZ)
            {
                //svgEditor.paintBox['stroke'].refreshColor(pickedColor);

                svgCanvas.setColor('stroke', pickedColor, true);

                svgCanvas.setPaintOpacity('stroke', opacity, true);
            }
            else
            {
                //svgEditor.paintBox['fill'].refreshColor(pickedColor);

                svgCanvas.setColor('fill', pickedColor, true);

                svgCanvas.setPaintOpacity('fill', opacity, true);
            }
        });
        //*/
    }
}
