var socket;
var serverIP = "106.14.250.103";
var serverPort = "8081";
var webService = "SBMR";
var hostAddress = "ws://" + serverIP + ":" + serverPort + "/" + webService;
socket = new WebSocket(hostAddress);

function reqQuery(workCanvas)
{
    var imgData = workCanvas.toDataURL("image/png");
    socket.send(JSON.stringify(
        {
            png:  imgData
        }
    ));
}
function setupNetwork(responseBack)
{

    try
    {
        socket.onopen = function(msg)
        {
            console.log("succeed to connect！");
            isServerConnected = true;
        }

        socket.onmessage = function (msg)
        {
            var bufferReader = new FileReader();
            bufferReader.onload = function (e)
            {
                var rtObj = JSON.parse(e.target.result);
                var result = rtObj.rtModelSimilarity[0].model;
                if(responseBack){
                   responseBack(result)
                }
            }
            bufferReader.readAsText(msg.data);
        }

        socket.onclose = function (msg)
        {
            isServerConnected = false;
            window.alert("暂时无法访问服务器，请稍后！");
        }

        socket.onerror = function(msg)
        {
            isServerConnected = false;
            console.log(msg.data);
        }
    }
    catch (ex)
    {
        console.log(ex);
    }

}