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