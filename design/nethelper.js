var serverUrl = 'https://api.ditoe.net/';

var phoneNumber = '13701751652';

nethelper = function()
{
    var designId = undefined;
    var pictureId;
    var imageUrl = 1231321;
    var Expires;
    var OSSAccessKeyId;
    var Signature;
    var userToken = undefined;

    this.getExpires = function()
    {
        return Expires;
    }

    this.getOSSAccessKey = function()
    {
        return OSSAccessKeyId;
    }

    this.getSignature = function()
    {
        return Signature;
    }

    this.getDesignId = function()
    {
        return designId;
    }

    this.getRawImageUrl = function()
    {
        return imageUrl;
    }

    this.getImageRequestUrl = function()
    {
        return imageUrl + ((Expires != undefined) ? '?Expires=' + Expires : '') + ((OSSAccessKeyId != undefined) ? '&OSSAccessKeyId=' + OSSAccessKeyId : '') + ((Signature != undefined) ? '&Signature=' + Signature : '');
    }

    function getAllUrlParams()
    {
        var urlParams = window.location.href.replace('.svg?' , '.svg&').replace('.png?' , '.png&').replace('.jpg?' , '.jpg&');

        var vars = {};
        var parts = urlParams.replace(/[?&]+([^=&]+)=([^&]*)/gi,
            function(m,key,value) {
                vars[key] = value;
            });
        return vars;
    }

    this.parseAllUrlParams = function()
    {
        var urlParams = getAllUrlParams();
        designId = urlParams['designId'];
        pictureId = urlParams['pictureId'];
        imageUrl = urlParams['imageUrl'];
        Expires = urlParams['Expires'];
        OSSAccessKeyId = urlParams['OSSAccessKeyId'];
        Signature = urlParams['Signature'];

        console.log(urlParams);

        console.log("============================ MD5: " + md5("ewrjlwjrewljrewlkjrwe"));

        requestToken();
    }

    function requestToken()
    {
        ///*
        if (designId != undefined)
        {
            http.post({
                    url : 'https://api.ditoe.net/clothingDesign/getUserToken',
                    data : JSON.stringify({designId: designId}),
                    contentType: 'application/json',
                    onload : function()
                    {
                        var tokenData = JSON.parse(this.responseText);
                        userToken = tokenData.data;
                        svgCanvas.refreshPreviewPanel(true);
                    }
                }
            );
        }
        //*/

        /*
        if (designId != undefined)
        {
            var _timestamp = (new Date()).getTime();

            var _md5string = 'designId='+ designId + '&' + 'timestamp=' + _timestamp;
            var _signature = md5(_md5string);

            console.log('md5 string; ' + _md5string);

            http.post({
                    url : 'https://api.ditoe.net/clothingDesign/getUserTokenBackup',
                    data : JSON.stringify({designId: designId , timestamp : _timestamp, signature : _signature}),
                    contentType: 'application/json',
                    onload : function()
                    {
                        var tokenData = JSON.parse(this.responseText);
                        userToken = tokenData.data;

                        console.log('================================ got token: ' + userToken + ', ' + this.responseText);
                        console.log(JSON.stringify({designId: designId , timestamp : _timestamp, signature : _signature}));
                    }
                }
            );
        }
        */

    }

    function verify()
    {
        // Verify
        http.post({
                url : serverUrl + '/user/sendVerifyCode',
                data : JSON.stringify({telephone: phoneNumber}),
                contentType: 'application/json',
                onload : function()
                {
                    console.log(JSON.parse(this.responseText));
                }
            }
        );
    }

    function login(vCode)
    {
        // Login
        var data = { telephone: phoneNumber  , verifyCode:vCode};//'8888'};

        http.post({
            url: serverUrl + 'user/login',
            data: JSON.stringify(data),
            contentType: 'application/json',
            onload: function()
            {
                console.log(JSON.parse(this.responseText));
            }
        });
    }

    function uploadPicture(_designId)
    {
        var formData = new FormData();

        var content = '<a id="a"><b id="b">hey!</b></a>';
        var blob = new Blob([content], { type: "text/xml"});

        formData.append("designId", _designId);
        formData.append("file", blob);

        // Upload
        http.post({
                url : serverUrl + 'design/upload',
                headers : {'fabric-token':'864160c3af13380d4e2bbf2c19e0e99865315276'} ,
                data :formData,
                onload : function()
                {
                    console.log(JSON.parse(this.responseText));
                }
            }
        );
    }

    /*
    function uploadProject(_designId)
    {
        var formData = new FormData();

        var content = '<a id="a"><b id="b">hey!</b></a>';
        var blob = new Blob([content], { type: "text/xml"});

        formData.append("pictureId", _designId);
        formData.append("file", blob);

        // Vector
        http.post({
                url : serverUrl + 'design/vector',
                headers : {'fabric-token':'864160c3af13380d4e2bbf2c19e0e99865315276'} ,
                data :formData,
                onload : function()
                {
                    console.log(JSON.parse(this.responseText));
                }
            }
        );
    }
    */

    this.uploadDesignPart = function(partContentString,isNewPath)
    {
        if (designId != undefined && userToken != undefined)
        {
            var formData = new FormData();

            var content = partContentString;//'<a id="a"><b id="b">hey!</b></a>';
            var blob = new Blob([content], { type: "text/xml"});

            formData.append("designId", designId);
            formData.append("file", blob);
            if(isNewPath!=null){
                formData.append("pictureId", isNewPath);
            }
            console.log(isNewPath);
            //formData.

            // Upload
            http.post({
                    url : serverUrl + 'design/upload',
                    headers : {'fabric-token': userToken} ,
                    data :formData,
                    onload : function()
                    {
                        console.log('================= upload part: ' + this.responseText);

                        var xmlhttp = JSON.parse(this.responseText);
                        if(xmlhttp.status==200){
                            svgCanvas.refreshPreviewPanel(true);

                            $('#saveOver').show();
                            setTimeout(function () {
                                $('#saveOver').hide();
                            },2000);
                        }
                    }
                }
            );
        }
    }

    this.uploadProjectTemp = function(projectContentString)
    {
        if (designId != undefined && userToken != undefined)
        {
            var formData = new FormData();

            var content = projectContentString;//'<a id="a"><b id="b">hey!</b></a>';
            var blob = new Blob([content], { type: "text/xml"});

            formData.append("pictureId", designId);
            formData.append("file", blob);

            // Vector
            http.post({
                    url : serverUrl + 'design/vectorTemp',
                    headers : {'fabric-token': userToken} ,
                    data :formData,
                    onload : function()
                    {
                        console.log(JSON.parse(this.responseText));
                    }
                }
            );
        }
    }

    this.uploadProject = function(projectContentString)
    {
        if (designId != undefined && userToken != undefined)
        {
            var formData = new FormData();

            var content = projectContentString;//'<a id="a"><b id="b">hey!</b></a>';
            var blob = new Blob([content], { type: "text/xml"});

            formData.append("pictureId", designId);
            formData.append("file", blob);
            console.log(formData)
            // Vector
            http.post({
                    url : serverUrl + 'design/vector',
                    headers : {'fabric-token': userToken} ,
                    data :formData,
                    onload : function()
                    {
                        console.log(JSON.parse(this.responseText));
                    }
                }
            );
        }
    }

    this.downloadProjectTemp = function(callback)
    {
        if (designId != undefined && userToken != undefined)
        {
            var userDesignId = designId;
            var userTokenId = userToken;

            http.post({
                    url : 'https://api.ditoe.net/design/downloadVectorTemp',
                    headers : {'fabric-token':userTokenId} ,
                    data : JSON.stringify({designId : designId}),
                    contentType: 'application/json',
                    onload : function()
                    {
                        if (callback)
                        {
                            if (this.responseText)
                            {
                                callback(this.responseText);
                            }
                            else
                            {
                                callback(null);
                            }
                        }
                    }
                }
            );
        }
        else
        {
            if (callback)
            {
                callback(null);
            }
        }
    }

    this.downloadProject = function(callback)
    {
        if (designId != undefined && userToken != undefined)
        {
            var userDesignId = designId;
            var userTokenId = userToken;

            http.post({
                    url : 'https://api.ditoe.net/design/downloadVector',
                    headers : {'fabric-token':userTokenId} ,
                    data : JSON.stringify({designId : designId}),
                    contentType: 'application/json',
                    onload : function()
                    {
                        if (callback)
                        {
                            if (this.responseText)
                            {
                                callback(this.responseText);
                            }
                            else
                            {
                                callback(null);
                            }
                        }
                    }
                }
            );
        }
        else
        {
            if (callback)
            {
                callback(null);
            }
        }
    }

    this.deletePictureList = function(partIds , callback)
    {
        if (designId != undefined && userToken != undefined)
        {
            var userDesignId = designId;
            var userTokenId = userToken;

            http.post({
                    url : 'https://api.ditoe.net/design/deletePicture',
                    headers : {'fabric-token':userTokenId} ,
                    data : JSON.stringify({ids : partIds}),
                    contentType: 'application/json',
                    onload : function()
                    {
                        var response = JSON.parse(this.responseText);

                        if (callback)
                        {
                            if (response)
                            {
                                callback(response);
                            }
                            else
                            {
                                callback(null);
                            }
                        }
                    }
                }
            );
        }
        else
        {
            if (callback)
            {
                callback(null);
            }
        }
    }

    /*
    function getPictureList(_designId)
    {
        http.post({
                url : serverUrl + 'design/pictureList',
                headers : {'fabric-token':'0226f16b49f9706b464088559c7e59ef27a40462'} ,
                data : JSON.stringify({pageNum: '0' , pageSize:'0' , designId: _designId}),
                contentType: 'application/json',
                onload : function()
                {
                    console.log(JSON.parse(this.responseText));
                }
            }
        );
    }

    function getPartPictureList(_designId)
    {
        http.post({
                url : serverUrl + 'design/partPictureList',
                headers : {'fabric-token':'0226f16b49f9706b464088559c7e59ef27a40462'} ,
                data : JSON.stringify({pageNum: '0' , pageSize:'0' , designId: _designId}),
                contentType: 'application/json',
                onload : function()
                {
                    console.log(JSON.parse(this.responseText));
                }
            }
        );
    }
    */

    this.requestDesignParts = function(callback)
    {
        if (designId != undefined && userToken != undefined)
        {
            var userDesignId = designId;
            var userTokenId = userToken;

            // Fetch picture list
            http.post({
                    url : 'https://api.ditoe.net/design/pictureList',
                    headers : {'fabric-token':userTokenId} ,
                    data : JSON.stringify({pageNum: '0' , pageSize:'64' , designId: userDesignId}),
                    contentType: 'application/json',
                    onload : function()
                    {
                        var designParts = JSON.parse(this.responseText);
                        console.log(designParts)
                        if (callback)
                        {
                            if (designParts && designParts.data)
                            {
                                callback(designParts.data.dataList);
                            }
                            else
                            {
                                callback(null);
                            }
                        }
                    }
                }
            );
        }
        else
        {
            if (callback)
            {
                callback(null);
            }
        }
    }

    this.requestDesignPartsSelected = function(callback)
    {
        if (designId != undefined && userToken != undefined)
        {
            var userDesignId = designId;
            var userTokenId = userToken;

            console.log('Token: ' + userTokenId + ', ' + userDesignId);

            // Fetch picture list
            http.post({
                    url : 'https://api.ditoe.net/design/designPictureUpdateList',
                    headers : {'fabric-token':userTokenId} ,
                    data : JSON.stringify({pageNum: '0' , pageSize:'0' , designId: userDesignId}),
                    contentType: 'application/json',
                    onload : function()
                    {
                        var designParts = JSON.parse(this.responseText);
                        console.log(designParts);
                        if (callback)
                        {
                            if (designParts && designParts.data)
                            {
                                callback(designParts.data.dataList);
                            }
                            else
                            {
                                callback(null);
                            }
                        }
                    }
                }
            );
        }
        else
        {
            if (callback)
            {
                callback(null);
            }
        }
    }

    this.openPartSelectPage = function()
    {
        //window.open('https://www.ditoe.net/clothingDesign/index.html#/' + designId);

        if (designId != undefined && userToken != undefined)
        {
            var iframeDom = document.getElementById("partselectpanel_iframe");
            if (iframeDom)
            {
                iframeDom.setAttribute('src' ,'https://www.ditoe.net/clothingDesign/index.html#/' + designId);

                $('#partselectpanel').show();
            }
        }
    }
}