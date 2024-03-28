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
  const tripsData = await fetchAndParseGTFSFile('/static/data/google_transit/trips.txt');
  const shapesByShapeId = await fetchShapes();
  const { activeRouteIds, routeIdToLongName } = await updateUIWithActiveRoutes();
  const vehiclePositions = await fetchRealTimeFeed('https://passio3.com/harvard/passioTransit/gtfs/realtime/vehiclePositions.json');
  const tripIdToStopETAs = await parseTripUpdatesForETA('https://passio3.com/harvard/passioTransit/gtfs/realtime/tripUpdates.json');
  const stopTimesData = await fetchAndParseGTFSFile('static/data/google_transit/stop_times.txt');

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
                     iconUrl: '/static/img/bus.256x256.png', 
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
