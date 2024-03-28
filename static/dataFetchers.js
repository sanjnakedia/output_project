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
  const fetchedShapesData = await fetchAndParseGTFSFile('/static/data/google_transit/shapes.txt');

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

async function fetchRealTimeFeed(url) {
  const response = await fetch(url);
  const data = await response.json();
  return data;
}



async function createRouteIdToLongNameMapping() {
  const routes = await fetchAndParseGTFSFile('/static/data/google_transit/routes.txt');
  let routeIdToLongName = {};
  routes.forEach(route => {
    routeIdToLongName[route.route_id] = route.route_long_name;
  });
  return routeIdToLongName;
}

async function createStopToRouteMappings() {
  const stopTimes = await fetchAndParseGTFSFile('/static/data/google_transit/stop_times.txt');
  const trips = await fetchAndParseGTFSFile('/static/data/google_transit/trips.txt');

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
  const tripsData = await fetchAndParseGTFSFile('/static/data/google_transit/trips.txt');
  const activeRouteIds = await findActiveRoutes(
    'https://passio3.com/harvard/passioTransit/gtfs/realtime/vehiclePositions.json',
    'https://passio3.com/harvard/passioTransit/gtfs/realtime/tripUpdates.json',
    tripsData
  );

  const routeIdToLongName = await createRouteIdToLongNameMapping();

  return { activeRouteIds, routeIdToLongName };
}

async function RoutetoName() {
  await fetchAndParseGTFSFile('/static/data/google_transit/routes.txt');
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
  const stopsData = await fetchAndParseGTFSFile('/static/data/google_transit/stops.txt');
  return stopsData.find(stop => stop.stop_id === stopId);
}