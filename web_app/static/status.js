lastBaseMsg = new Object();
numOfRepetition = 0;
//Event listener for copying coordinate to clipboard
const elClipboard = document.getElementById("clipboard_cell");
elClipboard.addEventListener("click", copy_Coord, false);

function copy_Coord() {
    /* Get the text field */
    var latitude = document.getElementById("lat_value").textContent.slice(0, -1).trim();
    var longitude = document.getElementById("lon_value").textContent.slice(0, -1).trim();
    var height = document.getElementById("height_value").textContent.slice(0, -1).trim();
    coordinates_string = latitude + " " + longitude + " " + height;
    
    //$("#copyCoordModal .modal-body").text(coordinates_string);
    //navigator.clipboard.writeText(coordinates_string);
    // navigator.clipboard doesn't work without https
    // so falling back to execCommand. It's deprecated but still functionnal.
    $("#copyCoordModal").modal();
    dummyElt = document.getElementById('dummy_input');
    dummyElt.value = coordinates_string;
    dummyElt.focus();
    dummyElt.select();
    document.execCommand('copy');
  
    /* Alert the copied text */
    //alert("Copied the text: " + coordinates_string);
  }

$(document).ready(function () {

    // SocketIO namespace:
    namespace = "/test";

    // initiate SocketIO connection
    socket = io.connect(namespace);
	
    // say hello on connect
    socket.on("connect", function () {
        socket.emit("browser connected", {data: "I'm connected"});
    });
    //console.log("main.js Asking for service status");
    //socket.emit("get services status");

    //Ask server for starting rtkrcv or we won't have any data
    socket.emit("start base");
    socket.on("base starting", function(msg){
        response = JSON.parse(msg);
        console.log("base starting return ", response);
        if ( response['result'] === 'failed') {
            $('#mainServiceOffModal').modal('show');
        }
    })

    socket.on('disconnect', function(){
        console.log('disconnected');
    });

    chart = new Chart();
        chart.create();

    $(window).resize(function() {
        if(window.location.hash == ''){
            chart.resize();
        }
    });

    var msg_status = {
            "lat" : "0",
            "lon" : "0",
            "height": "0",
            "solution_status": "-",
            //"positioning mode": mode
        };

    updateCoordinateGrid(msg_status)

    

    // ####################### MAP ####################################################


    var map = L.map('map').setView({ lon: 85.5796347500042, lat: 44.825357128804 }, 15);

    var esriLayer = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 21,  // Increase maxZoom to 21
        maxNativeZoom: 17,
        attribution: 'Tiles © Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    var osm2Layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 21,
        maxNativeZoom: 19,
        attribution: '&copy; <a href="https://openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a> ',
        tileSize: 256,      
    });


    var maptiler_key = "VOdCpRtK23gauUEBIgvx";
    var aerialLayer = L.tileLayer('https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=' + maptiler_key, {
        tileSize: 512,
        zoomOffset: -1,
        minZoom: 1,
        maxZoom: 21,
        maxNativeZoom: 20,
        attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">© MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
        crossOrigin: true
    });
    
    var baseMaps = {
        "Esri World Imagery": esriLayer,
        "OpenStreetMap (Osm)": osm2Layer,
    };

    if (typeof(aerialLayer) !== 'undefined') {
        baseMaps["Aerial_Hybrid"] = aerialLayer;
    };
    L.control.layers(baseMaps).addTo(map);
    esriLayer.addTo(map);
    
    // Add Base station crosshair
    var crossIcon = L.icon({
        iconUrl: '/static/images/iconmonstr-crosshair-6-64.png',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
            });
    
    
    //the baseCoordinates variable comes from status.html
    var baseMark = L.marker(baseCoordinates, {icon: crossIcon, zIndexOffset: 0}).addTo(map);
    baseMark.bindTooltip("Base registered location", {offset : L.point({x: 20, y: 0})});
    // Add realtime localisation marker
    var locMark = L.marker({ lon: 0, lat: 0 }).addTo(map);
    locMark.bindTooltip("Base realtime location without correction \n (PPP, itrf@now)");

    // Move map view with markers bounds
    locMark.addEventListener("move", function() {
        const reduceBounds = map.getBounds().pad(-0.4);
        const markerBounds = L.latLngBounds(baseMark.getLatLng(), locMark.getLatLng())
        if (reduceBounds.contains(markerBounds.getCenter()) != true) {
            console.log("location marker is outside the bound, moving the map");
            map.flyToBounds(markerBounds, 19);
        }
    });

    // ####################### HANDLE SATELLITE LEVEL BROADCAST #######################

    socket.on("satellite broadcast rover", function(msg) {
            //Tell the server we are still here
            socket.emit("on graph");
            
            console.groupCollapsed('Rover satellite msg received:');
                for (var k in msg)
                    console.log(k + ':' + msg[k]);
            console.groupEnd();

            chart.roverUpdate(msg);
    });

    socket.on("satellite broadcast base", function(msg) {
        // check if the browser tab and app tab are active
        
        console.groupCollapsed('Base satellite msg received:');
            for (var k in msg)
                console.log(k + ':' + msg[k]);
        console.groupEnd();

        chart.baseUpdate(msg);
    });

    // ####################### HANDLE COORDINATE MESSAGES #######################

    socket.on("coordinate broadcast", function(msg) {
        // check if the browser tab and app tab
        
        console.groupCollapsed('Coordinate msg received:');
            for (var k in msg)
                console.log(k + ':' + msg[k]);
        console.groupEnd();

        updateCoordinateGrid(msg);

        //update map marker position
        // TODO refactoring with the same instructions in graph.js
        var coordinates = (typeof(msg['pos llh single (deg,m) rover']) == 'undefined') ? '000' : msg['pos llh single (deg,m) rover'].split(',');

        var lat_value = coordinates[0].substring(0, 11) + Array(11 - coordinates[0].substring(0, 11).length + 1).join(" ");
        var lon_value = coordinates[1].substring(0, 11) + Array(11 - coordinates[1].substring(0, 11).length + 1).join(" ");

        locMark.setLatLng({lng: Number(lon_value), lat: Number(lat_value)});
    });

    socket.on("current config rover", function(msg) {
        showRover(msg);
    });

    socket.on("current config base", function(msg) {
        showBase(msg);
    });
});