var map = L.map('map');

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	attribution: 'Map data &copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
	maxNativeZoom: 19,
	maxZoom: 22
}).addTo(map);

var overlay_config = {
	maxNativeZoom: 22,
	maxZoom: 22,
	attribution: "",
	maximumAge: 1000*3600*24*10
}

var links_and_routers = new L.TileLayer(tileurls.links_and_routers + '/{z}/{x}/{y}.png', overlay_config).addTo(map);
var hoods = new L.TileLayer(tileurls.hoods + '/{z}/{x}/{y}.png', overlay_config);
layersControl = new L.Control.Layers({}, {"Links & Routers": links_and_routers, "Hoods": hoods});
map.addControl(layersControl);

var router_pointer_radius = 7.5; // actually 7 but let's add some rounding tolerance

var popup;

function update_mappos_permalink() {
	if (typeof mapurl != 'undefined') {
		var pos = map.getCenter();
		var zoom = map.getZoom();
		window.history.replaceState({}, document.title, mapurl + '?mapcenter='+pos.lat.toFixed(5)+','+pos.lng.toFixed(5)+','+zoom);
	}
}


map.on('moveend', update_mappos_permalink);
map.on('zoomend', update_mappos_permalink);

map.on('click', function(pos) {
	// height = width of world in px
	var size_of_world_in_px = map.options.crs.scale(map.getZoom());

	var px_per_deg_lng = size_of_world_in_px / 360;
	var px_per_deg_lat = size_of_world_in_px / 180;

	// normalize longitude (user can shift map west/east and leave the [-180..180] range
	var lng = mod(pos.latlng.lng, 360);
	var lat = pos.latlng.lat;
	if (lng > 180) { lng -= 360; }

	ajax_get_request(url_get_nearest_router + "?lng=" + lng + "&lat=" + lat, function(router) {
		// decide if router is close enough
		var lng_delta = Math.abs(lng - router.position.coordinates[0])
		var lat_delta = Math.abs(lat - router.position.coordinates[1])

		// convert degree distances into px distances on the map
		var x_delta_px = lng_delta * px_per_deg_lng;
		var y_delta_px = lat_delta * px_per_deg_lat;

		// use pythagoras to calculate distance
		var px_distance = Math.sqrt(x_delta_px*x_delta_px + y_delta_px*y_delta_px);

		console.debug("Distance to closest router ("+router.hostname+"): " + px_distance+"px");

		// check if mouse click was on the router icon
		if (px_distance <= router_pointer_radius) {
			console.log("Click on '"+router.hostname+"' detected.");
			console.log(router);
			var popup_html = "";
			var has_neighbours = 'neighbours' in router && router.neighbours.length > 0;

			// avoid empty tables
			if (has_neighbours) {
				has_neighbours = false;
				for (neighbour of router.neighbours) {
					if ('_id' in neighbour) {
						has_neighbours = true;
					}
				}
			}
						
			if (has_neighbours) {
				popup_html += "<div class=\"popup-headline with-neighbours\">";
			}
			else {
				popup_html += "<div class=\"popup-headline\">";
			}
			popup_html += '<b>Router <a href="' + url_router_info + router._id.$oid +'">'+router.hostname+'</a></b>';
			popup_html += "</div>"
			if (has_neighbours) {
				popup_html += '<table class="neighbours">';
				popup_html += "<tr>";
				popup_html += "<th>Hostname</th>";
				popup_html += "<th>MAC Address</th>";
				popup_html += "<th>Quality</th>";
				popup_html += "<th>Outgoing Interface</th>";
				popup_html += "</tr>";
				for (neighbour of router.neighbours) {
					// skip unknown neighbours
					if ('_id' in neighbour) {
						var tr_color = "#04ff0a";
						if      (neighbour.quality < 105) { tr_color = "#ff1e1e"; }
						else if (neighbour.quality < 130) { tr_color = "#ff4949"; }
						else if (neighbour.quality < 155) { tr_color = "#ff6a6a"; }
						else if (neighbour.quality < 180) { tr_color = "#ffac53"; }
						else if (neighbour.quality < 205) { tr_color = "#ffeb79"; }
						else if (neighbour.quality < 230) { tr_color = "#79ff7c"; }
						popup_html += "<tr style=\"background-color: "+tr_color+";\">";
						popup_html += '<td><a href="'+url_router_info+neighbour._id.$oid+'">'+neighbour.hostname+'</a></td>';
						popup_html += "<td>"+neighbour.mac+"</td>";
						popup_html += "<td>"+neighbour.quality+"</td>";
						popup_html += "<td>"+neighbour.net_if+"</td>";
						popup_html += "</tr>";
					}
				}
				popup_html += "</table>";
			}
			popup = L.popup({offset: new L.Point(1, 1), maxWidth: 500})
				.setLatLng([router.position.coordinates[1], router.position.coordinates[0]])
				.setContent(popup_html)
				.openOn(map);
		}
	});
});

function ajax_get_request(url, callback_fkt) {
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = function() {
		if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
			var response_data = JSON.parse(xmlhttp.responseText);
			callback_fkt(response_data);
		}
	}
	xmlhttp.open("GET", url, true);
	xmlhttp.send();
}

function mod(n, m) {
	// use own modulo function (see http://stackoverflow.com/q/4467539)
	return ((n % m) + m) % m;
}
