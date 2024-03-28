// Create map
var map = L.map('map').setView([42.372, -71.119581], 15)

L.tileLayer('https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=OpHX9MLH1KckM8cSWMHW', { attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>', }).addTo(map);

async function fetchAndParseGTFSFile(filePath) {
  const response = await fetch(filePath);
  const text = await response.text();
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  const headers = lines.shift().split(',');
  return lines.map(line => {
    const values = line.split(',');
    return headers.reduce((obj, header, index) => {
      obj[header.trim()] = values[index].trim();
      return obj;
    }, {});
  });
}

async function fetchShapes() {
  const fetchedShapesData = await fetchAndParseGTFSFile('google_transit/shapes.txt');

  // Define your mapping
  const shapeIdMapping = {
    '48686': '777',
    '48152': '778',
    '48688': '783',
    '17907': '2021',
    '48167': '789',
    '48165': '785',
    '48166': '790',
    '48168': '2235',
    '48675': '792',
    '48169': '793',
    '48700': '5707',
  };

  // Update shape_id values according to the mapping
  fetchedShapesData.forEach(shape => {
    if (shapeIdMapping[shape.shape_id]) {
      shape.shape_id = shapeIdMapping[shape.shape_id];
    }
  });

  // Organize shape points by shape_id
  const shapesByShapeId = {};
  fetchedShapesData.forEach(shape => {
    const { shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence } = shape;
    if (!shapesByShapeId[shape_id]) {
      shapesByShapeId[shape_id] = [];
    }
    shapesByShapeId[shape_id].push({ lat: parseFloat(shape_pt_lat), lon: parseFloat(shape_pt_lon) });
  });


  return shapesByShapeId;
}
// fetchShapes();

function drawRoute(shapePoints) {
  // Extract latitudes and longitudes from shape points
  const latLngs = shapePoints.map(point => [point.lat, point.lon]);
  // Create a polyline with the latitudes and longitudes
  const polyline = L.polyline(latLngs, { color: 'blue' }).addTo(map);
}

async function fetchRealTimeFeed(url) {
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

// Function to add options to dropdowns
function addStopsToDropdown(dropdown, stops) {
  stops.forEach(stop => {
    const option = document.createElement("option");
    option.value = stop.stop_id;
    option.textContent = stop.stop_name;
    dropdown.appendChild(option);
  });
}

// Select dropdown elements
const toDropdown = document.getElementById("toDropdown");
const fromDropdown = document.getElementById("fromDropdown");

// Add options to dropdowns
addStopsToDropdown(fromDropdown, stops);
addStopsToDropdown(toDropdown, stops);

async function createRouteIdToLongNameMapping() {
  const routes = await fetchAndParseGTFSFile('google_transit/routes.txt');
  let routeIdToLongName = {};
  routes.forEach(route => {
    routeIdToLongName[route.route_id] = route.route_long_name;
  });
  return routeIdToLongName;
}

async function createStopToRouteMappings() {
  const stopTimes = await fetchAndParseGTFSFile('google_transit/stop_times.txt');
  const trips = await fetchAndParseGTFSFile('google_transit/trips.txt');

  let tripToRoute = {};
  trips.forEach(trip => {
    tripToRoute[trip.trip_id] = trip.route_id;
  });

  let stopToRoutes = {};
  stopTimes.forEach(stopTime => {
    const routeId = tripToRoute[stopTime.trip_id];
    if (routeId) {
      if (!stopToRoutes[stopTime.stop_id]) {
        stopToRoutes[stopTime.stop_id] = new Set();
      }
      stopToRoutes[stopTime.stop_id].add(routeId);
    }
  });

  Object.keys(stopToRoutes).forEach(stopId => {
    stopToRoutes[stopId] = Array.from(stopToRoutes[stopId]);
  });

  return stopToRoutes;
}

async function findActiveRoutes(vehiclePositionsUrl, tripUpdatesUrl, tripsData) {
  const vehiclePositions = await fetchRealTimeFeed(vehiclePositionsUrl);
  const tripUpdates = await fetchRealTimeFeed(tripUpdatesUrl);

  let activeTripIds = new Set(vehiclePositions.entity.map(entity => entity.vehicle.trip.trip_id));
  let activeRouteIds = new Set();
  tripsData.forEach(trip => {
    if (activeTripIds.has(trip.trip_id)) {
      activeRouteIds.add(trip.route_id);
    }
  });

  return Array.from(activeRouteIds);
}

async function parseTripUpdatesForETA(tripUpdatesUrl) {
  const tripUpdates = await fetchRealTimeFeed(tripUpdatesUrl);
  let tripIdToStopETAs = {};
  tripUpdates.entity.forEach(entity => {
    const tripId = entity.trip_update.trip.trip_id;
    tripIdToStopETAs[tripId] = {};
    entity.trip_update.stop_time_update.forEach(update => {
      const stopId = update.stop_id;
      const arrival = update.arrival ? update.arrival.time : null;
      tripIdToStopETAs[tripId][stopId] = arrival;
    });
  });
  return tripIdToStopETAs;
}

async function updateUIWithActiveRoutes() {
  const tripsData = await fetchAndParseGTFSFile('google_transit/trips.txt');
  const activeRouteIds = await findActiveRoutes(
    'https://passio3.com/harvard/passioTransit/gtfs/realtime/vehiclePositions.json',
    'https://passio3.com/harvard/passioTransit/gtfs/realtime/tripUpdates.json',
    tripsData
  );

  const routeIdToLongName = await createRouteIdToLongNameMapping();

  return { activeRouteIds, routeIdToLongName };
}

async function RoutetoName() {
  await fetchAndParseGTFSFile('google_transit/routes.txt');
  let nameToRouteId = {};
  routes.forEach(route => {
    nameToRouteId[route.route_long_name] = route.route_id;
  });
  return nameToRouteId;
}

async function findRouteId(routeName) {
  const nameToRouteId = await RoutetoName();
  return nameToRouteId[routeName];
}

async function fetchStopInfo(stopId) {
  const stopsData = await fetchAndParseGTFSFile('google_transit/stops.txt');
  return stopsData.find(stop => stop.stop_id === stopId);
}

function findClosestScheduledTime(tripId, stopId, etaTimestamp, tripIdToStopTimes) {
    let closestTime = null;
    let smallestDiff = Infinity;

    const stopTimes = tripIdToStopTimes[tripId]; // Array of { stop_id, arrival_time } for the trip

    if (stopTimes) {
        stopTimes.forEach(({stop_id, arrival_time}) => {
            if (stop_id === stopId) {
                const scheduledTime = arrivalTimeToTimestamp(arrival_time); // Convert HH:MM:SS to timestamp
                const diff = Math.abs(scheduledTime - etaTimestamp);

                if (diff < smallestDiff) {
                    smallestDiff = diff;
                    closestTime = scheduledTime;
                }
            }
        });
    }

    return closestTime; // Returns the timestamp of the closest scheduled time
}

// Helper function to convert HH:MM:SS scheduled time to a timestamp for comparison
function arrivalTimeToTimestamp(arrivalTime) {
    const [hours, minutes, seconds] = arrivalTime.split(':').map(Number);
    const today = new Date();
    today.setHours(hours, minutes, seconds, 0);

    // Return as UNIX timestamp in seconds
    return Math.floor(today.getTime() / 1000);
}

function determineBusStatus(scheduledTime, etaDate, now) {
  if (!scheduledTime) return "Unavailable";

  const [scheduledHours, scheduledMinutes] = scheduledTime.split(':').map(Number);
  const scheduledDate = new Date(now);
  scheduledDate.setHours(scheduledHours, scheduledMinutes, 0);

  const differenceInMinutes = (etaDate - scheduledDate) / 60000;

  if (differenceInMinutes < -1) {
    return "Early";
  } else if (differenceInMinutes > 1) {
    return "Delayed";
  } else {
    return "On Time";
  }
}

// Assuming global scope variables for the interval ID and bus markers are declared
let busPositionsIntervalId = null;
let busMarkers = {};

async function updateRoutesDisplay() {
    // Clear existing map layers except for the base tile layer
    map.eachLayer(layer => {
        if (!layer._url) map.removeLayer(layer);
    });

    // Fetch necessary data
    const stopToRoutes = await createStopToRouteMappings();
    const tripsData = await fetchAndParseGTFSFile('google_transit/trips.txt');
    const shapesByShapeId = await fetchShapes();
    const { activeRouteIds, routeIdToLongName } = await updateUIWithActiveRoutes();
    const vehiclePositions = await fetchRealTimeFeed('https://passio3.com/harvard/passioTransit/gtfs/realtime/vehiclePositions.json');
    const tripIdToStopETAs = await parseTripUpdatesForETA('https://passio3.com/harvard/passioTransit/gtfs/realtime/tripUpdates.json');
    const stopTimesData = await fetchAndParseGTFSFile('google_transit/stop_times.txt');

    // Prepare mappings
    const tripIdToStopTimes = stopTimesData.reduce((acc, stopTime) => {
        const { trip_id, stop_id, arrival_time } = stopTime;
        if (!acc[trip_id]) acc[trip_id] = {};
        acc[trip_id][stop_id] = arrival_time;
        return acc;
    }, {});

    const tripToRoute = tripsData.reduce((acc, trip) => {
        acc[trip.trip_id] = trip.route_id;
        return acc;
    }, {});

    const activeTripIds = new Set(vehiclePositions.entity.map(entity => entity.vehicle.trip.trip_id));

    // Determine selected stops and common routes
    const fromStopId = document.getElementById('fromDropdown').value;
    const toStopId = document.getElementById('toDropdown').value;
    const fromStop = await fetchStopInfo(fromStopId);
    const toStop = await fetchStopInfo(toStopId);

    // Display markers for selected stops
    if (fromStop && toStop) {
        L.marker([fromStop.stop_lat, fromStop.stop_lon]).addTo(map).bindPopup(fromStop.stop_name);
        L.marker([toStop.stop_lat, toStop.stop_lon]).addTo(map).bindPopup(toStop.stop_name);
    }

    let fromRoutes = stopToRoutes[fromStopId] || [];
    let toRoutes = stopToRoutes[toStopId] || [];
    fromRoutes = fromRoutes.filter(routeId => activeRouteIds.includes(routeId));
    toRoutes = toRoutes.filter(routeId => activeRouteIds.includes(routeId));
    let commonRoutes = fromRoutes.filter(routeId => toRoutes.includes(routeId));

    const resultsContainer = document.getElementById('routeResults');
    resultsContainer.innerHTML = '';

    if (commonRoutes.length === 0) {
        resultsContainer.textContent = 'No active common routes found.';
    } else {
        // Display routes and calculate ETAs and statuses
        commonRoutes.forEach(routeId => {
            const routeShape = shapesByShapeId[routeId];
            if (routeShape) {
                L.polyline(routeShape.map(point => [point.lat, point.lon]), { color: 'green', weight: 6 }).addTo(map);
            }

            let etas = [];
            let statuses = [];
            tripsData.filter(trip => trip.route_id === routeId && activeTripIds.has(trip.trip_id))
                      .forEach(trip => {
                          const etaTimestamp = tripIdToStopETAs[trip.trip_id] && tripIdToStopETAs[trip.trip_id][fromStopId];
                        console.log(tripIdToStopETAs);
                        console.log(etaTimestamp);
                        console.log(activeTripIds);
                          if (etaTimestamp) {
                              const etaDate = new Date(etaTimestamp * 1000);
                              const minutesUntilArrival = Math.round((etaDate.getTime() - Date.now()) / 60000);
                              etas.push(minutesUntilArrival <= 0 ? "Bus is arriving now!" : `${minutesUntilArrival} minutes`);

                              const scheduledTime = tripIdToStopTimes[trip.trip_id] && tripIdToStopTimes[trip.trip_id][fromStopId];
                              const status = determineBusStatus(scheduledTime, etaDate, new Date());
                              statuses.push(status);
                          }
                      });

           // Display route name, ETAs, and statuses
           const routeName = routeIdToLongName[routeId] || "Unknown Route";
           etas.forEach((eta, index) => {
               const statusTag = statuses[index];
               const routeResultsDiv = document.createElement('div');
               routeResultsDiv.classList.add('result-item');
               routeResultsDiv.innerHTML =
                   `<div class="result-item-header">
                       <h2>${routeName}</h2>
                       <div class="bus-status ${statusTag.toLowerCase()}">${statusTag}</div>
                   </div>
                   <p>ETA: ${eta}</p>`;
               resultsContainer.appendChild(routeResultsDiv);
           });
           });
           }

           // Filter active trips for the common routes
           const activeTripIdsForCommonRoutes = new Set();
           tripsData.forEach(trip => {
           if (commonRoutes.includes(trip.route_id) && activeTripIds.has(trip.trip_id)) {
           activeTripIdsForCommonRoutes.add(trip.trip_id);
           }
           });

           // Setup real-time bus position updates
           const realTimeFeedUrl = 'https://passio3.com/harvard/passioTransit/gtfs/realtime/vehiclePositions.json';
           if (busPositionsIntervalId !== null) {
           clearInterval(busPositionsIntervalId); // Clear the existing interval if it's set
           }
           updateBusPositions(realTimeFeedUrl, activeTripIdsForCommonRoutes); // Update immediately
           busPositionsIntervalId = setInterval(() => {
           updateBusPositions(realTimeFeedUrl, activeTripIdsForCommonRoutes); // Then update every 2 seconds
           }, 500);
        //}

           async function updateBusPositions(url, activeTripIdsForCommonRoutes) {
           const data = await fetchRealTimeFeed(url);

           // Process each vehicle position
           data.entity.forEach(entity => {
           const vehicle = entity.vehicle;
           const tripId = vehicle.trip.trip_id;

           // Update or create marker if this trip is active and on a common route
           if (activeTripIdsForCommonRoutes.has(tripId)) {
           const position = [vehicle.position.latitude, vehicle.position.longitude];
           if (busMarkers[tripId]) {
               busMarkers[tripId].setLatLng(position);
           } else {
               busMarkers[tripId] = L.marker(position, {
                   icon: L.icon({
                       iconUrl: 'bus.256x256.png', 
                       iconSize: [24, 24],
                       iconAnchor: [12, 12],
                   })
               }).addTo(map).bindPopup(`Trip ID: ${tripId}`);
           }
           }
           });

           // Remove markers for buses that are no longer active
           Object.keys(busMarkers).forEach(tripId => {
           if (!activeTripIdsForCommonRoutes.has(tripId)) {
           busMarkers[tripId].remove();
           delete busMarkers[tripId];
            }
           });
    }
}
           document.getElementById('fromDropdown').addEventListener('change', updateRoutesDisplay);
           document.getElementById('toDropdown').addEventListener('change', updateRoutesDisplay);

