// Create map
var map = L.map('map').setView([42.372, -71.119581], 15)

L.tileLayer('https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=OpHX9MLH1KckM8cSWMHW', { attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>', }).addTo(map);
