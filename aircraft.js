<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>My ADS-B All-in-One</title>
<style>
  body { margin: 0; font-family: Arial; background:#0b1220; color:#e5e7eb; }
  #map { width:100%; height:100vh; }
  .plane { width:20px; height:20px; background:red; }
</style>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</head>
<body>

<div id="map"></div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
// Cria mapa
const map = L.map('map').setView([0,0],2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:18}).addTo(map);

// Marcadores simulados
const markers = new Map();
function createPlaneIcon(heading=0){
  return L.divIcon({className:'', html:`<div class="plane" style="transform: rotate(${heading}deg)"></div>`, iconSize:[20,20], iconAnchor:[10,10]});
}

// Simula aviões
function loadAircrafts(){
  for(let i=0;i<100;i++){
    const lat = -60 + Math.random()*120;
    const lon = -180 + Math.random()*360;
    const icao = 'MOCK'+i;
    const heading = Math.random()*360;
    if(!markers.has(icao)){
      const marker = L.marker([lat,lon],{icon:createPlaneIcon(heading)}).addTo(map);
      markers.set(icao,marker);
    } else {
      markers.get(icao).setLatLng([lat,lon]).setIcon(createPlaneIcon(heading));
    }
  }
}

loadAircrafts();
setInterval(loadAircrafts,5000);
</script>

</body>
</html>
